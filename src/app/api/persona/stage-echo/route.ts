import { NextResponse } from "next/server";
import { createJsonCompletion, isOpenAIConfigError, loadPrompt } from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";
import {
  personaQuestions,
  personaStageConfig,
  type PersonaStage,
} from "@/lib/persona-question-bank";
import { recordUserEvent, setUserAppState } from "@/lib/user-memory";

export const runtime = "nodejs";

const stageEchoAppStateKey = "echo_room.stage_echo_notes";

type StageEchoResponse = {
  stage_echo?: string;
  keywords?: unknown;
};

type SubmittedAnswer = {
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
    const body = (await request.json()) as {
      stage?: unknown;
      answers?: unknown;
      existingNotes?: unknown;
    };
    const stage = normalizeStage(body.stage);

    if (!stage) {
      return NextResponse.json({ error: "stage is required" }, { status: 400 });
    }

    const stageConfig = personaStageConfig.find((item) => item.stage === stage);
    const answers = sanitizeAnswers(body.answers).filter(
      (answer) => answer.question?.stage === stage,
    );

    if (!stageConfig || answers.length < stageConfig.questionCount) {
      return NextResponse.json(
        { error: "stage answers are not complete yet" },
        { status: 400 },
      );
    }

    const prompt = await loadPrompt("persona-stage-echo.md");
    const result = await createJsonCompletion<StageEchoResponse>({
      system: prompt,
      user: JSON.stringify(
        {
          stage,
          stage_label: stageConfig.label,
          answers: answers.map((answer) => ({
            question: answer.question.content,
            answer: answer.content,
            weights: answer.question.weights,
          })),
        },
        null,
        2,
      ),
      temperature: 0.52,
    });
    const content = normalizeStageEcho(result.stage_echo);

    if (!content) {
      return NextResponse.json(
        { error: "stage echo did not return valid content" },
        { status: 502 },
      );
    }

    const existingNotes = sanitizeExistingNotes(body.existingNotes);
    const note = {
      id: `stage-echo-${stage}`,
      stage,
      content,
      keywords: Array.isArray(result.keywords)
        ? result.keywords
            .filter((item) => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 5)
        : [],
      updatedAt: new Date().toISOString(),
    };
    const nextNotes = [
      note,
      ...existingNotes.filter((item) => item.stage !== stage),
    ].slice(0, 4);

    await setUserAppState(stageEchoAppStateKey, nextNotes, userId);
    await recordUserEvent(
      {
        type: "persona.stage_echo_generated",
        payload: {
          stage,
          stageLabel: stageConfig.label,
          keywords: note.keywords,
        },
      },
      userId,
    );

    return NextResponse.json({ note, notes: nextNotes });
  } catch (error) {
    console.error(error);

    const message = isOpenAIConfigError(error)
      ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY，暂时无法生成阶段回声。"
      : "阶段回声暂时没有生成，请稍后再试。";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function normalizeStage(value: unknown): PersonaStage | null {
  const stage = Number(value);

  return stage === 1 || stage === 2 || stage === 3 || stage === 4
    ? stage
    : null;
}

function sanitizeAnswers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  const questionMap = new Map(personaQuestions.map((question) => [question.id, question]));

  return value
    .map((answer: SubmittedAnswer) => {
      const questionId =
        typeof answer.questionId === "string" ? answer.questionId : "";
      const question = questionMap.get(questionId);
      const content = typeof answer.content === "string" ? answer.content.trim() : "";

      return question && content ? { question, content } : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function normalizeStageEcho(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/另一个我/g, "我")
    .replace(/另一个自己/g, "我")
    .replace(/TA/g, "我")
    .trim()
    .slice(0, 140);
}

function sanitizeExistingNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const source = item as {
        id?: unknown;
        stage?: unknown;
        content?: unknown;
        keywords?: unknown;
        updatedAt?: unknown;
      };
      const stage = normalizeStage(source.stage);
      const content = normalizeStageEcho(source.content);

      return stage && content
        ? {
            id: typeof source.id === "string" ? source.id : `stage-echo-${stage}`,
            stage,
            content,
            keywords: Array.isArray(source.keywords)
              ? source.keywords.filter((keyword) => typeof keyword === "string")
              : [],
            updatedAt:
              typeof source.updatedAt === "string"
                ? source.updatedAt
                : new Date().toISOString(),
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item));
}
