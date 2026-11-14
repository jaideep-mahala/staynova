import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { z } from "zod";
import { enqueueJob } from "../../lib/queue";
import { audit } from "../../middlewares/auth/requireAuth";

/* ---------- bookings ---------- */

export async function ownerBookings(
  ownerId: string,
  opts: { status?: string; propertyId?: string; from?: string; to?: string; page?: number; limit?: number }
) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, opts.limit || 20);
  const where: any = { property: { ownerId } };
  if (opts.propertyId) where.propertyId = opts.propertyId;
  if (opts.status) {
    const statusList = opts.status.split(",").map((s) => s.trim());
    where.status = { in: statusList };
  }
  if (opts.from || opts.to) {
    where.checkIn = {
      gte: opts.from ? new Date(`${opts.from}T00:00:00`) : undefined,
      lte: opts.to ? new Date(`${opts.to}T00:00:00`) : undefined,
    };
  }
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy: { checkIn: "asc" },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        user: { select: { name: true, email: true } },
        property: { select: { name: true, city: true } },
        bookingItems: { include: { roomType: { select: { name: true } } } },
        payments: { select: { status: true, amountPaise: true, provider: true } },
      },
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

const statusUpdateSchema = z.object({
  status: z.enum(["CHECKED_IN", "COMPLETED", "NO_SHOW", "CANCELLED"]),
  reason: z.string().max(500).optional(),
});

export async function updateBookingStatus(
  bookingId: string,
  ownerId: string,
  input: unknown,
  ip?: string | null
) {
  const data = statusUpdateSchema.parse(input);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { property: { select: { ownerId: true, checkInTime: true } }, bookingItems: true },
  });
  if (!booking) throw new AppError("BOOKING_NOT_FOUND", 404);
  if (booking.property.ownerId !== ownerId) throw new AppError("FORBIDDEN", 403);

  const now = new Date();
  if (data.status === "CHECKED_IN") {
    if (!["CONFIRMED"].includes(booking.status)) throw new AppError("BOOKING_NOT_CHECKINABLE", 400);
    if (new Date(booking.checkIn) > now) throw new AppError("CHECKIN_BEFORE_ARRIVAL", 400);
  } else if (data.status === "NO_SHOW") {
    if (booking.status !== "CONFIRMED") throw new AppError("BOOKING_NOT_MARKABLE", 400);
    // allowed only after check-in time of the first night (spec 4.8)
    const [h = 14, m = 0] = (booking.property.checkInTime || "14:00").split(":").map(Number);
    const checkInInstant = new Date(booking.checkIn);
    checkInInstant.setUTCHours(18 + h - 5, m, 0, 0);
    if (now < checkInInstant) throw new AppError("NO_SHOW_TOO_EARLY", 400);
  } else if (data.status === "COMPLETED") {
    if (booking.status !== "CHECKED_IN") throw new AppError("BOOKING_NOT_COMPLETABLE", 400);
  } else if (data.status === "CANCELLED") {
    if (["CANCELLED", "EXPIRED", "COMPLETED", "NO_SHOW"].includes(booking.status)) {
      throw new AppError("BOOKING_NOT_CANCELLABLE", 400);
    }
    // owner cancel → 100% refund incl. fees (spec 4.6)
    const { cancelBooking } = await import("../bookings/booking.service");
    const res = await cancelBooking({ bookingId, cancelledBy: "owner", reason: data.reason || "Cancelled by property" });
    await audit(ownerId, "BOOKING_CANCELLED", "Booking", bookingId, { by: "owner" }, ip || null);
    return res;
  }

  await audit(ownerId, "BOOKING_STATUS_UPDATE", "Booking", bookingId, { status: data.status }, ip || null);
  return prisma.booking.update({
    where: { id: bookingId },
    data: { status: data.status },
  });
}

/* ---------- rate rules ---------- */

const rateRuleSchema = z.object({
  name: z.string().min(1).max(80),
  type: z.enum(["WEEKEND", "SEASONAL", "LAST_MINUTE", "EARLY_BIRD", "LONG_STAY"]),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  daysOfWeek: z.array(z.number().int().min(1).max(7)).optional(),
  adjustmentType: z.enum(["PERCENT", "FLAT"]),
  adjustmentValue: z.number().int().min(-1000000).max(1000000),
  priority: z.number().int().min(0).max(100).default(0),
  active: z.boolean().default(true),
});

