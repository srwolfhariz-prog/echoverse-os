import { randomUUID } from "crypto";
import path from "path";
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "fs/promises";

export const echoverseDataRoot = path.join(process.cwd(), ".echoverse-data");

const usersIndexPath = path.join(echoverseDataRoot, "users.json");
const usersDataDir = path.join(echoverseDataRoot, "users");

export type FileUserIndexItem = {
  id: string;
  username: string;
  passwordHash: string;
  createdAt: string;
  lastLoginAt: string;
  dataDir: string;
};

export type FileUsersIndex = {
  users: FileUserIndexItem[];
};

export type FileProfile = {
  id: string;
  username: string;
  createdAt: string;
  lastLoginAt: string;
  avatarDataUrl?: string;
  displayName?: string;
  motto?: string;
};

export type FileMemoryItem = {
  id: string;
  userId: string;
  type: string;
  content: string;
  emotion?: string | null;
  importance?: number | null;
  confidence?: number | null;
  sourceMessageId?: string | null;
  createdAt: string;
};

export type FileProfileDocument = {
  id: string;
  userId: string;
  section: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type FileUserMemoryDocument = {
  id: string;
  userId: string;
  personaCompletion: number;
  personaReady: boolean;
  profileReady: boolean;
  worldReady: boolean;
  currentModule: string | null;
  soulDocument: string | null;
  agentsDocument: string | null;
  profileSnapshot: string | null;
  stateSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FileConversationMessage = {
  id: string;
  userId: string;
  role: "assistant" | "user";
  content: string;
  mode: string;
  createdAt: string;
};

export type FileMemoryStore = {
  memories: FileMemoryItem[];
  profileDocuments: FileProfileDocument[];
  memoryDocument?: Partial<FileUserMemoryDocument>;
  appState?: Record<string, string>;
  conversations?: FileConversationMessage[];
};

export type FileLifeLetter = {
  id: string;
  userId: string;
  question: string;
  category: string;
  answer: string;
  referencedMemoryIds?: string | null;
  actionTitle?: string | null;
  actionSteps?: string | null;
  createdAt: string;
};

export type FileLettersStore = {
  letters: FileLifeLetter[];
};

export type FileWorldState = {
  id: string;
  userId: string;
  mood: string;
  scene: string;
  energy: number;
  clarity: number;
  diary: string;
  createdAt: string;
  updatedAt: string;
};

export type FileWorldStore = {
  mood: string;
  scene: string;
  energy: number;
  clarity: number;
  diary: string;
  worldStates?: FileWorldState[];
  appState?: Record<string, string>;
};

export type FileUserAction = {
  time: string;
  type: string;
  payload: unknown;
};

const defaultWorldState = {
  mood: "起雾",
  scene: "情绪湖",
  energy: 46,
  clarity: 38,
  diary:
    "这个平行宇宙还很安静。等你说出第一段记忆，它会长出第一处风景。",
};

function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function userDir(userId: string) {
  return path.join(usersDataDir, userId);
}

function userRelativeDir(userId: string) {
  return `users/${userId}`;
}

function userFile(userId: string, filename: string) {
  return path.join(userDir(userId), filename);
}

function isMissingFile(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

async function pathExists(target: string) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (isMissingFile(error)) {
      return false;
    }

    throw error;
  }
}

async function readJsonFile<T>(target: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(target, "utf8")) as T;
  } catch (error) {
    if (isMissingFile(error)) {
      return fallback;
    }

    throw error;
  }
}

async function writeJsonFile(target: string, value: unknown) {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;

  await writeFile(tmp, `${stringifyJson(value)}\n`, "utf8");
  await rename(tmp, target);
}

