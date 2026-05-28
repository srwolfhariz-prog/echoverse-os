"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  Check,
  KeyRound,
  LogIn,
  LogOut,
  PencilLine,
  ShieldCheck,
  Upload,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  LOCAL_USER_COOKIE,
  USER_CENTER_STORAGE_KEY,
} from "@/lib/local-user-session";
import { fetchWithLocalUser } from "@/lib/local-user-client";

const userCenterChangeEvent = "echoverse:user-center-change";
const userAuthRequestEvent = "echoverse:user-auth-request";
const pendingAuthRequestStorageKey = "echoverse.pending-auth-request";
const userCenterApi = "/api/user-center";

type UserCenterState = {
  accountId: string;
  avatarDataUrl?: string;
  loggedIn: boolean;
  motto: string;
  nickname: string;
  passwordHash?: string;
};

type AuthMode = "login" | "register";

type UserAuthRequestDetail = {
  href?: string;
  mode?: AuthMode;
};

type StoredAuthRequest = UserAuthRequestDetail & {
  createdAt: number;
};

type AuthFormState = {
  avatarDataUrl: string;
  nickname: string;
  password: string;
};

const defaultUserCenter: UserCenterState = {
  accountId: "",
  loggedIn: false,
  motto: "在另一个角落里，也要认真成为自己。",
  nickname: "未登录用户",
};

const defaultAuthForm: AuthFormState = {
  avatarDataUrl: "",
  nickname: "",
  password: "",
};

const loggedOutUserCenter: UserCenterState = {
  accountId: "",
  loggedIn: false,
  motto: "",
  nickname: "未登录用户",
};

let fallbackUserCenter: UserCenterState | null = null;

function createAccountId() {
  const time = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).slice(2, 6).toUpperCase();

  return `ECHO-${time}-${random}`;
}

function readStoredUserCenter(): UserCenterState {
  const fallback =
    fallbackUserCenter ??
    {
      ...defaultUserCenter,
      accountId: createAccountId(),
    };

  fallbackUserCenter = fallback;

  if (typeof window === "undefined") {
    return {
      ...defaultUserCenter,
      accountId: "ECHO-LOCAL",
    };
  }

  try {
    const stored = window.localStorage.getItem(USER_CENTER_STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as Partial<UserCenterState>) : {};

    return {
      ...defaultUserCenter,
      ...parsed,
      accountId: parsed.accountId || fallback.accountId,
    };
  } catch {
    return fallback;
  }
}

function parseUserCenterSnapshot(snapshot: string): UserCenterState {
  try {
    return {
      ...defaultUserCenter,
      ...(JSON.parse(snapshot) as Partial<UserCenterState>),
    };
  } catch {
    return {
      ...defaultUserCenter,
      accountId: "ECHO-LOCAL",
    };
  }
}

function getUserCenterSnapshot() {
  return JSON.stringify(readStoredUserCenter());
}

function getServerUserCenterSnapshot() {
  return JSON.stringify(loggedOutUserCenter);
}

function subscribeUserCenter(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === USER_CENTER_STORAGE_KEY) {
      callback();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(userCenterChangeEvent, callback);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(userCenterChangeEvent, callback);
  };
}

export function requestUserAuth(detail: UserAuthRequestDetail = {}) {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent<UserAuthRequestDetail>(userAuthRequestEvent, { detail }),
  );
}

export function requestUserAuthAfterNavigation(
  detail: UserAuthRequestDetail = {},
) {
  if (typeof window === "undefined") {
    return;
  }

  window.sessionStorage.setItem(
    pendingAuthRequestStorageKey,
    JSON.stringify({
      ...detail,
      createdAt: Date.now(),
    } satisfies StoredAuthRequest),
  );
}

export function useUserCenterState() {
  const userSnapshot = useSyncExternalStore(
    subscribeUserCenter,
    getUserCenterSnapshot,
    getServerUserCenterSnapshot,
  );

  return useMemo(
    () => parseUserCenterSnapshot(userSnapshot),
    [userSnapshot],
  );
}

function fallbackDigest(value: string) {
  const encoded = encodeURIComponent(value).replace(
    /%([0-9A-F]{2})/g,
    (_, item: string) => String.fromCharCode(Number.parseInt(item, 16)),
  );

  return `fallback:${window.btoa(encoded)}`;
}

function clearBrowserSessionCookie() {
  document.cookie = `${LOCAL_USER_COOKIE}=; Max-Age=0; path=/; SameSite=Lax`;
}

