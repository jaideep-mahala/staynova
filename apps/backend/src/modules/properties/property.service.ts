import { prisma } from "@repo/db";
import { AppError } from "../../middlewares/error-handler/errorHandler";
import { z } from "zod";
import { getRedis } from "../../lib/redis";
import { logger } from "../../lib/logger";
import { MAX_ROOMS, MAX_STAY_NIGHTS } from "@repo/shared";
import { nightsBetween } from "../pricing/pricing.service";

export const propertyQuerySchema = z.object({
  destination: z.string().optional(),
  checkIn: z.string().optional(),
  checkOut: z.string().optional(),
  adults: z.coerce.number().int().min(0).optional(),
  children: z.coerce.number().int().min(0).optional(),
  rooms: z.coerce.number().int().min(1).max(MAX_ROOMS).optional(),
  minPrice: z.coerce.number().nonnegative().optional(), // rupees in query
  maxPrice: z.coerce.number().nonnegative().optional(),
  type: z.string().optional(),
  stars: z.string().optional(),
  amenities: z.string().optional(),
  rating: z.coerce.number().nonnegative().optional(),
  freeCancellation: z.string().optional(),
  breakfast: z.string().optional(),
  sort: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

function parseStay(checkIn?: string, checkOut?: string): { start: Date; end: Date; nights: number } | null {
  if (!checkIn || !checkOut) return null;
  const start = new Date(`${checkIn}T00:00:00`);
  const end = new Date(`${checkOut}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  const nights = nightsBetween(start, end);
  if (nights < 1 || nights > MAX_STAY_NIGHTS) return null;
  return { start, end, nights };
}

/**
 * Spec 4.2 search availability algorithm.
 * Returns properties with >= 1 available room type, cheapest price per night.
 */
export async function searchProperties(params: unknown) {
  const v = propertyQuerySchema.parse(params);
  const { destination, minPrice, maxPrice, type, stars, sort, page, limit } = v;
  const adults = v.adults || 2;
  const children = v.children || 0;
  const rooms = v.rooms || 1;
  const guests = adults + children;

  const stay = parseStay(v.checkIn, v.checkOut);
  const cacheKey = `search:${JSON.stringify(v)}`;

  // 60s Redis cache (spec 4.2.7)
  const redis = getRedis();
  try {
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) {
    logger.warn({ err: e }, "redis cache read failed");
  }

  const skip = (page - 1) * limit;
  const where: any = {
    status: "APPROVED",
    isClosed: false,
    deletedAt: null,
  };

  if (destination) {
    where.OR = [
      { city: { contains: destination, mode: "insensitive" } },
      { name: { contains: destination, mode: "insensitive" } },
      { state: { contains: destination, mode: "insensitive" } },
    ];
  }
  if (type) {
    const types = type.split(",").map((t) => t.trim()).filter(Boolean);
    if (types.length) where.type = { in: types };
  }
  if (stars) {
    const starList = stars.split(",").map((s) => parseInt(s)).filter((n) => !Number.isNaN(n));
    if (starList.length) where.starRating = { in: starList };
  }
  if (v.amenities) {
    const list = v.amenities.split(",").map((a) => a.trim().toLowerCase()).filter(Boolean);
    if (list.length) where.amenities = { some: { amenity: { in: list } } };
  }
  if (v.freeCancellation === "true") where.cancellationPolicy = { in: ["FREE", "FLEXIBLE"] };
  if (v.rating) where.avgRating = { gte: v.rating };
  if (minPrice !== undefined || maxPrice !== undefined) {
    where.minPricePaise = {
      gte: minPrice !== undefined ? minPrice * 100 : undefined,
      lte: maxPrice !== undefined ? maxPrice * 100 : undefined,
    };
  }

  const [properties, total] = await prisma.$transaction([
    prisma.property.findMany({
      where,
      include: {
        images: { orderBy: { sortOrder: "asc" }, take: 5 },
        amenities: { take: 6 },
        rooms: { where: { isActive: true }, include: { rateRules: { where: { active: true } } } },
      },
      skip,
      take: limit,
    }),
    prisma.property.count({ where }),
  ]);

  const results = properties
    .map((p) => {
      // compute availability + cheapest starting price per room type
      const availableRoomTypes: Array<{
        id: string; name: string; basePricePaise: number; startingPricePaise: number | null;
        roomsAvailable: number; maxAdults: number; maxOccupancy: number; breakfastIncluded: boolean;
      }> = [];

      for (const rt of p.rooms) {
        if (!stay) {
          availableRoomTypes.push({
            id: rt.id, name: rt.name, basePricePaise: rt.basePricePaise,
            startingPricePaise: rt.basePricePaise, roomsAvailable: rt.totalRooms,
            maxAdults: rt.maxAdults, maxOccupancy: rt.maxOccupancy, breakfastIncluded: rt.breakfastIncluded,
          });
          continue;
        }
        // occupancy fit (spec 4.2.4): rooms must hold adults (per-room maxAdults) and total guests
        if (rooms * rt.maxAdults < adults || rooms * rt.maxOccupancy < guests) continue;

        availableRoomTypes.push({
          id: rt.id, name: rt.name, basePricePaise: rt.basePricePaise,
          startingPricePaise: rt.basePricePaise, roomsAvailable: rt.totalRooms,
          maxAdults: rt.maxAdults, maxOccupancy: rt.maxOccupancy, breakfastIncluded: rt.breakfastIncluded,
        });
      }

      return { p, availableRoomTypes };
    });

  // For stay searches, verify per-night availability in bulk
  let finalResults: Array<Record<string, unknown>> = [];
  if (!stay) {
    finalResults = results.map(({ p, availableRoomTypes }) => {
      const cheapest = availableRoomTypes.reduce((m, r) => Math.min(m, r.startingPricePaise ?? Infinity), Infinity);
      return mapPropertyCard(p, availableRoomTypes.length, Number.isFinite(cheapest) ? cheapest : null);
    });
  } else {
    // fetch inventory for all room types in one query
    const allRoomTypeIds = properties.flatMap((p) => p.rooms.map((rt) => rt.id));
    const invRows = allRoomTypeIds.length
      ? await prisma.inventory.findMany({
          where: { roomTypeId: { in: allRoomTypeIds }, date: { gte: stay.start, lt: stay.end } },
          select: { roomTypeId: true, date: true, totalRooms: true, bookedRooms: true, heldRooms: true, isClosed: true, pricePaise: true, minStayNights: true },
        })
      : [];

    const invByRoomType = new Map<string, typeof invRows>();
    for (const row of invRows) {
      const key = row.roomTypeId;
      if (!invByRoomType.has(key)) invByRoomType.set(key, []);
      invByRoomType.get(key)!.push(row);
    }

    finalResults = [];
    for (const { p, availableRoomTypes } of results) {
      const available: Array<{ id: string; name: string; startingPricePaise: number | null; roomsAvailable: number; maxAdults: number; maxOccupancy: number; breakfastIncluded: boolean }> = [];
      let availableCount = 0;
      let cheapest: number | null = null;

      for (const art of availableRoomTypes) {
        const rows = invByRoomType.get(art.id) || [];
        if (rows.length < stay.nights) continue;
        let minAvail = Infinity;
        let nightlySum = 0;
        let ok = true;
        for (const row of rows) {
          if (row.isClosed) { ok = false; break; }
          const avail = row.totalRooms - row.bookedRooms - row.heldRooms;
          if (avail < rooms) { ok = false; break; }
          if (row.minStayNights && row.minStayNights > stay.nights) { ok = false; break; }
          minAvail = Math.min(minAvail, avail);
          nightlySum += row.pricePaise ?? art.basePricePaise;
        }
        if (!ok) continue;
        const avgPerNight = Math.round(nightlySum / rows.length);
        availableCount += 1;
        if (cheapest === null || avgPerNight < cheapest) cheapest = avgPerNight;
        available.push({ ...art, startingPricePaise: avgPerNight, roomsAvailable: minAvail });
      }

      if (availableCount === 0) continue; // spec 4.2.6: only properties with >=1 available room type
      finalResults.push(mapPropertyCard(p, availableCount, cheapest));
    }
  }

  // sorting
  if (sort === "priceAsc") finalResults.sort((a, b) => ((a.startingPricePaise as number) ?? Infinity) - ((b.startingPricePaise as number) ?? Infinity));
  else if (sort === "priceDesc") finalResults.sort((a, b) => ((b.startingPricePaise as number) ?? 0) - ((a.startingPricePaise as number) ?? 0));
  else if (sort === "ratingDesc") finalResults.sort((a, b) => ((b.rating as number) ?? 0) - ((a.rating as number) ?? 0));
  else if (sort === "popularity") finalResults.sort((a, b) => ((b.reviewCount as number) ?? 0) - ((a.reviewCount as number) ?? 0));

  const response = {
    data: finalResults,
    meta: { page, limit, total: finalResults.length ? total : 0, totalPages: Math.ceil(total / limit) },
  };

  try {
    await redis.set(cacheKey, JSON.stringify(response), { EX: 60 });
  } catch (e) {
    logger.warn({ err: e }, "redis cache write failed");
  }
  return response;
}

function mapPropertyCard(p: any, availableRoomTypes: number, startingPricePaise: number | null) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    type: p.type,
    city: p.city,
    state: p.state,
    starRating: p.starRating,
    rating: p.avgRating,
    reviewCount: p.reviewCount,
    minPricePaise: p.minPricePaise,
    cancellationPolicy: p.cancellationPolicy,
    latitude: p.latitude,
    longitude: p.longitude,
    images: (p.images || []).map((img: any) => img.url),
    amenities: (p.amenities || []).map((a: any) => a.amenity),
    availableRoomTypes,
    startingPricePaise,
  };
}

export async function suggest(q: string) {
  const term = q.trim();
  if (!term) return { cities: [], properties: [] };
  const [cities, properties] = await Promise.all([
    prisma.property.groupBy({
      by: ["city"],
      where: { status: "APPROVED", deletedAt: null, city: { contains: term, mode: "insensitive" } },
      _count: { city: true },
      orderBy: { _count: { city: "desc" } },
      take: 5,
    }),
    prisma.property.findMany({
      where: { status: "APPROVED", deletedAt: null, name: { contains: term, mode: "insensitive" } },
      select: { name: true, slug: true, city: true, type: true, minPricePaise: true },
      take: 5,
    }),
  ]);
  return {
    cities: cities.map((c) => ({ city: c.city, propertyCount: c._count.city })),
    properties,
  };
}

export async function popularDestinations() {
  const groups = await prisma.property.groupBy({
    by: ["city"],
    where: { status: "APPROVED", deletedAt: null },
    _count: { city: true },
    _min: { minPricePaise: true },
    orderBy: { _count: { city: "desc" } },
    take: 8,
  });
  const images = await prisma.propertyImage.findMany({
    where: { property: { city: { in: groups.map((g) => g.city) }, status: "APPROVED" }, isCover: true },
    include: { property: { select: { city: true } } },
  });
  const imgByCity = new Map(images.map((i) => [i.property.city, i.url]));
  return groups.map((g) => ({
    city: g.city,
    propertyCount: g._count.city,
    startingPricePaise: g._min.minPricePaise,
    image: imgByCity.get(g.city) || null,
  }));
}

export async function featuredProperties(limit = 8) {
  const props = await prisma.property.findMany({
    where: { status: "APPROVED", deletedAt: null },
    orderBy: [{ avgRating: "desc" }, { reviewCount: "desc" }],
    take: limit,
    include: { images: { orderBy: { sortOrder: "asc" }, take: 3 }, amenities: { take: 4 } },
  });
  return props.map((p) => mapPropertyCard(p, 1, p.minPricePaise));
}

export async function listAmenities() {
  const amenities = await prisma.propertyAmenity.groupBy({ by: ["amenity"], _count: { amenity: true }, orderBy: { _count: { amenity: "desc" } }, take: 40 });
  return amenities.map((a) => ({ name: a.amenity, count: a._count.amenity }));
}

export async function getPropertyDetail(slugOrId: string, stay?: { checkIn?: string; checkOut?: string; adults?: string; children?: string; rooms?: string }) {
  const isUuid = /^[0-9a-fA-F-]{36}$/.test(slugOrId);
  const property = await prisma.property.findFirst({
    where: isUuid ? { id: slugOrId } : { slug: slugOrId },
    include: {
      rooms: {
        where: { isActive: true },
        include: { rateRules: { where: { active: true } }, images: { orderBy: { sortOrder: "asc" } } },
      },
      images: { orderBy: { sortOrder: "asc" } },
      amenities: true,
    },
  });
  if (!property || property.deletedAt) throw new AppError("PROPERTY_NOT_FOUND", 404);

  const reviews = await prisma.review.findMany({
    where: { propertyId: property.id, status: "VISIBLE" },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { user: { select: { name: true } } },
  });

  let roomAvailability: Array<Record<string, unknown>> | null = null;
  const stayParsed = stay?.checkIn && stay?.checkOut ? parseStay(stay.checkIn, stay.checkOut) : null;
  if (stayParsed) {
    const rooms = stayParsed.nights;
    const adults = Number(stay?.adults || 2);
    const children = Number(stay?.children || 0);
    const roomsReq = Number(stay?.rooms || 1);
    const guests = adults + children;
    roomAvailability = [];
    for (const rt of property.rooms) {
      if (roomsReq * rt.maxAdults < adults || roomsReq * rt.maxOccupancy < guests) {
        roomAvailability.push({ roomTypeId: rt.id, available: false, reason: "OCCUPANCY" });
        continue;
      }
      const rows = await prisma.inventory.findMany({
        where: { roomTypeId: rt.id, date: { gte: stayParsed.start, lt: stayParsed.end } },
      });
      if (rows.length < stayParsed.nights) {
        roomAvailability.push({ roomTypeId: rt.id, available: false, reason: "INVENTORY" });
        continue;
      }
      let ok = true;
      let nightlySum = 0;
      let roomsAvailable = Infinity;
      for (const row of rows) {
        if (row.isClosed || row.totalRooms - row.bookedRooms - row.heldRooms < roomsReq || (row.minStayNights && row.minStayNights > stayParsed.nights)) {
          ok = false;
          break;
        }
        roomsAvailable = Math.min(roomsAvailable, row.totalRooms - row.bookedRooms - row.heldRooms);
        nightlySum += row.pricePaise ?? rt.basePricePaise;
      }
      roomAvailability.push({
        roomTypeId: rt.id,
        name: rt.name,
        available: ok,
        roomsAvailable: ok ? roomsAvailable : 0,
        avgPricePaisePerNight: ok ? Math.round(nightlySum / rows.length) : null,
      });
    }
  }

  return { ...property, reviews, roomAvailability };
}

export async function getPropertyReviews(propertyId: string, opts: { page?: number; limit?: number; sort?: string }) {
  const property = await prisma.property.findFirst({ where: { OR: [{ id: propertyId }, { slug: propertyId }] }, select: { id: true } });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND", 404);
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(50, opts.limit || 10);
  const orderBy = opts.sort === "recent" ? { createdAt: "desc" as const } : { ratingOverall: "desc" as const };
  const [items, total] = await Promise.all([
    prisma.review.findMany({
      where: { propertyId: property.id, status: "VISIBLE" },
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { name: true } } },
    }),
    prisma.review.count({ where: { propertyId: property.id, status: "VISIBLE" } }),
  ]);
  return { items, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

function slugify(name: string): string {
  return `${name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60)}-${Math.random().toString(36).slice(2, 7)}`;
}

const createPropertySchema = z.object({
  name: z.string().min(3).max(120),
  type: z.enum(["HOTEL", "RESORT", "VILLA", "HOMESTAY", "HOSTEL", "APARTMENT", "BOUTIQUE", "HERITAGE"]),
  description: z.string().max(5000).optional(),
  starRating: z.number().int().min(1).max(5).optional(),
  addressLine: z.string().max(200).optional(),
  city: z.string().min(2).max(60),
  state: z.string().max(60).optional(),
  country: z.string().max(60).default("India"),
  pincode: z.string().max(10).optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  cancellationPolicy: z.enum(["FREE", "FLEXIBLE", "MODERATE", "STRICT", "NON_REFUNDABLE"]).default("FLEXIBLE"),
  houseRules: z.string().max(2000).optional(),
  gstNumber: z.string().max(20).optional(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).default("14:00"),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).default("11:00"),
  phone: z.string().max(15).optional(),
  email: z.string().email().optional(),
  amenities: z.array(z.string().max(40)).optional(),
});

export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export async function createProperty(data: CreatePropertyInput, ownerId: string) {
  const created = await prisma.property.create({
    data: {
      ownerId,
      name: data.name,
      slug: slugify(data.name),
      type: data.type,
      description: data.description,
      starRating: data.starRating,
      addressLine: data.addressLine,
      city: data.city,
      state: data.state,
      country: data.country,
      pincode: data.pincode,
      latitude: data.latitude,
      longitude: data.longitude,
      cancellationPolicy: data.cancellationPolicy,
      houseRules: data.houseRules,
      gstNumber: data.gstNumber,
      checkInTime: data.checkInTime,
      checkOutTime: data.checkOutTime,
      phone: data.phone,
      email: data.email,
      status: "PENDING",
      amenities: data.amenities ? { create: data.amenities.map((a) => ({ amenity: a.toLowerCase() })) } : undefined,
    },
    include: { amenities: true },
  });
  return created;
}

export async function getOwnerProperties(ownerId: string) {
  return prisma.property.findMany({
    where: { ownerId, deletedAt: null },
    include: {
      rooms: { select: { id: true, name: true, basePricePaise: true, totalRooms: true, isActive: true } },
      images: { orderBy: { sortOrder: "asc" } },
      _count: { select: { bookings: { where: { status: { in: ["CONFIRMED", "CHECKED_IN", "COMPLETED"] } } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

const updatePropertySchema = createPropertySchema.partial().omit({ name: true }).extend({
  name: z.string().min(3).max(120).optional(),
});

export async function updateProperty(id: string, ownerId: string, isAdmin: boolean, data: unknown) {
  const property = await prisma.property.findFirst({ where: { id, ...(isAdmin ? {} : { ownerId }) } });
  if (!property || property.deletedAt) throw new AppError("PROPERTY_NOT_FOUND_OR_NO_ACCESS", 404);
  const v = updatePropertySchema.parse(data);
  const updated = await prisma.property.update({
    where: { id },
    data: {
      ...v,
      type: v.type as never,
      cancellationPolicy: v.cancellationPolicy as never,
      status: undefined,
      amenities: v.amenities
        ? { deleteMany: {}, create: v.amenities.map((a) => ({ amenity: a.toLowerCase() })) }
        : undefined,
    },
  });
  return updated;
}

export async function deleteProperty(id: string, ownerId: string, isAdmin: boolean) {
  const property = await prisma.property.findFirst({ where: { id, ...(isAdmin ? {} : { ownerId }) } });
  if (!property) throw new AppError("PROPERTY_NOT_FOUND_OR_NO_ACCESS", 404);
  return prisma.property.update({ where: { id }, data: { deletedAt: new Date(), isClosed: true } });
}
