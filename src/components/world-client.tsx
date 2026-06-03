"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2,
  Route,
  Send,
  Sparkles,
  SunMedium,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PageHeader } from "@/components/page-header";
import {
  fetchWithLocalUser,
  scopedLocalStorageKey,
} from "@/lib/local-user-client";
import { cn } from "@/lib/utils";

const PERSONA_READY_STORAGE_KEY = "echoverse-persona-ready-v1";
const WISH_STORAGE_KEY = "echoverse-parallel-wish-v2";
const LIFE_RECORD_STORAGE_KEY = "echoverse-parallel-life-records-v1";
const INITIAL_LIFE_RECORD_SUMMARY = "平行世界的回声正式写入";

type WorldState = {
  mood: string;
  scene: string;
  energy: number;
  clarity: number;
  diary: string;
  day_title: string;
  location: string;
  occupation: string;
  event: string;
  happiness: number;
  anxiety: number;
  relationship: number;
  career: number;
  personality_shift: string;
  healing_echo: string;
  next_hint: string;
  timeline: string[];
};

type ParallelWish = {
  message: string;
  sentAt: string;
  reply?: string;
  queuedReply?: string;
  replyAvailableOn?: string;
  repliedAt?: string;
  replyForDayIndex?: number;
};

type LifeRecord = {
  id: string;
  isoDate: string;
  date: string;
  summary: string;
};

type UserMemorySnapshot = {
  memoryDocument?: {
    personaReady?: boolean;
    profileReady?: boolean;
    personaCompletion?: number;
  };
  appState?: Record<string, string>;
};

const mockWorld: WorldState = {
  mood: "平静里带一点紧张",
  scene: "家 / 新租的公寓",
  energy: 62,
  clarity: 57,
  diary:
    "今天，我搬进了一间采光很好的小房子。下午我装好了书架，把最常用的杯子放在触手可及的地方。晚上停了一会儿电，我没有立刻烦躁，只是坐在窗边等灯重新亮起来。那一刻，我忽然觉得，生活不是一下子变好，而是慢慢有了可以落脚的地方。",
  day_title: "把一盏灯安在自己的生活里",
  location: "新租的公寓",
  occupation: "自由项目策划人",
  event: "搬家、安装书架、短暂停电",
  happiness: 68,
  anxiety: 34,
  relationship: 52,
  career: 46,
  personality_shift: "我比昨天更愿意把需求说出口，也更能允许事情慢一点。",
  healing_echo:
    "我也没有把人生一下子过明白。我只是今天把房间里的一盏灯装好了。也许现实中的我此刻也不需要立刻找到答案，只需要先给自己一个可以停下来的地方。",
  next_hint: "明天，我可能会去附近的咖啡店，把新工作的第一个提案写出来。",
  timeline: ["我离开原来的节奏", "我搬进新的房间", "我重新整理职业方向", "我学会稳定地表达需要"],
};

const goldTitleClass =
  "text-[15px] font-medium leading-6 tracking-normal text-[#D8B46A]";

function clampScore(value: number) {
  return Math.min(100, Math.max(1, Math.round(Number(value) || 1)));
}

function formatLifeRecordDate(value: Date) {
  return `${value.getFullYear()}年${value.getMonth() + 1}月${value.getDate()}日`;
}

function createLifeRecordSummary(world: WorldState) {
  return `我今天在${world.location}经历了${world.event}，心情是${world.mood}。`;
}

function getNextLifeRecordDate(records: LifeRecord[]) {
  const lastDate = records.at(-1)?.isoDate;

  if (!lastDate) {
    return new Date();
  }

  const date = new Date(lastDate);

  if (Number.isNaN(date.getTime())) {
    return new Date();
  }

  date.setDate(date.getDate() + 1);
  return date;
}

