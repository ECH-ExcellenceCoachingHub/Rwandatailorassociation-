import { probeImage, type ProbedImage } from "@/lib/images/probe";

/**
 * Accepting a photograph that arrived inside a JSON body.
 *
 * Registration and desk enrolment both submit one JSON document — the
 * applicant is not signed in, and an administrator is filling in a whole
 * member file at once. A separate multipart upload would mean a half-made
 * record holding a photograph, or a photograph holding no record.
 *
 * WHAT THE CLIENT SAYS IS DISCARDED. The `data:` prefix names a media type,
 * and that name is a claim by whoever is uploading; "image/png" on a file that
 * is not one is the oldest trick there is. What gets stored is what the magic
 * bytes turned out to be, or nothing at all.
 */

/** Generous for a 512px PNG with alpha, mean for anything that is not one. */
export const MAX_PHOTO_BYTES = 1024 * 1024;

/** Below this the photograph is too soft to print at 300dpi on a card. */
const MIN_EDGE_PX = 128;

/** Above this someone is storing a wallpaper in the accounts database. */
const MAX_EDGE_PX = 2048;

/**
 * The longest `data:` URL worth decoding.
 *
 * Base64 costs a third more than the bytes it carries, and the check has to
 * happen on the string: decoding first would mean allocating whatever was
 * sent before deciding it was too big.
 */
export const MAX_PHOTO_DATA_URL_LENGTH = Math.ceil(MAX_PHOTO_BYTES * 1.4);

/** Cheap enough to run inside a zod schema, on a string of any length. */
export const PHOTO_DATA_URL_PATTERN = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/;

export interface AcceptedPhoto {
  /// A plain `Uint8Array` over its own buffer, which is what Prisma's `Bytes`
  /// column takes. A `Buffer` decoded from base64 may be a window onto a
  /// larger pooled allocation, and its type reflects that.
  data: Uint8Array<ArrayBuffer>;
  mimeType: ProbedImage["mimeType"];
  sizeBytes: number;
  width: number;
  height: number;
}

export type PhotoResult =
  | { ok: true; photo: AcceptedPhoto }
  | { ok: false; message: string };

/**
 * Decodes and vets one `data:` URL.
 *
 * Returns a message rather than throwing: a photograph that is the wrong shape
 * is the applicant's mistake to correct, so it belongs beside the field on the
 * form, not in an error log.
 */
export function acceptPhotoDataUrl(value: string): PhotoResult {
  if (!PHOTO_DATA_URL_PATTERN.test(value)) {
    return { ok: false, message: "That file is not a PNG or JPEG image." };
  }

  if (value.length > MAX_PHOTO_DATA_URL_LENGTH) {
    return { ok: false, message: "That photograph is too large. The limit is 1MB." };
  }

  const base64 = value.slice(value.indexOf(",") + 1);

  let data: Uint8Array<ArrayBuffer>;
  try {
    const decoded = Buffer.from(base64, "base64");
    data = new Uint8Array(decoded.length);
    data.set(decoded);
  } catch {
    return { ok: false, message: "That photograph could not be read." };
  }

  if (data.length === 0) {
    return { ok: false, message: "That photograph could not be read." };
  }
  if (data.length > MAX_PHOTO_BYTES) {
    return { ok: false, message: "That photograph is too large. The limit is 1MB." };
  }

  // What the upload actually is, rather than what it claimed to be.
  const probed = probeImage(data);
  if (!probed) {
    return { ok: false, message: "That file is not a PNG or JPEG image." };
  }

  const longestEdge = Math.max(probed.width, probed.height);
  if (longestEdge < MIN_EDGE_PX) {
    return {
      ok: false,
      message: `That image is only ${probed.width}×${probed.height}. A photograph needs to be at least ${MIN_EDGE_PX} pixels across.`,
    };
  }
  if (longestEdge > MAX_EDGE_PX) {
    return {
      ok: false,
      message: `That image is ${probed.width}×${probed.height}, which is larger than a card needs.`,
    };
  }

  return {
    ok: true,
    photo: {
      data,
      mimeType: probed.mimeType,
      sizeBytes: data.length,
      width: probed.width,
      height: probed.height,
    },
  };
}
