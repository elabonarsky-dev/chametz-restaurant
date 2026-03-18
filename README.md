# Restaurant Booking System

A production-ready restaurant booking tool built with Netlify Functions, PostgreSQL, and Stripe. Designed to be embedded on a Squarespace website.

## Quick local setup (Step A)

1. **Install:** `npm install`
2. **Env:** A `.env` file exists; edit it with your values (see below).
3. **PostgreSQL:** Get a DB URL from [Neon](https://neon.tech) or [Supabase](https://supabase.com), put it in `.env` as `DATABASE_URL`, then run `npm run db:init`.
4. **Stripe:** Put your test secret key in `.env` as `STRIPE_SECRET_KEY` (get from [Stripe Dashboard](https://dashboard.stripe.com/apikeys)). For local payment testing you can use `STRIPE_WEBHOOK_SECRET=whsec_placeholder` until you add a webhook.
5. **Admin:** Set `ADMIN_SECRET` in `.env` to any password you’ll use to sign in to `/admin/`.
6. **Run:** `npm run dev` (or `npx netlify dev`). Open http://localhost:8888 for booking, http://localhost:8888/admin/ for admin.

## Architecture

```
Frontend  →  Netlify CDN (static HTML/CSS/JS)
Backend   →  Netlify Functions (serverless Node.js)
Database  →  PostgreSQL (Neon, Supabase, or any managed provider)
Payments  →  Stripe
Geocoding →  Nominatim (OpenStreetMap)
Routing   →  OSRM (Open Source Routing Machine)
```

## Booking Flow

1. Guest enters pickup address
2. System geocodes address and calculates driving time via OSRM
3. If within 60 min → continue; if outside → satellite parking confirmation
4. Guest selects up to 3 preferred dining dates
5. Guest provides details for each party member (name, birthday, beverage pairing, allergies)
6. Under-21 guests are automatically restricted to non-alcoholic pairing
7. Guest pays deposit via Stripe ($50/guest)
8. Booking is stored in PostgreSQL and confirmation is shown

## Project Structure

```
├── netlify/functions/          # Serverless API endpoints
│   ├── check-distance.js       # Address geocoding + travel time
│   ├── create-payment-intent.js # Stripe payment intent
│   ├── create-booking.js       # Store booking + guests
│   ├── get-bookings.js         # Admin: list bookings (paginated)
│   ├── get-booking.js          # Admin: booking detail
│   ├── delete-booking.js       # Admin: delete booking
│   ├── update-booking.js       # Admin: update booking status
│   ├── manage-dates.js         # Admin: open/close dining dates
│   └── get-available-dates.js  # Public: get open dates
├── utils/
│   ├── db.js                   # PostgreSQL connection pool
│   ├── geocode.js              # Nominatim geocoding
│   ├── osrm.js                 # OSRM travel time calculation
│   ├── stripe.js               # Stripe integration
│   ├── auth.js                 # Admin authentication
│   └── validate.js             # Input validation
├── db/
│   ├── schema.sql              # Database schema
│   └── init.js                 # Schema initialization script
├── public/                     # Static frontend files
│   ├── index.html              # Booking flow (customer-facing)
│   ├── admin/index.html        # Admin portal
│   ├── css/style.css           # Booking styles
│   ├── css/admin.css           # Admin styles
│   ├── js/booking.js           # Booking flow logic
│   └── js/admin.js             # Admin portal logic
├── netlify.toml                # Netlify configuration
├── package.json
└── .env.example
```

## Deployment Instructions

### 1. Prerequisites

- [Node.js 18+](https://nodejs.org/)
- [Netlify CLI](https://docs.netlify.com/cli/get-started/)
- A PostgreSQL database (recommended: [Neon](https://neon.tech) or [Supabase](https://supabase.com))
- A [Stripe](https://stripe.com) account
- A [Netlify](https://netlify.com) account

### 2. Clone and Install

```bash
git clone <repository-url>
cd restaurant-booking-system
npm install
```

### 3. Set Up PostgreSQL

Create a new PostgreSQL database (e.g. [Neon](https://neon.tech) or [Supabase](https://supabase.com) free tier). Then in the project root, ensure your `.env` has the correct `DATABASE_URL` and run:

```bash
npm run db:init
```

(This loads `.env` automatically via dotenv.)

### 4. Set Up Stripe

1. Get your API keys from [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Create a webhook endpoint pointing to your deployed URL + `/api/stripe-webhook`
3. Note the webhook signing secret

### 5. Configure Environment Variables

Create a `.env` file based on `.env.example`:

```bash
DATABASE_URL=postgresql://user:password@host:5432/restaurant_booking
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
ADMIN_SECRET=your-secure-random-secret
```

### 6. Configure Stripe Publishable Key

In `public/index.html`, add this meta tag inside `<head>`:

```html
<meta name="stripe-publishable-key" content="pk_test_your_key_here">
```

### 7. Deploy to Netlify

**Option A: Via Netlify CLI**

```bash
# Login to Netlify
npx netlify login

# Create a new site
npx netlify init

# Set environment variables
npx netlify env:set DATABASE_URL "postgresql://..."
npx netlify env:set STRIPE_SECRET_KEY "sk_test_..."
npx netlify env:set STRIPE_WEBHOOK_SECRET "whsec_..."
npx netlify env:set ADMIN_SECRET "your-secret"

# Deploy
npx netlify deploy --prod
```

**Option B: Via Netlify Dashboard**

1. Push code to a GitHub/GitLab repository
2. Go to [app.netlify.com](https://app.netlify.com) → "Add new site" → "Import from Git"
3. Select your repository
4. Build settings:
   - **Build command:** `echo 'No build step'`
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
5. Add environment variables in Site Settings → Environment Variables
6. Deploy

### 8. Local Development

```bash
# Install Netlify CLI globally (if not installed)
npm install -g netlify-cli

# Start local dev server (serves frontend + functions)
npx netlify dev
```

The app will be available at `http://localhost:8888`.

- Booking form: `http://localhost:8888/`
- Admin portal: `http://localhost:8888/admin/`

## Embedding in Squarespace

Add this to a Squarespace Code Block or Custom Code section:

```html
<iframe
  src="https://your-netlify-site.netlify.app"
  width="100%"
  height="800"
  frameborder="0"
  style="border: none; max-width: 100%;"
></iframe>
```

Or use the full-page embed with a custom domain pointed at Netlify.

## API Endpoints

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/api/check-distance` | POST | Public | Geocode address + calculate travel time |
| `/api/create-payment-intent` | POST | Public | Create Stripe PaymentIntent |
| `/api/create-booking` | POST | Public | Store booking + guests |
| `/api/get-available-dates` | GET | Public | Get open dining dates |
| `/api/get-bookings` | GET | Admin | List all bookings (paginated) |
| `/api/get-booking` | GET | Admin | Get booking detail + guests |
| `/api/delete-booking` | DELETE | Admin | Delete booking |
| `/api/update-booking` | PUT | Admin | Update booking status |
| `/api/manage-dates` | GET/POST/PUT | Admin | Manage dining schedule |

Admin endpoints require the header: `Authorization: Bearer <ADMIN_SECRET>`

## Security Notes

- The restaurant's actual location coordinates are stored server-side only and never exposed to the frontend
- Admin endpoints are protected by a bearer token
- Stripe handles all credit card processing (PCI compliant)
- Input validation is performed on both client and server
- SQL queries use parameterized statements to prevent injection
