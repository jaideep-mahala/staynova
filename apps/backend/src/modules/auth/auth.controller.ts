import { Request, Response } from "express";
import { z } from "zod";
import {
  signup,
  login,
  refreshTokens,
  verifyEmail,
  forgotPassword,
  resetPassword,
  logout,
  logoutAll,
  resendVerification,
  googleAuth,
  changePassword,
  deleteAccount,
} from "./auth.service";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";
import { passwordSchema } from "@repo/shared";

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: passwordSchema,
  phone: z.string().optional(),
  role: z.enum(["USER", "OWNER"]).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const signupHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = signupSchema.parse(req.body);
  const result = await signup(data);
  res.status(201).json({ success: true, data: result });
});

export const loginHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = loginSchema.parse(req.body);
  const result = await login({
    ...data,
    userAgent: req.headers["user-agent"],
    ip: req.ip,
  });
  res.json({ success: true, data: result });
});

export const refreshHandler = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
  const result = await refreshTokens(refreshToken);
  res.json({ success: true, data: result });
});

export const verifyEmailHandler = asyncHandler(async (req: Request, res: Response) => {
  const { token } = z.object({ token: z.string() }).parse(req.query);
  const result = await verifyEmail(token);
  res.json({ success: true, data: result });
});

export const forgotPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  await forgotPassword(email);
  res.json({ success: true, data: { message: "If email exists, reset link sent" } });
});

export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = z.object({ token: z.string(), newPassword: z.string().min(8) }).parse(req.body);
  await resetPassword(data.token, data.newPassword);
  res.json({ success: true, data: { message: "Password reset successful" } });
});

export const logoutHandler = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken } = z.object({ refreshToken: z.string() }).parse(req.body);
  await logout(refreshToken);
  res.json({ success: true, data: { message: "Logged out" } });
});

export const logoutAllHandler = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  await logoutAll(userId);
  res.json({ success: true, data: { message: "Logged out from all devices" } });
});

export const googleHandler = asyncHandler(async (req: Request, res: Response) => {
  const { idToken } = z.object({ idToken: z.string().min(10) }).parse(req.body);
  const result = await googleAuth(idToken, { userAgent: req.headers["user-agent"], ip: req.ip });
  res.json({ success: true, data: result });
});

export const resendVerificationHandler = asyncHandler(async (req: Request, res: Response) => {
  const { email } = z.object({ email: z.string().email() }).parse(req.body);
  await resendVerification(email);
  res.json({ success: true, data: { message: "If account exists and is unverified, a new link was sent" } });
});

export const changePasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const data = z.object({ currentPassword: z.string(), newPassword: passwordSchema }).parse(req.body);
  await changePassword(req.user!.userId, data.currentPassword, data.newPassword);
  res.json({ success: true, data: { message: "Password changed; please log in again" } });
});

export const deleteAccountHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteAccount(req.user!.userId);
  res.json({ success: true, data: { message: "Account deleted" } });
});
