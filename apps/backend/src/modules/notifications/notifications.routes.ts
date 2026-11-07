import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";

const router: Router = Router();

router.get("/", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: [] });
}));
router.patch("/:id/read", asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: "notification marked read" } });
}));
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "notifications", status: "active" } });
});

export default router;
