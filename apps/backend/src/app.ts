import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { errorHandler, AppError } from "./middlewares/error-handler/errorHandler";
import { logger } from "./lib/logger";
import { ensureUploadDir } from "./lib/storage";
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
  req.headers["x-correlation-id"] = req.headers["x-correlation-id"] || crypto.randomUUID();
  logger.info({ method: req.method, url: req.url, ip: req.ip, cid: req.headers["x-correlation-id"] });
  next();
});

// webhook raw bodies MUST be parsed before the JSON parser
app.use("/api/v1/payments/webhooks", express.raw({ type: "*/*", limit: "1mb" }));

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

// local uploaded files (dev storage) — voucher PDFs etc.
const uploadDir = ensureUploadDir();
app.use("/static", express.static(uploadDir));

// OpenAPI docs (spec §6) — served spec JSON + a docs landing page
app.get("/api/docs", (_req, res) => {
  res.type("text/html").send(`<!doctype html><html><head><title>StayNova API docs</title></head>
<body style="font-family:sans-serif;max-width:720px;margin:60px auto;">
<h1>StayNova API</h1><p>OpenAPI 3 spec: <a href="/api/docs.json">/api/docs.json</a></p>
<p>Interactive docs: open the JSON in <a href="https://editor.swagger.io/" target="_blank">Swagger Editor</a> or Redoc.</p>
</body></html>`);
});

app.get("/api/docs.json", (_req, res) => {
  const p = path.resolve(process.cwd(), "src/openapi.json");
  if (fs.existsSync(p)) {
    res.json(JSON.parse(fs.readFileSync(p, "utf8")));
  } else {
    res.json({
      openapi: "3.0.0",
      info: { title: "StayNova API", version: "1.0.0" },
      paths: {},
    });
  }
});

app.use((_req: express.Request, _res: express.Response, next: express.NextFunction) => {
  next(new AppError("NOT_FOUND", 404));
});

app.use(errorHandler);

export default app;
