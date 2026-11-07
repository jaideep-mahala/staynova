import { prisma } from "@repo/db";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { logger } from "../../lib/logger";
import { sendEmail } from "../../lib/mailer";
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
  return require("crypto").createHash("sha256").update(token).digest("hex");
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
  const verificationToken = require("crypto").randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      passwordHash,
      phone: data.phone || null,
      role: data.role || "USER",
      emailVerifications: { create: { tokenHash: verificationToken, expiresAt } },
    },
  });
  try {
    const verifyUrl = `${CLIENT_URL}/verify-email?token=${verificationToken}`;
    await sendEmail({
      to: user.email,
      subject: "Verify your StayNova email",
      html: `<h1>Welcome to StayNova</h1><p>Click <a href="${verifyUrl}">here</a> to verify.</p>`,
    });
  } catch (e) {
    logger.warn("Verification email failed", e);
  }
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
  const record = await prisma.emailVerification.findUnique({
    where: { tokenHash: token },
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

export async function forgotPassword(email: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return { success: true };
  const token = require("crypto").randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
  await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: token, expiresAt } });
  try {
    const resetUrl = `${CLIENT_URL}/reset-password?token=${token}`;
    await sendEmail({ to: user.email, subject: "Reset your StayNova password", html: `<h1>Password Reset</h1><p>Click <a href="${resetUrl}">here</a> to reset your password.</p>` });
  } catch (e) {
    logger.warn("Reset email failed", e);
  }
  return { success: true };
}

export async function resetPassword(token: string, newPassword: string) {
  const record = await prisma.passwordReset.findUnique({
    where: { tokenHash: token },
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
