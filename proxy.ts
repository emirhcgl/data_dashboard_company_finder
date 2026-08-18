import { NextRequest, NextResponse } from "next/server";
import { isApiAuthorized } from "@/app/lib/api-auth";

const PUBLIC_PATHS = ["/api/auth/login"];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (PUBLIC_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  if (await isApiAuthorized(req)) {
    return NextResponse.next();
  }

  return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
}

export const config = {
  matcher: ["/api/:path*"],
};
