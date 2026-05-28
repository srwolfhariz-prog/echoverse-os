import { NextResponse } from "next/server";
import { createJsonCompletion, isOpenAIConfigError, loadPrompt } from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";
import { db } from "@/lib/db";
import { parallelLifeScriptStateKey } from "@/lib/parallel-life-script";
import { buildPersonaRuntimeDocuments } from "@/lib/persona-runtime";
import { recordUserEvent, setUserAppState } from "@/lib/user-memory";

export const runtime = "nodejs";

const latestWorldStateKey = "parallel_world.latest";
const wishStateKey = "parallel_world.wish";

type WishRequest = {
  message?: unknown;
  sentAt?: unknown;
};

type WishReplyResponse = {
  reply?: string;
};

type ParallelWish = {
  message: string;
  sentAt: string;
  queuedReply?: string;
  replyAvailableOn?: string;
};

export async function POST(request: Request) {
  try {
    const auth = await requireApiUserId(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { userId } = auth;
    const body = (await request.json()) as WishRequest;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const sentAt =
      typeof body.sentAt === "string" && !Number.isNaN(new Date(body.sentAt).getTime())
        ? body.sentAt
        : new Date().toISOString();

    if (!message) {
      return NextResponse.json({ error: "寄语内容不能为空。" }, { status: 400 });
    }

    const [profile, memories, appStates] = await Promise.all([
      db.profileDocument.findMany({ where: { userId } }),
      db.memory.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      db.userAppState.findMany({
        where: {
          userId,
          key: {
            in: [latestWorldStateKey, parallelLifeScriptStateKey],
          },
        },
      }),
    ]);
    const personaContext = buildPersonaRuntimeDocuments(profile, memories);

    if (!personaContext.archiveReady) {
      return NextResponse.json(
        { error: "回声档案还没有完成，暂时不能寄出寄语。" },
        { status: 403 },
      );
    }

    const appStateMap = new Map(appStates.map((state) => [state.key, state.value]));
    const latestWorld = parseJson<Record<string, unknown>>(
      appStateMap.get(latestWorldStateKey),
    );
    const lifeScript = parseJson<Record<string, unknown>>(
      appStateMap.get(parallelLifeScriptStateKey),
    );

    if (!latestWorld) {
      return NextResponse.json(
        { error: "请先查看TA的日常，再写下今天的寄语。" },
        { status: 409 },
      );
    }

    const prompt = await loadPrompt("world-wish-reply.md");
    const result = await createJsonCompletion<WishReplyResponse>({
      system: prompt,
      user: JSON.stringify(
        {
          task: "generate_hidden_parallel_wish_reply",
          message,
          sent_at: sentAt,
          reply_visible_after_natural_day: getNextChinaDayKey(sentAt),
          soul_document: personaContext.soulDocument,
          agents_document: personaContext.agentsDocument,
          profile_sections: personaContext.visibleSections,
          recent_memories: memories,
          latest_parallel_day: latestWorld,
          life_script: lifeScript,
        },
        null,
        2,
      ),
      temperature: 0.72,
    });
    const wish: ParallelWish = {
      message,
      sentAt,
      queuedReply: normalizeWishReply(result.reply, message),
      replyAvailableOn: getNextChinaDayKey(sentAt),
    };

    await setUserAppState(wishStateKey, wish, userId);
    await recordUserEvent(
      {
        type: "world.wish_sent",
        payload: {
          sentAt,
          replyAvailableOn: wish.replyAvailableOn,
        },
      },
      userId,
    );

    return NextResponse.json({
      wish: {
        message: wish.message,
        sentAt: wish.sentAt,
        replyAvailableOn: wish.replyAvailableOn,
      },
    });
  } catch (error) {
    console.error(error);

    const message = isOpenAIConfigError(error)
      ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY，寄语暂时没有送达。"
      : "寄语刚刚没有送达，请稍后再试一次。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function getNextChinaDayKey(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  date.setUTCDate(date.getUTCDate() + 1);

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeWishReply(value: unknown, message: string) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (/加油|相信|可以|一定/.test(message)) {
    return "我收到了这句相信，它会陪我把今天再往前推一点。";
  }

  if (/辛苦|抱抱|别怕|没事/.test(message)) {
    return "我收到了这份温柔，今天我会把自己照顾得更稳一点。";
  }

  return "我收到了，像隔着很远的灯亮了一下，今天我会带着它继续往前走。";
}
