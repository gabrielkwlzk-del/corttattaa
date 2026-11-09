import type { Transition, Variants } from "framer-motion";

export const spring: Transition = { type: "spring", stiffness: 260, damping: 30, mass: 0.9 };
export const softSpring: Transition = { type: "spring", stiffness: 170, damping: 26 };

export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.05 } },
};

export const rise: Variants = {
  hidden: { opacity: 0, y: 24, filter: "blur(8px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { type: "spring", stiffness: 140, damping: 22 } },
};
