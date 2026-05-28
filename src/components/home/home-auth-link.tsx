"use client";

import Link from "next/link";
import type { ComponentProps, MouseEvent } from "react";
import {
  requestUserAuthAfterNavigation,
  useUserCenterState,
} from "@/components/user-center-button";

type HomeAuthLinkProps = ComponentProps<typeof Link> & {
  authMode?: "login" | "register";
};

function resolveHref(href: HomeAuthLinkProps["href"]) {
  if (typeof href === "string") {
    return href;
  }

  return href.pathname ?? "/";
}

export function HomeAuthLink({
  authMode = "register",
  href,
  onClick,
  ...props
}: HomeAuthLinkProps) {
  const user = useUserCenterState();

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      user.loggedIn ||
      event.button !== 0 ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey
    ) {
      return;
    }

    requestUserAuthAfterNavigation({
      href: resolveHref(href),
      mode: authMode,
    });
  }

  return <Link href={href} onClick={handleClick} {...props} />;
}
