import { Router, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { createBooking, getMyBookings, getBooking, cancelBooking } from "./booking.service";

const router: Router = Router();

const idParamSchema = z.object({ id: z.string().min(1) });

router.post("/", asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await createBooking(req.body, userId);
  res.status(201).json({ success: true, data: result });
}));
router.get("/", asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await getMyBookings(userId);
  res.json({ success: true, data: result });
}));
router.get("/:id", asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const userId = (req as any).user?.userId;
  const result = await getBooking(id, userId);
  res.json({ success: true, data: result });
}));
router.post("/:id/cancel", asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const userId = (req as any).user?.userId;
  const result = await cancelBooking(id, userId);
  res.json({ success: true, data: result });
}));
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "bookings", status: "active" } });
});

export default router;
