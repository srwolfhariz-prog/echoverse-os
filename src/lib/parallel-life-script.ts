import { createJsonCompletion, loadPrompt } from "@/lib/ai";

export const parallelLifeScriptStateKey = "parallel_world.life_script";

export type ParallelLifeScript = {
  premise: string;
  desired_life_state: string;
  branch_start_date: string;
  current_stage: string;
  current_day_index: number;
  stable_context: {
    city: string;
    home: string;
    occupation: string;
    company_or_work_mode: string;
    relationship_status: string;
    important_people: string[];
    routines: string[];
  };
  long_term_timeline: string[];
  active_threads: string[];
};

type LifeScriptResponse = {
  life_script?: Partial<ParallelLifeScript>;
};

type ProfileSectionInput = {
  section: string;
  title?: string;
  content: string;
};

type MemoryInput = {
  type: string;
  content: string;
  emotion?: string | null;
  importance?: number | null;
  confidence?: number | null;
  createdAt?: Date | string;
};

type RegisteredUserIdentityInput = {
  age?: number | null;
  birthDate?: string;
  gender?: string;
  genderLabel?: string;
};

export async function generateParallelLifeScript({
  archiveCompletedAt,
  soulDocument,
  agentsDocument,
  profileSections,
  memories,
  registeredUser,
}: {
  archiveCompletedAt: string;
  soulDocument: string;
  agentsDocument: string;
  profileSections: ProfileSectionInput[];
  memories: MemoryInput[];
  registeredUser?: RegisteredUserIdentityInput;
}) {
  const prompt = await loadPrompt("parallel-life-script.md");
  const result = await createJsonCompletion<LifeScriptResponse>({
    system: prompt,
    user: JSON.stringify(
      {
        archive_completed_at: archiveCompletedAt,
        registered_user: registeredUser ?? null,
        soul_document: truncateText(soulDocument, 4200),
        agents_document: truncateText(agentsDocument, 3200),
        profile_sections: profileSections.map((section) => ({
          ...section,
          content: truncateText(section.content, 1600),
        })),
        recent_memories: memories.map((memory) => ({
          type: memory.type,
          content: truncateText(memory.content, 360),
          emotion: memory.emotion,
          importance: memory.importance,
          confidence: memory.confidence,
          createdAt: memory.createdAt,
        })),
      },
      null,
      2,
    ),
    temperature: 0.78,
    timeoutMs: 65_000,
    maxRetries: 0,
  });

  return normalizeParallelLifeScript(
    result.life_script,
    null,
    0,
    archiveCompletedAt,
  );
}

export function normalizeParallelLifeScript(
  value: Partial<ParallelLifeScript> | null | undefined,
  previous: ParallelLifeScript | null,
  dayIndex: number,
  branchStartDate: string,
): ParallelLifeScript {
  const stableContext = value?.stable_context ?? previous?.stable_context;

  return {
    premise:
      cleanText(value?.premise) ||
      previous?.premise ||
      "我沿着自己最渴望的生活状态，开始了一条新的平行人生线。",
    desired_life_state:
      cleanText(value?.desired_life_state) ||
      previous?.desired_life_state ||
      "更自由、更稳定、更能表达真实需求，也更靠近自己真正喜欢的生活。",
    branch_start_date:
      cleanText(value?.branch_start_date) ||
      previous?.branch_start_date ||
      branchStartDate,
    current_stage:
      cleanText(value?.current_stage) ||
      previous?.current_stage ||
      "分叉初期：我正在重新选择生活节奏。",
    current_day_index: Math.max(dayIndex, previous?.current_day_index ?? 0),
    stable_context: {
      city:
        cleanText(stableContext?.city) ||
        previous?.stable_context.city ||
        "一座让我可以重新开始的城市",
      home:
        cleanText(stableContext?.home) ||
        previous?.stable_context.home ||
        "一间采光不错的小房子",
      occupation:
        cleanText(stableContext?.occupation) ||
        previous?.stable_context.occupation ||
        "自由项目策划人",
      company_or_work_mode:
        cleanText(stableContext?.company_or_work_mode) ||
        previous?.stable_context.company_or_work_mode ||
        "自由职业与长期项目并行",
      relationship_status:
        cleanText(stableContext?.relationship_status) ||
        previous?.stable_context.relationship_status ||
        "暂时独处，但开始重新建立稳定关系",
      important_people: normalizeStringArray(
        stableContext?.important_people,
        previous?.stable_context.important_people ?? ["一位老朋友", "一个新的合作对象"],
        6,
      ),
      routines: normalizeStringArray(
        stableContext?.routines,
        previous?.stable_context.routines ?? ["早上整理计划", "晚上记录今天的情绪"],
        6,
      ),
    },
    long_term_timeline: normalizeStringArray(
      value?.long_term_timeline,
      previous?.long_term_timeline ?? [
        "我离开原来的惯性，开始重选生活节奏。",
        "我建立新的工作方式和居住状态。",
        "我遇见能影响关系观的人，也会经历一次重要分离。",
        "我在职业上获得更自由的表达空间。",
      ],
      8,
    ),
    active_threads: normalizeStringArray(
      value?.active_threads,
      previous?.active_threads ?? ["新的工作机会正在形成", "我正在适应新的生活空间"],
      8,
    ),
  };
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.replace(/\s+/g, " ").trim();

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}...`
    : normalized;
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
