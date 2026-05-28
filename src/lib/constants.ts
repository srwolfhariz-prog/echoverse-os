export const profileSections = [
  {
    section: "memory_roots",
    title: "记忆根系",
    filename: "memory_roots.md",
  },
  {
    section: "character_frame",
    title: "性格骨架",
    filename: "character_frame.md",
  },
  {
    section: "value_compass",
    title: "价值罗盘",
    filename: "value_compass.md",
  },
  {
    section: "relationship_loop",
    title: "关系回路",
    filename: "relationship_loop.md",
  },
  {
    section: "expression_voiceprint",
    title: "表达声纹",
    filename: "expression_voiceprint.md",
  },
  { section: "mbti", title: "MBTI", filename: "mbti.md" },
  { section: "sbti", title: "SBTI", filename: "sbti.md" },
] as const;

export const legacyProfileSections = [
  { section: "soul", title: "灵魂摘要", filename: "soul.md" },
  { section: "memories", title: "记忆碎片", filename: "memories.md" },
  {
    section: "emotional_patterns",
    title: "情绪模式",
    filename: "emotional_patterns.md",
  },
] as const;

export const memoryTypes = [
  "emotion",
  "value",
  "life_event",
  "career",
  "relationship",
  "unfinished_wish",
  "decision_pattern",
  "identity",
] as const;

export type ProfileSectionKey = (typeof profileSections)[number]["section"];
export type MemoryType = (typeof memoryTypes)[number];

export function sortProfileSections<T extends { section: string }>(items: T[]) {
  const order = new Map<string, number>(
    profileSections.map((item, index) => [item.section, index]),
  );

  return [...items].sort(
    (a, b) =>
      (order.get(a.section) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.section) ?? Number.MAX_SAFE_INTEGER),
  );
}
