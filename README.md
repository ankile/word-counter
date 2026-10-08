# Word Counter

A web app to photograph book pages, extract text via OCR, and count words. Designed as a companion metric for tracking reading progress.

**Live Demo:** [word-counter.ankile.com](https://word-counter.ankile.com)

## Features

- **Book Tracker Sync** - Sign in with your [Book Tracker](https://book.ankile.com) account; your library syncs automatically
- **Scan Pages** - On phones, a full-screen camera for snapping page after page; each shot uploads in the background while you take the next
- **Phone-friendly** - Photos are downscaled before upload; add the site to your home screen
- **Photo Upload** - Drag & drop or select multiple page photos
- **OCR Processing** - Google Cloud Vision extracts text from images
- **Word Counting** - Per-page and total word counts with averages
- **Words per Page** - A 95% interval for the book's average words per printed page. A few randomly drawn pages (blank ones and chapter openings included) correct the high bias of hand-picked full pages ([method](docs/book-tracker-word-estimates.md))
- **Send to Book Tracker** - Publish a precise enough estimate (±20%, ±10% recommended) to the book's catalog edition
- **Readability Metrics** - Flesch-Kincaid grade level and reading ease scores (English books only)
- **Unique Words** - Estimates the book's total vocabulary by fitting the new-words-per-page curve and extending it to the last page, with a chart ([method and validation](docs/vocabulary.md))
- **OCR Visualization** - Toggle bounding box overlay to see what was detected
- **Lightbox View** - Click any thumbnail to view full-size with OCR overlay

## Tech Stack

- **Frontend**: Next.js 16 + React 19 (React Compiler) + Tailwind CSS 4
- **Backend**: Convex (database + file storage + scheduled OCR actions)
- **Auth & library**: Book Tracker's Firebase project (Firebase Auth + Firestore, App Check via reCAPTCHA Enterprise)
- **OCR**: Google Cloud Vision API
- **Hosting**: Vercel

## Setup

### Prerequisites

- Node.js 22+
- Google Cloud account with Vision API enabled
- Convex account (free tier works)
- For e2e tests: `gcloud` logged in as the Book Tracker operator (see [docs/testing.md](docs/testing.md))

### 1. Clone and Install

```bash
git clone https://github.com/ankile/word-counter.git
cd word-counter
npm install
```

### 2. Set up Convex

```bash
npx convex dev
```

This will prompt you to log in to Convex and create a project. It automatically adds `NEXT_PUBLIC_CONVEX_URL` to `.env.local`.

### 3. Add Google Cloud Vision API Key

Get an API key from [Google Cloud Console](https://console.cloud.google.com/apis/credentials) with Vision API enabled.

Add it to Convex:

```bash
npx convex env set GCP_VISION_API_KEY "your-api-key-here"
```

### 4. Book Tracker integration

Users sign in with their Book Tracker (Firebase Auth) account. The browser reads the user's
`users/{uid}/books` from Firestore under Book Tracker's own security rules and mirrors it into
Convex; Convex verifies the Firebase ID token (`convex/auth.config.ts`) and scopes every book to its owner.

The `word-counter` web app is registered in the `book-tracker-d8f24` Firebase project with its own
reCAPTCHA Enterprise key (`word-counter-appcheck`, allowed on `word-counter.ankile.com` and `localhost`)
because Book Tracker enforces App Check on Auth and Firestore. Config lives in `src/app/lib/firebase.ts`.

### 5. Run Development Server

In two terminals:

```bash
# Terminal 1: Convex backend
npx convex dev

# Terminal 2: Next.js frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### Testing

```bash
npm run check       # typecheck (TypeScript 7) + lint (ESLint + Convex rules) + unit tests (Vitest)
npm run e2e:setup   # once: synthetic Book Tracker accounts, App Check debug token, credentials in .env.local
npm run test:e2e    # Playwright (desktop Chrome + iPhone WebKit) against `next dev` + Convex dev
E2E_BASE_URL=https://word-counter.ankile.com npm run test:e2e   # same suite against production
```

The e2e suite drives the real app as two synthetic Book Tracker accounts (`word-counter-e2e-a/b@example.com`)
with reseeded libraries and real OCR. [docs/testing.md](docs/testing.md) covers one-time setup, how the accounts and
fixtures work, the release checklist, troubleshooting, and every resource word-counter relies on in the Book
Tracker Firebase project.

Required Convex environment variables are declared in `convex/convex.config.ts`; deploys fail if one is missing.

## Deployment

The app is deployed to Vercel with automatic deploys from the `main` branch:

- **Frontend**: Vercel (connected to GitHub)
- **Backend**: Convex Cloud
- **Domain**: [word-counter.ankile.com](https://word-counter.ankile.com)
- **Preview deploys** (pull requests) build against the Convex dev deployment. They can't sign in: Book Tracker's
  App Check reCAPTCHA key only allows word-counter.ankile.com and localhost.

To deploy changes (full release checklist in [docs/testing.md](docs/testing.md#release-checklist)):

```bash
# Deploy Convex functions (before the frontend, so new API functions exist)
npm run deploy:convex

# Push to GitHub (triggers Vercel deploy)
git push origin main
```

## Usage

1. Sign in with your Book Tracker account; your books sync automatically
2. Search or filter, then open a book
3. Tap **Scan Pages** and photograph several pages back to back (or choose/drop photos)
4. Watch OCR process each page in real-time
5. View word counts per page and total for the book
6. Check readability metrics (grade level, reading ease)
7. Click **Show OCR** to visualize what was detected
8. Click any thumbnail to view full-size

## Text Cleaning

The OCR output is cleaned with light heuristics:
- Removes standalone page numbers
- Removes short all-caps lines (headers)
- Removes running headers that match the book's title or author (with or without a page number)
- Rejoins hyphenated words at line breaks

## License

MIT
