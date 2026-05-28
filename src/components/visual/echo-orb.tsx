"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";
import { orbBreathing } from "@/lib/motion";

type EchoOrbProps = HTMLMotionProps<"div"> & {
  size?: "sm" | "md" | "lg";
};

const sizes = {
  sm: "size-24",
  md: "size-40",
  lg: "size-64",
};

export function EchoOrb({ className, size = "md", ...props }: EchoOrbProps) {
  return (
    <motion.div
      className={cn("echo-orb-visual", sizes[size], className)}
      variants={orbBreathing}
      initial="rest"
      animate="breathe"
      {...props}
    >
      <span className="echo-orb-visual__halo" />
      <span className="echo-orb-visual__core" />
      <span className="echo-orb-visual__ring" />
    </motion.div>
  );
}
