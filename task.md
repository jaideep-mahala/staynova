# Project Task Overview: StayNova

## Project Summary
StayNova is a full-stack online marketplace for booking stays (hotels, resorts, villas, homestays, hostels, apartments) focused on the Indian market with INR pricing. The project consists of a Node.js/TypeScript backend, a React frontend, and shared packages for database seeding and UI components.

## Inferred Tech Stack
- **Backend:** Node.js, TypeScript, Express, Prisma ORM, PostgreSQL, Redis, BullMQ, Nodemailer, Razorpay, Stripe, JWT, Zod
- **Frontend:** React, React Router DOM, Tailwind CSS, Radix UI, Zustand, Bun
- **Shared Packages:** Prisma database schema/seeding, shared UI component library
- **Infrastructure:** Docker Compose (Postgres, Redis)

---

## Completed Work

### Backend: `apps/backend/src/`

#### Jobs & Background Processing
- `jobs/index.ts`
  - `emailBookingConfirmed`: Sends booking confirmation email to guest and owner notification.
  - `emailBookingCancelled`: Sends booking cancellation email with refund amount.
  - `emailReviewRequest`: Sends review request email after stay completion.
  - `generateVoucher`: Generates PDF booking voucher and saves to storage.
  - `startAllJobs`: Initializes BullMQ workers and cron jobs for booking expiration, inventory generation, stay completion, and email jobs.
  - One-shot inventory bootstrap if inventory table is empty.

#### Libraries
- `lib/logger.ts`
  - Pino-based logger with development pretty-printing.
  - `correlationId` helper for request tracing via `x-correlation-id` header.
- `lib/mailer.ts`
  - `getTransporter`: Singleton Nodemailer SMTP transporter using environment variables.
  - `sendEmail`: Generic async function to send HTML/text emails with error handling.
- `lib/payment-providers.ts`
  - `PaymentProvider` interface with `createOrder`, `verifySignature`, and `refund` methods.
  - `RazorpayProvider`: Full Razorpay integration (order creation, signature verification, refunds).
  - `StripeProvider`: Full Stripe integration (PaymentIntents, status verification, refunds).
  - `getProvider`: Factory function returning provider by name.
- `lib/queue.ts`
  - `getQueueConnection`: Singleton IORedis connection for BullMQ.
  - `getQueue`: Retrieves or creates named BullMQ queues (`staynova-bookings`, `staynova-jobs`).
  - `enqueueJob`: Adds jobs with delay, retry, backoff, and deduplication options.
  - `startWorkers`: Starts BullMQ workers with concurrency control and failure logging.
  - `scheduleCron`: Schedules repeatable cron jobs.
- `lib/redis.ts`
  - `getRedis`: Singleton Redis client (ioredis `createClient`).
- `lib/storage.ts`
  - `ensureUploadDir`, `saveBuffer`, `readStored`: Local file storage helpers.
  - `generateVoucherPdf`: Generates booking voucher PDF with guest, property, dates, pricing breakdown, and GST invoice details using PDFKit.
- `lib/email-templates.ts`
  - `layout`: HTML email template wrapper with StayNova branding.
  - `templates.verifyEmail`: Email verification template with verification link.
  - `templates.forgotPassword`: Password reset template with reset link.
  - `templates.bookingConfirmed`: Booking confirmation with guest name, property, dates, total, voucher download.
  - `templates.ownerNewBooking`: New booking alert for property owners.
  - `templates.bookingCancelled`: Cancellation notification with refund amount.
  - `templates.reviewRequest`: Post-stay review request with review link.

#### Middlewares
- `middlewares/auth/requireAuth.ts`
  - `AuthUser` interface (`userId`, `email`, `role`).
  - Express `Request` augmentation with optional `user`.
  - `extractBearerToken`: Extracts Bearer token from Authorization header.
  - `requireAuth`: JWT verification, user lookup, blocked/deleted user rejection.
  - `optionalAuth`: Optional token verification for public endpoints.
  - `requireRole`: Role-based access control middleware factory.
  - `requireOwner`: Convenience wrapper for OWNER/ADMIN roles.
  - `audit`: Creates audit log entries in database with error swallowing.
