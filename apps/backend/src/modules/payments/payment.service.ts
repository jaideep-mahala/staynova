import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { getProvider } from "../../lib/payment-providers";

export async function createPaymentOrder(data: { bookingId: string }, userId: string) {
  const booking = await prisma.booking.findFirst({
    where: { id: data.bookingId, userId },
    include: { bookingItems: true },
  });
  if (!booking) throw new AppError("BOOKING_NOT_FOUND", 404);
  if (booking.status !== "HOLD" && booking.status !== "PENDING_PAYMENT") {
    throw new AppError("BOOKING_NOT_HOLD", 400);
  }

  const provider = getProvider(process.env.DEFAULT_PAYMENT_PROVIDER || "RAZORPAY");
  const order = await provider.createOrder({
    amountPaise: booking.totalPaise,
    currency: booking.currency,
    receipt: `booking_${booking.id}`,
    notes: { bookingId: booking.id },
  });

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      provider: "RAZORPAY",
      providerOrderId: order.id,
      amountPaise: booking.totalPaise,
      currency: booking.currency,
      status: "CREATED",
    },
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "PENDING_PAYMENT", paymentStatus: "PENDING" },
  });

  return { orderId: order.id, amount: order.amount, currency: order.currency, paymentId: payment.id };
}

export async function verifyPayment(data: {
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}, userId: string) {
  const payment = await prisma.payment.findFirst({
    where: { providerOrderId: data.razorpayOrderId },
    include: { booking: { include: { bookingItems: true } } },
  });
  if (!payment) throw new AppError("PAYMENT_NOT_FOUND", 404);
  if (payment.booking.userId !== userId) throw new AppError("NO_ACCESS", 403);

  const provider = getProvider("RAZORPAY");
  const valid = await provider.verifySignature({
    orderId: data.razorpayOrderId,
    paymentId: data.razorpayPaymentId,
    signature: data.razorpaySignature,
  });

  if (!valid) throw new AppError("INVALID_SIGNATURE", 400);

  return prisma.$transaction(async (tx) => {
    const updatedPayment = await tx.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: data.razorpayPaymentId,
        status: "CAPTURED",
        rawPayload: { verified: true },
      },
    });

    await tx.booking.update({
      where: { id: payment.bookingId },
      data: { status: "CONFIRMED", paymentStatus: "PAID" },
    });

    if (payment.booking.bookingItems.length > 0) {
      await tx.inventory.updateMany({
        where: { roomTypeId: payment.booking.bookingItems[0]?.roomTypeId || "" },
        data: {
          bookedRooms: { increment: payment.booking.roomsCount },
          heldRooms: { decrement: payment.booking.roomsCount },
        },
      });
    }

    return { bookingId: payment.bookingId, status: "CONFIRMED" };
  });
}

export async function handleRazorpayWebhook(payload: any, signature: string) {
  const provider = getProvider("RAZORPAY");
  const valid = await provider.verifySignature({
    orderId: payload.order_id || "",
    paymentId: payload.payment_id || "",
    signature,
  });

  if (!valid) throw new AppError("INVALID_WEBHOOK_SIGNATURE", 401);

  const event = payload.event;
  const paymentData = payload.payload.payment?.entity || {};

  if (event === "payment.captured") {
    const payment = await prisma.payment.findFirst({
      where: { providerPaymentId: paymentData.id },
    });
    if (payment && payment.status !== "CAPTURED") {
      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "CAPTURED" },
      });
      await prisma.booking.update({
        where: { id: payment.bookingId },
        data: { status: "CONFIRMED", paymentStatus: "PAID" },
      });
    }
  }

  return { success: true };
}
