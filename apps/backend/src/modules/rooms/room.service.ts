import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { z } from "zod";
import { logger } from "../../lib/logger";
import { enqueueJob } from "../../lib/queue";

const roomTypeSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(2000).optional(),
  basePricePaise: z.number().int().min(1),
  totalRooms: z.number().int().min(1).max(200),
  maxAdults: z.number().int().min(1).max(10).default(2),
  maxChildren: z.number().int().min(0).max(10).default(2),
  maxOccupancy: z.number().int().min(1).max(20).default(4),
  baseOccupancy: z.number().int().min(1).max(10).default(2),
  extraAdultPricePaise: z.number().int().min(0).default(0),
  extraChildPricePaise: z.number().int().min(0).default(0),
  refundable: z.boolean().default(true),
  breakfastIncluded: z.boolean().default(false),
  sizeSqFt: z.number().int().min(0).optional(),
  bedType: z.string().max(40).optional(),
  bedCount: z.number().int().min(1).optional(),
  amenities: z.array(z.string().max(40)).optional(),
  images: z.array(z.string().url()).optional(),
  isActive: z.boolean().optional(),
});

export type RoomTypeInput = z.infer<typeof roomTypeSchema>;

export function parseRoomType(data: unknown): RoomTypeInput {
  return roomTypeSchema.parse(data);
}

export async function createRoomType(propertyId: string, data: RoomTypeInput) {
  const created = await prisma.roomType.create({
    data: {
      propertyId,
      name: data.name,
      description: data.description,
      basePricePaise: data.basePricePaise,
      totalRooms: data.totalRooms,
      maxAdults: data.maxAdults,
      maxChildren: data.maxChildren,
      maxOccupancy: data.maxOccupancy,
      baseOccupancy: data.baseOccupancy,
      extraAdultPricePaise: data.extraAdultPricePaise,
      extraChildPricePaise: data.extraChildPricePaise,
      refundable: data.refundable,
      breakfastIncluded: data.breakfastIncluded,
      sizeSqFt: data.sizeSqFt,
      bedType: data.bedType,
      bedCount: data.bedCount,
      amenities: data.amenities?.join(","),
      images: data.images ? { create: data.images.map((url, i) => ({ url, sortOrder: i })) } : undefined,
      amenityLinks: data.amenities ? { create: data.amenities.map((a) => ({ amenity: a.toLowerCase() })) } : undefined,
    },
  });
  await seedInventory(created.id, created.totalRooms);
  return created;
}

/** Generate the next 365 days of inventory rows for a room type (spec 4.1). */
export async function seedInventory(roomTypeId: string, totalRooms: number) {
  const rows = [];
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    rows.push({
      roomTypeId,
      date: new Date(`${d.toISOString().slice(0, 10)}T00:00:00`),
      totalRooms,
      minStayNights: 1,
    });
  }
  const res = await prisma.inventory.createMany({ data: rows, skipDuplicates: true });
  logger.info({ roomTypeId, created: res.count }, "inventory seeded for room type");
}

export async function updateRoomType(roomTypeId: string, data: RoomTypeInput) {
  const room = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
  if (!room) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);

  // spec 4.9: cannot reduce totalRooms below the currently booked/held count
  if (data.totalRooms !== undefined && data.totalRooms < room.totalRooms) {
    const conflicting = await prisma.inventory.findFirst({
      where: {
        roomTypeId,
        date: { gte: new Date() },
        OR: [
          { bookedRooms: { gt: data.totalRooms } },
          { heldRooms: { gt: data.totalRooms } },
        ],
      },
    });
    if (conflicting) {
      throw new AppError("TOTAL_ROOMS_BELOW_BOOKED", 409, { date: conflicting.date.toISOString().slice(0, 10) });
    }
  }

  return prisma.roomType.update({
    where: { id: roomTypeId },
    data: {
      name: data.name,
      description: data.description,
      basePricePaise: data.basePricePaise,
      totalRooms: data.totalRooms,
      maxAdults: data.maxAdults,
      maxChildren: data.maxChildren,
      maxOccupancy: data.maxOccupancy,
      baseOccupancy: data.baseOccupancy,
      extraAdultPricePaise: data.extraAdultPricePaise,
      extraChildPricePaise: data.extraChildPricePaise,
      refundable: data.refundable,
      breakfastIncluded: data.breakfastIncluded,
      sizeSqFt: data.sizeSqFt,
      bedType: data.bedType,
      bedCount: data.bedCount,
      amenities: data.amenities?.join(","),
      isActive: data.isActive,
      amenityLinks: data.amenities ? { deleteMany: {}, create: data.amenities.map((a) => ({ amenity: a.toLowerCase() })) } : undefined,
      images: data.images ? { deleteMany: {}, create: data.images.map((url, i) => ({ url, sortOrder: i })) } : undefined,
    },
  });
}

export async function deleteRoomType(roomTypeId: string) {
  const room = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
  if (!room) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);
  const activeBookings = await prisma.bookingItem.count({
    where: {
      roomTypeId,
      booking: { status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"] }, checkOut: { gte: new Date() } },
    },
  });
  if (activeBookings > 0) {
    // soft deactivate instead of hard delete (spec 4.9: rooms with bookings)
    return prisma.roomType.update({ where: { id: roomTypeId }, data: { isActive: false } });
  }
  return prisma.roomType.update({ where: { id: roomTypeId }, data: { isActive: false } });
}

export async function getRoomTypesForOwner(propertyId: string) {
  return prisma.roomType.findMany({
    where: { propertyId },
    include: { images: { orderBy: { sortOrder: "asc" } }, amenityLinks: true, rateRules: { orderBy: { priority: "asc" } } },
    orderBy: { createdAt: "asc" },
  });
}
