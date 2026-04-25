import { cn } from "@/lib/utils";

/** Compact figures for big numbers (1,284 / 12.9K), following the stat-tile contract. */
export function formatFigure(value: number): string {
  return value >= 10_000
    ? new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value)
    : new Intl.NumberFormat("en-US").format(value);
}

/** label (sentence case) · value (semibold, proportional figures) · optional hint. */
export function StatTile({
  label,
  value,
  hint,
  className,
  testId,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  className?: string;
  testId?: string;
}) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-1 text-3xl font-semibold leading-tight" data-testid={testId}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
