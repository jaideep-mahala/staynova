import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";

const router: Router = Router();

router.get("/dashboard", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: "owner dashboard (placeholder)" } });
}));
router.get("/bookings", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: [] });
}));
router.get("/earnings", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: "earnings (placeholder)" } });
}));
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "owner", status: "active" } });
});

export default router;
