# StayNova — Complete Build Specification
### Full-stack hotel booking platform (frontend + backend + database + payments)

> **Instructions to the AI agent:** Implement this project exactly as specified. Work phase by phase (Section 17). After every phase, run the app, run tests, and fix errors before moving on. Do not skip sections. Where something is ambiguous, choose the simplest production-quality option and write the decision in `DECISIONS.md`. Never hardcode secrets; use environment variables. Create a `README.md` with setup steps.

---

## 1. Product Overview

**Name:** StayNova (tagline: *"Find your next stay."*)
**What it is:** An online marketplace where travellers search, compare and book any kind of stay (hotels, resorts, villas, homestays, hostels, apartments, boutique/heritage properties) and where hotel owners list properties, manage rooms, rates, availability and bookings. Admins moderate the platform.
**Reference platforms for UX/flows:** Booking.com, MakeMyTrip, Agoda, Airbnb, OYO, Goibibo.
**Primary market:** India (INR, GST, Razorpay, UPI) with multi-currency readiness.

### User roles
| Role | Capabilities |
|---|---|
| **Guest (anonymous)** | Browse, search, view hotels, view reviews. Must log in to book. |
| **User (customer)** | Everything above + book, pay, cancel, review, wishlist, manage profile. |
| **Hotel Owner / Manager** | Create/manage own properties, room types, rates, inventory, view/handle bookings, reply to reviews, see earnings. |
| **Admin** | Approve properties, manage users, bookings, refunds, coupons, content, platform analytics. |

---

## 2. Tech Stack (use exactly this)

**Frontend**
- Next.js 14+ (App Router) with TypeScript
- Tailwind CSS + shadcn/ui + lucide-react icons
- React Hook Form + Zod (form validation)
- TanStack Query (server state), Zustand (light client state)
- date-fns, react-day-picker (date range picker)
- Leaflet + OpenStreetMap (maps; no paid key needed)
- next-seo, next/image for performance

**Backend**
- Node.js 20 + Express (or NestJS) with TypeScript
- Prisma ORM + PostgreSQL 15
- Redis (caching, seat/room holds, rate limiting, queues)
- BullMQ (background jobs: emails, hold expiry, payout reports)
- JWT (access token 15 min) + refresh token (httpOnly cookie, 30 days, rotated)
- bcrypt (cost 12), Zod request validation, helmet, cors, express-rate-limit
- Nodemailer (SMTP) or Resend for email; Twilio/MSG91 for SMS OTP (optional)
- Cloudinary or S3-compatible storage for images
- Swagger/OpenAPI docs at `/api/docs`

**Payments**
- Razorpay (primary, INR, UPI/cards/netbanking/wallets)
- Stripe (secondary, international cards) — behind a `PaymentProvider` interface so providers are swappable

**DevOps**
- Docker + docker-compose (api, web, postgres, redis)
- GitHub Actions CI (lint, typecheck, test, build)
- `.env.example` for both apps
- Monorepo layout:

```
staynova/
  apps/
    frontend/       # Next.js (App Router)
      src/
        app/        # (public), (auth), account, owner, admin
        components/ # search, property, booking, owner, admin
        lib/        # API client, auth helpers
        hooks/
        stores/
        middleware.ts # Route protection by role
    backend/        # Express + TypeScript API
      src/
        modules/    # auth, users, properties, rooms, inventory, pricing, bookings, payments, reviews, coupons, notifications, owner, admin
        middlewares/ # auth, RBAC, rate-limit, error handler
        jobs/       # BullMQ: expireHold, sweeper, emails, voucher
        lib/        # Redis, mailer, storage, logger, payment providers
        app.ts
        server.ts
  packages/
    db/             # Prisma schema, migrations, seed, exported client
    shared/         # Shared Zod schemas, types, enums, constants
    ui/             # Shared shadcn/ui components
    eslint-config/
    typescript-config/
  docker-compose.yml # Postgres + Redis (+ API and web later)
  .env.example
  .github/workflows/ci.yml
  docs/             # erd.md, booking-flow.md
  staynova_spec.md
  turbo.json
  package.json
```

---

## 3. Database Design (PostgreSQL via Prisma)

Use UUID primary keys, `createdAt`/`updatedAt` on all tables, soft delete (`deletedAt`) where noted. Money is stored as **integers in paise (smallest unit)** with a `currency` column — never floats.

### 3.1 Tables