function stringifyJson(value: unknown) {
  return (JSON.stringify(value, null, 2) ?? "null").replace(/[^\x00-\x7F]/g, (char) =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

async function writeTextFileIfMissing(target: string, value: string) {
  if (await pathExists(target)) {
    return;
  }

  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, value, "utf8");
}

export async function ensureEchoverseDataRoot() {
  await mkdir(usersDataDir, { recursive: true });

  if (!(await pathExists(usersIndexPath))) {
    await writeJsonFile(usersIndexPath, { users: [] } satisfies FileUsersIndex);
  }
}

export async function readUsersIndex() {
  await ensureEchoverseDataRoot();

  const index = await readJsonFile<FileUsersIndex>(usersIndexPath, { users: [] });

  if (!Array.isArray(index.users)) {
    return { users: [] } satisfies FileUsersIndex;
  }

  return index;
}

async function writeUsersIndex(index: FileUsersIndex) {
  await ensureEchoverseDataRoot();
  await writeJsonFile(usersIndexPath, { users: index.users });
}

export async function ensureUserDataFiles(user: FileUserIndexItem) {
  await ensureEchoverseDataRoot();
  await mkdir(userDir(user.id), { recursive: true });
  await writeJsonFileIfMissing(userFile(user.id, "profile.json"), {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  } satisfies FileProfile);
  await writeJsonFileIfMissing(userFile(user.id, "memory.json"), {
    memories: [],
    profileDocuments: [],
  } satisfies FileMemoryStore);
  await writeTextFileIfMissing(userFile(user.id, "actions.jsonl"), "");
  await writeJsonFileIfMissing(userFile(user.id, "letters.json"), {
    letters: [],
  } satisfies FileLettersStore);
  await writeJsonFileIfMissing(userFile(user.id, "world.json"), {
    ...defaultWorldState,
  } satisfies FileWorldStore);
}

async function writeJsonFileIfMissing(target: string, value: unknown) {
  if (await pathExists(target)) {
    return;
  }

  await writeJsonFile(target, value);
}

export async function findFileUserById(userId: string) {
  const index = await readUsersIndex();
  const user = index.users.find((item) => item.id === userId) ?? null;

  if (user) {
    await ensureUserDataFiles(user);
  }

  return user;
}

export async function findFileUserByUsername(username: string) {
  const normalized = normalizeUsername(username);

  if (!normalized) {
    return null;
  }

  const index = await readUsersIndex();
  const user =
    index.users.find((item) => normalizeUsername(item.username) === normalized) ??
    null;

  if (user) {
    await ensureUserDataFiles(user);
  }

  return user;
}

export async function registerFileUser({
  avatarDataUrl,
  passwordHash,
  username,
}: {
  avatarDataUrl?: string;
  passwordHash: string;
  username: string;
}) {
  const trimmedUsername = username.trim();

  if (!trimmedUsername || !passwordHash) {
    throw new Error("INVALID_REGISTER_INPUT");
  }

  const index = await readUsersIndex();
  const usernameExists = index.users.some(
    (item) => normalizeUsername(item.username) === normalizeUsername(trimmedUsername),
  );

  if (usernameExists) {
    throw new Error("USERNAME_EXISTS");
  }

  const now = new Date().toISOString();
  let id = `u_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

  while (index.users.some((item) => item.id === id)) {
    id = `u_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  }

  const user: FileUserIndexItem = {
    id,
    username: trimmedUsername,
    passwordHash,
    createdAt: now,
    lastLoginAt: now,
    dataDir: userRelativeDir(id),
  };

  index.users.push(user);
  await writeUsersIndex(index);
  await ensureUserDataFiles(user);
  await updateUserProfile(id, {
    avatarDataUrl,
    displayName: trimmedUsername,
    lastLoginAt: now,
  });
  await appendUserAction(id, "user.registered", {
    username: trimmedUsername,
  });

  return user;
}

export async function loginFileUser(username: string, passwordHash: string) {
  const user = await findFileUserByUsername(username);

  if (!user) {
    throw new Error("USERNAME_NOT_FOUND");
  }

  if (user.passwordHash !== passwordHash) {
    throw new Error("PASSWORD_MISMATCH");
  }

  const now = new Date().toISOString();
  const index = await readUsersIndex();
  const nextUsers = index.users.map((item) =>
    item.id === user.id ? { ...item, lastLoginAt: now } : item,
  );
  const updatedUser = nextUsers.find((item) => item.id === user.id) ?? {
    ...user,
    lastLoginAt: now,
  };

  await writeUsersIndex({ users: nextUsers });
  await updateUserProfile(user.id, { lastLoginAt: now });
  await appendUserAction(user.id, "user.logged_in", {
    username: user.username,
  });

  return updatedUser;
}