- `middlewares/error-handler/errorHandler.ts`
  - `AppError` class with `statusCode`, `isOperational`, and `details`.
  - `ErrorResponse` interface for standardized API error format.
  - `handleZodError`: Converts Zod validation errors to structured response.
  - `errorHandler`: Centralized Express error middleware handling ZodError, AppError, and generic errors.
  - `asyncHandler`: Wrapper for async route handlers to catch promises.
- `middlewares/rate-limit/rateLimiters.ts`
  - `limiter` factory using `express-rate-limit` with standardized JSON error response.
  - `authLimiter`: 20 requests/minute for auth endpoints.
  - `loginLimiter`: 5 requests/minute with IP+email keying.
  - `bookingLimiter`: 30 requests/minute for booking endpoints.
  - `globalLimiterOptions`: 100 requests/minute global default.

#### Modules
- `modules/auth/auth.service.ts`
  - `TokenPayload` interface.
  - `generateAccessToken` / `generateRefreshToken`: JWT signing with 15m / 30d expiry.
  - `hashPassword` / `comparePassword`: bcryptjs password hashing (12 rounds).
  - `signup`: User creation with email verification token, enqueues verification email.
  - `login`: Credential validation, blocked account check, refresh token storage, last login update.
  - `refreshTokens`: Token rotation with revocation of old refresh token.
  - `verifyEmail`: Verifies email token and marks user as verified.
  - `resendVerification`: Resends verification email without leaking account existence.
  - `googleAuth`: Google ID token verification via Google tokeninfo endpoint, account linking/creation.
  - `forgotPassword`: Password reset token creation (30 min expiry), enqueues reset email.
  - `resetPassword`: Validates reset token, updates password, marks token as used.
  - `logout` / `logoutAll`: Revokes refresh tokens.
  - `changePassword`: Validates current password, updates, revokes all sessions.
  - `deleteAccount`: Soft delete with PII anonymization.
- `modules/bookings/booking.service.ts`
  - `CreateBookingInput` interface.
  - `createBooking`: Full booking flow with idempotency key, server-side price quote, inventory row locking (`FOR UPDATE`), held-room atomic increments, booking creation with guests and items, hold expiry job enqueue.
  - `findAvailableAlternatives`: Finds alternative room types for a property when primary is unavailable.
  - `getMyBookings`: User booking history with status filtering (upcoming, past, cancelled).
  - `getBooking`: Single booking detail with property, items, guests, payments, refunds, review.
  - `updateGuestDetails`: Updates guest name, email, phone, special requests, and guest list.
  - `computeCancellation`: Calculates refund amount based on cancellation policy snapshot.
  - `cancelBooking`: Cancels booking, releases inventory (held or booked rooms), creates refund record, enqueues cancellation emails, creates notifications for user and owner.
- `modules/owner/owner.service.ts`
  - `ownerBookings`: Paginated booking list for owner with status, property, and date filters.
  - `updateBookingStatus`: Owner actions for check-in, no-show, completed, cancelled (with audit logging).
  - `createRateRule` / `updateRateRule` / `deleteRateRule`: Rate rule CRUD with ownership verification.
  - `addPropertyImages` / `deletePropertyImage`: Image management with 20-image limit and cover image handling.
  - `ownerDashboard`: KPIs (revenue, bookings, occupancy, ADR, rating), upcoming check-ins/check-outs.
  - `ownerEarnings`: Monthly revenue and payout breakdown with platform fee deduction.
  - `ownerReviews`: Reviews for owner's properties.
- `modules/pricing/pricing.service.ts`
  - `RateRuleInput`, `NightBreakdown`, `PriceBreakdown`, `CouponInput` interfaces.
  - `addNights` / `nightsBetween`: Date utilities.
  - `toDateOnly` / `dateKeyOf` / `dayDiff`: Timezone-safe date key generation (Asia/Kolkata).
  - `computeNightlyPrices`: Pure nightly-price engine applying inventory overrides and rate rules (WEEKEND, SEASONAL, LAST_MINUTE, EARLY_BIRD, LONG_STAY).
  - `computeCouponDiscount`: Coupon validation (active, dates, usage limits, per-user limits, property applicability, minimum booking) and discount calculation.
  - `gstRateForPerNight`: GST slab lookup based on per-room-per-night tariff.
  - `computeTaxesAndFees`: Subtotal, taxable amount, GST, service fee, and total calculation.
  - `assertValidStayParams`: Stay validation (nights range, room count, check-in not in past, same-day cutoff).
  - `quoteRoomType`: Full price quote with inventory availability check, rate rules, extra guest charges, coupon discount, and tax/fee computation.
  - `validateStayParams`: Public validation wrapper.
