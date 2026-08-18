import { NextRequest } from "next/server";
import { verifySessionToken } from "./session";

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) {
    return false;
  }

  let mismatch = 0;

  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return mismatch === 0;
}

export async function isApiAuthorized(req: NextRequest): Promise<boolean> {
  // 1. External application: API key
  const authorization = req.headers.get("authorization") ?? "";
  const apiKey = process.env.EXTERNAL_API_KEY;

  if (
    apiKey &&
    authorization.startsWith("Bearer ") &&
    timingSafeEqual(authorization.slice(7), apiKey)
  ) {
    return true;
  }

  // 2. Dashboard user: session cookie
  const token = req.cookies.get("session")?.value;

  if (token) {
    return (await verifySessionToken(token)) !== null;
  }

  return false;
}