function clearLoggedOutScopedState() {
  window.sessionStorage.removeItem(pendingAuthRequestStorageKey);

  for (let index = window.localStorage.length - 1; index >= 0; index -= 1) {
    const key = window.localStorage.key(index);

    if (key?.startsWith("echoverse-") && key.endsWith(":guest")) {
      window.localStorage.removeItem(key);
    }
  }
}

function normalizeCredentialNickname(nickname: string) {
  return nickname.trim().toLowerCase();
}

async function createPasswordHash(nickname: string, password: string) {
  const source = `echoverse-demo-auth:${normalizeCredentialNickname(nickname)}:${password}`;

  if (!window.crypto?.subtle) {
    return fallbackDigest(source);
  }

  const buffer = await window.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(source),
  );

  return Array.from(new Uint8Array(buffer))
    .map((item) => item.toString(16).padStart(2, "0"))
    .join("");
}

type UserCenterButtonProps = {
  variant?: "auth-only" | "button";
};

export function UserCenterButton({ variant = "button" }: UserCenterButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const showButton = variant === "button";
  const panelRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const mottoInputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingAuthHrefRef = useRef<string | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode | null>(null);
  const [authError, setAuthError] = useState("");
  const [authForm, setAuthForm] = useState<AuthFormState>(defaultAuthForm);
  const [authSubmitting, setAuthSubmitting] = useState(false);
  const [open, setOpen] = useState(false);
  const [mottoEditing, setMottoEditing] = useState(false);
  const [mottoDraft, setMottoDraft] = useState(defaultUserCenter.motto);
  const user = useUserCenterState();
  const displayAvatarDataUrl = user.loggedIn ? user.avatarDataUrl : "";
  const displayMotto = user.loggedIn ? mottoDraft : "";

  useEffect(() => {
    if (!open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (
        panelRef.current &&
        event.target instanceof Node &&
        !panelRef.current.contains(event.target)
      ) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function writeUserCenter(nextUser: UserCenterState) {
    setMottoDraft(nextUser.motto);

    if (typeof window !== "undefined") {
      window.localStorage.setItem(USER_CENTER_STORAGE_KEY, JSON.stringify(nextUser));
      window.dispatchEvent(new Event(userCenterChangeEvent));
    }
  }

  useEffect(() => {
    let active = true;

    async function hydrateUserCenter() {
      try {
        const response = await fetchWithLocalUser(
          userCenterApi,
          {},
          { includeLoggedOut: true },
        );

        if (!response.ok || !active) {
          return;
        }

        const data = (await response.json()) as {
          profile?: UserCenterState;
        };

        if (data.profile) {
          writeUserCenter(data.profile);
        }
      } catch {}
    }

    void hydrateUserCenter();

    return () => {
      active = false;
    };
  }, []);

  async function persist(
    nextUser: UserCenterState,
    event?: { payload?: unknown; type: string },
  ) {
    writeUserCenter(nextUser);

    try {
      const response = await fetchWithLocalUser(userCenterApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event,
          profile: nextUser,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(
          data?.error || "服务器暂时无法保存用户数据，请稍后再试",
        );
      }

      const data = (await response.json()) as {
        profile?: UserCenterState;
      };

      if (data.profile) {
        writeUserCenter(data.profile);
      }
    } catch {}
  }

  function recordUserCenterEvent(type: string, payload?: unknown) {
    void fetchWithLocalUser(userCenterApi, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: { payload, type },
      }),
    }).catch(() => {});
  }

  async function submitAuthRequest(
    profile: Partial<UserCenterState>,
    event: { payload?: unknown; type: string },
  ) {
    const response = await fetchWithLocalUser(
      userCenterApi,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, profile }),
      },
      { includeLoggedOut: true },
    );
    const data = (await response.json().catch(() => null)) as {
      error?: string;
      profile?: UserCenterState;
    } | null;

    if (!response.ok) {
      throw new Error(
        data?.error || "服务器暂时无法保存用户数据，请稍后再试",
      );
    }

    if (!data?.profile) {
      throw new Error("服务器暂时无法保存用户数据，请稍后再试");
    }

    writeUserCenter(data.profile);
  }

  useEffect(() => {
    const handleAuthRequest = (event: Event) => {
      const detail =
        event instanceof CustomEvent
          ? (event.detail as UserAuthRequestDetail | undefined)
          : undefined;

      setOpen(false);
      openAuthModal(detail?.mode ?? "register", detail?.href ?? null);
    };

    window.addEventListener(userAuthRequestEvent, handleAuthRequest);

    return () => {
      window.removeEventListener(userAuthRequestEvent, handleAuthRequest);
    };
  });

  useEffect(() => {
    if (typeof window === "undefined" || user.loggedIn) {
      return;
    }

    const stored = window.sessionStorage.getItem(pendingAuthRequestStorageKey);

    if (!stored) {
      return;
    }

    try {
      const detail = JSON.parse(stored) as Partial<StoredAuthRequest>;

      if (detail.href && detail.href !== pathname) {
        return;
      }

      window.sessionStorage.removeItem(pendingAuthRequestStorageKey);
      window.setTimeout(() => {
        requestUserAuth({
          href: detail.href,
          mode: detail.mode ?? "register",
        });
      }, 0);
    } catch {
      window.sessionStorage.removeItem(pendingAuthRequestStorageKey);
    }
  }, [pathname, user.loggedIn]);

  function openAuthModal(mode: AuthMode, pendingHref?: string | null) {
    if (typeof pendingHref !== "undefined") {
      pendingAuthHrefRef.current = pendingHref;
    }

    setAuthMode(mode);
    setAuthError("");
    setAuthForm({
      avatarDataUrl: "",
      nickname: "",
      password: "",
    });
    recordUserCenterEvent("user_center.auth_opened", { mode });
  }

  function closeAuthModal() {
    if (authSubmitting) {
      return;
    }

    pendingAuthHrefRef.current = null;
    setAuthMode(null);
    setAuthError("");
    setAuthForm(defaultAuthForm);
  }

  function updateAuthForm(patch: Partial<AuthFormState>) {
    setAuthForm((current) => ({ ...current, ...patch }));
  }

  async function uploadAvatar(file: File | undefined) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setAuthError("请上传图片格式的头像。");
      return;
    }

    if (file.size > 1024 * 1024) {
      setAuthError("头像先控制在 1MB 以内。");
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      updateAuthForm({ avatarDataUrl: String(reader.result ?? "") });
      setAuthError("");
    };
    reader.onerror = () => {
      setAuthError("头像读取失败，请换一张图片试试。");
    };
    reader.readAsDataURL(file);
  }

  async function submitAuthForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!authMode) {
      return;
    }

    const nickname = authForm.nickname.trim();
    const password = authForm.password;

    if (!nickname) {
      setAuthError("请输入昵称。");
      return;
    }

    if (password.length < 6) {
      setAuthError("密码至少需要 6 位。");
      return;
    }

    setAuthSubmitting(true);

    try {
      const passwordHash = await createPasswordHash(nickname, password);

      await submitAuthRequest(
        {
          avatarDataUrl:
            authMode === "register" ? authForm.avatarDataUrl : undefined,
          loggedIn: true,
          nickname,
          passwordHash,
        },
        {
          type: authMode === "register" ? "user.registered" : "user.logged_in",
          payload: {
            hasAvatar: authMode === "register" && Boolean(authForm.avatarDataUrl),
            nickname,
            source: "auth_modal",
          },
        },
      );
      const pendingHref = pendingAuthHrefRef.current;

      pendingAuthHrefRef.current = null;
      setAuthMode(null);
      setAuthError("");
      setAuthForm(defaultAuthForm);

      if (pendingHref && pendingHref !== pathname) {
        router.push(pendingHref);
      } else {
        window.location.reload();
      }
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : "服务器暂时无法保存用户数据，请稍后再试",
      );
    } finally {
      setAuthSubmitting(false);
    }
  }

  function togglePanel() {
    setOpen((value) => {
      const nextOpen = !value;

      if (nextOpen) {
        setMottoDraft(user.loggedIn ? user.motto : "");
        setMottoEditing(false);
        recordUserCenterEvent("user_center.opened");
      }

      return nextOpen;
    });
  }

  function activateAccount(mode: "login" | "register") {
    pendingAuthHrefRef.current = null;
    openAuthModal(mode);
  }

  function startMottoEdit() {
    if (!user.loggedIn) {
      return;
    }

    setMottoDraft(user.motto);
    setMottoEditing(true);
    window.setTimeout(() => {
      mottoInputRef.current?.focus();
    }, 0);
  }

  function saveMotto() {
    if (!user.loggedIn) {
      return;
    }

    const nextMotto = mottoDraft.trim() || defaultUserCenter.motto;

    setMottoDraft(nextMotto);
    setMottoEditing(false);
    void persist(
      {
        ...user,
        motto: nextMotto,
      },
      {
        type: "user_center.motto_updated",
        payload: { length: nextMotto.length },
      },
    ).catch(() => {});
  }

  function handleMottoAction() {
    if (mottoEditing) {
      saveMotto();
      return;
    }

    startMottoEdit();
  }

  async function logout() {
    if (!user.loggedIn) {
      return;
    }

    const logoutPayload = {
      ...user,
      loggedIn: false,
    };

    try {
      const response = await fetchWithLocalUser(
        userCenterApi,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            event: {
              type: "user.logged_out",
              payload: { source: "user_center" },
            },
            profile: logoutPayload,
          }),
        },
        { includeLoggedOut: true },
      );
      const data = (await response.json().catch(() => null)) as {
        profile?: UserCenterState;
      } | null;

      writeUserCenter(data?.profile ?? loggedOutUserCenter);
    } catch {
      writeUserCenter(loggedOutUserCenter);
    } finally {
      clearBrowserSessionCookie();
      clearLoggedOutScopedState();
      pendingAuthHrefRef.current = null;
      setAuthMode(null);
      setOpen(false);
      window.location.reload();
    }
  }

  return (
    <div
      ref={panelRef}
      data-auth-allow-root="true"
      className={showButton ? "fixed right-12 top-10 z-[70]" : "contents"}
    >
      {showButton ? (
        <button
          type="button"
          aria-label="打开用户中心"
          title="用户中心"
          onClick={togglePanel}
          className={cn(
            "group grid size-[3.25rem] place-items-center rounded-full border border-[#D8B46A]/42",
            "bg-[linear-gradient(145deg,rgba(255,244,216,0.2),rgba(216,180,106,0.12)_48%,rgba(216,167,177,0.12))]",
            "shadow-[0_12px_30px_rgba(0,0,0,0.22),0_0_18px_rgba(216,180,106,0.18),inset_0_1px_0_rgba(255,255,255,0.26)] backdrop-blur-xl",
            "transition duration-300 hover:-translate-y-0.5 hover:border-[#FFF4D8]/70 hover:shadow-[0_14px_34px_rgba(0,0,0,0.24),0_0_24px_rgba(216,180,106,0.28)]",
          )}
        >
          {displayAvatarDataUrl ? (
            <img
              src={displayAvatarDataUrl}
              alt=""
              className="size-9 rounded-full object-cover ring-1 ring-[#FFF4D8]/46"
            />
          ) : (
            <UserRound className="size-5 text-[#FFF4D8] drop-shadow-[0_0_8px_rgba(216,180,106,0.36)]" />
          )}
          <span
            className={cn(
              "absolute bottom-1.5 right-1.5 size-2.5 rounded-full border border-[#0B1020]",
              user.loggedIn ? "bg-[#D8B46A]" : "bg-[#6F7787]",
            )}
          />
        </button>
      ) : null}

      <AnimatePresence>
        {showButton && open ? (
          <motion.section
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="absolute right-0 mt-4 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-[1.6rem] border border-white/12 bg-[#080C18]/86 shadow-[0_28px_90px_rgba(0,0,0,0.42),0_0_70px_rgba(216,180,106,0.12)] backdrop-blur-2xl"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(216,180,106,0.16),transparent_34%),radial-gradient(circle_at_100%_18%,rgba(216,167,177,0.12),transparent_34%)]" />
            <div className="relative p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-full border border-[#D8B46A]/36 bg-[#D8B46A]/14 shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_22px_rgba(216,180,106,0.16)]">
                    {displayAvatarDataUrl ? (
                      <img
                        src={displayAvatarDataUrl}
                        alt=""
                        className="size-full object-cover"
                      />
                    ) : (
                      <UserRound className="size-7 text-[#FFF4D8]" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-[#FFF4D8]">
                      {user.nickname}
                    </p>
                    {user.loggedIn ? (
                      <p className="mt-1 text-xs text-[#AAB4C3]">已登录</p>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="关闭用户中心"
                  onClick={() => setOpen(false)}
                  className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.045] text-[#AAB4C3] transition hover:border-white/18 hover:text-[#FFF4D8]"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="mt-5 rounded-[1.15rem] border border-white/10 bg-white/[0.045] p-3">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <span className="flex items-center gap-2 text-sm font-semibold text-[#D8B46A]">
                    <PencilLine className="size-4" />
                    人生格言
                  </span>
                  {user.loggedIn ? (
                    <button
                      type="button"
                      onClick={handleMottoAction}
                      className="grid size-8 place-items-center rounded-full border border-[#D8B46A]/32 bg-[#D8B46A]/12 text-[#FFF4D8] transition hover:border-[#D8B46A]/56 hover:bg-[#D8B46A]/18"
                      aria-label={mottoEditing ? "保存人生格言" : "编辑人生格言"}
                      title={mottoEditing ? "保存" : "编辑"}
                    >
                      {mottoEditing ? (
                        <Check className="size-4" />
                      ) : (
                        <PencilLine className="size-4" />
                      )}
                    </button>
                  ) : null}
                </div>
                <textarea
                  ref={mottoInputRef}
                  value={displayMotto}
                  onChange={(event) => setMottoDraft(event.target.value)}
                  readOnly={!user.loggedIn || !mottoEditing}
                  aria-disabled={!user.loggedIn}
                  rows={3}
                  maxLength={90}
                  className={cn(
                    "soft-input min-h-20 w-full resize-none rounded-[1rem] px-3 py-2 text-sm leading-6 text-[#F4EFE7]",
                    (!user.loggedIn || !mottoEditing) &&
                      "cursor-default text-[#AAB4C3]",
                  )}
                  placeholder={user.loggedIn ? "写下一句想留给自己的话" : ""}
                />
              </div>

              {!user.loggedIn ? (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => activateAccount("register")}
                    className="premium-button min-h-11 px-3 py-2 text-sm"
                  >
                    <UserRoundPlus className="size-4" />
                    注册
                  </button>
                  <button
                    type="button"
                    onClick={() => activateAccount("login")}
                    className="ghost-button min-h-11 px-3 py-2 text-sm"
                  >
                    <LogIn className="size-4" />
                    登录
                  </button>
                </div>
              ) : null}

              <div className="mt-4 space-y-2 rounded-[1.15rem] border border-white/10 bg-[#050814]/45 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#6F7787]">账号ID</span>
                  <span className="truncate font-medium text-[#F4EFE7]">
                    {user.loggedIn ? user.accountId : ""}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[#6F7787]">账号状态</span>
                  <span className="font-medium text-[#D8B46A]">
                    {user.loggedIn ? "已连接" : "未连接"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={logout}
                disabled={!user.loggedIn}
                className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-4 py-2 text-sm font-semibold text-[#AAB4C3] transition hover:border-white/18 hover:text-[#FFF4D8] disabled:cursor-not-allowed disabled:opacity-45"
              >
                <LogOut className="size-4" />
                退出登录
              </button>
            </div>
          </motion.section>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {authMode ? (
          <motion.div
            className="fixed inset-0 z-[90] grid place-items-center bg-[#030711]/58 px-4 backdrop-blur-md"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                closeAuthModal();
              }
            }}
          >
            <motion.form
              role="dialog"
              aria-modal="true"
              aria-labelledby="user-auth-title"
              onSubmit={submitAuthForm}
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 18, scale: 0.98 }}
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className="relative w-[min(460px,calc(100vw-2rem))] overflow-hidden rounded-[1.75rem] border border-white/12 bg-[#080C18]/92 p-5 shadow-[0_32px_110px_rgba(0,0,0,0.48),0_0_80px_rgba(216,180,106,0.14)] backdrop-blur-2xl"
            >
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_18%_0%,rgba(216,180,106,0.18),transparent_32%),radial-gradient(circle_at_100%_20%,rgba(216,167,177,0.12),transparent_34%)]" />
              <div className="relative">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-11 place-items-center rounded-2xl border border-[#D8B46A]/34 bg-[#D8B46A]/12 text-[#FFF4D8] shadow-[0_0_26px_rgba(216,180,106,0.16)]">
                      <ShieldCheck className="size-5" />
                    </span>
                    <div>
                      <h2
                        id="user-auth-title"
                        className="text-lg font-semibold text-[#FFF4D8]"
                      >
                        {authMode === "register" ? "创建你的账号" : "登录用户中心"}
                      </h2>
                      <p className="mt-1 text-xs leading-5 text-[#AAB4C3]">
                        {authMode === "register"
                          ? "设置昵称和密码，系统会自动生成你的永久账号 ID。"
                          : "用已注册的昵称和密码回到你的记录。"}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label="关闭注册登录窗口"
                    onClick={closeAuthModal}
                    className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.045] text-[#AAB4C3] transition hover:border-white/18 hover:text-[#FFF4D8]"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 rounded-full border border-white/10 bg-[#050814]/42 p-1">
                  {(["register", "login"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => openAuthModal(mode)}
                      className={cn(
                        "min-h-10 rounded-full text-sm font-semibold transition",
                        authMode === mode
                          ? "bg-[linear-gradient(135deg,#D8B46A,#D8A7B1)] text-[#17101C] shadow-[0_12px_28px_rgba(216,180,106,0.18)]"
                          : "text-[#AAB4C3] hover:text-[#F4EFE7]",
                      )}
                    >
                      {mode === "register" ? "注册" : "登录"}
                    </button>
                  ))}
                </div>

                {authMode === "register" ? (
                  <div className="mt-5 flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="group relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-full border border-[#D8B46A]/34 bg-[linear-gradient(145deg,rgba(255,244,216,0.16),rgba(216,180,106,0.12),rgba(216,167,177,0.1))] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_28px_rgba(216,180,106,0.14)]"
                      aria-label="上传头像"
                    >
                      {authForm.avatarDataUrl ? (
                        <img
                          src={authForm.avatarDataUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <UserRound className="size-8 text-[#FFF4D8]" />
                      )}
                      <span className="absolute inset-x-0 bottom-0 grid h-7 place-items-center bg-[#050814]/58 text-[#FFF4D8] opacity-0 backdrop-blur-md transition group-hover:opacity-100">
                        <Camera className="size-4" />
                      </span>
                    </button>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        void uploadAvatar(event.target.files?.[0]);
                        event.currentTarget.value = "";
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-[#FFF4D8]">
                        头像
                      </p>
                      <p className="mt-1 text-xs leading-5 text-[#AAB4C3]">
                        可以上传一张图片，也可以先使用默认头像。
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="ghost-button min-h-9 px-3 py-1.5 text-xs"
                        >
                          <Upload className="size-3.5" />
                          上传头像
                        </button>
                        <button
                          type="button"
                          onClick={() => updateAuthForm({ avatarDataUrl: "" })}
                          className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-1.5 text-xs font-semibold text-[#AAB4C3] transition hover:border-white/18 hover:text-[#FFF4D8]"
                        >
                          默认头像
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-5 flex justify-center">
                    <div className="grid size-20 place-items-center overflow-hidden rounded-full border border-[#D8B46A]/34 bg-[linear-gradient(145deg,rgba(255,244,216,0.16),rgba(216,180,106,0.12),rgba(216,167,177,0.1))] shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_0_28px_rgba(216,180,106,0.14)]">
                      <UserRound className="size-8 text-[#FFF4D8]" />
                    </div>
                  </div>
                )}

                <div className="mt-5 space-y-3">
                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[#D8B46A]">
                      <UserRound className="size-4" />
                      昵称
                    </span>
                    <input
                      value={authForm.nickname}
                      onChange={(event) =>
                        updateAuthForm({ nickname: event.target.value })
                      }
                      className="soft-input min-h-12 w-full rounded-2xl px-4 text-sm"
                      placeholder="请输入昵称"
                      autoComplete="username"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-[#D8B46A]">
                      <KeyRound className="size-4" />
                      密码
                    </span>
                    <input
                      value={authForm.password}
                      onChange={(event) =>
                        updateAuthForm({ password: event.target.value })
                      }
                      className="soft-input min-h-12 w-full rounded-2xl px-4 text-sm"
                      placeholder="至少 6 位"
                      type="password"
                      autoComplete={
                        authMode === "register"
                          ? "new-password"
                          : "current-password"
                      }
                    />
                  </label>
                </div>

                {authError ? (
                  <p className="mt-4 rounded-2xl border border-[#D8A7B1]/22 bg-[#D8A7B1]/10 px-4 py-3 text-sm leading-6 text-[#FFD9E0]">
                    {authError}
                  </p>
                ) : null}

                <div className="mt-5 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    onClick={closeAuthModal}
                    className="ghost-button min-h-11 px-5 text-sm"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={authSubmitting}
                    className="premium-button min-h-11 px-6 text-sm"
                  >
                    {authMode === "register" ? (
                      <UserRoundPlus className="size-4" />
                    ) : (
                      <LogIn className="size-4" />
                    )}
                    {authSubmitting
                      ? "处理中"
                      : authMode === "register"
                        ? "完成注册"
                        : "登录"}
                  </button>
                </div>
              </div>
            </motion.form>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