**users**
`id, name, email (unique), phone, passwordHash, role (USER|OWNER|ADMIN), avatarUrl, emailVerifiedAt, phoneVerifiedAt, googleId, status (ACTIVE|BLOCKED), lastLoginAt, deletedAt`

**refresh_tokens**
`id, userId, tokenHash, userAgent, ip, expiresAt, revokedAt`

**password_resets / email_verifications**
`id, userId, tokenHash, expiresAt, usedAt`

**properties** (a hotel/villa/etc.)
`id, ownerId, name, slug (unique), type (HOTEL|RESORT|VILLA|HOMESTAY|HOSTEL|APARTMENT|BOUTIQUE|HERITAGE), description, starRating (1–5), addressLine, city, state, country, pincode, latitude, longitude, checkInTime, checkOutTime, phone, email, status (DRAFT|PENDING|APPROVED|REJECTED|SUSPENDED), rejectionReason, avgRating, reviewCount, minPricePaise (denormalised for fast sort), policyCancellationType (FREE|FLEXIBLE|MODERATE|STRICT|NON_REFUNDABLE), houseRules, gstNumber, deletedAt`

**property_images**
`id, propertyId, url, caption, sortOrder, isCover`

**amenities** (master list)
`id, name, icon, category (GENERAL|ROOM|BATHROOM|FOOD|WELLNESS|BUSINESS|SAFETY|ACCESSIBILITY)`
**property_amenities** `propertyId, amenityId`

**room_types**
`id, propertyId, name (e.g. Deluxe King), description, maxAdults, maxChildren, maxOccupancy, bedType, bedCount, sizeSqft, totalRooms (physical count), basePricePaise, extraAdultPricePaise, extraChildPricePaise, refundable (bool), breakfastIncluded (bool), deletedAt`
**room_type_images** `id, roomTypeId, url, sortOrder`
**room_type_amenities** `roomTypeId, amenityId`

**inventory** (per room type, per date — the heart of booking logic)
`id, roomTypeId, date (DATE), totalRooms, bookedRooms, heldRooms, pricePaise (override, nullable), minStayNights (nullable), isClosed (bool)`
Unique `(roomTypeId, date)`. Available = `totalRooms - bookedRooms - heldRooms` (and `isClosed = false`).

**rate_rules** (dynamic pricing)
`id, roomTypeId, name, type (WEEKEND|SEASONAL|LAST_MINUTE|EARLY_BIRD|LONG_STAY), startDate, endDate, daysOfWeek[], adjustmentType (PERCENT|FLAT), adjustmentValue, priority, active`

**bookings**
`id, bookingRef (human code e.g. SN-8F3K29), userId, propertyId, status, checkIn (DATE), checkOut (DATE), nights, adults, children, roomsCount, guestName, guestEmail, guestPhone, specialRequests, subtotalPaise, taxPaise, discountPaise, serviceFeePaise, totalPaise, currency, couponId, paymentStatus (PENDING|PAID|PARTIALLY_REFUNDED|REFUNDED|FAILED), cancellationPolicySnapshot (JSON), holdExpiresAt, cancelledAt, cancelledBy, cancellationReason, refundAmountPaise, idempotencyKey (unique)`

**Booking status enum:** `HOLD → PENDING_PAYMENT → CONFIRMED → CHECKED_IN → COMPLETED` and branches `CANCELLED`, `EXPIRED`, `NO_SHOW`, `FAILED`.

**booking_items** (one row per room type per booking)
`id, bookingId, roomTypeId, quantity, pricePerNightSnapshot JSON (array of {date, pricePaise}), subtotalPaise`

**booking_guests** `id, bookingId, name, age, isPrimary`

**payments**
`id, bookingId, provider (RAZORPAY|STRIPE), providerOrderId, providerPaymentId, amountPaise, currency, status (CREATED|AUTHORIZED|CAPTURED|FAILED|REFUNDED), method, failureReason, rawPayload JSON, capturedAt`

**refunds**
`id, paymentId, bookingId, amountPaise, status (PENDING|PROCESSED|FAILED), providerRefundId, reason`

**coupons**
`id, code (unique), description, type (PERCENT|FLAT), value, maxDiscountPaise, minBookingPaise, validFrom, validTo, usageLimit, perUserLimit, usedCount, applicablePropertyIds[], active`
**coupon_redemptions** `id, couponId, userId, bookingId`

**reviews**
`id, bookingId (unique), userId, propertyId, ratingOverall, ratingCleanliness, ratingLocation, ratingService, ratingValue, title, comment, ownerReply, status (VISIBLE|HIDDEN|FLAGGED)`
Only users with a COMPLETED booking may review.

