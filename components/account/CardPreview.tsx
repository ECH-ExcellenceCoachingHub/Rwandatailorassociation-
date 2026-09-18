import { CARD, FRONT, TEMPLATE_URLS } from "@/lib/cards/geometry";

/**
 * What the printed card will look like, drawn on screen.
 *
 * AN SVG, NOT HTML AND CSS. The card is a fixed composition measured in
 * fractions of itself, and an SVG viewBox is exactly that: one coordinate
 * system that scales to whatever width the page gives it, with no reliance on
 * container-query units or font-size inheritance to keep a caption where the
 * designer put it. It also gets the photograph's circular crop for free
 * through `clipPath`, which HTML would need `overflow: hidden` gymnastics for.
 *
 * THE NUMBERS COME FROM THE SAME PLACE THE PDF READS. Positions come from
 * `FRONT`, and the type sizes are measured by the PDF renderer itself and
 * handed in — so a name long enough to be shrunk is shrunk identically here.
 * A preview that quietly disagreed with the file would be worse than no
 * preview at all, because it would be believed.
 */

const VIEW = CARD.templatePx;

/** Fraction of card width → template pixels. */
const px = (fraction: number) => fraction * VIEW.width;
/** Fraction of card height → template pixels. */
const py = (fraction: number) => fraction * VIEW.height;

export interface CardPreviewProps {
  displayName: string;
  title: string;
  phone: string;
  /// Pre-rendered QR as an SVG data URI, or null when there is none to show.
  qrDataUri: string | null;
  /// Where the browser can fetch the holder's photograph, if they have one.
  photoUrl: string | null;
  /// Type sizes as fractions of card height, measured by the PDF renderer.
  sizes: { name: number; title: number; phone: number };
  /// Shown in the code's place when `qrDataUri` is null, so a card with no
  /// code does not read as one whose code failed to draw. The admin card
  /// register uses this for members who are not active and so get no code.
  qrPlaceholder?: string;
  /// Unique per preview on the page. Two previews sharing a clip-path id would
  /// both clip to whichever the browser found first.
  clipId?: string;
}

