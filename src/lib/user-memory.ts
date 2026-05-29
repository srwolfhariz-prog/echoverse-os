import { profileSections } from "@/lib/constants";
import {
  appendUserAction,
  findFileUserById,
  getFileAppStates,
  readRecentUserActions,
  readUserMemoryStore,
  readUserProfile,
  setFileAppState,
  updateFileMemoryDocument,
  updateUserProfile,
  type FileProfileDocument,
  type FileUserMemoryDocument,
} from "@/lib/file-user-store";
import {
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

export function getLocalAccountIdFromRequest(request?: Request) {
  if (!request) {
    return "";
  }

  return normalizeLocalAccountId(
    request.headers.get(LOCAL_USER_HEADER),
  );
}

export async function getCurrentUserId(request?: Request) {
  const accountId = getLocalAccountIdFromRequest(request);
  const userId = localAccountIdToUserId(accountId);

  if (userId && (await findFileUserById(userId))) {
    return userId;
  }

  return DEFAULT_USER_ID;
}

export async function requireCurrentUserId(request: Request) {
  const accountId = getLocalAccountIdFromRequest(request);
  const userId = localAccountIdToUserId(accountId);

  if (!userId) {
    return "";
  }

  return (await findFileUserById(userId)) ? userId : "";
}

export async function getOrCreateCurrentUser(userId = DEFAULT_USER_ID) {
  const profile = await readUserProfile(userId);

  return {
    id: profile?.id ?? userId,
    email: null,
    displayName: profile?.displayName ?? profile?.username ?? DEFAULT_USER_DISPLAY_NAME,
  };
}

export async function updateCurrentUserAccount(
  patch: { displayName?: string },
  userId = DEFAULT_USER_ID,
) {
  const displayName = patch.displayName?.trim();

  if (!displayName) {
    return getOrCreateCurrentUser(userId);
  }

  await updateUserProfile(userId, { displayName });

  return getOrCreateCurrentUser(userId);
}

export async function getUserMemorySnapshot(userId = DEFAULT_USER_ID) {
  const [user, store, eventLogs] = await Promise.all([
    getOrCreateCurrentUser(userId),
    readUserMemoryStore(userId),
    readRecentUserActions(userId),
  ]);
  const documents = store?.profileDocuments ?? [];
  const storedMemory = store?.memoryDocument ?? createDefaultMemoryDocument(userId);
  const profileReady =
    Boolean(storedMemory.profileReady) || isProfileArchiveReady(documents);
  const personaReady = Boolean(storedMemory.personaReady) || profileReady;
  const personaCompletion = Math.max(
    clampCompletion(storedMemory.personaCompletion),
    personaReady ? 100 : 0,
  );
  const soulDocument =
    documents.find((document) => document.section === "soul")?.content ||
    storedMemory.soulDocument ||
    null;
  const agentsDocument =
    documents.find((document) => document.section === "agents")?.content ||
    storedMemory.agentsDocument ||
    null;
  const memoryDocument =
    store && userId !== DEFAULT_USER_ID
      ? await updateFileMemoryDocument(userId, {
          personaCompletion,
          personaReady,
          profileReady,
          soulDocument,
          agentsDocument,
          profileSnapshot: serialize(documents),
        })
      : {
          ...storedMemory,
          personaCompletion,
          personaReady,
          profileReady,
          soulDocument,
          agentsDocument,
          profileSnapshot: serialize(documents),
        };

  return {
    user,
    memoryDocument: memoryDocument ?? storedMemory,
    appState: store?.appState ?? {},
    eventLogs,
  };
}

function createDefaultMemoryDocument(userId: string) {
  const now = new Date().toISOString();

  return {
    id: `memory_${userId}`,
    userId,
    personaCompletion: 0,
    personaReady: false,
    profileReady: false,
    worldReady: false,
    currentModule: null,
    soulDocument: null,
    agentsDocument: null,
    profileSnapshot: null,
    stateSnapshot: null,
    createdAt: now,
    updatedAt: now,
  };
}

export async function updateUserMemoryDocument(
  patch: UserMemoryPatch,
  userId = DEFAULT_USER_ID,
) {
  const data: Partial<FileUserMemoryDocument> = {};

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

  return updateFileMemoryDocument(userId, data);
}

export async function setUserAppState(
  key: string,
  value: unknown,
  userId = DEFAULT_USER_ID,
) {
  return setFileAppState(userId, key, value);
}

export async function getUserAppStates(userId: string, keys: string[]) {
  return getFileAppStates(userId, keys);
}

export async function getUserProfileDocuments(userId: string) {
  const store = await readUserMemoryStore(userId);

  return [...(store?.profileDocuments ?? [])] as FileProfileDocument[];
}

export async function getUserMemories(userId: string) {
  const store = await readUserMemoryStore(userId);

  return [...(store?.memories ?? [])];
}

export async function recordUserEvent(
  event: UserMemoryEventInput,
  userId = DEFAULT_USER_ID,
) {
  return appendUserAction(userId, event.type, event.payload ?? {});
}
