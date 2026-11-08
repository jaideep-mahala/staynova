import rateLimit, { type Options } from "express-rate-limit";

function limiter(options: Partial<Options> & { windowMs: number; max: number }) {
  return rateLimit({
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests, slow down" } },
    ...options,
  });
}

export const authLimiter = limiter({ windowMs: 60 * 1000, max: 20 });
export const loginLimiter = limiter({
  windowMs: 60 * 1000,
  max: 5,
  keyGenerator: (req) => `${req.ip}:${(req.body?.email || "").toLowerCase()}`,
  message: { success: false, error: { code: "LOGIN_RATE_LIMITED", message: "Too many login attempts, try again in a minute" } },
});
export const bookingLimiter = limiter({ windowMs: 60 * 1000, max: 30 });
export const globalLimiterOptions = { windowMs: 60 * 1000, max: 100 };
