import { platformManifest } from "@/lib/pwa/app-routes";

/** The SSPSG app's manifest. Each association's is at /abc/manifest.webmanifest;
 *  see lib/pwa/apps.ts. Linked from the root layout's metadata. */
export function GET() {
  return platformManifest();
}
