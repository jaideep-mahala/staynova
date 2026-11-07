import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { createPaymentOrder, verifyPayment, handleRazorpayWebhook } from "./payment.service";

const router: Router = Router();

router.post("/create-order", asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await createPaymentOrder(req.body, userId);
  res.json({ success: true, data: result });
}));
router.post("/verify", asyncHandler(async (req: Request, res: Response) => {
  const userId = (req as any).user?.userId;
  const result = await verifyPayment(req.body, userId);
  res.json({ success: true, data: result });
}));
router.post("/webhooks/razorpay", asyncHandler(async (req: Request, res: Response) => {
  const signature = req.headers["x-razorpay-signature"] as string;
  await handleRazorpayWebhook(req.body, signature);
  res.json({ success: true });
}));
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "payments", status: "active" } });
});

export default router;
