# StayNova — Architecture Decisions

## Frontend Framework
- **Decision:** Keep Bun + React SPA (React Router) instead of Next.js 14 App Router.
- **Reason:** User explicitly requested to keep the Bun frontend and adapt spec requirements to it.
- **Adaptation:** Client-side routing replaces Next.js App Router. SSR/SEO features (sitemap, JSON-LD, next/image, next-seo) are implemented via client-side equivalents or static fallbacks where Bun doesn't support them. All booking/business logic strictly follows staynova_spec.md.

## Money
- All monetary values stored/transacted as integers in **paise** (1 INR = 100 paise). No floats.

## Dates
- All dates stored as DATE (no time) in property local time per spec Section 4.9.

## Payments
- Razorpay is the primary payment provider (INR, UPI/cards/netbanking/wallets). Stripe is secondary behind a `PaymentProvider` interface.

## Background Jobs
- BullMQ with Redis for hold expiry, hold sweeper, inventory generation, stay completion, emails, PDF vouchers.

## Image Storage
- Cloudinary or S3-compatible storage (env-configurable). Falls back to local uploads in dev.

## UI Design System (Section 7.1)
- **Primary color:** `#0F766E` (teal)
- **Accent color:** `#F59E0B` (amber)
- **Typography:** Inter (UI) + Poppins (headings)
- **Radius:** 12–16px cards, soft shadows
- **Dark mode:** Toggle-supported, slate neutrals
- **Responsive:** Mobile-first, sticky bottom CTA bars on mobile

## Routing & Auth
- React Router for client-side routing
- Route protection via wrapper components (RequireAuth, RequireOwner, RequireAdmin, RequireGuest)
- Axios client with token interceptor + auto-refresh on 401

