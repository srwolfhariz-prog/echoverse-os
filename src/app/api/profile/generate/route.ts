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
  type PersonaStage,
  type PersonaTypologyResults,
  type ProgressKey,
} from "@/lib/persona-question-bank";
import {
  generateParallelLifeScript,
  normalizeParallelLifeScript,
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
const stageProfileFrameworkStateKey = "echo_room.stage_profile_frameworks";

type ProfileGenerateResponse = {
  sections?: Array<{
    section?: string;
    title?: string;
    content?: string;
  }>;
};

type ProfileSectionGenerateResponse = {
  section?: string;
  title?: string;
  content?: string;
};

type GeneratedProfileSection = {
  section: (typeof profileSections)[number]["section"];
  title: string;
  content: string;
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

type StageProfileFramework = {
  id: string;
  stage: PersonaStage;
  stageLabel: string;
  summary: string;
  sections: Array<{
    section: string;
    title: string;
    content: string;
  }>;
  updatedAt: string;
};

type StageProfileFrameworkResponse = {
  summary?: unknown;
  sections?: unknown;
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
        stageProfileFrameworkStateKey,
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
    const stageFrameworks = await ensureStageProfileFrameworks({
      answers,
      existingFrameworks: sanitizeStageProfileFrameworks(
        parseStoredJson(appStateMap.get(stageProfileFrameworkStateKey)),
      ),
      userId,
    });
    const completedQuestionnaire = answers.length >= personaQuestions.length;

    if (!completedQuestionnaire && memories.length === 0) {
      return NextResponse.json(
        { error: "回声人格问答还没有完成，暂时无法生成完整的回声档案。" },
        { status: 400 },
      );
    }

    const answerSamples = buildAnswerSamples(answers);
    const safeSections =
      stageFrameworks.length > 0
        ? await generateProfileSectionsFromFrameworks({
            stageFrameworks,
            typologyResults,
            stageEchoNotes,
            memories,
            answerSamples,
          })
        : await generateProfileSectionsFromRawQuestionnaire({
            answers,
            completedQuestionnaire,
            memories,
            personaUpdatedAt:
              typeof personaState?.updatedAt === "string"
                ? personaState.updatedAt
                : null,
            stageEchoNotes,
            typologyResults,
          });

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
    const archiveCompletedAt = new Date().toISOString();
    let parallelLifeScript;

    try {
      parallelLifeScript = await generateParallelLifeScript({
        archiveCompletedAt,
        soulDocument,
        agentsDocument,
        profileSections: savedSections,
        memories,
      });
    } catch (error) {
      console.error("parallel life script generation failed", error);
      parallelLifeScript = normalizeParallelLifeScript(
        null,
        null,
        0,
        archiveCompletedAt,
      );
    }

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

async function generateProfileSectionsFromFrameworks({
  stageFrameworks,
  typologyResults,
  stageEchoNotes,
  memories,
  answerSamples,
}: {
  stageFrameworks: StageProfileFramework[];
  typologyResults: PersonaTypologyResults;
  stageEchoNotes: ReturnType<typeof sanitizeStageEchoNotes>;
  memories: Awaited<ReturnType<typeof listFileMemories>>;
  answerSamples: ReturnType<typeof buildAnswerSamples>;
}) {
  const prompt = await loadPrompt("profile-section-generator.md");
  const results = await Promise.all(
    profileSections.map(async (targetSection) => {
      try {
        return await createJsonCompletion<ProfileSectionGenerateResponse>({
          system: prompt,
          user: JSON.stringify(
            {
              generation_rule:
                "用户已在每个问答阶段生成过阶段人格框架。请只为当前 target_section 生成最终回声档案目录，避免单次大请求超时。",
              target_section: {
                section: targetSection.section,
                title: targetSection.title,
              },
              stage_profile_frameworks: buildSectionFrameworkEvidence(
                stageFrameworks,
                targetSection.section,
              ),
              typology_results: typologyResults,
              stage_echo_notes: stageEchoNotes,
              extracted_memories: buildMemoryEvidence(memories),
              answer_samples: filterAnswerSamplesForSection(
                answerSamples,
                targetSection.section,
              ),
            },
            null,
            2,
          ),
          temperature:
            targetSection.section === "mbti" || targetSection.section === "sbti"
              ? 0.24
              : 0.3,
          timeoutMs: 65_000,
          maxRetries: 0,
        });
      } catch (error) {
        console.error(
          `profile section generation failed: ${targetSection.section}`,
          error,
        );

        return buildFallbackProfileSection({
          targetSection,
          stageFrameworks,
          typologyResults,
          memories,
        });
      }
    }),
  );

  return sanitizeGeneratedProfileSections(results);
}

async function generateProfileSectionsFromRawQuestionnaire({
  answers,
  completedQuestionnaire,
  memories,
  personaUpdatedAt,
  stageEchoNotes,
  typologyResults,
}: {
  answers: ReturnType<typeof sanitizePersonaAnswers>;
  completedQuestionnaire: boolean;
  memories: Awaited<ReturnType<typeof listFileMemories>>;
  personaUpdatedAt: string | null;
  stageEchoNotes: ReturnType<typeof sanitizeStageEchoNotes>;
  typologyResults: PersonaTypologyResults;
}) {
  const prompt = await loadPrompt("profile-generator.md");
  const result = await createJsonCompletion<ProfileGenerateResponse>({
    system: prompt,
    user: JSON.stringify(
      {
        generation_rule:
          "用户完成全部回声人格问答后，将问答、记忆和类型分析综合分析为最终回声档案，并保存到不同档案目录。",
        profile_input_mode: "raw_questionnaire_fallback",
        questionnaire: {
          completed: completedQuestionnaire,
          answer_count: answers.length,
          question_total: personaQuestions.length,
          updated_at: personaUpdatedAt,
          progress: buildProgressSummary(answers),
          stages: buildStageSummary(answers),
          answer_samples: answers,
        },
        typology_results: typologyResults,
        stage_echo_notes: stageEchoNotes,
        extracted_memories: buildMemoryEvidence(memories, 80),
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

  return sanitizeGeneratedProfileSections(result.sections);
}

function buildFallbackProfileSection({
  targetSection,
  stageFrameworks,
  typologyResults,
  memories,
}: {
  targetSection: (typeof profileSections)[number];
  stageFrameworks: StageProfileFramework[];
  typologyResults: PersonaTypologyResults;
  memories: Awaited<ReturnType<typeof listFileMemories>>;
}): ProfileSectionGenerateResponse {
  const sectionEvidence = buildSectionFrameworkEvidence(
    stageFrameworks,
    targetSection.section,
  );
  const memoryEvidence = buildMemoryEvidence(memories, 10);
  const formationLines = sectionEvidence
    .map(
      (item) =>
        `- ${cleanArchiveText(item.section_content)}`,
    )
    .filter((item) => item.trim().length > 2)
    .join("\n");

  if (targetSection.section === "mbti" || targetSection.section === "sbti") {
    const result = typologyResults[targetSection.section];
    const evidence = result?.evidence?.length
      ? result.evidence.map((item) => `- ${cleanArchiveText(item)}`).join("\n")
      : "";

    return {
      section: targetSection.section,
      title: targetSection.title,
      content: [
        `## 我的类型倾向\n我是 ${result?.type ?? "尚未形成明确类型"}${
          result?.confidence ? `，置信度约 ${result.confidence}%` : ""
        }。${result?.summary ? `\n\n${cleanArchiveText(result.summary)}` : ""}`,
        `## 我为什么会呈现这种类型\n${
          evidence || "- 我的性格里已经形成了可被持续观察的类型线索。"
        }`,
        `## 它如何体现在我的生活里\n${formationLines}`,
        "## 它帮助我理解自己\n这个类型不是给我贴上的标签，而是一种帮助我看见自己的方式：我如何恢复能量，如何做决定，如何在关系里保护自己，又如何在重要的事情上保持清醒和投入。",
      ].join("\n\n"),
    };
  }

  const memoryLines = memoryEvidence
    .map((item) => `- ${cleanArchiveText(item.content)}`)
    .join("\n");

  return {
    section: targetSection.section,
    title: targetSection.title,
    content: [
      `## 我是一个什么样的人\n我的${targetSection.title}记录的是我在记忆、关系、价值和表达中反复出现的稳定模式。它不是一个标签，而是一组能够解释我为什么会这样感受、这样选择、这样靠近或后退的内在结构。`,
      `## 那些塑造我的线索\n${formationLines}`,
      `## 我的重要记忆\n${memoryLines || "- 当前主要依据已经形成的人格画像线索进行分析。"}`,
      "## 潜在影响\n这些经历和模式共同塑造了我的自我保护方式：我会在重要处境中反复寻找安全感、意义感、被理解感与可控感。它们既让我更敏感、更能理解别人，也可能让我在压力中更容易把真实需求先放到后面。",
      "## 我的行为表现\n在现实互动中，这一部分会影响我的选择速度、压力反应、关系边界、表达浓度和行动方式。我可能看起来平静、能扛事，但内在常常需要先确认事情是否值得、是否安全、是否仍然靠近真实的自己。",
      "## 我如何与世界相处\n我并不是只想要一个正确答案。我更在意自己是否还能保留真实、温度和秩序；是否能在关系里被具体地理解；是否能在工作和生活里慢慢建立一种不再长期消耗自己的节奏。",
    ].join("\n\n"),
  };
}

function cleanArchiveText(value: string) {
  return value
    .split(/(?<=[。！？；])/)
    .map((part) => part.trim())
    .filter(
      (part) =>
        part &&
        !/虚拟人格|写入规则|人格建模|数字人格|后续生成|AI|模型|校准/.test(
          part,
        ),
    )
    .join("")
    .replace(/本阶段可见的/g, "")
    .replace(/本阶段/g, "")
    .replace(/四个阶段/g, "")
    .replace(/阶段人格框架/g, "人格线索")
    .replace(/人格框架/g, "人格线索")
    .replace(/这个人/g, "我")
    .replace(/用户/g, "我")
    .replace(/她/g, "我")
    .replace(/他/g, "我")
    .replace(/自己/g, "我自己")
    .trim();
}

function sanitizeGeneratedProfileSections(
  sections: Array<ProfileSectionGenerateResponse> | undefined,
) {
  const knownSections = new Set<string>(
    profileSections.map((item) => item.section),
  );
  const sectionMap = new Map(
    (sections ?? [])
      .filter(
        (section) =>
          typeof section.section === "string" &&
          knownSections.has(section.section) &&
          typeof section.content === "string" &&
          section.content.trim().length > 0,
      )
      .map((section) => [section.section as string, section]),
  );

  return profileSections
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
    .filter((section): section is GeneratedProfileSection => Boolean(section));
}

function buildSectionFrameworkEvidence(
  frameworks: StageProfileFramework[],
  sectionKey: ProgressKey,
) {
  return frameworks
    .map((framework) => {
      const section = framework.sections.find(
        (item) => item.section === sectionKey,
      );

      if (!section) {
        return null;
      }

      return {
        stage: framework.stage,
        stage_label: framework.stageLabel,
        stage_summary: truncateText(framework.summary, 360),
        section_content: section.content,
      };
    })
    .filter(
      (item): item is {
        stage: PersonaStage;
        stage_label: string;
        stage_summary: string;
        section_content: string;
      } => Boolean(item),
    );
}

function buildMemoryEvidence(
  memories: Awaited<ReturnType<typeof listFileMemories>>,
  take = 36,
) {
  return memories.slice(0, take).map((memory) => ({
    type: memory.type,
    content: truncateText(memory.content, 260),
    emotion: memory.emotion,
    importance: memory.importance,
    confidence: memory.confidence,
    createdAt: memory.createdAt,
  }));
}

function filterAnswerSamplesForSection(
  answerSamples: ReturnType<typeof buildAnswerSamples>,
  sectionKey: ProgressKey,
) {
  const matched = answerSamples.filter(
    (answer) => Number(answer.weights[sectionKey] ?? 0) > 0,
  );
  const source = matched.length > 0 ? matched : answerSamples.slice(0, 8);

  return source.slice(0, 18).map((answer) => ({
    stage: answer.stage,
    stage_label: answer.stage_label,
    question: truncateText(answer.question, 96),
    answer: truncateText(answer.answer, 160),
    weight: answer.weights[sectionKey] ?? 0,
  }));
}

async function ensureStageProfileFrameworks({
  answers,
  existingFrameworks,
  userId,
}: {
  answers: ReturnType<typeof sanitizePersonaAnswers>;
  existingFrameworks: StageProfileFramework[];
  userId: string;
}) {
  const frameworks = [...existingFrameworks];
  let changed = false;

  for (const stageConfig of personaStageConfig) {
    const stage = stageConfig.stage;
    const stageAnswers = answers.filter((answer) => answer.stage === stage);
    const existing = frameworks.find((framework) => framework.stage === stage);

    if (existing || stageAnswers.length < stageConfig.questionCount) {
      continue;
    }

    const generated = await generateStageProfileFramework(
      stage,
      stageConfig.label,
      stageAnswers,
    );

    if (generated) {
      frameworks.push(generated);
      changed = true;
    }
  }

  const sorted = frameworks
    .filter(
      (framework, index, array) =>
        array.findIndex((item) => item.stage === framework.stage) === index,
    )
    .sort((a, b) => a.stage - b.stage);

  if (changed) {
    await setUserAppState(stageProfileFrameworkStateKey, sorted, userId);
  }

  return sorted;
}

async function generateStageProfileFramework(
  stage: PersonaStage,
  stageLabel: string,
  answers: ReturnType<typeof sanitizePersonaAnswers>,
) {
  const prompt = await loadPrompt("persona-stage-profile.md");
  const result = await createJsonCompletion<StageProfileFrameworkResponse>({
    system: prompt,
    user: JSON.stringify(
      {
        stage,
        stage_label: stageLabel,
        required_sections: profileSections.map((section) => ({
          section: section.section,
          title: section.title,
        })),
        answers: buildCompactStageAnswers(answers),
      },
      null,
      2,
    ),
    temperature: 0.36,
  });

  return sanitizeStageProfileFramework({
    id: `stage-profile-${stage}`,
    stage,
    stageLabel,
    summary: result.summary,
    sections: result.sections,
    updatedAt: new Date().toISOString(),
  });
}

function buildCompactStageAnswers(
  answers: ReturnType<typeof sanitizePersonaAnswers>,
) {
  return answers.map((answer, index) => ({
    index: index + 1,
    question: truncateText(answer.question, 72),
    answer: truncateText(answer.answer, 110),
    kind: answer.kind,
    weights: answer.weights,
  }));
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
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

function sanitizeStageProfileFrameworks(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => sanitizeStageProfileFramework(item))
    .filter((item): item is StageProfileFramework => Boolean(item));
}

function sanitizeStageProfileFramework(value: unknown) {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<StageProfileFramework>;
  const stage = normalizeStage(source.stage);
  const stageConfig = personaStageConfig.find((item) => item.stage === stage);
  const sections = sanitizeFrameworkSections(source.sections);

  if (!stage || sections.length === 0) {
    return null;
  }

  return {
    id: typeof source.id === "string" ? source.id : `stage-profile-${stage}`,
    stage,
    stageLabel:
      typeof source.stageLabel === "string" && source.stageLabel.trim()
        ? source.stageLabel.trim()
        : stageConfig?.label ?? `阶段${stage}`,
    summary:
      typeof source.summary === "string" && source.summary.trim()
        ? source.summary.trim()
        : "这一阶段已经形成可继续整合的人格框架。",
    sections,
    updatedAt:
      typeof source.updatedAt === "string"
        ? source.updatedAt
        : new Date().toISOString(),
  } satisfies StageProfileFramework;
}

function sanitizeFrameworkSections(value: unknown) {
  const knownSections = new Map<string, string>(
    profileSections.map((section) => [section.section, section.title]),
  );

  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const source = item as { section?: unknown; title?: unknown; content?: unknown };
      const section = typeof source.section === "string" ? source.section : "";
      const knownTitle = knownSections.get(section);
      const content =
        typeof source.content === "string" ? source.content.trim() : "";

      if (!knownTitle || !content) {
        return null;
      }

      return {
        section,
        title:
          typeof source.title === "string" && source.title.trim()
            ? source.title.trim()
            : knownTitle,
        content,
      };
    })
    .filter((item): item is { section: string; title: string; content: string } =>
      Boolean(item),
    );
}

function normalizeStage(value: unknown): PersonaStage | null {
  const stage = Number(value);

  return stage === 1 || stage === 2 || stage === 3 || stage === 4
    ? stage
    : null;
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

function buildAnswerSamples(answers: ReturnType<typeof sanitizePersonaAnswers>) {
  return personaStageConfig.flatMap((stage) => {
    const stageAnswers = answers.filter((answer) => answer.stage === stage.stage);
    const openAnswers = stageAnswers.filter((answer) => answer.kind === "open");
    const choiceAnswers = stageAnswers.filter((answer) => answer.kind === "choice");
    const samples = [...openAnswers.slice(0, 8), ...choiceAnswers.slice(0, 4)];

    return samples.map((answer) => ({
      stage: answer.stage,
      stage_label: stage.label,
      question: answer.question,
      answer: answer.answer,
      weights: answer.weights,
    }));
  });
}
