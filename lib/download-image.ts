import { toPng } from "html-to-image";

/**
 * Turning a rendered node into a downloadable PNG.
 *
 * The report card is real DOM, not a canvas drawing: the same styles that make
 * it readable on screen are what the PNG inherits, so there is one design to
 * maintain rather than a screen version and a picture version drifting apart.
 *
 * Browser-only by nature — never import this from a server component.
 */
export async function downloadNodeAsPng(
  node: HTMLElement,
  filename: string,
  pixelRatio = 2
): Promise<void> {
  const dataUrl = await toPng(node, {
    pixelRatio,
    // The card's own background is opaque; this only covers a transparent
    // corner if a rounded edge is ever missed.
    backgroundColor: "#ffffff",
    cacheBust: true,
  });

  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
