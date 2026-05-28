import { NextResponse } from "next/server";
import { randomInt } from "crypto";
import {
  LOCAL_USER_COOKIE,
  localAccountIdToUserId,
  normalizeLocalAccountId,
} from "@/lib/local-user-session";
import { db } from "@/lib/db";
import {
  getLocalAccountIdFromRequest,
  getCurrentUserId,
  getUserMemorySnapshot,
  recordUserEvent,
  setUserAppState,
  updateCurrentUserAccount,
} from "@/lib/user-memory";

export const runtime = "nodejs";

const userCenterStateKey = "user_center.profile";
const defaultMotto = "在另一个角落里，也要认真成为自己。";
const guestNickname = "未登录用户";

type UserCenterProfile = {
  accountId: string;
  avatarDataUrl?: string;
  loggedIn: boolean;
  motto: string;
  nickname: string;
  passwordHash?: string;
};

type UserCenterRequest = {
  event?: {
    payload?: unknown;
    type?: unknown;
  };
  profile?: Partial<UserCenterProfile>;
};

function parseStoredProfile(value: string | undefined) {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value) as Partial<UserCenterProfile>;
  } catch {
    return {};
  }
}

function normalizeText(value: string | undefined, fallback: string) {
  const trimmed = value?.trim();

  if (!trimmed || /[\u0080-\u009F\uFFFD]/.test(trimmed)) {
    return fallback;
  }

  return trimmed;
}

function normalizeNickname(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!trimmed || /[\u0080-\u009F\uFFFD]/.test(trimmed)) {
    return "";
  }

  return trimmed;
}

function createLoggedOutProfile(): UserCenterProfile {
  return {
    accountId: "",
    loggedIn: false,
    motto: "",
    nickname: guestNickname,
  };
}

async function findRegisteredProfileByNickname(nickname: string) {
  const normalizedNickname = normalizeNickname(nickname);

  if (!normalizedNickname) {
    return null;
  }

  const states = await db.userAppState.findMany({
    where: { key: userCenterStateKey },
    select: { userId: true, value: true },
  });

  for (const state of states) {
    const profile = parseStoredProfile(state.value);

    if (
      profile.passwordHash &&
      normalizeNickname(profile.nickname) === normalizedNickname
    ) {
      return {
        profile,
        userId: state.userId,
      };
    }
  }

  return null;
}

async function accountIdExists(accountId: string) {
  const userId = localAccountIdToUserId(accountId);

  if (!userId) {
    return true;
  }

  const existingUser = await db.userAccount.findUnique({
    where: { id: userId },
    select: { id: true },
  });

  if (existingUser) {
    return true;
  }

  const states = await db.userAppState.findMany({
    where: { key: userCenterStateKey },
    select: { value: true },
  });

  return states.some((state) => parseStoredProfile(state.value).accountId === accountId);
}

async function createUniqueAccountId() {
  for (let index = 0; index < 100; index += 1) {
    const accountId = randomInt(0, 1_000_000).toString().padStart(6, "0");

    if (!(await accountIdExists(accountId))) {
      return accountId;
    }
  }

  throw new Error("账号 ID 暂时生成失败，请稍后再试。");
}

function normalizeProfile(
  user: { displayName: string | null; id: string },
  stored?: Partial<UserCenterProfile>,
  patch?: Partial<UserCenterProfile>,
): UserCenterProfile {
  const accountId = patch?.accountId?.trim() || stored?.accountId?.trim() || user.id;
  const avatarDataUrl =
    typeof patch?.avatarDataUrl === "string"
      ? patch.avatarDataUrl
      : stored?.avatarDataUrl;
  const nickname = normalizeText(
    patch?.nickname || stored?.nickname || user.displayName || undefined,
    guestNickname,
  );
  const motto = normalizeText(patch?.motto || stored?.motto, defaultMotto);
  const loggedIn =
    typeof patch?.loggedIn === "boolean"
      ? patch.loggedIn
      : Boolean(stored?.loggedIn);

  return {
    accountId,
    avatarDataUrl,
    loggedIn,
    motto,
    nickname,
    passwordHash:
      typeof patch?.passwordHash === "string"
        ? patch.passwordHash
        : stored?.passwordHash,
  };
}

function withLocalSessionCookie(response: NextResponse, profile: UserCenterProfile) {
  if (profile.loggedIn && profile.accountId) {
    response.cookies.set(LOCAL_USER_COOKIE, profile.accountId, {
      maxAge: 60 * 60 * 24 * 365 * 5,
      path: "/",
      sameSite: "lax",
    });
  }

  return response;
}

function clearLocalSessionCookie(response: NextResponse) {
  response.cookies.set(LOCAL_USER_COOKIE, "", {
    maxAge: 0,
    path: "/",
    sameSite: "lax",
  });

  return response;
}

