import { Router, Request, Response } from "express";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { requireAuth } from "../../middlewares/auth/requireAuth";
import { createReview, myReviews } from "./reviews.service";

const router: Router = Router();

router.get("/me", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await myReviews(req.user!.userId) });
}));

router.post("/booking/:bookingId", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json({ success: true, data: await createReview(req.params.bookingId!, req.user!.userId, req.body) });
}));

export default router;
