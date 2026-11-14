import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { GST_SLABS, MAX_ROOMS, MAX_STAY_NIGHTS, SERVICE_FEE_PERCENT_DEFAULT } from "@repo/shared";

export interface RateRuleInput {
  type: "WEEKEND" | "SEASONAL" | "LAST_MINUTE" | "EARLY_BIRD" | "LONG_STAY";
  startDate: Date | null;
  endDate: Date | null;
  daysOfWeek: number[];
  adjustmentType: "PERCENT" | "FLAT";
  adjustmentValue: number;
  priority: number;
  active: boolean;
}

export interface NightBreakdown {
  date: string; // YYYY-MM-DD
  pricePaise: number;
  appliedRules: string[];
}

export interface PriceBreakdown {
  perNight: NightBreakdown[];
  roomsCount: number;
  roomSubtotalPaise: number;
  extraGuestPaise: number;
  subtotalPaise: number;
  discountPaise: number;
  taxablePaise: number;
  taxPaise: number;
  taxRate: number;
  serviceFeePaise: number;
  totalPaise: number;
  currency: string;
  couponCode?: string;
}

export interface CouponInput {
  code: string;
  type: "PERCENT" | "FLAT";
  value: number;
  maxDiscountPaise: number | null;
  minBookingPaise: number | null;
  validFrom: Date;
  validTo: Date;
  usageLimit: number | null;
  perUserLimit: number | null;
  usedCount: number;
  applicablePropertyIds: string[];
  propertyId: string | null;
  active: boolean;
}

