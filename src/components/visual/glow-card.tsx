"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";
import { cardHover } from "@/lib/motion";

type GlowCardProps = HTMLMotionProps<"div">;

export function GlowCard({ children, className, ...props }: GlowCardProps) {
  return (
    <motion.div
      className={cn("echo-glow-card", className)}
      variants={cardHover}
      initial="rest"
      whileHover="hover"
      whileTap={{ scale: 0.985, y: -1 }}
      {...props}
    >
      {children}
    </motion.div>
  );
}
