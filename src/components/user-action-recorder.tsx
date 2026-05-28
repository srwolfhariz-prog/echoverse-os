"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  fetchWithLocalUser,
  getLocalAccountId,
} from "@/lib/local-user-client";

const interactiveSelector =
  'button, a, [role="button"], input[type="button"], input[type="submit"]';
const persistedActionTypes = new Set([
  "button",
  "submit",
  "link",
  "form_submit",
]);

type ActionPayload = {
  actionKind: string;
  ariaLabel?: string;
  href?: string;
  id?: string;
  label: string;
  module: string;
  pathname: string;
  tagName: string;
  timestamp: string;
  title?: string;
};

function cleanText(value: string | null | undefined) {
  return value?.replace(/\s+/g, " ").trim().slice(0, 120) || "";
}

function getElementLabel(element: Element) {
  if (element instanceof HTMLInputElement) {
    return cleanText(element.value || element.ariaLabel || element.title);
  }

  return cleanText(
    element.getAttribute("aria-label") ||
      element.getAttribute("title") ||
      element.textContent,
  );
}

function getActionKind(element: Element) {
  if (element instanceof HTMLAnchorElement) {
    return "link";
  }

  if (
    element instanceof HTMLButtonElement &&
    (element.type || "").toLowerCase() === "submit"
  ) {
    return "submit";
  }

  if (
    element instanceof HTMLInputElement &&
    (element.type || "").toLowerCase() === "submit"
  ) {
    return "submit";
  }

  return "button";
}

function buildPayload(element: Element, pathname: string): ActionPayload {
  const href =
    element instanceof HTMLAnchorElement
      ? element.getAttribute("href") || undefined
      : undefined;

  return {
    actionKind: getActionKind(element),
    ariaLabel: cleanText(element.getAttribute("aria-label")) || undefined,
    href,
    id: element.id || undefined,
    label: getElementLabel(element) || "未命名动作",
    module: pathname.replace(/^\//, "") || "home",
    pathname,
    tagName: element.tagName.toLowerCase(),
    timestamp: new Date().toISOString(),
    title: cleanText(element.getAttribute("title")) || undefined,
  };
}

function recordAction(payload: ActionPayload) {
  if (!getLocalAccountId()) {
    return;
  }

  void fetchWithLocalUser("/api/user-memory", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    keepalive: true,
    body: JSON.stringify({
      currentModule: payload.module,
      appState: {
        "app.last_user_action": payload,
        "app.last_active_at": payload.timestamp,
      },
      event: {
        type: "ui.action_committed",
        payload,
      },
    }),
  }).catch(() => {});
}

export function UserActionRecorder() {
  const pathname = usePathname();
  const recentSubmitClickRef = useRef<{ form: HTMLFormElement; time: number } | null>(
    null,
  );

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const element = target.closest(interactiveSelector);

      if (!element || element.closest("[data-action-log-ignore]")) {
        return;
      }

      const actionKind = getActionKind(element);

      if (!persistedActionTypes.has(actionKind)) {
        return;
      }

      if (
        actionKind === "submit" &&
        (element instanceof HTMLButtonElement ||
          element instanceof HTMLInputElement) &&
        element.form
      ) {
        recentSubmitClickRef.current = {
          form: element.form,
          time: Date.now(),
        };
      }

      recordAction(buildPayload(element, pathname));
    }

    function handleSubmit(event: SubmitEvent) {
      const form = event.target;

      if (!(form instanceof HTMLFormElement)) {
        return;
      }

      const recent = recentSubmitClickRef.current;

      if (
        recent &&
        recent.form === form &&
        Date.now() - recent.time < 1500
      ) {
        return;
      }

      recordAction({
        actionKind: "form_submit",
        id: form.id || undefined,
        label: cleanText(form.getAttribute("aria-label")) || "表单提交",
        module: pathname.replace(/^\//, "") || "home",
        pathname,
        tagName: "form",
        timestamp: new Date().toISOString(),
        title: cleanText(form.getAttribute("title")) || undefined,
      });
    }

    window.addEventListener("click", handleClick, true);
    window.addEventListener("submit", handleSubmit, true);

    return () => {
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("submit", handleSubmit, true);
    };
  }, [pathname]);

  return null;
}
