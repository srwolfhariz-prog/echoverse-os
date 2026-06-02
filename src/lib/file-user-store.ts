import { randomUUID } from "crypto";
import path from "path";
import {
  appendFile,
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "fs/promises";

export const echoverseDataRoot = path.join(process.cwd(), ".echoverse-data");

const usersIndexPath = path.join(echoverseDataRoot, "users.json");
const usersDataDir = path.join(echoverseDataRoot, "users");
const jsonFileQueues = new Map<string, Promise<unknown>>();

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

type NormalizedFileMemoryStore = FileMemoryStore & {
  appState: Record<string, string>;
  conversations: FileConversationMessage[];
  memoryDocument: FileUserMemoryDocument;
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

export async function safeReadJson<T>(filePath: string, fallbackData: T): Promise<T> {
  return withJsonFileQueue(filePath, () =>
    safeReadJsonUnlocked(filePath, fallbackData),
  );
}

export async function safeWriteJson(filePath: string, data: unknown) {
  return withJsonFileQueue(filePath, () => safeWriteJsonUnlocked(filePath, data));
}

async function updateJsonFile<T, R>(
  filePath: string,
  fallbackData: T,
  updater: (current: T) => Promise<{ next: T; result: R }> | { next: T; result: R },
) {
  return withJsonFileQueue(filePath, async () => {
    const current = await safeReadJsonUnlocked(filePath, fallbackData);
    const { next, result } = await updater(current);

    await safeWriteJsonUnlocked(filePath, next);

    return result;
  });
}

function withJsonFileQueue<T>(filePath: string, task: () => Promise<T> | T) {
  const key = path.resolve(filePath);
  const previous = jsonFileQueues.get(key) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(task);
  const cleanup = run.finally(() => {
    if (jsonFileQueues.get(key) === cleanup) {
      jsonFileQueues.delete(key);
    }
  });
  jsonFileQueues.set(key, cleanup);

  return run;
}

async function safeReadJsonUnlocked<T>(
  filePath: string,
  fallbackData: T,
): Promise<T> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as T;
  } catch (error) {
    if (isMissingFile(error)) {
      const fallback = cloneJsonData(fallbackData);

      await safeWriteJsonUnlocked(filePath, fallback);

      return fallback;
    }

    if (error instanceof SyntaxError) {
      await backupCorruptJson(filePath);

      const fallback = cloneJsonData(fallbackData);

      await safeWriteJsonUnlocked(filePath, fallback);

      return fallback;
    }

    throw error;
  }
}

async function safeWriteJsonUnlocked(filePath: string, data: unknown) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${randomUUID().slice(0, 8)}.tmp`;
  let handle: Awaited<ReturnType<typeof open>> | null = null;

  try {
    handle = await open(tmp, "w");
    await handle.writeFile(`${JSON.stringify(data, null, 2)}\n`, "utf8");
    await handle.sync();
    await handle.close();
    handle = null;
    await rename(tmp, filePath);
  } catch (error) {
    if (handle) {
      await handle.close().catch(() => {});
    }

    await unlink(tmp).catch(() => {});

    throw error;
  }
}

async function backupCorruptJson(filePath: string) {
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-");
  const backupPath = `${filePath}.corrupt.${timestamp}.bak`;

  try {
    await rename(filePath, backupPath);
  } catch (error) {
    if (!isMissingFile(error) && process.env.NODE_ENV !== "production") {
      console.error(`Failed to back up corrupt JSON file: ${filePath}`, error);
    }
  }
}

function cloneJsonData<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
}

export async function readUsersIndex() {
  await ensureEchoverseDataRoot();

  const index = await safeReadJson<FileUsersIndex>(usersIndexPath, { users: [] });

  if (!Array.isArray(index.users)) {
    return { users: [] } satisfies FileUsersIndex;
  }

  return index;
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
  await safeReadJson(target, value);
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

  const now = new Date().toISOString();
  const user = await updateJsonFile<FileUsersIndex, FileUserIndexItem>(
    usersIndexPath,
    { users: [] },
    (index) => {
      const users = Array.isArray(index.users) ? index.users : [];
      const usernameExists = users.some(
        (item) =>
          normalizeUsername(item.username) === normalizeUsername(trimmedUsername),
      );

      if (usernameExists) {
        throw new Error("USERNAME_EXISTS");
      }

      let id = `u_${randomUUID().replace(/-/g, "").slice(0, 12)}`;

      while (users.some((item) => item.id === id)) {
        id = `u_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
      }

      const nextUser: FileUserIndexItem = {
        id,
        username: trimmedUsername,
        passwordHash,
        createdAt: now,
        lastLoginAt: now,
        dataDir: userRelativeDir(id),
      };

      return {
        next: { users: [...users, nextUser] },
        result: nextUser,
      };
    },
  );
  await ensureUserDataFiles(user);
  await updateUserProfile(user.id, {
    avatarDataUrl,
    displayName: trimmedUsername,
    lastLoginAt: now,
  });
  await appendUserAction(user.id, "user.registered", {
    username: trimmedUsername,
  });

  return user;
}

