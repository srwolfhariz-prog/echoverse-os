import { NextResponse } from "next/server";
import { requireApiUserId } from "@/lib/api-auth";
import { profileSections, sortProfileSections } from "@/lib/constants";
import { db } from "@/lib/db";
import {
  buildPersonaRuntimeDocuments,
  personaRuntimeSections,
} from "@/lib/persona-runtime";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiUserId(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { userId } = auth;
  const [sections, memories] = await Promise.all([
    db.profileDocument.findMany({ where: { userId } }),
    db.memory.findMany({ where: { userId }, orderBy: { createdAt: "desc" } }),
  ]);
  const sortedSections = sortProfileSections(sections);
  const sectionMap = new Map(sortedSections.map((item) => [item.section, item]));
  const archiveReady = profileSections.every((section) =>
    sectionMap.get(section.section)?.content.trim(),
  );

  if (!archiveReady) {
    return NextResponse.json(
      { error: "还没有可导出的回声档案。" },
      { status: 404 },
    );
  }

  const runtimeContext = buildPersonaRuntimeDocuments(sortedSections, memories);
  const runtimeFiles = new Map([
    ["soul", runtimeContext.soulDocument],
    ["agents", runtimeContext.agentsDocument],
  ]);
  const content = buildWordProfileDocument(
    sortedSections,
    runtimeFiles,
  );

  return new Response(content, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition":
        "attachment; filename=\"echo-profile.doc\"; filename*=UTF-8''echo-profile.doc",
    },
  });
}

function buildWordProfileDocument(
  sections: Array<{ section: string; title: string; content: string }>,
  runtimeFiles: Map<string, string>,
) {
  const sectionMap = new Map(sections.map((item) => [item.section, item]));
  const body = [
    "<h1>平行宇宙的回声档案</h1>",
    `<p class="meta">导出时间：${escapeHtml(
      new Date().toLocaleString("zh-CN", { hour12: false }),
    )}</p>`,
    "<h2>档案目录</h2>",
    "<ol>",
    ...profileSections.map(
      (section) => `<li>${escapeHtml(section.title)}</li>`,
    ),
    "</ol>",
  ];

  for (const section of profileSections) {
    const document = sectionMap.get(section.section);

    body.push(
      '<div class="page-break"></div>',
      `<h1>${escapeHtml(document?.title ?? section.title)}</h1>`,
      markdownToWordHtml(document?.content.trim() ?? ""),
    );
  }

  body.push('<div class="page-break"></div>', "<h1>附录：运行文档</h1>");

  for (const section of personaRuntimeSections) {
    body.push(
      `<h2>${escapeHtml(section.title)}</h2>`,
      markdownToWordHtml(runtimeFiles.get(section.section)?.trim() ?? ""),
    );
  }

  return `\ufeff<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>平行宇宙的回声档案</title>
  <style>
    body {
      font-family: "Microsoft YaHei", "SimSun", serif;
      color: #1f2933;
      line-height: 1.75;
      font-size: 12pt;
    }
    h1 {
      color: #2b1f26;
      font-size: 22pt;
      margin: 0 0 18pt;
    }
    h2 {
      color: #5b4630;
      font-size: 16pt;
      margin: 18pt 0 8pt;
    }
    h3 {
      color: #6f573a;
      font-size: 13.5pt;
      margin: 14pt 0 6pt;
    }
    p {
      margin: 0 0 8pt;
    }
    li {
      margin: 0 0 5pt;
    }
    .meta {
      color: #64748b;
      margin-bottom: 18pt;
    }
    .page-break {
      page-break-before: always;
    }
  </style>
</head>
<body>
${body.join("\n")}
</body>
</html>`;
}

function markdownToWordHtml(content: string) {
  const lines = content.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      closeList();
      html.push("<p>&nbsp;</p>");
      continue;
    }

    if (trimmed === "---") {
      closeList();
      html.push("<hr />");
      continue;
    }

    if (trimmed.startsWith("### ")) {
      closeList();
      html.push(`<h3>${escapeHtml(trimmed.slice(4))}</h3>`);
      continue;
    }

    if (trimmed.startsWith("## ")) {
      closeList();
      html.push(`<h2>${escapeHtml(trimmed.slice(3))}</h2>`);
      continue;
    }

    if (trimmed.startsWith("# ")) {
      closeList();
      html.push(`<h1>${escapeHtml(trimmed.slice(2))}</h1>`);
      continue;
    }

    if (trimmed.startsWith("- ")) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${escapeHtml(trimmed.slice(2))}</li>`);
      continue;
    }

    closeList();
    html.push(`<p>${escapeHtml(trimmed)}</p>`);
  }

  closeList();

  return html.join("\n");

  function closeList() {
    if (!inList) {
      return;
    }

    html.push("</ul>");
    inList = false;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
