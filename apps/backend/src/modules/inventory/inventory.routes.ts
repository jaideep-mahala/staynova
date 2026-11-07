import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";

const router: Router = Router();

router.get("/:roomTypeId", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: [] });
}));
router.put("/:roomTypeId", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: { message: "inventory updated" } });
}));
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "inventory", status: "active" } });
});

export default router;
