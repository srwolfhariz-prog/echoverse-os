import { NextResponse } from "next/server";
import { createJsonCompletion, isOpenAIConfigError, loadPrompt } from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { memoryTypes } from "@/lib/constants";
import { recordUserEvent } from "@/lib/user-memory";

export const runtime = "nodejs";

type ExtractResponse = {
  memories?: Array<{
    type?: string;
    content?: string;
    emotion?: string;
    importance?: number;
    confidence?: number;
  }>;
};

export async function POST(request: Request) {
  try {
    const auth = await requireApiUserId(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { userId } = auth;
    const body = (await request.json()) as {
      message?: unknown;
      sourceMessageId?: unknown;
    };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const sourceMessageId =
      typeof body.sourceMessageId === "string" ? body.sourceMessageId : undefined;

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const prompt = await loadPrompt("memory-extractor.md");
    const result = await createJsonCompletion<ExtractResponse>({
      system: prompt,
      user: `用户消息：\n${message}`,
      temperature: 0.2,
    });

    const safeMemories = (result.memories ?? [])
      .filter(
        (memory) =>
          typeof memory.type === "string" &&
          memoryTypes.includes(memory.type as (typeof memoryTypes)[number]) &&
          typeof memory.content === "string" &&
          memory.content.trim().length > 0,
      )
      .map((memory) => ({
        userId,
        type: memory.type as string,
        content: memory.content?.trim() ?? "",
        emotion:
          typeof memory.emotion === "string" && memory.emotion.trim()
            ? memory.emotion.trim()
            : undefined,
        importance: Math.min(
          10,
          Math.max(1, Math.round(Number(memory.importance) || 5)),
        ),
        confidence: Math.min(1, Math.max(0, Number(memory.confidence) || 0.6)),
        sourceMessageId,
      }));

    const savedMemories =
      safeMemories.length > 0
        ? await db.$transaction(
            safeMemories.map((memory) => db.memory.create({ data: memory })),
          )
        : [];
    if (savedMemories.length > 0) {
      await recordUserEvent(
        {
          type: "memory.extracted",
          payload: {
            count: savedMemories.length,
            sourceMessageId,
          },
        },
        userId,
      );
    }

    return NextResponse.json({ memories: savedMemories });
  } catch (error) {
    console.error(error);

    const message = isOpenAIConfigError(error)
      ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY，暂时无法提取长期记忆。"
      : "这段回声暂时没能被整理成记忆。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
