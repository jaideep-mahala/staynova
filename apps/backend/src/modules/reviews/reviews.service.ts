import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { z } from "zod";
import { enqueueJob } from "../../lib/queue";

const REVIEW_WINDOW_DAYS = 30;

export const reviewSchema = z.object({
  ratingOverall: z.number().int().min(1).max(5),
  ratingCleanliness: z.number().int().min(1).max(5).optional(),
  ratingLocation: z.number().int().min(1).max(5).optional(),
  ratingService: z.number().int().min(1).max(5).optional(),
  ratingValue: z.number().int().min(1).max(5).optional(),
  title: z.string().max(100).optional(),
  comment: z.string().min(3).max(2000).optional(),
});

export async function createReview(bookingId: string, userId: string, input: unknown) {
  const data = reviewSchema.parse(input);
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { review: true, property: { select: { id: true } } },
  });
  if (!booking || booking.userId !== userId) throw new AppError("BOOKING_NOT_FOUND", 404);
  if (booking.status !== "COMPLETED") throw new AppError("REVIEW_ONLY_AFTER_COMPLETED_STAY", 400);
  const daysSince = Math.floor((Date.now() - new Date(booking.checkOut).getTime()) / 86400000);
  if (daysSince > REVIEW_WINDOW_DAYS) throw new AppError("REVIEW_WINDOW_EXPIRED", 400);
  if (booking.review) throw new AppError("REVIEW_ALREADY_EXISTS", 409);

  const review = await prisma.review.create({
    data: {
      bookingId,
      userId,
      propertyId: booking.propertyId,
      ...data,
    },
  });

  await enqueueJob("staynova-jobs", `stats-${booking.propertyId}-${Date.now()}`, "refresh-property-stats", { propertyId: booking.propertyId });
  return review;
}

export async function ownerReply(reviewId: string, ownerId: string, reply: string) {
  const review = await prisma.review.findUnique({
    where: { id: reviewId },
    include: { property: { select: { ownerId: true } } },
  });
  if (!review) throw new AppError("REVIEW_NOT_FOUND", 404);
  if (review.property.ownerId !== ownerId) throw new AppError("FORBIDDEN", 403);
  const updated = await prisma.review.update({ where: { id: reviewId }, data: { ownerReply: reply } });
  await prisma.notification
    .create({
      data: {
        userId: review.userId,
        type: "REVIEW_REPLY",
        title: "The host replied to your review",
        body: "Your review received a reply from the property.",
        data: { reviewId } as never,
      },
    })
    .catch(() => undefined);
  return updated;
}

export async function myReviews(userId: string) {
  return prisma.review.findMany({
    where: { userId },
    include: { property: { select: { name: true, slug: true, city: true } } },
    orderBy: { createdAt: "desc" },
  });
}
