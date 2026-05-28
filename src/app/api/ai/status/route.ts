import { NextResponse } from "next/server";
import {
  getAIProviderStatus,
  isAIConfigError,
  testAIConnection,
} from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getAIProviderStatus());
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiUserId(request);

    if ("response" in auth) {
      return auth.response;
    }

    const result = await testAIConnection();

    return NextResponse.json(result);
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      {
        ok: false,
        error: isAIConfigError(error)
          ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY。"
          : "GPT API 连通性测试失败，请检查 baseURL、模型名称或密钥权限。",
      },
      { status: 500 },
    );
  }
}
