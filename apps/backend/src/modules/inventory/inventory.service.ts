import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { z } from "zod";

const bulkUpdateSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).optional(),
  totalRooms: z.number().int().min(0).max(500).optional(),
  pricePaise: z.number().int().min(0).max(10000000).nullable().optional(),
  isClosed: z.boolean().optional(),
  minStayNights: z.number().int().min(1).max(30).nullable().optional(),
});

export type InventoryBulkUpdate = z.infer<typeof bulkUpdateSchema>;

export async function getInventory(roomTypeId: string, from: string, to: string) {
  return prisma.inventory.findMany({
    where: {
      roomTypeId,
      date: { gte: new Date(`${from}T00:00:00`), lte: new Date(`${to}T00:00:00`) },
    },
    orderBy: { date: "asc" },
    select: {
      date: true, totalRooms: true, bookedRooms: true, heldRooms: true,
      pricePaise: true, isClosed: true, minStayNights: true,
    },
  });
}

/**
 * Spec: PUT /owner/rooms/:id/inventory — bulk date range update with guards:
 * cannot close dates with confirmed bookings; cannot reduce totalRooms below booked count.
 */
export async function bulkUpdateInventory(roomTypeId: string, input: unknown) {
  const data = bulkUpdateSchema.parse(input);
  const from = new Date(`${data.from}T00:00:00`);
  const to = new Date(`${data.to}T00:00:00`);
  if (to < from) throw new AppError("INVALID_DATE_RANGE", 400);
  if (to.getTime() - from.getTime() > 370 * 24 * 3600 * 1000) throw new AppError("RANGE_TOO_LARGE", 400);

  const roomType = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
  if (!roomType) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);

  // dates with active bookings in range
  const activeItems = await prisma.bookingItem.findMany({
    where: {
      roomTypeId,
      booking: { status: { in: ["HOLD", "PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN"] }, checkIn: { lt: to }, checkOut: { gt: from } },
    },
    include: { booking: { select: { checkIn: true, checkOut: true } } },
  });

  const rows = await prisma.inventory.findMany({ where: { roomTypeId, date: { gte: from, lte: to } } });
  const datesWithBookings = new Set<string>();
  for (const item of activeItems) {
    const d = new Date(Math.max(from.getTime(), item.booking.checkIn.getTime()));
    const end = new Date(Math.min(to.getTime(), item.booking.checkOut.getTime()));
    for (; d < end; d.setDate(d.getDate() + 1)) datesWithBookings.add(d.toISOString().slice(0, 10));
  }

  let updated = 0;
  for (const row of rows) {
    const dateKey = new Date(row.date).toISOString().slice(0, 10);
    const hasBookings = datesWithBookings.has(dateKey);

    const patch: Record<string, unknown> = {};
    if (data.totalRooms !== undefined) {
      const required = Math.max(row.bookedRooms, row.heldRooms);
      if (data.totalRooms < required) throw new AppError("TOTAL_ROOMS_BELOW_BOOKED", 409, { date: dateKey });
      patch.totalRooms = data.totalRooms;
    }
    if (data.pricePaise !== undefined) patch.pricePaise = data.pricePaise;
    if (data.minStayNights !== undefined) patch.minStayNights = data.minStayNights;
    if (data.isClosed !== undefined) {
      if (data.isClosed && hasBookings) {
        // spec 4.9: block closing dates with confirmed bookings
        continue;
      }
      patch.isClosed = data.isClosed;
    }
    if (Object.keys(patch).length === 0) continue;
    const res = await prisma.inventory.updateMany({ where: { id: row.id }, data: patch as never });
    updated += res.count;
  }

  // ensure inventory exists for the full range (auto-generate missing days)
  if (rows.length < dayDiff(from, to) + 1) {
    const existing = new Set(rows.map((r) => new Date(r.date).toISOString().slice(0, 10)));
    const missing = [];
    for (const d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
      const key = d.toISOString().slice(0, 10);
      if (!existing.has(key)) {
        missing.push({
          roomTypeId,
          date: new Date(`${key}T00:00:00`),
          totalRooms: data.totalRooms ?? roomType.totalRooms,
          pricePaise: data.pricePaise ?? null,
          isClosed: data.isClosed ?? false,
          minStayNights: data.minStayNights ?? 1,
        });
      }
    }
    if (missing.length) {
      await prisma.inventory.createMany({ data: missing, skipDuplicates: true });
      updated += missing.length;
    }
  }

  return { updated };
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (24 * 3600 * 1000));
}
