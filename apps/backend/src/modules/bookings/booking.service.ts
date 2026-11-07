import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { HOLD_MINUTES_DEFAULT } from "@repo/shared";
import { v4 as uuidv4 } from "uuid";

export async function createBooking(data: any, userId: string) {
  const {
    propertyId, roomTypeId, checkIn, checkOut, adults, children,
    roomsCount, couponCode, guestName, guestEmail, guestPhone, specialRequests,
  } = data;

  const checkInDate = new Date(checkIn);
  const checkOutDate = new Date(checkOut);
  const nights = Math.round((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

  if (nights < 1 || nights > 30) throw new AppError("INVALID_STAY_DURATION", 400);
  if (roomsCount > 9) throw new AppError("TOO_MANY_ROOMS", 400);

  const roomType = await prisma.roomType.findUnique({ where: { id: roomTypeId } });
  if (!roomType || roomType.propertyId !== propertyId) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);

  const inventory = await prisma.$queryRawUnsafe(
    `SELECT * FROM inventory WHERE room_type_id = $1 AND date >= $2 AND date < $3 ORDER BY date FOR UPDATE`,
    roomTypeId, checkInDate, checkOutDate
  );

  const invArray = inventory as any[];
  for (const inv of invArray) {
    if (inv.is_closed || (inv.total_rooms - inv.booked_rooms - inv.held_rooms) < roomsCount) {
      throw new AppError("ROOM_UNAVAILABLE", 409);
    }
  }

  const pricePerNight = roomType.basePricePaise;
  const subtotal = pricePerNight * nights * roomsCount;
  const totalPaise = subtotal;
  const bookingRef = `SN-${uuidv4().slice(0, 6).toUpperCase()}`;
  const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES_DEFAULT * 60 * 1000);

  const booking = await prisma.$transaction(async (tx) => {
    for (const inv of invArray) {
      await tx.inventory.update({
        where: { id: inv.id },
        data: { heldRooms: inv.held_rooms + roomsCount },
      });
    }

    return tx.booking.create({
      data: {
        bookingRef,
        userId,
        propertyId,
        status: "HOLD",
        paymentStatus: "PENDING",
        checkIn: checkInDate,
        checkOut: checkOutDate,
        nights,
        adults: adults || 1,
        children: children || 0,
        roomsCount,
        guestName: guestName || "",
        guestEmail: guestEmail || "",
        guestPhone,
        specialRequests,
        subtotalPaise: subtotal,
        taxPaise: 0,
        discountPaise: 0,
        serviceFeePaise: 0,
        totalPaise,
        currency: "INR",
        holdExpiresAt,
        cancellationPolicySnapshot: JSON.stringify({ type: "FLEXIBLE" }),
        bookingItems: {
          create: {
            roomTypeId,
            quantity: roomsCount,
            pricePerNightSnapshot: [],
            subtotalPaise: subtotal,
          },
        },
        bookingGuests: {
          create: [{
            name: guestName || "Guest",
            age: 30,
            isPrimary: true,
          }],
        },
      },
    });
  });

  return {
    bookingId: booking.id,
    bookingRef: booking.bookingRef,
    holdExpiresAt,
    totalPaise,
    subtotalPaise: subtotal,
  };
}

export async function getMyBookings(userId: string) {
  return prisma.booking.findMany({
    where: { userId },
    include: { bookingItems: { include: { roomType: true } }, payments: true },
    
  });
}

export async function getBooking(id: string, userId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id, userId },
    include: { bookingItems: { include: { roomType: true } }, payments: true },
  });
  if (!booking) throw new AppError("BOOKING_NOT_FOUND", 404);
  return booking;
}

export async function cancelBooking(id: string, userId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id, userId },
    include: { bookingItems: true },
  });
  if (!booking) throw new AppError("BOOKING_NOT_FOUND", 404);
  if (booking.status === "CANCELLED") throw new AppError("ALREADY_CANCELLED", 400);

  return prisma.$transaction(async (tx) => {
    const updated = await tx.booking.update({
      where: { id },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });

    if (booking.bookingItems.length > 0) {
      await tx.inventory.updateMany({
        where: { roomTypeId: booking.bookingItems[0]?.roomTypeId || "" },
        data: { heldRooms: { decrement: booking.roomsCount } },
      });
    }

    return updated;
  });
}
