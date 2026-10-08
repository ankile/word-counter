import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { resizeImage } from "./resizeImage";

/**
 * Upload page images to a book: downscale, upload in parallel, then create the pages in the given order
 * (which sets their page numbers) and queue OCR. `onUploaded` fires as each image finishes uploading.
 * With `slots`, image i is the random page slots[i]; otherwise the pages are hand-chosen.
 */
export function useUploadPages(bookId: Id<"books">) {
  const generateUploadUrl = useMutation(api.pages.generateUploadUrl);
  const createPages = useMutation(api.pages.createMany);

  return async (images: Blob[], onUploaded?: () => void, slots?: number[]) => {
    const imageStorageIds = await Promise.all(
      images.map(async (image): Promise<Id<"_storage">> => {
        const resized = await resizeImage(image);
        const response = await fetch(await generateUploadUrl(), {
          method: "POST",
          headers: { "Content-Type": resized.type },
          body: resized,
        });
        const { storageId } = await response.json();
        onUploaded?.();
        return storageId;
      })
    );
    await createPages({ bookId, imageStorageIds, slots });
  };
}
