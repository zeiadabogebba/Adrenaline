# Adrenaline — Egypt Youth Trips & Booking Platform

`Node.js` · `Express` · `MongoDB` / `Mongoose` · `EJS` · `JWT` · `Cloudinary`

A full-stack trip-booking platform for Egypt's student/youth travel market — travelers browse curated day trips, week-long itineraries, and single-attraction tickets, request a fully custom trip, and book end-to-end with manual payment verification; admins run the catalog, bookings, trip requests, and support desk from a dedicated dashboard. Built as a server-rendered MVC application from scratch (no scaffolding/starter kit), covering the full stack: schema design, auth (including OTP email verification and Google Sign-In), file uploads, external API integration, and production deployment.

---

## The Problem

Booking a trip in Egypt today usually means bouncing between several disconnected surfaces — a tour operator's static brochure site for day trips, a separate agent for multi-day packages, a WhatsApp thread for anything custom, and no unified way to compare, customize, or manage a booking afterward. **Adrenaline** consolidates that into one hub aimed at university and high-school-age travelers: one catalog, one booking flow, and one dashboard to track a trip from selection to payment verification — plus a "Request Your Own" trip builder for travelers who want a custom itinerary instead of a fixed package.

---

## Key Features

**For Travelers**
- Browse day trips, week packages, and single-attraction tickets, each with tier-based pricing (Standard / Deluxe / Full) and admin-defined promo codes
- **Request Your Own** — submit a custom trip request (destination, dates, traveller count, room setup) that lands directly in the admin trip-request inbox with one-tap traveller contact numbers
- A multi-step booking flow (select → traveller details → confirm) with a persistent draft, so an abandoned booking never leaves half-written data behind
- **Manual payment with admin verification** — pay via InstaPay/Vodafone Cash, upload a payment screenshot, and track status through `verifying → half paid → fully paid`
- Email OTP verification on signup, plus Google Sign-In, both against the same account system
- Booking history, cancellation, and post-trip reviews (one review per traveller per package)
- Profile management with avatar upload
- An EGP → USD/EUR/GBP converter on the booking summary, backed by an external API

**For Admins**
- Dashboard KPIs: users, bookings, revenue, open support tickets
- Full CRUD for bookable packages and for the separate editorial "Trips" catalog (upcoming/past trip write-ups with photo galleries), including image upload
- Trip request inbox with per-traveller contact details for fast follow-up
- Booking detail view showing promo code used, original amount, and discounted amount
- Payment verification workflow (review screenshot, confirm amount, move booking through the payment-status lifecycle)
- User management: suspend, change role, delete
- Support ticket inbox with replies
- Analytics & reporting page

**Security**
- JWT held in an httpOnly cookie (7-day expiry) with server-side invalidation on password change
- bcrypt password hashing
- Email OTP verification gate before a new account can log in
- Helmet security headers, MongoDB-injection sanitization, rate limiting
- Role-based access control (Tourist / Admin) enforced at the middleware layer

---

## Architecture

The app follows a classic **MVC** structure — `models/` → `controllers/` → `routes/` → `views/` — server-rendered with EJS rather than a client-side SPA framework. `app.js` is a thin composition root: it wires middleware and mounts feature routers, but owns none of the logic itself. The database connection lives in `config/database.js`, the shared `AppError` class in `utils/AppError.js`, and the centralized error-handling middleware in `middleware/errorHandler.js` — every request still flows through the same pipeline (Helmet → mongo-sanitize → rate limiting on `/api` → body parsing → static assets → feature routers → 404 handler → error handler), just with each concern in its own module instead of inlined in the entry file.

**Authentication** is handled by a small, composable middleware chain rather than one monolithic guard:
- `protect` — requires a valid JWT (read from either an httpOnly cookie *or* an `Authorization: Bearer` header, so the same middleware serves both the browser app and, potentially, a future API client), rejects suspended accounts, and invalidates tokens issued before the user's last password change
- `optionalAuth` — attaches `req.user` if a valid session exists, without blocking anonymous visitors (used on every public page so the nav bar/CTAs can adapt to logged-in state)
- `authorize(...roles)` — a role gate composed on top of `protect` for Admin-only routes

**Error handling** is centralized: a single `AppError` class carries an HTTP status and message, and one error-handling middleware normalizes Mongoose `CastError` / `ValidationError` / duplicate-key errors and JWT errors into consistent responses — then branches automatically between a JSON payload for `/api/*` requests and a rendered HTML error page (`error403` / `404` / `500`) for everything else.

