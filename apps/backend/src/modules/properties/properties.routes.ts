import { Router, Request, Response } from "express";
import {
  searchHandler,
  detailHandler,
  createHandler,
  updateHandler,
  deleteHandler,
  ownerListHandler,
} from "./property.controller";

const router: Router = Router();

router.get("/search", searchHandler);
router.get("/featured", asyncHandlerWrap(async (_req: Request, res: Response) => {
  res.json({ success: true, data: [] });
}));
router.get("/:slug", detailHandler);
router.post("/", createHandler);
router.patch("/:id", updateHandler);
router.delete("/:id", deleteHandler);
router.get("/owner/list", ownerListHandler);
router.get("/health", (_req: Request, res: Response) => {
  res.json({ success: true, data: { module: "properties", status: "active" } });
});

function asyncHandlerWrap(fn: Function) {
  return (req: Request, res: Response) => Promise.resolve(fn(req, res)).catch(() => {});
}

export default router;
