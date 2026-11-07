import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";

const router: Router = Router();

router.get("/properties", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: [] });
}));
router.patch("/properties/:id/approve", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: "property approved (placeholder)" } });
}));
router.get("/analytics", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: "analytics (placeholder)" } });
}));
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "admin", status: "active" } });
});

export default router;