export type RateRuleInput = z.infer<typeof rateRuleSchema>;

export async function createRateRule(roomTypeId: string, ownerId: string, input: unknown) {
  const room = await prisma.roomType.findUnique({
    where: { id: roomTypeId },
    include: { property: { select: { ownerId: true } } },
  });
  if (!room) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);
  if (room.property.ownerId !== ownerId) throw new AppError("FORBIDDEN", 403);
  const data = rateRuleSchema.parse(input);
  return prisma.rateRule.create({
    data: {
      roomTypeId,
      name: data.name,
      type: data.type,
      startDate: data.startDate ? new Date(`${data.startDate}T00:00:00`) : null,
      endDate: data.endDate ? new Date(`${data.endDate}T00:00:00`) : null,
      daysOfWeek: data.daysOfWeek || [],
      adjustmentType: data.adjustmentType,
      adjustmentValue: data.adjustmentValue,
      priority: data.priority,
      active: data.active,
    },
  });
}

export async function updateRateRule(ruleId: string, ownerId: string, input: unknown) {
  const rule = await prisma.rateRule.findUnique({ where: { id: ruleId }, include: { roomType: { include: { property: { select: { ownerId: true } } } } } });
  if (!rule) throw new AppError("RATE_RULE_NOT_FOUND", 404);
  if (rule.roomType.property.ownerId !== ownerId) throw new AppError("FORBIDDEN", 403);
  const data = rateRuleSchema.partial().parse(input);
  return prisma.rateRule.update({
    where: { id: ruleId },
    data: {
      ...data,
      startDate: data.startDate ? new Date(`${data.startDate}T00:00:00`) : undefined,
      endDate: data.endDate ? new Date(`${data.endDate}T00:00:00`) : undefined,
    },
  });
}

export async function deleteRateRule(ruleId: string, ownerId: string) {
  const rule = await prisma.rateRule.findUnique({ where: { id: ruleId }, include: { roomType: { include: { property: { select: { ownerId: true } } } } } });
  if (!rule) throw new AppError("RATE_RULE_NOT_FOUND", 404);
  if (rule.roomType.property.ownerId !== ownerId) throw new AppError("FORBIDDEN", 403);
  await prisma.rateRule.delete({ where: { id: ruleId } });
  return { success: true };
}

/* ---------- images ---------- */

export async function addPropertyImages(propertyId: string, ownerId: string, urls: string[]) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, ownerId } });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND_OR_NO_ACCESS", 404);
  const count = await prisma.propertyImage.count({ where: { propertyId } });
  if (count + urls.length > 20) throw new AppError("TOO_MANY_IMAGES", 400);
  await prisma.propertyImage.deleteMany({ where: { propertyId, isCover: true } });
  return prisma.propertyImage.createMany({
    data: urls.map((url, i) => ({ propertyId, url, sortOrder: count + i, isCover: i === 0 && count === 0 })),
  });
}

export async function deletePropertyImage(imageId: string, ownerId: string) {
  const image = await prisma.propertyImage.findUnique({ where: { id: imageId }, include: { property: { select: { ownerId: true } } } });
  if (!image) throw new AppError("IMAGE_NOT_FOUND", 404);
  if (image.property.ownerId !== ownerId) throw new AppError("FORBIDDEN", 403);
  await prisma.propertyImage.delete({ where: { id: imageId } });
  return { success: true };
}

/* ---------- dashboard & earnings ---------- */

