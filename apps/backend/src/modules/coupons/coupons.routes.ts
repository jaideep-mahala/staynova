import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";

const router: Router = Router();

router.get("/", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: [] });
}));
router.post("/", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: "coupon created (placeholder)" } });
}));
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "coupons", status: "active" } });
});

export default router;
