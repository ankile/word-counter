// Long edge of uploaded page photos. Plenty for OCR of book text, and keeps phone
// photos (12+ MP) small enough for fast mobile uploads and the Vision API size limit.
const MAX_EDGE = 2400;

/** Downscale a photo to a JPEG with at most MAX_EDGE pixels on its long edge, applying EXIF orientation. */
export async function resizeImage(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch((error: DOMException) => {
    // Unsupported formats and damaged files are expected user input.
    if (error.name !== "InvalidStateError") throw error;
    const heic = /hei[cf]/i.test(file.type) || (file instanceof File && /\.hei[cf]$/i.test(file.name));
    throw new Error(heic
      ? "This browser cannot read HEIC photos. Export the photo as JPG or PNG and choose it again."
      : "This photo could not be read. Choose another image or export it as JPG or PNG.");
  });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}
