import { NextResponse } from "next/server";
import { createJsonCompletion, isOpenAIConfigError, loadPrompt } from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";
import { profileSections, sortProfileSections } from "@/lib/constants";
import {
  getFileAppStates,
  listFileMemories,
  upsertFileProfileDocuments,
} from "@/lib/file-user-store";
import {
  personaProgressConfig,
  personaQuestions,
  personaStageConfig,
  typologyConfig,
  type PersonaTypologyResults,
  type ProgressKey,
} from "@/lib/persona-question-bank";
import {
  generateParallelLifeScript,
  parallelLifeScriptStateKey,
} from "@/lib/parallel-life-script";
import { createPersonaRuntimeProfileDocuments } from "@/lib/persona-runtime";
import {
  recordUserEvent,
  setUserAppState,
  updateUserMemoryDocument,
} from "@/lib/user-memory";

export const runtime = "nodejs";

const echoRoomStateKey = "echo_room.persona_state";
const typologyStateKey = "echo_room.typology_results";
const stageEchoStateKey = "echo_room.stage_echo_notes";

type ProfileGenerateResponse = {
  sections?: Array<{
    section?: string;
    title?: string;
    content?: string;
  }>;
};

type StoredPersonaState = {
  answers?: unknown;
  echoNotes?: unknown;
  typologyResults?: unknown;
  updatedAt?: unknown;
};

type StoredAnswer = {
  id?: unknown;
  questionId?: unknown;
  content?: unknown;
};