function createLifeRecord(world: WorldState, records: LifeRecord[]) {
  const date = getNextLifeRecordDate(records);

  return {
    id: `${date.toISOString()}-${records.length}`,
    isoDate: date.toISOString(),
    date: formatLifeRecordDate(date),
    summary: createLifeRecordSummary(world),
  };
}

function createInitialLifeRecord() {
  const date = new Date();

  return {
    id: `initial-${date.toISOString()}`,
    isoDate: date.toISOString(),
    date: formatLifeRecordDate(date),
    summary: INITIAL_LIFE_RECORD_SUMMARY,
  };
}

function normalizeLifeRecords(records: LifeRecord[]) {
  const durableRecords = records.filter(
    (record) => !record.id.startsWith("preview-"),
  );

  if (durableRecords.length === 0) {
    return [createInitialLifeRecord()];
  }

  return durableRecords.map((record, index) => {
    const parsedDate = new Date(record.isoDate);
    const date = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

    return {
      ...record,
      id: record.id || `${date.toISOString()}-${index}`,
      isoDate: date.toISOString(),
      date: formatLifeRecordDate(date),
      summary: index === 0 ? INITIAL_LIFE_RECORD_SUMMARY : record.summary,
    };
  });
}

function compactStatusKeywords(value: string, maxItems = 3) {
  const normalized = value
    .replace(/^我今天在/, "")
    .replace(/^今天/, "")
    .replace(/经历了/g, "")
    .replace(/心情是/g, "")
    .replace(/当前/g, "")
    .replace(/主要所在/g, "")
    .replace(/有一点/g, "")
    .trim();
  const parts = normalized
    .split(/[，,、/／|；;。.!！?？]|以及|并且|同时|正在|开始|完成|收到|准备|经历|和|与|但|却/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => (item.length > 12 ? item.slice(0, 12) : item))
    .filter(Boolean);
  const keywords = parts.length > 0 ? parts : [normalized.slice(0, 10)];

  return Array.from(new Set(keywords)).slice(0, maxItems).join(" / ");
}

function normalizeWorldData(data: Partial<WorldState>, current: WorldState) {
  return {
    mood: compactStatusKeywords(data.mood?.trim() || current.mood, 2),
    scene: data.scene?.trim() || current.scene,
    energy: clampScore(data.energy ?? current.energy),
    clarity: clampScore(data.clarity ?? current.clarity),
    diary: data.diary?.trim() || current.diary,
    day_title: data.day_title?.trim() || current.day_title,
    location: compactStatusKeywords(data.location?.trim() || current.location, 3),
    occupation: compactStatusKeywords(
      data.occupation?.trim() || current.occupation,
      3,
    ),
    event: compactStatusKeywords(data.event?.trim() || current.event, 3),
    happiness: clampScore(data.happiness ?? current.happiness),
    anxiety: clampScore(data.anxiety ?? current.anxiety),
    relationship: clampScore(data.relationship ?? current.relationship),
    career: clampScore(data.career ?? current.career),
    personality_shift:
      data.personality_shift?.trim() || current.personality_shift,
    healing_echo: data.healing_echo?.trim() || current.healing_echo,
    next_hint: data.next_hint?.trim() || current.next_hint,
    timeline:
      Array.isArray(data.timeline) && data.timeline.length > 0
        ? data.timeline.filter((item) => typeof item === "string")
        : current.timeline,
  };
}

