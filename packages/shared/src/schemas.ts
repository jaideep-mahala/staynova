import { z } from "zod";

export const currencySchema = z.string().min(3).max(3);
export const emailSchema = z.string().email();
export const passwordSchema = z
  .string()
  .min(8)
  .regex(/[A-Z]/, "at least one uppercase letter")
  .regex(/[0-9]/, "at least one number");
export const phoneSchema = z.string().min(10).max(15).optional();

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const dateRangeSchema = z.object({
  checkIn: z.string().datetime(),
  checkOut: z.string().datetime(),
});

export const bookingStatusSchema = z.enum([
  "HOLD", "PENDING_PAYMENT", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "EXPIRED", "NO_SHOW", "FAILED",
]);
