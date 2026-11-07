import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";

const router: Router = Router();

router.post("/", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: { message: "room type created" } });
}));
router.patch("/:id", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: { message: "room type updated" } });
}));
router.delete("/:id", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: { message: "room type deleted" } });
}));
router.get("/:propertyId", asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: [] });
}));
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "rooms", status: "active" } });
});

export default router;