export async function readUserProfile(userId: string) {
  const user = await findFileUserById(userId);

  if (!user) {
    return null;
  }

  return readJsonFile<FileProfile>(userFile(userId, "profile.json"), {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
  });
}

export async function updateUserProfile(
  userId: string,
  patch: Partial<FileProfile>,
) {
  const user = await findFileUserById(userId);

  if (!user) {
    return null;
  }

  const current = await readUserProfile(userId);
  const next = {
    id: user.id,
    username: user.username,
    createdAt: user.createdAt,
    lastLoginAt: user.lastLoginAt,
    ...current,
    ...patch,
  } satisfies FileProfile;

  await writeJsonFile(userFile(userId, "profile.json"), next);

  return next;
}

export async function readUserMemoryStore(userId: string) {
  const user = await findFileUserById(userId);

  if (!user) {
    return null;
  }

  const store = await readJsonFile<FileMemoryStore>(userFile(userId, "memory.json"), {
    memories: [],
    profileDocuments: [],
  });

  return normalizeMemoryStore(userId, store);
}

async function writeUserMemoryStore(userId: string, store: FileMemoryStore) {
  await writeJsonFile(userFile(userId, "memory.json"), normalizeMemoryStore(userId, store));
}

function normalizeMemoryStore(userId: string, store: FileMemoryStore) {
  const now = new Date().toISOString();
  const createdAt = store.memoryDocument?.createdAt ?? now;
  const memoryDocument: FileUserMemoryDocument = {
    id: store.memoryDocument?.id ?? `memory_${userId}`,
    userId,
    personaCompletion: clampCompletion(store.memoryDocument?.personaCompletion),
    personaReady: Boolean(store.memoryDocument?.personaReady),
    profileReady: Boolean(store.memoryDocument?.profileReady),
    worldReady: Boolean(store.memoryDocument?.worldReady),
    currentModule:
      typeof store.memoryDocument?.currentModule === "string"
        ? store.memoryDocument.currentModule
        : null,
    soulDocument:
      typeof store.memoryDocument?.soulDocument === "string"
        ? store.memoryDocument.soulDocument
        : null,
    agentsDocument:
      typeof store.memoryDocument?.agentsDocument === "string"
        ? store.memoryDocument.agentsDocument
        : null,
    profileSnapshot:
      typeof store.memoryDocument?.profileSnapshot === "string"
        ? store.memoryDocument.profileSnapshot
        : null,
    stateSnapshot:
      typeof store.memoryDocument?.stateSnapshot === "string"
        ? store.memoryDocument.stateSnapshot
        : null,
    createdAt,
    updatedAt: store.memoryDocument?.updatedAt ?? createdAt,
  };

  return {
    memories: Array.isArray(store.memories) ? store.memories : [],
    profileDocuments: Array.isArray(store.profileDocuments)
      ? store.profileDocuments
      : [],
    memoryDocument,
    appState: store.appState ?? {},
    conversations: Array.isArray(store.conversations) ? store.conversations : [],
  } satisfies FileMemoryStore & { memoryDocument: FileUserMemoryDocument };
}

function serialize(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value ?? null);
}

function clampCompletion(value: unknown) {
  return Math.min(100, Math.max(0, Math.round(Number(value) || 0)));
}

export async function updateFileMemoryDocument(
  userId: string,
  patch: Partial<FileUserMemoryDocument>,
) {
  const store = await readUserMemoryStore(userId);

  if (!store) {
    return null;
  }

  const nextMemoryDocument = {
    ...store.memoryDocument,
    ...patch,
    personaCompletion:
      typeof patch.personaCompletion !== "undefined"
        ? clampCompletion(patch.personaCompletion)
        : store.memoryDocument.personaCompletion,
    updatedAt: new Date().toISOString(),
  };

  if (nextMemoryDocument.personaCompletion === 100) {
    nextMemoryDocument.personaReady = true;
  }

  const nextStore = {
    ...store,
    memoryDocument: nextMemoryDocument,
  };

  await writeUserMemoryStore(userId, nextStore);

  return nextMemoryDocument;
}

