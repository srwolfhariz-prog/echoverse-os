import { NextResponse } from "next/server";
import { createJsonCompletion, isOpenAIConfigError, loadPrompt } from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";
import { db } from "@/lib/db";
import {
  normalizeParallelLifeScript,
  parallelLifeScriptStateKey,
  type ParallelLifeScript,
} from "@/lib/parallel-life-script";
import { buildPersonaRuntimeDocuments } from "@/lib/persona-runtime";
import {
  recordUserEvent,
  setUserAppState,
  updateUserMemoryDocument,
} from "@/lib/user-memory";

export const runtime = "nodejs";

const latestWorldStateKey = "parallel_world.latest";
const lifeRecordStateKey = "parallel_world.life_records";
const wishStateKey = "parallel_world.wish";

type ParallelWish = {
  message: string;
  sentAt: string;
  reply?: string;
  queuedReply?: string;
  replyAvailableOn?: string;
  repliedAt?: string;
  replyForDayIndex?: number;
};

type WorldDiaryResponse = {
  mood?: string;
  scene?: string;
  energy?: number;
  clarity?: number;
  diary?: string;
  day_title?: string;
  location?: string;
  occupation?: string;
  event?: string;
  happiness?: number;
  anxiety?: number;
  relationship?: number;
  career?: number;
  personality_shift?: string;
  healing_echo?: string;
  next_hint?: string;
  timeline?: string[];
  wish_reply?: string;
  life_script?: Partial<ParallelLifeScript>;
};

