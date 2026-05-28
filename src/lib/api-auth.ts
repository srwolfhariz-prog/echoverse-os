import { NextResponse } from "next/server";
import { requireCurrentUserId } from "@/lib/user-memory";

export async function requireApiUserId(request: Request) {
  const userId = await requireCurrentUserId(request);

  if (!userId) {
    return {
      response: NextResponse.json(
        { error: "请登录后再使用这个功能。" },
        { status: 401 },
      ),
    };
  }

  return { userId };
}

