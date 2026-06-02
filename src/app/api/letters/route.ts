import { NextResponse } from "next/server";
import { createJsonCompletion, isOpenAIConfigError, loadPrompt } from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";
import {
  createFileLifeLetter,
  listFileLetters,
  listFileMemories,
  listFileProfileDocuments,
} from "@/lib/file-user-store";
import { buildPersonaRuntimeDocuments } from "@/lib/persona-runtime";
import { recordUserEvent } from "@/lib/user-memory";

export const runtime = "nodejs";

type InnerVoice = {
  title: string;
  content: string;
  signals: string[];
};

type LifeLetterResponse = {
  letter?: string;
  inner_voice?: {
    title?: string;
    content?: string;
    signals?: string[];
  };
  referenced_memories?: string[];
  action?: {
    title?: string;
    steps?: string[];
  };
};

type StoredLetterMeta = {
  referenced_memories: string[];
  inner_voice: InnerVoice | null;
};

function parseJsonArray(value: string | null | undefined) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return Array.isArray(parsed)
      ? parsed.filter((item) => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function truncatePromptText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
}

function parseLetterMeta(value: string | null | undefined): StoredLetterMeta {
  if (!value) {
    return { referenced_memories: [], inner_voice: null };
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (Array.isArray(parsed)) {
      return {
        referenced_memories: parsed.filter((item) => typeof item === "string"),
        inner_voice: null,
      };
    }

    if (!parsed || typeof parsed !== "object") {
      return { referenced_memories: [], inner_voice: null };
    }

    const source = parsed as {
      referenced_memories?: unknown;
      inner_voice?: unknown;
    };

    return {
      referenced_memories: Array.isArray(source.referenced_memories)
        ? source.referenced_memories
            .filter((item) => typeof item === "string")
            .slice(0, 8)
        : [],
      inner_voice: sanitizeStoredInnerVoice(source.inner_voice),
    };
  } catch {
    return { referenced_memories: [], inner_voice: null };
  }
}

