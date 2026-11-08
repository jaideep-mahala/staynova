import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { getProvider } from "../../lib/payment-providers";
import { enqueueJob } from "../../lib/queue";
import { logger } from "../../lib/logger";
import crypto from "crypto";

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ""));
}

/** One transaction: capture → confirm booking → move held rooms to booked. */
export async function confirmBookingPaid(
  bookingId: string,
  paymentId: string,
  payload?: unknown
) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new AppError("PAYMENT_NOT_FOUND", 404);

    const booking = await tx.booking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new AppError("BOOKING_NOT_FOUND", 404);

    // amount mismatch check (spec 4.9)
    if (payment.amountPaise !== booking.totalPaise) {
      await tx.payment.update({
        where: { id: paymentId },
        data: { status: "FAILED", failureReason: `AMOUNT_MISMATCH payment=${payment.amountPaise} booking=${booking.totalPaise}` },
      });
      throw new AppError("PAYMENT_AMOUNT_MISMATCH", 400);
    }

    // already captured → idempotent no-op
    if (payment.status === "CAPTURED" && booking.status === "CONFIRMED") return { confirmed: true };

    // booking expired between payment and capture: try to re-confirm if inventory still free
    if (booking.status === "EXPIRED" || booking.status === "CANCELLED") {
      const items = await tx.bookingItem.findMany({ where: { bookingId } });
      let allFree = true;
      for (const item of items) {
        const rows = await tx.inventory.findMany({
          where: { roomTypeId: item.roomTypeId, date: { gte: booking.checkIn, lt: booking.checkOut } },
        });
        if (rows.some((r) => r.isClosed || r.totalRooms - r.bookedRooms - r.heldRooms < item.quantity)) allFree = false;
      }
      if (!allFree) {
        // auto refund fully and notify
        await tx.payment.update({ where: { id: paymentId }, data: { status: "REFUNDED" } });
        await tx.refund.create({
          data: { paymentId, bookingId, amountPaise: payment.amountPaise, status: "PENDING", reason: "Late payment after hold expiry — auto refund" },
        });
        await tx.booking.update({ where: { id: bookingId }, data: { status: "FAILED" } });
        await enqueueJob("staynova-jobs", `${bookingId}-late-refund`, "refund-payment", { bookingId, forceFull: true });
        throw new AppError("BOOKING_NO_LONGER_AVAILABLE_REFUND_QUEUED", 409);
      }
    }

    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status: "CAPTURED",
        capturedAt: new Date(),
        rawPayload: (payload ?? { verified: true }) as never,
      },
    });

    await tx.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED", paymentStatus: "PAID" },
    });

    // inventory: held → booked for the exact nights
    const items = await tx.bookingItem.findMany({ where: { bookingId } });
    for (const item of items) {
      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "heldRooms" = GREATEST(0, "heldRooms" - ${item.quantity}),
            "bookedRooms" = "bookedRooms" + ${item.quantity}
        WHERE "roomTypeId" = ${item.roomTypeId}::uuid
          AND date >= ${booking.checkIn}::date
          AND date < ${booking.checkOut}::date
          AND "heldRooms" >= ${item.quantity}
      `;
    }

    // coupon usage (atomic increment) + redemption row
    if (booking.couponId) {
      await tx.coupon.update({ where: { id: booking.couponId }, data: { usedCount: { increment: 1 } } });
      await tx.couponRedemption
        .create({ data: { couponId: booking.couponId, userId: booking.userId, bookingId } })
        .catch(() => undefined);
    }

    return { confirmed: true, bookingId, bookingRef: booking.bookingRef };
  });
}

export async function createPaymentOrder(data: { bookingId: string; provider?: "RAZORPAY" | "STRIPE" }, userId: string) {
  const booking = await prisma.booking.findUnique({ where: { id: data.bookingId } });
  if (!booking || booking.userId !== userId) throw new AppError("BOOKING_NOT_FOUND", 404);
  if (!["HOLD", "PENDING_PAYMENT"].includes(booking.status)) {
    throw new AppError("BOOKING_NOT_PAYABLE", 400);
  }
  if (booking.holdExpiresAt && booking.holdExpiresAt < new Date() && booking.status !== "PENDING_PAYMENT") {
    throw new AppError("HOLD_EXPIRED", 400);
  }

  // idempotent: return an existing open order
  const openPayment = await prisma.payment.findFirst({
    where: { bookingId: booking.id, status: "CREATED" },
    orderBy: { createdAt: "desc" },
  });
  if (openPayment?.providerOrderId) {
    return { orderId: openPayment.providerOrderId, amount: openPayment.amountPaise, currency: openPayment.currency, paymentId: openPayment.id, provider: openPayment.provider };
  }

  const providerName = data.provider || "RAZORPAY";
  const provider = getProvider(providerName);
  const order = await provider.createOrder({
    amountPaise: booking.totalPaise,
    currency: booking.currency,
    receipt: `booking_${booking.id}`,
    notes: { bookingId: booking.id, bookingRef: booking.bookingRef },
  });

  const payment = await prisma.payment.create({
    data: {
      bookingId: booking.id,
      provider: providerName,
      providerOrderId: order.id,
      amountPaise: booking.totalPaise,
      currency: booking.currency,
      status: "CREATED",
    },
  });

  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "PENDING_PAYMENT" },
  });

  return { orderId: order.id, amount: order.amount, currency: order.currency, paymentId: payment.id, provider: providerName, keyId: process.env.RAZORPAY_KEY_ID };
}

export async function verifyPayment(
  data: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  userId: string
) {
  const payment = await prisma.payment.findUnique({
    where: { providerOrderId: data.razorpayOrderId },
    include: { booking: true },
  });
  if (!payment) throw new AppError("PAYMENT_NOT_FOUND", 404);
  if (payment.booking.userId !== userId) throw new AppError("FORBIDDEN", 403);

  if (payment.provider === "STRIPE") throw new AppError("WRONG_PROVIDER", 400);

  const provider = getProvider("RAZORPAY");
  const valid = await provider.verifySignature({
    orderId: data.razorpayOrderId,
    paymentId: data.razorpayPaymentId,
    signature: data.razorpaySignature,
  });
  if (!valid) throw new AppError("INVALID_SIGNATURE", 400);

  await prisma.payment.update({
    where: { id: payment.id },
    data: { providerPaymentId: data.razorpayPaymentId },
  });

  const result = await confirmBookingPaid(payment.bookingId, payment.id, { eventId: `verify-${data.razorpayPaymentId}` });
  if (result.confirmed) {
    await postConfirmationSideEffects(payment.bookingId);
  }
  return { bookingId: payment.bookingId, status: "CONFIRMED", bookingRef: result.bookingRef };
}

/** notify users/owners, emails, voucher, stats — after capture commit */
export async function postConfirmationSideEffects(bookingId: string) {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { bookingItems: { include: { roomType: { select: { name: true } } } }, property: { select: { name: true, ownerId: true, city: true } } },
    });
    if (!booking) return;
    await prisma.notification.createMany({
      data: [
        {
          userId: booking.userId,
          type: "BOOKING_CONFIRMED",
          title: "Booking confirmed",
          body: `Your stay at ${booking.property.name} (${booking.bookingRef}) is confirmed. Check-in ${booking.checkIn.toISOString().slice(0, 10)}.`,
          data: { bookingId } as never,
        },
        {
          userId: booking.property.ownerId,
          type: "BOOKING_CONFIRMED",
          title: "New booking received",
          body: `New booking ${booking.bookingRef} for ${booking.property.name}.`,
          data: { bookingId } as never,
        },
      ],
    });
    await enqueueJob("staynova-jobs", `${bookingId}-mail-user`, "email-booking-confirmation", { bookingId });
    await enqueueJob("staynova-jobs", `${bookingId}-mail-owner`, "email-new-owner-alert", { bookingId, event: "confirmed" });
    await enqueueJob("staynova-jobs", `${bookingId}-voucher`, "generate-voucher", { bookingId });
    await enqueueJob("staynova-jobs", `${bookingId}-stats`, "refresh-property-stats", { propertyId: booking.propertyId });
  } catch (e) {
    logger.warn({ err: e }, "post-confirmation side effects failed");
  }
}

/** Webhook event handler. payload must be the RAW JSON webhook object. */
export async function handleRazorpayWebhook(payload: any) {
  const event = payload?.event as string;
  const paymentEntity = payload?.payload?.payment?.entity || {};
  const refundEntity = payload?.payload?.refund?.entity || {};

  // find payment by order id (preferred) then payment id
  let payment =
    (paymentEntity.order_id &&
      (await prisma.payment.findUnique({ where: { providerOrderId: paymentEntity.order_id }, include: { booking: true } }))) ||
    (paymentEntity.id &&
      (await prisma.payment.findFirst({ where: { providerPaymentId: paymentEntity.id }, include: { booking: true } }))) ||
    null;

  if (event === "payment.captured") {
    if (!payment) {
      logger.warn({ event }, "webhook payment.captured for unknown payment");
      return { success: true, ignored: true };
    }
    if (payment.status === "CAPTURED" && payment.booking.status === "CONFIRMED") {
      return { success: true, ignored: true, reason: "idempotent-replay" };
    }
    if (paymentEntity.amount !== payment.amountPaise) {
      await prisma.payment.update({ where: { id: payment.id }, data: { failureReason: `WEBHOOK_AMOUNT_MISMATCH entity=${paymentEntity.amount}` } });
      logger.error({ bookingId: payment.bookingId, entityAmount: paymentEntity.amount }, "webhook amount mismatch — flagged for admin");
      return { success: true, flagged: true };
    }
    await prisma.payment.updateMany({
      where: { id: payment.id, providerPaymentId: null },
      data: { providerPaymentId: paymentEntity.id },
    });
    const result = await confirmBookingPaid(payment.bookingId, payment.id, payload);
    if (result.confirmed) await postConfirmationSideEffects(payment.bookingId);
    return { success: true };
  }

  if (event === "payment.failed") {
    if (!payment) return { success: true, ignored: true };
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ["CREATED", "AUTHORIZED"] } },
      data: { status: "FAILED", providerPaymentId: paymentEntity.id || undefined, failureReason: paymentEntity.error_description || "FAILED" },
    });
    await prisma.notification
      .create({
        data: { userId: payment.booking.userId, type: "PAYMENT_FAILED", title: "Payment failed", body: `Payment for booking ${payment.booking.bookingRef} failed. You can retry before the hold expires.`, data: { bookingId: payment.bookingId } as never },
      })
      .catch(() => undefined);
    return { success: true };
  }

  if (event === "refund.processed") {
    // find refund by provider id or amount on plugin
    let refund = refundEntity.id ? await prisma.refund.findUnique({ where: { providerRefundId: refundEntity.id } }) : null;
    if (!refund && payment) {
      refund = await prisma.refund.findFirst({ where: { bookingId: payment.bookingId, status: "PENDING" } });
    }
    if (refund) {
      await prisma.refund.update({ where: { id: refund.id }, data: { status: "PROCESSED", providerRefundId: refundEntity.id || refund.providerRefundId } });
      const totalRefunded = await prisma.refund.aggregate({ where: { bookingId: refund.bookingId, status: "PROCESSED" }, _sum: { amountPaise: true } });
      const booked = await prisma.booking.findUnique({ where: { id: refund.bookingId }, select: { totalPaise: true } });
      const refunded = totalRefunded._sum.amountPaise || 0;
      await prisma.booking.update({
        where: { id: refund.bookingId },
        data: { paymentStatus: refunded >= (booked?.totalPaise || Infinity) ? "REFUNDED" : "PARTIALLY_REFUNDED" },
      });
      await prisma.notification
        .create({
          data: { userId: (await prisma.booking.findUnique({ where: { id: refund.bookingId }, select: { userId: true } }))?.userId || "", type: "REFUND_PROCESSED", title: "Refund processed", body: "Your refund has been processed by the payment provider.", data: { bookingId: refund.bookingId } as never },
        })
        .catch(() => undefined);
    }
    return { success: true };
  }

  if (event === "payment_authorization.failed" || event === "order.paid") {
    return { success: true, ignored: true };
  }

  logger.info({ event }, "unhandled razorpay webhook event");
  return { success: true, ignored: true };
}

export async function handleStripeWebhook(payload: any) {
  const event = payload;
  const type = event?.type as string;
  const obj = event?.data?.object || {};

  // find payment by payment intent id
  const payment = obj.payment_intent
    ? await prisma.payment.findFirst({ where: { providerOrderId: obj.payment_intent }, include: { booking: true } })
    : await prisma.payment.findFirst({ where: { OR: [{ providerOrderId: obj.id }, { providerPaymentId: obj.id }] }, include: { booking: true } });

  if (type === "payment_intent.succeeded") {
    if (!payment) return { success: true, ignored: true };
    if (payment.status === "CAPTURED" && payment.booking?.status === "CONFIRMED") {
      return { success: true, ignored: true, reason: "idempotent" };
    }
    await prisma.payment.updateMany({
      where: { id: payment.id, providerPaymentId: null },
      data: { providerPaymentId: obj.id },
    });
    const result = await confirmBookingPaid(payment.bookingId, payment.id, event);
    if (result.confirmed) await postConfirmationSideEffects(payment.bookingId);
    return { success: true };
  }
  if (type === "payment_intent.payment_failed") {
    if (!payment) return { success: true, ignored: true };
    await prisma.payment.updateMany({
      where: { id: payment.id, status: { in: ["CREATED", "AUTHORIZED"] } },
      data: { status: "FAILED", providerPaymentId: obj.id || undefined, failureReason: obj.last_payment_error?.message || "FAILED" },
    });
    return { success: true };
  }
  if (type === "charge.refunded") {
    if (!payment) return { success: true, ignored: true };
    await prisma.refund.updateMany({
      where: { bookingId: payment.bookingId, status: "PENDING" },
      data: { status: "PROCESSED", providerRefundId: obj.id },
    });
    await prisma.booking.updateMany({ where: { id: payment.bookingId }, data: { paymentStatus: "REFUNDED" } });
    return { success: true };
  }
  return { success: true, ignored: true };
}

/** Called from cancel flow / admin endpoint; executes provider refund API. */
export async function refundPayment(refundRowId: string) {
  const refund = await prisma.refund.findUnique({ where: { id: refundRowId }, include: { payment: true, booking: true } });
  if (!refund) throw new AppError("REFUND_NOT_FOUND", 404);
  if (refund.status === "PROCESSED") return refund;

  const provider = getProvider(refund.payment.provider);
  if (refund.payment.status !== "CAPTURED") throw new AppError("PAYMENT_NOT_CAPTURABLE", 400);
  if (process.env.RAZORPAY_KEY_ID?.includes("replace") || !process.env.RAZORPAY_KEY_ID) {
    logger.warn({ bookingId: refund.bookingId }, "payment provider unconfigured — refund kept PENDING (demo mode)");
    return refund;
  }

  const providerRefundId = refund.payment.providerPaymentId;
  const result = await provider.refund({ paymentId: providerRefundId || "", amountPaise: refund.amountPaise, reason: refund.reason || "booking cancel" });

  const updated = await prisma.refund.update({
    where: { id: refund.id },
    data: { status: "PROCESSED", providerRefundId: result.id },
  });

  const totalRefunded = await prisma.refund.aggregate({ where: { bookingId: refund.bookingId, status: "PROCESSED" }, _sum: { amountPaise: true } });
  await prisma.booking.update({
    where: { id: refund.bookingId },
    data: { paymentStatus: (totalRefunded._sum.amountPaise || 0) >= refund.booking.totalPaise ? "REFUNDED" : "PARTIALLY_REFUNDED" },
  });
  return updated;
}
