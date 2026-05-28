"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Loader2,
  Mail,
  Quote,
  Send,
  Sparkles,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PageHeader } from "@/components/page-header";
import { fetchWithLocalUser } from "@/lib/local-user-client";

const categories = [
  { label: "职业", value: "career" },
  { label: "情绪", value: "emotion" },
  { label: "关系", value: "relationship" },
  { label: "未来", value: "future" },
  { label: "生活", value: "life" },
  { label: "自我", value: "self" },
];

const quickQuestions = [
  "我是不是不适合现在这条路？",
  "我为什么总是想开始，又总是半途而废？",
  "如果我继续现在这样过三年，会怎么样？",
  "我到底要不要换一个方向？",
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

type SavedLetter = LetterResult & {
  category: string;
  question: string;
};

const mockResult: LetterResult = {
  letter:
    "我听见的不是一个简单的选择题，而是一种很深的疲惫：你害怕自己又一次认真开始，然后又在中途失去力气。真正的问题也许不是你适不适合这条路，而是你一直在用一个过大的版本要求自己立刻证明人生。\n\n如果继续旧模式，你会更擅长计划，也更害怕开始。如果改用小实验，你会慢慢得到一种新的证据：自己不是不行，只是需要更小的入口。",
  inner_voice: {
    title: "我真正想确认的是：这一次还能不能相信自己。",
    content:
      "我不是单纯想换方向，我是在害怕：如果我认真开始，会不会又一次被失望击中。我现在需要的不是立刻证明人生，而是先重新拿回一点可以行动的确定感。",
    signals: ["我很疲惫", "我还不甘心", "我害怕再次落空"],
  },
  referenced_memories: ["最近感觉自己不像自己", "容易把问题想得很大", "有一个迟迟没有完成的项目"],
  action: {
    title: "今天只做一个小版本",
    steps: ["打开项目文件", "写下三个最小功能", "完成 README 标题"],
  },
};

export function LettersClient() {
  const [category, setCategory] = useState("career");
  const [question, setQuestion] = useState("");
  const [result, setResult] = useState<LetterResult>(mockResult);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;

    async function hydrateLatestLetter() {
      try {
        const response = await fetchWithLocalUser("/api/letters");

        if (!response.ok || !active) {
          return;
        }

        const data = (await response.json()) as { letters?: SavedLetter[] };
        const latest = data.letters?.[0];

        if (!latest) {
          return;
        }

        setQuestion(latest.question);
        setCategory(latest.category);
        setResult({
          letter: latest.letter,
          inner_voice: latest.inner_voice,
          referenced_memories: latest.referenced_memories,
          action: latest.action,
        });
      } catch {}
    }

    void hydrateLatestLetter();

    return () => {
      active = false;
    };
  }, []);

  async function generateLetter(value = question) {
    const nextQuestion = value.trim();

    if (!nextQuestion || loading) {
      return;
    }

    setQuestion(nextQuestion);
    setLoading(true);
    setNotice("正在根据你的回声档案写下这封回信...");

    try {
      const response = await fetchWithLocalUser("/api/letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: nextQuestion, category }),
      });
      const data = (await response.json()) as LetterResult & { error?: string };

      if (!response.ok) {
        throw new Error(data.error || "这封信暂时没有寄回来。");
      }

      setResult({
        letter: data.letter,
        inner_voice: data.inner_voice ?? {
          title: "我正在听见自己真正想说的话。",
          content:
            data.letter?.split("\n")[0] ??
            "我此刻真正需要的不是立刻解决全部人生，而是先把心里最痛的那一小块看清楚。",
          signals: ["我正在靠近真实的自己"],
        },
        referenced_memories: data.referenced_memories ?? [],
        action: data.action ?? { title: "今天只做一个能承受的小动作", steps: [] },
      });
      setNotice("回信已经抵达。");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "这封信暂时没有寄回来。请稍后再试一次。",
      );
    } finally {
      setLoading(false);
    }
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
                让问题先有一个可以落下来的地方
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

          <div className="mt-7 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
            {quickQuestions.map((item) => (
              <button
                key={item}
                onClick={() => generateLetter(item)}
                className="group flex w-full items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-left text-sm leading-6 text-[#AAB4C3] transition hover:border-[#D8B46A]/35 hover:text-[#F4EFE7]"
              >
                <span>{item}</span>
                <ArrowRight className="size-4 shrink-0 text-[#D8B46A] opacity-0 transition group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </GlassCard>

        <GlassCard className="flex h-[765px] flex-col overflow-x-hidden overflow-y-auto p-6 md:p-8 xl:h-[calc(100%-0.25rem)]">
          <div className="flex items-center gap-3">
            <Quote className="size-5 text-[#D8B46A]" />
            <p className={moduleGoldTitleClass}>
              来自平行宇宙的一封回信
            </p>
          </div>
          {notice ? (
            <p className="mt-5 rounded-2xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm leading-7 text-[#AAB4C3]">
              {notice}
            </p>
          ) : null}
          <motion.div
            key={result.letter}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-7 whitespace-pre-wrap text-base leading-9 text-[#D9E0EA]"
          >
            {result.letter}
          </motion.div>
        </GlassCard>

        <div className="flex h-[765px] flex-col gap-5 overflow-visible xl:h-[calc(100%-0.25rem)]">
          <GlassCard className="flex min-h-0 flex-[1.08] flex-col overflow-hidden p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-[#D8B46A]" />
              <h2 className={moduleGoldTitleClass}>TA听见的心声</h2>
            </div>
            <div className="mt-5 min-h-0 flex-1 overflow-y-auto pr-1">
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
            </div>
          </GlassCard>

          <GlassCard className="flex min-h-0 flex-1 flex-col overflow-hidden p-6">
            <p className={moduleGoldTitleClass}>
              此刻应该怎么走
            </p>
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
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
