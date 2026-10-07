# Word Counter

A web app to photograph book pages, extract text via OCR, and count words. Designed as a companion metric for tracking reading progress.

**Live Demo:** [word-counter.ankile.com](https://word-counter.ankile.com)

## Features

- **Book Management** - Create and organize books
- **Firebase Import** - Import books from Book Tracker app
- **Photo Upload** - Drag & drop or select multiple page photos (mobile camera supported)
- **OCR Processing** - Google Cloud Vision extracts text from images
- **Word Counting** - Per-page and total word counts with averages
- **Readability Metrics** - Flesch-Kincaid grade level and reading ease scores
- **OCR Visualization** - Toggle bounding box overlay to see what was detected
- **Lightbox View** - Click any thumbnail to view full-size with OCR overlay

## Tech Stack

- **Frontend**: Next.js 16 + React 19 (React Compiler) + Tailwind CSS 4
- **Backend**: Convex (database + file storage + scheduled OCR actions)
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

### 4. (Optional) Firebase Integration

To import books from a Firebase/Firestore Book Tracker app:

```bash
npx convex env set FIREBASE_SERVICE_ACCOUNT_KEY "$(cat path/to/serviceAccountKey.json)"
```

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

1. Click **+ New Book** to create a book (or import from Book Tracker)
2. Click on the book to open it
3. Upload photos of book pages (drag & drop or click to select)
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
