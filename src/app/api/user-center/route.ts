import { NextResponse } from "next/server";
import {
  LOCAL_USER_COOKIE,
  normalizeLocalAccountId,
} from "@/lib/local-user-session";
import {
  appendUserAction,
  findFileUserById,
  loginFileUser,
  readRecentUserActions,
  readUserProfile,
  registerFileUser,
  updateUserProfile,
  type FileProfile,
  type FileUserIndexItem,
} from "@/lib/file-user-store";
import { getLocalAccountIdFromRequest } from "@/lib/user-memory";
import {
  isUsableBirthDate,
  normalizeBirthDate,
  normalizeUserGender,
  type UserGender,
} from "@/lib/user-demographics";

export const runtime = "nodejs";

const defaultMotto = "在另一个角落里，也要认真成为自己。";
const loggedOutNickname = "未登录用户";

type UserCenterProfile = {
  accountId: string;
  avatarDataUrl?: string;
  birthDate?: string;
  gender?: UserGender;
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

function normalizeUsername(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePasswordHash(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function createLoggedOutProfile(): UserCenterProfile {
  return {
    accountId: "",
    loggedIn: false,
    motto: "",
    nickname: loggedOutNickname,
  };
}

function toResponseProfile(
  user: FileUserIndexItem,
  profile: FileProfile | null,
  loggedIn = true,
): UserCenterProfile {
  return {
    accountId: user.id,
    avatarDataUrl: profile?.avatarDataUrl,
    birthDate: profile?.birthDate,
    gender: profile?.gender,
    loggedIn,
    motto: profile?.motto ?? defaultMotto,
    nickname: profile?.displayName ?? profile?.username ?? user.username,
  };
}

function withLocalSessionCookie(response: NextResponse, profile: UserCenterProfile) {
  if (profile.loggedIn && profile.accountId) {
    return clearLocalSessionCookie(response);
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

function userDataSaveError() {
  return NextResponse.json(
    { error: "服务器暂时无法保存用户数据，请稍后再试" },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const accountId = normalizeLocalAccountId(getLocalAccountIdFromRequest(request));
    const user = accountId ? await findFileUserById(accountId) : null;

    if (!user) {
      return clearLocalSessionCookie(
        NextResponse.json({
          eventLogs: [],
          profile: createLoggedOutProfile(),
        }),
      );
    }

    const [profile, eventLogs] = await Promise.all([
      readUserProfile(user.id),
      readRecentUserActions(user.id),
    ]);
    const responseProfile = toResponseProfile(user, profile);
    const response = NextResponse.json({
      eventLogs,
      profile: responseProfile,
    });

    return withLocalSessionCookie(response, responseProfile);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }

    return userDataSaveError();
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as UserCenterRequest;
    const eventType = typeof body.event?.type === "string" ? body.event.type : "";
    const birthDate = normalizeBirthDate(body.profile?.birthDate);
    const gender = normalizeUserGender(body.profile?.gender);
    const username = normalizeUsername(body.profile?.nickname);
    const passwordHash = normalizePasswordHash(body.profile?.passwordHash);

    if (eventType === "user.registered") {
      if (!username || !passwordHash) {
        return NextResponse.json(
          { error: "请输入用户名和密码。" },
          { status: 400 },
        );
      }

      if (!gender || !isUsableBirthDate(birthDate)) {
        return NextResponse.json(
          { error: "请选择性别并填写真实出生日期。" },
          { status: 400 },
        );
      }

      try {
        const user = await registerFileUser({
          avatarDataUrl:
            typeof body.profile?.avatarDataUrl === "string"
              ? body.profile.avatarDataUrl
              : undefined,
          birthDate,
          gender,
          passwordHash,
          username,
        });
        const profile = await readUserProfile(user.id);
        const responseProfile = toResponseProfile(user, profile);
        const response = NextResponse.json({
          eventLogs: await readRecentUserActions(user.id),
          profile: responseProfile,
        });

        return withLocalSessionCookie(response, responseProfile);
      } catch (error) {
        if (error instanceof Error && error.message === "USERNAME_EXISTS") {
          return NextResponse.json(
            { error: "该用户名已注册" },
            { status: 409 },
          );
        }

        if (process.env.NODE_ENV !== "production") {
          console.error(error);
        }

        return userDataSaveError();
      }
    }

    if (eventType === "user.logged_in") {
      if (!username || !passwordHash) {
        return NextResponse.json(
          { error: "请输入用户名和密码。" },
          { status: 400 },
        );
      }

      try {
        const user = await loginFileUser(username, passwordHash);
        const profile = await readUserProfile(user.id);
        const responseProfile = toResponseProfile(user, profile);
        const response = NextResponse.json({
          eventLogs: await readRecentUserActions(user.id),
          profile: responseProfile,
        });

        return withLocalSessionCookie(response, responseProfile);
      } catch (error) {
        if (error instanceof Error && error.message === "USERNAME_NOT_FOUND") {
          return NextResponse.json(
            { error: "用户名未注册" },
            { status: 404 },
          );
        }

        if (error instanceof Error && error.message === "PASSWORD_MISMATCH") {
          return NextResponse.json(
            { error: "用户名或密码错误" },
            { status: 401 },
          );
        }

        if (process.env.NODE_ENV !== "production") {
          console.error(error);
        }

        return userDataSaveError();
      }
    }

    const accountId = normalizeLocalAccountId(getLocalAccountIdFromRequest(request));
    const user = accountId ? await findFileUserById(accountId) : null;

    if (!user) {
      return clearLocalSessionCookie(
        NextResponse.json(
          { error: "请登录后再使用这个功能。" },
          { status: 401 },
        ),
      );
    }

    if (eventType === "user.logged_out") {
      await appendUserAction(user.id, "user.logged_out", body.event?.payload ?? {});

      return clearLocalSessionCookie(
        NextResponse.json({
          eventLogs: await readRecentUserActions(user.id),
          profile: createLoggedOutProfile(),
        }),
      );
    }

    const patch: Partial<FileProfile> = {};

    if (typeof body.profile?.avatarDataUrl === "string") {
      patch.avatarDataUrl = body.profile.avatarDataUrl;
    }

    if (typeof body.profile?.motto === "string") {
      patch.motto = body.profile.motto.trim() || defaultMotto;
    }

    if (Object.keys(patch).length > 0) {
      await updateUserProfile(user.id, patch);
      await appendUserAction(user.id, "user.profile_updated", {
        fields: Object.keys(patch),
      });
    } else if (eventType) {
      await appendUserAction(user.id, eventType, body.event?.payload ?? {});
    }

    const profile = await readUserProfile(user.id);
    const responseProfile = toResponseProfile(user, profile);
    const response = NextResponse.json({
      eventLogs: await readRecentUserActions(user.id),
      profile: responseProfile,
    });

    return withLocalSessionCookie(response, responseProfile);
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.error(error);
    }

    return userDataSaveError();
  }
}
