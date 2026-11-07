import { Router, Request, Response } from "express";
import {
  signupHandler,
  loginHandler,
  refreshHandler,
  verifyEmailHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  logoutHandler,
  logoutAllHandler,
} from "./auth.controller";

const router: Router = Router();

router.post("/signup", signupHandler);
router.post("/login", loginHandler);
router.post("/refresh", refreshHandler);
router.get("/verify-email", verifyEmailHandler);
router.post("/forgot-password", forgotPasswordHandler);
router.post("/reset-password", resetPasswordHandler);
router.post("/logout", logoutHandler);
router.post("/logout-all", logoutAllHandler);
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "auth", status: "active" } });
});

export default router;
