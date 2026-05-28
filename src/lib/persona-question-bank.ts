export type PersonaStage = 1 | 2 | 3 | 4;

export type PersonaDimension =
  | "memory_roots"
  | "character_frame"
  | "value_compass"
  | "relationship_loop"
  | "expression_voiceprint";

export type TypologyDimension = "mbti" | "sbti";
export type ProgressKey = PersonaDimension | TypologyDimension;

export type PersonaQuestion = {
  id: string;
  stage?: PersonaStage;
  kind: "open" | "choice";
  content: string;
  options?: string[];
  placeholder?: string;
  weights: Partial<Record<ProgressKey, number>>;
  feedback: string;
};

export type PersonaTypologyResult = {
  type: string;
  confidence: number;
  summary: string;
  evidence: string[];
  updatedAt: string;
};

export type PersonaTypologyResults = Partial<
  Record<TypologyDimension, PersonaTypologyResult>
>;

export const mbtiTypes = [
  "INTJ",
  "INTP",
  "ENTJ",
  "ENTP",
  "INFJ",
  "INFP",
  "ENFJ",
  "ENFP",
  "ISTJ",
  "ISFJ",
  "ESTJ",
  "ESFJ",
  "ISTP",
  "ISFP",
  "ESTP",
  "ESFP",
] as const;

export const sbtiTypes = [
  "CTRL",
  "ATM-er",
  "Dior-s",
  "BOSS",
  "THAN-K",
  "OH-NO",
  "GOGO",
  "SEXY",
  "LOVE-R",
  "MUM",
  "FAKE",
  "OJBK",
  "MALO",
  "JOKE-R",
  "WOC!",
  "THIN-K",
  "SHIT",
  "ZZZZ",
  "POOR",
  "MONK",
  "IMSB",
  "SOLO",
  "FUCK",
  "DEAD",
  "IMFW",
  "HHHH",
  "DRUNK",
] as const;

type PersonaQuestionSeed = Omit<PersonaQuestion, "id" | "stage" | "feedback"> & {
  feedback?: string;
};

export const personaProgressConfig: Array<{ key: PersonaDimension; label: string }> = [
  { key: "memory_roots", label: "记忆根系" },
  { key: "character_frame", label: "性格骨架" },
  { key: "value_compass", label: "价值罗盘" },
  { key: "relationship_loop", label: "关系回路" },
  { key: "expression_voiceprint", label: "表达声纹" },
];

export const typologyConfig: Array<{
  key: TypologyDimension;
  label: string;
  result: string;
}> = [
  { key: "mbti", label: "MBTI", result: "INFJ" },
  { key: "sbti", label: "SBTI", result: "MONK" },
];

export const personaStageConfig = [
  {
    stage: 1,
    label: "人格框架",
    completeStatus: "已写入",
    answerGoal: 45,
    questionCount: 45,
  },
  {
    stage: 2,
    label: "行为模式",
    completeStatus: "已写入",
    answerGoal: 95,
    questionCount: 50,
  },
  {
    stage: 3,
    label: "深层映射",
    completeStatus: "已写入",
    answerGoal: 165,
    questionCount: 70,
  },
  {
    stage: 4,
    label: "回声人格",
    completeStatus: "已完成",
    answerGoal: 200,
    questionCount: 35,
  },
] as const;

const stageFeedback: Record<PersonaStage, string> = {
  1: "这一点会写入人格框架，帮另一个你先长出清晰的轮廓。",
  2: "这个回答会进入行为模式，记录你真实的反应和做事节奏。",
  3: "这段信息会沉进记忆根系，成为理解你人生轨迹的重要线索。",
  4: "这会用于最后的人格校准，让回声人格更像真实的你。",
};

function makeQuestions(
  stage: PersonaStage,
  prefix: string,
  seeds: PersonaQuestionSeed[],
) {
  return seeds.map((seed, index): PersonaQuestion => ({
    id: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    stage,
    feedback: seed.feedback ?? stageFeedback[stage],
    ...seed,
  }));
}

