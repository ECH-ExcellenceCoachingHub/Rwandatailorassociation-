import { NextResponse } from "next/server";




export function relativeRedirect(path: string, status = 307): NextResponse {
  try {
    const base = process.env.APP_URL || "http://localhost:10000";
    const absoluteUrl = new URL(path, base);
    return NextResponse.redirect(absoluteUrl);
  } catch {
    return new NextResponse(null, { status, headers: { Location: path } });
  }
}
