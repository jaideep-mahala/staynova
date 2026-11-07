import { Request, Response } from "express";
import { z } from "zod";
import {
  searchProperties,
  getPropertyBySlug,
  createProperty,
  updateProperty,
  deleteProperty,
  getOwnerProperties,
} from "./property.service";
import { asyncHandler } from "../../middlewares/error-handler/errorHandler";

const slugParamSchema = z.object({ slug: z.string().min(1) });
const idParamSchema = z.object({ id: z.string().min(1) });

export const searchHandler = asyncHandler(async (req: Request, res: Response) => {
  const result = await searchProperties(req.query);
  res.json({ success: true, data: result });
});

export const detailHandler = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = slugParamSchema.parse(req.params);
  const result = await getPropertyBySlug(slug);
  res.json({ success: true, data: result });
});

export const createHandler = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).user?.userId;
  const result = await createProperty(req.body, ownerId);
  res.status(201).json({ success: true, data: result });
});

export const updateHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const ownerId = (req as any).user?.userId;
  const result = await updateProperty(id, req.body, ownerId);
  res.json({ success: true, data: result });
});

export const deleteHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = idParamSchema.parse(req.params);
  const ownerId = (req as any).user?.userId;
  await deleteProperty(id, ownerId);
  res.json({ success: true, data: { message: "Property deleted" } });
});

export const ownerListHandler = asyncHandler(async (req: Request, res: Response) => {
  const ownerId = (req as any).user?.userId;
  const result = await getOwnerProperties(ownerId);
  res.json({ success: true, data: result });
});