**Data layer**: eight Mongoose models split cleanly along two axes that happen to look similar at a glance — `Package` (the bookable catalog: single/day/week items with tier pricing) is a distinct concept from `Trip` (the editorial upcoming/past trip gallery shown under "Tal3a/Rehla/Pump ur Adrenaline") and `TripRequest` (inbound custom-trip asks from the "Request Your Own" flow). Keeping them as separate models rather than collapsing them into one polymorphic collection kept each schema honest about what it actually needs, instead of accumulating optional fields that only apply to one use case.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Runtime / Framework | Node.js, Express | Minimal, unopinionated — full control over the middleware pipeline |
| Database / ODM | MongoDB, Mongoose | Flexible schema for heterogeneous package/trip types (see [Technical Decisions](#key-technical-decisions)) |
| Views | EJS (server-rendered) | Full HTML on first response, no client build step |
| Auth | JSON Web Tokens (httpOnly cookie), Google OAuth | Stateless — no session store to run or scale |
| Email | Nodemailer (Gmail) | OTP delivery on signup, branded HTML template matching site theme |
| File Storage | Cloudinary + Multer | Persistent, CDN-backed storage on ephemeral hosting, with on-upload image transforms |
| Validation | express-validator | Declarative validation chains, mirrored client-side for instant feedback |
| Security | Helmet, express-mongo-sanitize, express-rate-limit, bcryptjs | Defense-in-depth against common HTTP/NoSQL-injection/brute-force vectors |
| External APIs | exchangerate-api.com | Live currency conversion |
| Deployment | Stateless container + MongoDB Atlas | See [Deployment](#deployment) |

---

## Engineering Highlights

A few implementation details that go beyond basic CRUD:

- **Self-maintaining ratings.** `Review` documents trigger a Mongoose aggregation pipeline (`calcAverageRating`) in `post('save')` / `post('findOneAndDelete')` hooks that recomputes a package's average rating and review count directly in MongoDB. No controller ever manually recalculates a rating — it's structurally impossible for a package's rating to drift out of sync with its reviews.
- **Context-aware image pipelines.** Rather than storing raw uploads and resizing on every request, separate `CloudinaryStorage` configurations apply purpose-built transforms *at upload time* — avatars are cropped to a fixed size, trip/package hero images and gallery photos are capped and quality-optimized on the way in. Every subsequent page load serves an already-optimized asset with zero runtime cost.
- **A real booking state machine**, not a boolean flag: `draft → confirmed`, with `cancelled` reachable from either state, and a parallel `paymentStatus` lane (`verifying → half paid → fully paid`) that tracks the manual payment-verification workflow independently of the booking's own lifecycle. Drafts are real `Booking` documents from the first API call, so a user can leave mid-flow without losing progress, while the bookings-list query filters drafts out so incomplete flows never pollute booking history or admin analytics.
- **Manual payment as a first-class flow, not an afterthought.** After the shelved attempt at automating payment confirmation via a webhook-driven WhatsApp bot, the simpler and more reliable design won out: the traveller uploads a screenshot and reference, and an admin confirms it from a review modal. The `paymentStatus` enum and the admin verification UI are what actually ship.
- **Human-readable, collision-safe booking numbers.** A `pre('save')` hook stamps every confirmed booking with an `EG-<year>-<random5>` identifier at the model layer, so every controller that creates a booking gets one for free.
- **Graceful external-API degradation.** The currency widget is additive: if the upstream API is down, the endpoint fails silently and the widget simply doesn't render — it never breaks the page it lives on.
- **Theme-aware brand mark.** The logo's pulse line stays pure white in both themes (it's the one fixed brand color), while the mountain mark gets an automatically-added dark circular backdrop in light mode — done purely in CSS keyed off a `data-theme` attribute, no duplicate logo assets.
- **Soft deletes for packages** (`status: inactive`) instead of destructive deletion, so historical bookings and reviews that reference a package keep working after it's pulled from the public catalog.

---

## Key Technical Decisions

**Why MongoDB over a relational database.** Day, week, and single-attraction packages share a core shape but diverge in the details — week packages need a `dailyItinerary` array of `{day, title, activities}`, day/single packages need a flat `itinerary` of `{time, activity}`, plus type-specific extras. Modeling that relationally means either a wide table full of nullable columns or several join tables for what is, conceptually, one entity. A single flexible Mongoose schema fits the actual data shape.

**Why server-rendered EJS over a client-side SPA framework.** The app is content- and form-heavy rather than state-heavy, so a full client bundler/router bought little — EJS keeps the MVC boundary explicit (controllers own data, views own presentation), ships working HTML on the first response with no hydration step, and is trivially crawlable. The handful of pages that *are* highly interactive (trip details with live pricing, the booking flow, the OTP modals) use a thin server-rendered shell that a page-specific script populates over `fetch` — SPA-style interactivity scoped to exactly the pages that need it.

**Why JWT-in-httpOnly-cookie over server-side sessions.** No session store (Redis, etc.) to provision or scale — the token itself is the source of truth, verified per-request. The httpOnly cookie keeps the token out of reach of any injected script, while the same middleware also accepts a `Bearer` header, leaving the door open for a non-browser client later without touching the auth layer.

**Why Cloudinary over local disk storage.** Free-tier hosts run containers with ephemeral filesystems — anything written to local disk disappears on the next deploy or restart. Offloading uploads to Cloudinary at request time, with transforms applied server-side via `multer-storage-cloudinary`, means uploaded images survive redeploys and are served from a CDN instead of the app server.

**Why manual payment verification over a payment gateway.** Egyptian youth travel payments run heavily through InstaPay and Vodafone Cash rather than card rails, and the target user base skews toward not holding a card at all. Rather than integrating a gateway that doesn't match how the audience actually pays, the flow leans into what does: upload a screenshot, admin confirms it. It's less automated, but it's the flow that matches reality.

---

## Data Model

| Collection | Purpose |
|---|---|
| `User` | Accounts, bcrypt-hashed passwords, OTP email verification, Google sign-in, role (`Tourist`/`Admin`) and status |
| `Package` | Bookable day/week/single-attraction listings, pricing, itinerary data, auto-maintained rating |
| `Trip` | Editorial upcoming/past trip entries (Tal3a/Rehla/Pump categories) with photo galleries, shown separately from the bookable catalog |
| `TripRequest` | Inbound custom-trip requests from the "Request Your Own" flow |
| `Booking` | Draft → confirmed lifecycle, independent payment-status lifecycle, traveller details, promo code, auto-generated booking number |
| `Review` | One rating+review per user per package (compound unique index), drives package rating |
| `Contact` | Support tickets with status and admin replies |
| `TripOption` | Destination / accommodation / room lookup rows that price the custom-trip builder |

---

## API Overview

REST endpoints are organized by resource, each behind role-appropriate middleware (`protect`, `authorize('Admin')`, or public):

| Resource | Base path | Highlights |
|---|---|---|
| Auth | `/api/auth` | Register + OTP verification, login (sets JWT cookie), Google sign-in, logout — rate-limited |
| Packages | `/api/packages` | Public listing/filtering by type, Admin CRUD + image upload |
| Trips | `/api/trips` | Public upcoming/past trip listings, Admin CRUD + gallery upload |
| Trip Requests | `/api/trip-requests` | Custom-trip submissions, Admin inbox |
| Bookings | `/api/bookings` | Draft → traveller details → confirm, payment screenshot upload, cancellation |
| Reviews | `/api/reviews` | Create/edit/delete, auto-triggers rating recalculation |
| Users | `/api/users` | Profile self-service + Admin user management |
| Contact | `/api/contact` | Ticket submission, status tracking, Admin replies |
| Admin | `/api/admin` | Dashboard KPIs and recent-activity feed |
| External | `/api/external` | Currency conversion |

Every form and admin action in the UI calls these endpoints via `fetch()` and updates the page without a full reload.

---

## Deployment

The app is 12-factor-friendly and deploy-ready as-is: all state lives off-server (MongoDB Atlas for data, Cloudinary for media), configuration is entirely environment-variable driven, and the entry point already binds `0.0.0.0` + `process.env.PORT` for container hosting. That means the app container itself is fully stateless and disposable — pointing any standard Node host at this repo with the right environment variables is a same-day deploy, no code changes required.

---

## Getting Started

```bash
git clone <repo-url>
cd adrenaline
npm install
cp .env.example .env   # fill in MONGO_URL, JWT_SECRET, CLOUDINARY_*, EMAIL_*, GOOGLE_CLIENT_ID
npm run dev             # or: npm start
```

Open **http://localhost:3000**. `.env.example` lists every variable the app reads.

---

*Originally built for SWE230 (Web Application Programming), then taken further, rebranded, and deployed independently.*
