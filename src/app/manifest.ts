import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Word Counter",
    short_name: "Words",
    description: "Estimate how many words are in a book from a few photographed pages",
    start_url: "/",
    display: "standalone",
    background_color: "#f8f6f1",
    theme_color: "#34506f",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
