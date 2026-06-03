"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, X } from "lucide-react";

const guideItems = [
  {
    title: "回声人格",
    content:
      "通过四个阶段的 GPT 专业问答，逐步蒸馏你的记忆、性格、行为模式、关系模式和表达方式，生成一个高保真的虚拟人格。",
  },
  {
    title: "回声档案",
    content:
      "把完成后的人格结果整理成完整的人格画像文档，你可以查看不同维度，也可以导出到本地，作为未来的个人 AI 档案。",
  },
  {
    title: "人生回信",
    content:
      "把困惑写成一封信，系统会基于你的回声档案，用另一个自己的视角给你一封私人定制的回信，并提炼心声与行动建议。",
  },
  {
    title: "平行小世界",
    content:
      "每天查看平行宇宙里的 TA 正在经历什么、心情如何、人生走到哪里，也可以给 TA 留言，并在第二天收到回应。",
  },
];

export function EchoGuideButton() {
  const [open, setOpen] = useState(false);

  const dialog = typeof document !== "undefined"
    ? createPortal(
        <AnimatePresence>
          {open ? (
            <motion.div
              key="echo-guide-dialog"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="home-guide-overlay"
              onClick={() => setOpen(false)}
            >
              <motion.section
                initial={{ opacity: 0, y: 14, scale: 0.985 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.985 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className="home-guide-dialog"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="home-guide-dialog__head">
                  <div>
                    <p className="home-guide-dialog__eyebrow">Echo Guide</p>
                    <h2>回声使用说明</h2>
                  </div>
                  <button
                    type="button"
                    aria-label="关闭回声使用说明"
                    className="home-guide-dialog__close"
                    onClick={() => setOpen(false)}
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <p className="home-guide-dialog__intro">
                  《平行宇宙的回声》是一个用 GPT 蒸馏、保存并唤醒“另一个自己”的人格系统。它会通过专业问答建立你的虚拟人格，让 AI 记住你的经历、性格、价值观、表达方式和潜意识模式，并把它变成可以对话、下载和持续生长的数字人格档案。
                </p>

                <div className="home-guide-dialog__list">
                  {guideItems.map((item) => (
                    <div key={item.title} className="home-guide-dialog__item">
                      <h3>{item.title}</h3>
                      <p>{item.content}</p>
                    </div>
                  ))}
                </div>
              </motion.section>
            </motion.div>
          ) : null}
        </AnimatePresence>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        type="button"
        className="home-guide-button"
        onClick={() => setOpen(true)}
      >
        <BookOpen className="size-4" />
        回声使用说明
      </button>

      {dialog}
    </>
  );
}
