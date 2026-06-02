"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Brain,
  Loader2,
  MessageCircle,
  RotateCcw,
  Send,
  Sparkles,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { GlassCard } from "@/components/glass-card";
import { PageHeader } from "@/components/page-header";
import {
  fetchWithLocalUser,
  scopedLocalStorageKey,
} from "@/lib/local-user-client";
import {
  personaProgressConfig as questionBankProgressConfig,
  personaQuestions as questionBankQuestions,
  personaStageConfig as questionBankStageConfig,
  typologyConfig as questionBankTypologyConfig,
  type PersonaDimension,
  type PersonaQuestion,
  type PersonaStage,
  type PersonaTypologyResults,
  type ProgressKey,
  type TypologyDimension,
} from "@/lib/persona-question-bank";
import { cn } from "@/lib/utils";

const PERSONA_READY_STORAGE_KEY = "echoverse-persona-ready-v1";
const ECHO_ROOM_STATE_STORAGE_KEY = "echoverse-echo-room-state-v1";
const ECHO_ROOM_APP_STATE_KEY = "echo_room.persona_state";
const ECHO_ROOM_TYPOLOGY_APP_STATE_KEY = "echo_room.typology_results";
const ECHO_ROOM_STAGE_ECHO_APP_STATE_KEY = "echo_room.stage_echo_notes";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type PersonaAnswer = {
  id: string;
  questionId: string;
  content: string;
  weights: Partial<Record<ProgressKey, number>>;
};

type EchoNote = {
  id: string;
  stage?: PersonaStage;
  content: string;
};

type EchoRoomPersistedState = {
  answers: PersonaAnswer[];
  echoNotes?: EchoNote[];
  typologyResults?: PersonaTypologyResults;
  updatedAt?: string;
};

const personaProgressConfig: Array<{ key: PersonaDimension; label: string }> = [
  { key: "memory_roots", label: "记忆根系" },
  { key: "character_frame", label: "性格骨架" },
  { key: "value_compass", label: "价值罗盘" },
  { key: "relationship_loop", label: "关系回路" },
  { key: "expression_voiceprint", label: "表达声纹" },
];

const typologyConfig: Array<{
  key: TypologyDimension;
  label: string;
  result: string;
}> = [
  { key: "mbti", label: "MBTI", result: "INFJ" },
  { key: "sbti", label: "SBTI", result: "MONK" },
];

const personaMilestones = [
  {
    label: "人格框架",
    completeStatus: "已写入",
    threshold: 20,
    evidenceGoal: 100,
  },
  {
    label: "行为模式",
    completeStatus: "已写入",
    threshold: 50,
    evidenceGoal: 250,
  },
  {
    label: "深层映射",
    completeStatus: "已写入",
    threshold: 80,
    evidenceGoal: 400,
  },
  {
    label: "回声人格",
    completeStatus: "已完成",
    threshold: 100,
    evidenceGoal: 500,
  },
] as const;

const personaQuestions: PersonaQuestion[] = [
  {
    id: "q-memory-entry",
    kind: "choice",
    content: "如果现在要开始生成回声人格，你想先让它了解哪一部分的你？",
    options: [
      "我最近感觉自己不像自己了",
      "我有一个反复想起的选择",
      "我想知道未来的我会对现在的我说什么",
      "我想讲一段很久没说出口的记忆",
    ],
    weights: { memory_roots: 16, character_frame: 8, value_compass: 6 },
    feedback: "你刚刚选择的入口，会成为这个人格档案最先亮起的一块区域。",
  },
  {
    id: "q-core-memory",
    kind: "open",
    content: "如果要从你的人生里保存一段最重要的记忆，你会先保存哪一段？为什么？",
    weights: { memory_roots: 24, expression_voiceprint: 10, value_compass: 4 },
    feedback: "这段记忆被安静地放进档案里了，它会帮助另一个你记得自己从哪里来。",
  },
  {
    id: "q-current-emotion",
    kind: "choice",
    content: "最近哪一种感受最常出现在你身上？",
    options: ["疲惫但还想坚持", "迷茫但不想停下", "平静但有点空", "焦虑但仍在寻找出口"],
    weights: { character_frame: 18, relationship_loop: 8, mbti: 12, sbti: 10 },
    feedback: "你的情绪不是噪音，它正在成为回声人格理解你的第一种语言。",
  },
  {
    id: "q-decision-pattern",
    kind: "choice",
    content: "遇到不确定的选择时，你更像哪一种自己？",
    options: ["先想清楚风险", "先看内心是否愿意", "先问别人怎么看", "先开始做一点再判断"],
    weights: { character_frame: 16, value_compass: 12, mbti: 16, sbti: 14 },
    feedback: "一个人的选择方式，往往比答案本身更接近真实的性格。",
  },
  {
    id: "q-life-turning-point",
    kind: "open",
    content: "有没有一段经历，让你觉得自己从那以后变了？",
    weights: { memory_roots: 18, value_compass: 10, expression_voiceprint: 8 },
    feedback: "这段经历会被写进经历档案里，不是为了定义你，而是为了理解你。",
  },
  {
    id: "q-future-self",
    kind: "choice",
    content: "关于未来，你最想保护哪一种可能性？",
    options: ["更自由的生活", "更稳定的自己", "更被理解的关系", "更有创造力的工作"],
    weights: { value_compass: 24, character_frame: 8, sbti: 14 },
    feedback: "你的憧憬不是空想，它会成为平行宇宙里那条还亮着灯的路。",
  },
  {
    id: "q-relationship-pattern",
    kind: "choice",
    content: "在人际关系里，你最容易反复出现的模式是什么？",
    options: ["习惯照顾别人", "很难主动表达需求", "害怕麻烦别人", "需要很久才真正信任"],
    weights: { relationship_loop: 24, character_frame: 10, mbti: 16, sbti: 12 },
    feedback: "关系里的反复模式被记录下来了，它会帮助回声人格更温柔地靠近你。",
  },
  {
    id: "q-unfinished-life",
    kind: "open",
    content: "如果平行宇宙里的你正在替你完成一件事，那会是什么？",
    weights: {
      value_compass: 18,
      expression_voiceprint: 16,
      memory_roots: 8,
      mbti: 16,
      sbti: 18,
    },
    feedback: "那个没有被现实听见的愿望，已经在另一个角落里有了回声。",
  },
];

personaProgressConfig.splice(
  0,
  personaProgressConfig.length,
  ...questionBankProgressConfig,
);
typologyConfig.splice(0, typologyConfig.length, ...questionBankTypologyConfig);
personaQuestions.splice(0, personaQuestions.length, ...questionBankQuestions);

const initialMessages: ChatMessage[] = [
  {
    id: "initial-assistant",
    role: "assistant",
    content: personaQuestions[0].content,
  },
];

function getAnswerIdSuffix(answer: PersonaAnswer, fallback: number) {
  const match = answer.id.match(/(\d+)$/);

  return match?.[1] ?? String(fallback);
}

function buildMessagesFromAnswers(answers: PersonaAnswer[]) {
  return answers.reduce<ChatMessage[]>((messages, answer, index) => {
    const idSuffix = getAnswerIdSuffix(answer, index + 1);
    const nextQuestion = personaQuestions[index + 1];

    return [
      ...messages,
      {
        id: `user-${idSuffix}`,
        role: "user",
        content: answer.content,
      },
      {
        id: `assistant-${idSuffix}`,
        role: "assistant",
        content:
          nextQuestion?.content ??
          "这轮回声人格采集已经完成。接下来，回声档案会把这些答案整理成更完整的你。",
      },
    ];
  }, initialMessages);
}

