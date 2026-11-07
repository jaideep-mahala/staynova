import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";

const router: Router = Router();

router.post("/:id/review", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: "review created (placeholder)" } });
}));
router.get("/:propertyId/reviews", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: [] });
}));
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "reviews", status: "active" } });
});

export default router;
