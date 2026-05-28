import { NextResponse } from "next/server";
import { createChatReply, isOpenAIConfigError, loadPrompt } from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { recordUserEvent } from "@/lib/user-memory";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireApiUserId(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { userId } = auth;
    const body = (await request.json()) as { message?: unknown; mode?: unknown };
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const mode = typeof body.mode === "string" ? body.mode : "echo_room";

    if (!message) {
      return NextResponse.json({ error: "message is required" }, { status: 400 });
    }

    const userMessage = await db.conversationMessage.create({
      data: {
        userId,
        role: "user",
        content: message,
        mode,
      },
    });

    const recentMessages = await db.conversationMessage.findMany({
      where: { mode, userId },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const prompt = await loadPrompt("echo-room.md");
    const reply = await createChatReply({
      system: prompt,
      messages: recentMessages
        .reverse()
        .filter((item) => item.role === "user" || item.role === "assistant")
        .map((item) => ({
          role: item.role as "user" | "assistant",
          content: item.content,
        })),
    });

    const assistantMessage = await db.conversationMessage.create({
      data: {
        userId,
        role: "assistant",
        content: reply,
        mode,
      },
    });
    await recordUserEvent(
      {
        type: "chat.message_created",
        payload: {
          mode,
          userMessageId: userMessage.id,
          assistantMessageId: assistantMessage.id,
        },
      },
      userId,
    );

    return NextResponse.json({
      reply,
      userMessageId: userMessage.id,
      assistantMessageId: assistantMessage.id,
    });
  } catch (error) {
    console.error(error);

    const message = isOpenAIConfigError(error)
      ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY。先在 .env 里填入密钥，回声人格就能真正回应你。"
      : "回声人格刚刚有点安静。请稍后再试一次。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