- `modules/pricing/refund.service.ts`
  - `RefundCalcResult` interface.
  - `calculateRefund`: Cancellation policy engine (FREE, FLEXIBLE, MODERATE, STRICT, NON_REFUNDABLE) with hours-before-check-in logic, service fee handling, and owner/admin full refund support.
- `modules/properties/property.service.ts`
  - `propertyQuerySchema`: Zod schema for search query validation.
  - `searchProperties`: Property search with filters (destination, type, stars, amenities, price range, cancellation, rating), Redis caching (60s), inventory availability verification, sorting (price, rating, popularity).
  - `suggest`: City and property autocomplete suggestions.
  - `popularDestinations`: Grouped popular cities with property counts and cover images.
  - `featuredProperties`: Top-rated properties with images and amenities.
  - `listAmenities`: Most common amenities across properties.
  - `getPropertyDetail`: Full property detail with rooms, rate rules, images, amenities, reviews, and room availability for stay dates.
  - `getPropertyReviews`: Paginated visible reviews for a property.
  - `createProperty` / `updateProperty` / `deleteProperty`: Property CRUD with soft delete, amenities management, slug generation.
  - `getOwnerProperties`: Owner's property list with room and booking counts.
- `modules/rooms/room.service.ts`
  - `roomTypeSchema`: Zod schema for room type input.
  - `createRoomType`: Room type creation with automatic 365-day inventory seeding.
  - `seedInventory`: Generates next 365 days of inventory rows for a room type.
  - `updateRoomType`: Room type update with validation that totalRooms cannot drop below booked/held counts.
  - `deleteRoomType`: Soft deactivation if active bookings exist.
  - `getRoomTypesForOwner`: Owner's room types with images, amenities, and rate rules.

### Frontend: `apps/frontend/src/`

#### Core & Routing
- `App.tsx`: Exports `Router` component.
- `app/router.tsx`: React Router configuration with all routes (Home, Search, Property Detail, static pages, auth pages, booking, account, owner, admin). Includes `AuthRoute`, `GuestRoute`, `OwnerRoute`, `AdminRoute` guards.

#### Layout
- `components/layout/AuthLayout.tsx`: Centered auth layout with "SN" logo and StayNova tagline.
- `components/layout/Navbar.tsx`: Sticky navigation with StayNova branding, auth links (Log in/Sign up), user profile dropdown, Owner/Admin dashboard links, Sign out, mobile hamburger menu.

#### UI Components
- `components/ui/button.tsx`: Forward-ref Button with CVA variants (default, destructive, outline, secondary, ghost, link, amber) and sizes (sm, default, lg, icon).
- `components/ui/select.tsx`: Radix UI-based Select component (Root, Group, Value, Trigger, Content, Item, Label, Separator, scroll buttons).
- `components/ui/textarea.tsx`: Styled Textarea component.
- `components/ui/card.tsx`: Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent components with cn() styling.
- `components/ui/input.tsx`: Forward-ref Input component with standard styling.
- `components/ui/label.tsx`: Radix-based Label component.