**wishlists** `id, userId, propertyId` (unique pair)

**notifications** `id, userId, type, title, body, readAt, data JSON`

**audit_logs** `id, actorId, action, entity, entityId, meta JSON, ip`

**Indexes:** `properties(city, status)`, `properties(slug)`, full-text GIN index on `properties(name, city, description)`, `inventory(roomTypeId, date)`, `bookings(userId, status)`, `bookings(propertyId, checkIn, checkOut)`, `bookings(holdExpiresAt) WHERE status='HOLD'`.

---

## 4. Core Booking Logic (read carefully — most important section)

### 4.1 Concepts
- A **room type** has N physical rooms. Availability is tracked **per night** in the `inventory` table.
- A stay of `checkIn` → `checkOut` occupies nights `[checkIn, checkOut)`. Check-out day is **not** a booked night. (Nights = checkOut − checkIn.)
- Owner sets `totalRooms` per date (default from `room_types.totalRooms`); inventory rows are generated for the next 365 days by a nightly cron job and on room-type creation.

### 4.2 Search availability algorithm
Input: `city/destination, checkIn, checkOut, adults, children, rooms`.
1. Validate: `checkIn >= today`, `checkOut > checkIn`, max stay 30 nights, max 9 rooms.
2. Find properties (APPROVED, not deleted) matching destination (city / name / landmark via full-text + trigram).
3. For each property, for each room type: the room type is **available for N rooms** if for **every night** in range: `isClosed = false AND (totalRooms − bookedRooms − heldRooms) >= roomsRequested` AND `minStayNights <= nights` (when set).
4. Check occupancy: `roomsRequested * maxAdults >= adults` and total guests fit `maxOccupancy`. If guests don't fit in requested rooms, suggest more rooms.
5. Compute the price for the cheapest available room type → `startingPricePaise` per night (average across nights).
6. Return only properties with ≥1 available room type. Include `availableRoomTypes` count.
7. Cache search results in Redis for 60 seconds, keyed by normalised params.

### 4.3 Price calculation (single source of truth: `PricingService`)
For each night `d` and room type:
```
nightly = inventory.pricePaise ?? roomType.basePricePaise
apply rate_rules sorted by priority:
    WEEKEND  (Fri/Sat nights by default)
    SEASONAL (date range)
    LAST_MINUTE (check-in within X days) — discount
    EARLY_BIRD (booked Y days ahead) — discount
    LONG_STAY (nights >= Z) — discount
extra guests: if adults > roomsRequested * baseOccupancy(2):
    add extraAdultPricePaise per extra adult per night (children similarly)
roomSubtotal = Σ nightly * roomsCount
```
Then:
```
discount     = coupon discount (validated, capped by maxDiscountPaise)
taxable      = roomSubtotal − discount
GST          = India rule (per room per night tariff, after discount):
                 ≤ ₹1,000 → 0% ; ₹1,001–₹7,500 → 12% ; > ₹7,500 → 18%
serviceFee   = 2% of taxable (configurable, min ₹0)
total        = taxable + GST + serviceFee
```
Round each money step to integer paise using banker-safe rounding (`Math.round`). Return a full **price breakdown** object (per-night prices, discount, tax, fee, total) to the UI. **The server always recomputes price at booking time — never trust client-sent totals.**

### 4.4 Booking creation flow (state machine with inventory hold)

```
1. User selects room(s) → clicks "Reserve"
2. POST /bookings  (Idempotency-Key header required)
3. Server, inside ONE DB TRANSACTION:
     a. Re-validate inputs & recompute price.
     b. Lock inventory rows:  SELECT ... FROM inventory
          WHERE roomTypeId = $1 AND date >= checkIn AND date < checkOut
          ORDER BY date FOR UPDATE
     c. Verify availability for every night (same rule as 4.2).
        If any night fails → rollback, return 409 ROOM_UNAVAILABLE
        with a message and alternative room types/dates.
     d. UPDATE inventory SET heldRooms = heldRooms + qty  (every night)
     e. INSERT booking (status=HOLD, holdExpiresAt = now + 15 minutes,
        snapshots of price & cancellation policy) + booking_items + guests.
     f. Commit.
4. Server schedules a BullMQ delayed job "expireHold" at holdExpiresAt.
5. Response: bookingId, price breakdown, holdExpiresAt.
6. Frontend shows checkout page with a 15:00 countdown timer.
```

