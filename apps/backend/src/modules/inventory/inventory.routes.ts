import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { requireAuth, requireRole } from "../../middlewares/auth/requireAuth";
import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { getInventory, bulkUpdateInventory } from "./inventory.service";

const router: Router = Router();

// inventory is owner-managed; exposed here too for calendar widgets
router.get("/:roomTypeId", requireAuth, requireRole("OWNER", "ADMIN"), asyncHandler(async (req: Request, res: Response) => {
  const from = String(req.query.from || new Date().toISOString().slice(0, 10));
  const to = String(req.query.to || "");
  const roomType = await prisma.roomType.findUnique({
    where: { id: req.params.roomTypeId! },
    include: { property: { select: { ownerId: true } } },
  });
  if (!roomType) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);
  if (req.user!.role !== "ADMIN" && roomType.property.ownerId !== req.user!.userId) {
    throw new AppError("FORBIDDEN", 403);
  }
  res.json({ success: true, data: await getInventory(req.params.roomTypeId!, from, to) });
}));

router.put("/:roomTypeId", requireAuth, requireRole("OWNER", "ADMIN"), asyncHandler(async (req: Request, res: Response) => {
  const roomType = await prisma.roomType.findUnique({
    where: { id: req.params.roomTypeId! },
    include: { property: { select: { ownerId: true } } },
  });
  if (!roomType) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);
  if (req.user!.role !== "ADMIN" && roomType.property.ownerId !== req.user!.userId) {
    throw new AppError("FORBIDDEN", 403);
  }
  res.json({ success: true, data: await bulkUpdateInventory(req.params.roomTypeId!, req.body) });
}));

export default router;