export function addNights(start: Date, nights: number): Date[] {
  const out: Date[] = [];
  const d = new Date(start);
  for (let i = 0; i < nights; i++) {
    out.push(new Date(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function nightsBetween(checkIn: Date, checkOut: Date): number {
  return Math.round((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
}

/** YYYY-MM-DD key in property-local time (IST) — independent of host TZ. */
function toDateOnly(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function dateKeyOf(v: string | Date): string {
  if (v instanceof Date) return toDateOnly(v);
  return String(v).slice(0, 10);
}

function dayDiff(a: string, b: string): number {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);
}

/**
 * Pure nightly-price engine per spec 4.3.
 * nightly = inventory.pricePaise ?? basePricePaise, then rate rules by priority.
 * Rate rule window conventions (documented in DECISIONS.md):
 *  - WEEKEND: daysOfWeek (empty -> Fri(5)/Sat(6))
 *  - SEASONAL: date inside [startDate, endDate]
 *  - LAST_MINUTE: daysUntilCheckIn within [startDate ?? 0, endDate ?? 7]
 *  - EARLY_BIRD: daysUntilCheckIn within [startDate ?? 0, endDate ?? 365]
 *  - LONG_STAY: nights within [startDate ?? 2, endDate ?? 30]
 * Adjustments are signed; PERCENT applies on the current nightly, FLAT is paise.
 */
export function computeNightlyPrices(input: {
  basePricePaise: number;
  roomsCount: number;
  today: Date;
  checkIn: Date;
  nights: number;
  inventoryByDate?: Map<string, number | null | undefined>;
  rateRules?: RateRuleInput[];
}): NightBreakdown[] {
  const { basePricePaise, roomsCount, today, checkIn, inventoryByDate = new Map(), rateRules = [] } = input;  const activeRules = rateRules.filter((r) => r.active).sort((a, b) => a.priority - b.priority);
  const todayKey = toDateOnly(today);
  const checkInKey = toDateOnly(checkIn);
  const daysUntil = dayDiff(checkInKey, todayKey);
  const totalNights = input.nights;

  const ruleApplies = (rule: RateRuleInput, key: string): boolean => {
    switch (rule.type) {
      case "WEEKEND": {
        const days = rule.daysOfWeek.length ? rule.daysOfWeek : [5, 6];
        // daysOfWeek is ISO 1=Mon..7=Sun (schema comment); map JS getUTCDay 0→7
        return days.includes(new Date(`${key}T12:00:00Z`).getUTCDay() || 7);
      }
      case "SEASONAL": {
        if (!rule.startDate || !rule.endDate) return false;
        return key >= dateKeyOf(rule.startDate) && key <= dateKeyOf(rule.endDate);
      }
      case "LAST_MINUTE": {
        const min = rule.startDate ? dayDiff(dateKeyOf(rule.startDate), todayKey) : 0;
        const max = rule.endDate ? dayDiff(dateKeyOf(rule.endDate), todayKey) : 7;
        return daysUntil >= Math.min(min, max) && daysUntil <= Math.max(min, max);
      }
      case "EARLY_BIRD": {
        const min = rule.startDate ? dayDiff(dateKeyOf(rule.startDate), todayKey) : 0;
        const max = rule.endDate ? dayDiff(dateKeyOf(rule.endDate), todayKey) : 365;
        return daysUntil >= Math.min(min, max) && daysUntil <= Math.max(min, max);
      }
      case "LONG_STAY": {
        // window values encode nights: UTC day-of-month of startDate/endDate
        // (e.g. 1970-01-03 => 3 nights). Defaults: 2..30.
        const min = rule.startDate ? new Date(rule.startDate).getUTCDate() : 2;
        const max = rule.endDate ? new Date(rule.endDate).getUTCDate() : 30;
        return totalNights >= Math.min(min, max) && totalNights <= Math.max(min, max);
      }
      default:
        return false;
    }
  };

  // iterate night keys anchored at UTC noon to stay TZ-safe
  const keys = Array.from({ length: totalNights }, (_, i) =>
    new Date(Date.parse(`${checkInKey}T12:00:00Z`) + i * 86400000).toISOString().slice(0, 10),
  );

  return keys.map((key) => {
    // nightly = inventory override ?? base price
    let price = inventoryByDate.get(key) ?? null;
    if (price === null || price === undefined) price = basePricePaise;
    const basePrice = price;
    const appliedRules: string[] = [];
    for (const rule of activeRules) {
      if (!ruleApplies(rule, key)) continue;
      const delta =
        rule.adjustmentType === "PERCENT"
          ? Math.round((basePrice * rule.adjustmentValue) / 100)
          : rule.adjustmentValue;
      price = Math.max(0, price + delta);
      appliedRules.push(rule.type);
    }
    return { date: key, pricePaise: price * roomsCount, appliedRules };
  });
}

/** Validate a coupon against subtotal + restriction rules; returns discount paise. */
export function computeCouponDiscount(
  coupon: CouponInput,
  subtotalPaise: number,
  opts?: { userId?: string; userRedemptions?: number; propertyId?: string | null }
): number {
  const { userId, userRedemptions, propertyId } = opts || {};
  if (!coupon.active) throw new AppError("COUPON_INACTIVE", 400);
  const now = new Date();
  if (now < new Date(coupon.validFrom) || now > new Date(coupon.validTo)) {
    throw new AppError("COUPON_EXPIRED_OR_NOT_ACTIVE", 400);
  }
  if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
    throw new AppError("COUPON_USAGE_LIMIT_REACHED", 400);
  }
  if (userId && coupon.perUserLimit !== null && (userRedemptions ?? 0) >= coupon.perUserLimit) {
    throw new AppError("COUPON_PER_USER_LIMIT_REACHED", 400);
  }
  if (propertyId && coupon.propertyId && coupon.propertyId !== propertyId) {
    throw new AppError("COUPON_NOT_APPLICABLE_TO_PROPERTY", 400);
  }
  if (propertyId && coupon.applicablePropertyIds.length > 0 && !coupon.applicablePropertyIds.includes(propertyId)) {
    throw new AppError("COUPON_NOT_APPLICABLE_TO_PROPERTY", 400);
  }
  if (coupon.minBookingPaise !== null && subtotalPaise < coupon.minBookingPaise) {
    throw new AppError("COUPON_MIN_BOOKING_NOT_MET", 400);
  }
  let discount: number;
  if (coupon.type === "PERCENT") {
    discount = Math.round((subtotalPaise * coupon.value) / 100);
    if (coupon.maxDiscountPaise !== null) discount = Math.min(discount, coupon.maxDiscountPaise);
  } else {
    discount = Math.min(coupon.value, subtotalPaise);
  }
  return Math.max(0, discount);
}

export function gstRateForPerNight(perRoomPerNightPaise: number): number {
  // GST_SLABS bounds are rupee thresholds (₹0/₹1000/₹7500); input is paise
  const rupees = Math.round(perRoomPerNightPaise / 100);
  for (const slab of GST_SLABS) {
    if (rupees >= slab.min && (slab.max === null || rupees <= slab.max)) {
      return slab.rate;
    }
  }
  return 0;
}

/** Spec 4.3: GST depends on per room per night tariff (after discount). */
export function computeTaxesAndFees(input: {
  roomSubtotalPaise: number;
  extraGuestPaise: number;
  discountPaise: number;
  nights: number;
  roomsCount: number;
  serviceFeePercent?: number;
}) {
  const { roomSubtotalPaise, extraGuestPaise, discountPaise, nights, roomsCount } = input;
  const subtotal = roomSubtotalPaise + extraGuestPaise;
  const taxable = Math.max(0, subtotal - discountPaise);
  const perRoomPerNight = nights > 0 && roomsCount > 0 ? Math.floor(taxable / (nights * roomsCount)) : taxable;
  const rate = gstRateForPerNight(perRoomPerNight);
  const taxPaise = Math.round((taxable * rate) / 100);
  const serviceFeePercent = input.serviceFeePercent ?? SERVICE_FEE_PERCENT_DEFAULT;
  const serviceFeePaise = serviceFeePercent > 0 ? Math.round((taxable * serviceFeePercent) / 100) : 0;
  const totalPaise = taxable + taxPaise + serviceFeePaise;
  return { subtotalPaise: subtotal, discountPaise, taxablePaise: taxable, taxPaise, taxRate: rate, serviceFeePaise, totalPaise };
}

function assertValidStayParams(checkIn: Date, checkOut: Date, roomsCount: number, today: Date, opts?: { sameDayCutoffHour?: number | null; allowSameDay?: boolean }) {
  const start = new Date(`${toDateOnly(checkIn)}T00:00:00`);
  const end = new Date(`${toDateOnly(checkOut)}T00:00:00`);
  const nights = nightsBetween(start, end);
  if (nights < 1) throw new AppError("INVALID_STAY_DURATION", 400);
  if (nights > MAX_STAY_NIGHTS) throw new AppError("MAX_STAY_EXCEEDED", 400);
  if (roomsCount < 1 || roomsCount > MAX_ROOMS) throw new AppError("INVALID_ROOMS_COUNT", 400);
  const todayOnly = new Date(`${toDateOnly(today)}T00:00:00`);
  if (start < todayOnly) throw new AppError("CHECKIN_IN_PAST", 400);
  if (
    start.getTime() === todayOnly.getTime() &&
    opts?.allowSameDay &&
    opts.sameDayCutoffHour !== null &&
    opts.sameDayCutoffHour !== undefined
  ) {
    // same-day booking allowed until property cut-off hour (property local 24h clock)
    const istHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "numeric", hour12: false }).format(today));
    if (istHour >= opts.sameDayCutoffHour) throw new AppError("SAME_DAY_BOOKING_CLOSED", 400);
  }
  return nights;
}

/**
 * Full price quote for one room type over the stay, including inventory
 * availability check, rate rules, extra guest charges and coupon discount.
 */
export async function quoteRoomType(input: {
  roomTypeId: string;
  checkIn: string | Date;
  checkOut: string | Date;
  roomsCount: number;
  adults: number;
  children?: number;
  couponCode?: string | null;
  userId?: string | null;
  verifyAvailability?: boolean;
  sameDayCutoffHour?: number | null;
}): Promise<{ breakdown: PriceBreakdown; roomTypeId: string; roomTypeName: string }> {
  const roomType = await prisma.roomType.findUnique({
    where: { id: input.roomTypeId },
    include: { rateRules: true, property: true },
  });
  if (!roomType || !roomType.isActive) throw new AppError("ROOM_TYPE_NOT_FOUND", 404);

  const today = new Date();
  // normalize to UTC-midnight instants of the calendar dates so Prisma DATE
  // range queries don't shift with timezone offsets in the input
  const checkIn = new Date(`${dateKeyOf(input.checkIn)}T00:00:00Z`);
  const checkOut = new Date(`${dateKeyOf(input.checkOut)}T00:00:00Z`);
  const nightsCount = assertValidStayParams(checkIn, checkOut, input.roomsCount, today, {
    sameDayCutoffHour: input.sameDayCutoffHour,
    allowSameDay: input.verifyAvailability === false,
  });

  if (input.roomsCount * roomType.baseOccupancy < input.adults + (input.children || 0) * 0.5) {
    throw new AppError("GUESTS_DONT_FIT", 400);
  }
  if (input.roomsCount * roomType.maxOccupancy < input.adults + (input.children || 0)) {
    throw new AppError("OCCUPANCY_EXCEEDED", 400);
  }

  const overrides = new Map<string, number | null>();
  if (input.verifyAvailability !== false) {
    const rows = await prisma.inventory.findMany({
      where: { roomTypeId: roomType.id, date: { gte: checkIn, lt: checkOut } },
      select: { date: true, totalRooms: true, bookedRooms: true, heldRooms: true, isClosed: true, pricePaise: true, minStayNights: true },
    });
    if (rows.length < nightsCount) throw new AppError("INVENTORY_NOT_INITIALISED", 409);
    for (const row of rows) {
      const available = row.totalRooms - row.bookedRooms - row.heldRooms;
      if (row.isClosed || available < input.roomsCount) {
        throw new AppError("ROOM_UNAVAILABLE", 409, { date: row.date.toISOString().slice(0, 10) });
      }
      if (row.minStayNights && row.minStayNights > nightsCount) {
        throw new AppError("MIN_STAY_NOT_MET", 400);
      }
      overrides.set(new Date(row.date).toISOString().slice(0, 10), row.pricePaise ?? null);
    }
  }

  const nightly = computeNightlyPrices({
    basePricePaise: roomType.basePricePaise,
    roomsCount: input.roomsCount,
    today,
    checkIn,
    nights: nightsCount,
    inventoryByDate: overrides,
    rateRules: roomType.rateRules as unknown as RateRuleInput[],
  });
  const perNight: NightBreakdown[] = nightly;

  const roomSubtotal = perNight.reduce((sum, n) => sum + n.pricePaise, 0);

  // extra guest charges: guests beyond roomsCount * baseOccupancy
  const includedAdults = input.roomsCount * roomType.baseOccupancy;
  const extraAdults = Math.max(0, input.adults - includedAdults);
  const extraChildren = Math.max(0, (input.children || 0) - Math.max(0, includedAdults - input.adults));
  const extraAdultTotal = extraAdults * roomType.extraAdultPricePaise * nightsCount;
  const extraChildTotal = extraChildren * roomType.extraChildPricePaise * nightsCount;
  const extraGuestPaise = extraAdultTotal + extraChildTotal;

  let discount = 0;
  let coupon: CouponInput | undefined;
  if (input.couponCode) {
    const dbCoupon = await prisma.coupon.findUnique({ where: { code: input.couponCode.toUpperCase() } });
    if (!dbCoupon) throw new AppError("COUPON_NOT_FOUND", 404);
    let userRedemptions: number | undefined;
    if (input.userId) {
      userRedemptions = await prisma.couponRedemption.count({ where: { couponId: dbCoupon.id, userId: input.userId } });
    }
    coupon = { ...dbCoupon, applicablePropertyIds: dbCoupon.applicablePropertyIds, propertyId: dbCoupon.propertyId } as CouponInput;
    discount = computeCouponDiscount(coupon, roomSubtotal + extraGuestPaise, {
      userId: input.userId || undefined,
      userRedemptions,
      propertyId: roomType.propertyId,
    });
  }

  const fees = computeTaxesAndFees({
    roomSubtotalPaise: roomSubtotal,
    extraGuestPaise,
    discountPaise: discount,
    nights: nightsCount,
    roomsCount: input.roomsCount,
  });

  const breakdown: PriceBreakdown = {
    perNight,
    roomsCount: input.roomsCount,
    roomSubtotalPaise: roomSubtotal,
    extraGuestPaise,
    ...fees,
    currency: "INR",
    couponCode: coupon?.code,
  };
  return { breakdown, roomTypeId: roomType.id, roomTypeName: roomType.name };
}

export function validateStayParams(checkIn: string | Date, checkOut: string | Date, roomsCount: number, sameDayCutoffHour?: number | null) {
  const today = new Date();
  return assertValidStayParams(new Date(checkIn), new Date(checkOut), roomsCount, today, { sameDayCutoffHour, allowSameDay: true });
}