function buildEchoNotesFromAnswers(answers: PersonaAnswer[]) {
  return answers
    .map((answer, index) => {
      const question = personaQuestions.find((item) => item.id === answer.questionId);
      const idSuffix = getAnswerIdSuffix(answer, index + 1);

      return question
        ? {
            id: `note-${idSuffix}`,
            content: question.feedback,
          }
        : null;
    })
    .filter((note): note is EchoNote => Boolean(note))
    .reverse()
    .slice(0, 3);
}

function sanitizeEchoNotes(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): EchoNote | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const source = item as EchoNote;

      if (typeof source.content !== "string" || !source.content.trim()) {
        return null;
      }

      return {
        id: typeof source.id === "string" ? source.id : `note-${source.stage ?? "x"}`,
        stage: source.stage,
        content: source.content.trim(),
      };
    })
    .filter((item): item is EchoNote => Boolean(item))
    .slice(0, 4);
}

function sanitizeAnswers(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .slice(0, personaQuestions.length)
    .map((item, index): PersonaAnswer | null => {
      const question = personaQuestions[index];

      if (
        !question ||
        typeof item !== "object" ||
        item === null ||
        typeof (item as PersonaAnswer).content !== "string"
      ) {
        return null;
      }

      const content = (item as PersonaAnswer).content.trim();

      if (!content) {
        return null;
      }

      return {
        id:
          typeof (item as PersonaAnswer).id === "string"
            ? (item as PersonaAnswer).id
            : `answer-${index + 1}`,
        questionId: question.id,
        content,
        weights: question.weights,
      };
    })
    .filter((item): item is PersonaAnswer => Boolean(item));
}

function sanitizeTypologyResults(value: unknown): PersonaTypologyResults {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as PersonaTypologyResults;
  const safeResults: PersonaTypologyResults = {};

  for (const key of ["mbti", "sbti"] as const) {
    const result = source[key];

    if (!result || typeof result.type !== "string" || !result.type.trim()) {
      continue;
    }

    safeResults[key] = {
      type: result.type.trim(),
      confidence: Math.min(100, Math.max(1, Math.round(Number(result.confidence) || 60))),
      summary: typeof result.summary === "string" ? result.summary : "",
      evidence: Array.isArray(result.evidence)
        ? result.evidence.filter((item) => typeof item === "string").slice(0, 5)
        : [],
      updatedAt:
        typeof result.updatedAt === "string"
          ? result.updatedAt
          : new Date().toISOString(),
    };
  }

  return safeResults;
}

function parsePersistedState(value: unknown): EchoRoomPersistedState | null {
  try {
    const parsed =
      typeof value === "string"
        ? (JSON.parse(value) as Partial<EchoRoomPersistedState>)
        : (value as Partial<EchoRoomPersistedState>);
    const answers = sanitizeAnswers(parsed?.answers);

    if (!answers.length) {
      return null;
    }

    return {
      answers,
      echoNotes: sanitizeEchoNotes(parsed?.echoNotes),
      typologyResults: sanitizeTypologyResults(parsed?.typologyResults),
      updatedAt:
        typeof parsed.updatedAt === "string" ? parsed.updatedAt : undefined,
    };
  } catch {
    return null;
  }
}

function buildPersistedState(
  answers: PersonaAnswer[],
  typologyResults: PersonaTypologyResults = {},
  echoNotes: EchoNote[] = buildEchoNotesFromAnswers(answers),
): EchoRoomPersistedState {
  return {
    answers,
    echoNotes,
    typologyResults,
    updatedAt: new Date().toISOString(),
  };
}

function getPersonaCompletionFromAnswers(answers: PersonaAnswer[]) {
  return Math.min(100, Math.floor(answers.length / 2));
}

const personaOutlinePath =
  "M110 24C146 24 174 52 174 88C174 121 151 147 120 153V183C146 188 166 205 175 232L206 332C212 351 199 370 180 370H157V432C157 446 146 456 132 456C119 456 110 446 110 432C110 446 101 456 88 456C74 456 63 446 63 432V370H40C21 370 8 351 14 332L45 232C54 205 74 188 100 183V153C69 147 46 121 46 88C46 52 74 24 110 24Z";

function getProgressValue(answers: PersonaAnswer[], key: ProgressKey) {
  const total = personaQuestions.reduce(
    (sum, question) => sum + (question.weights[key] ?? 0),
    0,
  );

  if (!total) {
    return 0;
  }

  const answered = answers.reduce(
    (sum, answer) => sum + (answer.weights[key] ?? 0),
    0,
  );

  return Math.min(100, Math.round((answered / total) * 100));
}

function buildProgress(answers: PersonaAnswer[]) {
  return personaProgressConfig.map((item) => ({
    label: item.label,
    value: getProgressValue(answers, item.key),
  }));
}

function buildTypologyProgress(answers: PersonaAnswer[]) {
  return typologyConfig.map((item) => {
    const value = getProgressValue(answers, item.key);

    return {
      key: item.key,
      label: item.label,
      result: "",
      value,
    };
  });
}

function filterTypologyResultsForAnswers(
  results: PersonaTypologyResults,
  answers: PersonaAnswer[],
) {
  const nextResults: PersonaTypologyResults = { ...results };

  for (const key of ["mbti", "sbti"] as const) {
    if (getProgressValue(answers, key) < 100) {
      delete nextResults[key];
    }
  }

  return nextResults;
}

function buildMilestoneProgress(answerCount: number) {
  return personaMilestones.map((milestone, index) => {
    const stage = questionBankStageConfig[index];
    const previousAnswerGoal =
      index === 0 ? 0 : questionBankStageConfig[index - 1].answerGoal;
    const complete = answerCount >= stage.answerGoal;
    const active = !complete && answerCount >= previousAnswerGoal;

    return {
      ...milestone,
      label: stage.label,
      completeStatus: stage.completeStatus,
      evidenceGoal: stage.answerGoal,
      active,
      complete,
      status: complete
        ? stage.completeStatus
        : active
          ? "写入中"
          : "待写入",
    };
  });
}

