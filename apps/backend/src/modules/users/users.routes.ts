import { Router, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { requireAuth } from "../../middlewares/auth/requireAuth";
import {
  getMe,
  updateMe,
  listNotifications,
  markNotificationRead,
  listWishlist,
  addWishlist,
  removeWishlist,
  createSupportTicket,
} from "./users.service";

const router: Router = Router();

const updateMeSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  phone: z.string().min(10).max(15).optional(),
  avatarUrl: z.string().url().optional(),
});

router.get("/me", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await getMe(req.user!.userId) });
}));

router.patch("/me", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const data = updateMeSchema.parse(req.body);
  res.json({ success: true, data: await updateMe(req.user!.userId, data) });
}));

// password change / delete live under /auth (change-password, DELETE /auth/account)

router.get("/notifications", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional() }).parse(req.query);
  res.json({ success: true, data: await listNotifications(req.user!.userId, q) });
}));

router.patch("/notifications/:id/read", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await markNotificationRead(req.user!.userId, req.params.id!) });
}));

router.get("/wishlist", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await listWishlist(req.user!.userId) });
}));

router.post("/wishlist/:propertyId", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await addWishlist(req.user!.userId, req.params.propertyId!) });
}));

router.delete("/wishlist/:propertyId", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await removeWishlist(req.user!.userId, req.params.propertyId!) });
}));

router.post("/support-tickets", asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ subject: z.string().min(3).max(120), message: z.string().min(10).max(2000), email: z.string().email().optional() }).parse(req.body);
  const email = req.user?.email || body.email || null;
  res.status(201).json({ success: true, data: await createSupportTicket(req.user?.userId || null, email, body.subject, body.message) });
}));

export default router;