export async function loginFileUser(username: string, passwordHash: string) {
  const now = new Date().toISOString();
  const updatedUser = await updateJsonFile<FileUsersIndex, FileUserIndexItem>(
    usersIndexPath,
    { users: [] },
    (index) => {
      const users = Array.isArray(index.users) ? index.users : [];
      const user =
        users.find(
          (item) => normalizeUsername(item.username) === normalizeUsername(username),
        ) ?? null;

      if (!user) {
        throw new Error("USERNAME_NOT_FOUND");
      }

      if (user.passwordHash !== passwordHash) {
        throw new Error("PASSWORD_MISMATCH");
      }

      const nextUser = { ...user, lastLoginAt: now };

      return {
        next: {
          users: users.map((item) => (item.id === user.id ? nextUser : item)),
        },
        result: nextUser,
      };
    },
  );

  await updateUserProfile(updatedUser.id, { lastLoginAt: now });
  await appendUserAction(updatedUser.id, "user.logged_in", {
    username: updatedUser.username,
  });

  return updatedUser;
}

export async function readUserProfile(userId: string) {
  const user = await findFileUserById(userId);

  if (!user) {
    return null;
  }

  return safeReadJson<FileProfile>(userFile(userId, "profile.json"), {
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

  return updateJsonFile<FileProfile, FileProfile>(
    userFile(userId, "profile.json"),
    {
      id: user.id,
      username: user.username,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    (current) => {
      const next = {
        ...current,
        ...patch,
        id: user.id,
        username: user.username,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
      } satisfies FileProfile;

      return { next, result: next };
    },
  );
}

export async function readUserMemoryStore(userId: string) {
  const user = await findFileUserById(userId);

  if (!user) {
    return null;
  }

  const store = await safeReadJson<FileMemoryStore>(
    userFile(userId, "memory.json"),
    createDefaultMemoryStore(),
  );

  return normalizeMemoryStore(userId, store);
}

async function updateUserMemoryStore<R>(
  userId: string,
  updater: (
    store: NormalizedFileMemoryStore,
  ) => Promise<{ next: FileMemoryStore; result: R }> | { next: FileMemoryStore; result: R },
) {
  const user = await findFileUserById(userId);

  if (!user) {
    return null;
  }

  return updateJsonFile<FileMemoryStore, R>(
    userFile(userId, "memory.json"),
    createDefaultMemoryStore(),
    async (current) => {
      const store = normalizeMemoryStore(userId, current);
      const { next, result } = await updater(store);

      return {
        next: normalizeMemoryStore(userId, next),
        result,
      };
    },
  );
}

function createDefaultMemoryStore(): FileMemoryStore {
  return {
    memories: [],
    profileDocuments: [],
  };
}

function normalizeMemoryStore(
  userId: string,
  store: FileMemoryStore,
): NormalizedFileMemoryStore {
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
  return updateUserMemoryStore(userId, (store) => {
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

    return {
      next: {
        ...store,
        memoryDocument: nextMemoryDocument,
      },
      result: nextMemoryDocument,
    };
  });
}

export async function setFileAppState(
  userId: string,
  key: string,
  value: unknown,
) {
  const serialized = serialize(value);
  const result = await updateUserMemoryStore(userId, (store) => ({
    next: {
      ...store,
      appState: {
        ...store.appState,
        [key]: serialized,
      },
    },
    result: {
      key,
      userId,
      value: serialized,
      updatedAt: new Date().toISOString(),
    },
  }));

  if (key.startsWith("parallel_world.")) {
    await setFileWorldAppState(userId, key, serialized);
  }

  return result;
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
  return updateUserMemoryStore(userId, (store) => {
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

    return {
      next: {
        ...store,
        profileDocuments: [
          ...store.profileDocuments.filter(
            (item) => item.section !== document.section,
          ),
          nextDocument,
        ],
      },
      result: nextDocument,
    };
  });
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

  const result = await updateUserMemoryStore(userId, (store) => ({
    next: {
      ...store,
      memories: [...store.memories, ...saved],
    },
    result: saved,
  }));

  return result ?? [];
}

export async function createFileConversationMessage(
  userId: string,
  input: { content: string; mode: string; role: "assistant" | "user" },
) {
  const message: FileConversationMessage = {
    id: randomUUID(),
    userId,
    role: input.role,
    content: input.content,
    mode: input.mode,
    createdAt: new Date().toISOString(),
  };

  const result = await updateUserMemoryStore(userId, (store) => ({
    next: {
      ...store,
      conversations: [...store.conversations, message].slice(-200),
    },
    result: message,
  }));

  return result;
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

  const store = await safeReadJson<FileLettersStore>(userFile(userId, "letters.json"), {
    letters: [],
  });

  return {
    letters: Array.isArray(store.letters) ? store.letters : [],
  } satisfies FileLettersStore;
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
  if (!(await findFileUserById(userId))) {
    return null;
  }

  const letter: FileLifeLetter = {
    id: randomUUID(),
    userId,
    ...input,
    createdAt: new Date().toISOString(),
  };

  return updateJsonFile<FileLettersStore, FileLifeLetter | null>(
    userFile(userId, "letters.json"),
    { letters: [] },
    (store) => ({
      next: {
        letters: [letter, ...(Array.isArray(store.letters) ? store.letters : [])].slice(
          0,
          10,
        ),
      },
      result: letter,
    }),
  );
}

export async function readWorldStore(userId: string) {
  const user = await findFileUserById(userId);

  if (!user) {
    return null;
  }

  const store = await safeReadJson<FileWorldStore>(
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

async function setFileWorldAppState(userId: string, key: string, value: string) {
  if (!(await findFileUserById(userId))) {
    return;
  }

  await updateJsonFile<FileWorldStore, null>(
    userFile(userId, "world.json"),
    { ...defaultWorldState },
    (store) => ({
      next: {
        ...defaultWorldState,
        ...store,
        worldStates: Array.isArray(store.worldStates) ? store.worldStates : [],
        appState: {
          ...(store.appState ?? {}),
          [key]: value,
        },
      },
      result: null,
    }),
  );
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
  if (!(await findFileUserById(userId))) {
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

  return updateJsonFile<FileWorldStore, FileWorldState>(
    userFile(userId, "world.json"),
    { ...defaultWorldState },
    (store) => ({
      next: {
        ...defaultWorldState,
        ...store,
        ...input,
        worldStates: [
          state,
          ...(Array.isArray(store.worldStates) ? store.worldStates : []),
        ].slice(0, 200),
        appState: store.appState ?? {},
      },
      result: state,
    }),
  );
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
