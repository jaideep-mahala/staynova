import { Request, Response } from "express";
import {
  searchProperties,
  suggest,
  featuredProperties,
  popularDestinations,
  listAmenities,
  getPropertyDetail,
  getPropertyReviews,
  createProperty,
  updateProperty,
  deleteProperty,
  getOwnerProperties,
} from "./property.service";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";

export const searchHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await searchProperties(req.query);
  res.json({ success: true, data: result.data, meta: result.meta });
});

export const suggestHandler = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q || "");
  res.json({ success: true, data: await suggest(q) });
});

export const featuredHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: await featuredProperties() });
});

export const destinationsHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: await popularDestinations() });
});

export const amenitiesHandler = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, data: await listAmenities() });
});

export const detailHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await getPropertyDetail(req.params.slug!, req.query as never);
  res.json({ success: true, data: result });
});

export const roomsHandler = asyncHandler(async (req: Request, res: Response) => {
  const detail = await getPropertyDetail(req.params.slug!, req.query as never);
  res.json({ success: true, data: { rooms: detail.rooms, roomAvailability: detail.roomAvailability } });
});

export const reviewsHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await getPropertyReviews(req.params.slug!, req.query as never);
  res.json({ success: true, data: result.items, meta: result.meta });
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await createProperty(req.body, req.user!.userId);
  res.status(201).json({ success: true, data: result });
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await updateProperty(req.params.id!, req.user!.userId, req.user!.role === "ADMIN", req.body);
  res.json({ success: true, data: result });
});

export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  await deleteProperty(req.params.id!, req.user!.userId, req.user!.role === "ADMIN");
  res.json({ success: true, data: { message: "Property deleted" } });
});

export const ownerListHandler = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = req.user!.role === "ADMIN" && req.query.ownerId ? String(req.query.ownerId) : req.user!.userId;
  res.json({ success: true, data: await getOwnerProperties(ownerId) });
});
