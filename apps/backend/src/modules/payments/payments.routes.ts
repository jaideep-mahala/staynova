import { Router, Request, Response } from "express";
import { asyncHandler, AppError } from "../../middlewares/error-handler/errorHandler";
import { requireAuth } from "../../middlewares/auth/requireAuth";
import { createPaymentOrder, verifyPayment, handleRazorpayWebhook, handleStripeWebhook, verifyRazorpayWebhookSignature } from "./payment.service";

const router: Router = Router();

// raw body was parsed by express.raw in app.ts (mounted before express.json)
router.post("/webhooks/razorpay", asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["x-razorpay-signature"] as string;
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  if (!verifyRazorpayWebhookSignature(raw, signature || "")) {
    throw new AppError("INVALID_WEBHOOK_SIGNATURE", 401);
  }
  const payload = JSON.parse(raw.toString("utf8"));
  await handleRazorpayWebhook(payload);
  res.json({ success: true });
}));

// Stripe: signature verified by SDK against raw body
router.post("/webhooks/stripe", asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"] as string;
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body || {}));
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let event: unknown;
  if (process.env.STRIPE_SECRET_KEY && secret) {
    const Stripe = (await import("stripe")).default;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(raw, signature || "", secret);
  } else {
    // demo mode (no keys configured): accept unsigned payloads
    event = JSON.parse(raw.toString("utf8"));
  }
  await handleStripeWebhook(event);
  res.json({ success: true });
}));

router.post("/create-order", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await createPaymentOrder(req.body, req.user!.userId) });
}));

router.post("/verify", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await verifyPayment(req.body, req.user!.userId) });
}));

export default router;
