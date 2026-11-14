import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";

const publicUser = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  avatarUrl: true,
  emailVerifiedAt: true,
  createdAt: true,
} as const;

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: publicUser });
  if (!user || user.email === null) throw new AppError("USER_NOT_FOUND", 404);
  return user;
}

export async function updateMe(
  userId: string,
  data: { name?: string; phone?: string; avatarUrl?: string }
) {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      name: data.name ?? undefined,
      phone: data.phone ?? undefined,
      avatarUrl: data.avatarUrl ?? undefined,
    },
    select: publicUser,
  });
  return user;
}

export async function listNotifications(userId: string, opts: { page?: number; limit?: number }) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(50, opts.limit || 20);
  const [items, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.notification.count({ where: { userId } }),
    prisma.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit), unread } };
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const n = await prisma.notification.findUnique({ where: { id: notificationId } });
  if (!n || n.userId !== userId) throw new AppError("NOTIFICATION_NOT_FOUND", 404);
  return prisma.notification.update({ where: { id: n.id }, data: { readAt: new Date() } });
}

export async function listWishlist(userId: string) {
  const rows = await prisma.wishlist.findMany({
    where: { userId },
    include: {
      property: {
        select: {
          id: true, name: true, slug: true, city: true, state: true, type: true, starRating: true,
          avgRating: true, reviewCount: true, minPricePaise: true, cancellationPolicy: true,
          images: { take: 1, orderBy: { sortOrder: "asc" } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((w) => w.property);
}

export async function addWishlist(userId: string, propertyId: string) {
  const property = await prisma.property.findFirst({ where: { id: propertyId, deletedAt: null, status: "APPROVED" } });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND", 404);
  await prisma.wishlist.upsert({
    where: { userId_propertyId: { userId, propertyId } },
    create: { userId, propertyId },
    update: {},
  });
  return { success: true, propertyId };
}

export async function removeWishlist(userId: string, propertyId: string) {
  await prisma.wishlist.deleteMany({ where: { userId, propertyId } });
  return { success: true };
}

export async function createSupportTicket(userId: string | null, email: string | null, subject: string, message: string) {
  return prisma.supportTicket.create({
    data: { userId: userId || undefined, email, subject, message },
  });
}
