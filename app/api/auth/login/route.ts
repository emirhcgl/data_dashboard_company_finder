import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { createSessionToken } from "@/app/lib/session";
import { assertRuntimeEnv, env } from "@/app/lib/env";

export async function POST(request: Request) {
  try {
    assertRuntimeEnv();

    const { email, password } = await request.json();

    if (email !== env.ADMIN_EMAIL) {
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 401 },
      );
    }

    const passwordValid = await bcrypt.compare(
      password,
      env.ADMIN_PASSWORD_HASH,
    );

    if (!passwordValid) {
      return NextResponse.json(
        { message: "Invalid credentials" },
        { status: 401 },
      );
    }

    const token = await createSessionToken(email);

    const response = NextResponse.json({
      success: true,
    });

    response.cookies.set("session", token, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 8,
    });

    return response;
  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 },
    );
  }
}