#### Pages
- `pages/HomePage.tsx`: Hero section with search form (destination, check-in, check-out, guests), popular destinations grid, trust badges, featured properties carousel.
- `pages/SearchPage.tsx`: Search results page with map/list toggle, filter sidebar (price range, star rating, amenities, property type), mock property data, property cards with booking links.
- `pages/PropertyDetailPage.tsx`: Property detail with image gallery, amenities, room selection, pricing breakdown, cancellation policy, reserve button.
- `pages/BookingPage.tsx`: Multi-step booking flow with guest details form, 15-minute hold timer, coupon code validation, pricing breakdown, payment button, hold expiry handling.
- `pages/BookingConfirmPage.tsx`: Booking confirmation with reference number, property details, dates, guests, total paid, download voucher, add to calendar, manage booking.
- `pages/account/AccountPage.tsx`: User account page with profile and bookings tabs, guest details display.
- `pages/owner/OwnerDashboard.tsx`: Owner dashboard with revenue, bookings, occupancy, ADR stats, property list, availability calendar placeholder.
- `pages/admin/AdminDashboard.tsx`: Admin dashboard with GMV, properties, pending approvals, users stats, pending property approvals list, analytics placeholder.
- `pages/auth/LoginPage.tsx`: Login form with email/password, show/hide password, remember me, forgot password link, Google sign-in demo, demo user fallback.
- `pages/auth/SignupPage.tsx`: Signup form with name, email, phone, password, role selection (Traveler/Property Owner).
- `pages/auth/ForgotPasswordPage.tsx`: Password reset request with email input and success state.
- `pages/auth/ResetPasswordPage.tsx`: Password reset form with new password and confirm password, show/hide toggle.
- `pages/auth/VerifyEmailPage.tsx`: Email verification page with success state and sign-in button.
- `pages/static/AboutPage.tsx`: About StayNova with mission statement and city coverage.
- `pages/static/PrivacyPage.tsx`: Privacy policy with data collection and security sections.
- `pages/static/NotFoundPage.tsx`: 404 page with back to home link.

#### State & Utilities
- `stores/auth.ts`: Zustand auth store with persistence (`user`, `accessToken`), `setAuth`, `logout`, `isAuthenticated`.
- `lib/utils.ts`: `cn` (className merger with tailwind-merge), `formatPrice` (INR currency), `formatDate` (en-IN locale).
- `lib/api.ts`: Axios instance with base URL, request interceptor for access token, response interceptor with token refresh logic and 401 handling.
- `APITester.tsx`: Component to test arbitrary API endpoints with method selection and response display.
- `index.ts`: Bun dev server serving `index.html` and `/api/hello` GET/PUT endpoints with HMR.

### Packages
- `packages/db/src/seed.ts`: Database seeding script creating admin user, property owners, guest users, 30 sample properties with amenities, room types, 365-day inventory, rate rules, images, and platform-wide coupons (WELCOME10, FLAT500, SUMMER15).
- `packages/ui/src/button.tsx`: Shared UI Button component with app name prop.
- `packages/ui/src/card.tsx`: Shared UI Card component (anchor-based with UTM parameters).
- `packages/ui/src/code.tsx`: Shared UI Code component.

### Configuration & Infrastructure
- `docker-compose.yml`: Postgres 15-alpine and Redis 7-alpine services with health checks and named volumes.
- `.env.example`: Environment variable template for API, database, Redis, JWT, SMTP, Razorpay, Stripe, Cloudinary, Google OAuth, and frontend variables.

---

## Remaining Work / Gaps

### Backend
1. **Route Controllers & Route Wiring:** Service layer exists but Express route controllers and route registration (e.g., `app.use('/api/...')`) are not visible in the provided files. Need to wire up controllers for auth, bookings, properties, rooms, owner, admin, and payments.
2. **Payment Webhooks:** Razorpay and Stripe webhook handlers are missing. Payment confirmation should be handled asynchronously via webhooks, not just client-side verification.
3. **Zod Request Schemas:** Input validation schemas for API request bodies are referenced in services but not fully visible. Need to define and apply schemas for all endpoints.
4. **Notification System:** `prisma.notification` is referenced in booking service, but notification service/API endpoints are not visible.
5. **File Upload API:** `lib/storage.ts` exists, but image upload endpoints (multer/S3/Cloudinary) are not visible.
6. **Testing:** No test files visible. Need unit tests for pricing engine, refund calculation, auth service, and integration tests for API endpoints.
7. **Environment Validation:** No startup validation for required env vars (SMTP, Razorpay, Stripe, Redis, DATABASE_URL, JWT secrets).
8. **API Documentation:** No Swagger/OpenAPI docs visible.
9. **Dockerfile:** No `Dockerfile` for backend or frontend visible.
10. **Prisma Migrations:** Migration files not visible; schema changes need to be tracked.

