import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { z } from "zod";
import { audit } from "../../middlewares/auth/requireAuth";
import { enqueueJob } from "../../lib/queue";

/* users */
export async function adminUsers(opts: { page?: number; limit?: number; q?: string; role?: string; status?: string }) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, opts.limit || 20);
  const where: any = {};
  if (opts.q) where.OR = [{ name: { contains: opts.q, mode: "insensitive" } }, { email: { contains: opts.q, mode: "insensitive" } }];
  if (opts.role) where.role = opts.role;
  if (opts.status) where.status = opts.status;
  const [items, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: { id: true, name: true, email: true, phone: true, role: true, status: true, emailVerifiedAt: true, createdAt: true, lastLoginAt: true, _count: { select: { bookings: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.user.count({ where }),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function adminUpdateUserStatus(actorId: string, userId: string, status: "ACTIVE" | "BLOCKED", ip?: string | null) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError("USER_NOT_FOUND", 404);
  if (user.role === "ADMIN") throw new AppError("CANNOT_MODIFY_ADMIN", 400);
  const updated = await prisma.user.update({ where: { id: userId }, data: { status } });
  if (status === "BLOCKED") {
    await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  await audit(actorId, "USER_STATUS_UPDATE", "User", userId, { status }, ip || null);
  return updated;
}

/* property moderation */
export async function adminListProperties(opts: { status?: string; page?: number; limit?: number }) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, opts.limit || 20);
  const where: any = { deletedAt: null };
  if (opts.status) where.status = opts.status;
  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: {
        owner: { select: { name: true, email: true } },
        images: { take: 3, orderBy: { sortOrder: "asc" } },
        rooms: { select: { name: true, basePricePaise: true, totalRooms: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.property.count({ where }),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

const rejectionSchema = z.object({ reason: z.string().min(3).max(500) });

export async function adminModerateProperty(
  actorId: string,
  propertyId: string,
  action: "approve" | "reject" | "suspend",
  input: unknown,
  ip?: string | null
) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, deletedAt: null } });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND", 404);

  if (action === "approve") {
    const updated = await prisma.property.update({ where: { id: propertyId }, data: { status: "APPROVED", rejectionReason: null } });
    await enqueueJob("staynova-jobs", `stats-${propertyId}-${Date.now()}`, "refresh-property-stats", { propertyId });
    await audit(actorId, "PROPERTY_APPROVED", "Property", propertyId, null, ip || null);
    return updated;
  }
  if (action === "reject") {
    const { reason } = rejectionSchema.parse(input);
    const updated = await prisma.property.update({ where: { id: propertyId }, data: { status: "REJECTED", rejectionReason: reason } });
    await audit(actorId, "PROPERTY_REJECTED", "Property", propertyId, { reason }, ip || null);
    return updated;
  }
  // suspend
  const updated = await prisma.property.update({ where: { id: propertyId }, data: { status: "SUSPENDED", isClosed: true } });
  await audit(actorId, "PROPERTY_SUSPENDED", "Property", propertyId, null, ip || null);
  return updated;
}

/* bookings & refunds */
export async function adminBookings(opts: { status?: string; page?: number; limit?: number; q?: string }) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, opts.limit || 20);
  const where: any = {};
  if (opts.status) where.status = { in: opts.status.split(",") };
  if (opts.q) {
    where.OR = [
      { bookingRef: { contains: opts.q, mode: "insensitive" } },
      { guestEmail: { contains: opts.q, mode: "insensitive" } },
    ];
  }
  const [items, total] = await Promise.all([
    prisma.booking.findMany({
      where,
      include: {
        user: { select: { name: true, email: true } },
        property: { select: { name: true, city: true } },
        payments: true,
        refunds: true,
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.booking.count({ where }),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function adminRefund(actorId: string, bookingId: string, amountPaise?: number, ip?: string | null) {
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { payments: { where: { status: "CAPTURED" } }, refunds: true },
  });
  if (!booking) throw new AppError("BOOKING_NOT_FOUND", 404);
  const payment = booking.payments[0];
  if (!payment) throw new AppError("NO_CAPTURED_PAYMENT", 400);
  const already = booking.refunds.filter((r) => r.status !== "FAILED").reduce((s, r) => s + r.amountPaise, 0);
  const amount = amountPaise ?? booking.totalPaise - already;
  if (amount <= 0) throw new AppError("NOTHING_TO_REFUND", 400);

  const refund = await prisma.refund.create({
    data: { paymentId: payment.id, bookingId, amountPaise: amount, status: "PENDING", reason: "Admin refund" },
  });
  await audit(actorId, "BOOKING_REFUND", "Booking", bookingId, { amountPaise: amount }, ip || null);
  await enqueueJob("staynova-jobs", `refund-${refund.id}`, "refund-payment", { bookingId });
  return refund;
}

/* coupons CRUD */
const couponSchema = z.object({
  code: z.string().min(3).max(40),
  description: z.string().max(300).optional(),
  type: z.enum(["PERCENT", "FLAT"]),
  value: z.number().int().min(1),
  maxDiscountPaise: z.number().int().min(0).nullable().optional(),
  minBookingPaise: z.number().int().min(0).nullable().optional(),
  validFrom: z.string(),
  validTo: z.string(),
  usageLimit: z.number().int().min(1).nullable().optional(),
  perUserLimit: z.number().int().min(1).nullable().optional(),
  applicablePropertyIds: z.array(z.string().uuid()).optional(),
  active: z.boolean().optional(),
  propertyId: z.string().uuid().nullable().optional(),
});

export async function adminCoupons(opts: { page?: number; limit?: number }) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, opts.limit || 50);
  const [items, total] = await Promise.all([
    prisma.coupon.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.coupon.count(),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function adminCreateCoupon(actorId: string, input: unknown, ip?: string | null) {
  const data = couponSchema.parse(input);
  const created = await prisma.coupon.create({
    data: {
      ...data,
      validFrom: new Date(`${data.validFrom}T00:00:00`),
      validTo: new Date(`${data.validTo}T23:59:59`),
      applicablePropertyIds: data.applicablePropertyIds || [],
      code: data.code.toUpperCase(),
    },
  });
  await audit(actorId, "COUPON_CREATED", "Coupon", created.id, { code: created.code }, ip || null);
  return created;
}

export async function adminUpdateCoupon(actorId: string, couponId: string, input: unknown, ip?: string | null) {
  const data = couponSchema.partial().parse(input);
  const existing = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!existing) throw new AppError("COUPON_NOT_FOUND", 404);
  const updated = await prisma.coupon.update({
    where: { id: couponId },
    data: {
      ...data,
      code: data.code?.toUpperCase(),
      validFrom: data.validFrom ? new Date(`${data.validFrom}T00:00:00`) : undefined,
      validTo: data.validTo ? new Date(`${data.validTo}T23:59:59`) : undefined,
    },
  });
  await audit(actorId, "COUPON_UPDATED", "Coupon", couponId, { code: updated.code }, ip || null);
  return updated;
}

export async function adminDeleteCoupon(actorId: string, couponId: string, ip?: string | null) {
  const existing = await prisma.coupon.findUnique({ where: { id: couponId } });
  if (!existing) throw new AppError("COUPON_NOT_FOUND", 404);
  await prisma.coupon.update({ where: { id: couponId }, data: { active: false, validTo: new Date() } });
  await audit(actorId, "COUPON_DELETED", "Coupon", couponId, { code: existing.code }, ip || null);
  return { success: true };
}

/* amenities CRUD */
export async function adminAmenities() {
  return prisma.propertyAmenity.groupBy({ by: ["amenity"], _count: { amenity: true }, orderBy: { _count: { amenity: "desc" } } });
}

export async function adminReviews(opts: { status?: string; page?: number; limit?: number }) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, opts.limit || 20);
  const where: any = {};
  if (opts.status) where.status = opts.status;
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where,
      include: { property: { select: { name: true, slug: true } }, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.review.count({ where }),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

export async function adminModerateReview(actorId: string, reviewId: string, status: "VISIBLE" | "HIDDEN" | "FLAGGED", ip?: string | null) {
  const review = await prisma.review.findUnique({ where: { id: reviewId } });
  if (!review) throw new AppError("REVIEW_NOT_FOUND", 404);
  const updated = await prisma.review.update({ where: { id: reviewId }, data: { status } });
  await enqueueJob("staynova-jobs", `stats-${review.propertyId}-${Date.now()}`, "refresh-property-stats", { propertyId: review.propertyId });
  await audit(actorId, "REVIEW_MODERATED", "Review", reviewId, { status }, ip || null);
  return updated;
}

/* analytics */
export async function adminAnalytics() {
  const now = new Date();
  const today = new Date(`${now.toISOString().slice(0, 10)}T00:00:00`);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [gmv, bookingsByDay, topCities, cancellations, counts, revenueMonth] = await Promise.all([
    prisma.booking.aggregate({ where: { status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] } }, _sum: { totalPaise: true } }),
    prisma.booking.groupBy({
      by: ["checkIn"],
      where: { status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] }, checkIn: { gte: new Date(today.getTime() - 30 * 86400000) } },
      _count: { id: true },
      _sum: { totalPaise: true },
      orderBy: { checkIn: "asc" },
    }),
    prisma.$queryRaw<Array<{ city: string; count: bigint; revenue: bigint }>>`
      SELECT p.city, COUNT(b.id) as count, COALESCE(SUM(b."totalPaise"), 0) as revenue
      FROM "Booking" b JOIN "Property" p ON p.id = b."propertyId"
      WHERE b.status IN ('CONFIRMED','CHECKED_IN','COMPLETED')
      GROUP BY p.city ORDER BY count DESC LIMIT 10
    `,
    prisma.booking.count({ where: { status: "CANCELLED", cancelledAt: { gte: monthStart } } }),
    Promise.all([
      prisma.user.count(),
      prisma.property.count({ where: { status: "APPROVED" } }),
      prisma.property.count({ where: { status: "PENDING" } }),
      prisma.booking.count(),
      prisma.booking.count({ where: { status: { in: ["HOLD", "PENDING_PAYMENT"] } } }),
      prisma.review.count(),
      prisma.supportTicket.count({ where: { status: "OPEN" } }),
    ]),
    prisma.booking.aggregate({ where: { status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] }, createdAt: { gte: monthStart } }, _sum: { totalPaise: true } }),
  ]);

  const [users, approvedProps, pendingProps, bookings, activeHolds, reviews, openTickets] = counts;
  return {
    kpis: {
      gmvPaise: gmv._sum.totalPaise || 0,
      monthRevenuePaise: revenueMonth._sum.totalPaise || 0,
      users,
      approvedProperties: approvedProps,
      pendingProperties: pendingProps,
      bookings,
      activeHolds,
      reviews,
      openSupportTickets: openTickets,
      cancellationsThisMonth: cancellations,
    },
    bookingsByDay: bookingsByDay.map((d) => ({ date: d.checkIn.toISOString().slice(0, 10), count: d._count.id, revenuePaise: d._sum.totalPaise || 0 })),
    topCities: topCities.map((c) => ({ city: c.city, count: Number(c.count), revenuePaise: Number(c.revenue) })),
  };
}

/* audit logs */
export async function adminAuditLogs(opts: { page?: number; limit?: number }) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, opts.limit || 50);
  const [items, total] = await Promise.all([
    prisma.auditLog.findMany({
      include: { actor: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.auditLog.count(),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
