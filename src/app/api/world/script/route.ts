import { NextResponse } from "next/server";
import { isOpenAIConfigError } from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";
import { db } from "@/lib/db";
import {
  generateParallelLifeScript,
  parallelLifeScriptStateKey,
} from "@/lib/parallel-life-script";
import { buildPersonaRuntimeDocuments } from "@/lib/persona-runtime";
import {
  recordUserEvent,
  setUserAppState,
  updateUserMemoryDocument,
} from "@/lib/user-memory";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireApiUserId(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { userId } = auth;
    const [profile, memories, storedScript] = await Promise.all([
      db.profileDocument.findMany({ where: { userId } }),
      db.memory.findMany({
        where: { userId },
        orderBy: [{ importance: "desc" }, { createdAt: "desc" }],
        take: 80,
      }),
      db.userAppState.findUnique({
        where: { userId_key: { userId, key: parallelLifeScriptStateKey } },
      }),
    ]);

    if (storedScript?.value) {
      try {
        return NextResponse.json({
          life_script: JSON.parse(storedScript.value) as unknown,
          existing: true,
        });
      } catch {}
    }

    const personaContext = buildPersonaRuntimeDocuments(profile, memories);

    if (!personaContext.archiveReady) {
      return NextResponse.json(
        { error: "回声档案还没有完成，暂时无法生成平行人生剧本。" },
        { status: 403 },
      );
    }

    const lifeScript = await generateParallelLifeScript({
      archiveCompletedAt: getArchiveCompletedAt(profile),
      soulDocument: personaContext.soulDocument,
      agentsDocument: personaContext.agentsDocument,
      profileSections: personaContext.visibleSections,
      memories,
    });

    await setUserAppState(parallelLifeScriptStateKey, lifeScript, userId);
    await updateUserMemoryDocument(
      {
        personaReady: true,
        profileReady: true,
        currentModule: "world",
      },
      userId,
    );
    await recordUserEvent(
      {
        type: "world.life_script_generated",
        payload: {
          stage: lifeScript.current_stage,
          desiredLifeState: lifeScript.desired_life_state,
        },
      },
      userId,
    );

    return NextResponse.json({ life_script: lifeScript, existing: false });
  } catch (error) {
    console.error(error);

    const message = isOpenAIConfigError(error)
      ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY，暂时无法生成平行人生剧本。"
      : "平行人生剧本暂时没有生成，请稍后再试一次。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
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