**Payment step**
```
7. POST /payments/create-order {bookingId}
     - verify booking is HOLD and not expired, belongs to user
     - create provider order (Razorpay order for totalPaise)
     - insert payments row (CREATED); booking.status = PENDING_PAYMENT
8. Frontend opens Razorpay Checkout with orderId.
9. On success, frontend calls POST /payments/verify with
   {razorpay_order_id, razorpay_payment_id, razorpay_signature}
     - verify HMAC SHA256 signature on the server.
10. ALSO handle webhook POST /webhooks/razorpay (source of truth):
     - verify X-Razorpay-Signature using webhook secret
     - events: payment.captured, payment.failed, refund.processed
     - idempotent: ignore if payment already CAPTURED
11. On CAPTURE (in one transaction):
     - payments.status = CAPTURED; booking.status = CONFIRMED; paymentStatus = PAID
     - inventory: heldRooms -= qty; bookedRooms += qty (every night)
     - increment coupon usage
     - enqueue emails: confirmation to guest, new-booking alert to owner
     - create in-app notifications
     - generate PDF voucher/invoice (queue)
12. On FAILURE: booking stays PENDING_PAYMENT until hold expires; user may retry payment.
```

**Hold expiry job (`expireHold`) + safety cron every minute**
- Find bookings with `status IN (HOLD, PENDING_PAYMENT)` and `holdExpiresAt < now`.
- In a transaction: set `EXPIRED`, `heldRooms -= qty` for every night.
- If a payment was captured late (webhook after expiry): try to re-confirm if inventory is still free; otherwise auto-refund fully and notify the user.

### 4.5 Concurrency & integrity rules
- All inventory mutations use row locks (`FOR UPDATE`) or atomic conditional updates:
  `UPDATE inventory SET heldRooms = heldRooms + $q WHERE ... AND (totalRooms - bookedRooms - heldRooms) >= $q` and verify affected row count equals nights.
- Idempotency: `Idempotency-Key` stored on booking; replay returns the same booking.
- Constraint: `CHECK (bookedRooms + heldRooms <= totalRooms)` on inventory table.
- Two users booking the last room simultaneously → exactly one succeeds, the other gets 409.

### 4.6 Cancellation & refund logic
Snapshot the property's policy on the booking at creation. Compute refund at cancel time based on hours before check-in (check-in time, property timezone IST):

| Policy | Refund rule |
|---|---|
| FREE | 100% if cancelled ≥ 24h before check-in, else first night charged |
| FLEXIBLE | 100% ≥ 48h; 50% 24–48h; 0% < 24h |
| MODERATE | 100% ≥ 5 days; 50% 2–5 days; 0% < 2 days |
| STRICT | 50% ≥ 7 days; 0% otherwise |
| NON_REFUNDABLE | 0% |

- Service fee is non-refundable unless the owner/admin cancels.
- If the **owner/admin** cancels → 100% refund including fees.
- Flow: `POST /bookings/:id/cancel` → compute refund → show preview endpoint first (`GET /bookings/:id/cancel-preview`) → on confirm: set `CANCELLED`, release inventory (`bookedRooms -= qty`), create `refunds` row, call provider refund API, email both parties. Update `paymentStatus` to REFUNDED / PARTIALLY_REFUNDED on `refund.processed` webhook.

### 4.7 Modify booking (v1 simple)
- Allow changing guest details and special requests anytime before check-in.
- Date changes = cancel + rebook (document this in UI) — optional v2: in-place amend with price difference.

### 4.8 Post-stay
- Cron daily: bookings with `checkOut < today` and `CONFIRMED` → `COMPLETED`; send review-request email.
- Owner can mark `NO_SHOW` after check-in time of the first night (apply policy; no refund).
- Review allowed within 30 days after checkout.

### 4.9 Edge cases that must be handled
- Booking across daylight/timezone: store all dates as DATE (no time) in property local time.
- Same-day booking allowed until property's configurable cutoff (default 6 PM).
- Rooms closed by owner after bookings exist → block closing dates with confirmed bookings.
- Reducing `totalRooms` below already booked count → reject.
- Coupon race (usage limit) → increment with atomic update.
- Payment amount mismatch between webhook and booking → flag, do not confirm, alert admin.
- User double-clicks pay → idempotent; return existing open order.

---

## 5. Authentication & Authorization

