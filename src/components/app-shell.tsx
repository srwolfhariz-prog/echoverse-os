"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, Globe2, Mail, MessageCircle } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AuthInteractionGuard } from "@/components/auth-interaction-guard";
import { AtmosphericBackground } from "@/components/visual";
import { GlobalMusicButton } from "@/components/global-music-button";
import { UserActionRecorder } from "@/components/user-action-recorder";
import { UserCenterButton } from "@/components/user-center-button";
import { fetchWithLocalUser } from "@/lib/local-user-client";

const navigation: Array<{
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}> = [
  {
    href: "/echo-room",
    label: "回声人格",
    description: "让另一个你成形",
    icon: MessageCircle,
  },
  {
    href: "/profile",
    label: "回声档案",
    description: "数字记忆库",
    icon: FileText,
  },
  {
    href: "/letters",
    label: "人生回信",
    description: "给现实的一封信",
    icon: Mail,
  },
  {
    href: "/world",
    label: "平行小世界",
    description: "另一个你在生活",
    icon: Globe2,
  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  useEffect(() => {
    if (isHome) {
      return;
    }

    void fetchWithLocalUser("/api/user-memory", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currentModule: pathname.replace(/^\//, "") || "home",
        event: {
          type: "app.page_viewed",
          payload: { pathname },
        },
      }),
    }).catch(() => {});
  }, [isHome, pathname]);

  return (
    <div
      className={cn(
        "relative bg-[#0B1020] text-[#F4EFE7]",
        isHome ? "h-screen overflow-hidden" : "min-h-screen overflow-x-hidden",
      )}
    >
      <AtmosphericBackground />
      <UserActionRecorder />
      <AuthInteractionGuard />
      <GlobalMusicButton />
      <UserCenterButton variant={isHome ? "auth-only" : "button"} />
      <div className="relative z-10 min-h-screen">
        <main
          className={cn(
            "w-full min-w-0",
            isHome
              ? "h-screen overflow-hidden p-0"
              : "min-h-screen px-4 pb-36 pt-5 sm:px-6 lg:px-10 lg:pb-40 lg:pt-9",
          )}
        >
          <AnimatePresence initial={false} mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
              className="w-full min-w-0"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        {!isHome ? <BottomModuleNav pathname={pathname} /> : null}
      </div>
    </div>
  );
}

function BottomModuleNav({ pathname }: { pathname: string }) {
  return (
    <nav
      className="fixed bottom-5 left-1/2 z-50 w-[min(1120px,calc(100vw-2rem))] -translate-x-1/2"
      aria-label="Echoverse modules"
    >
      <div className="grid grid-cols-4 gap-2 rounded-[2rem] border border-white/12 bg-[#070A14]/72 p-2 shadow-[0_24px_90px_rgba(0,0,0,0.36),0_0_80px_rgba(216,180,106,0.12)] backdrop-blur-2xl">
        {navigation.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-h-20 items-center gap-3 rounded-[1.45rem] border px-4 py-3 transition duration-300",
                active
                  ? "border-[#D8B46A]/42 bg-[linear-gradient(135deg,rgba(216,180,106,0.18),rgba(216,167,177,0.1))] text-[#FFF4D8] shadow-[inset_0_0_28px_rgba(255,244,216,0.04),0_14px_34px_rgba(0,0,0,0.22)]"
                  : "border-transparent bg-white/[0.035] text-[#AAB4C3] hover:border-white/14 hover:bg-white/[0.07] hover:text-[#F4EFE7]",
              )}
            >
              <span
                className={cn(
                  "grid size-11 shrink-0 place-items-center rounded-2xl border transition duration-300",
                  active
                    ? "border-[#D8B46A]/42 bg-[#D8B46A]/16 text-[#D8B46A]"
                    : "border-white/10 bg-white/[0.045] text-[#AAB4C3] group-hover:text-[#F4EFE7]",
                )}
              >
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0 text-left">
                <span className="block truncate text-sm font-semibold">
                  {item.label}
                </span>
                <span className="mt-1 block truncate text-xs text-[#6F7787]">
                  {item.description}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
