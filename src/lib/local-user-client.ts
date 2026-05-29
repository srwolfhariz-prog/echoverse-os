import {
  LOCAL_USER_HEADER,
  USER_CENTER_STORAGE_KEY,
  normalizeLocalAccountId,
} from "@/lib/local-user-session";

type LocalUserSnapshot = {
  accountId?: string;
  loggedIn?: boolean;
};

type LocalUserHeaderOptions = {
  includeLoggedOut?: boolean;
};

export function getLocalAccountId(options: LocalUserHeaderOptions = {}) {
  if (typeof window === "undefined") {
    return "";
  }

  try {
    window.localStorage.removeItem(USER_CENTER_STORAGE_KEY);

    const stored = window.sessionStorage.getItem(USER_CENTER_STORAGE_KEY);
    const parsed = stored ? (JSON.parse(stored) as LocalUserSnapshot) : {};

    if (!options.includeLoggedOut && !parsed.loggedIn) {
      return "";
    }

    return normalizeLocalAccountId(parsed.accountId);
  } catch {
    return "";
  }
}

export function createLocalUserHeaders(
  headers?: HeadersInit,
  options: LocalUserHeaderOptions = {},
) {
  const nextHeaders = new Headers(headers);
  const accountId = getLocalAccountId(options);

  if (accountId && !nextHeaders.has(LOCAL_USER_HEADER)) {
    nextHeaders.set(LOCAL_USER_HEADER, accountId);
  }

  return nextHeaders;
}

export function fetchWithLocalUser(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: LocalUserHeaderOptions = {},
) {
  const accountId = getLocalAccountId(options);

  if (!accountId && !options.includeLoggedOut) {
    return Promise.resolve(
      new Response(JSON.stringify({ error: "请登录后再使用这个功能。" }), {
        headers: { "Content-Type": "application/json" },
        status: 401,
      }),
    );
  }

  return fetch(input, {
    ...init,
    headers: createLocalUserHeaders(init.headers, options),
  });
}

export function scopedLocalStorageKey(key: string) {
  const accountId = getLocalAccountId();

  return accountId ? `${key}:${accountId}` : `${key}:guest`;
}