**Features**
1. **Sign up:** name, email, phone (optional), password (min 8, 1 upper, 1 number). Send email verification link (token valid 24h). Allow login before verification but require verified email to book (configurable).
2. **Login:** email + password → returns access token (JSON) and sets refresh token as httpOnly, Secure, SameSite=Lax cookie.
3. **Google OAuth login** (Passport or Google Identity Services), links by email.
4. **Refresh:** `POST /auth/refresh` rotates refresh token; reuse of an old token revokes the whole family.
5. **Logout** (revoke current) and **Logout all devices**.
6. **Forgot / reset password** via emailed token (valid 30 min, single use).
7. **Change password**, **update profile**, **delete account** (soft delete + anonymise).
8. **Brute force protection:** rate limit login 5/min/IP+email; temporary lock after 10 failures.
9. **RBAC middleware:** `requireAuth`, `requireRole('OWNER')`, resource ownership checks (owner can only touch own properties).
10. Optional: phone OTP login (MSG91/Twilio).

---

## 6. Backend API Specification

Base path `/api/v1`. JSON responses in shape `{ success, data, error: { code, message, details } , meta }`. Pagination: `?page=1&limit=20` returns `meta: {page, limit, total, totalPages}`. All inputs validated with Zod. Use proper HTTP codes.

### Auth
```
POST   /auth/signup
POST   /auth/login
POST   /auth/google
POST   /auth/refresh
POST   /auth/logout
POST   /auth/logout-all
POST   /auth/verify-email?token=
POST   /auth/resend-verification
POST   /auth/forgot-password
POST   /auth/reset-password
GET    /users/me
PATCH  /users/me
PATCH  /users/me/password
DELETE /users/me
```

### Public / search
```
GET /properties/search      ?destination&checkIn&checkOut&adults&children&rooms
                            &minPrice&maxPrice&type[]&stars[]&amenities[]
                            &rating&freeCancellation&breakfast&sort&page&limit
GET /properties/suggest?q=  (autocomplete: cities, hotels, landmarks)
GET /properties/:slug       (details + rooms + availability for given dates)
GET /properties/:id/rooms?checkIn&checkOut&adults&children&rooms
GET /properties/:id/reviews?page&sort
GET /properties/featured    GET /destinations/popular
GET /amenities
```
Sort options: `recommended, priceAsc, priceDesc, ratingDesc, distance, popularity`.

### Bookings (USER)
```
POST /bookings                       (creates HOLD; Idempotency-Key header)
GET  /bookings                       (my bookings; ?status=upcoming|past|cancelled)
GET  /bookings/:id
GET  /bookings/:id/voucher           (PDF)
GET  /bookings/:id/cancel-preview
POST /bookings/:id/cancel
PATCH /bookings/:id/guest-details
POST /pricing/quote                  (price breakdown without holding)
POST /coupons/validate
```

### Payments
```
POST /payments/create-order
POST /payments/verify
POST /webhooks/razorpay
POST /webhooks/stripe
```

### Reviews / wishlist / notifications
```
POST   /bookings/:id/review
GET    /wishlist          POST /wishlist/:propertyId     DELETE /wishlist/:propertyId
GET    /notifications     PATCH /notifications/:id/read
```

### Owner (OWNER role)
```
POST/GET/PATCH/DELETE /owner/properties
POST   /owner/properties/:id/images        (multipart / signed upload)
POST/PATCH/DELETE     /owner/properties/:id/rooms
PUT    /owner/rooms/:id/inventory          (bulk update: date range → totalRooms, price, isClosed, minStay)
GET    /owner/rooms/:id/inventory?from&to  (calendar data)
POST/PATCH/DELETE     /owner/rooms/:id/rate-rules
GET    /owner/bookings?status&propertyId&from&to
PATCH  /owner/bookings/:id/status          (check-in, no-show, cancel)
POST   /owner/reviews/:id/reply
GET    /owner/dashboard                    (revenue, occupancy, upcoming check-ins)
GET    /owner/earnings                     (per month, payouts)
```

### Admin (ADMIN role)
```
GET   /admin/users            PATCH /admin/users/:id/status
GET   /admin/properties?status=PENDING
PATCH /admin/properties/:id/approve | reject | suspend
GET   /admin/bookings         POST /admin/bookings/:id/refund
CRUD  /admin/coupons          CRUD /admin/amenities
GET   /admin/analytics        (GMV, bookings/day, top cities, cancellations)
GET   /admin/reviews          PATCH /admin/reviews/:id/hide
```

