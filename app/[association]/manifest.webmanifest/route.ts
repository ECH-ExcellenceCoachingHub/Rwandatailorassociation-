import { associationManifest } from "@/lib/pwa/app-routes";

/** /abc/manifest.webmanifest — the association's own installable app. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ association: string }> }
) {
  return associationManifest((await params).association);
}