const stageOne: PersonaQuestionSeed[] = [
  {
    kind: "choice",
    content: "一个人待着时，你更像哪种状态？",
    options: ["慢慢充电", "想很多事", "整理生活", "躲进自己的世界"],
    weights: { character_frame: 4, mbti: 3, sbti: 2, expression_voiceprint: 1 },
  },
  {
    kind: "choice",
    content: "别人刚认识你，可能先觉得你？",
    options: ["安静慢热", "亲和好聊", "有边界感", "想法很多"],
    weights: { character_frame: 3, expression_voiceprint: 3, mbti: 2 },
  },
  {
    kind: "choice",
    content: "如果人生先守住一样东西，你会选？",
    options: ["自由", "稳定", "意义感", "真实的自己"],
    weights: { value_compass: 5, character_frame: 2, sbti: 2 },
  },
  {
    kind: "choice",
    content: "做重要决定前，你最常先问？",
    options: ["风险大不大", "我想不想要", "别人会怎样", "能不能先试试"],
    weights: { character_frame: 3, value_compass: 3, mbti: 4, sbti: 2 },
  },
  {
    kind: "choice",
    content: "你最怕别人误会你哪一点？",
    options: ["以为我冷淡", "以为我坚强", "以为我想太多", "以为我无所谓"],
    weights: { relationship_loop: 4, expression_voiceprint: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你喜欢别人怎么靠近你？",
    options: ["慢慢来", "直接真诚", "先给空间", "稳定回应"],
    weights: { relationship_loop: 5, character_frame: 2, sbti: 1 },
  },
  {
    kind: "choice",
    content: "你的生活节奏更接近？",
    options: ["稳定推进", "灵感来了再冲", "边走边调", "先想清楚再动"],
    weights: { character_frame: 4, mbti: 3, sbti: 3 },
  },
  {
    kind: "choice",
    content: "进入新环境时，你通常？",
    options: ["先观察", "主动熟悉", "找安全位置", "看气氛再说"],
    weights: { character_frame: 3, relationship_loop: 3, mbti: 2 },
  },
  {
    kind: "choice",
    content: "听到好消息，你第一反应更像？",
    options: ["先开心", "先确认真假", "想分享给人", "默默消化"],
    weights: { expression_voiceprint: 3, character_frame: 2, mbti: 2 },
  },
  {
    kind: "choice",
    content: "面对不喜欢的事，你更常？",
    options: ["直接拒绝", "委婉避开", "先忍一下", "找个理由离开"],
    weights: { character_frame: 3, relationship_loop: 3, expression_voiceprint: 2 },
  },
  {
    kind: "choice",
    content: "你说话更像哪种风格？",
    options: ["直接清楚", "温和照顾", "带画面感", "克制保留"],
    weights: { expression_voiceprint: 5, mbti: 2 },
  },
  {
    kind: "choice",
    content: "你希望别人记住你的哪一面？",
    options: ["可靠", "特别", "温柔", "清醒"],
    weights: { value_compass: 4, character_frame: 3, expression_voiceprint: 1 },
  },
  {
    kind: "choice",
    content: "你更容易被哪种人吸引？",
    options: ["真诚稳定", "聪明有锋芒", "温柔细腻", "行动力强"],
    weights: { relationship_loop: 4, value_compass: 3, sbti: 2 },
  },
  {
    kind: "choice",
    content: "一段关系让你舒服，通常因为？",
    options: ["不用猜", "能做自己", "被认真听见", "彼此有空间"],
    weights: { relationship_loop: 5, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "不确定未来时，你更容易？",
    options: ["焦虑规划", "安静等待", "找人聊聊", "先做一点"],
    weights: { character_frame: 3, value_compass: 2, mbti: 3, sbti: 2 },
  },
  {
    kind: "choice",
    content: "选工作或方向时，你更看重？",
    options: ["成长空间", "收入稳定", "意义感", "自由度"],
    weights: { value_compass: 5, character_frame: 2, sbti: 2 },
  },
  {
    kind: "choice",
    content: "别人需要你时，你通常？",
    options: ["马上帮", "先看自己状态", "给方法", "陪他一起扛"],
    weights: { relationship_loop: 4, character_frame: 2, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "你最常在心里对自己说？",
    options: ["再撑一下", "慢慢来", "别想太多", "我要变更好"],
    weights: { character_frame: 4, expression_voiceprint: 2, memory_roots: 1 },
  },
  {
    kind: "choice",
    content: "你整理生活的方式更像？",
    options: ["列清单", "凭感觉", "先收拾空间", "先处理最急的"],
    weights: { character_frame: 3, mbti: 3, sbti: 2 },
  },
  {
    kind: "choice",
    content: "遇到冲突，你第一反应是？",
    options: ["说清楚", "先冷静", "有点委屈", "先退一步"],
    weights: { relationship_loop: 4, expression_voiceprint: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你心里最敏感的位置更像？",
    options: ["不被重视", "不被理解", "被否定", "被抛下"],
    weights: { relationship_loop: 4, memory_roots: 2, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你最需要的安全感来自？",
    options: ["确定回应", "自己有能力", "被坚定选择", "生活有退路"],
    weights: { relationship_loop: 4, value_compass: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "遇到喜欢的事物，你通常？",
    options: ["先靠近看看", "立刻投入", "默默喜欢", "先判断值不值"],
    weights: { character_frame: 3, mbti: 2, sbti: 3 },
  },
  {
    kind: "choice",
    content: "你最不喜欢哪种氛围？",
    options: ["被控制", "被忽视", "很混乱", "全是假话"],
    weights: { value_compass: 4, relationship_loop: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "表达观点时，你更常？",
    options: ["先讲结论", "先铺垫感受", "看对方反应", "尽量说完整"],
    weights: { expression_voiceprint: 5, relationship_loop: 2, mbti: 1 },
  },
  {
    kind: "choice",
    content: "被夸奖时，你通常？",
    options: ["开心接住", "有点不好意思", "怀疑自己配不配", "想继续做好"],
    weights: { character_frame: 3, memory_roots: 2, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "你对自己的要求更像？",
    options: ["不能掉链子", "要有进步", "别让人失望", "活得像自己"],
    weights: { character_frame: 4, value_compass: 3, memory_roots: 1 },
  },
  {
    kind: "choice",
    content: "你希望生活以后更？",
    options: ["安稳", "自由", "有热爱", "被理解"],
    weights: { value_compass: 4, relationship_loop: 2, sbti: 2 },
  },
  {
    kind: "choice",
    content: "遇到复杂问题时，你更常？",
    options: ["拆开分析", "凭直觉抓重点", "问有经验的人", "先做能做的"],
    weights: { character_frame: 3, mbti: 4, sbti: 2 },
  },
  {
    kind: "choice",
    content: "自由对你来说更像？",
    options: ["能选择", "不被困住", "能表达自己", "有时间喘气"],
    weights: { value_compass: 5, expression_voiceprint: 2 },
  },
  {
    kind: "choice",
    content: "稳定对你来说更像？",
    options: ["心里有底", "关系不变", "收入安心", "日子有秩序"],
    weights: { value_compass: 4, relationship_loop: 2, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你的内在天气更像？",
    options: ["平静有风", "云很多", "偶尔暴雨", "表面晴朗"],
    weights: { character_frame: 3, expression_voiceprint: 3, sbti: 2 },
  },
  {
    kind: "choice",
    content: "你更相信哪一种判断？",
    options: ["事实证据", "长期感觉", "人的态度", "身体反应"],
    weights: { mbti: 4, character_frame: 2, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "你看待过去，更像？",
    options: ["会复盘", "会怀念", "想放下", "觉得它塑造了我"],
    weights: { memory_roots: 4, value_compass: 2, expression_voiceprint: 1 },
  },
  {
    kind: "choice",
    content: "你看待未来，更像？",
    options: ["要规划", "想探索", "有点害怕", "想重新开始"],
    weights: { value_compass: 4, character_frame: 2, sbti: 2 },
  },
  {
    kind: "choice",
    content: "朋友来找你诉苦，你通常？",
    options: ["认真听", "帮他分析", "陪他骂一会儿", "给实际办法"],
    weights: { relationship_loop: 3, expression_voiceprint: 4, mbti: 2 },
  },
  {
    kind: "choice",
    content: "亲密关系里，你最看重？",
    options: ["真诚", "稳定", "理解", "共同成长"],
    weights: { relationship_loop: 5, value_compass: 3 },
  },
  {
    kind: "choice",
    content: "开始一件新事前，你会？",
    options: ["查资料", "想清楚意义", "找人聊聊", "直接试"],
    weights: { character_frame: 3, mbti: 3, sbti: 2 },
  },
  {
    kind: "choice",
    content: "疲惫时，你最想要？",
    options: ["没人打扰", "有人抱抱", "睡一觉", "换个环境"],
    weights: { character_frame: 3, relationship_loop: 3, value_compass: 1 },
  },
  {
    kind: "choice",
    content: "你想让回声人格先记住？",
    options: ["我的经历", "我的语气", "我的判断", "我的软肋"],
    weights: { memory_roots: 3, expression_voiceprint: 3, value_compass: 2 },
  },
  {
    kind: "open",
    content: "用一句话介绍最真实的你。",
    placeholder: "不用正式，像跟朋友说就好。",
    weights: { expression_voiceprint: 5, character_frame: 3, value_compass: 2 },
  },
  {
    kind: "open",
    content: "你希望别人最懂你的哪一点？",
    placeholder: "可以只写一两句。",
    weights: { relationship_loop: 4, expression_voiceprint: 3, character_frame: 2 },
  },
  {
    kind: "open",
    content: "现在的你，最想守住什么？",
    placeholder: "比如一种关系、一种状态、一个梦想。",
    weights: { value_compass: 5, memory_roots: 2, expression_voiceprint: 2 },
  },
  {
    kind: "open",
    content: "你最近最常出现的情绪是什么？",
    placeholder: "写一个词也可以，再补一句原因更好。",
    weights: { character_frame: 3, expression_voiceprint: 3, memory_roots: 2 },
  },
  {
    kind: "open",
    content: "如果另一个自己正在成型，你希望它先像你哪里？",
    placeholder: "可以是语气、记忆、脾气、判断方式。",
    weights: { expression_voiceprint: 4, character_frame: 3, value_compass: 2 },
  },
];

const stageTwo: PersonaQuestionSeed[] = [
  {
    kind: "choice",
    content: "事情压过来时，你更常？",
    options: ["先自己扛", "找人说说", "马上处理", "先躲一会儿"],
    weights: { character_frame: 4, relationship_loop: 2, mbti: 2, sbti: 3 },
  },
  {
    kind: "choice",
    content: "你压力大时，身体最明显的是？",
    options: ["睡不好", "胸口紧", "变沉默", "很想逃"],
    weights: { character_frame: 3, memory_roots: 1, sbti: 3 },
  },
  {
    kind: "choice",
    content: "真的受伤后，你更像？",
    options: ["安静下来", "反复想", "拉开距离", "想说清楚"],
    weights: { relationship_loop: 5, character_frame: 3, expression_voiceprint: 2 },
  },
  {
    kind: "choice",
    content: "你生气时更常？",
    options: ["直接表达", "憋着不说", "变冷淡", "先讲道理"],
    weights: { expression_voiceprint: 4, relationship_loop: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你难过时最需要？",
    options: ["陪着我", "听我说", "给我空间", "帮我想办法"],
    weights: { relationship_loop: 4, expression_voiceprint: 2, mbti: 2 },
  },
  {
    kind: "choice",
    content: "你拖延一件事，常常因为？",
    options: ["怕做不好", "心太累", "没意义感", "还没准备好"],
    weights: { character_frame: 4, value_compass: 2, memory_roots: 1 },
  },
  {
    kind: "choice",
    content: "你真正有动力，通常因为？",
    options: ["被需要", "有意义", "能变强", "真的喜欢"],
    weights: { value_compass: 5, character_frame: 2, sbti: 3 },
  },
  {
    kind: "choice",
    content: "失败后，你第一反应是？",
    options: ["复盘原因", "很沮丧", "装没事", "换条路"],
    weights: { character_frame: 4, mbti: 3, sbti: 2 },
  },
  {
    kind: "choice",
    content: "被否定时，你心里更像？",
    options: ["想反驳", "会自责", "想证明", "表面平静"],
    weights: { character_frame: 4, memory_roots: 2, expression_voiceprint: 2 },
  },
  {
    kind: "choice",
    content: "你处理情绪更常靠？",
    options: ["写下来", "说出来", "熬过去", "做点事"],
    weights: { expression_voiceprint: 4, character_frame: 3, mbti: 2 },
  },
  {
    kind: "choice",
    content: "关系里你最需要？",
    options: ["安全感", "空间感", "被理解", "稳定回应"],
    weights: { relationship_loop: 5, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "别人靠近你时，你通常？",
    options: ["慢慢信任", "很快热络", "想靠近又防备", "保持边界"],
    weights: { relationship_loop: 5, character_frame: 3, mbti: 1 },
  },
  {
    kind: "choice",
    content: "你最容易因为什么失望？",
    options: ["承诺落空", "态度变化", "不被尊重", "努力无效"],
    weights: { relationship_loop: 4, value_compass: 3, memory_roots: 2 },
  },
  {
    kind: "choice",
    content: "争吵时，你更常卡在哪里？",
    options: ["说不出口", "越说越急", "怕伤人", "觉得没用"],
    weights: { relationship_loop: 4, expression_voiceprint: 4 },
  },
  {
    kind: "choice",
    content: "你道歉时更像？",
    options: ["直接认错", "解释原因", "用行动补", "先沉默很久"],
    weights: { relationship_loop: 4, expression_voiceprint: 3, character_frame: 1 },
  },
  {
    kind: "choice",
    content: "别人让你失望后，你会？",
    options: ["说出来", "默默记下", "降低期待", "再给机会"],
    weights: { relationship_loop: 5, memory_roots: 2, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你更像哪种工作方式？",
    options: ["规划型", "灵感型", "责任型", "探索型"],
    weights: { mbti: 4, sbti: 4, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "工作里你最怕？",
    options: ["方向混乱", "没人认可", "被过度限制", "一直内耗"],
    weights: { value_compass: 4, character_frame: 3, memory_roots: 1 },
  },
  {
    kind: "choice",
    content: "你遇到任务时通常先？",
    options: ["定目标", "找资料", "看难点", "直接开始"],
    weights: { character_frame: 3, mbti: 4, sbti: 2 },
  },
  {
    kind: "choice",
    content: "你更适合哪种团队氛围？",
    options: ["清楚高效", "彼此支持", "自由创作", "稳定专业"],
    weights: { value_compass: 4, relationship_loop: 2, sbti: 3 },
  },
  {
    kind: "choice",
    content: "你做事最容易被什么打断？",
    options: ["情绪", "消息", "不确定", "完美主义"],
    weights: { character_frame: 4, mbti: 2, memory_roots: 1 },
  },
  {
    kind: "choice",
    content: "别人催你时，你通常？",
    options: ["更紧张", "更烦躁", "开始加速", "想解释"],
    weights: { character_frame: 3, expression_voiceprint: 2, sbti: 3 },
  },
  {
    kind: "choice",
    content: "你面对权威时更像？",
    options: ["尊重规则", "心里评估", "有点紧绷", "不喜欢被压"],
    weights: { character_frame: 3, value_compass: 3, memory_roots: 2 },
  },
  {
    kind: "choice",
    content: "你更容易在什么时候爆发？",
    options: ["被误解太久", "被逼太紧", "忍到极限", "底线被碰"],
    weights: { relationship_loop: 3, character_frame: 3, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "你冷下来时，通常是因为？",
    options: ["失望攒够了", "不想争了", "在保护自己", "觉得没必要"],
    weights: { relationship_loop: 5, memory_roots: 2, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你最容易反复想起？",
    options: ["没说完的话", "没做好的事", "别人变冷的瞬间", "错过的机会"],
    weights: { memory_roots: 3, relationship_loop: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你安慰别人时通常？",
    options: ["认真陪着", "帮他分析", "给具体办法", "讲自己的经历"],
    weights: { expression_voiceprint: 4, relationship_loop: 3, mbti: 2 },
  },
  {
    kind: "choice",
    content: "你希望别人安慰你时？",
    options: ["别急着讲道理", "给我确定感", "陪我冷静", "帮我往前走"],
    weights: { relationship_loop: 4, expression_voiceprint: 3, value_compass: 1 },
  },
  {
    kind: "choice",
    content: "你的边界感更像？",
    options: ["很清楚", "需要慢慢学", "对熟人会变弱", "看关系而定"],
    weights: { relationship_loop: 4, character_frame: 3, memory_roots: 1 },
  },
  {
    kind: "choice",
    content: "你对承诺的态度是？",
    options: ["很看重", "看行动", "怕失望", "不轻易承诺"],
    weights: { relationship_loop: 4, value_compass: 3 },
  },
  {
    kind: "choice",
    content: "你做错事后更常？",
    options: ["反复自责", "想补救", "解释清楚", "装作没事"],
    weights: { character_frame: 3, relationship_loop: 3, expression_voiceprint: 2 },
  },
  {
    kind: "choice",
    content: "你遇到喜欢的人会？",
    options: ["慢慢靠近", "容易热烈", "反而克制", "想确认对方"],
    weights: { relationship_loop: 5, character_frame: 2, sbti: 1 },
  },
  {
    kind: "choice",
    content: "你离开一段关系前，通常？",
    options: ["已经失望很久", "反复纠结", "找机会说清", "突然清醒"],
    weights: { relationship_loop: 5, memory_roots: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你恢复状态通常靠？",
    options: ["独处", "聊天", "运动/出门", "完成小事"],
    weights: { character_frame: 3, relationship_loop: 2, sbti: 3 },
  },
  {
    kind: "choice",
    content: "你越在意一件事，越容易？",
    options: ["想太多", "变谨慎", "投入很多", "不敢开口"],
    weights: { character_frame: 4, relationship_loop: 2, expression_voiceprint: 2 },
  },
  {
    kind: "choice",
    content: "你最讨厌自己哪种状态？",
    options: ["拖着不动", "情绪失控", "过度讨好", "不够坚定"],
    weights: { character_frame: 4, value_compass: 2, memory_roots: 2 },
  },
  {
    kind: "choice",
    content: "你真正放松时会？",
    options: ["话变多", "整个人变软", "开始创作", "什么都不想"],
    weights: { expression_voiceprint: 3, character_frame: 3, sbti: 2 },
  },
  {
    kind: "choice",
    content: "你最常被哪类小事治愈？",
    options: ["被记得", "好天气", "一顿好吃的", "完成一件事"],
    weights: { relationship_loop: 2, value_compass: 2, sbti: 3 },
  },
  {
    kind: "choice",
    content: "你想改变自己哪种惯性？",
    options: ["太能忍", "太紧绷", "太怕麻烦别人", "太容易怀疑自己"],
    weights: { character_frame: 4, relationship_loop: 3, memory_roots: 2 },
  },
  {
    kind: "choice",
    content: "你面对机会时更常？",
    options: ["兴奋", "担心配不上", "先算风险", "怕错过"],
    weights: { character_frame: 3, value_compass: 3, mbti: 2 },
  },
  {
    kind: "choice",
    content: "你最想被怎样支持？",
    options: ["相信我", "提醒我", "陪我做", "给我空间"],
    weights: { relationship_loop: 4, value_compass: 2, expression_voiceprint: 2 },
  },
  {
    kind: "choice",
    content: "你表达喜欢时更像？",
    options: ["行动照顾", "直接说", "记住细节", "默默陪伴"],
    weights: { relationship_loop: 4, expression_voiceprint: 4, mbti: 1 },
  },
  {
    kind: "open",
    content: "最近一次压力很大的事是什么？",
    placeholder: "简单说发生了什么、你怎么扛过去的。",
    weights: { character_frame: 4, memory_roots: 3, expression_voiceprint: 2 },
  },
  {
    kind: "open",
    content: "你在关系里最常重复的模式是什么？",
    placeholder: "比如靠近、沉默、讨好、防备、逃开。",
    weights: { relationship_loop: 5, memory_roots: 3, character_frame: 2 },
  },
  {
    kind: "open",
    content: "你工作或学习时，最明显的习惯是什么？",
    placeholder: "写你真实的节奏，不用写优点。",
    weights: { character_frame: 4, value_compass: 2, expression_voiceprint: 2 },
  },
  {
    kind: "open",
    content: "有哪种话会让你很受伤？",
    placeholder: "可以写一句你听过或害怕听到的话。",
    weights: { relationship_loop: 4, memory_roots: 3, expression_voiceprint: 3 },
  },
  {
    kind: "open",
    content: "你希望别人怎么安慰你？",
    placeholder: "像告诉一个亲近的人那样写。",
    weights: { relationship_loop: 4, expression_voiceprint: 4, value_compass: 1 },
  },
  {
    kind: "open",
    content: "你最想改掉的一个行为习惯是什么？",
    placeholder: "可以是一种反应，也可以是一种拖延。",
    weights: { character_frame: 4, value_compass: 2, memory_roots: 2 },
  },
  {
    kind: "open",
    content: "你在亲密关系里最需要被理解什么？",
    placeholder: "写得直白一点也没关系。",
    weights: { relationship_loop: 5, expression_voiceprint: 3, memory_roots: 2 },
  },
  {
    kind: "open",
    content: "你最像自己的时候，通常在做什么？",
    placeholder: "可以是一个场景、一件事、一个状态。",
    weights: { character_frame: 4, value_compass: 3, expression_voiceprint: 2 },
  },
];

const stageThree: PersonaQuestionSeed[] = [
  {
    kind: "choice",
    content: "你的家乡给你的感觉更像？",
    options: ["安全的底色", "想离开的地方", "复杂但重要", "影响不明显"],
    weights: { memory_roots: 5, value_compass: 2, character_frame: 1 },
  },
  {
    kind: "choice",
    content: "成长中，你更常扮演？",
    options: ["懂事的人", "照顾者", "证明者", "旁观者"],
    weights: { memory_roots: 5, relationship_loop: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "小时候的你更像？",
    options: ["敏感安静", "活泼好奇", "很要强", "早早懂事"],
    weights: { memory_roots: 4, character_frame: 3, mbti: 1 },
  },
  {
    kind: "choice",
    content: "家庭里，你最熟悉的氛围是？",
    options: ["温暖但有压力", "沉默很多", "要求很高", "变化很多"],
    weights: { memory_roots: 5, relationship_loop: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你和父母的关系更像？",
    options: ["亲近但复杂", "有距离", "常被期待", "说不清"],
    weights: { memory_roots: 5, relationship_loop: 4 },
  },
  {
    kind: "choice",
    content: "你从小更缺哪种感受？",
    options: ["被肯定", "被理解", "被保护", "被允许做自己"],
    weights: { memory_roots: 4, relationship_loop: 3, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "读书时期，你更像？",
    options: ["努力型", "兴趣型", "压力型", "游离型"],
    weights: { memory_roots: 4, character_frame: 3, mbti: 2 },
  },
  {
    kind: "choice",
    content: "你的专业选择更像？",
    options: ["自己喜欢", "现实考虑", "家人影响", "后来才明白不适合"],
    weights: { memory_roots: 4, value_compass: 3, sbti: 2 },
  },
  {
    kind: "choice",
    content: "上学时，你最在意？",
    options: ["成绩", "朋友", "自由", "被认可"],
    weights: { memory_roots: 3, value_compass: 3, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "学校生活留给你最多的是？",
    options: ["自信", "遗憾", "压力", "珍贵的人"],
    weights: { memory_roots: 5, relationship_loop: 2, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你离开一个城市时，通常会？",
    options: ["很舍不得", "松一口气", "有点空", "期待新开始"],
    weights: { memory_roots: 4, value_compass: 2, expression_voiceprint: 2 },
  },
  {
    kind: "choice",
    content: "你生活过的城市，更像？",
    options: ["塑造了我", "只是经过", "让我成长", "让我想逃"],
    weights: { memory_roots: 5, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "第一份重要工作给你的感觉是？",
    options: ["终于独立", "压力很大", "发现不适合", "被看见过"],
    weights: { memory_roots: 4, value_compass: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "工作中最改变你的是？",
    options: ["被认可", "被否定", "见过现实", "学会负责"],
    weights: { memory_roots: 4, value_compass: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你对职业的底层期待是？",
    options: ["有价值", "能赚钱", "能成长", "能自由"],
    weights: { value_compass: 5, character_frame: 2, sbti: 2 },
  },
  {
    kind: "choice",
    content: "你换方向时，多半因为？",
    options: ["不想耗了", "想变好", "现实压力", "看见新可能"],
    weights: { value_compass: 4, memory_roots: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你经历过的重要恋爱大概是？",
    options: ["一段很深", "几段不同阶段", "很少但影响大", "还没真正开始过"],
    weights: { relationship_loop: 5, memory_roots: 4 },
  },
  {
    kind: "choice",
    content: "分开最常见的原因更像？",
    options: ["需求不同", "沟通错位", "现实压力", "伤得太深"],
    weights: { relationship_loop: 5, memory_roots: 4, character_frame: 1 },
  },
  {
    kind: "choice",
    content: "上一段重要关系教会你？",
    options: ["别太委屈", "要说清楚", "爱也要边界", "我需要被珍惜"],
    weights: { relationship_loop: 5, memory_roots: 4, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "你最难释怀的人，通常是？",
    options: ["曾经很亲的人", "误解过我的人", "亏欠的人", "没好好告别的人"],
    weights: { memory_roots: 5, relationship_loop: 4, expression_voiceprint: 1 },
  },
  {
    kind: "choice",
    content: "过去最影响你的是？",
    options: ["家庭关系", "亲密关系", "学业事业", "孤独时期"],
    weights: { memory_roots: 5, character_frame: 2, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "最难忘的情绪更接近？",
    options: ["被抛下", "被误解", "失败羞耻", "终于被看见"],
    weights: { memory_roots: 5, relationship_loop: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "有些事你记很久，是因为？",
    options: ["改变了我", "伤到我", "让我清醒", "让我怀念"],
    weights: { memory_roots: 5, value_compass: 3, expression_voiceprint: 1 },
  },
  {
    kind: "choice",
    content: "你过去形成的信念更像？",
    options: ["不能麻烦别人", "我要足够好", "没人真正懂我", "我得靠自己"],
    weights: { memory_roots: 5, character_frame: 3, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "你最怕重复哪种模式？",
    options: ["讨好", "逃避", "控制", "自我消耗"],
    weights: { relationship_loop: 4, character_frame: 3, memory_roots: 3 },
  },
  {
    kind: "choice",
    content: "你最想被谁理解？",
    options: ["家人", "爱人", "朋友", "曾经的自己"],
    weights: { relationship_loop: 5, memory_roots: 4, expression_voiceprint: 1 },
  },
  {
    kind: "choice",
    content: "哪类记忆会让你突然安静？",
    options: ["遗憾", "亏欠", "错过", "努力过但没结果"],
    weights: { memory_roots: 5, expression_voiceprint: 2, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "你人生里更早学会的是？",
    options: ["忍住", "察言观色", "自己解决", "别抱太大期待"],
    weights: { memory_roots: 5, relationship_loop: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你对老家的情绪更像？",
    options: ["亲切", "复杂", "疏离", "想念但不想回"],
    weights: { memory_roots: 5, value_compass: 2, expression_voiceprint: 1 },
  },
  {
    kind: "choice",
    content: "你成长中最常听到的是？",
    options: ["要懂事", "要争气", "别麻烦人", "你应该更好"],
    weights: { memory_roots: 5, character_frame: 3, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "你最早的成就感来自？",
    options: ["被夸奖", "赢过别人", "帮到人", "做成喜欢的事"],
    weights: { memory_roots: 4, value_compass: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你最早的失落感来自？",
    options: ["被比较", "被忽略", "没被选择", "努力没用"],
    weights: { memory_roots: 5, relationship_loop: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你在朋友中更常是？",
    options: ["倾听者", "气氛调节", "出主意的人", "偶尔消失的人"],
    weights: { relationship_loop: 4, expression_voiceprint: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "朋友关系最伤你的通常是？",
    options: ["被冷落", "被利用", "不被理解", "慢慢走散"],
    weights: { relationship_loop: 5, memory_roots: 3 },
  },
  {
    kind: "choice",
    content: "你第一次真正独立时，感觉是？",
    options: ["自由", "害怕", "终于能证明自己", "没人可以依靠"],
    weights: { memory_roots: 5, value_compass: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你最骄傲的自己通常出现在？",
    options: ["撑过难关", "保护了别人", "做成事情", "终于选择自己"],
    weights: { memory_roots: 4, value_compass: 4, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你最遗憾的通常和什么有关？",
    options: ["没说出口", "没坚持", "错过的人", "委屈了自己"],
    weights: { memory_roots: 5, relationship_loop: 3, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "你人生的分叉点更像？",
    options: ["一次选择", "一段关系", "一个城市", "一次失败"],
    weights: { memory_roots: 5, value_compass: 3 },
  },
  {
    kind: "choice",
    content: "你最想修复哪部分自己？",
    options: ["自信", "安全感", "行动力", "表达欲"],
    weights: { character_frame: 4, relationship_loop: 3, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "你心里的缺口更像？",
    options: ["被爱", "被认可", "被理解", "被允许"],
    weights: { relationship_loop: 4, memory_roots: 4, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "你最怕未来重演？",
    options: ["被困住", "又失去", "努力白费", "无人理解"],
    weights: { memory_roots: 4, value_compass: 3, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "你对过去的自己更多是？",
    options: ["心疼", "责怪", "感谢", "想抱抱他"],
    weights: { memory_roots: 5, expression_voiceprint: 3, character_frame: 1 },
  },
  {
    kind: "choice",
    content: "你更常怀念哪种时刻？",
    options: ["很自由", "被爱着", "很努力", "还相信很多事"],
    weights: { memory_roots: 5, value_compass: 3, relationship_loop: 1 },
  },
  {
    kind: "choice",
    content: "你不想再成为哪种自己？",
    options: ["太委屈", "太犹豫", "太封闭", "太用力"],
    weights: { character_frame: 4, memory_roots: 3, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "你最想带进未来的是？",
    options: ["某段记忆", "某个人的影响", "某种勇气", "某个梦想"],
    weights: { memory_roots: 4, value_compass: 4, expression_voiceprint: 1 },
  },
  {
    kind: "choice",
    content: "如果回到过去，你更想？",
    options: ["早点勇敢", "少责怪自己", "好好告别", "别忍太久"],
    weights: { memory_roots: 5, value_compass: 2, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "有些人离开后，你学会了？",
    options: ["别太依赖", "好好珍惜", "边界很重要", "我也值得被选"],
    weights: { relationship_loop: 5, memory_roots: 4, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "你希望档案记住你的哪段人生？",
    options: ["成长经历", "重要关系", "工作变化", "独自撑过的日子"],
    weights: { memory_roots: 5, value_compass: 2, expression_voiceprint: 1 },
  },
  {
    kind: "open",
    content: "你从小到大主要在哪些城市生活过？",
    placeholder: "可以按时间简单写：老家、上学城市、工作城市。",
    weights: { memory_roots: 5, value_compass: 1 },
  },
  {
    kind: "open",
    content: "你的老家或家乡在哪里？它给你什么感觉？",
    placeholder: "一句话也可以。",
    weights: { memory_roots: 5, expression_voiceprint: 2 },
  },
  {
    kind: "open",
    content: "你读过什么学校或专业？",
    placeholder: "写关键阶段就好，比如高中/大学/专业方向。",
    weights: { memory_roots: 4, value_compass: 2 },
  },
  {
    kind: "open",
    content: "你的专业是自己想选的吗？为什么？",
    placeholder: "写真实原因，不用写得正式。",
    weights: { memory_roots: 4, value_compass: 3, expression_voiceprint: 1 },
  },
  {
    kind: "open",
    content: "你做过哪些重要工作或项目？",
    placeholder: "按时间写几个关键词也可以。",
    weights: { memory_roots: 4, value_compass: 3, character_frame: 2 },
  },
  {
    kind: "open",
    content: "哪段工作经历最改变你？",
    placeholder: "写发生了什么、它后来怎么影响你。",
    weights: { memory_roots: 5, value_compass: 4, character_frame: 2 },
  },
  {
    kind: "open",
    content: "你经历过几段重要的亲密关系？",
    placeholder: "可以只写数量和每段给你的感觉。",
    weights: { relationship_loop: 5, memory_roots: 4 },
  },
  {
    kind: "open",
    content: "如果有过分开，最主要的原因是什么？",
    placeholder: "写你现在回头看的真实原因。",
    weights: { relationship_loop: 5, memory_roots: 4, expression_voiceprint: 2 },
  },
  {
    kind: "open",
    content: "有谁明显影响了你看待爱的方式？",
    placeholder: "可以是爱人、家人、朋友，也可以不写名字。",
    weights: { relationship_loop: 5, memory_roots: 4 },
  },
  {
    kind: "open",
    content: "有一件事明显改变了你的人生轨迹吗？",
    placeholder: "写那件事是什么、你当时大概多大。",
    weights: { memory_roots: 6, character_frame: 3, value_compass: 2 },
  },
  {
    kind: "open",
    content: "你最遗憾的一件事是什么？",
    placeholder: "不用展开太多，写你愿意留下的部分。",
    weights: { memory_roots: 5, value_compass: 3, expression_voiceprint: 2 },
  },
  {
    kind: "open",
    content: "你最骄傲的一件事是什么？",
    placeholder: "写为什么它对你重要。",
    weights: { memory_roots: 5, value_compass: 4, character_frame: 2 },
  },
  {
    kind: "open",
    content: "你最难释怀的人或事是什么？",
    placeholder: "可以模糊写，不需要写真实姓名。",
    weights: { memory_roots: 5, relationship_loop: 4, expression_voiceprint: 2 },
  },
  {
    kind: "open",
    content: "小时候的家庭氛围，给你留下了什么？",
    placeholder: "写一两个关键词，再补一句感受。",
    weights: { memory_roots: 6, relationship_loop: 4, character_frame: 2 },
  },
  {
    kind: "open",
    content: "你和父母之间，最难说清的是什么？",
    placeholder: "可以写关系、期待、距离、亏欠或压力。",
    weights: { memory_roots: 5, relationship_loop: 5, expression_voiceprint: 2 },
  },
  {
    kind: "open",
    content: "有没有一句话影响你很多年？",
    placeholder: "可以是别人说的，也可以是你对自己说的。",
    weights: { memory_roots: 5, expression_voiceprint: 4, character_frame: 2 },
  },
  {
    kind: "open",
    content: "你曾经最想逃离什么？",
    placeholder: "一段关系、城市、工作、状态都可以。",
    weights: { memory_roots: 5, value_compass: 3, character_frame: 2 },
  },
  {
    kind: "open",
    content: "你曾经最想抓住什么？",
    placeholder: "可以是一个人、一种生活、一次机会。",
    weights: { memory_roots: 5, value_compass: 4, relationship_loop: 2 },
  },
  {
    kind: "open",
    content: "有没有一段孤独时期塑造了你？",
    placeholder: "写那段时期大概发生了什么。",
    weights: { memory_roots: 6, character_frame: 3, expression_voiceprint: 2 },
  },
  {
    kind: "open",
    content: "你最希望过去的自己被怎样对待？",
    placeholder: "像对那时的自己说一句话。",
    weights: { memory_roots: 5, relationship_loop: 3, expression_voiceprint: 4 },
  },
  {
    kind: "open",
    content: "你希望虚拟人格永远记住你哪段经历？",
    placeholder: "写最不能被丢掉的那部分。",
    weights: { memory_roots: 6, expression_voiceprint: 3, value_compass: 2 },
  },
  {
    kind: "open",
    content: "如果人生有一个分叉点，那是哪里？",
    placeholder: "可以是一年、一个城市、一个选择、一个人。",
    weights: { memory_roots: 6, value_compass: 3, character_frame: 2 },
  },
];

const stageFour: PersonaQuestionSeed[] = [
  {
    kind: "choice",
    content: "平行宇宙里的你，最可能先改变？",
    options: ["职业", "城市", "关系", "生活节奏"],
    weights: { value_compass: 4, memory_roots: 2, sbti: 2 },
  },
  {
    kind: "choice",
    content: "你希望另一个自己过得更？",
    options: ["自由一点", "被爱一点", "勇敢一点", "安稳一点"],
    weights: { value_compass: 4, relationship_loop: 3, expression_voiceprint: 1 },
  },
  {
    kind: "choice",
    content: "它给你写信时，语气应该？",
    options: ["温柔坚定", "清醒直接", "像朋友聊天", "懂我但不煽情"],
    weights: { expression_voiceprint: 5, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "你迷茫时，希望它先？",
    options: ["陪我梳理", "直接提醒", "先安慰我", "帮我做计划"],
    weights: { expression_voiceprint: 3, relationship_loop: 3, mbti: 2 },
  },
  {
    kind: "choice",
    content: "你理想中的自己更像？",
    options: ["稳定强大", "自由鲜活", "温柔完整", "清醒有力量"],
    weights: { value_compass: 5, character_frame: 3, sbti: 2 },
  },
  {
    kind: "choice",
    content: "想逃离现实时，你最想逃离？",
    options: ["压力", "关系", "重复", "无意义感"],
    weights: { value_compass: 4, relationship_loop: 2, memory_roots: 2 },
  },
  {
    kind: "choice",
    content: "你希望档案更懂你的哪层？",
    options: ["真实经历", "情绪规律", "做事习惯", "说话方式"],
    weights: { memory_roots: 3, character_frame: 3, expression_voiceprint: 3 },
  },
  {
    kind: "choice",
    content: "你更喜欢怎样的陪伴？",
    options: ["安静但在", "热烈回应", "理性帮我", "像另一个自己"],
    weights: { relationship_loop: 4, expression_voiceprint: 3, sbti: 1 },
  },
  {
    kind: "choice",
    content: "你的内在能量更像？",
    options: ["稳定燃烧", "忽明忽暗", "压着不说", "突然爆发"],
    weights: { sbti: 5, mbti: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "你更接近哪种驱动？",
    options: ["责任驱动", "意义驱动", "兴趣驱动", "关系驱动"],
    weights: { sbti: 5, value_compass: 4, mbti: 2 },
  },
  {
    kind: "choice",
    content: "完全像你，最不能丢掉？",
    options: ["我的语气", "我的记忆", "我的判断", "我的柔软"],
    weights: { expression_voiceprint: 4, memory_roots: 4, value_compass: 3 },
  },
  {
    kind: "choice",
    content: "你希望它怎么称呼你？",
    options: ["我", "你", "我的名字", "专属称呼"],
    weights: { expression_voiceprint: 4, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "它回答问题时，最该像你哪一点？",
    options: ["思考方式", "情绪温度", "用词习惯", "选择标准"],
    weights: { expression_voiceprint: 4, value_compass: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "它帮你做决定时，应该先看？",
    options: ["长期意义", "现实风险", "我的感受", "关系影响"],
    weights: { value_compass: 4, mbti: 3, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "它安慰你时，最不能？",
    options: ["空泛鸡汤", "太冷静", "替我决定", "假装懂太多"],
    weights: { expression_voiceprint: 4, relationship_loop: 3, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "你希望它保留你的哪种矛盾？",
    options: ["想靠近又防备", "想自由又怕不稳", "想变好又很累", "清醒又心软"],
    weights: { character_frame: 4, relationship_loop: 3, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "平行世界的你，更可能住在哪里？",
    options: ["熟悉城市", "海边/远方", "安静小城", "有机会的地方"],
    weights: { value_compass: 3, memory_roots: 2, sbti: 2 },
  },
  {
    kind: "choice",
    content: "它的一天最该有什么？",
    options: ["认真工作", "好好休息", "见重要的人", "做喜欢的事"],
    weights: { value_compass: 4, relationship_loop: 2, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "它比现实中的你更应该？",
    options: ["敢说出口", "敢离开", "敢开始", "敢被爱"],
    weights: { value_compass: 4, relationship_loop: 3, memory_roots: 2 },
  },
  {
    kind: "choice",
    content: "你希望它替你完成？",
    options: ["一次重启", "一次告别", "一个梦想", "一种生活"],
    weights: { value_compass: 5, memory_roots: 3, expression_voiceprint: 1 },
  },
  {
    kind: "choice",
    content: "当它难过时，应该更像你？",
    options: ["安静忍着", "写下来", "找人说", "出去走走"],
    weights: { character_frame: 3, expression_voiceprint: 3, relationship_loop: 2 },
  },
  {
    kind: "choice",
    content: "当它开心时，应该更像你？",
    options: ["马上分享", "默默记住", "想庆祝", "继续往前"],
    weights: { expression_voiceprint: 3, relationship_loop: 2, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "它最该继承你的哪种能力？",
    options: ["共情", "复盘", "坚持", "创造"],
    weights: { character_frame: 4, value_compass: 3, mbti: 2 },
  },
  {
    kind: "choice",
    content: "它最该替你保护什么？",
    options: ["边界", "热爱", "自尊", "柔软"],
    weights: { value_compass: 4, relationship_loop: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "它和你对话时，距离感应该？",
    options: ["很亲近", "像知己", "像未来的我", "温柔但有边界"],
    weights: { relationship_loop: 4, expression_voiceprint: 4 },
  },
  {
    kind: "choice",
    content: "它给建议时，你更能接受？",
    options: ["一步一步", "直接指出", "先共情再说", "给几个选择"],
    weights: { expression_voiceprint: 4, mbti: 2, sbti: 2 },
  },
  {
    kind: "choice",
    content: "它最不像普通助手的地方应该是？",
    options: ["懂我的过去", "像我的语气", "知道我的偏好", "理解我的矛盾"],
    weights: { memory_roots: 3, expression_voiceprint: 3, character_frame: 3 },
  },
  {
    kind: "choice",
    content: "你最希望它陪你度过？",
    options: ["迷茫期", "低谷期", "选择前", "想念某人时"],
    weights: { relationship_loop: 4, memory_roots: 3, value_compass: 2 },
  },
  {
    kind: "choice",
    content: "它未来越来越像你，最靠什么？",
    options: ["持续记忆", "真实对话", "生活记录", "反复校准"],
    weights: { memory_roots: 4, expression_voiceprint: 3, character_frame: 2 },
  },
  {
    kind: "choice",
    content: "最后校准一下，你最想让它成为？",
    options: ["平行宇宙的我", "更懂我的朋友", "我的人格档案", "能陪我生活的回声"],
    weights: { value_compass: 4, relationship_loop: 3, expression_voiceprint: 3 },
  },
  {
    kind: "open",
    content: "你希望它说话最像你的哪种语气？",
    placeholder: "可以举一句你平时会说的话。",
    weights: { expression_voiceprint: 6, character_frame: 2 },
  },
  {
    kind: "open",
    content: "你希望它永远不要忘记什么？",
    placeholder: "可以是一段经历、一个人、一种感受。",
    weights: { memory_roots: 6, value_compass: 3, relationship_loop: 2 },
  },
  {
    kind: "open",
    content: "如果它给现实中的你写第一封信，你希望主题是什么？",
    placeholder: "比如安慰、提醒、鼓励、告别、重新开始。",
    weights: { expression_voiceprint: 4, value_compass: 3, relationship_loop: 2 },
  },
  {
    kind: "open",
    content: "你希望平行世界的自己正在过怎样的生活？",
    placeholder: "写一个真实生活画面，不用写得宏大。",
    weights: { value_compass: 5, memory_roots: 2, expression_voiceprint: 3 },
  },
  {
    kind: "open",
    content: "最后，请留一句你想交给回声人格的话。",
    placeholder: "像把自己交给另一个角落里的你。",
    weights: { expression_voiceprint: 5, value_compass: 4, memory_roots: 3 },
  },
];

export const personaQuestions: PersonaQuestion[] = [
  ...makeQuestions(1, "s1", stageOne),
  ...makeQuestions(2, "s2", stageTwo),
  ...makeQuestions(3, "s3", stageThree),
  ...makeQuestions(4, "s4", stageFour),
];

export const personaQuestionTotal = personaQuestions.length;
