import { Router, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { requireAuth, requireRole } from "../../middlewares/auth/requireAuth";
import {
  ownerBookings,
  updateBookingStatus,
  createRateRule,
  updateRateRule,
  deleteRateRule,
  addPropertyImages,
  deletePropertyImage,
  ownerDashboard,
  ownerEarnings,
  ownerReviews,
} from "./owner.service";
import { ownerReply } from "../reviews/reviews.service";

const router: Router = Router();
router.use(requireAuth, requireRole("OWNER", "ADMIN"));

/* dashboard / earnings */
router.get("/dashboard", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await ownerDashboard(req.user!.userId) });
}));

router.get("/earnings", asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ from: z.string().optional(), to: z.string().optional() }).parse(req.query);
  res.json({ success: true, data: await ownerEarnings(req.user!.userId, q) });
}));

/* bookings */
router.get("/bookings", asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({
    status: z.string().optional(),
    propertyId: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    page: z.coerce.number().optional(),
    limit: z.coerce.number().optional(),
  }).parse(req.query);
  const { items, meta } = await ownerBookings(req.user!.userId, q);
  res.json({ success: true, data: items, meta });
}));

router.patch("/bookings/:id/status", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await updateBookingStatus(req.params.id!, req.user!.userId, req.body, req.ip) });
}));

/* images */
router.post("/properties/:id/images", asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ urls: z.array(z.string().url()).min(1).max(20) }).parse(req.body);
  res.status(201).json({ success: true, data: await addPropertyImages(req.params.id!, req.user!.userId, body.urls) });
}));

router.delete("/properties/:id/images/:imageId", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await deletePropertyImage(req.params.imageId!, req.user!.userId) });
}));

/* rate rules */
router.post("/rooms/:id/rate-rules", asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await createRateRule(req.params.id!, req.user!.userId, req.body) });
}));

router.patch("/rate-rules/:id", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await updateRateRule(req.params.id!, req.user!.userId, req.body) });
}));

router.delete("/rate-rules/:id", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await deleteRateRule(req.params.id!, req.user!.userId) });
}));

/* reviews */
router.get("/reviews", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await ownerReviews(req.user!.userId) });
}));

router.post("/reviews/:id/reply", asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ reply: z.string().min(2).max(1000) }).parse(req.body);
  res.json({ success: true, data: await ownerReply(req.params.id!, req.user!.userId, body.reply) });
}));

export default router;