export async function POST(request: Request) {
  try {
    const auth = await requireApiUserId(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { userId } = auth;
    const [profile, memories, letters, previousWorlds, appStates] =
      await Promise.all([
        db.profileDocument.findMany({ where: { userId } }),
        db.memory.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 30,
        }),
        db.lifeLetter.findMany({
          where: { userId },
          orderBy: { createdAt: "desc" },
          take: 10,
        }),
        db.worldState.findMany({
          where: { userId },
          orderBy: { updatedAt: "desc" },
          take: 5,
        }),
        db.userAppState.findMany({
          where: {
            userId,
            key: {
              in: [
                latestWorldStateKey,
                parallelLifeScriptStateKey,
                lifeRecordStateKey,
                wishStateKey,
              ],
            },
          },
        }),
      ]);
    const personaContext = buildPersonaRuntimeDocuments(profile, memories);

    if (!personaContext.archiveReady) {
      return NextResponse.json(
        { error: "回声档案还没有完成，平行小世界暂时不会生成真实日常。" },
        { status: 403 },
      );
    }

    const appStateMap = new Map(appStates.map((state) => [state.key, state.value]));
    const storedLifeScript = parseJson<Partial<ParallelLifeScript>>(
      appStateMap.get(parallelLifeScriptStateKey),
    );

    if (!storedLifeScript) {
      return NextResponse.json(
        { error: "平行人生剧本还没有准备好，请先重新生成回声档案。" },
        { status: 409 },
      );
    }

    const archiveCompletedAt = getArchiveCompletedAt(profile);
    const previousLifeScript = normalizeParallelLifeScript(
      storedLifeScript,
      null,
      0,
      archiveCompletedAt,
    );
    const previousLatest = parseJson<Record<string, unknown>>(
      appStateMap.get(latestWorldStateKey),
    );
    const lifeRecords = parseJson<unknown[]>(
      appStateMap.get(lifeRecordStateKey),
    ) ?? [];
    const pendingWish = parseWish(appStateMap.get(wishStateKey));
    const shouldReplyToWish = shouldGenerateWishReply(pendingWish);
    const queuedWishReply =
      shouldReplyToWish && pendingWish?.queuedReply
        ? pendingWish.queuedReply.trim()
        : "";
    const shouldAskForWishReply = shouldReplyToWish && !queuedWishReply;
    const previousDayIndex = getPreviousDayIndex(previousLifeScript, previousLatest);
    const nextDayIndex = previousDayIndex + 1;
    const prompt = await loadPrompt("world-diary.md");
    const result = await createJsonCompletion<WorldDiaryResponse>({
      system: prompt,
      user: JSON.stringify(
        {
          task: "continue_prebuilt_life_script_and_generate_next_parallel_day",
          randomness: "high_but_continuous",
          random_seed: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          requested_parallel_day_index: nextDayIndex,
          archive_completed_at: archiveCompletedAt,
          profile_ready: true,
          soul_document: personaContext.soulDocument,
          agents_document: personaContext.agentsDocument,
          profile_sections: personaContext.visibleSections,
          recent_memories: memories,
          recent_life_letters: letters,
          life_script: previousLifeScript,
          latest_parallel_day: previousLatest,
          life_records: lifeRecords,
          pending_wish: shouldAskForWishReply ? pendingWish : null,
          wish_reply_rule: shouldAskForWishReply
            ? "用户在上一个现实自然日或更早寄出了寄语，且后台没有隐藏回复。请结合今天生成的生活、心情和人格剧本，补生成一句第一人称回复。"
            : "今天不需要生成寄语回复；不要返回 wish_reply，或返回空字符串。",
          previous_parallel_days: previousWorlds,
          continuity_rules: [
            "保持城市、住房、职业、关系状态、明日计划和未完成事件的连续性。",
            "如果前一天写了明天要面试、搬家、见某个人，下一次必须承接。",
            "可以随机增加生活细节和意外，但不能突然推翻已经建立的核心设定。",
            "虚拟人生主线要围绕用户最渴望的人生状态展开，但日常细节要有高随机性。",
          ],
        },
        null,
        2,
      ),
      temperature: 0.9,
    });
    const mood = result.mood?.trim() || "平静里带一点紧张";
    const scene = result.scene?.trim() || previousLifeScript.stable_context.home;
    const energy = normalizeScore(result.energy, 62);
    const clarity = normalizeScore(result.clarity, 57);
    const diary =
      result.diary?.trim() ||
      "今天，我把生活里一件很小的事认真做完了。它不算耀眼，但让我感觉自己仍然在这条新的生活线里慢慢往前走。";
    const nextLifeScript = normalizeParallelLifeScript(
      result.life_script,
      previousLifeScript,
      nextDayIndex,
      archiveCompletedAt,
    );
    const nextHint =
      result.next_hint?.trim() || "明天，我会继续处理今天留下的那条线索。";

    const state = await db.worldState.create({
      data: {
        userId,
        mood,
        scene,
        energy,
        clarity,
        diary,
      },
    });
    const worldPayload = {
      ...state,
      day_title: result.day_title?.trim() || "我把今天认真过完了",
      location: result.location?.trim() || nextLifeScript.stable_context.home,
      occupation:
        result.occupation?.trim() || nextLifeScript.stable_context.occupation,
      event: result.event?.trim() || "推进了一件生活里的小事",
      happiness: normalizeScore(result.happiness, 68),
      anxiety: normalizeScore(result.anxiety, 34),
      relationship: normalizeScore(result.relationship, 52),
      career: normalizeScore(result.career, 46),
      personality_shift:
        result.personality_shift?.trim() ||
        "我比昨天更愿意相信，生活可以一点一点被重新组织起来。",
      healing_echo:
        result.healing_echo?.trim() ||
        "我没有一下子抵达理想生活，但我正在认真地把今天过完。",
      next_hint: nextHint,
      timeline: normalizeTimeline(result.timeline, nextLifeScript),
      script_day_index: nextDayIndex,
      life_script: nextLifeScript,
      continuity_state: {
        city: nextLifeScript.stable_context.city,
        home: nextLifeScript.stable_context.home,
        occupation: nextLifeScript.stable_context.occupation,
        relationship_status: nextLifeScript.stable_context.relationship_status,
        active_threads: nextLifeScript.active_threads,
        next_hint: nextHint,
      },
      persona_ready: true,
    };
    const nextWish =
      shouldReplyToWish && pendingWish
        ? {
            ...pendingWish,
            reply:
              queuedWishReply ||
              normalizeWishReply(result.wish_reply, pendingWish.message),
            repliedAt: new Date().toISOString(),
            replyForDayIndex: nextDayIndex,
          }
        : pendingWish;

    await updateUserMemoryDocument(
      {
        personaReady: true,
        profileReady: true,
        worldReady: true,
        currentModule: "world",
      },
      userId,
    );
    await Promise.all([
      setUserAppState(latestWorldStateKey, worldPayload, userId),
      setUserAppState(parallelLifeScriptStateKey, nextLifeScript, userId),
      ...(nextWish ? [setUserAppState(wishStateKey, nextWish, userId)] : []),
    ]);
    await recordUserEvent(
      {
        type: "world.day_generated",
        payload: {
          worldStateId: state.id,
          mood,
          scene,
          scriptDayIndex: nextDayIndex,
          scriptStage: nextLifeScript.current_stage,
          wishReplied: Boolean(shouldReplyToWish),
        },
      },
      userId,
    );

    return NextResponse.json({
      ...worldPayload,
      parallel_wish: nextWish ?? null,
    });
  } catch (error) {
    console.error(error);

    const message = isOpenAIConfigError(error)
      ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY，平行小世界暂时无法生成今日日常。"
      : "平行宇宙刚刚没有传回清晰的画面，请稍后再试一次。";

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

function parseWish(value: string | null | undefined): ParallelWish | null {
  const parsed = parseJson<Partial<ParallelWish>>(value);

  if (
    !parsed ||
    typeof parsed.message !== "string" ||
    typeof parsed.sentAt !== "string" ||
    !parsed.message.trim()
  ) {
    return null;
  }

  return {
    message: parsed.message.trim(),
    sentAt: parsed.sentAt,
    reply: typeof parsed.reply === "string" ? parsed.reply.trim() : undefined,
    queuedReply:
      typeof parsed.queuedReply === "string"
        ? parsed.queuedReply.trim()
        : undefined,
    replyAvailableOn:
      typeof parsed.replyAvailableOn === "string"
        ? parsed.replyAvailableOn
        : undefined,
    repliedAt:
      typeof parsed.repliedAt === "string" ? parsed.repliedAt : undefined,
    replyForDayIndex:
      typeof parsed.replyForDayIndex === "number"
        ? parsed.replyForDayIndex
        : undefined,
  };
}

function shouldGenerateWishReply(wish: ParallelWish | null) {
  return Boolean(wish && !wish.reply && isBeforeTodayInChina(wish.sentAt));
}

function isBeforeTodayInChina(value: string) {
  const sentDay = getChinaDayKey(value);
  const today = getChinaDayKey(new Date());

  return Boolean(sentDay && today && sentDay < today);
}

function getChinaDayKey(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;

  if (Number.isNaN(date.getTime())) {
    return "";
  }

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

function getArchiveCompletedAt(profile: Array<{ updatedAt: Date }>) {
  if (!profile.length) {
    return new Date().toISOString();
  }

  const timestamp = profile.reduce(
    (earliest, document) => Math.min(earliest, document.updatedAt.getTime()),
    Number.POSITIVE_INFINITY,
  );

  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : new Date().toISOString();
}

function getPreviousDayIndex(
  script: ParallelLifeScript,
  latest: Record<string, unknown> | null,
) {
  const latestDayIndex = Number(latest?.script_day_index);

  if (Number.isFinite(latestDayIndex) && latestDayIndex > 0) {
    return Math.round(latestDayIndex);
  }

  return Math.max(0, Math.round(script.current_day_index || 0));
}

function normalizeStringArray(
  value: unknown,
  fallback: string[],
  maxLength: number,
) {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const items = value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, maxLength);

  return items.length > 0 ? items : fallback;
}

function normalizeScore(value: unknown, fallback: number) {
  return Math.min(100, Math.max(1, Math.round(Number(value) || fallback)));
}

function normalizeTimeline(value: unknown, script: ParallelLifeScript) {
  const timeline = normalizeStringArray(value, script.long_term_timeline, 5);

  return timeline.length > 0
    ? timeline.slice(0, 5)
    : [
        "我离开原来的节奏。",
        "我搬进新的房间。",
        "我重新整理职业方向。",
        "我学会稳定地表达需要。",
      ];
}
