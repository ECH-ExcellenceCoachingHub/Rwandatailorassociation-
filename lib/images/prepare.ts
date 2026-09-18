/**
 * Preparing a photograph in the browser, before it is ever uploaded.
 *
 * THE CROP HAPPENS HERE, ON THE CLIENT, and that is a deliberate division of
 * labour rather than a shortcut. The membership card is drawn with pdf-lib,
 * which cannot clip a path — so a square photograph would print as a square
 * sitting on top of the artwork instead of filling the circular frame.
 * Something has to cut the circle, and doing it before upload also means a 6MB
 * photograph straight off a phone camera never crosses a Rwandan mobile
 * connection: what is sent is a 512px PNG of a few tens of kilobytes.
 *
 * The same pipeline serves the successor's photograph, which never reaches a
 * card. One code path, one shape on disk, and a face that is recognisable at
 * the warehouse counter either way — a centred passport photograph survives a
 * circular crop, which is what a passport photograph is composed for.
 *
 * NOTHING HERE ESTABLISHES TRUST. The server re-identifies the bytes from
 * their own magic numbers and applies its own limits; see lib/images/photo.ts.
 * This module exists to spare the member a slow upload.
 */

/** Matches the card renderer's expectation: square, and big enough for 300dpi. */
const OUTPUT_PX = 512;

/**
 * Centre-crops to a square, scales to 512px, and masks to a circle.
 *
 * `destination-in` is what cuts the circle: it keeps the photograph only where
 * the subsequently drawn disc is opaque, leaving a transparent surround. PNG,
 * not JPEG, because JPEG has no alpha channel and would fill that surround
 * with black.
 */
export async function toCircularPng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);

  const edge = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - edge) / 2;
  const sy = (bitmap.height - edge) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_PX;
  canvas.height = OUTPUT_PX;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new PhotoPrepareError("CANVAS_UNAVAILABLE");

  ctx.drawImage(bitmap, sx, sy, edge, edge, 0, 0, OUTPUT_PX, OUTPUT_PX);

  ctx.globalCompositeOperation = "destination-in";
  ctx.beginPath();
  ctx.arc(OUTPUT_PX / 2, OUTPUT_PX / 2, OUTPUT_PX / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.fill();

  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/png")
  );
  if (!blob) throw new PhotoPrepareError("ENCODE_FAILED");
  return blob;
}

/**
 * The same photograph as a `data:` URL.
 *
 * Registration is a single JSON request — the applicant is not signed in, so
 * there is no session to hang a separate multipart upload off, and a half-made
 * account holding a photograph is worse than either outcome. Base64 costs a
 * third more bytes, which on a 512px PNG is tens of kilobytes, not megabytes.
 */
export async function toCircularPngDataUrl(file: File): Promise<string> {
  const blob = await toCircularPng(file);

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new PhotoPrepareError("ENCODE_FAILED"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(blob);
  });
}

/**
 * A failure with a reason the caller can translate.
 *
 * The message is a code, not a sentence: every string a member reads comes out
 * of the dictionary in their own language, and an English `Error` thrown from
 * a canvas helper would reach the screen untranslated.
 */
export class PhotoPrepareError extends Error {
  constructor(public readonly code: "CANVAS_UNAVAILABLE" | "ENCODE_FAILED") {
    super(code);
    this.name = "PhotoPrepareError";
  }
}
