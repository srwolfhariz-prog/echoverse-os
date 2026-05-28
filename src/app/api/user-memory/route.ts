import { NextResponse } from "next/server";
import { requireApiUserId } from "@/lib/api-auth";
import {
  getUserMemorySnapshot,
  recordUserEvent,
  setUserAppState,
  updateUserMemoryDocument,
} from "@/lib/user-memory";

export const runtime = "nodejs";

type UserMemoryRequest = {
  personaCompletion?: unknown;
  personaReady?: unknown;
  profileReady?: unknown;
  worldReady?: unknown;
  currentModule?: unknown;
  soulDocument?: unknown;
  agentsDocument?: unknown;
  profileSnapshot?: unknown;
  stateSnapshot?: unknown;
  appState?: Record<string, unknown>;
  event?: {
    type?: unknown;
    payload?: unknown;
  };
};

export async function GET(request: Request) {
  const auth = await requireApiUserId(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { userId } = auth;
  const snapshot = await getUserMemorySnapshot(userId);

  return NextResponse.json(toPublicSnapshot(snapshot));
}

export async function PATCH(request: Request) {
  const auth = await requireApiUserId(request);

  if ("response" in auth) {
    return auth.response;
  }

  const { userId } = auth;
  const body = (await request.json()) as UserMemoryRequest;

  const memoryDocument = await updateUserMemoryDocument(
    {
      personaCompletion:
        typeof body.personaCompletion === "number"
          ? body.personaCompletion
          : undefined,
      personaReady:
        typeof body.personaReady === "boolean" ? body.personaReady : undefined,
      profileReady:
        typeof body.profileReady === "boolean" ? body.profileReady : undefined,
      worldReady:
        typeof body.worldReady === "boolean" ? body.worldReady : undefined,
      currentModule:
        typeof body.currentModule === "string" ? body.currentModule : undefined,
      soulDocument:
        typeof body.soulDocument === "string" ? body.soulDocument : undefined,
      agentsDocument:
        typeof body.agentsDocument === "string" ? body.agentsDocument : undefined,
      profileSnapshot: body.profileSnapshot,
      stateSnapshot: body.stateSnapshot,
    },
    userId,
  );

  if (body.appState && typeof body.appState === "object") {
    await Promise.all(
      Object.entries(body.appState).map(([key, value]) =>
        setUserAppState(key, value, userId),
      ),
    );
  }

  if (typeof body.event?.type === "string") {
    await recordUserEvent(
      {
        type: body.event.type,
        payload: body.event.payload,
      },
      userId,
    );
  }

  const snapshot = await getUserMemorySnapshot(userId);

  return NextResponse.json({
    memoryDocument,
    snapshot: toPublicSnapshot(snapshot),
  });
}

function toPublicSnapshot<T extends { appState: Record<string, string> }>(
  snapshot: T,
) {
  return {
    ...snapshot,
    appState: Object.fromEntries(
      Object.entries(snapshot.appState).map(([key, value]) => [
        key,
        redactAppStateValue(key, value),
      ]),
    ),
  };
}

function redactAppStateValue(key: string, value: string) {
  if (key !== "parallel_world.wish" && key !== "user_center.profile") {
    return value;
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;

    if (key === "parallel_world.wish") {
      delete parsed.queuedReply;
    }

    if (key === "user_center.profile") {
      delete parsed.passwordHash;
    }

    return JSON.stringify(parsed);
  } catch {
    return value;
  }
}
