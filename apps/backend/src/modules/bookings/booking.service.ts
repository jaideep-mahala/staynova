import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { HOLD_MINUTES_DEFAULT } from "@repo/shared";
import { v4 as uuidv4 } from "uuid";
import { nightsBetween, validateStayParams, type PriceBreakdown, quoteRoomType } from "../pricing/pricing.service";
import { calculateRefund } from "../pricing/refund.service";
import type { Prisma } from "@prisma/client";
import { enqueueJob } from "../../lib/queue";
import { logger } from "../../lib/logger";

const HOLD_MINUTES = Number(process.env.HOLD_MINUTES || HOLD_MINUTES_DEFAULT);

export interface CreateBookingInput {
  roomTypeId: string;
  checkIn: string | Date;
  checkOut: string | Date;
  adults: number;
  children?: number;
  roomsCount: number;
  couponCode?: string | null;
  guestName?: string;
  guestEmail?: string;
  guestPhone?: string;
  specialRequests?: string;
  guests?: Array<{ name: string; age?: number; isPrimary?: boolean }>;
}

function bookingRefGen(): string {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += c[Math.floor(Math.random() * c.length)];
  return `SN-${s}`;
}

/**
 * Spec 4.4 booking creation flow: one transaction with FOR UPDATE row locks,
 * atomic held-room increments, idempotency, price/policy snapshots.
 */
export async function createBooking(input: CreateBookingInput, userId: string, idempotencyKey?: string | null) {
  if (!idempotencyKey) throw new AppError("IDEMPOTENCY_KEY_REQUIRED", 400);

  const existing = await prisma.booking.findUnique({ where: { idempotencyKey } });
  if (existing) return buildResponse(existing);

  // re-validate params and compute server-side price (never trust client totals)
  const quote = await quoteRoomType({
    roomTypeId: input.roomTypeId,
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    roomsCount: input.roomsCount,
    adults: input.adults,
    children: input.children || 0,
    couponCode: input.couponCode || null,
    userId,
  });
  const breakdown: PriceBreakdown = quote.breakdown;

  const checkIn = new Date(input.checkIn);
  const checkOut = new Date(input.checkOut);
  const nightsCount = nightsBetween(checkIn, checkOut);

  const roomType = await prisma.roomType.findUnique({
    where: { id: input.roomTypeId },
    include: { property: true },
  });
  if (!roomType) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);
  const property = roomType.property;

  let couponId: string | null = null;
  if (input.couponCode) {
    const coupon = await prisma.coupon.findUnique({ where: { code: input.couponCode.toUpperCase() } });
    if (!coupon) throw new AppError("COUPON_NOT_FOUND", 404);
    couponId = coupon.id;
  }

  const guestName = input.guestName || "";
  const guestEmail = input.guestEmail || "";

  const booking = await prisma.$transaction(async (tx) => {
    // lock inventory rows for every night of the stay
    const locked = (await tx.$queryRaw`
      SELECT id, date, "totalRooms", "bookedRooms", "heldRooms", "isClosed"
      FROM "Inventory"
      WHERE "roomTypeId" = ${input.roomTypeId}::uuid
        AND date >= ${checkIn}::date
        AND date < ${checkOut}::date
      ORDER BY date
      FOR UPDATE
    `) as Array<{ id: string; date: Date; totalRooms: number; bookedRooms: number; heldRooms: number; isClosed: boolean }>;

    if (locked.length < nightsCount) {
      throw new AppError("INVENTORY_NOT_INITIALISED", 409);
    }

    const unavailable = [];
    for (const row of locked) {
      const available = row.totalRooms - row.bookedRooms - row.heldRooms;
      if (row.isClosed || available < input.roomsCount) {
        unavailable.push(new Date(row.date).toISOString().slice(0, 10));
      }
    }
    if (unavailable.length > 0) {
      throw new AppError("ROOM_UNAVAILABLE", 409, { unavailableDates: unavailable });
    }

    for (const row of locked) {
      const updated = await tx.$executeRaw`
        UPDATE "Inventory"
        SET "heldRooms" = "heldRooms" + ${input.roomsCount}
        WHERE id = ${row.id}::uuid
          AND ("totalRooms" - "bookedRooms" - "heldRooms") >= ${input.roomsCount}
      `;
      if (updated !== 1) {
        // concurrent booking stole the last room
        throw new AppError("ROOM_UNAVAILABLE", 409);
      }
    }

    const guestsToCreate = input.guests?.length ? input.guests : [{ name: guestName || "Guest", isPrimary: true }];

    return tx.booking.create({
      data: {
        bookingRef: bookingRefGen(),
        userId,
        propertyId: property.id,
        status: "HOLD",
        paymentStatus: "PENDING",
        checkIn,
        checkOut,
        nights: nightsCount,
        adults: input.adults,
        children: input.children || 0,
        roomsCount: input.roomsCount,
        guestName,
        guestEmail,
        guestPhone: input.guestPhone || null,
        specialRequests: input.specialRequests || null,
        subtotalPaise: breakdown.subtotalPaise,
        taxPaise: breakdown.taxPaise,
        discountPaise: breakdown.discountPaise,
        serviceFeePaise: breakdown.serviceFeePaise,
        totalPaise: breakdown.totalPaise,
        currency: "INR",
        couponId,
        cancellationPolicySnapshot: JSON.stringify({
          policy: property.cancellationPolicy,
          checkInTime: property.checkInTime,
        }),
        holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60 * 1000),
        idempotencyKey,
        bookingItems: {
          create: {
            roomTypeId: roomType.id,
            quantity: input.roomsCount,
            pricePerNightSnapshot: breakdown.perNight as never,
            subtotalPaise: breakdown.subtotalPaise,
          },
        },
        bookingGuests: {
          create: guestsToCreate.map((g) => ({
            name: g.name,
            age: g.age ?? null,
            isPrimary: g.isPrimary ?? false,
          })),
        },
      },
    });
  });

  logger.info({ bookingId: booking.id }, "Booking hold created");

  // delayed expiry job (BullMQ); best-effort — sweeper cron is the safety net
  await enqueueJob("expireHold", booking.id, "expire-hold", { bookingId: booking.id }, HOLD_MINUTES * 60 * 1000);

  return buildResponse(booking);
}

