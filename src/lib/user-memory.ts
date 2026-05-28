import { profileSections } from "@/lib/constants";
import { db } from "@/lib/db";
import {
  LOCAL_USER_COOKIE,
  LOCAL_USER_HEADER,
  localAccountIdToUserId,
  normalizeLocalAccountId,
} from "@/lib/local-user-session";

export const DEFAULT_USER_ID = "local-demo-user";
const DEFAULT_USER_DISPLAY_NAME = "本地体验用户";

type ProfileDocumentLike = {
  section: string;
  title?: string;
  content: string;
};

type UserMemoryPatch = {
  personaCompletion?: number;
  personaReady?: boolean;
  profileReady?: boolean;
  worldReady?: boolean;
  currentModule?: string;
  soulDocument?: string;
  agentsDocument?: string;
  profileSnapshot?: unknown;
  stateSnapshot?: unknown;
};

export type UserMemoryEventInput = {
  type: string;
  payload?: unknown;
};

function serialize(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value ?? null);
}

function clampCompletion(value: unknown) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

function isProfileArchiveReady(documents: ProfileDocumentLike[]) {
  const documentMap = new Map(
    documents.map((document) => [document.section, document.content]),
  );

  return profileSections.every((section) =>
    documentMap.get(section.section)?.trim(),
  );
}

function readCookieValue(cookieHeader: string | null, key: string) {
  if (!cookieHeader) {
    return "";
  }

  const cookie = cookieHeader
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(`${key}=`));

  if (!cookie) {
    return "";
  }

  try {
    return decodeURIComponent(cookie.slice(key.length + 1));
  } catch {
    return cookie.slice(key.length + 1);
  }
}

export function getLocalAccountIdFromRequest(request?: Request) {
  if (!request) {
    return "";
  }

  const headerAccountId = normalizeLocalAccountId(
    request.headers.get(LOCAL_USER_HEADER),
  );
  const cookieAccountId = normalizeLocalAccountId(
    readCookieValue(request.headers.get("cookie"), LOCAL_USER_COOKIE),
  );

  return headerAccountId || cookieAccountId;
}

export async function getCurrentUserId(request?: Request) {
  const accountId = getLocalAccountIdFromRequest(request);

  return localAccountIdToUserId(accountId) || DEFAULT_USER_ID;
}

export async function requireCurrentUserId(request: Request) {
  const accountId = getLocalAccountIdFromRequest(request);

  return localAccountIdToUserId(accountId);
}

export async function getOrCreateCurrentUser(userId = DEFAULT_USER_ID) {
  return db.userAccount.upsert({
    where: { id: userId },
    update: {},
    create: {
      id: userId,
      displayName: DEFAULT_USER_DISPLAY_NAME,
    },
  });
}

export async function updateCurrentUserAccount(
  patch: { displayName?: string },
  userId = DEFAULT_USER_ID,
) {
  const user = await getOrCreateCurrentUser(userId);
  const data: { displayName?: string } = {};

  if (typeof patch.displayName === "string" && patch.displayName.trim()) {
    data.displayName = patch.displayName.trim();
  }

  if (!Object.keys(data).length) {
    return user;
  }

  return db.userAccount.update({
    where: { id: user.id },
    data,
  });
}

export async function getUserMemorySnapshot(userId = DEFAULT_USER_ID) {
  const user = await getOrCreateCurrentUser(userId);
  const [documents, storedMemory, appStates, eventLogs] = await Promise.all([
    db.profileDocument.findMany({ where: { userId: user.id } }),
    db.userMemoryDocument.upsert({
      where: { userId: user.id },
      update: {},
      create: { userId: user.id },
    }),
    db.userAppState.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: "desc" },
    }),
    db.userEventLog.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);
  const profileReady = storedMemory.profileReady || isProfileArchiveReady(documents);
  const personaReady = storedMemory.personaReady || profileReady;
  const personaCompletion = Math.max(
    storedMemory.personaCompletion,
    personaReady ? 100 : 0,
  );
  const soulDocument =
    documents.find((document) => document.section === "soul")?.content ||
    storedMemory.soulDocument;
  const agentsDocument =
    documents.find((document) => document.section === "agents")?.content ||
    storedMemory.agentsDocument;

  const memoryDocument = await db.userMemoryDocument.update({
    where: { userId: user.id },
    data: {
      personaCompletion,
      personaReady,
      profileReady,
      soulDocument,
      agentsDocument,
      profileSnapshot: serialize(documents),
    },
  });

  return {
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
    },
    memoryDocument,
    appState: Object.fromEntries(
      appStates.map((state) => [state.key, state.value]),
    ),
    eventLogs,
  };
}

export async function updateUserMemoryDocument(
  patch: UserMemoryPatch,
  userId = DEFAULT_USER_ID,
) {
  const user = await getOrCreateCurrentUser(userId);
  const data: UserMemoryPatch & {
    personaCompletion?: number;
    profileSnapshot?: string;
    stateSnapshot?: string;
  } = {};

  if (typeof patch.personaCompletion !== "undefined") {
    data.personaCompletion = clampCompletion(patch.personaCompletion);
  }

  if (typeof patch.personaReady === "boolean") {
    data.personaReady = patch.personaReady;
  }

  if (typeof patch.profileReady === "boolean") {
    data.profileReady = patch.profileReady;
  }

  if (typeof patch.worldReady === "boolean") {
    data.worldReady = patch.worldReady;
  }

  if (typeof patch.currentModule === "string") {
    data.currentModule = patch.currentModule;
  }

  if (typeof patch.soulDocument === "string") {
    data.soulDocument = patch.soulDocument;
  }

  if (typeof patch.agentsDocument === "string") {
    data.agentsDocument = patch.agentsDocument;
  }

  if (typeof patch.profileSnapshot !== "undefined") {
    data.profileSnapshot = serialize(patch.profileSnapshot);
  }

  if (typeof patch.stateSnapshot !== "undefined") {
    data.stateSnapshot = serialize(patch.stateSnapshot);
  }

  if (data.personaCompletion === 100 && typeof data.personaReady === "undefined") {
    data.personaReady = true;
  }

  return db.userMemoryDocument.upsert({
    where: { userId: user.id },
    update: data,
    create: {
      userId: user.id,
      ...data,
    },
  });
}

export async function setUserAppState(
  key: string,
  value: unknown,
  userId = DEFAULT_USER_ID,
) {
  const user = await getOrCreateCurrentUser(userId);

  return db.userAppState.upsert({
    where: { userId_key: { userId: user.id, key } },
    update: { value: serialize(value) },
    create: {
      userId: user.id,
      key,
      value: serialize(value),
    },
  });
}

export async function recordUserEvent(
  event: UserMemoryEventInput,
  userId = DEFAULT_USER_ID,
) {
  const user = await getOrCreateCurrentUser(userId);

  return db.userEventLog.create({
    data: {
      userId: user.id,
      type: event.type,
      payload:
        typeof event.payload === "undefined" ? undefined : serialize(event.payload),
    },
  });
}
