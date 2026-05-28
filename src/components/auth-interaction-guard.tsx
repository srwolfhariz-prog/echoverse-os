"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { useUserCenterState } from "@/components/user-center-button";

const blockedSelector =
  'button, a, [role="button"], input[type="button"], input[type="submit"]';

type LoginToast = {
  id: number;
};

const allowedNavigationHrefs = new Set([
  "/",
  "/echo-room",
  "/profile",
  "/letters",
  "/world",
]);

function isAllowedNavigationLink(element: Element) {
  const link = element.closest("a");

  if (!(link instanceof HTMLAnchorElement)) {
    return false;
  }

  const href = link.getAttribute("href") ?? "";

  return allowedNavigationHrefs.has(href);
}

function isAllowedInteraction(element: Element) {
  return Boolean(
    element.closest("[data-auth-allow-root], [data-auth-allow]") ||
      isAllowedNavigationLink(element),
  );
}

export function AuthInteractionGuard() {
  const pathname = usePathname();
  const user = useUserCenterState();
  const isHome = pathname === "/";
  const locked = !user.loggedIn && !isHome;
  const [toast, setToast] = useState<LoginToast | null>(null);

  function showLoginToast() {
    const id = Date.now();

    setToast({ id });
    window.setTimeout(() => {
      setToast((current) => (current?.id === id ? null : current));
    }, 1500);
  }

  useEffect(() => {
    if (locked) {
      document.documentElement.dataset.authLocked = "true";
    } else {
      delete document.documentElement.dataset.authLocked;
    }

    return () => {
      delete document.documentElement.dataset.authLocked;
    };
  }, [locked]);

  useEffect(() => {
    if (!locked) {
      return;
    }

    function handleClick(event: MouseEvent) {
      const target = event.target;

      if (!(target instanceof Element)) {
        return;
      }

      const element = target.closest(blockedSelector);

      if (!element || isAllowedInteraction(element)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showLoginToast();
    }

    function handleSubmit(event: SubmitEvent) {
      const target = event.target;

      if (!(target instanceof Element) || isAllowedInteraction(target)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      showLoginToast();
    }

    window.addEventListener("click", handleClick, true);
    window.addEventListener("submit", handleSubmit, true);

    return () => {
      window.removeEventListener("click", handleClick, true);
      window.removeEventListener("submit", handleSubmit, true);
    };
  }, [locked]);

  return (
    <AnimatePresence>
      {toast ? (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, scale: 0.94, y: 6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.98, y: -14 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="pointer-events-none fixed left-1/2 top-1/2 z-[120] -translate-x-1/2 -translate-y-1/2 rounded-[1.35rem] border border-[#D8B46A]/42 bg-[#080C18]/88 px-10 py-5 text-xl font-semibold text-[#FFF4D8] shadow-[0_22px_70px_rgba(0,0,0,0.38),0_0_42px_rgba(216,180,106,0.2)] backdrop-blur-2xl"
        >
          请登录
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
