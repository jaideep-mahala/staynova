import { Router } from "express";
import {
  signupHandler,
  loginHandler,
  refreshHandler,
  verifyEmailHandler,
  forgotPasswordHandler,
  resetPasswordHandler,
  logoutHandler,
  logoutAllHandler,
  googleHandler,
  resendVerificationHandler,
  changePasswordHandler,
  deleteAccountHandler,
} from "./auth.controller";
import { requireAuth } from "../../middlewares/auth/requireAuth";
import { authLimiter, loginLimiter } from "../../middlewares/rate-limit/rateLimiters";

const router: Router = Router();

router.post("/signup", authLimiter, signupHandler);
router.post("/login", loginLimiter, loginHandler);
router.post("/google", authLimiter, googleHandler);
router.post("/refresh", refreshHandler);
router.post("/verify-email", verifyEmailHandler);
router.post("/resend-verification", authLimiter, resendVerificationHandler);
router.post("/forgot-password", authLimiter, forgotPasswordHandler);
router.post("/reset-password", authLimiter, resetPasswordHandler);
router.post("/logout", logoutHandler);
router.post("/logout-all", requireAuth, logoutAllHandler);
router.post("/change-password", requireAuth, changePasswordHandler);
router.delete("/account", requireAuth, deleteAccountHandler);

export default router;
