# Word Counter

A web app to photograph book pages, extract text via OCR, and count words. Designed as a companion metric for tracking reading progress.

## Features

- **Book Management** - Create and organize books
- **Photo Upload** - Drag & drop or select multiple page photos (mobile camera supported)
- **OCR Processing** - Google Cloud Vision extracts text from images
- **Word Counting** - Per-page and total word counts with averages
- **OCR Visualization** - Toggle bounding box overlay to see what was detected
- **Lightbox View** - Click any thumbnail to view full-size with OCR overlay

## Tech Stack

- **Frontend**: Next.js 16 + React + Tailwind CSS
- **Backend**: Convex (database + file storage + serverless functions)
- **OCR**: Google Cloud Vision API

## Setup

### Prerequisites

- Node.js 18+
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

### 4. Run Development Server

In two terminals:

```bash
# Terminal 1: Convex backend
npx convex dev

# Terminal 2: Next.js frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Usage

1. Click **+ New Book** to create a book
2. Click on the book to open it
3. Upload photos of book pages (drag & drop or click to select)
4. Watch OCR process each page in real-time
5. View word counts per page and total for the book
6. Click **Show OCR** to visualize what was detected
7. Click any thumbnail to view full-size

## Text Cleaning

The OCR output is cleaned with light heuristics:
- Removes standalone page numbers
- Removes short all-caps lines (headers)
- Rejoins hyphenated words at line breaks
