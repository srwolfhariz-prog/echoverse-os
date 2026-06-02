import { readFile } from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

let client: OpenAI | null = null;
let clientSignature = "";
let globalPromptContextCache: string | null = null;

const globalPromptFiles = [
  { label: "GLOBAL_SYSTEM_PROMPT", filename: "global-system-prompt.md" },
  { label: "GLOBAL_SOUL_DOCUMENT", filename: "soul-global.md" },
  { label: "GLOBAL_AGENTS_DOCUMENT", filename: "agents-global.md" },
] as const;

export type AIProviderStatus = {
  configured: boolean;
  provider: string;
  model: string;
  baseURL: string;
  keySource: "GPT_API_KEY" | "OPENAI_API_KEY" | null;
  jsonResponseFormat: boolean;
  timeoutMs: number;
  maxRetries: number;
  globalPromptEnabled: boolean;
  globalPromptFiles: string[];
};

type AIProviderConfig = AIProviderStatus & {
  apiKey: string;
};

export class AIConfigError extends Error {
  constructor() {
    super("GPT_API_KEY or OPENAI_API_KEY is not configured.");
    this.name = "AIConfigError";
  }
}

export class OpenAIConfigError extends AIConfigError {}

export async function loadPrompt(filename: string) {
  return readFile(path.join(process.cwd(), "prompts", filename), "utf8");
}

async function loadGlobalPromptContext() {
  if (globalPromptContextCache) {
    return globalPromptContextCache;
  }

  const sections = await Promise.all(
    globalPromptFiles.map(async (item) => {
      const content = (await loadPrompt(item.filename)).trim();

      return `<${item.label}>\n${content}\n</${item.label}>`;
    }),
  );

  globalPromptContextCache = sections.join("\n\n");
  return globalPromptContextCache;
}

async function buildSystemPrompt(system: string) {
  const globalPromptContext = await loadGlobalPromptContext();

  return `${globalPromptContext}\n\n<MODULE_PROMPT>\n${system.trim()}\n</MODULE_PROMPT>`;
}

function readNumberEnv(value: string | undefined, fallback: number) {
  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getAIProviderConfig() {
  const gptApiKey = process.env.GPT_API_KEY?.trim();
  const openAIApiKey = process.env.OPENAI_API_KEY?.trim();
  const apiKey = gptApiKey || openAIApiKey || "";
  const baseURL =
    process.env.GPT_BASE_URL?.trim() || process.env.OPENAI_BASE_URL?.trim() || "";
  const provider =
    process.env.GPT_PROVIDER?.trim() ||
    (baseURL ? "openai-compatible" : "openai");
  const model =
    process.env.GPT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    "gpt-4.1-mini";
  const timeoutMs = readNumberEnv(
    process.env.GPT_TIMEOUT_MS || process.env.OPENAI_TIMEOUT_MS,
    45_000,
  );
  const maxRetries = readNumberEnv(
    process.env.GPT_MAX_RETRIES || process.env.OPENAI_MAX_RETRIES,
    1,
  );
  const responseFormat =
    process.env.GPT_RESPONSE_FORMAT?.trim().toLowerCase() ?? "json_object";
  const jsonResponseFormat = responseFormat !== "none";

  return {
    configured: Boolean(apiKey),
    provider,
    model,
    baseURL,
    keySource: gptApiKey
      ? "GPT_API_KEY"
      : openAIApiKey
        ? "OPENAI_API_KEY"
        : null,
    jsonResponseFormat,
    timeoutMs,
    maxRetries,
    globalPromptEnabled: true,
    globalPromptFiles: globalPromptFiles.map((item) => item.filename),
    apiKey,
  } satisfies AIProviderConfig;
}

export function getAIProviderStatus(): AIProviderStatus {
  const config = getAIProviderConfig();

  return {
    configured: config.configured,
    provider: config.provider,
    model: config.model,
    baseURL: config.baseURL,
    keySource: config.keySource,
    jsonResponseFormat: config.jsonResponseFormat,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
    globalPromptEnabled: config.globalPromptEnabled,
    globalPromptFiles: config.globalPromptFiles,
  };
}

function getClient() {
  const config = getAIProviderConfig();

  if (!config.apiKey) {
    throw new AIConfigError();
  }

  const signature = JSON.stringify({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
    timeoutMs: config.timeoutMs,
    maxRetries: config.maxRetries,
  });

  if (!client || clientSignature !== signature) {
    client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseURL || undefined,
      timeout: config.timeoutMs,
      maxRetries: config.maxRetries,
    });
    clientSignature = signature;
  }

  return { client, config };
}

export async function createChatReply({
  system,
  messages,
  temperature = 0.78,
}: {
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  temperature?: number;
}) {
  const { client, config } = getClient();
  const systemPrompt = await buildSystemPrompt(system);
  const response = await client.chat.completions.create({
    model: config.model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature,
  });

  return response.choices[0]?.message?.content?.trim() || "";
}

export async function createJsonCompletion<T>({
  system,
  user,
  temperature = 0.35,
  timeoutMs,
  maxRetries,
}: {
  system: string;
  user: string;
  temperature?: number;
  timeoutMs?: number;
  maxRetries?: number;
}) {
  const { client, config } = getClient();
  const systemPrompt = await buildSystemPrompt(system);
  const requestOptions =
    typeof timeoutMs === "number" || typeof maxRetries === "number"
      ? { timeout: timeoutMs, maxRetries }
      : undefined;
  const response = await client.chat.completions.create(
    {
      model: config.model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: user },
      ],
      ...(config.jsonResponseFormat
        ? { response_format: { type: "json_object" as const } }
        : {}),
      temperature,
    },
    requestOptions,
  );

  const content = response.choices[0]?.message?.content ?? "{}";
  return parseJsonObject<T>(content);
}

export async function testAIConnection() {
  const { client, config } = getClient();
  const response = await client.chat.completions.create({
    model: config.model,
    messages: [
      {
        role: "system",
        content: "You are a connection health checker. Reply with OK only.",
      },
      { role: "user", content: "ping" },
    ],
    max_tokens: 8,
    temperature: 0,
  });

  return {
    ok: true,
    provider: config.provider,
    configured: config.configured,
    model: response.model || config.model,
    baseURL: config.baseURL,
    reply: response.choices[0]?.message?.content?.trim() || "",
  };
}

export function parseJsonObject<T>(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const raw = fenced?.[1] ?? trimmed;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");

  if (start === -1 || end === -1 || end < start) {
    throw new Error("AI response did not include a JSON object.");
  }

  return JSON.parse(raw.slice(start, end + 1)) as T;
}

export function isAIConfigError(error: unknown) {
  return error instanceof AIConfigError;
}

export function isOpenAIConfigError(error: unknown) {
  return isAIConfigError(error);
}