### Cross-cutting backend requirements
- Layered architecture: `routes → controllers → services → repositories(Prisma)`.
- Central error handler, custom `AppError`, async wrapper.
- Request logging (pino), correlation ID per request.
- Rate limits: global 100/min/IP, auth routes stricter.
- CORS restricted to frontend origin; helmet headers; sanitize inputs; parameterised queries only.
- Image uploads: validate MIME + size ≤ 5 MB, auto-resize, max 20 per property.
- Seed script: 1 admin, 2 owners, 30 properties across 8 Indian cities (Jaipur, Goa, Mumbai, Delhi, Bengaluru, Udaipur, Manali, Kerala) with room types, 365 days of inventory, amenities, sample reviews, 3 coupons (`WELCOME10`, `FLAT500`, `SUMMER15`).
- Unit tests for `PricingService`, cancellation refund calculator, availability check; integration tests for booking flow and concurrency (two parallel requests for the last room).

---

## 7. Frontend — Pages & Features

### 7.1 Design system
- **Look:** clean, modern, travel-marketplace feel (Booking.com clarity + Airbnb imagery).
- **Colors:** Primary `#0F766E` (teal) or `#2563EB` (blue) — pick one; Accent `#F59E0B` (amber, deals/CTAs); neutrals slate; success green, error red.
- **Typography:** Inter (UI) + Poppins/Plus Jakarta Sans for headings.
- **Radius:** 12–16px cards, soft shadows, large high-quality imagery, 8px spacing grid.
- **Dark mode** support (toggle).
- **Fully responsive** (mobile-first; sticky bottom CTA bars on mobile), accessible (WCAG AA, keyboard nav, aria labels, focus rings).
- Skeleton loaders everywhere; optimistic UI for wishlist; toast notifications; smooth micro-animations (Framer Motion).

### 7.2 Public pages
1. **Home `/`**
   - Sticky navbar: logo, "List your property", language/currency, Login/Signup or avatar menu.
   - Hero with large background image + **search bar** (destination autocomplete, date-range picker, guests & rooms popover, Search button).
   - Sections: Popular destinations (cards), Featured stays carousel, Offers/coupons banners, Browse by property type, Why StayNova (trust badges), Testimonials, App/newsletter strip, Footer (links, socials, policies).
2. **Search results `/search`**
   - Sticky summary bar (edit destination/dates/guests).
   - Left **filter sidebar** (drawer on mobile): price range slider, star rating, guest rating, property type, amenities, free cancellation, breakfast, popular filters.
   - Sort dropdown, result count, list/grid toggle, **map view toggle** (Leaflet with price pins).
   - Hotel card: image carousel, name, stars, rating badge + review count, location, top amenities, cancellation badge, "Only 2 rooms left!" scarcity label (when ≤3 available), price per night + total for stay + taxes note, wishlist heart, "View deal" CTA.
   - Infinite scroll or pagination; URL query params reflect filters (shareable).
3. **Property details `/hotels/[slug]`**
   - Photo gallery grid with lightbox; title, stars, address, rating, share, wishlist.
   - Sticky tab nav: Overview, Rooms, Amenities, Location, Reviews, Policies.
   - **Rooms table** (like Booking.com): each room type with images, size, bed type, occupancy, inclusions, cancellation label, price, quantity selector, "Reserve" button; sticky summary "Reserve N rooms · ₹X" bar.
   - Date/guest re-check widget; "unavailable for these dates" state with alternative dates suggestion.
   - Amenities grid with icons; map with nearby landmarks; reviews with category rating bars, filters, pagination; house rules & policies; similar properties.
4. **Checkout `/checkout/[bookingId]`**
   - Step indicator: Details → Payment → Confirmation.
   - Left: guest details form (prefilled), special requests, coupon input with apply/remove, "booking for someone else" toggle.
   - Right: sticky **price breakdown** card (nightly rate × nights, taxes, fees, discount, total), property mini-summary, cancellation policy, **hold countdown timer** (15:00) — on expiry show modal and redirect to the property with dates preserved.
   - Pay button opens Razorpay; show loading and error states, retry option.
5. **Confirmation `/booking/[ref]/confirmed`** — success animation, booking reference, summary, download voucher PDF, add to calendar (.ics), directions, "Manage booking" link.
6. **Static:** About, Contact, Help/FAQ, Terms, Privacy, Cancellation policy, 404, 500.

### 7.3 Auth pages
`/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`. Split-screen layout with imagery, Google sign-in button, inline validation, password strength meter, show/hide password, redirect back to the intended page after login (`?next=`).

