// Long edge of uploaded page photos. Plenty for OCR of book text, and keeps phone
// photos (12+ MP) small enough for fast mobile uploads and the Vision API size limit.
const MAX_EDGE = 2400;

/** Downscale a photo to a JPEG with at most MAX_EDGE pixels on its long edge, applying EXIF orientation. */
export async function resizeImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return await canvas.convertToBlob({ type: "image/jpeg", quality: 0.85 });
}