export async function ownerDashboard(ownerId: string) {
  const properties = await prisma.property.findMany({ where: { ownerId, deletedAt: null }, select: { id: true, name: true, city: true, status: true } });
  const propertyIds = properties.map((p) => p.id);
  const now = new Date();
  const todayStart = new Date(`${now.toISOString().slice(0, 10)}T00:00:00`);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [confirmedBookings, monthRevenue, upcomingCheckins, upcomingCheckouts, reviewStats] = await Promise.all([
    prisma.booking.findMany({
      where: { propertyId: { in: propertyIds }, status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] } },
      select: { checkIn: true, checkOut: true, nights: true, roomsCount: true, totalPaise: true },
    }),
    prisma.booking.aggregate({
      where: { propertyId: { in: propertyIds }, status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] }, createdAt: { gte: monthStart } },
      _sum: { totalPaise: true },
    }),
    prisma.booking.findMany({
      where: { propertyId: { in: propertyIds }, status: "CONFIRMED", checkIn: { gte: todayStart, lte: new Date(todayStart.getTime() + 7 * 86400000) } },
      orderBy: { checkIn: "asc" },
      take: 10,
      include: { user: { select: { name: true } }, property: { select: { name: true } } },
    }),
    prisma.booking.findMany({
      where: { propertyId: { in: propertyIds }, status: { in: ["CONFIRMED", "CHECKED_IN"] }, checkOut: { gte: todayStart, lte: new Date(todayStart.getTime() + 7 * 86400000) } },
      orderBy: { checkOut: "asc" },
      take: 10,
      include: { user: { select: { name: true } }, property: { select: { name: true } } },
    }),
    prisma.review.aggregate({ where: { propertyId: { in: propertyIds }, status: "VISIBLE" }, _avg: { ratingOverall: true }, _count: { id: true } }),
  ]);

  // occupancy: booked room-nights / (totalRooms * nights in last 30 days)
  const roomTypes = await prisma.roomType.findMany({ where: { propertyId: { in: propertyIds } }, select: { totalRooms: true } });
  const totalRooms = roomTypes.reduce((s, r) => s + r.totalRooms, 0);
  const last30 = await prisma.inventory.aggregate({
    where: { roomType: { propertyId: { in: propertyIds } }, date: { gte: new Date(todayStart.getTime() - 30 * 86400000), lt: todayStart } },
    _sum: { bookedRooms: true },
  });
  const capacity = totalRooms * 30;
  const occupancyPct = capacity > 0 ? Math.min(100, Math.round(((last30._sum.bookedRooms || 0) / capacity) * 100)) : 0;

  const revenuePaise = confirmedBookings.reduce((s, b) => s + b.totalPaise, 0);
  const adrPaise = confirmedBookings.length
    ? Math.round(confirmedBookings.reduce((s, b) => s + b.totalPaise / Math.max(1, b.nights), 0) / confirmedBookings.length)
    : 0;

  return {
    kpis: {
      revenuePaise,
      monthRevenuePaise: monthRevenue._sum.totalPaise || 0,
      bookingsCount: confirmedBookings.length,
      occupancyPct,
      adrPaise,
      avgRating: reviewStats._avg.ratingOverall,
      reviewCount: reviewStats._count.id,
    },
    upcomingCheckins,
    upcomingCheckouts,
    properties,
  };
}

export async function ownerEarnings(ownerId: string, opts?: { from?: string; to?: string }) {
  const propertyIds = (await prisma.property.findMany({ where: { ownerId }, select: { id: true } })).map((p) => p.id);
  const bookings = await prisma.booking.findMany({
    where: {
      propertyId: { in: propertyIds },
      status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] },
      ...(opts?.from || opts?.to
        ? { checkIn: { gte: opts?.from ? new Date(`${opts.from}T00:00:00`) : undefined, lte: opts?.to ? new Date(`${opts.to}T00:00:00`) : undefined } }
        : {}),
    },
    select: { totalPaise: true, serviceFeePaise: true, createdAt: true, property: { select: { name: true } } },
  });

  const byMonth = new Map<string, { revenuePaise: number; payoutPaise: number; bookings: number }>();
  for (const b of bookings) {
    const key = `${b.createdAt.getFullYear()}-${`${b.createdAt.getMonth() + 1}`.padStart(2, "0")}`;
    const entry = byMonth.get(key) || { revenuePaise: 0, payoutPaise: 0, bookings: 0 };
    entry.revenuePaise += b.totalPaise;
    entry.payoutPaise += b.totalPaise - b.serviceFeePaise; // platform fee deducted
    entry.bookings += 1;
    byMonth.set(key, entry);
  }
  const rows = [...byMonth.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, v]) => ({ month, ...v }));
  return { rows, totals: rows.reduce((s, r) => ({ revenuePaise: s.revenuePaise + r.revenuePaise, payoutPaise: s.payoutPaise + r.payoutPaise, bookings: s.bookings + r.bookings }), { revenuePaise: 0, payoutPaise: 0, bookings: 0 }) };
}

export async function ownerReviews(ownerId: string) {
  return prisma.review.findMany({
    where: { property: { ownerId } },
    include: { property: { select: { name: true } }, user: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}
