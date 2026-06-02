"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChevronDown,
  History,
  Loader2,
  Mail,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PageHeader } from "@/components/page-header";
import { fetchWithLocalUser } from "@/lib/local-user-client";
import { USER_CENTER_STORAGE_KEY } from "@/lib/local-user-session";

const categories = [
  { label: "职业", value: "career" },
  { label: "情绪", value: "emotion" },
  { label: "关系", value: "relationship" },
  { label: "未来", value: "future" },
  { label: "生活", value: "life" },
  { label: "自我", value: "self" },
];

const fallbackQuickQuestions = [
  "我是不是不适合现在这条路？",
  "我为什么总是想开始，又总是半途而废？",
  "如果我继续现在这样过三年，会怎么样？",
  "我到底要不要换一个方向？",
  "为什么我总是在关键时刻退缩？",
  "这段关系里我真正舍不得什么？",
  "我现在的焦虑到底在提醒我什么？",
  "如果慢一点，我今天该先做什么？",
];

const moduleGoldTitleClass =
  "text-[15px] font-medium leading-6 tracking-normal text-[#D8B46A]";

type LetterResult = {
  letter: string;
  inner_voice: {
    title: string;
    content: string;
    signals: string[];
  };
  referenced_memories: string[];
  action: {
    title: string;
    steps: string[];
  };
};

type LetterHistoryItem = LetterResult & {
  id: string;
  question: string;
  category: string;
  createdAt: string;
};