### Frontend
1. **API Integration:** Many pages use mock data or hardcoded values (e.g., `SearchPage.tsx` uses `MOCK_PROPERTIES`, `BookingPage.tsx` posts to hardcoded `propertyId: "prop-1"`, `PropertyDetailPage.tsx` uses `ROOM_TYPES` mock). Need to connect to actual backend APIs using `lib/api.ts`.
2. **Form Validation:** No React Hook Form or Zod validation visible on forms. Need client-side validation for booking, auth, and contact forms.
3. **Protected Route Enforcement:** Router guards exist but `OwnerRoute` and `AdminRoute` render empty `<div />`. Need actual dashboard pages and proper redirection (though OwnerDashboard and AdminDashboard components now exist, they are not yet wired into the router).
4. **Booking Management:** Users cannot view, modify, or cancel existing bookings from the frontend beyond the AccountPage stub.
5. **Search Enhancements:** Pagination, sorting, and price-range filtering need to be wired to backend API.
6. **Property Gallery:** Image carousel/slider on property detail pages is static.
7. **Email Verification UI:** Verify email page lacks error states for invalid/expired tokens.
8. **Responsive Audit:** Mobile responsiveness needs testing across all pages.
9. **Error Boundaries:** No React error boundaries visible for graceful error handling.
10. **Loading States:** No skeleton loaders or spinners for async operations visible.

### Packages / Shared
1. **Shared Types:** No shared types package visible. Frontend and backend should share TypeScript interfaces for `Booking`, `Property`, `User`, `PriceBreakdown`, etc.
2. **UI Component Expansion:** `packages/ui` only has Button, Card, Code. Need Modal, Dialog, Table, Badge, Toast components.
3. **Database Seed Expansion:** Seed script creates 30 properties; could be expanded with more diverse data, bookings, payments, and reviews.
4. **Prisma Schema:** The actual Prisma schema file (`schema.prisma`) was not provided. Need to review and maintain it.

### DevOps & Infrastructure
1. **Dockerfile:** Missing for backend and frontend.
2. **CI/CD:** No GitHub Actions or similar visible for linting, testing, building, and deployment.
3. **Monitoring:** No error tracking (Sentry) or APM visible.
4. **Environment Files:** `.env.example` exists but actual `.env` files for different environments are missing.

---

## File-by-File Status

