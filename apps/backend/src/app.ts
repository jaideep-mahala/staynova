import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import { errorHandler, AppError } from "./middlewares/error-handler/errorHandler";
import { logger } from "./lib/logger";
import authRoutes from "./modules/auth/auth.routes";
import userRoutes from "./modules/users/users.routes";
import propertyRoutes from "./modules/properties/properties.routes";
import roomRoutes from "./modules/rooms/rooms.routes";
import inventoryRoutes from "./modules/inventory/inventory.routes";
import bookingRoutes from "./modules/bookings/bookings.routes";
import paymentRoutes from "./modules/payments/payments.routes";
import reviewRoutes from "./modules/reviews/reviews.routes";
import couponRoutes from "./modules/coupons/coupons.routes";
import notificationRoutes from "./modules/notifications/notifications.routes";
import ownerRoutes from "./modules/owner/owner.routes";
import adminRoutes from "./modules/admin/admin.routes";

const app: express.Application = express();

app.set("trust proxy", 1);

app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
  req.headers["x-correlation-id"] = req.headers["x-correlation-id"] || require("crypto").randomUUID();
  next();
});

app.use((req: express.Request, _res: express.Response, next: express.NextFunction) => {
  logger.info({ method: req.method, url: req.url, ip: req.ip });
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));

const corsOrigin = process.env.CLIENT_URL || "*";
app.use(cors({
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (!origin) return callback(null, true);
    const allowed = process.env.CLIENT_URL ? process.env.CLIENT_URL.split(",") : ["*"];
    if (allowed.includes("*") || allowed.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked: ${origin}`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Correlation-Id", "Idempotency-Key"],
}));

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { success: false, error: { code: "RATE_LIMITED", message: "Too many requests" } },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.get("/health", (_req: express.Request, res: express.Response) => {
  res.json({ success: true, data: { status: "ok", service: "staynova-api" } });
});

const API_PREFIX = "/api/v1";
app.use(`${API_PREFIX}/auth`, authRoutes);
app.use(`${API_PREFIX}/users`, userRoutes);
app.use(`${API_PREFIX}/properties`, propertyRoutes);
app.use(`${API_PREFIX}/rooms`, roomRoutes);
app.use(`${API_PREFIX}/inventory`, inventoryRoutes);
app.use(`${API_PREFIX}/bookings`, bookingRoutes);
app.use(`${API_PREFIX}/payments`, paymentRoutes);
app.use(`${API_PREFIX}/reviews`, reviewRoutes);
app.use(`${API_PREFIX}/coupons`, couponRoutes);
app.use(`${API_PREFIX}/notifications`, notificationRoutes);
app.use(`${API_PREFIX}/owner`, ownerRoutes);
app.use(`${API_PREFIX}/admin`, adminRoutes);

app.use(`${API_PREFIX}/webhooks/razorpay`, express.raw({ type: "*/*" }));
app.use(`${API_PREFIX}/webhooks/stripe`, express.raw({ type: "*/*" }));

app.use((_req: express.Request, _res: express.Response, next: express.NextFunction) => {
  next(new AppError("NOT_FOUND", 404));
});

app.use(errorHandler);

export default app;
