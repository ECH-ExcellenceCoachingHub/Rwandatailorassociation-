/**
 * Membership card geometry.
 *
 * CR80 — 85.6 × 54 mm — because that is what card printers, wallets and badge
 * holders are built for. At 300dpi that is 1011 × 638 px, which is within a
 * few pixels of the artwork this was drawn from, so a supplied template drops
 * in without distortion.
 *
 * EVERY POSITION BELOW IS A FRACTION OF THE CARD, not a pixel or a millimetre.
 * The artwork is authored at some resolution nobody here controls and may be
 * re-exported at another; fractions survive that, absolute coordinates do not.
 * They are also what makes the layout tunable — nudging the name is a decimal
 * change here, not arithmetic in the renderer.
 */

/** Millimetres to PDF points (72 per inch). */
const MM_TO_PT = 72 / 25.4;

export const CARD = {
  widthMm: 85.6,
  heightMm: 54,
  get widthPt() {
    return this.widthMm * MM_TO_PT;
  },
  get heightPt() {
    return this.heightMm * MM_TO_PT;
  },
  /** What a supplied template should be exported at, for a 300dpi print. */
  templatePx: { width: 1011, height: 638 },
} as const;

/**
 * Where the live fields sit on the front.
 *
 * `x`/`y` are the top-left of the box as a fraction of card width/height —
 * top-left because that is how the artwork reads, even though PDF measures
 * from the bottom. The renderer does that flip once, so these stay readable
 * against the design.
 *
 * `size` is a fraction of card HEIGHT for text (type scales with the short
 * edge) and of card WIDTH for boxes (the QR is square against the long edge).
 */
export const FRONT = {
  /**
   * Holder's name, family name first — the order a Rwandan card reads in, and
   * the reverse of how the app addresses someone on screen.
   */
  name: { x: 0.0605, y: 0.2, size: 0.0705, maxWidth: 0.46 },
  /**
   * Office held, or the role label when the holder holds no office. Narrower
   * than the name: this line and the ID below it sit beside the QR's top edge.
   */
  title: { x: 0.0605, y: 0.288, size: 0.0304, maxWidth: 0.285 },
  /** Membership number, e.g. "ID: RTA-M000123", in the artwork's blue. */
  idNumber: { x: 0.0605, y: 0.333, size: 0.027, maxWidth: 0.285 },
  /**
   * The holder's own number, beside the telephone icon. Same left edge as the
   * artwork's "www.rta.rw", and its caps centred on the icon.
   */
  phone: { x: 0.128, y: 0.442, size: 0.0337, maxWidth: 0.215 },
  /**
   * Where the holder lives, beside the location pin. Its baseline is the one
   * the artwork's own "Kigali/Rwanda" sat on; its right edge stops short of the
   * QR, so a long district name is shrunk rather than run under the code.
   */
  location: { x: 0.128, y: 0.6633, size: 0.0337, maxWidth: 0.215 },
  /**
   * White patch over the "Kigali/Rwanda" printed in the supplied artwork, so
   * the live location can take its place. The ground there is plain white.
   * Drop this once the association supplies artwork without that text.
   */
  locationMask: { x: 0.1226, y: 0.6593, width: 0.1464, height: 0.0597 },
  /**
   * Sign-in QR. Square, so sized against the card's long edge. The box is the
   * OUTER edge of the blue frame; the code fills it, and its own four-module
   * quiet zone supplies the white margin inside the frame.
   *
   * Set in the white between the contact lines and the photograph: clear of
   * the name above, the photograph's ring to the right and the wave below,
   * which leaves the contact lines their full width.
   */
  qr: { x: 0.361, y: 0.322, size: 0.168 },
  /** The blue keyline around the code, matching the artwork's own boxes. */
  qrFrame: { stroke: 0.0045 },
  /**
   * The association's mark, set in the middle of the code.
   *
   * Safe because the code is generated at error-correction level Q, which
   * recovers from roughly a quarter of the symbol being lost. With its white
   * padding this mark spans 23.2% of the image width — 5.4% of its area.
   *
   * Measured, not assumed: decoding the real 37x37 symbol with the centre
   * blanked succeeds at 23.2% and still succeeds at 30%, and fails at 40%.
   * There is therefore room here, but not unlimited room — anything past about
   * a third of the width starts trading away scans for decoration.
   */
  qrLogo: { size: 0.2 },
  /**
   * Photograph. The artwork already draws the blue ring; this is the white
   * disc inside it, which the photograph has to fill exactly — a radius a few
   * thousandths out reads as a badly cut-out face.
   */
  photo: { cx: 0.7051, cy: 0.5128, r: 0.2436 },
  /**
   * "STGT", the same on every card. Set in white in the solid blue of the
   * bottom-right corner — below the photograph's ring and right of the pale
   * diagonal stripe — which is the one clear area of the artwork that no live
   * field shares. Anchored by its RIGHT edge (`right`), so a change of wording
   * grows leftwards into the blue rather than off the edge of the card.
   */
  tag: { text: "STGT", right: 0.94, y: 0.85, size: 0.056 },
} as const;

/** Location printed when the holder has none on file. */
export const CARD_DEFAULT_LOCATION = "Rwanda";

/**
 * The location line for a holder, from their member address.
 *
 * District first, because that is what places someone in Rwanda — then
 * "Kigali" for the capital's three districts and "Rwanda" elsewhere, which
 * keeps every line short enough for the space beside the pin. A full
 * "Nyamasheke, Western Province" would be shrunk to an unreadable size.
 */
export function cardLocation(address: {
  district: string | null;
  city: string | null;
  province: string | null;
} | null): string {
  const district = address?.district?.trim();
  const city = address?.city?.trim();
  const province = address?.province?.trim().toLowerCase() ?? "";
  const region = province.startsWith("kigali") ? "Kigali" : CARD_DEFAULT_LOCATION;

  const place = district || city;
  if (place && place.toLowerCase() !== region.toLowerCase()) return `${place}, ${region}`;
  if (place) return place;
  return province.startsWith("kigali") ? "Kigali, Rwanda" : CARD_DEFAULT_LOCATION;
}

/**
 * The back carries no per-holder data at all — the same association name, the
 * same Kinyarwanda notice, the same two numbers to ring if a card is found.
 * It is a flat image, so this file has nothing to say about it beyond the page
 * size above.
 */
export const CARD_SIDES = ["front", "back"] as const;
export type CardSide = (typeof CARD_SIDES)[number];

/**
 * The association's artwork, composited under the live fields.
 *
 * JPEGs at the repository root of `public/`, which is where they were
 * supplied. They are 1011x637 — within a rounding error of CR80 at 300dpi, so
 * they fill the page without distortion.
 */
export const TEMPLATE_FILES: Record<CardSide, string> = {
  front: "front.jpg",
  back: "back.jpg",
};

/** Browser-reachable paths for the same artwork, used by the live preview. */
export const TEMPLATE_URLS: Record<CardSide, string> = {
  front: "/front.jpg",
  back: "/back.jpg",
};
