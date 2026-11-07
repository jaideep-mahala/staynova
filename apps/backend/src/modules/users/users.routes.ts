import { Router, Request, Response } from "express";
const router: Router = Router();
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "users", status: "placeholder" } });
});
export default router;
