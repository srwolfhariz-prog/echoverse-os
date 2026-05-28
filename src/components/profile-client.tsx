"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Archive,
  Download,
  FileText,
  Loader2,
  Pencil,
  RefreshCw,
  Save,
} from "lucide-react";
import { GlassCard } from "@/components/glass-card";
import { PageHeader } from "@/components/page-header";
import { profileSections } from "@/lib/constants";
import { fetchWithLocalUser } from "@/lib/local-user-client";

type ProfileDocument = {
  id: string;
  section: string;
  title: string;
  content: string;
  updatedAt: string;
};

const pendingProfileMessage =
  "当回声人格构建完成，你的虚拟人格会被安放于此...";

export function ProfileClient() {
  const [documents, setDocuments] = useState<ProfileDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string>(
    profileSections[0].section,
  );
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");

  const documentMap = useMemo(
    () => new Map(documents.map((document) => [document.section, document])),
    [documents],
  );

  useEffect(() => {
    let active = true;

    async function run() {
      try {
        const response = await fetchWithLocalUser("/api/profile");
        const data = (await response.json()) as { sections?: ProfileDocument[] };

        if (active) {
          setDocuments(data.sections ?? []);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void run();

    return () => {
      active = false;
    };
  }, []);

  async function generateProfile() {
    setGenerating(true);
    setNotice("正在把你的记忆整理成回声档案...");

    try {
      const response = await fetchWithLocalUser("/api/profile/generate", {
        method: "POST",
      });
      const data = (await response.json()) as {
        sections?: ProfileDocument[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(data.error || "档案暂时没有形成。");
      }

      setDocuments(data.sections ?? []);
      setNotice("回声档案已经更新。");
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : "这些记忆暂时没能被整理成档案。",
      );
    } finally {
      setGenerating(false);
    }
  }

  async function saveSection(section: string, title: string) {
    const content = drafts[section] ?? documentMap.get(section)?.content ?? "";
    setNotice("正在保存这一节...");

    const response = await fetchWithLocalUser("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section, title, content }),
    });
    const data = (await response.json()) as {
      section?: ProfileDocument;
      error?: string;
    };

    if (response.ok && data.section) {
      setDocuments((current) => {
        const rest = current.filter((document) => document.section !== section);
        return [...rest, data.section!];
      });
      setEditing(null);
      setNotice("这一节已经保存。");
      return;
    }

    setNotice(data.error || "保存失败，请稍后再试。");
  }

  async function exportProfile() {
    if (!hasProfileArchive || exporting) {
      return;
    }

    setExporting(true);
    setNotice("正在整合回声档案...");

    try {
      const response = await fetchWithLocalUser("/api/export/profile");

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };

        throw new Error(data.error || "回声档案暂时无法导出。");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "echo-profile.doc";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("回声档案已经整合并开始下载。");
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "回声档案暂时无法导出。",
      );
    } finally {
      setExporting(false);
    }
  }

  function renderDocumentContent(content: string) {
    return content.split("\n").map((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return <div key={index} className="h-4" />;
      }

      if (trimmed === "---") {
        return <div key={index} className="my-6 h-px bg-white/10" />;
      }

      if (trimmed.startsWith("## ")) {
        return (
          <h4
            key={index}
            className="mt-7 first:mt-0 text-xl font-semibold text-[#F4EFE7]"
          >
            {trimmed.slice(3)}
          </h4>
        );
      }

      if (trimmed.startsWith("### ")) {
        return (
          <h5
            key={index}
            className="mt-5 text-base font-semibold text-[#FFF4D8]"
          >
            {trimmed.slice(4)}
          </h5>
        );
      }

      if (trimmed.startsWith("- ")) {
        return (
          <p
            key={index}
            className="relative pl-5 text-[15px] leading-8 text-[#AAB4C3] before:absolute before:left-0 before:top-[0.85em] before:size-1.5 before:rounded-full before:bg-[#D8B46A]/70"
          >
            {trimmed.slice(2)}
          </p>
        );
      }

      if (/^\d+\.\s/.test(trimmed)) {
        return (
          <p key={index} className="text-[15px] leading-8 text-[#AAB4C3]">
            {trimmed}
          </p>
        );
      }

      return (
        <p key={index} className="text-[15px] leading-8 text-[#AAB4C3]">
          {trimmed}
        </p>
      );
    });
  }

  const hasDocuments = documents.length > 0;
  const hasProfileArchive = profileSections.every((section) =>
    documentMap.get(section.section)?.content.trim(),
  );
  const selectedProfileSection =
    profileSections.find((section) => section.section === selectedSection) ??
    profileSections[0];
  const selectedDocument = documentMap.get(selectedProfileSection.section);
  const selectedContent =
    drafts[selectedProfileSection.section] ??
    selectedDocument?.content ??
    pendingProfileMessage;
  const selectedIsEditing = editing === selectedProfileSection.section;

  return (
    <div className="mx-auto flex h-[calc(100vh-10.5rem)] min-h-[660px] w-full max-w-7xl flex-col overflow-hidden">
      <PageHeader
        eyebrow="Echo Profile"
        title="回声档案"
        description="把潜意识里最真实的自己安放在这里，也可以导出用作其他。"
        className="shrink-0"
      >
        {hasDocuments ? (
          <button
            className="ghost-button"
            onClick={generateProfile}
            disabled={generating}
          >
            <RefreshCw className={generating ? "size-4 animate-spin" : "size-4"} />
            重新生成
          </button>
        ) : null}
        <button
          className="ghost-button"
          onClick={exportProfile}
          disabled={!hasProfileArchive || exporting}
        >
          {exporting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Download className="size-4" />
          )}
          导出回声档案
        </button>
      </PageHeader>

      <div className="grid min-h-0 flex-1 gap-5 overflow-visible lg:grid-cols-[300px_minmax(0,1fr)]">
        <GlassCard className="min-h-0 overflow-hidden p-5">
          <div className="flex items-center gap-3 border-b border-white/10 pb-5">
            <div className="grid size-11 place-items-center rounded-2xl border border-white/12 bg-white/[0.055] text-[#D8B46A]">
              <FileText className="size-5" />
            </div>
            <div>
              <h2 className="font-medium text-[#F4EFE7]">档案目录</h2>
              <p className="mt-1 text-sm text-[#AAB4C3]">Soul Document</p>
            </div>
          </div>

          <div className="mt-5 grid gap-2 overflow-y-auto pr-1">
            {profileSections.map((section) => {
              const active = selectedProfileSection.section === section.section;

              return (
              <button
                key={section.section}
                type="button"
                onClick={() => setSelectedSection(section.section)}
                className={
                  active
                    ? "rounded-2xl border border-[#D8B46A]/35 bg-[#D8B46A]/12 px-4 py-3 text-left text-sm text-[#F4EFE7]"
                    : "rounded-2xl border border-transparent px-4 py-3 text-left text-sm text-[#AAB4C3] transition hover:border-white/10 hover:bg-white/[0.045] hover:text-[#F4EFE7]"
                }
              >
                {section.title}
              </button>
              );
            })}
          </div>
        </GlassCard>

        <div className="min-h-0 overflow-visible">
          {notice ? (
            <GlassCard className="mb-5 shrink-0 p-5">
              <p className="text-sm leading-7 text-[#AAB4C3]">{notice}</p>
            </GlassCard>
          ) : null}

          {loading ? (
            <GlassCard className="h-full p-8">
              <div className="flex items-center gap-3 text-[#AAB4C3]">
                <Loader2 className="size-5 animate-spin text-[#D8B46A]" />
                正在打开你的数字记忆库...
              </div>
            </GlassCard>
          ) : null}

          {!loading ? (
            <motion.section
              key={selectedProfileSection.section}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.24 }}
              className={notice ? "h-[calc(100%-5.75rem)]" : "h-full"}
            >
              <GlassCard className="flex h-full min-h-0 flex-col p-6 md:p-7">
                <div className="flex shrink-0 flex-col gap-4 border-b border-white/10 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs uppercase tracking-[0.22em] text-[#D8B46A]">
                      {selectedProfileSection.section}
                    </p>
                    <h3 className="mt-3 text-2xl font-semibold text-[#F4EFE7]">
                      {selectedDocument?.title ?? selectedProfileSection.title}
                    </h3>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      className="grid size-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.055] text-[#AAB4C3] transition hover:border-[#D8B46A]/35 hover:text-[#D8B46A]"
                      onClick={() => {
                        setEditing(selectedProfileSection.section);
                        setDrafts((current) => ({
                          ...current,
                          [selectedProfileSection.section]: selectedContent,
                        }));
                      }}
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      className="grid size-10 place-items-center rounded-2xl border border-white/10 bg-white/[0.055] text-[#AAB4C3] transition hover:border-[#D8B46A]/35 hover:text-[#D8B46A]"
                      onClick={() =>
                        saveSection(
                          selectedProfileSection.section,
                          selectedProfileSection.title,
                        )
                      }
                    >
                      <Save className="size-4" />
                    </button>
                  </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-2 pt-6">
                  {selectedIsEditing ? (
                    <textarea
                      value={selectedContent}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [selectedProfileSection.section]: event.target.value,
                        }))
                      }
                      className="soft-input min-h-full w-full rounded-3xl p-4 leading-8"
                    />
                  ) : selectedDocument ? (
                    <div className="max-w-4xl space-y-1">
                      {renderDocumentContent(selectedContent)}
                    </div>
                  ) : (
                    <div className="flex min-h-full items-center justify-center text-center">
                      <div>
                        <div className="mx-auto grid size-16 place-items-center rounded-3xl border border-[#D8B46A]/25 bg-[#D8B46A]/10 text-[#D8B46A]">
                          <Archive className="size-7" />
                        </div>
                        <p className="mt-5 max-w-xl text-lg leading-8 text-[#F4EFE7]">
                          {pendingProfileMessage}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </GlassCard>
            </motion.section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