export async function findAvailableAlternatives(propertyId: string, checkIn: Date, checkOut: Date, roomsCount: number) {
  const nightsCount = nightsBetween(checkIn, checkOut);
  const roomTypes = await prisma.roomType.findMany({ where: { propertyId, isActive: true } });
  const out = [];
  for (const rt of roomTypes) {
    const rows = await prisma.inventory.findMany({
      where: { roomTypeId: rt.id, date: { gte: checkIn, lt: checkOut } },
    });
    const ok =
      rows.length >= nightsCount &&
      rows.every((r) => !r.isClosed && r.totalRooms - r.bookedRooms - r.heldRooms >= roomsCount);
    if (ok) out.push({ roomTypeId: rt.id, name: rt.name, basePricePaise: rt.basePricePaise });
  }
  return out;
}

export function buildResponse(booking: {
  id: string;
  bookingRef: string;
  totalPaise: number;
  subtotalPaise: number;
  taxPaise: number;
  discountPaise: number;
  serviceFeePaise: number;
  holdExpiresAt: Date | null;
}) {
  return {
    bookingId: booking.id,
    bookingRef: booking.bookingRef,
    priceBreakdown: {
      subtotalPaise: booking.subtotalPaise,
      taxPaise: booking.taxPaise,
      discountPaise: booking.discountPaise,
      serviceFeePaise: booking.serviceFeePaise,
      totalPaise: booking.totalPaise,
    },
    holdExpiresAt: booking.holdExpiresAt,
  };
}