| File | Status | Notes |
|------|--------|-------|
| `apps/backend/src/jobs/index.ts` | Complete | Email jobs, voucher generation, worker/cron setup implemented. |
| `apps/backend/src/lib/logger.ts` | Complete | Pino logger with correlation ID. |
| `apps/backend/src/lib/mailer.ts` | Complete | Nodemailer transporter and sendEmail. |
| `apps/backend/src/lib/payment-providers.ts` | Complete | Razorpay and Stripe providers. |
| `apps/backend/src/lib/queue.ts` | Complete | BullMQ queues, workers, cron scheduling. |
| `apps/backend/src/lib/redis.ts` | Complete | Redis client singleton. |
| `apps/backend/src/lib/storage.ts` | Complete | Local storage and PDF voucher generation. |
| `apps/backend/src/lib/email-templates.ts` | Complete | All email templates implemented. |
| `apps/backend/src/middlewares/auth/requireAuth.ts` | Complete | JWT auth, role checking, audit logging. |
| `apps/backend/src/middlewares/error-handler/errorHandler.ts` | Complete | AppError, standardized error response. |
| `apps/backend/src/middlewares/rate-limit/rateLimiters.ts` | Complete | Express rate limiters. |
| `apps/backend/src/modules/auth/auth.service.ts` | Complete | Full auth service (signup, login, refresh, verify, reset, Google, delete). |
| `apps/backend/src/modules/bookings/booking.service.ts` | Complete | Booking creation, cancellation, guest details, history. |
| `apps/backend/src/modules/owner/owner.service.ts` | Complete | Owner bookings, status, rate rules, images, dashboard, earnings. |
| `apps/backend/src/modules/pricing/pricing.service.ts` | Complete | Pricing engine, coupons, taxes, quote. |
| `apps/backend/src/modules/pricing/refund.service.ts` | Complete | Refund calculation by policy. |
| `apps/backend/src/modules/properties/property.service.ts` | Complete | Property search, CRUD, detail, reviews. |
| `apps/backend/src/modules/rooms/room.service.ts` | Complete | Room type CRUD, inventory seeding. |
| `apps/frontend/src/App.tsx` | Complete | App entry point. |
| `apps/frontend/src/app/router.tsx` | Complete | Route configuration with guards. |
| `apps/frontend/src/components/layout/AuthLayout.tsx` | Complete | Auth layout. |
| `apps/frontend/src/components/layout/Navbar.tsx` | Complete | Navbar with auth state. |
| `apps/frontend/src/components/ui/button.tsx` | Complete | Button component. |
| `apps/frontend/src/components/ui/select.tsx` | Complete | Select component. |
| `apps/frontend/src/components/ui/textarea.tsx` | Complete | Textarea component. |
| `apps/frontend/src/components/ui/card.tsx` | Complete | Card components implemented. |
| `apps/frontend/src/components/ui/input.tsx` | Complete | Input component implemented. |
| `apps/frontend/src/components/ui/label.tsx` | Complete | Label component implemented. |
| `apps/frontend/src/index.ts` | Complete | Bun dev server. |
| `apps/frontend/src/lib/utils.ts` | Complete | Utility functions. |
| `apps/frontend/src/lib/api.ts` | Complete | Axios instance with auth interceptors. |
| `apps/frontend/src/pages/BookingConfirmPage.tsx` | Complete | Confirmation page UI. |
| `apps/frontend/src/pages/BookingPage.tsx` | Partial | UI implemented; API integration mocked. |
| `apps/frontend/src/pages/HomePage.tsx` | Complete | Home page UI. |
| `apps/frontend/src/pages/PropertyDetailPage.tsx` | Partial | UI implemented; mock room data. |
| `apps/frontend/src/pages/SearchPage.tsx` | Partial | UI implemented; mock property data. |
| `apps/frontend/src/pages/account/AccountPage.tsx` | Complete | Account page UI implemented. |
| `apps/frontend/src/pages/owner/OwnerDashboard.tsx` | Complete | Owner dashboard UI implemented. |
| `apps/frontend/src/pages/admin/AdminDashboard.tsx` | Complete | Admin dashboard UI implemented. |
| `apps/frontend/src/pages/auth/ForgotPasswordPage.tsx` | Partial | UI implemented; backend API needed. |
| `apps/frontend/src/pages/auth/LoginPage.tsx` | Partial | UI implemented; demo auth only. |
| `apps/frontend/src/pages/auth/ResetPasswordPage.tsx` | Partial | UI implemented; backend API needed. |
| `apps/frontend/src/pages/auth/SignupPage.tsx` | Partial | UI implemented; backend API needed. |
| `apps/frontend/src/pages/auth/VerifyEmailPage.tsx` | Partial | UI implemented; backend API needed. |
| `apps/frontend/src/pages/static/AboutPage.tsx` | Complete | Static page. |
| `apps/frontend/src/pages/static/NotFoundPage.tsx` | Complete | 404 page. |
| `apps/frontend/src/pages/static/PrivacyPage.tsx` | Complete | Static page. |
| `apps/frontend/src/stores/auth.ts` | Complete | Zustand auth store. |
| `apps/frontend/src/APITester.tsx` | Complete | API testing component. |
| `packages/db/src/seed.ts` | Complete | Seeding script. |
| `packages/ui/src/button.tsx` | Complete | Shared button. |
| `packages/ui/src/card.tsx` | Complete | Shared card. |
| `packages/ui/src/code.tsx` | Complete | Shared code component. |
| `docker-compose.yml` | Complete | Postgres and Redis services. |
| `.env.example` | Complete | Environment variable template. |

---

## Immediate Next Steps
1. Add missing files to the chat (Prisma schema, route controllers, missing frontend UI components) for detailed review.
2. Connect frontend pages to actual backend APIs (replace mock data in SearchPage, PropertyDetailPage, BookingPage).
3. Wire OwnerDashboard and AdminDashboard into the router (currently render empty divs).
4. Implement payment webhooks for Razorpay and Stripe.
5. Add form validation (React Hook Form + Zod).
6. Add Dockerfiles and CI/CD pipeline.
7. Write unit and integration tests.
8. Add environment validation at application startup.
9. Add Prisma schema and migrations.
