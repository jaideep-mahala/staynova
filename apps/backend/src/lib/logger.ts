import { pino } from "pino";

const isDev = process.env.NODE_ENV === "development";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isDev
    ? {
        target: "pino-pretty",
        options: { colorize: true, translateTime: "HH:MM:ss.l" },
      }
    : undefined,
  base: { pid: process.env.HOSTNAME },
});

export function correlationId(
  req: { headers: Record<string, string | string[] | undefined> }
): string {
  const val = req.headers["x-correlation-id"];
  const id = Array.isArray(val) ? val[0] : val;
  return id || crypto.randomUUID();
}
