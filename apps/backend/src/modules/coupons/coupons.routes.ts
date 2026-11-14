import { Router, Request, Response } from "express";
import { asyncHandler, AppError } from "../../middlewares/error-handler/errorHandler";
import { z } from "zod";
import { prisma } from "@repo/db";
import { computeCouponDiscount, type CouponInput } from "../pricing/pricing.service";
import { requireAuth, optionalAuth } from "../../middlewares/auth/requireAuth";

const router: Router = Router();

/**
 * POST /coupons/validate { code, subtotalPaise?, propertyId? }
 * Validates and returns the discount for the given subtotal.
 */
router.post("/validate", optionalAuth, asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    code: z.string().min(2).max(40),
    subtotalPaise: z.coerce.number().int().min(0).optional(),
    propertyId: z.string().uuid().optional(),
  });
  const { code, subtotalPaise = 0, propertyId } = schema.parse(req.body);

  const coupon = await prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });
  if (!coupon) throw new AppError("COUPON_NOT_FOUND", 404);

  let userRedemptions: number | undefined;
  if (req.user) {
    userRedemptions = await prisma.couponRedemption.count({ where: { couponId: coupon.id, userId: req.user.userId } });
  }
  const input: CouponInput = coupon as unknown as CouponInput;
  const discount = computeCouponDiscount(input, subtotalPaise, {
    userId: req.user?.userId,
    userRedemptions,
    propertyId,
  });
  res.json({
    success: true,
    data: {
      valid: true,
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      maxDiscountPaise: coupon.maxDiscountPaise,
      discountPaise: discount,
      description: coupon.description,
    },
  });
}));

// public offer banners for home page
router.get("/offers", asyncHandler(async (_req: Request, res: Response) => {
  const coupons = await prisma.coupon.findMany({
    where: { active: true, validFrom: { lte: new Date() }, validTo: { gte: new Date() }, propertyId: null },
    select: { code: true, description: true, type: true, value: true, maxDiscountPaise: true, minBookingPaise: true, validTo: true },
    take: 6,
  });
  res.json({ success: true, data: coupons });
}));

export default router;
