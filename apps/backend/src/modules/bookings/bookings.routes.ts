import { Router, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { requireAuth } from "../../middlewares/auth/requireAuth";
import { bookingLimiter } from "../../middlewares/rate-limit/rateLimiters";
import {
  createBooking,
  getMyBookings,
  getBooking,
  cancelBooking,
  updateGuestDetails,
  computeCancellation,
} from "./booking.service";
import { quoteRoomType } from "../pricing/pricing.service";
import { createReview } from "../reviews/reviews.service";
import { readStored } from "../../lib/storage";
import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";

const router: Router = Router();

const createSchema = z.object({
  roomTypeId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(20).optional(),
  roomsCount: z.coerce.number().int().min(1).max(9),
  couponCode: z.string().max(40).optional().nullable(),
  guestName: z.string().max(80).optional(),
  guestEmail: z.string().email().optional(),
  guestPhone: z.string().max(15).optional(),
  specialRequests: z.string().max(1000).optional(),
  guests: z.array(z.object({ name: z.string().min(1).max(80), age: z.number().int().min(0).max(120).optional(), isPrimary: z.boolean().optional() })).max(20).optional(),
});

router.post("/", requireAuth, bookingLimiter, asyncHandler(async (req: Request, res: Response) => {
  const data = createSchema.parse(req.body);
  const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
  const result = await createBooking(data, req.user!.userId, idempotencyKey);
  res.status(201).json({ success: true, data: result });
}));

// spec §6: POST /pricing/quote — price breakdown without holding
router.post("/pricing/quote", asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    roomTypeId: z.string().uuid(),
    checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    roomsCount: z.coerce.number().int().min(1).max(9),
    adults: z.coerce.number().int().min(1).max(20),
    children: z.coerce.number().int().min(0).max(20).optional(),
    couponCode: z.string().max(40).optional().nullable(),
  });
  const q = schema.parse(req.body);
  const result = await quoteRoomType({
    ...q,
    children: q.children || 0,
    userId: req.user?.userId || null,
  });
  res.json({ success: true, data: result });
}));

router.get("/", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ status: z.string().optional(), page: z.coerce.number().optional(), limit: z.coerce.number().optional() }).parse(req.query);
  const { items, meta } = await getMyBookings(req.user!.userId, q);
  res.json({ success: true, data: items, meta });
}));

router.get("/:id", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getBooking(req.params.id!, req.user!.userId) });
}));

router.get("/:id/cancel-preview", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const booking = await getBooking(req.params.id!, req.user!.userId);
  const refund = await computeCancellation(booking.id, "user");
  res.json({ success: true, data: refund });
}));

router.post("/:id/cancel", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ reason: z.string().max(500).optional() }).parse(req.body || {});
  const result = await cancelBooking({ bookingId: req.params.id!, cancelledBy: "user", userId: req.user!.userId, reason: body.reason });
  res.json({ success: true, data: result });
}));

router.patch("/:id/guest-details", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    guestName: z.string().max(80).optional(),
    guestEmail: z.string().email().optional(),
    guestPhone: z.string().max(15).optional(),
    specialRequests: z.string().max(1000).optional(),
    guests: z.array(z.object({ name: z.string().min(1).max(80), age: z.number().int().min(0).max(120).optional() })).max(20).optional(),
  });
  res.json({ success: true, data: await updateGuestDetails(req.params.id!, req.user!.userId, schema.parse(req.body)) });
}));

// spec §8.2: PDF voucher download
router.get("/:id/voucher", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const booking = await getBooking(req.params.id!, req.user!.userId);
  if (booking.voucherUrl) {
    try {
      const pdf = readStored(booking.voucherUrl);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${booking.bookingRef}.pdf"`);
      res.send(pdf);
      return;
    } catch {
      // fall through to 409 (regenerate via re-confirmation)
    }
  }
  res.status(409).json({ success: false, error: { code: "VOUCHER_NOT_READY", message: "Voucher is being generated, try again shortly" } });
}));

// POST /bookings/:id/review (spec §6)
router.post("/:id/review", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await createReview(req.params.id!, req.user!.userId, req.body) });
}));

export default router;
