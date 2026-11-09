export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <span
        aria-hidden
        className="relative grid size-8 place-items-center rounded-[11px] bg-gradient-to-b from-white to-[#cfd6e3] shadow-[0_6px_20px_-6px_rgba(120,169,255,0.6)]"
      >
        <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="#08090D" strokeWidth="2.2" strokeLinecap="round">
          <circle cx="12" cy="12" r="4.2" />
          <path d="M4 8.5V7a3 3 0 0 1 3-3h1.5M20 8.5V7a3 3 0 0 0-3-3h-1.5M4 15.5V17a3 3 0 0 0 3 3h1.5M20 15.5V17a3 3 0 0 1-3 3h-1.5" />
        </svg>
      </span>
      <span className="text-[15px] font-semibold tracking-[-0.02em] text-white">
        Diário do Gaúcho
      </span>
    </span>
  );
}