export async function getMyBookings(
  userId: string,
  opts: { status?: string; page?: number; limit?: number }
) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(50, Math.max(1, opts.limit || 20));
  const today = new Date();
  let where: Prisma.BookingWhereInput = { userId };
  if (opts.status === "upcoming") {
    where = { userId, checkOut: { gte: today }, status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"] } };
  } else if (opts.status === "past") {
    where = { userId, status: { in: ["COMPLETED", "NO_SHOW"] } };
  } else if (opts.status === "cancelled") {
    where = { userId, status: { in: ["CANCELLED", "EXPIRED", "FAILED"] } };
  }
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        property: { select: { name: true, slug: true, city: true, checkInTime: true, checkOutTime: true, images: { take: 1, orderBy: { sortOrder: "asc" } } } },
        bookingItems: { include: { roomType: { select: { name: true } } } },
        payments: { orderBy: { createdAt: "desc" }, take: 1 },
        review: { select: { id: true, ratingOverall: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function getBooking(id: string, userId: string) {
  const booking = await prisma.booking.findFirst({
    where: { OR: [{ id }, { bookingRef: id }], userId },
    include: {
      property: { select: { name: true, slug: true, city: true, checkInTime: true, checkOutTime: true, images: true, addressLine: true } },
      bookingItems: { include: { roomType: true } },
      bookingGuests: true,
      payments: true,
      refunds: true,
      review: true,
      coupon: { select: { code: true } },
    },
  });
  if (!booking) throw new AppError("BOOKING_NOT_FOUND", 404);
  return booking;
}

export async function updateGuestDetails(
  bookingId: string,
  userId: string,
  data: { guestName?: string; guestEmail?: string; guestPhone?: string; specialRequests?: string; guests?: Array<{ name: string; age?: number }> }
) {
  const booking = await prisma.booking.findFirst({ where: { id: bookingId, userId } });
  if (!booking) throw new AppError("BOOKING_NOT_FOUND", 404);
  if (["CANCELLED", "EXPIRED", "COMPLETED"].includes(booking.status)) {
    throw new AppError("BOOKING_NOT_MODIFIABLE", 400);
  }
  if (booking.checkIn < new Date()) throw new AppError("CHECKIN_ALREADY_PASSED", 400);
  const updated = await prisma.booking.update({
    where: { id: booking.id },
    data: {
      guestName: data.guestName ?? booking.guestName,
      guestEmail: data.guestEmail ?? booking.guestEmail,
      guestPhone: data.guestPhone ?? booking.guestPhone,
      specialRequests: data.specialRequests ?? booking.specialRequests,
      ...(data.guests?.length
        ? {
            bookingGuests: { deleteMany: {}, create: data.guests.map((g) => ({ name: g.name, age: g.age ?? null, isPrimary: false })) },
          }
        : {}),
    },
  });
  return updated;
}

function parsePolicySnapshot(snapshot: string): { policy: any; checkInTime?: string } {
  try {
    return JSON.parse(snapshot);
  } catch {
    return { policy: "FLEXIBLE" };
  }
}

export async function computeCancellation(
  bookingId: string,
  cancelledBy: "user" | "owner" | "admin"
) {
  const id = bookingId;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { property: { select: { checkInTime: true } } },
  });
  if (!booking) throw new AppError("BOOKING_NOT_FOUND", 404);
  const snapshot = parsePolicySnapshot(booking.cancellationPolicySnapshot);
  return calculateRefund({
    policy: snapshot.policy || "FLEXIBLE",
    checkIn: booking.checkIn,
    checkInTime: booking.property?.checkInTime,
    cancelledAt: new Date(),
    nights: booking.nights,
    subtotalPaise: booking.subtotalPaise,
    serviceFeePaise: booking.serviceFeePaise,
    totalPaise: booking.totalPaise,
    cancelledBy,
  });
}

export async function cancelBooking(opts: {
  bookingId: string;
  cancelledBy: "user" | "owner" | "admin";
  userId?: string;
  reason?: string;
}) {
  const { bookingId, cancelledBy, reason } = opts;

  const where: Prisma.BookingWhereUniqueInput = { id: bookingId };

  const booking = await prisma.booking.findUnique({
    where,
    include: { bookingItems: true, payments: { where: { status: { in: ["CAPTURED", "AUTHORIZED"] } } }, property: { select: { checkInTime: true, ownerId: true } } },
  });
  if (!booking) throw new AppError("BOOKING_NOT_FOUND", 404);
  if (cancelledBy === "user" && opts.userId && booking.userId !== opts.userId) {
    throw new AppError("FORBIDDEN", 403);
  }
  if (["CANCELLED", "EXPIRED", "COMPLETED", "NO_SHOW"].includes(booking.status)) {
    throw new AppError("BOOKING_NOT_CANCELLABLE", 400);
  }
  if (cancelledBy === "user" && (booking.status === "CHECKED_IN" || booking.checkIn < new Date())) {
    throw new AppError("CHECKIN_ALREADY_PASSED", 400);
  }

  const refund = await calculateRefund({
    policy: (parsePolicySnapshot(booking.cancellationPolicySnapshot).policy as never) || "FLEXIBLE",
    checkIn: booking.checkIn,
    checkInTime: booking.property?.checkInTime,
    cancelledAt: new Date(),
    nights: booking.nights,
    subtotalPaise: booking.subtotalPaise,
    serviceFeePaise: booking.serviceFeePaise,
    totalPaise: booking.totalPaise,
    cancelledBy,
  });

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.booking.updateMany({
      where: { id: booking.id, status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED"] } },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: cancelledBy === "user" ? "user" : cancelledBy,
        cancellationReason: reason || refund.reason,
        refundAmountPaise: refund.refundablePaise,
        paymentStatus: refund.refundablePaise >= booking.totalPaise ? "REFUNDED" : refund.refundablePaise > 0 ? "PARTIALLY_REFUNDED" : booking.paymentStatus,
      },
    });
    if (res.count !== 1) throw new AppError("BOOKING_NOT_CANCELLABLE", 409);

    // release inventory for the exact nights of the stay
    const wasConfirmed = booking.status === "CONFIRMED" || booking.status === "CHECKED_IN";
    for (const item of booking.bookingItems) {
      if (wasConfirmed) {
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "bookedRooms" = GREATEST(0, "bookedRooms" - ${item.quantity})
          WHERE "roomTypeId" = ${item.roomTypeId}::uuid
            AND date >= ${booking.checkIn}::date
            AND date < ${booking.checkOut}::date
            AND "bookedRooms" >= ${item.quantity}
        `;
      } else {
        await tx.$executeRaw`
          UPDATE "Inventory"
          SET "heldRooms" = GREATEST(0, "heldRooms" - ${item.quantity})
          WHERE "roomTypeId" = ${item.roomTypeId}::uuid
            AND date >= ${booking.checkIn}::date
            AND date < ${booking.checkOut}::date
            AND "heldRooms" >= ${item.quantity}
        `;
      }
    }

    if (refund.refundablePaise > 0 && booking.payments[0]) {
      const payment = booking.payments[0];
      await tx.refund.create({
        data: {
          paymentId: payment.id,
          bookingId: booking.id,
          amountPaise: refund.refundablePaise,
          status: "PENDING",
          reason: refund.reason,
        },
      });
    }
    return tx.booking.findUnique({ where: { id: booking.id } });
  });

  // call provider refund API after transaction
  const pendingRefund = await prisma.refund.findFirst({ where: { bookingId: booking.id, status: "PENDING" } });
  if (pendingRefund) {
    const { refundPayment } = await import("../payments/payment.service");
    await refundPayment(pendingRefund.id).catch((e) => logger.warn({ err: e }, "provider refund call failed; webhook will reconcile"));
  }

  await enqueueJob("sendEmail", `${booking.id}-cancel`, "email-booking-cancelled", { bookingId: booking.id });
  await enqueueJob("sendEmail", `${booking.id}-cancel-owner`, "email-new-owner-alert", { bookingId: booking.id, event: "cancelled" });
  await prisma.notification.createMany({
    data: [
      { userId: booking.userId, type: "BOOKING_CANCELLED", title: "Booking cancelled", body: `Your booking ${booking.bookingRef} was cancelled. ${refund.reason}`, data: { bookingId: booking.id } as never },
      { userId: booking.property.ownerId, type: "BOOKING_CANCELLED", title: "Booking cancelled", body: `Booking ${booking.bookingRef} was cancelled.`, data: { bookingId: booking.id } as never },
    ],
  });

  return { booking: updated, refund };
}
