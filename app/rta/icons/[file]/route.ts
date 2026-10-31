import type { NextRequest } from "next/server";
import { associationIcon } from "@/lib/pwa/app-routes";

/** RTA's app icons, drawn from its logo like every association's. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ file: string }> }
) {
  return associationIcon("rta", (await params).file, request.nextUrl.origin);
}
