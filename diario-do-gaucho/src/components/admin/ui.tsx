import type { OrderStatus } from "@/lib/types";

export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-titanium">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

const STATUS: Record<OrderStatus, { label: string; cls: string }> = {
  pending: { label: "Aguardando", cls: "bg-warning/12 text-warning" },
  paid: { label: "Pago", cls: "bg-success/12 text-success" },
  expired: { label: "Expirado", cls: "bg-white/8 text-titanium" },
  cancelled: { label: "Cancelado", cls: "bg-danger/12 text-danger" },
};

export function StatusBadge({ status, reported }: { status: OrderStatus; reported?: boolean }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>
      {status === "pending" && reported && (
        <span className="inline-flex rounded-full bg-sky/12 px-2.5 py-1 text-xs font-medium text-sky">Cliente avisou</span>
      )}
    </span>
  );
}

export function Card({ className = "", children }: { className?: string; children: React.ReactNode }) {
  return <section className={`glass rounded-[28px] p-5 sm:p-6 ${className}`}>{children}</section>;
}