export async function POST(request: Request) {
  try {
    const auth = await requireApiUserId(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { userId } = auth;
    const [memories, appStates] = await Promise.all([
      listFileMemories(userId, { sortByImportance: true, take: 80 }),
      getFileAppStates(userId, [
        echoRoomStateKey,
        typologyStateKey,
        stageEchoStateKey,
      ]),
    ]);
    const appStateMap = new Map(appStates.map((state) => [state.key, state.value]));
    const personaState = parseStoredJson<StoredPersonaState>(
      appStateMap.get(echoRoomStateKey),
    );
    const answers = sanitizePersonaAnswers(personaState?.answers);
    const typologyResults = sanitizeTypologyResults(
      parseStoredJson(appStateMap.get(typologyStateKey)) ??
        personaState?.typologyResults,
    );
    const stageEchoNotes = sanitizeStageEchoNotes(
      parseStoredJson(appStateMap.get(stageEchoStateKey)) ??
        personaState?.echoNotes,
    );
    const completedQuestionnaire = answers.length >= personaQuestions.length;

    if (!completedQuestionnaire && memories.length === 0) {
      return NextResponse.json(
        { error: "回声人格问答还没有完成，暂时无法生成完整的回声档案。" },
        { status: 400 },
      );
    }

    const prompt = await loadPrompt("profile-generator.md");
    const result = await createJsonCompletion<ProfileGenerateResponse>({
      system: prompt,
      user: JSON.stringify(
        {
          generation_rule:
            "用户完成全部回声人格问答后，将这些问答证据总结分析为回声档案，并保存到不同档案目录。",
          questionnaire: {
            completed: completedQuestionnaire,
            answer_count: answers.length,
            question_total: personaQuestions.length,
            updated_at:
              typeof personaState?.updatedAt === "string"
                ? personaState.updatedAt
                : null,
            progress: buildProgressSummary(answers),
            stages: buildStageSummary(answers),
            answers,
          },
          typology_results: typologyResults,
          stage_echo_notes: stageEchoNotes,
          extracted_memories: memories.map((memory) => ({
            type: memory.type,
            content: memory.content,
            emotion: memory.emotion,
            importance: memory.importance,
            confidence: memory.confidence,
            createdAt: memory.createdAt,
          })),
          required_sections: profileSections.map((section) => ({
            section: section.section,
            title: section.title,
          })),
        },
        null,
        2,
      ),
      temperature: 0.28,
    });

    const knownSections = new Set<string>(
      profileSections.map((item) => item.section),
    );
    const sectionMap = new Map(
      (result.sections ?? [])
        .filter(
          (section) =>
            typeof section.section === "string" &&
            knownSections.has(section.section) &&
            typeof section.content === "string" &&
            section.content.trim().length > 0,
        )
        .map((section) => [section.section as string, section]),
    );
    const safeSections = profileSections
      .map((section) => {
        const generated = sectionMap.get(section.section);

        if (!generated || typeof generated.content !== "string") {
          return null;
        }

        return {
          section: section.section,
          title:
            typeof generated.title === "string" && generated.title.trim()
              ? generated.title.trim()
              : section.title,
          content: generated.content.trim(),
        };
      })
      .filter((section): section is {
        section: (typeof profileSections)[number]["section"];
        title: string;
        content: string;
      } => Boolean(section));

    if (safeSections.length !== profileSections.length) {
      return NextResponse.json(
        { error: "回声档案生成不完整，请稍后再试一次。" },
        { status: 502 },
      );
    }

    const savedSections = await upsertFileProfileDocuments(userId, safeSections);
    const runtimeDocuments = createPersonaRuntimeProfileDocuments(
      savedSections,
      memories,
    );

    await upsertFileProfileDocuments(userId, runtimeDocuments);
    const soulDocument =
      runtimeDocuments.find((document) => document.section === "soul")
        ?.content ?? "";
    const agentsDocument =
      runtimeDocuments.find((document) => document.section === "agents")
        ?.content ?? "";
    const parallelLifeScript = await generateParallelLifeScript({
      archiveCompletedAt: new Date().toISOString(),
      soulDocument,
      agentsDocument,
      profileSections: savedSections,
      memories,
    });

    await setUserAppState(parallelLifeScriptStateKey, parallelLifeScript, userId);
    await updateUserMemoryDocument(
      {
        personaCompletion: 100,
        personaReady: true,
        profileReady: true,
        currentModule: "profile",
        soulDocument,
        agentsDocument,
        profileSnapshot: savedSections,
      },
      userId,
    );
    await recordUserEvent(
      {
        type: "profile.generated",
        payload: {
          sections: savedSections.map((section) => section.section),
          answerCount: answers.length,
          completedQuestionnaire,
          parallelLifeScriptReady: true,
        },
      },
      userId,
    );

    return NextResponse.json({ sections: sortProfileSections(savedSections) });
  } catch (error) {
    console.error(error);

    const message = isOpenAIConfigError(error)
      ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY，暂时无法生成回声档案。"
      : "这些问答暂时没能被整理成回声档案，请稍后再试一次。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseStoredJson<T = unknown>(value: string | null | undefined): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function sanitizePersonaAnswers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const questionMap = new Map(
    personaQuestions.map((question) => [question.id, question]),
  );
  const seenQuestionIds = new Set<string>();

  return value
    .slice(0, personaQuestions.length)
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const source = item as StoredAnswer;
      const fallbackQuestion = personaQuestions[index];
      const questionId =
        typeof source.questionId === "string"
          ? source.questionId
          : fallbackQuestion?.id;
      const question = questionId
        ? questionMap.get(questionId) ?? fallbackQuestion
        : fallbackQuestion;
      const content = typeof source.content === "string" ? source.content.trim() : "";

      if (!question || !content || seenQuestionIds.has(question.id)) {
        return null;
      }

      seenQuestionIds.add(question.id);

      return {
        index: index + 1,
        id: typeof source.id === "string" ? source.id : `answer-${index + 1}`,
        questionId: question.id,
        stage: question.stage,
        kind: question.kind,
        question: question.content,
        answer: content,
        weights: question.weights,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function sanitizeTypologyResults(value: unknown): PersonaTypologyResults {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as PersonaTypologyResults;
  const results: PersonaTypologyResults = {};

  for (const key of ["mbti", "sbti"] as const) {
    const result = source[key];

    if (!result || typeof result.type !== "string" || !result.type.trim()) {
      continue;
    }

    results[key] = {
      type: result.type.trim(),
      confidence: Math.min(100, Math.max(1, Math.round(Number(result.confidence) || 60))),
      summary: typeof result.summary === "string" ? result.summary.trim() : "",
      evidence: Array.isArray(result.evidence)
        ? result.evidence
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 8)
        : [],
      updatedAt:
        typeof result.updatedAt === "string"
          ? result.updatedAt
          : new Date().toISOString(),
    };
  }

  return results;
}

function sanitizeStageEchoNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const source = item as { id?: unknown; stage?: unknown; content?: unknown };
      const content = typeof source.content === "string" ? source.content.trim() : "";

      if (!content) {
        return null;
      }

      return {
        id: typeof source.id === "string" ? source.id : "",
        stage: source.stage,
        content,
      };
    })
    .filter((item): item is { id: string; stage: unknown; content: string } =>
      Boolean(item),
    )
    .slice(0, 8);
}

function buildProgressSummary(
  answers: ReturnType<typeof sanitizePersonaAnswers>,
) {
  const answeredQuestionIds = new Set(answers.map((answer) => answer.questionId));
  const configs = [...personaProgressConfig, ...typologyConfig];

  return configs.map((config) => {
    const total = personaQuestions.reduce(
      (sum, question) => sum + (question.weights[config.key as ProgressKey] ?? 0),
      0,
    );
    const answered = personaQuestions.reduce(
      (sum, question) =>
        sum +
        (answeredQuestionIds.has(question.id)
          ? question.weights[config.key as ProgressKey] ?? 0
          : 0),
      0,
    );

    return {
      key: config.key,
      label: config.label,
      value: total > 0 ? Math.round((answered / total) * 100) : 0,
      answered_weight: answered,
      total_weight: total,
    };
  });
}

function buildStageSummary(answers: ReturnType<typeof sanitizePersonaAnswers>) {
  const answerCount = answers.length;

  return personaStageConfig.map((stage, index) => {
    const previousGoal = index === 0 ? 0 : personaStageConfig[index - 1].answerGoal;

    return {
      stage: stage.stage,
      label: stage.label,
      answer_goal: stage.answerGoal,
      answered_in_stage: Math.max(
        0,
        Math.min(answerCount, stage.answerGoal) - previousGoal,
      ),
      completed: answerCount >= stage.answerGoal,
    };
  });
}
