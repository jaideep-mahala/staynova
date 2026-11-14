import { prisma } from "@repo/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { logger } from "../../lib/logger";
import { sendEmail } from "../../lib/mailer";
import { enqueueJob } from "../../lib/queue";
import { AppError } from "../../middlewares/error-handler/errorHandler";

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "refresh-secret";
const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

export interface TokenPayload {
  userId: string;
  email: string;
  role: string;
}

export function generateAccessToken(payload: TokenPayload): string {
  return jwt.sign(payload, ACCESS_SECRET, { expiresIn: "15m" });
}

export function generateRefreshToken(payload: TokenPayload): string {
  return jwt.sign(payload, REFRESH_SECRET, { expiresIn: "30d" });
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export function comparePassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

function makeTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function signup(data: {
  name: string;
  email: string;
  password: string;
  phone?: string;
  role?: "USER" | "OWNER";
}) {
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError("EMAIL_ALREADY_EXISTS", 409);
  }
  const passwordHash = await hashPassword(data.password);
  const verificationToken = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      phone: data.phone || null,
      role: data.role || "USER",
      emailVerifications: { create: { tokenHash: makeTokenHash(verificationToken), expiresAt } },
    },
  });
  const verifyUrl = `${CLIENT_URL}/verify-email?token=${verificationToken}`;
  await enqueueJob("staynova-jobs", `verify-${user.id}-${Date.now()}`, "email-verify-email", {
    email: user.email,
    link: verifyUrl,
    name: user.name,
  });
  logger.info({ userId: user.id, action: "SIGNUP" }, "User signed up");
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    requiresVerification: !user.emailVerifiedAt,
  };
}

export async function login(data: {
  email: string;
  password: string;
  userAgent?: string;
  ip?: string;
}) {
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || !user.passwordHash) {
    throw new AppError("INVALID_CREDENTIALS", 401);
  }
  if (user.status === "BLOCKED") {
    throw new AppError("ACCOUNT_BLOCKED", 403);
  }
  const valid = await comparePassword(data.password, user.passwordHash);
  if (!valid) {
    throw new AppError("INVALID_CREDENTIALS", 401);
  }
  const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  const refreshTokenHash = makeTokenHash(refreshToken);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      userAgent: data.userAgent || null,
      ip: data.ip || null,
    },
  });
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  logger.info({ userId: user.id, action: "LOGIN" }, "User logged in");
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
    emailVerified: !!user.emailVerifiedAt,
  };
}

export async function refreshTokens(refreshToken: string) {
  const tokenHash = makeTokenHash(refreshToken);
  const stored = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    if (stored) {
      await prisma.refreshToken.updateMany({ where: { userId: stored.userId }, data: { revokedAt: new Date() } });
    }
    throw new AppError("INVALID_OR_EXPIRED_REFRESH_TOKEN", 401);
  }
  const user = stored.user;
  if (user.status === "BLOCKED") {
    throw new AppError("ACCOUNT_BLOCKED", 403);
  }
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const newRefreshToken = generateRefreshToken(payload);
  const newHash = makeTokenHash(newRefreshToken);
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: newHash, expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
  });
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken: newRefreshToken,
  };
}

export async function verifyEmail(token: string) {
  const tokenHash = makeTokenHash(token);
  const record = await prisma.emailVerification.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError("INVALID_OR_EXPIRED_VERIFICATION_TOKEN", 400);
  }
  await prisma.$transaction([
    prisma.emailVerification.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
  ]);
  return { success: true, message: "Email verified successfully" };
}

export async function resendVerification(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // do not leak account existence
  if (!user || user.emailVerifiedAt) return { success: true };
  const token = crypto.randomBytes(32).toString("hex");
  await prisma.emailVerification.create({
    data: {
      userId: user.id,
      tokenHash: makeTokenHash(token),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
  const verifyUrl = `${CLIENT_URL}/verify-email?token=${token}`;
  await enqueueJob("staynova-jobs", `verify-${user.id}-${Date.now()}`, "email-verify-email", {
    email: user.email,
    link: verifyUrl,
    name: user.name,
  });
  return { success: true };
}

/** Google OAuth: verify Google-issued ID token and link/create the account by email. */
export async function googleAuth(idToken: string, meta?: { userAgent?: string; ip?: string }) {
  let googleUser: { sub?: string; email?: string; email_verified?: string | boolean; name?: string; picture?: string };
  try {
    const res = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    if (!res.ok) throw new Error("tokeninfo failed");
    googleUser = (await res.json()) as never;
  } catch {
    throw new AppError("GOOGLE_TOKEN_INVALID", 401);
  }
  const email = googleUser.email;
  const googleId = googleUser.sub;
  if (!email || !googleId) throw new AppError("GOOGLE_TOKEN_INVALID", 401);

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        name: googleUser.name || email.split("@")[0] || email,
        email,
        googleId,
        emailVerifiedAt: googleUser.email_verified ? new Date() : null,
        passwordHash: null,
      },
    });
  } else if (!user.googleId) {
    user = await prisma.user.update({ where: { id: user.id }, data: { googleId } });
  }
  if (user.status === "BLOCKED") throw new AppError("ACCOUNT_BLOCKED", 403);

  const payload: TokenPayload = { userId: user.id, email: user.email, role: user.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: makeTokenHash(refreshToken),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      userAgent: meta?.userAgent || null,
      ip: meta?.ip || null,
    },
  });
  return {
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    accessToken,
    refreshToken,
    emailVerified: !!user.emailVerifiedAt,
  };
}

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { success: true };
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: makeTokenHash(token), expiresAt } });
  const resetUrl = `${CLIENT_URL}/reset-password?token=${token}`;
  await enqueueJob("staynova-jobs", `reset-${user.id}-${Date.now()}`, "email-reset-password", {
    email: user.email,
    link: resetUrl,
  });
  return { success: true };
}

export async function resetPassword(token: string, newPassword: string) {
  const tokenHash = makeTokenHash(token);
  const record = await prisma.passwordReset.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    throw new AppError("INVALID_OR_EXPIRED_RESET_TOKEN", 400);
  }
  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.passwordReset.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
  ]);
  return { success: true };
}

export async function logout(refreshToken: string) {
  const tokenHash = makeTokenHash(refreshToken);
  await prisma.refreshToken.updateMany({ where: { tokenHash }, data: { revokedAt: new Date() } });
  return { success: true };
}

export async function logoutAll(userId: string) {
  await prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  return { success: true };
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.passwordHash) throw new AppError("USER_NOT_FOUND", 404);
  const valid = await comparePassword(currentPassword, user.passwordHash);
  if (!valid) throw new AppError("INVALID_CREDENTIALS", 401);
  const passwordHash = await hashPassword(newPassword);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  // security: revoke all sessions after password change
  await logoutAll(userId);
  return { success: true };
}

/** Soft delete + anonymise PII (spec §5.7). */
export async function deleteAccount(userId: string) {
  const anonymised = `deleted-user-${userId.slice(0, 8)}@staynova.invalid`;
  await prisma.user.update({
    where: { id: userId },
    data: {
      deletedAt: new Date(),
      email: anonymised,
      phone: null,
      passwordHash: null,
      name: "Deleted user",
      avatarUrl: null,
      googleId: null,
    },
  });
  await logoutAll(userId);
  return { success: true };
}
