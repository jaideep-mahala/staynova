import bcrypt from "bcryptjs";
import { prisma } from "./index";

const CITIES = ["Jaipur", "Goa", "Mumbai", "Delhi", "Bengaluru", "Udaipur", "Manali", "Kerala"];
const PROPERTY_TYPES = [
  "HOTEL", "RESORT", "VILLA", "HOMESTAY", "HOSTEL", "APARTMENT", "BOUTIQUE", "HERITAGE",
] as const;
const POLICIES = ["FREE", "FLEXIBLE", "MODERATE", "STRICT", "NON_REFUNDABLE"] as const;
const AMENITIES = [
  "Wi-Fi", "Pool", "Spa", "Breakfast", "Parking", "Gym", "AC", "Room Service",
  "Laundry", "Bar", "Restaurant", "Concierge", "Pet Friendly", "Airport Transfer",
];
const COUPONS = [
  { code: "WELCOME10", type: "PERCENT" as const, value: 10, maxDiscountPaise: 200000, minBookingPaise: 200000, description: "10% off on your first booking" },
  { code: "FLAT500", type: "FLAT" as const, value: 50000, maxDiscountPaise: undefined, minBookingPaise: 300000, description: "₹500 flat off" },
  { code: "SUMMER15", type: "PERCENT" as const, value: 15, maxDiscountPaise: 300000, minBookingPaise: 400000, description: "15% off summer stays" },
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

async function main() {
  console.log("🌱 Seeding StayNova...");

  // Admin
  const admin = await prisma.user.upsert({
    where: { email: "admin@staynova.com" },
    update: {},
    create: {
      name: "Platform Admin",
      email: "admin@staynova.com",
      passwordHash: await bcrypt.hash("Admin@123", 12),
      role: "ADMIN",
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });

  // Owners
  const ownerHash = await bcrypt.hash("Owner@123", 12);
  const owners = await Promise.all(
    ["owner1@staynova.com", "owner2@staynova.com"].map((email, i) =>
      prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          name: `Property Owner ${i + 1}`,
          email,
          passwordHash: ownerHash,
          role: "OWNER",
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      })
    )
  );

  // Users (guests)
  const guestHash = await bcrypt.hash("Guest@123", 12);
  const users = await Promise.all(
    ["guest1@staynova.com", "guest2@staynova.com"].map((email, i) =>
      prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          name: `Guest ${i + 1}`,
          email,
          passwordHash: guestHash,
          role: "USER",
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      })
    )
  );

  const now = new Date();
  const baseDate = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

  for (let i = 0; i < 30; i++) {
    const city = pick(CITIES);
    const type = pick(PROPERTY_TYPES);
    const owner = pick(owners);
    const starRating = randInt(3, 5);
    const basePrice = randInt(3000, 15000) * 100; // paise

    const property = await prisma.property.create({
      data: {
        ownerId: owner.id,
        name: `${city} ${type.charAt(0) + type.slice(1).toLowerCase()} Stay ${i + 1}`,
        slug: `${city.toLowerCase()}-${type.toLowerCase()}-stay-${i + 1}`,
        type,
        description: `A wonderful ${type.toLowerCase()} stay in the heart of ${city}.`,
        starRating,
        addressLine: `${randInt(1, 999)} Main Road`,
        city,
        state: "India",
        country: "India",
        pincode: String(randInt(100000, 999999)),
        latitude: undefined,
        longitude: undefined,
        cancellationPolicy: pick(POLICIES),
        status: "APPROVED",
        isClosed: false,
        minOccupancy: 2,
        extraAdultPricePaise: 100000,
        extraChildPricePaise: 50000,
        sameDayCutoffHour: 18,
      },
    });

    // Amenities
    await Promise.all(
      AMENITIES.slice(0, randInt(4, 8)).map((a) =>
        prisma.propertyAmenity.create({ data: { propertyId: property.id, amenity: a } })
      )
    );

    // Room types (1-3 per property)
    const roomTypeCount = randInt(1, 3);
    for (let j = 0; j < roomTypeCount; j++) {
      const roomType = await prisma.roomType.create({
        data: {
          propertyId: property.id,
          name: ["Deluxe Room", "Executive Suite", "Family Room", "Standard Room", "Premium Suite"][j % 5],
          description: "Comfortable stay with modern amenities.",
          basePricePaise: basePrice + j * 200000,
          totalRooms: randInt(3, 12),
          maxAdults: 2,
          maxChildren: 2,
          maxOccupancy: 4,
          baseOccupancy: 2,
          sizeSqFt: randInt(200, 500),
          bedType: j % 2 === 0 ? "King" : "Twin",
          isActive: true,
        },
      });

      // Inventory for 365 days ahead (bulk insert for speed)
      const inventoryRows = [];
      for (let d = 0; d < 365; d++) {
        const date = new Date(baseDate);
        date.setUTCDate(date.getUTCDate() + d);
        inventoryRows.push({
          roomTypeId: roomType.id,
          date,
          totalRooms: roomType.totalRooms,
          bookedRooms: 0,
          heldRooms: 0,
          pricePaise: basePrice + j * 200000,
          isClosed: false,
          minStayNights: 1,
        });
      }
      await prisma.inventory.createMany({ data: inventoryRows, skipDuplicates: true });

      // Rate rules
      await prisma.rateRule.create({
        data: {
          roomTypeId: roomType.id,
          name: "Weekend surcharge",
          type: "WEEKEND",
          daysOfWeek: [5, 6],
          adjustmentType: "PERCENT",
          adjustmentValue: 15,
          priority: 10,
          active: true,
        },
      });
    }

    // Images
    await Promise.all(
      Array.from({ length: 5 }).map((_, k) =>
        prisma.propertyImage.create({
          data: {
            propertyId: property.id,
            url: `https://images.unsplash.com/photo-${1500000000000 + i * 10 + k}?w=800&q=80`,
            alt: `${property.name} image ${k + 1}`,
            sortOrder: k,
          },
        })
      )
    );
  }

  // Global coupons (spec §6 seed: WELCOME10, FLAT500, SUMMER15) + per-property variants
  await Promise.all(
    COUPONS.map((c) =>
      prisma.coupon.upsert({
        where: { code: c.code },
        update: { active: true },
        create: {
          propertyId: null, // platform-wide coupon
          code: c.code,
          description: c.description,
          type: c.type,
          value: c.value,
          maxDiscountPaise: c.maxDiscountPaise ?? null,
          minBookingPaise: c.minBookingPaise,
          validFrom: now,
          validTo: new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()),
          usageLimit: 10000,
          perUserLimit: 5,
          usedCount: 0,
          applicablePropertyIds: [], // all properties
          active: true,
        },
      })
    )
  );

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
