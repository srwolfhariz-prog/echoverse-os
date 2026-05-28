export const LOCAL_USER_COOKIE = "echoverse-local-account";
export const LOCAL_USER_HEADER = "x-echoverse-account-id";
export const USER_CENTER_STORAGE_KEY = "echoverse.user-center";

export function normalizeLocalAccountId(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().replace(/\s+/g, "-").slice(0, 96);
}

export function localAccountIdToUserId(accountId: string) {
  const normalized = normalizeLocalAccountId(accountId);

  return normalized ? `local-account:${normalized}` : "";
}