export async function GET(request: Request) {
  const auth = await requireApiUserId(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { userId } = auth;
  const letters = await listFileLetters(userId, 10);

  return NextResponse.json({
    letters: letters.map((letter) => {
      const meta = parseLetterMeta(letter.referencedMemoryIds);

      return {
        id: letter.id,
        question: letter.question,
        category: letter.category,
        letter: letter.answer,
        inner_voice:
          meta.inner_voice ??
          buildFallbackInnerVoice(
            "你在这封信里露出了自己真正卡住的地方。",
          ),
        referenced_memories: meta.referenced_memories,
        action: {
          title: normalizeActionText(
            letter.actionTitle,
            "你先做一个十分钟内能完成的小动作",
          ),
          steps: normalizeActionSteps(parseJsonArray(letter.actionSteps)),
        },
        createdAt: letter.createdAt,
      };
    }),
  });
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiUserId(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { userId } = auth;
    const body = (await request.json()) as {
      question?: unknown;
      category?: unknown;
    };
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const category = typeof body.category === "string" ? body.category : "self";

    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const [profile, memories] = await Promise.all([
      listFileProfileDocuments(userId),
      listFileMemories(userId, { take: 30 }),
    ]);
    const personaContext = buildPersonaRuntimeDocuments(profile, memories);

    if (!personaContext.archiveReady) {
      return NextResponse.json(
        {
          error: "回声档案搭建完成后，才能由你的虚拟人格写下这封回信。",
          missing_profile_sections: personaContext.missingSections,
        },
        { status: 409 },
      );
    }

    const prompt = await loadPrompt("life-letter.md");
    const result = await createJsonCompletion<LifeLetterResponse>({
      system: prompt,
      user: JSON.stringify(
        {
          question,
          category,
          profile_ready: true,
          soul_document: truncatePromptText(personaContext.soulDocument, 5200),
          agents_document: truncatePromptText(personaContext.agentsDocument, 3600),
          profile_sections: personaContext.visibleSections.map((section) => ({
            ...section,
            content: truncatePromptText(section.content, 1800),
          })),
          recent_memories: memories.map((memory) => ({
            type: memory.type,
            content: truncatePromptText(memory.content, 360),
            emotion: memory.emotion,
            importance: memory.importance,
            confidence: memory.confidence,
            createdAt: memory.createdAt,
          })),
        },
        null,
        2,
      ),
      temperature: 0.62,
      timeoutMs: 65_000,
      maxRetries: 0,
    });

    const letter = formatLetter(
      result.letter?.trim() ||
        "你好，我知道你这句话里真正想被接住的部分。先慢一点，不急着立刻给人生定论，把今天能承受的一小步拿回来，就已经是在往前走。",
    );
    const innerVoice = buildInnerVoice(result.inner_voice);
    const referencedMemories = Array.isArray(result.referenced_memories)
      ? result.referenced_memories
          .filter((item) => typeof item === "string")
          .slice(0, 8)
      : [];
    const actionTitle = normalizeActionText(
      result.action?.title,
      "你先做一个十分钟内能完成的小动作",
    );
    const actionSteps = Array.isArray(result.action?.steps)
      ? normalizeActionSteps(result.action.steps)
      : ["你把此刻最困扰的事写成一句话", "你选一个五分钟内能开始的小动作"];

    const savedLetter = await createFileLifeLetter(userId, {
      question,
      category,
      answer: letter,
      referencedMemoryIds: JSON.stringify({
        referenced_memories: referencedMemories,
        inner_voice: innerVoice,
      }),
      actionTitle,
      actionSteps: JSON.stringify(actionSteps),
    });
    await recordUserEvent(
      {
        type: "letter.generated",
        payload: {
          category,
          personaReady: true,
          referencedMemoryCount: referencedMemories.length,
        },
      },
      userId,
    );

    return NextResponse.json({
      letter,
      inner_voice: innerVoice,
      referenced_memories: referencedMemories,
      action: {
        title: actionTitle,
        steps: actionSteps,
      },
      persona_ready: true,
      id: savedLetter?.id,
      question,
      category,
      createdAt: savedLetter?.createdAt,
    });
  } catch (error) {
    console.error(error);

    const message = isOpenAIConfigError(error)
      ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY，暂时无法生成这封回信。"
      : "这封信暂时没有寄回来，请稍后再试一次。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function sanitizeStoredInnerVoice(value: unknown): InnerVoice | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<InnerVoice>;
  const title = normalizeInsightText(source.title, "");
  const content = normalizeInsightText(source.content, "");

  if (!title && !content) {
    return null;
  }

  return {
    title: title || "你在这封信里露出了自己真正卡住的地方。",
    content:
      content ||
      "你此刻真正需要的不是立刻解决全部人生，而是先把心里最痛的那一小块看清楚。",
    signals: normalizeSignals(source.signals),
  };
}

function buildInnerVoice(value: LifeLetterResponse["inner_voice"]) {
  const fallback = buildFallbackInnerVoice(
    "你真正卡住的不是这件事本身，而是害怕再一次失望。",
  );

  if (!value) {
    return fallback;
  }

  return {
    title: normalizeInsightText(value.title, fallback.title),
    content: normalizeInsightText(value.content, fallback.content),
    signals: normalizeSignals(value.signals),
  };
}

function buildFallbackInnerVoice(title: string): InnerVoice {
  return {
    title,
    content:
      "你在这次倾诉里露出了自己的疲惫、委屈和不甘：你想往前走，但你也害怕又一次把希望交出去之后落空。",
    signals: ["你很疲惫", "你害怕再次落空", "你还不甘心"],
  };
}

function normalizeInsightText(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    return fallback;
  }

  return text
    .replace(/现实的我/g, "你")
    .replace(/另一个我/g, "你")
    .replace(/TA/g, "你")
    .replace(/用户/g, "你")
    .replace(/他/g, "你")
    .replace(/她/g, "你")
    .replace(/(^|[，。；：、\s])我/g, "$1你")
    .replace(/自己的/g, "你的");
}

function normalizeSignals(value: unknown) {
  const signals = Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string")
        .map((item) => normalizeInsightText(item, ""))
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  if (!signals.length) {
    return ["你很疲惫", "你害怕再次落空", "你还不甘心"];
  }

  return signals.map((signal) => {
    if (signal.startsWith("你")) {
      return signal;
    }

    if (/怕|害怕|担心|恐惧/.test(signal)) {
      return `你${signal}`;
    }

    if (/累|疲惫|难过|委屈|焦虑|不甘/.test(signal)) {
      return `你很${signal}`;
    }

    return `你正在感到${signal}`;
  });
}

function formatLetter(letter: string) {
  const trimmed = letter.trim();
  const hasGreeting = /^亲爱的另一个我/.test(trimmed);
  const hasSignature = /——|来自平行宇宙的一封回信/.test(trimmed);
  const body = hasGreeting
    ? trimmed
    : `亲爱的另一个我：\n\n${trimmed.startsWith("你好") ? trimmed : `你好，${trimmed}`}`;

  return [
    body,
    hasSignature ? "" : "\n——来自平行宇宙的一封回信",
  ]
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeActionText(value: unknown, fallback: string) {
  const text = typeof value === "string" ? value.trim() : "";
  const normalized = normalizeInsightText(text, fallback);

  if (!normalized) {
    return fallback;
  }

  return normalized.startsWith("你") ? normalized : `你${normalized}`;
}

function normalizeActionSteps(value: unknown) {
  const steps = Array.isArray(value)
    ? value
        .filter((item) => typeof item === "string")
        .map((item) => normalizeActionText(item, ""))
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  return steps.length > 0
    ? steps
    : ["你把此刻最困扰的事写成一句话", "你选一个五分钟内能开始的小动作"];
}
