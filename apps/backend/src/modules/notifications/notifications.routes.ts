import { Router, Request, Response } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { requireAuth } from "../../middlewares/auth/requireAuth";
import { listNotifications, markNotificationRead } from "../users/users.service";

const router: Router = Router();

const qSchema = z.object({ page: z.coerce.number().optional(), limit: z.coerce.number().optional() });

// spec §6: GET /notifications, PATCH /notifications/:id/read
router.get("/", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  const q = qSchema.parse(req.query);
  const { items, meta } = await listNotifications(req.user!.userId, q);
  res.json({ success: true, data: items, meta });
}));

router.patch("/:id/read", requireAuth, asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: await markNotificationRead(req.user!.userId, req.params.id!) });
}));

export default router;
