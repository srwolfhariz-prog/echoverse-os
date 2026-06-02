import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { createJsonCompletion, isOpenAIConfigError, loadPrompt } from "@/lib/ai";
import { requireApiUserId } from "@/lib/api-auth";
import {
  listFileLetters,
  listFileMemories,
  listFileProfileDocuments,
} from "@/lib/file-user-store";
import { buildPersonaRuntimeDocuments } from "@/lib/persona-runtime";

export const runtime = "nodejs";

type LetterSuggestionResponse = {
  questions?: unknown;
};

export async function GET(request: Request) {
  try {
    const auth = await requireApiUserId(request);

    if ("response" in auth) {
      return auth.response;
    }

    const { userId } = auth;
    const [profile, memories, letters] = await Promise.all([
      listFileProfileDocuments(userId),
      listFileMemories(userId, { take: 30 }),
      listFileLetters(userId, 8),
    ]);
    const personaContext = buildPersonaRuntimeDocuments(profile, memories);

    if (!personaContext.archiveReady) {
      return NextResponse.json(
        {
          error: "回声档案搭建完成后，才能生成贴合你人格的参考问题。",
          questions: [],
        },
        { status: 409 },
      );
    }

    const prompt = await loadPrompt("life-letter-suggestions.md");
    const result = await createJsonCompletion<LetterSuggestionResponse>({
      system: prompt,
      user: JSON.stringify(
        {
          random_seed: randomUUID(),
          profile_ready: true,
          soul_document: personaContext.soulDocument,
          agents_document: personaContext.agentsDocument,
          profile_sections: personaContext.visibleSections,
          recent_memories: memories.map((memory) => ({
            type: memory.type,
            content: memory.content,
            emotion: memory.emotion,
            importance: memory.importance,
            confidence: memory.confidence,
            createdAt: memory.createdAt,
          })),
          recent_letter_questions: letters.map((letter) => ({
            question: letter.question,
            category: letter.category,
            createdAt: letter.createdAt,
          })),
        },
        null,
        2,
      ),
      temperature: 0.88,
    });

    const questions = normalizeQuestions(result.questions);

    return NextResponse.json({ questions });
  } catch (error) {
    console.error(error);

    const message = isOpenAIConfigError(error)
      ? "还没有配置 GPT_API_KEY / OPENAI_API_KEY，暂时无法生成参考问题。"
      : "参考问题暂时没有生成，请稍后再试。";

    return NextResponse.json({ error: message, questions: [] }, { status: 500 });
  }
}

function normalizeQuestions(value: unknown) {
  const source = Array.isArray(value) ? value : [];
  const questions = source
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().replace(/^["“”]+|["“”]+$/g, ""))
    .filter(Boolean);
  const uniqueQuestions = Array.from(new Set(questions));

  return uniqueQuestions.slice(0, 4);
}
