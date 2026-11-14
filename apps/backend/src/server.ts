import "dotenv/config";
import app from "./app";
import { logger } from "./lib/logger";
import { prisma } from "@repo/db";

const PORT = Number(process.env.PORT) || 5000;

const startServer = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.info("Database connected");

    // start BullMQ workers + cron schedulers unless explicitly disabled
    if (process.env.DISABLE_WORKERS !== "true") {
      const { startAllJobs } = await import("./jobs");
      await startAllJobs().catch((e) => logger.warn({ err: e }, "jobs failed to start (redis down?)"));
    }

    app.listen(PORT, () => {
      logger.info(`StayNova API running on http://localhost:${PORT}`);
      logger.info(`Environment: ${process.env.NODE_ENV || "development"}`);
    });
  } catch (err) {
    logger.error("Failed to start server", err);
    process.exit(1);
  }
};

startServer();
