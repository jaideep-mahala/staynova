import { Router, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { requireAuth, requireRole } from "../../middlewares/auth/requireAuth";
import {
  adminUsers,
  adminUpdateUserStatus,
  adminListProperties,
  adminModerateProperty,
  adminBookings,
  adminRefund,
  adminCoupons,
  adminCreateCoupon,
  adminUpdateCoupon,
  adminDeleteCoupon,
  adminAmenities,
  adminReviews,
  adminModerateReview,
  adminAnalytics,
  adminAuditLogs,
} from "./admin.service";

const router: Router = Router();
router.use(requireAuth, requireRole("ADMIN"));

/* users */
router.get("/users", asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional(), q: z.string().optional(), role: z.string().optional(), status: z.string().optional() }).parse(req.query);
  const { items, meta } = await adminUsers(q);
  res.json({ success: true, data: items, meta });
}));

router.patch("/users/:id/status", asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ status: z.enum(["ACTIVE", "BLOCKED"]) }).parse(req.body);
  res.json({ success: true, data: await adminUpdateUserStatus(req.user!.userId, req.params.id!, body.status, req.ip) });
}));

/* property moderation */
router.get("/properties", asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ status: z.string().optional(), page: z.coerce.number().optional(), limit: z.coerce.number().optional() }).parse(req.query);
  const { items, meta } = await adminListProperties(q);
  res.json({ success: true, data: items, meta });
}));

router.patch("/properties/:id/approve", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await adminModerateProperty(req.user!.userId, req.params.id!, "approve", null, req.ip) });
}));

router.patch("/properties/:id/reject", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await adminModerateProperty(req.user!.userId, req.params.id!, "reject", req.body, req.ip) });
}));

router.patch("/properties/:id/suspend", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await adminModerateProperty(req.user!.userId, req.params.id!, "suspend", null, req.ip) });
}));

/* bookings + refunds */
router.get("/bookings", asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ status: z.string().optional(), page: z.coerce.number().optional(), limit: z.coerce.number().optional(), q: z.string().optional() }).parse(req.query);
  const { items, meta } = await adminBookings(q);
  res.json({ success: true, data: items, meta });
}));

router.post("/bookings/:id/refund", asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ amountPaise: z.number().int().min(1).optional() }).parse(req.body || {});
  res.json({ success: true, data: await adminRefund(req.user!.userId, req.params.id!, body.amountPaise, req.ip) });
}));

/* coupons CRUD */
router.get("/coupons", asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional() }).parse(req.query);
  const { items, meta } = await adminCoupons(q);
  res.json({ success: true, data: items, meta });
}));

router.post("/coupons", asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await adminCreateCoupon(req.user!.userId, req.body, req.ip) });
}));

router.patch("/coupons/:id", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await adminUpdateCoupon(req.user!.userId, req.params.id!, req.body, req.ip) });
}));

router.delete("/coupons/:id", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await adminDeleteCoupon(req.user!.userId, req.params.id!, req.ip) });
}));

/* amenities */
router.get("/amenities", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: await adminAmenities() });
}));

/* reviews moderation */
router.get("/reviews", asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ status: z.string().optional(), page: z.coerce.number().optional(), limit: z.coerce.number().optional() }).parse(req.query);
  const { items, meta } = await adminReviews(q);
  res.json({ success: true, data: items, meta });
}));

router.patch("/reviews/:id/hide", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await adminModerateReview(req.user!.userId, req.params.id!, "HIDDEN", req.ip) });
}));

router.patch("/reviews/:id/status", asyncHandler(async (req: Request, res: Response) => {
  const body = z.object({ status: z.enum(["VISIBLE", "HIDDEN", "FLAGGED"]) }).parse(req.body);
  res.json({ success: true, data: await adminModerateReview(req.user!.userId, req.params.id!, body.status, req.ip) });
}));

/* analytics + audit */
router.get("/analytics", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: await adminAnalytics() });
}));

router.get("/audit-logs", asyncHandler(async (req: Request, res: Response) => {
  const q = z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional() }).parse(req.query);
  const { items, meta } = await adminAuditLogs(q);
  res.json({ success: true, data: items, meta });
}));

/* support tickets */
router.get("/support-tickets", asyncHandler(async (_req: Request, res: Response) => {
  const tickets = await import("@repo/db").then(({ prisma }) => prisma.supportTicket.findMany({ orderBy: { createdAt: "desc" }, take: 100, include: { user: { select: { name: true, email: true } } } }));
  res.json({ success: true, data: tickets });
}));

export default router;
