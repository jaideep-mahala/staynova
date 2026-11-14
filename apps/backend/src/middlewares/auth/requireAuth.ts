import jwt, { type JwtPayload } from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { AppError } from "../error-handler/errorHandler";
import { prisma } from "@repo/db";
import { logger } from "../../lib/logger";

export interface AuthUser {
  userId: string;
  email: string;
  role: "USER" | "OWNER" | "ADMIN";
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  return null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req);
    if (!token) throw new AppError("UNAUTHORIZED", 401);
    let payload: JwtPayload & Partial<AuthUser>;
    try {
      payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || "access-secret") as JwtPayload & AuthUser;
    } catch {
      throw new AppError("UNAUTHORIZED", 401);
    }
    if (!payload.userId) throw new AppError("UNAUTHORIZED", 401);
    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || user.deletedAt || user.status === "BLOCKED") {
      throw new AppError("UNAUTHORIZED", 401);
    }
    req.user = { userId: user.id, email: user.email, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = extractBearerToken(req);
    if (token) {
      try {
        const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET || "access-secret") as JwtPayload & AuthUser;
        req.user = { userId: payload.userId as string, email: payload.email as string, role: payload.role as AuthUser["role"] };
      } catch {
        // ignore invalid token for public endpoints
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles: Array<"USER" | "OWNER" | "ADMIN">) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError("UNAUTHORIZED", 401));
    if (!roles.includes(req.user.role)) return next(new AppError("FORBIDDEN", 403));
    next();
  };
}

export async function requireOwner(req: Request, res: Response, next: NextFunction) {
  requireRole("OWNER", "ADMIN")(req, res, next);
}

export async function audit(actorId: string | null, action: string, entity: string, entityId: string | null, meta?: unknown, ip?: string | null) {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: actorId || undefined,
        action,
        entity,
        entityId: entityId || undefined,
        meta: (meta || undefined) as never,
        ip: ip || undefined,
      },
    });
  } catch (e) {
    logger.warn({ err: e }, "audit log write failed");
  }
}
