import type { Variants } from "motion/react";

export const echoEase = [0.22, 1, 0.36, 1] as const;

export const fadeUp: Variants = {
  hidden: {
    opacity: 0,
    y: 18,
    filter: "blur(8px)",
  },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.62,
      ease: echoEase,
    },
  },
};

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.04,
    },
  },
};

export const softScale: Variants = {
  rest: {
    scale: 1,
  },
  hover: {
    scale: 1.018,
    transition: {
      duration: 0.26,
      ease: echoEase,
    },
  },
  tap: {
    scale: 0.985,
    transition: {
      duration: 0.12,
      ease: echoEase,
    },
  },
};

export const cardHover: Variants = {
  rest: {
    y: 0,
    borderColor: "rgba(255, 255, 255, 0.12)",
    boxShadow: "0 18px 70px rgba(0, 0, 0, 0.24)",
  },
  hover: {
    y: -4,
    borderColor: "rgba(216, 180, 106, 0.28)",
    boxShadow:
      "0 24px 90px rgba(0, 0, 0, 0.3), 0 0 54px rgba(216, 180, 106, 0.14)",
    transition: {
      duration: 0.34,
      ease: echoEase,
    },
  },
};

export const orbBreathing: Variants = {
  rest: {
    scale: 1,
    opacity: 0.86,
    filter: "blur(0px)",
  },
  breathe: {
    scale: [1, 1.035, 1],
    opacity: [0.78, 1, 0.78],
    filter: ["blur(0px)", "blur(0.4px)", "blur(0px)"],
    transition: {
      duration: 4.8,
      ease: "easeInOut",
      repeat: Infinity,
    },
  },
};

export const pageTransition = {
  duration: 0.42,
  ease: echoEase,
};
