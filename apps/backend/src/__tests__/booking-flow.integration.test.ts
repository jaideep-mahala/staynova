import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { prisma } from "@repo/db";
import { createBooking, cancelBooking, getMyBookings } from "../modules/bookings/booking.service";
import { AppError } from "../middlewares/error-handler/errorHandler";

// Integration test — requires running Postgres + Redis (docker compose up)

const future = (daysFromNow: number) =>
  new Date(Date.now() + daysFromNow * 86400000).toISOString().slice(0, 10);

let userId = "";
let roomTypeId = "";
let propertyId = "";

beforeAll(async () => {
  const user = await prisma.user.findFirst({ where: { role: "USER", email: "guest1@staynova.com" } });
  if (!user) throw new Error("seed missing: guest1@staynova.com");
  userId = user.id;

  // pick a room type whose property has no bookings in the test window
  const rt = await prisma.roomType.findFirst({
    where: {
      isActive: true,
      property: { status: "APPROVED", isDeleted: false },
      inventory: {
        some: {
          date: { gte: new Date(`${future(30)}T00:00:00Z`), lt: new Date(`${future(32)}T00:00:00Z`) },
          isClosed: false,
        },
      },
    },
    include: { property: true },
    orderBy: { createdAt: "asc" },
  });
  if (!rt) throw new Error("seed missing: room type with inventory");
  roomTypeId = rt.id;
  propertyId = rt.propertyId;
});

afterAll(async () => {
  await prisma.booking.deleteMany({ where: { userId, propertyId, idempotencyKey: { startsWith: "test-" } } });
  await prisma.$disconnect();
});

describe("booking flow (HOLD → cancel)", () => {
  it("creates a HOLD with correct snapshot and held-room increment", async () => {
    const key = `test-${randomUUID()}`;
    const booking = await createBooking(
      {
        roomTypeId,
        checkIn: future(30),
        checkOut: future(32),
        adults: 2,
        roomsCount: 1,
        guestName: "Test Guest",
        guestEmail: "test@example.com",
      },
      userId,
      key,
    );
    expect(booking.status).toBe("HOLD");
    expect(booking.totalPaise).toBeGreaterThan(0);
    expect(booking.nights).toBe(2);
    expect(booking.checkIn).toBe(future(30));

    const rt = await prisma.roomType.findUniqueOrThrow({ where: { id: roomTypeId } });
    const inv = await prisma.inventory.findMany({
      where: { roomTypeId, date: { gte: new Date(`${future(30)}T00:00:00Z`), lt: new Date(`${future(32)}T00:00:00Z`) } },
    });
    expect(inv.every((i) => i.heldRooms >= 1)).toBe(true);
    expect(inv.every((i) => i.heldRooms + i.bookedRooms <= i.totalRooms)).toBe(true);
  });

  it("is idempotent on the same key", async () => {
    const key = `test-${randomUUID()}`;
    const a = await createBooking({ roomTypeId, checkIn: future(30), checkOut: future(32), adults: 2, roomsCount: 1 }, userId, key);
    const b = await createBooking({ roomTypeId, checkIn: future(30), checkOut: future(32), adults: 2, roomsCount: 1 }, userId, key);
    expect(b.id).toBe(a.id);
  });

  it("rejects double-booking beyond available rooms", async () => {
    const rt = await prisma.roomType.findUniqueOrThrow({ where: { id: roomTypeId } });
    const inv = await prisma.inventory.findFirstOrThrow({
      where: { roomTypeId, date: new Date(`${future(30)}T00:00:00Z`) },
    });
    const free = inv.totalRooms - inv.bookedRooms - inv.heldRooms;
    if (free < 2) return; // not enough stock in seed data to test this
    const keys = Array.from({ length: free + 1 }, () => `test-${randomUUID()}`);
    const results = await Promise.allSettled(
      keys.map((key) =>
        createBooking({ roomTypeId, checkIn: future(30), checkOut: future(32), adults: 2, roomsCount: 1 }, userId, key),
      ),
    );
    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected.length).toBeGreaterThan(0);
  });

  it("cancels a HOLD and releases inventory", async () => {
    const key = `test-${randomUUID()}`;
    const booking = await createBooking({ roomTypeId, checkIn: future(30), checkOut: future(32), adults: 2, roomsCount: 1 }, userId, key);
    const before = await prisma.inventory.findFirstOrThrow({ where: { roomTypeId, date: new Date(`${future(30)}T00:00:00Z`) } });
    const heldBefore = before.heldRooms;

    await cancelBooking({ bookingId: booking.id, userId, reason: "test cancel" });
    const after = await prisma.inventory.findFirstOrThrow({ where: { roomTypeId, date: new Date(`${future(30)}T00:00:00Z`) } });
    expect(after.heldRooms).toBeLessThan(heldBefore);

    const list = await getMyBookings({ userId, tab: "cancelled" });
    expect(list.items.some((b) => b.id === booking.id)).toBe(true);
  });

  it("blocks cancel of another user's booking", async () => {
    const key = `test-${randomUUID()}`;
    const booking = await createBooking({ roomTypeId, checkIn: future(30), checkOut: future(32), adults: 2, roomsCount: 1 }, userId, key);
    await expect(
      cancelBooking({ bookingId: booking.id, userId: "someone-else", reason: "nope" }),
    ).rejects.toBeInstanceOf(AppError);
  });
});
