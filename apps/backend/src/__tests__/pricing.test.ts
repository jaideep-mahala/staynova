import { describe, expect, it } from "vitest";
import {
  computeCouponDiscount,
  computeNightlyPrices,
  computeTaxesAndFees,
  gstRateForPerNight,
  nightsBetween,
} from "../modules/pricing/pricing.service";
import type { CouponInput, RateRuleInput } from "../modules/pricing/pricing.service";
import { calculateRefund } from "../modules/pricing/refund.service";

const day = (s: string) => new Date(`${s}T00:00:00+05:30`);

const coupon = (over: Partial<CouponInput> = {}): CouponInput => ({
  code: "TEST",
  type: "PERCENT",
  value: 10,
  maxDiscountPaise: null,
  minBookingPaise: null,
  validFrom: new Date("2026-01-01"),
  validTo: new Date("2027-12-31"),
  usageLimit: null,
  perUserLimit: null,
  usedCount: 0,
  applicablePropertyIds: [],
  propertyId: null,
  active: true,
  ...over,
});

describe("nightsBetween", () => {
  it("counts nights between dates", () => {
    expect(nightsBetween(day("2026-12-20"), day("2026-12-23"))).toBe(3);
  });
});

describe("gstRateForPerNight (spec 4.3 slabs)", () => {
  it("0% up to ₹1000", () => expect(gstRateForPerNight(100000 / 100)).toBe(0));
  it("12% for ₹1001–₹7500", () => expect(gstRateForPerNight(749900)).toBe(12));
  it("18% above ₹7500", () => expect(gstRateForPerNight(1303400)).toBe(18));
});

describe("computeNightlyPrices", () => {
  const today = day("2026-12-01");

  it("uses base price when no inventory/rules", () => {
    const out = computeNightlyPrices({ basePricePaise: 500000, roomsCount: 1, today, checkIn: day("2026-12-20"), nights: 2 });
    expect(out.map((n) => n.pricePaise)).toEqual([500000, 500000]);
  });

  it("inventory override wins over base", () => {
    const out = computeNightlyPrices({
      basePricePaise: 500000,
      roomsCount: 2,
      today,
      checkIn: day("2026-12-20"),
      nights: 2,
      inventoryByDate: new Map([["2026-12-21", 750000]]),
    });
    expect(out[0].pricePaise).toBe(1000000);
    expect(out[1].pricePaise).toBe(1500000);
  });

  it("WEEKEND rule applies Fri/Sat by default", () => {
    // 2026-12-18 is a Friday
    const rules: RateRuleInput[] = [
      { type: "WEEKEND", startDate: null, endDate: null, daysOfWeek: [], adjustmentType: "PERCENT", adjustmentValue: 20, priority: 1, active: true },
    ];
    const out = computeNightlyPrices({ basePricePaise: 100000, roomsCount: 1, today, checkIn: day("2026-12-18"), nights: 3, rateRules: rules });
    expect(out.map((n) => n.pricePaise)).toEqual([120000, 120000, 100000]); // Fri, Sat, Sun
  });

  it("SEASONAL date-range rule applies", () => {
    const rules: RateRuleInput[] = [
      { type: "SEASONAL", startDate: day("2026-12-19"), endDate: day("2026-12-20"), daysOfWeek: [], adjustmentType: "FLAT", adjustmentValue: 50000, priority: 1, active: true },
    ];
    const out = computeNightlyPrices({ basePricePaise: 300000, roomsCount: 1, today, checkIn: day("2026-12-18"), nights: 4, rateRules: rules });
    expect(out.map((n) => n.pricePaise)).toEqual([300000, 350000, 350000, 300000]);
  });

  it("LAST_MINUTE applies within daysUntilCheckIn window", () => {
    const rules: RateRuleInput[] = [
      { type: "LAST_MINUTE", startDate: null, endDate: day("2026-12-06"), daysOfWeek: [], adjustmentType: "PERCENT", adjustmentValue: -10, priority: 1, active: true },
    ];
    // 5 days until check-in => within [0,5]
    const out = computeNightlyPrices({ basePricePaise: 200000, roomsCount: 1, today, checkIn: day("2026-12-06"), nights: 1, rateRules: rules });
    expect(out[0].pricePaise).toBe(180000);
    // 10 days out => outside window
    const out2 = computeNightlyPrices({ basePricePaise: 200000, roomsCount: 1, today, checkIn: day("2026-12-11"), nights: 1, rateRules: rules });
    expect(out2[0].pricePaise).toBe(200000);
  });

  it("rules stack by priority and never go below 0", () => {
    const rules: RateRuleInput[] = [
      { type: "SEASONAL", startDate: day("2026-12-01"), endDate: day("2026-12-31"), daysOfWeek: [], adjustmentType: "PERCENT", adjustmentValue: -50, priority: 2, active: true },
      { type: "WEEKEND", startDate: null, endDate: null, daysOfWeek: [], adjustmentType: "FLAT", adjustmentValue: -999999, priority: 1, active: true },
    ];
    const out = computeNightlyPrices({ basePricePaise: 100000, roomsCount: 1, today, checkIn: day("2026-12-18"), nights: 1, rateRules: rules });
    expect(out[0].pricePaise).toBe(0);
    expect(out[0].appliedRules).toEqual(["WEEKEND", "SEASONAL"]);
  });
});

