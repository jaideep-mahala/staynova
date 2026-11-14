import { prisma } from "@repo/db";
import { logger } from "../lib/logger";
import { enqueueJob, scheduleCron, startWorkers, QUEUES } from "../lib/queue";
import { sendEmail } from "../lib/mailer";
import { templates } from "../lib/email-templates";
import { ensureUploadDir, generateVoucherPdf, saveBuffer } from "../lib/storage";

export async function emailBookingConfirmed(data: { bookingId: string }) {
  const booking = await prisma.booking.findUnique({
    where: { id: data.bookingId },
    include: { property: { select: { name: true, ownerId: true } } },
  });
  if (!booking) return;
  const t = templates.bookingConfirmed({
    guestName: booking.guestName,
    bookingRef: booking.bookingRef,
    propertyName: booking.property.name,
    checkIn: booking.checkIn.toISOString().slice(0, 10),
    checkOut: booking.checkOut.toISOString().slice(0, 10),
    totalPaise: booking.totalPaise,
    voucherUrl: booking.voucherUrl,
  });
  await sendEmail({ to: booking.guestEmail, subject: t.subject, html: t.html });
  // notify owner
  const owner = await prisma.user.findUnique({ where: { id: booking.property.ownerId }, select: { email: true } });
  if (owner?.email) {
    const ot = templates.ownerNewBooking({
      propertyName: booking.property.name,
      bookingRef: booking.bookingRef,
      guestName: booking.guestName,
      checkIn: booking.checkIn.toISOString().slice(0, 10),
      checkOut: booking.checkOut.toISOString().slice(0, 10),
      totalPaise: booking.totalPaise,
    });
    await sendEmail({ to: owner.email, subject: ot.subject, html: ot.html }).catch((e) => logger.warn({ err: e }, "owner email failed"));
  }
}

export async function emailBookingCancelled(data: { bookingId: string }) {
  const booking = await prisma.booking.findUnique({
    where: { id: data.bookingId },
    include: { property: { select: { name: true } } },
  });
  if (!booking) return;
  const t = templates.bookingCancelled({
    bookingRef: booking.bookingRef,
    propertyName: booking.property.name,
    refundPaise: booking.refundAmountPaise,
  });
  await sendEmail({ to: booking.guestEmail, subject: t.subject, html: t.html });
}

export async function emailReviewRequest(data: { bookingId: string }) {
  const booking = await prisma.booking.findUnique({
    where: { id: data.bookingId },
    include: { property: { select: { name: true } } },
  });
  if (!booking?.guestEmail) return;
  const t = templates.reviewRequest({
    propertyName: booking.property.name,
    bookingRef: booking.bookingRef,
  });
  await sendEmail({ to: booking.guestEmail, subject: t.subject, html: t.html });
}

export async function generateVoucher(data: { bookingId: string }) {
  const booking = await prisma.booking.findUnique({
    where: { id: data.bookingId },
    include: {
      bookingItems: { include: { roomType: { select: { name: true } } } },
      property: { select: { name: true, addressLine: true, city: true, gstNumber: true } },
    },
  });
  if (!booking) return;
  const pdf = await generateVoucherPdf({
    bookingRef: booking.bookingRef,
    guestName: booking.guestName,
    guestEmail: booking.guestEmail,
    propertyName: booking.property.name,
    propertyAddress: [booking.property.addressLine, booking.property.city].filter(Boolean).join(", "),
    gstNumber: booking.property.gstNumber,
    checkIn: booking.checkIn.toISOString().slice(0, 10),
    checkOut: booking.checkOut.toISOString().slice(0, 10),
    nights: booking.nights,
    adults: booking.adults,
    children: booking.children,
    roomsCount: booking.roomsCount,
    roomName: booking.bookingItems[0]?.roomType.name || "Room",
    subtotalPaise: booking.subtotalPaise,
    taxPaise: booking.taxPaise,
    serviceFeePaise: booking.serviceFeePaise,
    discountPaise: booking.discountPaise,
    totalPaise: booking.totalPaise,
  });
  const rel = `vouchers/${booking.bookingRef}.pdf`;
  const url = saveBuffer(rel, pdf);
  await prisma.booking.update({ where: { id: booking.id }, data: { voucherUrl: url } });
  logger.info({ bookingId: booking.id, url }, "voucher generated");
}

export async function startAllJobs() {
  ensureUploadDir();

  const bookingHandlers = {
    expireHold: (data: { bookingId: string }) => import("./handlers").then((m) => m.expireHold(data)),
    lateCapture: (data: { bookingId: string; paymentRowId: string; payload?: unknown }) =>
      import("./handlers").then((m) => m.lateCaptureAttempt(data)),
  };

  const jobHandlers = {
    "email-booking-confirmation": (d: { bookingId: string }) => emailBookingConfirmed(d),
    "email-booking-cancelled": (d: { bookingId: string }) => emailBookingCancelled(d),
    "email-review-request": (d: { bookingId: string }) => emailReviewRequest(d),
    "email-new-owner-alert": (d: { bookingId: string; event: string }) =>
      d.event === "cancelled" ? emailBookingCancelled(d) : emailBookingConfirmed(d),
    "email-verify-email": (d: { email: string; link: string; name: string }) => {
      const t = templates.verifyEmail(d.link);
      return sendEmail({ to: d.email, subject: t.subject, html: t.html }).catch((e) =>
        logger.warn({ err: e }, "verify email failed (SMTP unconfigured?)")
      );
    },
    "email-reset-password": (d: { email: string; link: string }) => {
      const t = templates.forgotPassword(d.link);
      return sendEmail({ to: d.email, subject: t.subject, html: t.html }).catch((e) =>
        logger.warn({ err: e }, "reset email failed (SMTP unconfigured?)")
      );
    },
    "generate-voucher": (d: { bookingId: string }) => generateVoucher(d),
    "refresh-property-stats": (d: { propertyId: string }) =>
      import("./handlers").then((m) => m.refreshPropertyStats(d)),
    "sweep-expired-holds": () => import("./handlers").then((m) => m.sweepExpiredHolds()),
    "generate-inventory": () => import("./handlers").then((m) => m.generateInventory()),
    "complete-stays": () => import("./handlers").then((m) => m.completeStays()),
    "refund-payment": (d: { bookingId: string; forceFull?: boolean }) =>
      import("./handlers").then((m) => m.processRefundJob(d)),
  };

  startWorkers(QUEUES.booking, bookingHandlers as never);
  startWorkers(QUEUES.jobs, jobHandlers as never);

  // cron: sweeper every minute; inventory daily 02:00; completeStays daily 03:00 (approx local time)
  await scheduleCron(QUEUES.jobs, "sweep-expired-holds", {}, 60 * 1000);
  await scheduleCron(QUEUES.jobs, "generate-inventory", {}, 24 * 60 * 60 * 1000);
  await scheduleCron(QUEUES.jobs, "complete-stays", {}, 24 * 60 * 60 * 1000);

  // one-shot inventory bootstrap if empty
  const invCount = await prisma.inventory.count();
  if (invCount === 0) {
    await enqueueJob(QUEUES.jobs, "bootstrap-inventory", "generate-inventory", {});
  }

  logger.info("jobs started (workers + crons)");
}
