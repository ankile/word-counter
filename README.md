# Word Counter

A web app to photograph book pages, extract text via OCR, and count words. Designed as a companion metric for tracking reading progress.

**Live Demo:** [word-counter.ankile.com](https://word-counter.ankile.com)

## Features

- **Book Management** - Create and organize books
- **Book Tracker Sync** - Sign in with your [Book Tracker](https://book.ankile.com) account; your library syncs automatically
- **Phone-friendly** - Take page photos straight from the camera (photos are downscaled before upload); add to your home screen
- **Photo Upload** - Drag & drop or select multiple page photos (mobile camera supported)
- **OCR Processing** - Google Cloud Vision extracts text from images
- **Word Counting** - Per-page and total word counts with averages
- **Readability Metrics** - Flesch-Kincaid grade level and reading ease scores
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

### Checks

```bash
npm run check   # typecheck (TypeScript 7) + lint (ESLint + Convex rules) + tests (Vitest)
```

### End-to-end tests

```bash
npm run e2e:setup   # once: synthetic accounts, App Check debug token, credentials in .env.local
npm run test:e2e    # Playwright, desktop Chrome + iPhone WebKit, against `next dev` + Convex dev
E2E_BASE_URL=https://word-counter.ankile.com npm run test:e2e   # same suite against production
```

The suite signs in as two synthetic Book Tracker accounts (`word-counter-e2e-a/b@example.com`,
fixed UIDs) whose tracker libraries are reseeded before every test (`e2e/fixtures/library.ts`).
`e2e/testAccounts.ts` provisions them through the Book Tracker operator's `gcloud` login (no service
account keys). `convex/testing.ts` wipes only those accounts' word-counter data. Seeded books have no
catalog work links, so Book Tracker never lists the test accounts as readers.

Required Convex environment variables are declared in `convex/convex.config.ts`; deploys fail if one is missing.

## Deployment

The app is deployed to Vercel with automatic deploys from the `main` branch:

- **Frontend**: Vercel (connected to GitHub)
- **Backend**: Convex Cloud
- **Domain**: [word-counter.ankile.com](https://word-counter.ankile.com)

To deploy changes:

```bash
# Deploy Convex functions (before the frontend, so new API functions exist)
npm run deploy:convex

# Push to GitHub (triggers Vercel deploy)
git push origin main
```

## Usage

1. Sign in with your Book Tracker account; your books sync automatically
2. Search or filter, then open a book
3. Take photos of a few pages (or choose/drop photos)
4. Watch OCR process each page in real-time
5. View word counts per page and total for the book
6. Check readability metrics (grade level, reading ease)
7. Click **Show OCR** to visualize what was detected
8. Click any thumbnail to view full-size

## Text Cleaning

The OCR output is cleaned with light heuristics:
- Removes standalone page numbers
- Removes short all-caps lines (headers)
- Rejoins hyphenated words at line breaks

## License

MIT
