import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFImage,
  type PDFPage,
} from "pdf-lib";
import { prisma } from "@/lib/db/prisma";
import { renderQrPng } from "@/lib/qr";
import {
  getActiveQrCode,
  getActiveQrCodes,
  issueQrCode,
  type ActiveQrCode,
  type QrActor,
} from "@/lib/auth/qr-access";
import { toLocalPhone } from "@/lib/phone";
import { probeImage } from "@/lib/images/probe";
import { CARD, FRONT, TEMPLATE_FILES, type CardSide } from "@/lib/cards/geometry";
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Membership cards, as printable PDFs.
 *
 * TWO SIDES, TWO FILES, ON PURPOSE. A card is printed in two passes through a
 * card printer — or on two sheets at a print shop — and whoever operates it
 * needs one file per pass. A single two-page PDF invites printing the back
 * onto a second blank card.
 *
 * THE BACK CARRIES NOTHING PERSONAL. Same association, same Kinyarwanda
 * notice, same two numbers to ring if a card is found in the street. It is
 * therefore the artwork and nothing else, which is why `renderCardBack` takes
 * no arguments at all.
 *
 * The front composites five live fields onto the supplied artwork: the name,
 * the office, the holder's own telephone number, their sign-in QR and their
 * photograph. Everything else on that side — logo, header, swoosh, icons,
 * "www.rta.rw", "Kigali/Rwanda", the signature — is identical on every card
 * and belongs in the artwork rather than in this file.
 */

const TEMPLATE_DIR = path.join(process.cwd(), "public");

/** Ink colours sampled from the association's artwork. */
const INK = {
  name: rgb(0.13, 0.13, 0.15),
  body: rgb(0.16, 0.16, 0.18),
  placeholder: rgb(0.85, 0.88, 0.92),
  /// The artwork's mid blue, used for the keyline around the code.
  frame: rgb(0.11, 0.5, 0.83),
} as const;

/** The association's mark, for the middle of the QR. Null if it is missing. */
async function loadLogo(): Promise<Uint8Array | null> {
  try {
    const file = await fs.readFile(path.join(TEMPLATE_DIR, "images", "rtalogo.jpg"));
    return new Uint8Array(file);
  } catch {
    return null;
  }
}

/**
 * What the line under the holder's name says when no office is recorded.
 *
 * KINYARWANDA, AND NOT TRANSLATED. Everything else on the card that is words
 * rather than data — the notice on the back, the numbers to ring — is printed
 * in Kinyarwanda, because that is the language the people carrying these cards
 * read. Translating this one line would also make the card depend on whichever
 * language the reader happened to have selected when they pressed download,
 * so the same member could hold two different cards. A printed card is not a
 * screen; it says one thing for its whole life.
 */
export const CARD_DEFAULT_TITLE = "Umunyamuryango";

export interface MembershipCardData {
  /// Family name first — the order the printed card reads in, which is the
  /// reverse of how the app addresses someone on screen.
  displayName: string;
  /// Office held, or the role label when the holder has no office.
  title: string;
  /// The holder's own number, in the local 0788… form the card is printed in
  /// rather than the E.164 the database stores. Empty when none is on file.
  phone: string;
  /// URL the QR encodes: the same sign-in link as the account's QR page.
  qrUrl: string;
  /// Circular PNG with an alpha channel, or null when no photograph is set.
  photo: { bytes: Uint8Array; mimeType: string } | null;
}

/** The three printed lines of the front, in the form the card prints them. */
export type CardText = Pick<MembershipCardData, "displayName" | "title" | "phone">;

/**
 * The printed lines, from the user record they come from.
 *
 * Separate from `getMembershipCardData` so the admin card register can show
 * what every card says without issuing anybody a sign-in code just to look.
 */
export function cardTextFor(user: {
  firstName: string;
  lastName: string;
  title: string | null;
  phone: string | null;
}): CardText {
  return {
    // "Nshimiyimana Daniel": family name, then given name.
    displayName: `${user.lastName} ${user.firstName}`.trim(),
    title: user.title?.trim() || CARD_DEFAULT_TITLE,
    phone: toLocalPhone(user.phone),
  };
}

/// Who is printing, when it is not the holder: recorded as the actor on any
/// sign-in code issued along the way, so the log says which officer caused it.
export type CardIssuer = Pick<QrActor, "id" | "role" | "email">;

const CARD_USER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  phone: true,
  title: true,
  role: true,
  email: true,
  associationId: true,
  avatar: { select: { data: true, mimeType: true } },
} as const;

