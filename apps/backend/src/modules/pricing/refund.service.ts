import { type CancellationPolicy } from "@prisma/client";

/**
 * Spec 4.6 cancellation & refund logic.
 * Refund computed on hours before check-in (property local, IST).
 * Service fee is non-refundable for guest cancels; owner/admin cancels refund 100% incl. fees.
 */

const HOUR = 60 * 60 * 1000;

export interface RefundCalcResult {
  refundablePaise: number;
  serviceFeePaise: number;
  totalPaise: number;
  refundPercent: number;
  reason: string;
}

export function calculateRefund(input: {
  policy: CancellationPolicy;
  checkIn: Date;
  checkInTime?: string; // "HH:MM" property local time (IST)
  cancelledAt: Date;
  totalPaise: number;
  nights: number;
  subtotalPaise: number; // room subtotal incl extras (before tax+fee)
  serviceFeePaise: number;
  cancelledBy: "user" | "owner" | "admin";
}): RefundCalcResult {
  const { policy, checkIn, checkInTime = "14:00", cancelledAt, nights, subtotalPaise, serviceFeePaise } = input;

  // Owner/admin cancel => 100% including service fee
  if (input.cancelledBy !== "user") {
    return {
      refundablePaise: input.totalPaise,
      serviceFeePaise,
      totalPaise: input.totalPaise,
      refundPercent: 100,
      reason: "Cancelled by host/admin — full refund including fees",
    };
  }

  const [h = 14, m = 0] = checkInTime.split(":").map(Number);
  const checkInInstant = new Date(checkIn);
  checkInInstant.setUTCHours(18 + h - 5, m, 0, 0); // property-local (IST, UTC+5:30) mapped to UTC

  const hoursBefore = (checkInInstant.getTime() - cancelledAt.getTime()) / HOUR;
  const firstNightPaise = nights > 0 ? Math.round(subtotalPaise / nights) : subtotalPaise;

  let percent = 0;
  let reason = "";

  switch (policy) {
    case "FREE":
      if (hoursBefore >= 24) {
        percent = 100;
        reason = "Free cancellation (≥24h before check-in)";
      } else {
        // first night charged: refund = total − firstNight − serviceFee
        return {
          refundablePaise: Math.max(0, input.totalPaise - firstNightPaise - serviceFeePaise),
          serviceFeePaise,
          totalPaise: input.totalPaise,
          refundPercent: Math.round(((Math.max(0, input.totalPaise - firstNightPaise - serviceFeePaise)) / Math.max(1, input.totalPaise)) * 100),
          reason: "Cancelled within 24h of check-in — first night charged",
        };
      }
      break;
    case "FLEXIBLE":
      if (hoursBefore >= 48) {
        percent = 100;
        reason = "Flexible policy (≥48h)";
      } else if (hoursBefore >= 24) {
        percent = 50;
        reason = "Flexible policy (24–48h) — 50% refund";
      } else {
        percent = 0;
        reason = "Flexible policy (<24h) — no refund";
      }
      break;
    case "MODERATE":
      if (hoursBefore >= 120) {
        percent = 100;
        reason = "Moderate policy (≥5 days)";
      } else if (hoursBefore >= 48) {
        percent = 50;
        reason = "Moderate policy (2–5 days) — 50% refund";
      } else {
        percent = 0;
        reason = "Moderate policy (<2 days) — no refund";
      }
      break;
    case "STRICT":
      if (hoursBefore >= 168) {
        percent = 50;
        reason = "Strict policy (≥7 days) — 50% refund";
      } else {
        percent = 0;
        reason = "Strict policy (<7 days) — no refund";
      }
      break;
    case "NON_REFUNDABLE":
      percent = 0;
      reason = "Non-refundable booking";
      break;
    default:
      percent = 0;
      reason = "Unknown policy — no refund";
  }

  // guest cancel: service fee never refunded
  const baseRefundable = input.totalPaise - serviceFeePaise;
  const refundablePaise = Math.max(0, Math.round((baseRefundable * percent) / 100));
  return { refundablePaise, serviceFeePaise, totalPaise: input.totalPaise, refundPercent: percent, reason };
}
