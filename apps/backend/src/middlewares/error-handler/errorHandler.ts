import { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { logger } from "../../lib/logger";

export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
}

const handleZodError = (err: ZodError): ErrorResponse => {
  const errors = err.errors.map((e) => ({
    field: e.path.join("."),
    message: e.message,
  }));
  return {
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Validation failed",
      details: errors,
    },
  };
};

export const errorHandler = (
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  let statusCode = err.statusCode || 500;
  let response: ErrorResponse = {
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: err.message || "Internal server error",
    },
  };

  if (err instanceof ZodError) {
    response = handleZodError(err);
    statusCode = 400;
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    response = {
      success: false,
      error: {
        code: err.message,
        message: err.message,
      },
    };
  }

  logger.error({ message: err.message, stack: err.stack, statusCode });

  res.status(statusCode).json(response);
};

export const asyncHandler =
  (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