/**
 * Assembles what the front of one person's card says.
 *
 * The office is whatever an administrator recorded, falling back to
 * `CARD_DEFAULT_TITLE`. It deliberately does not consult the holder's role:
 * everyone here is a member of the association, and the two or three people
 * who hold an office are given one explicitly rather than inferred from what
 * the software lets them click.
 *
 * A holder with no live QR is issued one. Printing a card around a code that
 * does not exist would produce a card nobody can scan, and the member would
 * have no way of discovering that until someone tried it.
 */
export async function getMembershipCardData(
  userId: string,
  issuedBy?: CardIssuer
): Promise<MembershipCardData> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: CARD_USER_SELECT,
  });

  if (!user) throw new Error(`No user ${userId}`);

  const code =
    (await getActiveQrCode(userId)) ??
    (await issueQrCode(userId, issuerFor(user, issuedBy)));

  return {
    ...cardTextFor(user),
    qrUrl: code.url,
    photo: user.avatar
      ? { bytes: new Uint8Array(user.avatar.data), mimeType: user.avatar.mimeType }
      : null,
  };
}

/**
 * `getMembershipCardData` for a whole print run, returned in the order asked
 * for. Ids with no user behind them are dropped rather than thrown on, so one
 * deleted account cannot sink a batch of twenty-four.
 */
export async function getMembershipCardDataForUsers(
  userIds: readonly string[],
  issuedBy: CardIssuer
): Promise<MembershipCardData[]> {
  const [users, codes] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: [...userIds] } },
      select: CARD_USER_SELECT,
    }),
    getActiveQrCodes(userIds),
  ]);

  const byId = new Map(users.map((user) => [user.id, user]));

  // A first print issues the code, as for a single card.
  await issueMissingQrCodes(
    users.filter((user) => !codes.has(user.id)),
    codes,
    issuedBy
  );

  return userIds.flatMap((id) => {
    const user = byId.get(id);
    const code = codes.get(id);
    if (!user || !code) return [];

    return [
      {
        ...cardTextFor(user),
        qrUrl: code.url,
        photo: user.avatar
          ? { bytes: new Uint8Array(user.avatar.data), mimeType: user.avatar.mimeType }
          : null,
      },
    ];
  });
}

type CardHolder = {
  id: string;
  role: UserRole;
  email: string | null;
  associationId: string | null;
};

/**
 * Every holder's live sign-in code, issuing one to any holder who has none,
 * keyed by user id.
 *
 * For the admin card register, which shows each card as it will print — QR
 * included. A card previewed without its code is not the card that gets
 * printed, and the office cannot check a card it cannot see.
 */
export async function getOrIssueQrCodes(
  holders: readonly CardHolder[],
  issuedBy: CardIssuer
): Promise<Map<string, ActiveQrCode>> {
  const codes = await getActiveQrCodes(holders.map((holder) => holder.id));
  await issueMissingQrCodes(
    holders.filter((holder) => !codes.has(holder.id)),
    codes,
    issuedBy
  );
  return codes;
}

/**
 * Issues codes to `holders` and adds them to `codes`. A few at a time: each
 * issue is a transaction plus an audit write, and a whole batch fired at once
 * would take most of the connection pool from everyone else.
 */
async function issueMissingQrCodes(
  holders: readonly CardHolder[],
  codes: Map<string, ActiveQrCode>,
  issuedBy: CardIssuer
): Promise<void> {
  for (let i = 0; i < holders.length; i += 4) {
    await Promise.all(
      holders.slice(i, i + 4).map(async (holder) => {
        codes.set(holder.id, await issueQrCode(holder.id, issuerFor(holder, issuedBy)));
      })
    );
  }
}

/**
 * The actor on a code issued while printing: the officer when there is one,
 * otherwise the holder. The tenant is always the holder's — the code is theirs,
 * whoever pressed the button.
 */
function issuerFor(holder: CardHolder, issuedBy?: CardIssuer): QrActor {
  const who = issuedBy ?? holder;
  return {
    id: who.id,
    role: who.role,
    email: who.email,
    associationId: holder.associationId,
  };
}

/**
 * Reads a side's artwork, or null when the association has not supplied it.
 *
 * Null is a supported state rather than a failure: the renderer falls back to
 * a plain ground so the pipeline can be exercised — and a card still produced
 * — before the design files land. A missing template must never be the reason
 * a member cannot get their card.
 */
async function loadTemplate(side: CardSide): Promise<Uint8Array | null> {
  try {
    const file = await fs.readFile(path.join(TEMPLATE_DIR, TEMPLATE_FILES[side]));
    return new Uint8Array(file);
  } catch {
    return null;
  }
}

