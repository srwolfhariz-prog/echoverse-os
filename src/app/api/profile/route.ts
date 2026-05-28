import { NextResponse } from "next/server";
import { requireApiUserId } from "@/lib/api-auth";
import { profileSections, sortProfileSections } from "@/lib/constants";
import {
  listFileProfileDocuments,
  upsertFileProfileDocument,
} from "@/lib/file-user-store";
import {
  recordUserEvent,
  updateUserMemoryDocument,
} from "@/lib/user-memory";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const auth = await requireApiUserId(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { userId } = auth;
  const sections = await listFileProfileDocuments(userId);

  return NextResponse.json({
    sections: sortProfileSections(sections),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUserId(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { userId } = auth;
  const body = (await request.json()) as {
    section?: unknown;
    title?: unknown;
    content?: unknown;
  };

  const section = typeof body.section === "string" ? body.section : "";
  const known = profileSections.find((item) => item.section === section);
  const title =
    typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : known?.title;
  const content = typeof body.content === "string" ? body.content : "";

  if (!known || !title) {
    return NextResponse.json({ error: "unknown profile section" }, { status: 400 });
  }

  const saved = await upsertFileProfileDocument(userId, {
    section,
    title,
    content,
  });

  if (!saved) {
    return NextResponse.json(
      { error: "服务器暂时无法保存用户数据，请稍后再试" },
      { status: 500 },
    );
  }

  await updateUserMemoryDocument(
    {
      profileSnapshot: { section: saved.section, title: saved.title },
      currentModule: "profile",
    },
    userId,
  );
  await recordUserEvent(
    {
      type: "profile.section_updated",
      payload: { section: saved.section },
    },
    userId,
  );

  return NextResponse.json({ section: saved });
}
