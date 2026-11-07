import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";

export async function createRoomType(data: any, propertyId: string) {
  return prisma.roomType.create({ data: { ...data, propertyId } });
}

export async function updateRoomType(id: string, data: any, propertyId: string) {
  const room = await prisma.roomType.findFirst({ where: { id, propertyId } });
  if (!room) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);
  return prisma.roomType.update({ where: { id }, data });
}

export async function deleteRoomType(id: string, propertyId: string) {
  const room = await prisma.roomType.findFirst({ where: { id, propertyId } });
  if (!room) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);
  return prisma.roomType.delete({ where: { id } });
}

export async function getRoomTypes(propertyId: string) {
  return prisma.roomType.findMany({ where: { propertyId } });
}
