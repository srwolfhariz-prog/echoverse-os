import { NextResponse } from "next/server";
import { createJsonCompletion, isOpenAIConfigError, loadPrompt } from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";
import {
  mbtiTypes,
  personaQuestions,
  sbtiTypes,
  type PersonaTypologyResult,
  type PersonaTypologyResults,
  type ProgressKey,
  type TypologyDimension,
} from "@/lib/persona-question-bank";
import { recordUserEvent, setUserAppState } from "@/lib/user-memory";

export const runtime = "nodejs";

const typologyAppStateKey = "echo_room.typology_results";
const typologyKeys: TypologyDimension[] = ["mbti", "sbti"];

type SubmittedAnswer = {
  questionId?: unknown;
  content?: unknown;
  weights?: unknown;
};

type TypologyResponse = Partial<
  Record<
    TypologyDimension,
    {
      type?: string;
      confidence?: number;
      summary?: string;
      evidence?: unknown;
    }
  >
>;

export async function POST(request: Request) {
  try {
    const auth = await requireApiUserId(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { userId } = auth;
    const body = (await request.json()) as {
      targets?: unknown;
      answers?: unknown;
    };
    const targets = normalizeTargets(body.targets);
    const answers = sanitizeAnswers(body.answers);

    if (!targets.length) {
      return NextResponse.json({ error: "typology target is required" }, { status: 400 });
    }

    for (const target of targets) {
      if (!hasCompletedWeightedQuestions(target, answers)) {
        return NextResponse.json(
          { error: `${target.toUpperCase()} weighted questions are not complete yet.` },
          { status: 400 },
        );
      }
    }

    const prompt = await loadPrompt("persona-typology-analyzer.md");
    const result = await createJsonCompletion<TypologyResponse>({
      system: prompt,
      user: JSON.stringify(
        {
          targets,
          allowed_types: {
            mbti: mbtiTypes,
            sbti: sbtiTypes,
          },
          evidence: targets.map((target) => ({
            target,
            answers: buildEvidence(target, answers),
          })),
        },
        null,
        2,
      ),
      temperature: 0.18,
    });
    const safeResults = normalizeResults(result, targets);

    if (!Object.keys(safeResults).length) {
      return NextResponse.json(
        { error: "typology analysis did not return valid types" },
        { status: 502 },
      );
    }

    await setUserAppState(typologyAppStateKey, safeResults, userId);
    await recordUserEvent(
      {
        type: "persona.typology_analyzed",
        payload: {
          targets: Object.keys(safeResults),
          results: Object.fromEntries(
            Object.entries(safeResults).map(([key, value]) => [key, value?.type]),
          ),
        },
      },
      userId,
    );

    return NextResponse.json({ results: safeResults });
  } catch (error) {
    console.error(error);

    const message = isOpenAIConfigError(error)
      ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY，暂时无法分析 MBTI/SBTI。"
      : "MBTI/SBTI 分析暂时没有完成，请稍后再试。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeTargets(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return typologyKeys.filter((key) => value.includes(key));
}

function sanitizeAnswers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const knownQuestionIds = new Set(personaQuestions.map((question) => question.id));

  return value
    .map((answer: SubmittedAnswer) => ({
      questionId: typeof answer.questionId === "string" ? answer.questionId : "",
      content: typeof answer.content === "string" ? answer.content.trim() : "",
    }))
    .filter(
      (answer) => knownQuestionIds.has(answer.questionId) && answer.content.length > 0,
    );
}

function hasCompletedWeightedQuestions(
  target: TypologyDimension,
  answers: Array<{ questionId: string; content: string }>,
) {
  const answeredQuestionIds = new Set(answers.map((answer) => answer.questionId));
  const requiredQuestions = personaQuestions.filter(
    (question) => (question.weights[target] ?? 0) > 0,
  );

  return requiredQuestions.every((question) => answeredQuestionIds.has(question.id));
}

function buildEvidence(
  target: TypologyDimension,
  answers: Array<{ questionId: string; content: string }>,
) {
  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.content]));

  return personaQuestions
    .filter((question) => (question.weights[target] ?? 0) > 0)
    .map((question) => ({
      id: question.id,
      question: question.content,
      answer: answerMap.get(question.id) ?? "",
      weight: question.weights[target as ProgressKey] ?? 0,
      related_weights: question.weights,
    }))
    .filter((item) => item.answer);
}

function normalizeResults(result: TypologyResponse, targets: TypologyDimension[]) {
  const now = new Date().toISOString();
  const safeResults: PersonaTypologyResults = {};

  for (const target of targets) {
    const source = result[target];
    const type =
      target === "mbti"
        ? normalizeAllowedType(source?.type, mbtiTypes)
        : normalizeAllowedType(source?.type, sbtiTypes);

    if (!source || !type) {
      continue;
    }

    safeResults[target] = {
      type,
      confidence: clampConfidence(source.confidence),
      summary: typeof source.summary === "string" ? source.summary.trim() : "",
      evidence: Array.isArray(source.evidence)
        ? source.evidence
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 5)
        : [],
      updatedAt: now,
    } satisfies PersonaTypologyResult;
  }

  return safeResults;
}

function normalizeAllowedType<T extends readonly string[]>(
  value: unknown,
  allowedTypes: T,
) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";

  return allowedTypes.find((type) => type.toLowerCase() === normalized) ?? "";
}

function clampConfidence(value: unknown) {
  return Math.min(100, Math.max(1, Math.round(Number(value) || 60)));
}