/** Fits text to a width by stepping the size down, never by clipping it. */
function fitText(
  text: string,
  font: PDFFont,
  startSize: number,
  maxWidthPt: number
): number {
  let size = startSize;
  while (size > 4 && font.widthOfTextAtSize(text, size) > maxWidthPt) {
    size -= 0.5;
  }
  return size;
}

/**
 * The type sizes the front will actually be printed at, as a fraction of card
 * height.
 *
 * THE PREVIEW CALLS THIS TOO, and that is the whole point. A long name is
 * shrunk to fit, and if the on-screen preview did its own guessing the two
 * would disagree exactly when it matters most — which is the moment somebody
 * approves a card for printing. One measurement, two renderers.
 */
export async function getCardTextSizes(data: CardText): Promise<CardTextSizes> {
  const measure = await createCardTextMeasurer();
  return measure(data);
}

export interface CardTextSizes {
  name: number;
  title: number;
  phone: number;
}

/**
 * `getCardTextSizes` for a page of previews: the fonts are loaded once and the
 * returned function measures as many cards as it is given.
 */
export async function createCardTextMeasurer(): Promise<(data: CardText) => CardTextSizes> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const fit = (text: string, font: PDFFont, box: { size: number; maxWidth: number }) =>
    fitText(text, font, box.size * CARD.heightPt, box.maxWidth * CARD.widthPt) /
    CARD.heightPt;

  return (data) => ({
    name: fit(data.displayName, regular, FRONT.name),
    title: fit(data.title, bold, FRONT.title),
    phone: fit(data.phone, regular, FRONT.phone),
  });
}

/**
 * Draws a value at a top-left anchor expressed in card fractions.
 *
 * PDF measures from the bottom of the page and text from its baseline, so the
 * flip and the ascent offset happen here, once, rather than in every caller.
 */
function drawFieldText(
  page: PDFPage,
  text: string,
  box: { x: number; y: number; size: number; maxWidth: number },
  font: PDFFont,
  colour: ReturnType<typeof rgb>
): void {
  if (!text) return;

  const startSize = box.size * CARD.heightPt;
  const size = fitText(text, font, startSize, box.maxWidth * CARD.widthPt);

  page.drawText(text, {
    x: box.x * CARD.widthPt,
    y: CARD.heightPt - box.y * CARD.heightPt - size,
    size,
    font,
    color: colour,
  });
}

/**
 * Embeds a side's artwork into a document, or returns null when none is
 * supplied. Embedded once per document and drawn on every page, so a run of
 * twenty-four cards carries one copy of the artwork, not twenty-four.
 */
async function embedGround(doc: PDFDocument, side: CardSide): Promise<PDFImage | null> {
  const template = await loadTemplate(side);
  if (!template) return null;

  // The artwork's format is whatever the association exported, so it is read
  // from the bytes rather than assumed from the extension — embedPng on a JPEG
  // throws, and a card that fails to render is worse than one drawn plain.
  const probed = probeImage(template);
  return probed?.mimeType === "image/jpeg"
    ? doc.embedJpg(template)
    : doc.embedPng(template);
}

/** Draws a side's artwork, or a plain white ground when none is supplied. */
function drawGround(page: PDFPage, art: PDFImage | null): void {
  if (!art) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: CARD.widthPt,
      height: CARD.heightPt,
      color: rgb(1, 1, 1),
    });
    return;
  }

  page.drawImage(art, { x: 0, y: 0, width: CARD.widthPt, height: CARD.heightPt });
}

/** What every front in a document shares, embedded into it once. */
interface FrontAssets {
  ground: PDFImage | null;
  regular: PDFFont;
  bold: PDFFont;
  mark: PDFImage | null;
}

/** The front of one member's card. */
export async function renderCardFront(data: MembershipCardData): Promise<Uint8Array> {
  return renderCardFronts([data]);
}

/**
 * Fronts for a print run: one card per page, in the order given.
 *
 * One file for the run rather than one per member, because that is what a card
 * printer is fed — the operator loads a stack of blanks and prints the file
 * once. The backs are a separate file (`renderCardBacks`) with the same number
 * of pages, for the second pass.
 */