export function CardFrontPreview({
  displayName,
  title,
  phone,
  qrDataUri,
  photoUrl,
  sizes,
  qrPlaceholder,
  clipId = "card-photo-clip",
}: CardPreviewProps) {
  const photoR = py(FRONT.photo.r);
  const photoCx = px(FRONT.photo.cx);
  const photoCy = py(FRONT.photo.cy);
  const qrSize = px(FRONT.qr.size);
  const qrMarkSize = FRONT.qrLogo.size * qrSize;
  const qrMarkX = px(FRONT.qr.x) + (qrSize - qrMarkSize) / 2;
  const qrMarkY = py(FRONT.qr.y) + (qrSize - qrMarkSize) / 2;
  const qrMarkPad = qrMarkSize * 0.08;

  // pdf-lib places the baseline one em below the box's top edge; mirroring
  // that here is what keeps the two renderings on the same line.
  const baseline = (box: { y: number }, size: number) => py(box.y) + py(size);

  return (
    <svg
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      className="block h-auto w-full rounded-xl border border-border shadow-card"
      role="img"
      aria-label={`Membership card for ${displayName}`}
    >
      <title>{`Membership card — ${displayName}`}</title>

      <image
        href={TEMPLATE_URLS.front}
        x={0}
        y={0}
        width={VIEW.width}
        height={VIEW.height}
      />

      {/* The artwork draws the blue ring; the photograph fills the white disc
          inside it. Clipped rather than assumed circular, so the preview is
          honest even about an image that has not been cropped. */}
      {photoUrl && (
        <>
          <defs>
            <clipPath id={clipId}>
              <circle cx={photoCx} cy={photoCy} r={photoR} />
            </clipPath>
          </defs>
          <image
            href={photoUrl}
            x={photoCx - photoR}
            y={photoCy - photoR}
            width={photoR * 2}
            height={photoR * 2}
            preserveAspectRatio="xMidYMid slice"
            clipPath={`url(#${clipId})`}
          />
        </>
      )}

      {/* Code, then the blue keyline over its quiet zone, then the
          association's mark on a white ground — the same three passes, in the
          same order, as the PDF renderer. */}
      {qrDataUri && (
        <>
          <image
            href={qrDataUri}
            x={px(FRONT.qr.x)}
            y={py(FRONT.qr.y)}
            width={qrSize}
            height={qrSize}
          />
          <rect
            x={px(FRONT.qr.x)}
            y={py(FRONT.qr.y)}
            width={qrSize}
            height={qrSize}
            fill="none"
            stroke="#1c80d4"
            strokeWidth={px(FRONT.qrFrame.stroke)}
          />
          <rect
            x={qrMarkX - qrMarkPad}
            y={qrMarkY - qrMarkPad}
            width={qrMarkSize + qrMarkPad * 2}
            height={qrMarkSize + qrMarkPad * 2}
            fill="#ffffff"
          />
          <image
            href="/images/rtalogo.jpg"
            x={qrMarkX}
            y={qrMarkY}
            width={qrMarkSize}
            height={qrMarkSize}
          />
        </>
      )}

      {!qrDataUri && qrPlaceholder && (
        <>
          <rect
            x={px(FRONT.qr.x)}
            y={py(FRONT.qr.y)}
            width={qrSize}
            height={qrSize}
            fill="#f1f5f9"
            stroke="#1c80d4"
            strokeWidth={px(FRONT.qrFrame.stroke)}
            strokeDasharray={`${qrSize / 12} ${qrSize / 18}`}
          />
          <text
            x={px(FRONT.qr.x) + qrSize / 2}
            y={py(FRONT.qr.y) + qrSize / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={qrSize / 4}
            fontFamily="Helvetica, Arial, sans-serif"
            fontWeight="bold"
            fill="#94a3b8"
          >
            {qrPlaceholder}
          </text>
        </>
      )}

      <text
        x={px(FRONT.name.x)}
        y={baseline(FRONT.name, sizes.name)}
        fontSize={py(sizes.name)}
        fontFamily="Helvetica, Arial, sans-serif"
        fill="#212126"
      >
        {displayName}
      </text>

      <text
        x={px(FRONT.title.x)}
        y={baseline(FRONT.title, sizes.title)}
        fontSize={py(sizes.title)}
        fontFamily="Helvetica, Arial, sans-serif"
        fontWeight="bold"
        fill="#212126"
      >
        {title}
      </text>

      {phone && (
        <text
          x={px(FRONT.phone.x)}
          y={baseline(FRONT.phone, sizes.phone)}
          fontSize={py(sizes.phone)}
          fontFamily="Helvetica, Arial, sans-serif"
          fill="#29292e"
        >
          {phone}
        </text>
      )}

      <text
        x={px(FRONT.tag.right)}
        y={baseline(FRONT.tag, FRONT.tag.size)}
        textAnchor="end"
        fontSize={py(FRONT.tag.size)}
        fontFamily="Helvetica, Arial, sans-serif"
        fontWeight="bold"
        fill="#ffffff"
      >
        {FRONT.tag.text}
      </text>
    </svg>
  );
}

/**
 * The back. Nothing on it varies, so it is the artwork and nothing else — the
 * preview is the image, which is the honest representation of the file.
 */
export function CardBackPreview() {
  return (
    <svg
      viewBox={`0 0 ${VIEW.width} ${VIEW.height}`}
      className="block h-auto w-full rounded-xl border border-border shadow-card"
      role="img"
      aria-label="Back of the membership card"
    >
      <image
        href={TEMPLATE_URLS.back}
        x={0}
        y={0}
        width={VIEW.width}
        height={VIEW.height}
      />
    </svg>
  );
}