export function WorldClient() {
  const [world, setWorld] = useState<WorldState | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [wishInput, setWishInput] = useState("");
  const [wish, setWish] = useState<ParallelWish | null>(null);
  const [personaReady, setPersonaReady] = useState(false);
  const [profileChecked, setProfileChecked] = useState(false);
  const [remoteLifeRecords, setRemoteLifeRecords] = useState<LifeRecord[] | null>(null);
  const [remoteWish, setRemoteWish] = useState<ParallelWish | null>(null);
  const [lifeRecordOpen, setLifeRecordOpen] = useState(false);
  const [lifeRecords, setLifeRecords] = useState<LifeRecord[]>([]);
  const personaReadyStorageKey = scopedLocalStorageKey(PERSONA_READY_STORAGE_KEY);
  const wishStorageKey = scopedLocalStorageKey(WISH_STORAGE_KEY);
  const lifeRecordStorageKey = scopedLocalStorageKey(LIFE_RECORD_STORAGE_KEY);

  useEffect(() => {
    let active = true;

    async function checkPersonaReady() {
      const localReady =
        window.localStorage.getItem(personaReadyStorageKey) === "true";
      let nextReady = false;
      let nextRemoteRecords: LifeRecord[] | null = null;
      let nextRemoteWish: ParallelWish | null = null;
      let nextRemoteWorld: WorldState | null = null;

      try {
        const response = await fetchWithLocalUser("/api/user-memory");

        if (response.ok) {
          const data = (await response.json()) as UserMemorySnapshot;
          const remoteReady = Boolean(data.memoryDocument?.profileReady);
          const remoteRecords = data.appState?.["parallel_world.life_records"];
          const remoteWishData = data.appState?.["parallel_world.wish"];
          const remoteWorldData = data.appState?.["parallel_world.latest"];
          const remoteLifeScriptData = data.appState?.["parallel_world.life_script"];

          if (remoteRecords) {
            try {
              const parsed = JSON.parse(remoteRecords) as LifeRecord[];

              nextRemoteRecords = Array.isArray(parsed) ? parsed : null;
            } catch {
              nextRemoteRecords = null;
            }
          }

          if (remoteWishData) {
            try {
              const parsed = JSON.parse(remoteWishData) as ParallelWish;

              nextRemoteWish =
                typeof parsed.message === "string" &&
                typeof parsed.sentAt === "string"
                  ? parsed
                  : null;
            } catch {
              nextRemoteWish = null;
            }
          }

          if (remoteWorldData) {
            try {
              nextRemoteWorld = normalizeWorldData(
                JSON.parse(remoteWorldData) as Partial<WorldState>,
                mockWorld,
              );
            } catch {
              nextRemoteWorld = null;
            }
          }

          if (remoteReady && !remoteLifeScriptData) {
            await fetchWithLocalUser("/api/world/script", { method: "POST" });
          }

          nextReady = remoteReady;
        }
      } catch {
        nextReady = localReady;
      }

      if (!active) {
        return;
      }

      window.setTimeout(() => {
        setPersonaReady(nextReady);
        setRemoteLifeRecords(nextRemoteRecords);
        setRemoteWish(nextRemoteWish);
        if (nextReady && nextRemoteWorld) {
          setWorld(nextRemoteWorld);
        }
        setProfileChecked(true);
      }, 0);
    }

    void checkPersonaReady();

    return () => {
      active = false;
    };
  }, [personaReadyStorageKey]);

  useEffect(() => {
    if (remoteWish) {
      window.setTimeout(() => setWish(remoteWish), 0);
      window.localStorage.setItem(wishStorageKey, JSON.stringify(remoteWish));
      return;
    }

    const savedWish = window.localStorage.getItem(wishStorageKey);

    if (!savedWish) {
      return;
    }

    try {
      const parsed = JSON.parse(savedWish) as ParallelWish;

      if (typeof parsed.message === "string" && typeof parsed.sentAt === "string") {
        window.setTimeout(() => setWish(parsed), 0);
      }
    } catch {
      window.localStorage.removeItem(wishStorageKey);
    }
  }, [remoteWish, wishStorageKey]);

  useEffect(() => {
    const commitRecords = (records: LifeRecord[]) => {
      window.setTimeout(() => setLifeRecords(records), 0);
    };
    const persistRecords = (records: LifeRecord[]) => {
      window.localStorage.setItem(lifeRecordStorageKey, JSON.stringify(records));
      void fetchWithLocalUser("/api/user-memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          appState: {
            "parallel_world.life_records": records,
          },
        }),
      });
    };

    if (!profileChecked) {
      return;
    }

    if (!personaReady) {
      commitRecords([]);
      return;
    }

    const remoteRecords = remoteLifeRecords
      ? normalizeLifeRecords(remoteLifeRecords)
      : null;

    if (remoteRecords) {
      commitRecords(remoteRecords);
      persistRecords(remoteRecords);
      return;
    }

    const savedRecords = window.localStorage.getItem(lifeRecordStorageKey);

    if (!savedRecords) {
      const initialRecords = [createInitialLifeRecord()];

      commitRecords(initialRecords);
      persistRecords(initialRecords);
      return;
    }

    try {
      const parsed = JSON.parse(savedRecords) as LifeRecord[];
      const records = Array.isArray(parsed)
        ? parsed.filter(
            (record) =>
              typeof record.id === "string" &&
              typeof record.isoDate === "string" &&
              typeof record.date === "string" &&
              typeof record.summary === "string",
          )
        : [];
      const nextRecords = normalizeLifeRecords(records);

      commitRecords(nextRecords);
      persistRecords(nextRecords);
    } catch {
      const initialRecords = [createInitialLifeRecord()];

      commitRecords(initialRecords);
      persistRecords(initialRecords);
    }
  }, [lifeRecordStorageKey, personaReady, profileChecked, remoteLifeRecords]);

  async function generateWorldDiary() {
    if (!personaReady || loading) {
      return;
    }

    setLoading(true);
    setNotice("正在查看TA今天的日常...");

    try {
      const response = await fetchWithLocalUser("/api/world/diary", {
        method: "POST",
      });
      const data = (await response.json()) as Partial<WorldState> & {
        error?: string;
        parallel_wish?: ParallelWish | null;
      };

      if (!response.ok) {
        throw new Error(data.error || "平行宇宙暂时没有传回清晰画面。");
      }

      const nextWorld = normalizeWorldData(data, world ?? mockWorld);

      setWorld(nextWorld);
      if (data.parallel_wish) {
        setWish(data.parallel_wish);
        window.localStorage.setItem(
          wishStorageKey,
          JSON.stringify(data.parallel_wish),
        );
      }
      setLifeRecords((current) => {
        const baseRecords =
          current.length > 0 ? normalizeLifeRecords(current) : [createInitialLifeRecord()];
        const nextRecords = [
          ...baseRecords,
          createLifeRecord(nextWorld, baseRecords),
        ].slice(-60);

        window.localStorage.setItem(lifeRecordStorageKey, JSON.stringify(nextRecords));
        void fetchWithLocalUser("/api/user-memory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            worldReady: true,
            currentModule: "world",
            appState: {
              "parallel_world.life_records": nextRecords,
            },
          }),
        });
        return nextRecords;
      });
      setNotice("TA的今日生活已经更新。");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "平行宇宙刚刚没有传回清晰画面。",
      );
    } finally {
      setLoading(false);
    }
  }

  const hasWorldDiary = personaReady && world !== null;
  const statusItems = [
    ["心情", hasWorldDiary ? world.mood : ""],
    ["职业", hasWorldDiary ? world.occupation : ""],
    ["地点", hasWorldDiary ? world.location : ""],
    ["事件", hasWorldDiary ? world.event : ""],
  ];
  const stats: Array<[string, number | null]> = [
    ["开心度", hasWorldDiary ? world.happiness : null],
    ["焦虑值", hasWorldDiary ? world.anxiety : null],
    ["关系温度", hasWorldDiary ? world.relationship : null],
    ["职业推进", hasWorldDiary ? world.career : null],
  ];

  function sendWish() {
    if (!hasWorldDiary) {
      return;
    }

    const message = wishInput.trim();

    if (!message) {
      return;
    }

    const nextWish = {
      message,
      sentAt: new Date().toISOString(),
    };

    setWish(nextWish);
    setWishInput("");
    window.localStorage.setItem(wishStorageKey, JSON.stringify(nextWish));
    void fetchWithLocalUser("/api/world/wish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message,
        sentAt: nextWish.sentAt,
      }),
    })
      .then(async (response) => {
        const data = (await response.json()) as {
          wish?: ParallelWish;
          error?: string;
        };

        if (!response.ok) {
          throw new Error(data.error || "寄语刚刚没有送达。");
        }

        if (data.wish) {
          setWish(data.wish);
          window.localStorage.setItem(wishStorageKey, JSON.stringify(data.wish));
        }
      })
      .catch(() => {
        void fetchWithLocalUser("/api/user-memory", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appState: {
              "parallel_world.wish": nextWish,
            },
          }),
        });
      });
  }

  const displayWish = personaReady ? wish : null;
  const isWishPending = Boolean(displayWish && !displayWish.reply);
  const canWriteWish = hasWorldDiary && !isWishPending;

  return (
    <div className="mx-auto flex h-[calc(100vh-12.25rem)] min-h-0 w-full max-w-7xl flex-col overflow-visible">
      <PageHeader
        eyebrow="Parallel World Lite"
        title="平行小世界"
        description="我在平行宇宙里好好生活"
        className="shrink-0"
      />

      <div className="relative left-1/2 min-h-0 w-[min(1680px,calc(100vw-7rem))] flex-1 -translate-x-1/2 overflow-visible pt-1">
        <LifeRecordSidebar
          open={lifeRecordOpen}
          onToggle={() => setLifeRecordOpen((open) => !open)}
          records={lifeRecords}
        />
        <motion.div
          animate={{ x: lifeRecordOpen ? 368 : 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="grid h-[calc(100%-0.25rem)] min-h-0 gap-4 overflow-visible xl:grid-cols-[minmax(0,1.36fr)_minmax(320px,0.82fr)_minmax(320px,0.82fr)]"
        >
        <GlassCard className="flex h-full flex-col overflow-hidden p-3">
          <div className={loading ? "parallel-life-scene min-h-0 flex-1 scene-awake" : "parallel-life-scene min-h-0 flex-1"}>
            <div className="parallel-window">
              <div className="parallel-sky" />
              <div className="parallel-building parallel-building-a" />
              <div className="parallel-building parallel-building-b" />
            </div>
            <div className="parallel-floor" />
            <div className="parallel-rug" />
            <div className="parallel-sofa" />
            <div className="parallel-desk" />
            <div className="parallel-lamp" />
            <div className="parallel-shelf">
              <span />
              <span />
              <span />
            </div>
            <div className="parallel-box parallel-box-a" />
            <div className="parallel-box parallel-box-b" />
            <div className="parallel-person" />
            <div className="parallel-scene-preview-image" aria-hidden="true" />
            <div className="absolute left-6 top-6 z-[2] rounded-full border border-white/10 bg-[#080C18]/55 px-4 py-2 text-sm text-[#D9E0EA] backdrop-blur-xl">
              场景展示窗口{hasWorldDiary ? `：${world.scene}` : ""}
            </div>
          </div>
          <motion.div
            key={hasWorldDiary ? `${world.day_title}-${world.diary}` : "empty-world-diary"}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 shrink-0 rounded-3xl border border-white/10 bg-[#080C18]/62 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl"
          >
            <p className={goldTitleClass}>TA的今日生活</p>
            {hasWorldDiary ? (
              <>
                <h2 className="mt-2 text-xl font-semibold leading-8 text-[#F4EFE7]">
                  {world.day_title}
                </h2>
                <p className="mt-2 line-clamp-3 max-w-3xl text-[15px] leading-7 text-[#D9E0EA]">
                  {world.diary}
                </p>
              </>
            ) : (
              <div className="mt-2 h-[7.75rem]" />
            )}
          </motion.div>
        </GlassCard>

        <div className="grid h-full min-h-0 grid-rows-[minmax(0,1.16fr)_minmax(0,0.84fr)] gap-4">
          <GlassCard className="flex min-h-0 flex-col overflow-hidden p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-2xl border border-[#8FB8D8]/30 bg-[#8FB8D8]/12 text-[#8FB8D8]">
                  <SunMedium className="size-4" />
                </div>
                <div className="min-w-0">
                  <h2 className={goldTitleClass}>TA的今日状态</h2>
                  <p className="mt-1 line-clamp-1 text-sm text-[#AAB4C3]">
                    {hasWorldDiary ? notice : ""}
                  </p>
                </div>
              </div>
              <button
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-[linear-gradient(135deg,#D8B46A,#D8A7B1)] px-3.5 text-xs font-semibold text-[#17101c] shadow-[0_12px_34px_rgba(216,180,106,0.18)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={generateWorldDiary}
                disabled={!personaReady || loading}
              >
                {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                查看TA的日常
              </button>
            </div>

            <div className="mt-4 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,0.92fr)] gap-3">
              <div className="grid min-h-0 grid-cols-2 gap-2">
                {statusItems.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex min-h-0 flex-col justify-center rounded-2xl border border-white/10 bg-white/[0.045] p-3"
                  >
                    <p className="text-xs text-[#AAB4C3]">{label}</p>
                    <p className="mt-1 line-clamp-2 text-[13px] font-semibold leading-5 text-[#F4EFE7]">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid min-h-0 grid-cols-2 gap-2">
                {stats.map(([label, value]) => (
                  <div
                    key={label}
                    className="flex min-h-0 flex-col justify-center rounded-2xl border border-white/10 bg-white/[0.04] p-3"
                  >
                    <div className="flex items-center justify-between text-xs text-[#AAB4C3]">
                      <span>{label}</span>
                      <span className="text-[#F4EFE7]">{value ?? ""}</span>
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
                      {value !== null ? (
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${value}%` }}
                          transition={{ duration: 0.5 }}
                          className="h-full rounded-full bg-[linear-gradient(90deg,#8FB8D8,#D8B46A,#D8A7B1)]"
                        />
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          </GlassCard>

          <GlassCard className="flex min-h-0 flex-col overflow-hidden p-4">
            <p className={goldTitleClass}>TA的今日回声</p>
            <div className="mt-3 flex min-h-0 flex-1 items-center rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <p className="line-clamp-3 text-sm leading-6 text-[#D9E0EA]">
                {hasWorldDiary ? world.healing_echo : ""}
              </p>
            </div>
            <div className="mt-3 shrink-0 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
              <p className="text-xs text-[#AAB4C3]">明天的计划</p>
              <p className="mt-1.5 line-clamp-2 text-sm leading-5 text-[#F4EFE7]">
                {hasWorldDiary ? world.next_hint : ""}
              </p>
            </div>
          </GlassCard>
        </div>

        <div className="grid h-full min-h-0 grid-rows-[minmax(0,1.06fr)_minmax(0,0.94fr)] gap-4">
        <GlassCard className="flex min-h-0 flex-col overflow-hidden p-4">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl border border-white/12 bg-white/[0.055] text-[#D8B46A]">
              <Route className="size-4" />
            </div>
            <div>
              <h2 className={goldTitleClass}>TA的生活轨迹</h2>
              <p className="mt-1 text-sm text-[#AAB4C3]">
                {hasWorldDiary ? "分叉之后，我正在形成新的经历" : ""}
              </p>
            </div>
          </div>
          <div className="mt-4 min-h-0 flex-1 space-y-1.5">
            {(hasWorldDiary ? world.timeline : []).map((item, index, timeline) => (
              <div key={`${item}-${index}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="grid size-7 place-items-center rounded-full border border-[#D8B46A]/35 bg-[#D8B46A]/12 text-xs text-[#FFF4D8]">
                    {index + 1}
                  </span>
                  {index < timeline.length - 1 ? (
                    <span className="h-4 w-px bg-white/10" />
                  ) : null}
                </div>
                <p className="line-clamp-2 pt-0.5 text-sm leading-6 text-[#D9E0EA]">{item}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.045] p-3">
            <p className="text-xs text-[#AAB4C3]">我的变化</p>
            <p className="mt-2 line-clamp-2 text-sm leading-6 text-[#F4EFE7]">
              {hasWorldDiary ? world.personality_shift : ""}
            </p>
          </div>
        </GlassCard>

        <GlassCard className="flex min-h-0 flex-col overflow-hidden p-4">
          <p className={goldTitleClass}>写下你的寄语</p>
          <div className="mt-3 grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_minmax(0,0.86fr)] gap-3">
            <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.035] p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-[#AAB4C3]">你想对TA说：</p>
                {isWishPending ? (
                  <span className="rounded-full border border-[#D8B46A]/20 bg-[#D8B46A]/10 px-2 py-0.5 text-[11px] text-[#FFF4D8]">
                    已寄出
                  </span>
                ) : null}
              </div>
              {isWishPending && displayWish ? (
                <div className="mt-2 flex min-h-0 flex-1 items-center rounded-2xl border border-[#D8B46A]/18 bg-[#D8B46A]/10 px-3 py-2">
                  <p className="line-clamp-2 text-sm leading-6 text-[#FFF4D8]">
                    {displayWish.message}
                  </p>
                </div>
              ) : (
                <div className="mt-2 flex min-h-0 flex-1 items-end gap-2 rounded-2xl border border-white/10 bg-[#080C18]/58 p-2">
                  <textarea
                    value={wishInput}
                    onChange={(event) => setWishInput(event.target.value)}
                    placeholder={canWriteWish ? "对平行宇宙的你说点什么吧" : ""}
                    disabled={!canWriteWish}
                    className="min-h-0 flex-1 resize-none bg-transparent px-2 py-1 text-sm leading-6 text-[#F4EFE7] outline-none placeholder:text-[#6F7787]"
                  />
                  <button
                    type="button"
                    aria-label="发送寄语"
                    title="发送寄语"
                    onClick={sendWish}
                    disabled={!canWriteWish || !wishInput.trim()}
                    className="grid size-9 shrink-0 place-items-center rounded-xl border border-[#D8B46A]/25 bg-[#D8B46A]/12 text-[#D8B46A] transition hover:border-[#D8B46A]/45 hover:bg-[#D8B46A]/18 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Send className="size-4" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-xs text-[#AAB4C3]">TA的回复</p>
              <div className="mt-2 flex min-h-0 flex-1 items-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <p className="line-clamp-2 text-sm leading-6 text-[#D9E0EA]">
                  {displayWish?.reply ??
                    (displayWish
                      ? "请明天查看TA的回复"
                      : hasWorldDiary
                        ? "寄出一句话后，明天这里会出现TA的回应。"
                        : "")}
                </p>
              </div>
            </div>
          </div>
        </GlassCard>
        </div>
        </motion.div>
      </div>
    </div>
  );
}

function LifeRecordSidebar({
  open,
  onToggle,
  records,
}: {
  open: boolean;
  onToggle: () => void;
  records: LifeRecord[];
}) {
  return (
    <div className="pointer-events-none absolute -left-32 bottom-0 top-1 z-40 hidden xl:block">
      <div className="relative h-full w-[392px]">
        <div className="absolute left-5 top-0 z-30 h-[calc(50%-5rem)] w-px bg-[linear-gradient(180deg,transparent,rgba(216,180,106,0.56))] shadow-[0_0_12px_rgba(216,180,106,0.18)]" />
        <div className="absolute bottom-0 left-5 top-[calc(50%+5rem)] z-30 w-px bg-[linear-gradient(180deg,rgba(216,167,177,0.36),transparent)] shadow-[0_0_12px_rgba(216,180,106,0.18)]" />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="pointer-events-auto absolute left-5 top-1/2 z-20 flex h-40 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#D8B46A]/45 bg-[linear-gradient(135deg,#D8B46A,#D8A7B1)] text-[12px] font-semibold tracking-normal text-[#17101c] shadow-[0_14px_34px_rgba(216,180,106,0.2),0_0_34px_rgba(216,167,177,0.14)] backdrop-blur-2xl transition hover:brightness-110"
        >
          <span className="flex flex-col items-center justify-center gap-0.5 leading-none">
            <span className="inline-block w-3 scale-y-125 text-center text-[10px] leading-none">
              TA
            </span>
            {"的生活记录".split("").map((char) => (
              <span key={char} className="w-[1em] text-center">
                {char}
              </span>
            ))}
          </span>
        </button>

        <motion.aside
          initial={false}
          animate={{ width: open ? 350 : 0, opacity: open ? 1 : 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-auto absolute bottom-0 left-5 top-0 z-10 overflow-hidden rounded-r-[1.75rem] border-y border-r border-white/12 bg-[linear-gradient(135deg,rgba(24,28,48,0.9),rgba(31,24,42,0.86)_54%,rgba(17,32,44,0.82))] shadow-[0_24px_80px_rgba(0,0,0,0.32),0_0_70px_rgba(216,180,106,0.1)] backdrop-blur-2xl"
        >
          <div className="flex h-full w-[350px] flex-col p-5 pl-8">
            <p className={goldTitleClass}>TA的生活记录</p>
            <p className="mt-2 text-xs leading-5 text-[#6F7787]">
              每次查看TA的日常，都会在这里留下一个新的分支。
            </p>
            <div className="mt-2 -ml-4 min-h-0 flex-1 overflow-y-auto pl-4 pr-2 pt-3 [scrollbar-color:rgba(216,180,106,0.36)_transparent] [scrollbar-width:thin]">
              <div className="relative min-h-full pb-3">
                <div className="absolute bottom-0 left-1.5 top-1 w-px bg-[#F4EFE7]/22" />
                <div className="absolute bottom-0 left-1.5 top-1 w-px bg-gradient-to-b from-[#D8B46A] via-[#D8A7B1] to-[#8FB8D8] shadow-[0_0_18px_rgba(216,180,106,0.35)]" />
                <div className="grid auto-rows-[5rem] gap-5">
                  {records.map((record) => (
                    <div
                      key={record.id}
                      aria-label={`${record.date} ${record.summary}`}
                      className="relative flex min-h-0 items-start"
                    >
                      <div
                        className={cn(
                          "relative z-10 mt-1 size-3 shrink-0 rounded-full border transition duration-300",
                          "border-[#FFF4D8] bg-[#D8B46A] shadow-[0_0_18px_rgba(216,180,106,0.65),0_0_34px_rgba(216,167,177,0.22)]",
                        )}
                      />
                      <div
                        className={cn(
                          "mt-[10px] h-px w-11 shrink-0 rounded-full transition duration-300",
                          "bg-[#D8B46A] shadow-[0_0_14px_rgba(216,180,106,0.7)]",
                        )}
                      />
                      <div className="ml-3 min-w-0">
                        <p
                          className={cn(
                            "whitespace-nowrap text-sm font-semibold leading-5 tracking-normal text-[#FFF4D8] transition duration-300",
                            "drop-shadow-[0_0_7px_rgba(216,180,106,0.5)]",
                          )}
                        >
                          {record.date}
                        </p>
                        <p
                          className={cn(
                            "mt-1 line-clamp-2 text-xs font-medium leading-5 text-[#F3D48A] transition duration-300",
                            "drop-shadow-[0_0_6px_rgba(216,180,106,0.45)]",
                          )}
                        >
                          {record.summary}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </motion.aside>
      </div>
    </div>
  );
}
