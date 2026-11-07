import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { z } from "zod";

export const propertyQuerySchema = z.object({
  destination: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  adults: z.coerce.number().int().positive().optional(),
  children: z.coerce.number().int().nonnegative().optional(),
  rooms: z.coerce.number().int().positive().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  type: z.string().optional(),
  stars: z.string().optional(),
  amenities: z.string().optional(),
  rating: z.coerce.number().nonnegative().optional(),
  sort: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function searchProperties(params: any) {
  const validated = propertyQuerySchema.parse(params);
  const {
    destination, minPrice, maxPrice, type, stars, sort, page, limit,
  } = validated;

  const skip = (page - 1) * limit;
  const where: any = {
    status: "APPROVED",
    isClosed: false,
  };

  if (destination) {
    where.OR = [
      { city: { contains: destination, mode: "insensitive" } },
      { name: { contains: destination, mode: "insensitive" } },
    ];
  }
  if (type) where.type = type;
  if (stars) where.starRating = { gte: parseInt(stars) };

  const [properties, total] = await prisma.$transaction([
    prisma.property.findMany({
      where,
      include: {
        images: { take: 5, orderBy: { sortOrder: "asc" } },
      },
      skip,
      take: limit,
      orderBy: sort === "priceAsc" ? { starRating: "asc" }
        : sort === "priceDesc" ? { starRating: "desc" }
        : sort === "ratingDesc" ? { starRating: "desc" }
        : { createdAt: "desc" },
    }),
    prisma.property.count({ where }),
  ]);

  return {
    data: properties.map((p: any) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      type: p.type,
      city: p.city,
      starRating: p.starRating,
      images: p.images.map((img: any) => img.url),
    })),
    meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getPropertyBySlug(slug: string) {
  const property = await prisma.property.findUnique({
    where: { slug },
    include: {
      rooms: true,
      images: { orderBy: { sortOrder: "asc" } },
      amenities: true,
      reviews: { where: { status: "VISIBLE" }, take: 10 },
    },
  });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND", 404);
  return property;
}

export async function createProperty(data: any, ownerId: string) {
  return prisma.property.create({
    data: { ...data, ownerId, status: "PENDING" },
  });
}

export async function getOwnerProperties(ownerId: string) {
  return prisma.property.findMany({ where: { ownerId } });
}

export async function updateProperty(id: string, data: any, ownerId: string) {
  const property = await prisma.property.findFirst({ where: { id, ownerId } });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND_OR_NO_ACCESS", 404);
  return prisma.property.update({ where: { id }, data });
}

export async function deleteProperty(id: string, ownerId: string) {
  const property = await prisma.property.findFirst({ where: { id, ownerId } });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND_OR_NO_ACCESS", 404);
  return prisma.property.delete({ where: { id } });
}
