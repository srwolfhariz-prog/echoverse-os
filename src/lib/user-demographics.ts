export type UserGender = "female" | "male";

export const userGenderLabels: Record<UserGender, string> = {
  female: "女性",
  male: "男性",
};

export function normalizeUserGender(value: unknown): UserGender | undefined {
  return value === "female" || value === "male" ? value : undefined;
}

export function normalizeBirthDate(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return "";
  }

  const date = new Date(`${trimmed}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const normalized = date.toISOString().slice(0, 10);

  return normalized === trimmed ? normalized : "";
}

export function calculateAgeFromBirthDate(
  birthDate: string | undefined,
  now = new Date(),
) {
  const normalized = normalizeBirthDate(birthDate);

  if (!normalized) {
    return null;
  }

  const [year, month, day] = normalized.split("-").map(Number);
  let age = now.getFullYear() - year;
  const monthDelta = now.getMonth() + 1 - month;

  if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < day)) {
    age -= 1;
  }

  return Number.isFinite(age) ? age : null;
}

export function isUsableBirthDate(value: unknown) {
  const birthDate = normalizeBirthDate(value);
  const age = calculateAgeFromBirthDate(birthDate);

  return Boolean(birthDate && age !== null && age >= 0 && age <= 120);
}
