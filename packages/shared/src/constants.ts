export const CURRENCY = "INR";
export const PAISE_PER_RUPEE = 100;
export const HOLD_MINUTES_DEFAULT = 15;
export const SERVICE_FEE_PERCENT_DEFAULT = 2;
export const MAX_STAY_NIGHTS = 30;
export const MAX_ROOMS = 9;
export const GST_SLABS: Array<{ min: number; max: number | null; rate: number }> = [
  { min: 0, max: 1000, rate: 0 },
  { min: 1001, max: 7500, rate: 12 },
  { min: 7501, max: null, rate: 18 },
];
export const BOOKING_STATUS_FLOW = [
  "HOLD", "PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "COMPLETED",
] as const;
export const CANCELLATION_POLICIES = ["FREE", "FLEXIBLE", "MODERATE", "STRICT", "NON_REFUNDABLE"] as const;
export const ROLE_USER = "USER";
export const ROLE_OWNER = "OWNER";
export const ROLE_ADMIN = "ADMIN";
