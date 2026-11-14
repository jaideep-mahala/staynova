import { Router, Request, Response } from "express";
import {
  searchHandler,
  suggestHandler,
  featuredHandler,
  destinationsHandler,
  amenitiesHandler,
  detailHandler,
  roomsHandler,
  reviewsHandler,
  createHandler,
  updateHandler,
  deleteHandler,
  ownerListHandler,
} from "./property.controller";
import { requireAuth, requireRole, optionalAuth } from "../../middlewares/auth/requireAuth";

const router: Router = Router();

// public (static paths before :slug)
router.get("/search", optionalAuth, searchHandler);
router.get("/suggest", suggestHandler);
router.get("/featured", featuredHandler);
router.get("/destinations/popular", destinationsHandler);
router.get("/amenities", amenitiesHandler);
router.get("/owner/list", requireAuth, requireRole("OWNER", "ADMIN"), ownerListHandler);

// owner CRUD (also used by admins)
router.post("/", requireAuth, requireRole("OWNER", "ADMIN"), createHandler);
router.patch("/:id", requireAuth, requireRole("OWNER", "ADMIN"), updateHandler);
router.delete("/:id", requireAuth, requireRole("OWNER", "ADMIN"), deleteHandler);

// public param routes last
router.get("/:slug/rooms", roomsHandler);
router.get("/:slug/reviews", reviewsHandler);
router.get("/:slug", optionalAuth, detailHandler);

export default router;
