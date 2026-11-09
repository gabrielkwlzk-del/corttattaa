"use client";
import { MotionConfig } from "framer-motion";

/** Respeita prefers-reduced-motion em todas as animações do Framer Motion. */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ type: "spring", stiffness: 260, damping: 30 }}>
      {children}
    </MotionConfig>
  );
}
