import type { NextRequest } from "next/server";
import { associationIcon } from "@/lib/pwa/app-routes";

/** /abc/icons/icon-192.png and the rest: the app's icons, drawn from its logo. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ association: string; file: string }> }
) {
  const { association, file } = await params;
  return associationIcon(association, file, request.nextUrl.origin);
}