export async function setFileAppState(
  userId: string,
  key: string,
  value: unknown,
) {
  const store = await readUserMemoryStore(userId);

  if (!store) {
    return null;
  }

  const serialized = serialize(value);

  store.appState = {
    ...store.appState,
    [key]: serialized,
  };

  await writeUserMemoryStore(userId, store);

  if (key.startsWith("parallel_world.")) {
    await setFileWorldAppState(userId, key, serialized);
  }

  return {
    key,
    userId,
    value: serialized,
    updatedAt: new Date().toISOString(),
  };
}

export async function getFileAppStateValue(userId: string, key: string) {
  const store = await readUserMemoryStore(userId);

  return store?.appState?.[key];
}

export async function getFileAppStates(userId: string, keys: string[]) {
  const store = await readUserMemoryStore(userId);
  const appState = store?.appState ?? {};

  return keys
    .filter((key) => typeof appState[key] === "string")
    .map((key) => ({ key, userId, value: appState[key] }));
}

export async function listFileProfileDocuments(userId: string) {
  const store = await readUserMemoryStore(userId);

  return [...(store?.profileDocuments ?? [])];
}

export async function upsertFileProfileDocument(
  userId: string,
  document: { section: string; title: string; content: string },
) {
  const store = await readUserMemoryStore(userId);

  if (!store) {
    return null;
  }

  const now = new Date().toISOString();
  const existing = store.profileDocuments.find(
    (item) => item.section === document.section,
  );
  const nextDocument: FileProfileDocument = {
    id: existing?.id ?? randomUUID(),
    userId,
    section: document.section,
    title: document.title,
    content: document.content,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  store.profileDocuments = [
    ...store.profileDocuments.filter((item) => item.section !== document.section),
    nextDocument,
  ];

  await writeUserMemoryStore(userId, store);

  return nextDocument;
}

export async function upsertFileProfileDocuments(
  userId: string,
  documents: Array<{ section: string; title: string; content: string }>,
) {
  const saved: FileProfileDocument[] = [];

  for (const document of documents) {
    const next = await upsertFileProfileDocument(userId, document);

    if (next) {
      saved.push(next);
    }
  }

  return saved;
}

export async function listFileMemories(
  userId: string,
  options: { sortByImportance?: boolean; take?: number } = {},
) {
  const store = await readUserMemoryStore(userId);
  const sorted = [...(store?.memories ?? [])].sort((a, b) => {
    if (options.sortByImportance) {
      const importanceDelta = (b.importance ?? 0) - (a.importance ?? 0);

      if (importanceDelta !== 0) {
        return importanceDelta;
      }
    }

    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return typeof options.take === "number" ? sorted.slice(0, options.take) : sorted;
}

export async function createFileMemories(
  userId: string,
  memories: Array<{
    type: string;
    content: string;
    emotion?: string | null;
    importance?: number | null;
    confidence?: number | null;
    sourceMessageId?: string | null;
  }>,
) {
  const store = await readUserMemoryStore(userId);

  if (!store) {
    return [];
  }

  const now = new Date().toISOString();
  const saved = memories.map((memory) => ({
    id: randomUUID(),
    userId,
    type: memory.type,
    content: memory.content,
    emotion: memory.emotion ?? null,
    importance: memory.importance ?? null,
    confidence: memory.confidence ?? null,
    sourceMessageId: memory.sourceMessageId ?? null,
    createdAt: now,
  }));

  store.memories = [...store.memories, ...saved];
  await writeUserMemoryStore(userId, store);

  return saved;
}

export async function createFileConversationMessage(
  userId: string,
  input: { content: string; mode: string; role: "assistant" | "user" },
) {
  const store = await readUserMemoryStore(userId);

  if (!store) {
    return null;
  }

  const message: FileConversationMessage = {
    id: randomUUID(),
    userId,
    role: input.role,
    content: input.content,
    mode: input.mode,
    createdAt: new Date().toISOString(),
  };

  store.conversations = [...(store.conversations ?? []), message].slice(-200);
  await writeUserMemoryStore(userId, store);

  return message;
}

export async function listFileConversationMessages(
  userId: string,
  mode: string,
  take: number,
) {
  const store = await readUserMemoryStore(userId);

  return [...(store?.conversations ?? [])]
    .filter((item) => item.mode === mode)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, take);
}

export async function readLettersStore(userId: string) {
  const user = await findFileUserById(userId);

  if (!user) {
    return null;
  }

  const store = await readJsonFile<FileLettersStore>(userFile(userId, "letters.json"), {
    letters: [],
  });

  return {
    letters: Array.isArray(store.letters) ? store.letters : [],
  } satisfies FileLettersStore;
}

async function writeLettersStore(userId: string, store: FileLettersStore) {
  await writeJsonFile(userFile(userId, "letters.json"), store);
}

export async function listFileLetters(userId: string, take?: number) {
  const store = await readLettersStore(userId);
  const sorted = [...(store?.letters ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return typeof take === "number" ? sorted.slice(0, take) : sorted;
}

export async function createFileLifeLetter(
  userId: string,
  input: Omit<FileLifeLetter, "createdAt" | "id" | "userId">,
) {
  const store = await readLettersStore(userId);

  if (!store) {
    return null;
  }

  const letter: FileLifeLetter = {
    id: randomUUID(),
    userId,
    ...input,
    createdAt: new Date().toISOString(),
  };

  store.letters = [letter, ...store.letters].slice(0, 200);
  await writeLettersStore(userId, store);

  return letter;
}

export async function readWorldStore(userId: string) {
  const user = await findFileUserById(userId);

  if (!user) {
    return null;
  }

  const store = await readJsonFile<FileWorldStore>(
    userFile(userId, "world.json"),
    { ...defaultWorldState },
  );

  return {
    ...defaultWorldState,
    ...store,
    worldStates: Array.isArray(store.worldStates) ? store.worldStates : [],
    appState: store.appState ?? {},
  } satisfies FileWorldStore;
}

async function writeWorldStore(userId: string, store: FileWorldStore) {
  await writeJsonFile(userFile(userId, "world.json"), store);
}

async function setFileWorldAppState(userId: string, key: string, value: string) {
  const store = await readWorldStore(userId);

  if (!store) {
    return;
  }

  await writeWorldStore(userId, {
    ...store,
    appState: {
      ...store.appState,
      [key]: value,
    },
  });
}

export async function listFileWorldStates(userId: string, take?: number) {
  const store = await readWorldStore(userId);
  const sorted = [...(store?.worldStates ?? [])].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  );

  return typeof take === "number" ? sorted.slice(0, take) : sorted;
}

export async function createFileWorldState(
  userId: string,
  input: {
    clarity: number;
    diary: string;
    energy: number;
    mood: string;
    scene: string;
  },
) {
  const store = await readWorldStore(userId);

  if (!store) {
    return null;
  }

  const now = new Date().toISOString();
  const state: FileWorldState = {
    id: randomUUID(),
    userId,
    mood: input.mood,
    scene: input.scene,
    energy: input.energy,
    clarity: input.clarity,
    diary: input.diary,
    createdAt: now,
    updatedAt: now,
  };

  await writeWorldStore(userId, {
    ...store,
    ...input,
    worldStates: [state, ...(store.worldStates ?? [])].slice(0, 200),
  });

  return state;
}

export async function appendUserAction(
  userId: string,
  type: string,
  payload: unknown = {},
) {
  const user = await findFileUserById(userId);

  if (!user) {
    return null;
  }

  const action: FileUserAction = {
    time: new Date().toISOString(),
    type,
    payload: payload && typeof payload === "object" ? payload : {},
  };

  await appendFile(
    userFile(userId, "actions.jsonl"),
    `${JSON.stringify(action)}\n`,
    "utf8",
  );

  return action;
}

export async function readRecentUserActions(userId: string, take = 25) {
  const user = await findFileUserById(userId);

  if (!user) {
    return [];
  }

  try {
    const content = await readFile(userFile(userId, "actions.jsonl"), "utf8");

    return content
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line) as FileUserAction;
        } catch {
          return null;
        }
      })
      .filter((item): item is FileUserAction => Boolean(item))
      .reverse()
      .slice(0, take)
      .map((item, index) => ({
        id: `${userId}-action-${index}`,
        userId,
        type: item.type,
        payload: serialize(item.payload),
        createdAt: item.time,
      }));
  } catch (error) {
    if (isMissingFile(error)) {
      return [];
    }

    throw error;
  }
}