### 7.4 User dashboard `/account`
- **My bookings:** tabs Upcoming / Completed / Cancelled; booking cards with status badges; detail page with timeline, voucher, cancel button (opens modal showing refund preview), contact property, write review (after completion).
- **Wishlist**, **Profile** (edit info, avatar, change password), **Notifications**, **Saved guests (optional)**.

### 7.5 Owner dashboard `/owner`
- Overview: KPI cards (revenue, bookings, occupancy %, ADR), charts (Recharts), upcoming check-ins/outs.
- **Properties:** list + multi-step create/edit wizard (basic info → location with map pin → photos drag-drop reorder → amenities → rooms → policies → submit for approval); status badges.
- **Rooms & Inventory:** room type editor; **availability calendar** (month grid showing available count & price per day; select range → bulk edit rooms/price/close/min-stay); rate rules manager.
- **Bookings:** filterable table, detail drawer, actions (mark check-in, no-show, cancel).
- **Reviews:** list + reply. **Earnings:** table & export CSV.

### 7.6 Admin dashboard `/admin`
Overview analytics, pending property approvals (preview + approve/reject with reason), users, bookings (search, refund action), coupons CRUD, amenities CRUD, reviews moderation, audit logs.

### 7.7 Frontend technical requirements
- Route protection via middleware (auth + role).
- Axios/fetch client with interceptor: attach access token, auto-refresh on 401 once, then redirect to login.
- Forms: React Hook Form + Zod, same schemas from `packages/shared`.
- SEO: server-rendered property and city pages, dynamic `<title>`/meta/OpenGraph, JSON-LD (`Hotel` schema), `sitemap.xml`, `robots.txt`.
- Performance: `next/image`, lazy-load maps/gallery, debounce autocomplete (300 ms), cache queries with TanStack Query, Lighthouse ≥ 90.
- Error boundaries, empty states, offline/failed-request states.
- Currency/date formatting via `Intl` (INR default, `en-IN`).

---

## 8. Compulsory Features You May Not Have Listed (include all)

1. Email notifications (verify, booking confirmation, cancellation, refund, review request, password reset) with HTML templates.
2. PDF **booking voucher and GST invoice** generation.
3. **Hold timer** and inventory locking (Section 4).
4. Coupons / promo codes and offer banners.
5. Reviews & ratings with verified-stay badge.
6. Wishlist / saved properties.
7. Map view and location display.
8. Autocomplete destination search.
9. Filters, sorting and scarcity/urgency labels.
10. Cancellation policies and refunds.
11. Notifications (in-app + email).
12. Owner portal with calendar inventory and pricing rules.
13. Admin moderation and analytics.
14. Audit logs and activity tracking.
15. Legal pages: Terms, Privacy, Refund policy, Cookie banner.
16. Currency/tax handling (GST).
17. Recently viewed properties (localStorage) and "similar stays".
18. Contact/support form with ticket stored in DB (`support_tickets` table: id, userId, subject, message, status).
19. Health check endpoint `/health`, structured logging, error monitoring hook (Sentry-ready).
20. Seed data and a demo mode with Razorpay **test keys**.

---

## 9. Security Checklist
- Passwords hashed with bcrypt; never log tokens/PII.
- Access token in memory (not localStorage); refresh token in httpOnly cookie; CSRF protection for cookie endpoints (double-submit or SameSite + origin check).
- Validate every webhook signature; reject replays (store event IDs).
- Authorisation checks on every resource (IDOR prevention): users only access their bookings; owners only their properties.
- Rate limiting, helmet, input sanitisation, file-type validation, parameterised queries.
- PII minimal; payment card data never touches our servers (provider-hosted checkout).
- Secrets via env; different keys for dev/prod.

---

## 10. Environment Variables (`.env.example`)

```
# API
NODE_ENV=development
PORT=5000
DATABASE_URL=postgresql://user:pass@localhost:5432/staynova
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
CLIENT_URL=http://localhost:3000
SMTP_HOST= SMTP_PORT= SMTP_USER= SMTP_PASS= EMAIL_FROM=
RAZORPAY_KEY_ID= RAZORPAY_KEY_SECRET= RAZORPAY_WEBHOOK_SECRET=
STRIPE_SECRET_KEY= STRIPE_WEBHOOK_SECRET=
CLOUDINARY_URL=
GOOGLE_CLIENT_ID= GOOGLE_CLIENT_SECRET=
HOLD_MINUTES=15
SERVICE_FEE_PERCENT=2

# Web
NEXT_PUBLIC_API_URL=http://localhost:5000/api/v1
NEXT_PUBLIC_RAZORPAY_KEY_ID=
NEXT_PUBLIC_GOOGLE_CLIENT_ID=
```

