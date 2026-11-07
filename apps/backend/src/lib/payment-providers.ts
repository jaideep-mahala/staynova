import Razorpay from "razorpay";
import Stripe from "stripe";

export interface PaymentProvider {
  createOrder({ amountPaise, currency, receipt, notes }: {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<{ id: string; amount: number; currency: string; status: string }>;
  verifySignature({ orderId, paymentId, signature }: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<boolean>;
  refund({ paymentId, amountPaise, reason }: {
    paymentId: string;
    amountPaise: number;
    reason?: string;
  }): Promise<{ id: string; amount: number; status: string }>;
}

export class RazorpayProvider implements PaymentProvider {
  private client: Razorpay;
  constructor() {
    this.client = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID || "",
      key_secret: process.env.RAZORPAY_KEY_SECRET || "",
    });
  }
  async createOrder({ amountPaise, currency, receipt, notes }: {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }) {
    const order: any = await this.client.orders.create({
      amount: amountPaise,
      currency,
      receipt,
      notes,
    });
    return {
      id: order.id,
      amount: Number(order.amount),
      currency: order.currency,
      status: order.status,
    };
  }
  async verifySignature({ orderId, paymentId, signature }: {
    orderId: string;
    paymentId: string;
    signature: string;
  }) {
    const crypto = await import("crypto");
    const body = orderId + "|" + paymentId;
    const expected = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
      .update(body)
      .digest("hex");
    return expected === signature;
  }
  async refund({ paymentId, amountPaise, reason }: {
    paymentId: string;
    amountPaise: number;
    reason?: string;
  }) {
    const refund: any = await (this.client as any).payments.refund(paymentId, {
      amount: amountPaise,
      reason,
    });
    return {
      id: refund.id,
      amount: Number(refund.amount),
      status: refund.status,
    };
  }
}

export class StripeProvider implements PaymentProvider {
  private client: Stripe;
  constructor() {
    this.client = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
      apiVersion: "2023-10-16" as Stripe.LatestApiVersion,
    });
  }
  async createOrder({ amountPaise, currency, receipt, notes }: {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }) {
    const paymentIntent = await this.client.paymentIntents.create({
      amount: amountPaise,
      currency,
      metadata: { receipt, ...notes },
    });
    return {
      id: paymentIntent.id,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
      status: paymentIntent.status,
    };
  }
  async verifySignature({ orderId, paymentId, signature }: {
    orderId: string;
    paymentId: string;
    signature: string;
  }) {
    try {
      const pi = await this.client.paymentIntents.retrieve(orderId);
      return (
        pi.status === "succeeded" || pi.status === "requires_capture"
      );
    } catch {
      return false;
    }
  }
  async refund({ paymentId, amountPaise, reason }: {
    paymentId: string;
    amountPaise: number;
    reason?: string;
  }) {
    const refund: any = await (this.client as any).refunds.create({
      payment_intent: paymentId,
      amount: amountPaise,
      reason,
    });
    return {
      id: refund.id,
      amount: Number(refund.amount),
      status: refund.status,
    };
  }
}

export function getProvider(name: string): PaymentProvider {
  if (name === "STRIPE") return new StripeProvider();
  return new RazorpayProvider();
}