function useAnimatedPercentage(target: number, speed = 38) {
  const [value, setValue] = useState(target);
  const valueRef = useRef(target);

  useEffect(() => {
    let frame = 0;
    let lastTime = performance.now();

    function tick(time: number) {
      const current = valueRef.current;
      const distance = target - current;

      if (Math.abs(distance) < 0.05) {
        valueRef.current = target;
        setValue(target);
        return;
      }

      const elapsed = Math.max(0, (time - lastTime) / 1000);
      lastTime = time;
      const step = Math.sign(distance) * Math.min(Math.abs(distance), elapsed * speed);
      const next = current + step;

      valueRef.current = next;
      setValue(next);
      frame = requestAnimationFrame(tick);
    }

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [speed, target]);

  return value;
}

function useAnimatedProgressList<T extends { label: string; value: number }>(
  items: T[],
) {
  const valuesRef = useRef(new Map(items.map((item) => [item.label, item.value])));
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(items.map((item) => [item.label, item.value])),
  );

  useEffect(() => {
    let frame = 0;
    let lastTime = performance.now();

    for (const item of items) {
      if (!valuesRef.current.has(item.label)) {
        valuesRef.current.set(item.label, item.value);
      }
    }

    function tick(time: number) {
      const elapsed = Math.max(0, (time - lastTime) / 1000);
      lastTime = time;
      let unsettled = false;
      const nextValues: Record<string, number> = {};

      for (const item of items) {
        const current = valuesRef.current.get(item.label) ?? item.value;
        const distance = item.value - current;

        if (Math.abs(distance) < 0.05) {
          valuesRef.current.set(item.label, item.value);
          nextValues[item.label] = item.value;
          continue;
        }

        unsettled = true;
        const step =
          Math.sign(distance) * Math.min(Math.abs(distance), elapsed * 38);
        const next = current + step;

        valuesRef.current.set(item.label, next);
        nextValues[item.label] = next;
      }

      setValues(nextValues);

      if (unsettled) {
        frame = requestAnimationFrame(tick);
      }
    }

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [items]);

  return items.map((item) => ({
    ...item,
    value: Math.round(values[item.label] ?? item.value),
  }));
}

export function EchoRoomClient() {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [profileGenerating, setProfileGenerating] = useState(false);
  const [profileReady, setProfileReady] = useState(false);
  const [demoCompletion, setDemoCompletion] = useState<number | null>(null);
  const [answers, setAnswers] = useState<PersonaAnswer[]>([]);
  const [echoNotes, setEchoNotes] = useState<EchoNote[]>([]);
  const [typologyResults, setTypologyResults] = useState<PersonaTypologyResults>({});
  const [typologyLoading, setTypologyLoading] = useState<
    Partial<Record<TypologyDimension, boolean>>
  >({});
  const [notice, setNotice] = useState("");
  const messageIdRef = useRef(0);
  const profileAutoTriggeredRef = useRef(false);
  const personaReadyStorageKey = scopedLocalStorageKey(PERSONA_READY_STORAGE_KEY);
  const echoRoomStateStorageKey = scopedLocalStorageKey(ECHO_ROOM_STATE_STORAGE_KEY);

  const currentQuestion = personaQuestions[answers.length];
  const progress = useMemo(() => buildProgress(answers), [answers]);
  const typologyProgress = useMemo(() => buildTypologyProgress(answers), [answers]);
  const personaCompletion = getPersonaCompletionFromAnswers(answers);
  const personaTargetCompletion = demoCompletion ?? personaCompletion;
  const animatedPersonaCompletion = useAnimatedPercentage(personaTargetCompletion);
  const personaDisplayCompletion = Math.round(animatedPersonaCompletion);
  const displayProgressTargets = useMemo(
    () =>
      progress.map((item) => ({
        ...item,
        value: personaTargetCompletion >= 100 ? 100 : item.value,
      })),
    [personaTargetCompletion, progress],
  );
  const displayProgress = useAnimatedProgressList(displayProgressTargets);
  const displayTypologyTargets = useMemo(
    () =>
      typologyProgress.map((item) => {
        return {
          ...item,
          value: personaTargetCompletion >= 100 ? 100 : item.value,
        };
      }),
    [personaTargetCompletion, typologyProgress],
  );
  const animatedTypologyProgress = useAnimatedProgressList(displayTypologyTargets);
  const displayTypologyProgress = useMemo(
    () =>
      animatedTypologyProgress.map((item) => ({
        ...item,
        result: typologyResults[item.key]?.type ?? "",
        loading: Boolean(typologyLoading[item.key]),
        ready: typologyProgress.some(
          (progressItem) => progressItem.key === item.key && progressItem.value >= 100,
        ),
      })),
    [animatedTypologyProgress, typologyProgress, typologyLoading, typologyResults],
  );
  const isPersonaComplete = personaTargetCompletion >= 100;
  const hasAnsweredAllQuestions = answers.length >= personaQuestions.length;
  const typologyAnalysisRunning = Object.values(typologyLoading).some(Boolean);
  const milestoneAnswerCount =
    personaTargetCompletion >= 100 ? personaQuestions.length : answers.length;
  const milestoneProgress = useMemo(
    () => buildMilestoneProgress(milestoneAnswerCount),
    [milestoneAnswerCount],
  );
  const currentMilestone =
    milestoneProgress.find((milestone) => !milestone.complete) ??
    milestoneProgress[milestoneProgress.length - 1];
  const currentStageLabel = isPersonaComplete
    ? "回声人格完成阶段"
    : `${currentMilestone.label}阶段`;
  const personaFillHeight = (animatedPersonaCompletion / 100) * 460;
  const personaFillY = 460 - personaFillHeight;
  const personaWaveY = Math.max(8, personaFillY);
  const personaWaveAmplitude = Math.min(16, Math.max(4, personaFillHeight * 0.06));
  const personaFillClipPath = `M 0 ${personaWaveY} C 34 ${personaWaveY - personaWaveAmplitude} 70 ${personaWaveY + personaWaveAmplitude} 110 ${personaWaveY} C 150 ${personaWaveY - personaWaveAmplitude} 186 ${personaWaveY + personaWaveAmplitude} 220 ${personaWaveY} L 220 460 L 0 460 Z`;
  const hasStarted = answers.length > 0;
  const latestAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );
  const latestUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "user"),
    [messages],
  );

  function restorePersonaState(
    nextAnswers: PersonaAnswer[],
    nextTypologyResults: PersonaTypologyResults = typologyResults,
  ) {
    const safeTypologyResults = filterTypologyResultsForAnswers(
      nextTypologyResults,
      nextAnswers,
    );
    const currentStageEchoNotes = echoNotes.filter((note) =>
      note.id.startsWith("stage-echo-"),
    );
    const nextEchoNotes = nextAnswers.length
      ? currentStageEchoNotes.length > 0
        ? currentStageEchoNotes
        : buildEchoNotesFromAnswers(nextAnswers)
      : [];

    setAnswers(nextAnswers);
    setEchoNotes(nextEchoNotes);
    setTypologyResults(safeTypologyResults);
    setMessages(buildMessagesFromAnswers(nextAnswers));
    messageIdRef.current = nextAnswers.reduce((maxId, answer, index) => {
      const id = Number(getAnswerIdSuffix(answer, index + 1));

      return Number.isFinite(id) ? Math.max(maxId, id) : maxId;
    }, nextAnswers.length);
  }

  function persistPersonaState(
    nextAnswers: PersonaAnswer[],
    eventType = "persona.answer_recorded",
    nextTypologyResults = typologyResults,
  ) {
    const safeTypologyResults = filterTypologyResultsForAnswers(
      nextTypologyResults,
      nextAnswers,
    );
    const currentStageEchoNotes = echoNotes.filter((note) =>
      note.id.startsWith("stage-echo-"),
    );
    const safeEchoNotes = nextAnswers.length
      ? currentStageEchoNotes.length > 0
        ? currentStageEchoNotes
        : buildEchoNotesFromAnswers(nextAnswers)
      : [];
    const persistedState = buildPersistedState(
      nextAnswers,
      safeTypologyResults,
      safeEchoNotes,
    );
    const completion = getPersonaCompletionFromAnswers(nextAnswers);

    setDemoCompletion(null);
    if (completion < 100) {
      profileAutoTriggeredRef.current = false;
    }
    if (completion >= 100) {
      window.localStorage.setItem(personaReadyStorageKey, "true");
    } else {
      window.localStorage.removeItem(personaReadyStorageKey);
    }

    window.localStorage.setItem(
      echoRoomStateStorageKey,
      JSON.stringify(persistedState),
    );

    void fetchWithLocalUser("/api/user-memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        personaCompletion: completion,
        personaReady: completion >= 100,
        currentModule: "echo_room",
        appState: {
          [ECHO_ROOM_APP_STATE_KEY]: persistedState,
          [ECHO_ROOM_TYPOLOGY_APP_STATE_KEY]: safeTypologyResults,
        },
        event: {
          type: eventType,
          payload: {
            answerCount: nextAnswers.length,
            completion,
          },
        },
      }),
    }).catch(() => {});
  }

  function persistTypologyResults(
    nextTypologyResults: PersonaTypologyResults,
    answerSnapshot: PersonaAnswer[] = answers,
    echoNoteSnapshot: EchoNote[] = echoNotes,
  ) {
    const safeTypologyResults = filterTypologyResultsForAnswers(
      nextTypologyResults,
      answerSnapshot,
    );
    const persistedState = buildPersistedState(
      answerSnapshot,
      safeTypologyResults,
      echoNoteSnapshot,
    );

    setTypologyResults(safeTypologyResults);
    window.localStorage.setItem(
      echoRoomStateStorageKey,
      JSON.stringify(persistedState),
    );

    void fetchWithLocalUser("/api/user-memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        currentModule: "echo_room",
        appState: {
          [ECHO_ROOM_APP_STATE_KEY]: persistedState,
          [ECHO_ROOM_TYPOLOGY_APP_STATE_KEY]: safeTypologyResults,
        },
        event: {
          type: "persona.typology_saved",
          payload: {
            mbti: safeTypologyResults.mbti?.type,
            sbti: safeTypologyResults.sbti?.type,
          },
        },
      }),
    }).catch(() => {});
  }

  function persistEchoNotes(
    nextEchoNotes: EchoNote[],
    answerSnapshot: PersonaAnswer[] = answers,
    typologySnapshot: PersonaTypologyResults = typologyResults,
  ) {
    const persistedState = buildPersistedState(
      answerSnapshot,
      typologySnapshot,
      nextEchoNotes,
    );

    setEchoNotes(nextEchoNotes);
    window.localStorage.setItem(
      echoRoomStateStorageKey,
      JSON.stringify(persistedState),
    );

    void fetchWithLocalUser("/api/user-memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        currentModule: "echo_room",
        appState: {
          [ECHO_ROOM_APP_STATE_KEY]: persistedState,
          [ECHO_ROOM_STAGE_ECHO_APP_STATE_KEY]: nextEchoNotes.filter((note) =>
            note.id.startsWith("stage-echo-"),
          ),
        },
      }),
    }).catch(() => {});
  }

  function requestTypologyAnalysis(
    nextAnswers: PersonaAnswer[],
    currentResults: PersonaTypologyResults = typologyResults,
  ) {
    const targets = typologyConfig
      .filter(
        (item) =>
          getProgressValue(nextAnswers, item.key) >= 100 &&
          !currentResults[item.key]?.type &&
          !typologyLoading[item.key],
      )
      .map((item) => item.key);

    if (!targets.length) {
      return;
    }

    setTypologyLoading((current) => ({
      ...current,
      ...Object.fromEntries(targets.map((target) => [target, true])),
    }));

    void fetchWithLocalUser("/api/persona/typology", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        targets,
        answers: nextAnswers.map((answer) => ({
          questionId: answer.questionId,
          content: answer.content,
          weights: answer.weights,
        })),
      }),
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          results?: PersonaTypologyResults;
          error?: string;
        };

        if (!response.ok || !data.results) {
          throw new Error(data.error || "MBTI/SBTI 分析暂时没有完成。");
        }

        const nextResults = sanitizeTypologyResults({
          ...currentResults,
          ...data.results,
        });

        persistTypologyResults(nextResults, nextAnswers);
      })
      .catch((error) => {
        setNotice(
          error instanceof Error
            ? error.message
            : "MBTI/SBTI 分析暂时没有完成。",
        );
      })
      .finally(() => {
        setTypologyLoading((current) => ({
          ...current,
          ...Object.fromEntries(targets.map((target) => [target, false])),
        }));
      });
  }

  function requestStageEcho(nextAnswers: PersonaAnswer[]) {
    const completedStages = questionBankStageConfig.filter(
      (stage) => nextAnswers.length >= stage.answerGoal,
    );
    const pendingStage = completedStages.find(
      (stage) => !echoNotes.some((note) => note.id === `stage-echo-${stage.stage}`),
    );

    if (!pendingStage) {
      return;
    }

    setFeedbackLoading(true);

    void fetchWithLocalUser("/api/persona/stage-echo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stage: pendingStage.stage,
        answers: nextAnswers.map((answer) => ({
          questionId: answer.questionId,
          content: answer.content,
        })),
        existingNotes: echoNotes,
      }),
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          note?: EchoNote;
          notes?: EchoNote[];
          error?: string;
        };

        if (!response.ok || !data.note) {
          throw new Error(data.error || "阶段回声暂时没有生成。");
        }

        const nextEchoNotes = sanitizeEchoNotes(data.notes ?? [
          data.note,
          ...echoNotes,
        ]);

        persistEchoNotes(nextEchoNotes, nextAnswers);
      })
      .catch((error) => {
        setNotice(
          error instanceof Error ? error.message : "阶段回声暂时没有生成。",
        );
        setEchoNotes(buildEchoNotesFromAnswers(nextAnswers));
      })
      .finally(() => {
        setFeedbackLoading(false);
      });
  }

  useEffect(() => {
    let active = true;

    async function hydratePersonaProgress() {
      const localReady =
        window.localStorage.getItem(personaReadyStorageKey) === "true";
      const localState = parsePersistedState(
        window.localStorage.getItem(echoRoomStateStorageKey),
      );

      try {
        const response = await fetchWithLocalUser("/api/user-memory");

        if (!response.ok || !active) {
          if (localState?.answers.length) {
            restorePersonaState(
              localState.answers,
              sanitizeTypologyResults(localState.typologyResults),
            );
          }
          if (localReady) {
            setDemoCompletion(100);
          }
          return;
        }

        const data = (await response.json()) as {
          memoryDocument?: {
            personaCompletion?: number;
            personaReady?: boolean;
            profileReady?: boolean;
          };
          appState?: Record<string, string>;
        };
        setProfileReady(Boolean(data.memoryDocument?.profileReady));
        const remoteState = parsePersistedState(
          data.appState?.[ECHO_ROOM_APP_STATE_KEY],
        );
        const remoteTypologyResults = sanitizeTypologyResults(
          data.appState?.[ECHO_ROOM_TYPOLOGY_APP_STATE_KEY]
            ? JSON.parse(data.appState[ECHO_ROOM_TYPOLOGY_APP_STATE_KEY])
            : remoteState?.typologyResults,
        );
        const localTypologyResults = sanitizeTypologyResults(
          localState?.typologyResults,
        );
        const restoredTypologyResults =
          Object.keys(remoteTypologyResults).length > 0
            ? remoteTypologyResults
            : localTypologyResults;
        const restoredState =
          remoteState &&
          (!localState ||
            (Date.parse(remoteState.updatedAt ?? "") || 0) >=
              (Date.parse(localState.updatedAt ?? "") || 0) ||
            remoteState.answers.length >= localState.answers.length)
            ? remoteState
            : localState;
        const restoredCompletion = restoredState
          ? getPersonaCompletionFromAnswers(restoredState.answers)
          : 0;
        const remoteCompletion = Math.max(
          Number(data.memoryDocument?.personaCompletion) || 0,
          data.memoryDocument?.personaReady || data.memoryDocument?.profileReady
            ? 100
            : 0,
          restoredCompletion,
        );

        if (restoredState?.answers.length) {
          restorePersonaState(restoredState.answers, restoredTypologyResults);
          requestTypologyAnalysis(restoredState.answers, restoredTypologyResults);
          window.localStorage.setItem(
            echoRoomStateStorageKey,
            JSON.stringify({
              ...restoredState,
              typologyResults: restoredTypologyResults,
            }),
          );
        }

        if (remoteCompletion >= 100) {
          window.localStorage.setItem(personaReadyStorageKey, "true");
          setDemoCompletion(100);
        } else if (remoteCompletion > 0) {
          setDemoCompletion(remoteCompletion);
        } else if (localReady) {
          setDemoCompletion(100);
        }
      } catch {
        if (active && localState?.answers.length) {
          restorePersonaState(
            localState.answers,
            sanitizeTypologyResults(localState.typologyResults),
          );
        }
        if (active && localReady) {
          setDemoCompletion(100);
        }
      }
    }

    void hydratePersonaProgress();

    return () => {
      active = false;
    };
  // Hydration intentionally runs only when the user-scoped storage keys change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [echoRoomStateStorageKey, personaReadyStorageKey]);

  useEffect(() => {
    if (isPersonaComplete) {
      window.localStorage.setItem(personaReadyStorageKey, "true");
      void fetchWithLocalUser("/api/user-memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          personaCompletion: 100,
          personaReady: true,
          currentModule: "echo_room",
          event: {
            type: "persona.completed",
            payload: { source: "echo_room" },
          },
        }),
      });
    }
  }, [isPersonaComplete, personaReadyStorageKey]);

  useEffect(() => {
    if (
      !hasAnsweredAllQuestions ||
      !isPersonaComplete ||
      profileReady ||
      profileGenerating ||
      profileAutoTriggeredRef.current ||
      typologyAnalysisRunning
    ) {
      return;
    }

    profileAutoTriggeredRef.current = true;
    void generateProfileArchive({ auto: true });
  // generateProfileArchive intentionally uses the current render snapshot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasAnsweredAllQuestions,
    isPersonaComplete,
    profileReady,
    profileGenerating,
    typologyAnalysisRunning,
  ]);

  const assistantMessageBeforeLatestUser = useMemo(() => {
    if (!latestUserMessage) {
      return undefined;
    }

    const userIndex = messages.findIndex((message) => message.id === latestUserMessage.id);

    return [...messages.slice(0, userIndex)]
      .reverse()
      .find((message) => message.role === "assistant");
  }, [latestUserMessage, messages]);
  const visibleStageKey = `question-${
    (loading ? assistantMessageBeforeLatestUser : latestAssistantMessage)?.id ??
    "empty"
  }`;
  const visibleMessages =
    loading && latestUserMessage
      ? [assistantMessageBeforeLatestUser, latestUserMessage].filter(
          (message): message is ChatMessage => Boolean(message),
        )
      : latestAssistantMessage
        ? [latestAssistantMessage]
        : [];

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);

    if (params.get("progressDemo") !== "1") {
      return;
    }

    let nextValue = 0;

    const timer = window.setInterval(() => {
      nextValue += 1;
      setDemoCompletion(Math.min(nextValue, 100));

      if (nextValue >= 100) {
        window.clearInterval(timer);
      }
    }, 45);

    return () => window.clearInterval(timer);
  }, []);

  function goBackQuestion() {
    if (!hasStarted || loading) {
      return;
    }

    const nextAnswers = answers.slice(0, -1);

    restorePersonaState(nextAnswers);
    persistPersonaState(nextAnswers, "persona.answer_removed");
    setInput("");
    setNotice("");
  }

  function resetPersonaArchive() {
    if (!hasStarted || loading) {
      return;
    }

    restorePersonaState([]);
    persistPersonaState([], "persona.reset");
    setInput("");
    setNotice("");
  }

  async function submitAnswer(value = input) {
    const answerContent = value.trim();

    if (!answerContent || loading || !currentQuestion) {
      return;
    }

    messageIdRef.current += 1;
    const userMessageId = messageIdRef.current;
    const nextQuestion = personaQuestions[answers.length + 1];
    const answer: PersonaAnswer = {
      id: `answer-${userMessageId}`,
      questionId: currentQuestion.id,
      content: answerContent,
      weights: currentQuestion.weights,
    };
    const nextAnswers = [...answers, answer];
    const completedStageNow = questionBankStageConfig.some(
      (stage) => nextAnswers.length === stage.answerGoal,
    );

    const localUserMessage: ChatMessage = {
      id: `user-${userMessageId}`,
      role: "user",
      content: answerContent,
    };

    setMessages((current) => [...current, localUserMessage]);
    setInput("");
    setNotice("");
    setLoading(true);
    setFeedbackLoading(true);
    persistPersonaState(nextAnswers);
    requestTypologyAnalysis(nextAnswers);

    try {
      await new Promise((resolve) => setTimeout(resolve, 1000));

      setAnswers(nextAnswers);
      if (completedStageNow) {
        requestStageEcho(nextAnswers);
      } else if (!echoNotes.some((note) => note.id.startsWith("stage-echo-"))) {
        setEchoNotes(buildEchoNotesFromAnswers(nextAnswers));
      }
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${userMessageId}`,
          role: "assistant",
          content:
            nextQuestion?.content ??
            "这轮回声人格采集已经完成。接下来，回声档案会把这些答案整理成更完整的你。",
        },
      ]);
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "这次答案暂时没有写入成功。请稍后再试一次。";

      setMessages((current) => [
        ...current,
        {
          id: `assistant-error-${userMessageId}`,
          role: "assistant",
          content: errorMessage,
        },
      ]);
    } finally {
      setLoading(false);
      setFeedbackLoading(false);
    }
  }

  async function generateProfileArchive(options: { auto?: boolean } = {}) {
    if (!isPersonaComplete || !hasAnsweredAllQuestions || profileGenerating) {
      return;
    }

    setProfileGenerating(true);
    setNotice(
      options.auto
        ? "答题已经完成，正在自动生成回声档案..."
        : "正在把你的问答整理成回声档案...",
    );

    try {
      const response = await fetchWithLocalUser("/api/profile/generate", {
        method: "POST",
      });
      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "回声档案暂时没有形成。");
      }

      setProfileReady(true);
      setNotice("回声档案已经生成，正在打开...");
      router.push("/profile");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "这些问答暂时没能被整理成回声档案。",
      );
    } finally {
      setProfileGenerating(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1760px]">
      <PageHeader
        eyebrow="Echo Persona"
        title="回声人格"
        description="既是心灵导师，也是知交好友，从一句最真实的答案开始，让另一个角落里的你慢慢成型。"
        descriptionClassName="whitespace-nowrap"
      />

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,700px)_minmax(330px,370px)_minmax(430px,500px)] 2xl:grid-cols-[minmax(0,760px)_minmax(350px,390px)_minmax(470px,540px)]">
        <GlassCard className="flex h-[790px] min-h-0 flex-col overflow-hidden p-5 md:p-6">
          <div className="shrink-0 border-b border-white/10 pb-5">
            <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="grid size-11 place-items-center rounded-2xl border border-[#D8B46A]/30 bg-[#D8B46A]/12 text-[#D8B46A]">
                <MessageCircle className="size-5" />
              </div>
              <div>
                <p className="font-medium text-[#F4EFE7]">回声人格生成室</p>
                <p className="mt-1 text-sm text-[#AAB4C3]">
                  每一个答案，都会慢慢长成平行宇宙的那个你。
                </p>
                <div className="mt-3 inline-flex h-8 items-center gap-2 rounded-full border border-[#FFF4D8]/22 bg-[linear-gradient(135deg,rgba(255,244,216,0.13),rgba(216,167,177,0.1))] px-3 text-xs font-medium text-[#FFF4D8] shadow-[0_0_24px_rgba(216,180,106,0.1)]">
                  <span className="size-1.5 rounded-full bg-[#D8B46A] shadow-[0_0_12px_rgba(216,180,106,0.65)]" />
                  {currentStageLabel}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {hasStarted ? (
                <>
                  <button
                    type="button"
                    onClick={goBackQuestion}
                    disabled={loading}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.045] px-3 text-xs text-[#AAB4C3] transition hover:border-[#D8B46A]/30 hover:bg-white/[0.07] hover:text-[#F4EFE7] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Undo2 className="size-3.5" />
                    返回上题
                  </button>
                  <button
                    type="button"
                    onClick={resetPersonaArchive}
                    disabled={loading}
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-[#D8B46A]/20 bg-[#D8B46A]/10 px-3 text-xs text-[#D8B46A] transition hover:border-[#D8B46A]/35 hover:bg-[#D8B46A]/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RotateCcw className="size-3.5" />
                    重新建档
                  </button>
                </>
              ) : null}

              {loading ? (
                <span className="hidden items-center gap-2 rounded-full border border-[#D8B46A]/30 bg-[#D8B46A]/10 px-3 py-1.5 text-xs text-[#D8B46A] sm:inline-flex">
                  <Loader2 className="size-3.5 animate-spin" />
                  问题正在生成
                </span>
              ) : null}
            </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden py-6 pr-1">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={visibleStageKey}
                initial={{ opacity: 0, y: 22, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -30, scale: 0.99 }}
                transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
                className="flex h-full flex-col justify-start gap-5"
              >
              {visibleMessages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={message.role === "user" ? { opacity: 0, y: 12 } : false}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className={
                    message.role === "user" ? "flex justify-end" : "flex justify-start"
                  }
                >
                  <div
                    className={
                      message.role === "user"
                        ? "max-w-[82%] rounded-[1.6rem] rounded-br-md border border-[#D8B46A]/35 bg-[#D8B46A]/14 px-5 py-4 text-[#F4EFE7] shadow-[0_18px_50px_rgba(216,180,106,0.1)]"
                        : "max-w-[82%] rounded-[1.6rem] rounded-bl-md border border-white/12 bg-white/[0.065] px-5 py-4 text-[#EDE6DC]"
                    }
                  >
                    <p className="text-sm leading-7">{message.content}</p>
                  </div>
                </motion.div>
              ))}
              </motion.div>
            </AnimatePresence>

          </div>

          {currentQuestion?.kind === "choice" && currentQuestion.options?.length ? (
            <div className="grid shrink-0 gap-3 md:grid-cols-2" aria-label="答案选择区">
              {currentQuestion.options.map((option) => (
                <button
                  key={option}
                  disabled={loading}
                  onClick={() => submitAnswer(option)}
                  className="group flex min-h-16 items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.045] px-4 py-3 text-left text-sm leading-6 text-[#AAB4C3] transition hover:-translate-y-0.5 hover:border-[#D8B46A]/35 hover:bg-white/[0.07] hover:text-[#F4EFE7] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="min-w-0 flex-1">{option}</span>
                  <ArrowRight className="size-4 shrink-0 text-[#D8B46A] opacity-0 transition duration-200 group-hover:translate-x-0.5 group-hover:opacity-100" />
                </button>
              ))}
            </div>
          ) : null}

          <form
            className="mt-5 shrink-0 rounded-3xl border border-white/10 bg-[#080C18]/70 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitAnswer();
            }}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={!currentQuestion || loading}
                placeholder={
                  currentQuestion
                    ? "也可以写下你自己的答案..."
                    : "这轮回声人格采集已完成"
                }
                className="soft-input min-h-14 flex-1 rounded-2xl px-4"
              />
              <button disabled={loading || !currentQuestion} className="premium-button sm:min-w-36">
                {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                提交答案
              </button>
            </div>
          </form>
        </GlassCard>

        <div className="flex h-[790px] min-h-0 flex-col gap-5 overflow-visible">
          <GlassCard className="shrink-0 p-6">
            <div className="flex items-start gap-4">
              <div className="grid size-12 place-items-center rounded-2xl border border-[#8FB8D8]/30 bg-[#8FB8D8]/12 text-[#8FB8D8]">
                <Brain className="size-5" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#F4EFE7]">
                  回声档案生成中
                </h2>
                <p className="mt-2 text-sm leading-7 text-[#AAB4C3]">
                  平行宇宙的回声人格正在写入...
                </p>
              </div>
            </div>

            <div className="mt-7 space-y-5">
              {displayProgress.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-[#AAB4C3]">{item.label}</span>
                    <span className="text-[#F4EFE7]">{item.value}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#D8B46A] via-[#D8A7B1] to-[#8B7CF6]"
                      initial={false}
                      animate={{ width: `${item.value}%` }}
                      transition={{ duration: 0.45 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="shrink-0 p-6">
            <div className="space-y-5">
              {displayTypologyProgress.map((item) => (
                <div key={item.label}>
                  <div className="mb-2 grid grid-cols-[48px_72px_1fr] items-center gap-3 text-sm">
                    <span className="font-medium text-[#F4EFE7]">{item.label}</span>
                    <span
                      aria-label={`${item.label} result`}
                      className="flex h-7 items-center justify-center rounded-xl border border-[#D8B46A]/18 bg-[linear-gradient(135deg,rgba(216,180,106,0.13),rgba(216,167,177,0.08))] px-2 text-center text-[12px] font-medium leading-none text-[#F4EFE7]/72 shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_0_22px_rgba(216,167,177,0.08)] backdrop-blur"
                    >
                      {item.result || (item.loading ? "分析中" : item.ready ? "待分析" : "")}
                    </span>
                    <span className="justify-self-end text-[#F4EFE7]">{item.value}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#D8B46A] via-[#D8A7B1] to-[#8B7CF6]"
                      initial={false}
                      animate={{ width: `${item.value}%` }}
                      transition={{ duration: 0.45 }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>

          <GlassCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
            <div className="flex shrink-0 items-center gap-2 text-[#D8B46A]">
              <Sparkles className="size-4" />
              <p className="text-sm font-medium">新记忆</p>
            </div>
            <div className="mt-5 min-h-0 flex-1 space-y-4 overflow-hidden pr-1">
              {feedbackLoading ? (
                <div className="rounded-3xl border border-white/10 bg-white/[0.045] p-4 text-sm leading-7 text-[#AAB4C3]">
                  正在生成这一轮的回声反馈...
                </div>
              ) : null}

              {echoNotes.length === 0 ? (
                <p className="rounded-3xl border border-white/10 bg-white/[0.04] p-4 text-sm leading-7 text-[#AAB4C3]">
                  这个平行宇宙还很安静。等你完成第一个阶段，它会给你第一个回声。
                </p>
              ) : null}

              <AnimatePresence initial={false}>
                {echoNotes.map((note) => (
                  <motion.div
                    key={note.id}
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 12 }}
                    className="rounded-3xl border border-white/10 bg-white/[0.055] p-4"
                  >
                    <p className="text-base leading-7 text-[#F4EFE7]">
                      {note.content}
                    </p>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </GlassCard>

          {notice ? (
            <GlassCard className="p-5">
              <p className="text-sm leading-7 text-[#AAB4C3]">{notice}</p>
            </GlassCard>
          ) : null}
        </div>

        <GlassCard className="relative flex h-[790px] items-center overflow-hidden p-5 md:p-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_58%_38%,rgba(216,180,106,0.07),transparent_24%),radial-gradient(circle_at_50%_62%,rgba(216,167,177,0.1),transparent_38%)]" />
          <div className="relative z-10 grid h-full min-h-0 w-full grid-cols-[minmax(0,1fr)_minmax(190px,214px)] items-center gap-4">
            <div className="relative flex h-full min-w-0 flex-col items-center justify-center overflow-hidden">
              <div className="absolute inset-x-4 top-10 h-px bg-gradient-to-r from-transparent via-[#D8B46A]/25 to-transparent" />
              <div className="mb-1 translate-y-2 rounded-full border border-[#F4EFE7]/18 bg-[#F4EFE7]/10 px-4 py-1.5 text-sm font-semibold tracking-[0.24em] text-[#FFF4D8] shadow-[0_0_28px_rgba(216,180,106,0.15)] backdrop-blur">
                {personaDisplayCompletion}%
              </div>
              <div className="relative grid aspect-[0.48] h-[min(74%,520px)] min-h-[360px] translate-y-1 place-items-center">
                <svg
                  viewBox="0 0 220 460"
                  className="relative h-full w-auto overflow-visible"
                  aria-hidden="true"
                >
                  <defs>
                    <linearGradient id="personaOutline" x1="110" y1="8" x2="110" y2="452" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#FFF4D8" />
                      <stop offset="0.44" stopColor="#F0B9C2" />
                      <stop offset="1" stopColor="#A9D4F0" />
                    </linearGradient>
                    <linearGradient id="personaFill" x1="34" y1="460" x2="190" y2="24" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#4F78C8" />
                      <stop offset="0.24" stopColor="#8FB8D8" />
                      <stop offset="0.48" stopColor="#BDA3FF" />
                      <stop offset="0.72" stopColor="#D8A7B1" />
                      <stop offset="1" stopColor="#F3D48A" />
                    </linearGradient>
                    <linearGradient id="personaFlow" x1="-220" y1="0" x2="660" y2="0" gradientUnits="userSpaceOnUse">
                      <animateTransform
                        attributeName="gradientTransform"
                        type="translate"
                        values="-180 0; 180 0; -180 0"
                        dur="16s"
                        repeatCount="indefinite"
                      />
                      <stop stopColor="#4F78C8" />
                      <stop offset="0.14" stopColor="#7FD8C7" />
                      <stop offset="0.28" stopColor="#F3D48A" />
                      <stop offset="0.42" stopColor="#D8A7B1" />
                      <stop offset="0.56" stopColor="#BDA3FF" />
                      <stop offset="0.7" stopColor="#8FB8D8" />
                      <stop offset="0.86" stopColor="#F0B9C2" />
                      <stop offset="1" stopColor="#4F78C8" />
                    </linearGradient>
                    <linearGradient id="personaRibbonA" x1="-20" y1="0" x2="250" y2="0" gradientUnits="userSpaceOnUse">
                      <animateTransform
                        attributeName="gradientTransform"
                        type="translate"
                        values="-80 0; 80 0; -80 0"
                        dur="13s"
                        repeatCount="indefinite"
                      />
                      <stop stopColor="#F3D48A" />
                      <stop offset="0.32" stopColor="#F0B9C2" />
                      <stop offset="0.66" stopColor="#BDA3FF" />
                      <stop offset="1" stopColor="#7FD8C7" />
                    </linearGradient>
                    <linearGradient id="personaRibbonB" x1="-20" y1="0" x2="250" y2="0" gradientUnits="userSpaceOnUse">
                      <animateTransform
                        attributeName="gradientTransform"
                        type="translate"
                        values="90 0; -90 0; 90 0"
                        dur="18s"
                        repeatCount="indefinite"
                      />
                      <stop stopColor="#8FB8D8" />
                      <stop offset="0.35" stopColor="#BDA3FF" />
                      <stop offset="0.68" stopColor="#D8A7B1" />
                      <stop offset="1" stopColor="#FFF4D8" />
                    </linearGradient>
                    <radialGradient id="personaBloom" cx="40%" cy="18%" r="75%">
                      <stop stopColor="#FFF8D8" />
                      <stop offset="0.24" stopColor="#F3D48A" />
                      <stop offset="0.56" stopColor="#D8A7B1" />
                      <stop offset="1" stopColor="#8FB8D8" />
                    </radialGradient>
                    <linearGradient id="personaFacet" x1="40" y1="30" x2="185" y2="438" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#FFF4D8" />
                      <stop offset="0.38" stopColor="#F0B9C2" />
                      <stop offset="0.7" stopColor="#BDA3FF" />
                      <stop offset="1" stopColor="#5B7FD5" />
                    </linearGradient>
                    <clipPath id="personaClip">
                      <path d={personaOutlinePath} />
                    </clipPath>
                    <clipPath id="personaFillClip">
                      <motion.path
                        initial={false}
                        animate={{
                          d: [
                            personaFillClipPath,
                            `M 0 ${personaWaveY} C 34 ${personaWaveY + personaWaveAmplitude} 70 ${personaWaveY - personaWaveAmplitude} 110 ${personaWaveY} C 150 ${personaWaveY + personaWaveAmplitude} 186 ${personaWaveY - personaWaveAmplitude} 220 ${personaWaveY} L 220 460 L 0 460 Z`,
                            personaFillClipPath,
                          ],
                        }}
                        transition={{
                          duration: 5.8,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                    </clipPath>
                    <filter id="personaGlow" x="-40%" y="-20%" width="180%" height="140%" colorInterpolationFilters="sRGB">
                      <feDropShadow dx="0" dy="0" stdDeviation="6" floodColor="#D8A7B1" floodOpacity="0.22" />
                      <feDropShadow dx="0" dy="0" stdDeviation="14" floodColor="#D8B46A" floodOpacity="0.12" />
                    </filter>
                    <filter id="personaFillSculpt" x="-25%" y="-12%" width="150%" height="125%" colorInterpolationFilters="sRGB">
                      <feDropShadow dx="-5" dy="-7" stdDeviation="9" floodColor="#FFF4D8" floodOpacity="0.22" />
                      <feDropShadow dx="8" dy="12" stdDeviation="12" floodColor="#2A1C58" floodOpacity="0.34" />
                    </filter>
                  </defs>
                  <g clipPath="url(#personaClip)">
                    <g clipPath="url(#personaFillClip)" filter="url(#personaFillSculpt)">
                      <rect
                        x="0"
                        y="0"
                        width="220"
                        height="460"
                        fill="url(#personaFill)"
                      />
                      <motion.rect
                        x="-220"
                        y="0"
                        width="660"
                        height="460"
                        fill="url(#personaFlow)"
                        initial={false}
                        animate={{ x: [-220, 0, -220] }}
                        transition={{
                          duration: 12,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <motion.path
                        d={`M -34 ${personaFillY + Math.max(14, personaFillHeight * 0.24)} C 16 ${personaFillY + Math.max(2, personaFillHeight * 0.08)} 62 ${personaFillY + Math.max(44, personaFillHeight * 0.42)} 112 ${personaFillY + Math.max(24, personaFillHeight * 0.25)} C 156 ${personaFillY + Math.max(8, personaFillHeight * 0.14)} 194 ${personaFillY + Math.max(42, personaFillHeight * 0.44)} 254 ${personaFillY + Math.max(16, personaFillHeight * 0.22)} L 254 ${personaFillY + Math.max(62, personaFillHeight * 0.5)} C 196 ${personaFillY + Math.max(92, personaFillHeight * 0.72)} 150 ${personaFillY + Math.max(58, personaFillHeight * 0.56)} 106 ${personaFillY + Math.max(82, personaFillHeight * 0.68)} C 56 ${personaFillY + Math.max(108, personaFillHeight * 0.82)} 12 ${personaFillY + Math.max(70, personaFillHeight * 0.62)} -34 ${personaFillY + Math.max(96, personaFillHeight * 0.76)} Z`}
                        fill="url(#personaRibbonA)"
                        initial={false}
                        animate={{ x: [0, 18, -8, 0] }}
                        transition={{
                          duration: 11,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <motion.path
                        d={`M -38 ${personaFillY + Math.max(54, personaFillHeight * 0.68)} C 10 ${personaFillY + Math.max(34, personaFillHeight * 0.5)} 58 ${personaFillY + Math.max(74, personaFillHeight * 0.8)} 108 ${personaFillY + Math.max(54, personaFillHeight * 0.62)} C 154 ${personaFillY + Math.max(34, personaFillHeight * 0.5)} 198 ${personaFillY + Math.max(74, personaFillHeight * 0.78)} 258 ${personaFillY + Math.max(46, personaFillHeight * 0.58)} L 258 ${personaFillY + personaFillHeight + 26} L -38 ${personaFillY + personaFillHeight + 26} Z`}
                        fill="url(#personaRibbonB)"
                        initial={false}
                        animate={{ x: [12, -16, 12] }}
                        transition={{
                          duration: 14,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <motion.ellipse
                        cx="74"
                        cy={personaFillY + personaFillHeight * 0.32}
                        rx="92"
                        ry="122"
                        fill="url(#personaBloom)"
                        opacity="0.52"
                        initial={false}
                        animate={{
                          cx: [68, 88, 68],
                          cy: [
                            personaFillY + personaFillHeight * 0.28,
                            personaFillY + personaFillHeight * 0.36,
                            personaFillY + personaFillHeight * 0.28,
                          ],
                        }}
                        transition={{
                          duration: 12,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                      <motion.path
                        d={`M 28 ${personaFillY + 12} C 78 ${personaFillY + personaFillHeight * 0.22} 84 ${personaFillY + personaFillHeight * 0.58} 56 ${personaFillY + personaFillHeight + 10} L 116 ${personaFillY + personaFillHeight + 10} C 138 ${personaFillY + personaFillHeight * 0.52} 126 ${personaFillY + personaFillHeight * 0.18} 92 ${personaFillY + 4} Z`}
                        fill="url(#personaFacet)"
                        opacity="0.34"
                        initial={false}
                        animate={{ x: [-8, 8, -8] }}
                        transition={{
                          duration: 15,
                          repeat: Infinity,
                          ease: "easeInOut",
                        }}
                      />
                    </g>
                  </g>
                  <path
                    d={personaOutlinePath}
                    fill="none"
                    stroke="url(#personaOutline)"
                    strokeWidth="5.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    filter="url(#personaGlow)"
                  />
                  <path
                    d={personaOutlinePath}
                    fill="none"
                    stroke="#FFF4D8"
                    strokeOpacity="0.68"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d={personaOutlinePath}
                    fill="none"
                    stroke="#8FB8D8"
                    strokeOpacity="0.32"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M67 210C83 230 98 239 110 239C122 239 137 230 153 210"
                    fill="none"
                    stroke="#FFF4D8"
                    strokeOpacity="0.18"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                  <path
                    d="M64 370H156"
                    fill="none"
                    stroke="#D8B46A"
                    strokeOpacity="0.18"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
              <div className="absolute inset-x-4 bottom-10 h-px bg-gradient-to-r from-transparent via-[#8FB8D8]/18 to-transparent" />
            </div>

            <div className="relative flex h-[500px] items-center">
              <div className="relative h-[430px] w-full">
                <div className="absolute bottom-[8%] left-1.5 top-[calc(8%+6px)] w-px bg-[#F4EFE7]/22" />
                <motion.div
                  className="absolute left-1.5 top-[calc(8%+6px)] w-px bg-gradient-to-b from-[#D8B46A] via-[#D8A7B1] to-[#8FB8D8] shadow-[0_0_18px_rgba(216,180,106,0.35)]"
                  initial={false}
                  animate={{ height: `${Math.max(0, personaDisplayCompletion * 0.812)}%` }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                />

                {milestoneProgress.map((milestone, index) => {
                  const top = `${8 + index * 28}%`;

                  return (
                    <div
                      key={milestone.label}
                      aria-label={`${milestone.label} ${milestone.status} ${milestone.evidenceGoal}/200`}
                      className="absolute left-0 flex w-full items-center"
                      style={{ top }}
                    >
                      <div
                        className={cn(
                          "relative z-10 size-3 rounded-full border transition duration-300",
                          milestone.complete
                            ? "border-[#FFF4D8] bg-[#D8B46A] shadow-[0_0_18px_rgba(216,180,106,0.65),0_0_34px_rgba(216,167,177,0.22)]"
                            : "border-[#F4EFE7]/40 bg-[#4A3344]",
                        )}
                      />
                      <div
                        className={cn(
                          "h-px w-11 rounded-full transition duration-300",
                          milestone.complete
                            ? "bg-[#D8B46A] shadow-[0_0_14px_rgba(216,180,106,0.7)]"
                            : "bg-[#F4EFE7]/24",
                        )}
                      />
                      <p
                        className={cn(
                          "ml-3 flex min-w-[132px] items-baseline gap-2 whitespace-nowrap text-sm tracking-normal transition duration-300",
                          milestone.complete
                            ? "text-[#FFF4D8]"
                            : milestone.active
                              ? "text-[#FFF1D0]"
                              : "text-[#EDE6DC]/72",
                        )}
                      >
                        <span
                          className={cn(
                            "font-semibold",
                            milestone.complete
                              ? "drop-shadow-[0_0_7px_rgba(216,180,106,0.5)]"
                              : "",
                          )}
                        >
                          {milestone.label}
                        </span>
                        <span
                          className={cn(
                            "text-xs font-medium",
                            milestone.complete
                              ? "text-[#F3D48A] drop-shadow-[0_0_6px_rgba(216,180,106,0.45)]"
                              : milestone.active
                                ? "text-[#F0B9C2]"
                                : "text-[#DCCFC1]/68",
                          )}
                        >
                          {milestone.status}
                        </span>
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </GlassCard>
      </div>

      <AnimatePresence>
        {isPersonaComplete ? (
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.28 }}
            className="mt-8 flex justify-center"
          >
            <button
              type="button"
              className="premium-button min-h-14 px-7 text-base"
              onClick={() => generateProfileArchive()}
              disabled={profileGenerating || !hasAnsweredAllQuestions}
            >
              {profileGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Brain className="size-4" />
              )}
              生成我的回声档案
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
