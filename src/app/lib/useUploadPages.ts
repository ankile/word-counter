import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { resizeImage } from "./resizeImage";

export interface UploadFailure {
  image: Blob;
  slot: number | undefined;
  message: string;
}

export const imageName = (image: Blob) => image instanceof File ? image.name : "Captured photo";

/**
 * Upload page images to a book: downscale, upload in parallel, then create the pages in the given order
 * (which sets their page numbers) and queue OCR. `onUploaded` fires as each image finishes uploading.
 * With `slots`, image i is the random page slots[i]; otherwise the pages are hand-chosen.
 */
export function useUploadPages(bookId: Id<"books">) {
  const generateUploadUrl = useMutation(api.pages.generateUploadUrl);
  const createPages = useMutation(api.pages.createMany);

  return async (images: Blob[], onUploaded?: () => void, slots?: number[]) => {
    const results = await Promise.allSettled(
      images.map(async (image): Promise<Id<"_storage">> => {
        const resized = await resizeImage(image);
        const response = await fetch(await generateUploadUrl(), {
          method: "POST",
          headers: { "Content-Type": resized.type },
          body: resized,
        });
        if (!response.ok) throw new Error(`Photo upload failed (${response.status}). Please retry.`);
        const { storageId } = await response.json();
        onUploaded?.();
        return storageId;
      })
    );
    const uploaded = results.flatMap((result, i) => result.status === "fulfilled" ? [{ id: result.value, slot: slots?.[i] }] : []);
    if (uploaded.length > 0) {
      await createPages({ bookId, imageStorageIds: uploaded.map((p) => p.id), slots: slots ? uploaded.map((p) => p.slot!) : undefined });
    }
    // Keep successful photos; callers retry only the failed files.
    return results.flatMap((result, i): UploadFailure[] => result.status === "rejected"
      ? [{ image: images[i], slot: slots?.[i], message: (result.reason as Error).message }]
      : []);
  };
}
