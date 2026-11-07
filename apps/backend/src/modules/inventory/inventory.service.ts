import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";

export async function getInventory(roomTypeId: string, from: string, to: string) {
  return prisma.inventory.findMany({
    where: {
      roomTypeId,
      date: { gte: new Date(from), lte: new Date(to) },
    },
    orderBy: { date: "asc" },
  });
}

export async function updateInventory(roomTypeId: string, data: any) {
  return prisma.inventory.updateMany({
    where: { roomTypeId, date: { gte: data.from, lte: data.to } },
    data: { totalRooms: data.totalRooms, pricePaise: data.pricePaise, isClosed: data.isClosed },
  });
}