describe("computeCouponDiscount", () => {
  it("percent with cap", () => {
    expect(computeCouponDiscount(coupon({ value: 15, maxDiscountPaise: 100000 }), 1000000)).toBe(100000);
    expect(computeCouponDiscount(coupon({ value: 15, maxDiscountPaise: 300000 }), 1000000)).toBe(150000);
  });
  it("flat capped at subtotal", () => {
    expect(computeCouponDiscount(coupon({ type: "FLAT", value: 50000 }), 300000)).toBe(50000);
    expect(computeCouponDiscount(coupon({ type: "FLAT", value: 900000 }), 300000)).toBe(300000);
  });
  it("min booking enforced", () => {
    expect(() => computeCouponDiscount(coupon({ minBookingPaise: 300000 }), 299999)).toThrowError(/MIN_BOOKING/);
  });
  it("property restriction enforced", () => {
    expect(() => computeCouponDiscount(coupon({ propertyId: "p1" }), 1000000, { propertyId: "p2" })).toThrowError(/NOT_APPLICABLE/);
  });
  it("usage limits enforced", () => {
    expect(() => computeCouponDiscount(coupon({ usageLimit: 5, usedCount: 5 }), 1000000)).toThrowError(/USAGE_LIMIT/);
    expect(() => computeCouponDiscount(coupon({ perUserLimit: 1 }), 1000000, { userId: "u1", userRedemptions: 1 })).toThrowError(/PER_USER/);
  });
});

describe("computeTaxesAndFees (spec 4.3)", () => {
  it("18% GST slab + 2% service fee", () => {
    const r = computeTaxesAndFees({ roomSubtotalPaise: 2606800, extraGuestPaise: 0, discountPaise: 0, nights: 2, roomsCount: 1 });
    expect(r.taxRate).toBe(18);
    expect(r.taxPaise).toBe(469224);
    expect(r.serviceFeePaise).toBe(52136);
    expect(r.totalPaise).toBe(3128160);
  });

  it("GST computed on tariff AFTER discount", () => {
    const r = computeTaxesAndFees({ roomSubtotalPaise: 300000, extraGuestPaise: 0, discountPaise: 100000, nights: 1, roomsCount: 1 });
    expect(r.taxablePaise).toBe(200000); // ₹2000 → 12% slab
    expect(r.taxRate).toBe(12);
  });

  it("0% GST for cheap rooms", () => {
    const r = computeTaxesAndFees({ roomSubtotalPaise: 100000, extraGuestPaise: 0, discountPaise: 0, nights: 2, roomsCount: 2 });
    expect(r.taxRate).toBe(0);
    expect(r.taxPaise).toBe(0);
  });
});

describe("calculateRefund (spec 4.6)", () => {
  const base = {
    checkIn: day("2026-12-20"),
    checkInTime: "14:00",
    totalPaise: 3128160,
    nights: 2,
    subtotalPaise: 2606800,
    serviceFeePaise: 52136,
    cancelledBy: "user" as const,
  };

  it("FREE ≥24h → 100% minus service fee", () => {
    const r = calculateRefund({ ...base, policy: "FREE", cancelledAt: new Date("2026-12-18T10:00:00Z") });
    expect(r.refundPercent).toBe(100);
    expect(r.refundablePaise).toBe(3128160 - 52136);
  });

  it("FREE <24h → first night charged", () => {
    const r = calculateRefund({ ...base, policy: "FREE", cancelledAt: new Date("2026-12-19T20:00:00Z") });
    const firstNight = Math.round(2606800 / 2);
    expect(r.refundablePaise).toBe(3128160 - firstNight - 52136);
  });

  it("FLEXIBLE 24–48h → 50%", () => {
    const r = calculateRefund({ ...base, policy: "FLEXIBLE", cancelledAt: new Date("2026-12-18T14:00:00Z") });
    expect(r.refundPercent).toBe(50);
    expect(r.refundablePaise).toBe(Math.round((3128160 - 52136) * 0.5));
  });

  it("MODERATE ≥5d → 100%", () => {
    const r = calculateRefund({ ...base, policy: "MODERATE", cancelledAt: new Date("2026-12-13T00:00:00Z") });
    expect(r.refundPercent).toBe(100);
  });

  it("STRICT ≥7d → 50%", () => {
    const r = calculateRefund({ ...base, policy: "STRICT", cancelledAt: new Date("2026-12-12T00:00:00Z") });
    expect(r.refundPercent).toBe(50);
  });

  it("STRICT <7d → 0", () => {
    const r = calculateRefund({ ...base, policy: "STRICT", cancelledAt: new Date("2026-12-15T00:00:00Z") });
    expect(r.refundPercent).toBe(0);
    expect(r.refundablePaise).toBe(0);
  });

  it("NON_REFUNDABLE → 0", () => {
    const r = calculateRefund({ ...base, policy: "NON_REFUNDABLE", cancelledAt: new Date("2026-11-01T00:00:00Z") });
    expect(r.refundablePaise).toBe(0);
  });

  it("owner/admin cancel → 100% incl. service fee", () => {
    const r = calculateRefund({ ...base, policy: "STRICT", cancelledAt: new Date("2026-12-19T20:00:00Z"), cancelledBy: "admin" });
    expect(r.refundPercent).toBe(100);
    expect(r.refundablePaise).toBe(3128160);
  });
});