export async function GET(request: Request) {
  const userId = await getCurrentUserId(request);
  const snapshot = await getUserMemorySnapshot(userId);
  const profile = normalizeProfile(
    snapshot.user,
    parseStoredProfile(snapshot.appState[userCenterStateKey]),
  );
  const responseProfile = profile.loggedIn ? profile : createLoggedOutProfile();
  const response = NextResponse.json({
    eventLogs: snapshot.eventLogs,
    profile: responseProfile,
  });

  return profile.loggedIn
    ? withLocalSessionCookie(response, profile)
    : clearLocalSessionCookie(response);
}

export async function PATCH(request: Request) {
  const body = (await request.json()) as UserCenterRequest;
  const eventType = typeof body.event?.type === "string" ? body.event.type : "";
  const requestedNickname = normalizeNickname(body.profile?.nickname);
  const requestedPasswordHash =
    typeof body.profile?.passwordHash === "string"
      ? body.profile.passwordHash
      : "";
  const currentAccountId = getLocalAccountIdFromRequest(request);
  let requestedAccountId = normalizeLocalAccountId(body.profile?.accountId);
  let userId = await getCurrentUserId(request);
  let snapshot = await getUserMemorySnapshot(userId);
  let storedProfile = parseStoredProfile(snapshot.appState[userCenterStateKey]);
  let profilePatch: Partial<UserCenterProfile>;

  if (eventType === "user.registered") {
    if (!requestedNickname || !requestedPasswordHash) {
      return NextResponse.json({ error: "请输入昵称和密码。" }, { status: 400 });
    }

    const existingProfile = await findRegisteredProfileByNickname(requestedNickname);

    if (existingProfile) {
      return NextResponse.json(
        { error: "这个昵称已经注册过了，请直接登录。" },
        { status: 409 },
      );
    }

    requestedAccountId = await createUniqueAccountId();
    userId = localAccountIdToUserId(requestedAccountId);
    snapshot = await getUserMemorySnapshot(userId);
    storedProfile = parseStoredProfile(snapshot.appState[userCenterStateKey]);
    profilePatch = {
      accountId: requestedAccountId,
      avatarDataUrl:
        typeof body.profile?.avatarDataUrl === "string"
          ? body.profile.avatarDataUrl
          : undefined,
      loggedIn: true,
      nickname: requestedNickname,
      passwordHash: requestedPasswordHash,
    };
  } else if (eventType === "user.logged_in") {
    if (!requestedNickname || !requestedPasswordHash) {
      return NextResponse.json({ error: "请输入昵称和密码。" }, { status: 400 });
    }

    const existingProfile = await findRegisteredProfileByNickname(requestedNickname);

    if (!existingProfile) {
      return NextResponse.json({ error: "未注册" }, { status: 404 });
    }

    if (existingProfile.profile.passwordHash !== requestedPasswordHash) {
      return NextResponse.json({ error: "用户名/密码错误" }, { status: 401 });
    }

    userId = existingProfile.userId;
    snapshot = await getUserMemorySnapshot(userId);
    storedProfile = parseStoredProfile(snapshot.appState[userCenterStateKey]);
    profilePatch = {
      ...storedProfile,
      accountId: normalizeLocalAccountId(storedProfile.accountId),
      loggedIn: true,
      nickname: normalizeNickname(storedProfile.nickname) || requestedNickname,
      passwordHash: requestedPasswordHash,
    };
  } else if (eventType === "user.logged_out") {
    profilePatch = {
      ...storedProfile,
      accountId: normalizeLocalAccountId(storedProfile.accountId) || currentAccountId,
      loggedIn: false,
    };
  } else {
    profilePatch = {
      ...body.profile,
      accountId: requestedAccountId || body.profile?.accountId || currentAccountId,
    };
  }

  const profile = normalizeProfile(
    snapshot.user,
    storedProfile,
    profilePatch,
  );

  await setUserAppState(userCenterStateKey, profile, userId);

  if (profile.loggedIn) {
    await updateCurrentUserAccount({ displayName: profile.nickname }, userId);
  }

  if (typeof body.event?.type === "string") {
    await recordUserEvent(
      {
        type: body.event.type,
        payload: {
          ...(typeof body.event.payload === "object" && body.event.payload
            ? body.event.payload
            : {}),
          accountId: profile.accountId,
        },
      },
      userId,
    );
  }

  const nextSnapshot = await getUserMemorySnapshot(userId);
  const responseProfile = profile.loggedIn ? profile : createLoggedOutProfile();
  const response = NextResponse.json({
    eventLogs: nextSnapshot.eventLogs,
    profile: responseProfile,
  });

  return profile.loggedIn
    ? withLocalSessionCookie(response, profile)
    : clearLocalSessionCookie(response);
}