---

## 11. Background Jobs (BullMQ)
| Job | Trigger | Action |
|---|---|---|
| `expireHold` | delayed at `holdExpiresAt` | expire booking, release held inventory |
| `holdSweeper` | every minute | safety net for missed expiries |
| `generateInventory` | daily 02:00 | extend inventory rows to 365 days ahead |
| `completeStays` | daily 03:00 | mark past stays COMPLETED, send review emails |
| `sendEmail` | on demand | templated email with retry/backoff |
| `generateVoucher` | on confirm | PDF voucher/invoice upload |
| `refreshPropertyStats` | on review/booking change | recompute avgRating, minPrice |

---

## 12. Testing Requirements
- **Unit:** pricing (weekend, seasonal, GST slabs, coupons), refund calculator for each policy, availability across date ranges.
- **Integration:** signup→login→search→hold→pay (mock provider)→confirm→cancel→refund.
- **Concurrency:** 20 parallel requests for 1 remaining room → exactly 1 confirmed hold.
- **Webhook:** duplicate event delivery is idempotent; late payment after expiry handled.
- **E2E (Playwright):** the full guest booking journey on desktop and mobile viewport.

---

## 13. Folder Structure Guidance

```
apps/backend/src/
  modules/{auth,users,properties,rooms,inventory,pricing,bookings,payments,reviews,coupons,notifications,owner,admin}/
  middlewares/{auth,rbac,rate-limit,error-handler}/
  jobs/{expireHold,sweeper,emails,voucher}/
  lib/{redis,mailer,storage,logger,payment-providers}/
  app.ts server.ts
apps/frontend/src/
  app/(public)/ app/(auth)/ app/account/ app/owner/ app/admin/
  components/{search,property,booking,owner,admin}/
  lib/{api-client,auth}/ hooks/ stores/ middleware.ts
packages/
  db/ shared/ ui/ eslint-config/ typescript-config/
```

---

## 14. Quality Bar / Acceptance Criteria
1. A new user can sign up, verify email, search "Jaipur" for given dates, filter, open a hotel, choose rooms, apply a coupon, pay with Razorpay test mode and receive a confirmation email + PDF voucher.
2. Inventory decreases correctly; two users can never book the same last room.
3. Unpaid holds expire after 15 minutes and release rooms automatically.
4. Cancelling shows the correct refund per policy and processes it.
5. Owner can create a property, upload photos, set room inventory/prices in the calendar, and see bookings; admin can approve it before it goes live.
6. UI is responsive, polished, accessible and visually comparable to leading booking sites.
7. All tests pass; `docker-compose up` starts the whole stack; README explains setup in under 10 steps.

---

## 15. Documentation Deliverables
`README.md` (setup/run), `DECISIONS.md`, OpenAPI docs, ER diagram (Mermaid in `docs/erd.md`), `docs/booking-flow.md` (sequence diagram of Section 4), Postman collection.

## 16. Out of Scope for v1 (do not build, but keep code extensible)
Flights/trains/cabs, loyalty points, multi-language UI, chat between guest and owner, channel manager integrations, mobile native apps.

## 17. Implementation Order (phases)
1. **Foundation:** monorepo, Docker (Postgres + Redis), Prisma schema + migrations, seed data, config, logging, error handling.
2. **Auth:** signup/login/refresh/logout/reset/verify/Google + RBAC; auth pages.
3. **Catalog:** properties, rooms, images, amenities, inventory generation; owner CRUD APIs.
4. **Search & details:** search API with availability + filters + sorting; home, search, details pages (design system first).
5. **Pricing & booking:** PricingService, coupons, booking hold with transactions, expiry jobs, checkout page.
6. **Payments:** Razorpay order/verify/webhook, confirmation flow, emails, PDF voucher.
7. **Account features:** my bookings, cancel + refund, reviews, wishlist, notifications.
8. **Owner dashboard:** inventory calendar, rate rules, bookings, earnings.
9. **Admin dashboard:** approvals, users, refunds, coupons, analytics.
10. **Hardening:** tests, security review, performance (Lighthouse), SEO, docs, CI.

> **Final instruction to the agent:** After finishing each phase, summarise what was built, list any deviations, and confirm the acceptance criteria for that phase before continuing.