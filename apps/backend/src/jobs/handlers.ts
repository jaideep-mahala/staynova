import { prisma } from "@repo/db";
import { logger } from "../lib/logger";
import { enqueueJob } from "../lib/queue";
import { confirmBookingPaid } from "../modules/payments/payment.service";
import { refundPayment } from "../modules/payments/payment.service";

/** Spec 4.4 hold expiry: release heldRooms and expire booking. */
export async function expireHold(data: { bookingId: string }) {
  const { bookingId } = data;
  const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { bookingItems: true } });
  if (!booking) return;
  if (!["HOLD", "PENDING_PAYMENT"].includes(booking.status)) return;
  if (booking.holdExpiresAt && booking.holdExpiresAt > new Date()) {
    // reschedule remaining hold time
    const remaining = booking.holdExpiresAt.getTime() - Date.now();
    await enqueueJob("staynova-bookings", `expire-hold-${bookingId}`, "expireHold", { bookingId }, remaining);
    return;
  }

  await prisma.$transaction(async (tx) => {
    const res = await tx.booking.updateMany({
      where: { id: bookingId, status: { in: ["HOLD", "PENDING_PAYMENT"] }, holdExpiresAt: { lt: new Date() } },
      data: { status: "EXPIRED", paymentStatus: "FAILED" },
    });
    if (res.count !== 1) return;
    for (const item of booking.bookingItems) {
      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "heldRooms" = GREATEST(0, "heldRooms" - ${item.quantity})
        WHERE "roomTypeId" = ${item.roomTypeId}::uuid
          AND date >= ${booking.checkIn}::date
          AND date < ${booking.checkOut}::date
          AND "heldRooms" >= ${item.quantity}
      `;
    }
  });

  await prisma.notification
    .create({
      data: {
        userId: booking.userId,
        type: "HOLD_EXPIRED",
        title: "Booking hold expired",
        body: `The hold for booking ${booking.bookingRef} expired and rooms were released.`,
        data: { bookingId } as never,
      },
    })
    .catch(() => undefined);

  logger.info({ bookingId }, "hold expired, rooms released");
}

/** Safety sweeper: expire any missed holds (runs every minute). */
export async function sweepExpiredHolds() {
  const expired = await prisma.booking.findMany({
    where: { status: { in: ["HOLD", "PENDING_PAYMENT"] }, holdExpiresAt: { lt: new Date() } },
    select: { id: true },
    take: 200,
  });
  for (const b of expired) {
    await expireHold({ bookingId: b.id });
  }
  if (expired.length) logger.info({ count: expired.length }, "holdSweeper expired holds");
}

/** Daily inventory generation to keep 365 days ahead (spec 4.1). */
export async function generateInventory() {
  const roomTypes = await prisma.roomType.findMany({ where: { isActive: true }, select: { id: true, totalRooms: true } });
  const today = new Date();
  let created = 0;
  for (const rt of roomTypes) {
    let exists = await prisma.inventory.findFirst({
      where: { roomTypeId: rt.id, date: { gte: new Date(today), lt: new Date(today.getTime() + 365 * 24 * 3600 * 1000) } },
      select: { date: true },
    });
    if (!exists) exists = null;
    const rows = [];
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      rows.push({
        roomTypeId: rt.id,
        date: new Date(`${d.toISOString().slice(0, 10)}T00:00:00`),
        totalRooms: rt.totalRooms,
        minStayNights: 1,
      });
    }
    const res = await prisma.inventory.createMany({ data: rows, skipDuplicates: true });
    created += res.count;
    void exists;
  }
  logger.info({ roomTypes: roomTypes.length, created }, "generateInventory done");
}

/** Daily: past stays → COMPLETED + review-request email (spec 4.8). */
export async function completeStays() {
  const today = new Date();
  const bookings = await prisma.booking.findMany({
    where: { status: "CONFIRMED", checkOut: { lt: today } },
    select: { id: true, userId: true, bookingRef: true, property: { select: { name: true } } },
    take: 500,
  });
  for (const b of bookings) {
    await prisma.booking.update({ where: { id: b.id }, data: { status: "COMPLETED" } });
    await prisma.notification
      .create({
        data: {
          userId: b.userId,
          type: "GENERAL",
          title: "How was your stay?",
          body: `Leave a review for your stay at ${b.property.name} (${b.bookingRef}).`,
          data: { bookingId: b.id } as never,
        },
      })
      .catch(() => undefined);
    await enqueueJob("staynova-jobs", `${b.id}-review-request`, "email-review-request", { bookingId: b.id });
    void today;
  }
  if (bookings.length) logger.info({ count: bookings.length }, "completeStays done");
}

/** Recompute denormalised property stats (avgRating, reviewCount, minPricePaise). */
export async function refreshPropertyStats(data: { propertyId: string }) {
  const [agg, minAgg] = await Promise.all([
    prisma.review.aggregate({
      where: { propertyId: data.propertyId, status: "VISIBLE" },
      _avg: { ratingOverall: true },
      _count: { id: true },
    }),
    prisma.roomType.findFirst({
      where: { propertyId: data.propertyId, isActive: true },
      orderBy: { basePricePaise: "asc" },
      select: { basePricePaise: true },
    }),
  ]);
  await prisma.property.update({
    where: { id: data.propertyId },
    data: {
      avgRating: agg._avg.ratingOverall ?? null,
      reviewCount: agg._count.id,
      minPricePaise: minAgg?.basePricePaise ?? null,
    },
  });
}

/** Provider refund execution for pending refund rows (incl. late-payment auto refunds). */
export async function processRefundJob(data: { bookingId: string; forceFull?: boolean }) {
  const refund = await prisma.refund.findFirst({
    where: { bookingId: data.bookingId, status: "PENDING" },
    orderBy: { createdAt: "desc" },
  });
  if (!refund) return;
  if (data.forceFull) {
    const booking = await prisma.booking.findUnique({ where: { id: data.bookingId }, include: { payments: { where: { status: "CAPTURED" } }, refunds: true } });
    if (!booking) return;
    const already = booking.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountPaise, 0);
    const remaining = booking.totalPaise - already;
    if (remaining > 0) {
      const payment = booking.payments[0];
      if (payment) {
        await prisma.refund.create({ data: { paymentId: payment.id, bookingId: data.bookingId, amountPaise: remaining, status: "PENDING", reason: "Late payment — full auto-refund" } });
      }
    }
  }
  await refundPayment(refund.id);
}

/** Late captured payment after expiry: re-confirm if inventory is free, else auto-refund. */
export async function lateCaptureAttempt(data: { bookingId: string; paymentRowId: string; payload?: unknown }) {
  try {
    const result = await confirmBookingPaid(data.bookingId, data.paymentRowId, data.payload);
    if (result.confirmed) {
      logger.info({ bookingId: data.bookingId }, "late payment re-confirmed booking");
    }
  } catch {
    // confirmBookingPaid already queued a full auto-refund when inventory is gone
    logger.info({ bookingId: data.bookingId }, "late payment could not re-confirm; auto-refund queued");
  }
}
