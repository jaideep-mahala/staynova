import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { requireAuth, requireRole } from "../../middlewares/auth/requireAuth";
import {
  createRoomType,
  updateRoomType,
  deleteRoomType,
  getRoomTypesForOwner,
  parseRoomType,
} from "./room.service";
import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";

const router: Router = Router();

router.get("/property/:propertyId", requireAuth, requireRole("OWNER", "ADMIN"), asyncHandler(async (req: Request, res: Response) => {
  const property = await prisma.property.findUnique({ where: { id: req.params.propertyId! }, select: { ownerId: true } });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND", 404);
  if (req.user!.role !== "ADMIN" && property.ownerId !== req.user!.userId) throw new AppError("FORBIDDEN", 403);
  res.json({ success: true, data: await getRoomTypesForOwner(req.params.propertyId!) });
}));

router.post("/property/:propertyId", requireAuth, requireRole("OWNER", "ADMIN"), asyncHandler(async (req: Request, res: Response) => {
  const property = await prisma.property.findUnique({ where: { id: req.params.propertyId! }, select: { ownerId: true } });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND", 404);
  if (req.user!.role !== "ADMIN" && property.ownerId !== req.user!.userId) throw new AppError("FORBIDDEN", 403);
  const data = parseRoomType(req.body);
  res.status(201).json({ success: true, data: await createRoomType(req.params.propertyId!, data) });
}));

router.patch("/:id", requireAuth, requireRole("OWNER", "ADMIN"), asyncHandler(async (req: Request, res: Response) => {
  await assertRoomOwnership(req.params.id!, req);
  res.json({ success: true, data: await updateRoomType(req.params.id!, parseRoomType({ ...(req.body as object), totalRooms: (req.body as any).totalRooms ?? undefined })) });
}));

router.delete("/:id", requireAuth, requireRole("OWNER", "ADMIN"), asyncHandler(async (req: Request, res: Response) => {
  await assertRoomOwnership(req.params.id!, req);
  res.json({ success: true, data: await deleteRoomType(req.params.id!) });
}));

async function assertRoomOwnership(roomTypeId: string, req: Request) {
  const room = await prisma.roomType.findUnique({
    where: { id: roomTypeId },
    include: { property: { select: { ownerId: true } } },
  });
  if (!room) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);
  if (req.user!.role !== "ADMIN" && room.property.ownerId !== req.user!.userId) throw new AppError("FORBIDDEN", 403);
}

export default router;