export async function renderCardFronts(
  cards: readonly MembershipCardData[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(
    cards.length === 1
      ? `RTA membership card — ${cards[0].displayName}`
      : `RTA membership cards — ${cards.length} fronts`
  );
  doc.setProducer("RTA Savings & Loans");

  const markBytes = await loadLogo();
  const assets: FrontAssets = {
    ground: await embedGround(doc, "front"),
    regular: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
    mark: markBytes ? await doc.embedJpg(markBytes) : null,
  };

  for (const data of cards) {
    const page = doc.addPage([CARD.widthPt, CARD.heightPt]);
    await drawFront(doc, page, data, assets);
  }

  return doc.save();
}

async function drawFront(
  doc: PDFDocument,
  page: PDFPage,
  data: MembershipCardData,
  { ground, regular, bold, mark }: FrontAssets
): Promise<void> {
  drawGround(page, ground);

  drawFieldText(page, data.displayName, FRONT.name, regular, INK.name);
  drawFieldText(page, data.title, FRONT.title, bold, INK.name);
  drawFieldText(page, data.phone, FRONT.phone, regular, INK.body);

  // The fixed "STGT" mark, right-aligned into the blue corner. Not a field:
  // it never changes, so it is never shrunk to fit either.
  const tagSize = FRONT.tag.size * CARD.heightPt;
  page.drawText(FRONT.tag.text, {
    x: FRONT.tag.right * CARD.widthPt - bold.widthOfTextAtSize(FRONT.tag.text, tagSize),
    y: CARD.heightPt - FRONT.tag.y * CARD.heightPt - tagSize,
    size: tagSize,
    font: bold,
    color: rgb(1, 1, 1),
  });

  // --- Sign-in QR ----------------------------------------------------------
  // Generated at 1024px and scaled down by the PDF rather than produced at the
  // final size: a QR is all hard edges, and handing the printer a large one
  // keeps the modules crisp at 300dpi.
  const qrPng = await renderQrPng(data.qrUrl, { size: 1024 });
  const qr = await doc.embedPng(new Uint8Array(qrPng));
  const qrSize = FRONT.qr.size * CARD.widthPt;
  const qrX = FRONT.qr.x * CARD.widthPt;
  const qrY = CARD.heightPt - FRONT.qr.y * CARD.heightPt - qrSize;

  page.drawImage(qr, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  // The blue keyline, drawn over the code's own white quiet zone so the frame
  // sits tight against the modules exactly as it does in the artwork.
  const stroke = FRONT.qrFrame.stroke * CARD.widthPt;
  page.drawRectangle({
    x: qrX,
    y: qrY,
    width: qrSize,
    height: qrSize,
    borderColor: INK.frame,
    borderWidth: stroke,
  });

  // The association's mark in the middle of the code, on its own white ground
  // so it reads as placed rather than as damage to the symbol.
  if (mark) {
    const markSize = FRONT.qrLogo.size * qrSize;
    const markX = qrX + (qrSize - markSize) / 2;
    const markY = qrY + (qrSize - markSize) / 2;
    const pad = markSize * 0.08;

    page.drawRectangle({
      x: markX - pad,
      y: markY - pad,
      width: markSize + pad * 2,
      height: markSize + pad * 2,
      color: rgb(1, 1, 1),
    });

    page.drawImage(mark, { x: markX, y: markY, width: markSize, height: markSize });
  }

  // --- Photograph ----------------------------------------------------------
  // The stored image is already a circle on a transparent ground, cropped in
  // the browser at upload. That matters here: pdf-lib cannot clip, so a square
  // photograph would print as a square sitting on top of the artwork.
  const r = FRONT.photo.r * CARD.heightPt;
  const cx = FRONT.photo.cx * CARD.widthPt;
  const cy = CARD.heightPt - FRONT.photo.cy * CARD.heightPt;

  if (data.photo) {
    const image =
      data.photo.mimeType === "image/jpeg"
        ? await doc.embedJpg(data.photo.bytes)
        : await doc.embedPng(data.photo.bytes);

    page.drawImage(image, { x: cx - r, y: cy - r, width: r * 2, height: r * 2 });
  } else {
    // Nothing to print. A soft disc reads as "photograph missing" rather than
    // leaving a hole in the artwork.
    page.drawCircle({ x: cx, y: cy, size: r, color: INK.placeholder });
  }
}

/** The back of the card — identical for every member, so it takes no data. */
export async function renderCardBack(): Promise<Uint8Array> {
  return renderCardBacks(1);
}

/**
 * `count` copies of the back, one per page, to match a file of fronts page for
 * page. Every back is the same, so the order does not matter — only that the
 * operator's second pass has as many pages as the first.
 */
export async function renderCardBacks(count: number): Promise<Uint8Array> {
  const pages = Math.max(1, Math.floor(count));

  const doc = await PDFDocument.create();
  doc.setTitle(
    pages === 1 ? "RTA membership card — back" : `RTA membership cards — ${pages} backs`
  );
  doc.setProducer("RTA Savings & Loans");

  const ground = await embedGround(doc, "back");
  for (let i = 0; i < pages; i++) {
    drawGround(doc.addPage([CARD.widthPt, CARD.heightPt]), ground);
  }

  return doc.save();
}