export function LettersClient() {
  const questionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const activeAccountRef = useRef("");
  const [category, setCategory] = useState("career");
  const [question, setQuestion] = useState("");
  const [referenceQuestions, setReferenceQuestions] = useState(
    fallbackQuickQuestions.slice(0, 4),
  );
  const [result, setResult] = useState<LetterResult | null>(null);
  const [letterHistory, setLetterHistory] = useState<LetterHistoryItem[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedHistoryLetter, setSelectedHistoryLetter] =
    useState<LetterHistoryItem | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    activeAccountRef.current = readActiveAccountId();

    function resetLetterState() {
      setCategory("career");
      setQuestion("");
      setResult(null);
      setLetterHistory([]);
      setHistoryOpen(false);
      setSelectedHistoryLetter(null);
      setLoading(false);
      setNotice("");
    }

    async function hydrateReferenceQuestions(accountId = activeAccountRef.current) {
      try {
        const response = await fetchWithLocalUser("/api/letters/suggestions");

        if (!response.ok || !active || activeAccountRef.current !== accountId) {
          return;
        }

        const data = (await response.json()) as { questions?: string[] };
        const questions = mergeReferenceQuestions(data.questions);

        if (questions.length && active && activeAccountRef.current === accountId) {
          setReferenceQuestions(questions);
        }
      } catch {}
    }

    async function hydrateLetterHistory(accountId = activeAccountRef.current) {
      try {
        const response = await fetchWithLocalUser("/api/letters");

        if (!response.ok || !active || activeAccountRef.current !== accountId) {
          return;
        }

        const data = (await response.json()) as { letters?: LetterHistoryItem[] };

        if (active && activeAccountRef.current === accountId) {
          setLetterHistory(normalizeLetterHistory(data.letters));
        }
      } catch {}
    }

    window.setTimeout(() => {
      if (active) {
        setReferenceQuestions(shuffleQuestions(fallbackQuickQuestions).slice(0, 4));
      }
    }, 0);

    void hydrateReferenceQuestions();
    void hydrateLetterHistory();

    function handleUserCenterChange() {
      const nextAccountId = readActiveAccountId();

      if (nextAccountId === activeAccountRef.current) {
        return;
      }

      activeAccountRef.current = nextAccountId;
      resetLetterState();
      setReferenceQuestions(shuffleQuestions(fallbackQuickQuestions).slice(0, 4));

      if (nextAccountId) {
        void hydrateReferenceQuestions(nextAccountId);
        void hydrateLetterHistory(nextAccountId);
      }
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === USER_CENTER_STORAGE_KEY) {
        handleUserCenterChange();
      }
    }

    window.addEventListener("echoverse:user-center-change", handleUserCenterChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      active = false;
      window.removeEventListener(
        "echoverse:user-center-change",
        handleUserCenterChange,
      );
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  async function generateLetter(value = question) {
    const nextQuestion = value.trim();

    if (!nextQuestion || loading) {
      return;
    }

    setQuestion(nextQuestion);
    setLoading(true);
    setNotice("");
    setResult(null);
    const requestAccountId = activeAccountRef.current || readActiveAccountId();
    activeAccountRef.current = requestAccountId;

    try {
      const response = await fetchWithLocalUser("/api/letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion, category }),
      });
      const data = (await response.json()) as LetterResult & {
        category?: string;
        createdAt?: string;
        error?: string;
        id?: string;
        question?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "这封信暂时没有寄回来。");
      }

      if (activeAccountRef.current !== requestAccountId) {
        return;
      }

      const nextResult = {
        letter: data.letter,
        inner_voice: data.inner_voice ?? {
          title: "你正在听见自己真正想说的话。",
          content:
            data.letter?.split("\n")[0] ??
            "你此刻真正需要的不是立刻解决全部人生，而是先把心里最痛的那一小块看清楚。",
          signals: ["你正在靠近真实的自己"],
        },
        referenced_memories: data.referenced_memories ?? [],
        action: data.action ?? { title: "你今天只做一个能承受的小动作", steps: [] },
      };

      setResult(nextResult);
      setLetterHistory((current) =>
        normalizeLetterHistory([
          {
            ...nextResult,
            id:
              typeof data.id === "string"
                ? data.id
                : `letter-${Date.now()}`,
            question: nextQuestion,
            category: typeof data.category === "string" ? data.category : category,
            createdAt:
              typeof data.createdAt === "string"
                ? data.createdAt
                : new Date().toISOString(),
          },
          ...current,
        ]),
      );
      setNotice("");
    } catch (error) {
      if (activeAccountRef.current !== requestAccountId) {
        return;
      }

      setNotice(
        error instanceof Error
          ? error.message
          : "这封信暂时没有寄回来。请稍后再试一次。",
      );
    } finally {
      if (activeAccountRef.current === requestAccountId) {
        setLoading(false);
      }
    }
  }

  function fillReferenceQuestion(value: string) {
    setQuestion(value);
    requestAnimationFrame(() => {
      questionInputRef.current?.focus();
    });
  }

  function openHistoryLetter(item: LetterHistoryItem) {
    setSelectedHistoryLetter(item);
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        eyebrow="Life Letters"
        title="人生回信"
        description="把想倾诉的话，说给另一个自己听。"
      />

      <div className="grid gap-5 overflow-visible pt-1 xl:h-[769px] xl:grid-cols-[0.95fr_1.28fr_0.82fr] xl:items-stretch">
        <GlassCard className="flex h-[765px] flex-col overflow-hidden p-5 md:p-6 xl:h-[calc(100%-0.25rem)]">
          <div className="flex items-center gap-3">
            <div className="grid size-11 place-items-center rounded-2xl border border-[#D8A7B1]/30 bg-[#D8A7B1]/12 text-[#D8A7B1]">
              <Mail className="size-5" />
            </div>
            <div>
              <h2 className="font-medium text-[#F4EFE7]">寄一封信给TA</h2>
              <p className="mt-1 text-sm text-[#AAB4C3]">
                让每一个困惑都有回响
              </p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-2">
            {categories.map((item) => (
              <button
                key={item.value}
                onClick={() => setCategory(item.value)}
                className={
                  category === item.value
                    ? "rounded-full border border-[#D8B46A]/35 bg-[#D8B46A]/12 px-4 py-2 text-sm text-[#F4EFE7]"
                    : "rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm text-[#AAB4C3] transition hover:border-white/20 hover:text-[#F4EFE7]"
                }
              >
                {item.label}
              </button>
            ))}
          </div>

          <textarea
            ref={questionInputRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="写下你现在最想问自己的问题..."
            className="soft-input mt-6 h-48 min-h-0 w-full resize-none overflow-y-auto rounded-3xl p-4 leading-8"
          />

          <button
            className="premium-button mt-5 w-full"
            onClick={() => generateLetter()}
            disabled={loading}
          >
            {loading ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            生成回信
          </button>

          <div className="mt-6 flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            <div className="shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035]">
              <button
                type="button"
                onClick={() => setHistoryOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-[#F4EFE7] transition hover:bg-white/[0.035]"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <History className="size-4 shrink-0 text-[#D8B46A]" />
                  <span>历史信件</span>
                  <span className="text-xs text-[#AAB4C3]">
                    {letterHistory.length}/10
                  </span>
                </span>
                <ChevronDown
                  className={
                    historyOpen
                      ? "size-4 shrink-0 rotate-180 text-[#D8B46A] transition"
                      : "size-4 shrink-0 text-[#D8B46A] transition"
                  }
                />
              </button>

              <AnimatePresence initial={false}>
                {historyOpen ? (
                  <motion.div
                    key="letter-history"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22 }}
                    className="overflow-hidden border-t border-white/10"
                  >
                    <div className="max-h-44 space-y-2 overflow-y-auto p-3 pr-2">
                      {letterHistory.length > 0 ? (
                        letterHistory.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => openHistoryLetter(item)}
                            className="w-full rounded-2xl border border-white/10 bg-[#080C18]/40 px-3 py-2.5 text-left transition hover:border-[#D8B46A]/35 hover:bg-[#D8B46A]/10"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-xs text-[#D8B46A]">
                                {getCategoryLabel(item.category)}
                              </span>
                              <span className="shrink-0 text-[11px] text-[#6F7787]">
                                {formatLetterDate(item.createdAt)}
                              </span>
                            </div>
                            <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#D9E0EA]">
                              {item.question}
                            </p>
                          </button>
                        ))
                      ) : (
                        <p className="px-1 py-3 text-sm leading-6 text-[#AAB4C3]">
                          还没有历史信件。
                        </p>
                      )}
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
              {referenceQuestions.map((item) => (
                <button
                  key={item}
                  onClick={() => fillReferenceQuestion(item)}
                  className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-left text-sm leading-6 text-[#AAB4C3] transition hover:border-[#D8B46A]/35 hover:text-[#F4EFE7]"
                >
                  <span>{item}</span>
                  <ArrowRight className="size-4 shrink-0 text-[#D8B46A] opacity-0 transition group-hover:opacity-100" />
                </button>
              ))}
            </div>
          </div>
        </GlassCard>

        <GlassCard className="flex h-[765px] flex-col overflow-x-hidden overflow-y-auto p-6 md:p-8 xl:h-[calc(100%-0.25rem)]">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="text-3xl font-serif leading-none text-[#D8B46A]"
            >
              “
            </span>
            <p className={moduleGoldTitleClass}>
              来自平行宇宙的一封回信
            </p>
          </div>
          {loading ? (
            <ResultLoading />
          ) : notice ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-7 text-[#AAB4C3]">
              {notice}
            </p>
          ) : result ? (
            <motion.div
              key={result.letter}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-7 whitespace-pre-wrap text-base leading-9 text-[#D9E0EA]"
            >
              {result.letter}
            </motion.div>
          ) : (
            <p className="mt-7 text-base leading-8 text-[rgba(170,180,195,0.52)]">
              静待一封来信......
            </p>
          )}
        </GlassCard>

        <div className="flex h-[765px] flex-col gap-5 overflow-visible xl:h-[calc(100%-0.25rem)]">
          <GlassCard className="flex min-h-0 flex-[1.08] flex-col overflow-hidden p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[#D8B46A]" />
              <h2 className={moduleGoldTitleClass}>TA听见的心声</h2>
            </div>
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
              {loading ? (
                <ResultLoading compact />
              ) : result ? (
                <>
                  <h3 className="text-lg font-semibold leading-7 text-[#F4EFE7]">
                    {result.inner_voice.title}
                  </h3>
                  <p className="mt-4 text-sm leading-7 text-[#AAB4C3]">
                    {result.inner_voice.content}
                  </p>
                  {result.inner_voice.signals.length > 0 ? (
                    <div className="mt-5 flex flex-wrap gap-2">
                      {result.inner_voice.signals.map((signal) => (
                        <span
                          key={signal}
                          className="rounded-full border border-[#D8B46A]/22 bg-[#D8B46A]/10 px-3 py-1 text-xs text-[#FFF4D8]"
                        >
                          {signal}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          </GlassCard>

          <GlassCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
            <p className={moduleGoldTitleClass}>
              此刻应该怎么走
            </p>
            {loading ? (
              <ResultLoading compact />
            ) : result ? (
              <>
                <h2 className="mt-4 text-xl font-semibold leading-8 text-[#F4EFE7]">
                  {result.action.title}
                </h2>
                <div className="mt-5 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 text-sm text-[#AAB4C3]">
                  {result.action.steps.map((step) => (
                    <div key={step} className="flex items-center gap-3">
                      <span className="size-2 rounded-full bg-[#D8B46A]" />
                      <span>{step}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </GlassCard>
        </div>
      </div>

      <AnimatePresence>
        {selectedHistoryLetter ? (
          <motion.div
            key="letter-history-dialog"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] grid place-items-center bg-[#050812]/62 p-5 backdrop-blur-md"
            onClick={() => setSelectedHistoryLetter(null)}
          >
            <motion.section
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="flex h-[min(760px,calc(100vh-3rem))] w-[min(980px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[1.75rem] border border-white/12 bg-[linear-gradient(135deg,rgba(24,28,48,0.92),rgba(31,24,42,0.9)_52%,rgba(17,32,44,0.86))] shadow-[0_28px_90px_rgba(0,0,0,0.42),0_0_70px_rgba(216,180,106,0.12)] backdrop-blur-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 px-6 py-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full border border-[#D8B46A]/24 bg-[#D8B46A]/10 px-3 py-1 text-xs text-[#FFF4D8]">
                      {getCategoryLabel(selectedHistoryLetter.category)}
                    </span>
                    <span className="text-xs text-[#AAB4C3]">
                      {formatFullLetterDate(selectedHistoryLetter.createdAt)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-xl font-semibold leading-8 text-[#F4EFE7]">
                    历史信件
                  </h3>
                </div>
                <button
                  type="button"
                  aria-label="关闭历史信件"
                  onClick={() => setSelectedHistoryLetter(null)}
                  className="grid size-10 shrink-0 place-items-center rounded-2xl border border-white/10 bg-white/[0.055] text-[#AAB4C3] transition hover:border-[#D8B46A]/35 hover:text-[#D8B46A]"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.78fr)]">
                <div className="flex min-h-0 flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] p-5">
                  <div className="shrink-0 rounded-2xl border border-[#D8B46A]/18 bg-[#D8B46A]/10 px-4 py-3">
                    <p className="text-xs text-[#D8B46A]">寄出的内容</p>
                    <p className="mt-2 text-sm leading-7 text-[#F4EFE7]">
                      {selectedHistoryLetter.question}
                    </p>
                  </div>

                  <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-2">
                    <p className={moduleGoldTitleClass}>
                      来自平行宇宙的一封回信
                    </p>
                    <div className="mt-4 whitespace-pre-wrap text-[15px] leading-8 text-[#D9E0EA]">
                      {selectedHistoryLetter.letter}
                    </div>
                  </div>
                </div>

                <div className="grid min-h-0 grid-rows-[minmax(0,1fr)_minmax(0,0.82fr)] gap-4 overflow-hidden">
                  <div className="min-h-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                    <div className="flex items-center gap-2">
                      <Sparkles className="size-4 text-[#D8B46A]" />
                      <p className={moduleGoldTitleClass}>TA听见的心声</p>
                    </div>
                    <div className="mt-4 min-h-0 max-h-[calc(100%-2rem)] overflow-y-auto pr-1">
                      <h4 className="text-base font-semibold leading-7 text-[#F4EFE7]">
                        {selectedHistoryLetter.inner_voice.title}
                      </h4>
                      <p className="mt-3 text-sm leading-7 text-[#AAB4C3]">
                        {selectedHistoryLetter.inner_voice.content}
                      </p>
                      {selectedHistoryLetter.inner_voice.signals.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {selectedHistoryLetter.inner_voice.signals.map((signal) => (
                            <span
                              key={signal}
                              className="rounded-full border border-[#D8B46A]/22 bg-[#D8B46A]/10 px-3 py-1 text-xs text-[#FFF4D8]"
                            >
                              {signal}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="min-h-0 overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] p-5">
                    <p className={moduleGoldTitleClass}>此刻应该怎么走</p>
                    <h4 className="mt-4 text-base font-semibold leading-7 text-[#F4EFE7]">
                      {selectedHistoryLetter.action.title}
                    </h4>
                    <div className="mt-4 min-h-0 max-h-[calc(100%-4.5rem)] space-y-3 overflow-y-auto pr-1 text-sm text-[#AAB4C3]">
                      {selectedHistoryLetter.action.steps.map((step) => (
                        <div key={step} className="flex items-start gap-3">
                          <span className="mt-2 size-2 shrink-0 rounded-full bg-[#D8B46A]" />
                          <span className="leading-6">{step}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function mergeReferenceQuestions(questions: string[] | undefined) {
  const generated = Array.isArray(questions)
    ? questions.map((item) => item.trim()).filter(Boolean)
    : [];
  const merged = [...generated, ...shuffleQuestions(fallbackQuickQuestions)];
  const unique = Array.from(new Set(merged));

  return unique.slice(0, 4);
}

function normalizeLetterHistory(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): LetterHistoryItem | null => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const source = item as Partial<LetterHistoryItem>;

      if (
        typeof source.letter !== "string" ||
        typeof source.question !== "string" ||
        !source.letter.trim() ||
        !source.question.trim()
      ) {
        return null;
      }

      return {
        id:
          typeof source.id === "string" && source.id
            ? source.id
            : `letter-${source.createdAt ?? source.question}`,
        question: source.question.trim(),
        category:
          typeof source.category === "string" && source.category
            ? source.category
            : "self",
        letter: source.letter,
        inner_voice: {
          title: source.inner_voice?.title ?? "你正在听见自己真正想说的话。",
          content:
            source.inner_voice?.content ??
            "你此刻真正需要的不是立刻解决全部人生，而是先把心里最痛的那一小块看清楚。",
          signals: Array.isArray(source.inner_voice?.signals)
            ? source.inner_voice.signals.filter(
                (signal): signal is string => typeof signal === "string",
              )
            : [],
        },
        referenced_memories: Array.isArray(source.referenced_memories)
          ? source.referenced_memories.filter(
              (memory): memory is string => typeof memory === "string",
            )
          : [],
        action: {
          title: source.action?.title ?? "你今天只做一个能承受的小动作",
          steps: Array.isArray(source.action?.steps)
            ? source.action.steps.filter(
                (step): step is string => typeof step === "string",
              )
            : [],
        },
        createdAt:
          typeof source.createdAt === "string"
            ? source.createdAt
            : new Date().toISOString(),
      };
    })
    .filter((item): item is LetterHistoryItem => Boolean(item))
    .slice(0, 10);
}

function getCategoryLabel(value: string) {
  return categories.find((item) => item.value === value)?.label ?? "自我";
}

function formatLetterDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatFullLetterDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function ResultLoading({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={
        compact
          ? "grid min-h-0 flex-1 place-items-center py-8"
          : "grid min-h-0 flex-1 place-items-center py-12"
      }
    >
      <Loader2
        aria-label="正在生成"
        className="size-7 animate-spin text-[#D8B46A] drop-shadow-[0_0_14px_rgba(216,180,106,0.42)]"
      />
    </div>
  );
}

function readActiveAccountId() {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    const stored = window.sessionStorage.getItem(USER_CENTER_STORAGE_KEY);
    const parsed = stored
      ? (JSON.parse(stored) as { accountId?: unknown; loggedIn?: unknown })
      : {};

    return parsed.loggedIn && typeof parsed.accountId === "string"
      ? parsed.accountId
      : "";
  } catch {
    return "";
  }
}

function shuffleQuestions(questions: string[]) {
  return [...questions].sort(() => Math.random() - 0.5);
}
