"use client";

import { useId, useMemo, useState } from "react";
import type { VolumePoint } from "@/features/admin/queries";

// Stacked columns: appointments per day, split into "kept" and "cancelled".
// Encodes the dataviz method: categorical slots 1-2 in fixed order (validated light + dark), <=24px columns, 4px
// rounded data-end on the outermost segment only, 2px surface gap between stacked segments, hairline solid grid,
// legend for two series, one sparse direct label (the latest day), per-column hover/focus tooltip, table view.

const W = 720;
const H = 280;
const MARGIN = { top: 22, right: 12, bottom: 34, left: 40 };
const INNER_W = W - MARGIN.left - MARGIN.right;
const INNER_H = H - MARGIN.top - MARGIN.bottom;
const MAX_BAR = 24;
const RADIUS = 4;
const GAP = 2;

const KEPT = "var(--series-1)";
const CANCELLED = "var(--series-2)";

function niceStep(raw: number): number {
  const power = 10 ** Math.floor(Math.log10(Math.max(raw, 1)));
  for (const multiple of [1, 2, 5, 10]) if (raw <= multiple * power) return Math.max(1, multiple * power);
  return 10 * power;
}

function segment(x: number, top: number, width: number, height: number, roundTop: boolean): string {
  if (height <= 0) return "";
  const r = roundTop ? Math.min(RADIUS, height, width / 2) : 0;
  const bottom = top + height;
  if (r === 0) return `M${x},${bottom}V${top}H${x + width}V${bottom}Z`;
  return `M${x},${bottom}V${top + r}A${r},${r} 0 0 1 ${x + r},${top}H${x + width - r}A${r},${r} 0 0 1 ${x + width},${top + r}V${bottom}Z`;
}

const dayFormat = new Intl.DateTimeFormat("en-US", { day: "numeric", month: "short", timeZone: "UTC" });
const longDayFormat = new Intl.DateTimeFormat("en-US", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const asUtc = (ymd: string) => new Date(`${ymd}T12:00:00Z`);

export function VolumeChart({ data }: { data: VolumePoint[] }) {
  const titleId = useId();
  const [active, setActive] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { step, max, slot, barWidth, y } = useMemo(() => {
    const peak = Math.max(...data.map((point) => point.total), 0);
    const niceStepValue = niceStep(Math.max(peak, 4) / 4);
    const niceMax = niceStepValue * 4;
    const slotWidth = INNER_W / Math.max(data.length, 1);
    return {
      step: niceStepValue,
      max: niceMax,
      slot: slotWidth,
      barWidth: Math.min(MAX_BAR, slotWidth * 0.6),
      y: (value: number) => MARGIN.top + INNER_H - (value / niceMax) * INNER_H,
    };
  }, [data]);

  const total = data.reduce((sum, point) => sum + point.total, 0);
  const cancelledTotal = data.reduce((sum, point) => sum + point.cancelled, 0);
  const ticks = [0, 1, 2, 3, 4].map((index) => index * step);
  const baseline = y(0);
  const last = data.length - 1;
  const activePoint = active === null ? null : data[active];
  const activeCenter = active === null ? 0 : MARGIN.left + slot * (active + 0.5);

  return (
    <figure className="grid gap-3" aria-labelledby={titleId}>
      <figcaption className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id={titleId} className="text-base font-semibold">
            Appointment volume
          </h3>
          <p className="text-sm text-muted-foreground">
            Last {data.length} days by appointment date · {total} total, {cancelledTotal} cancelled
          </p>
        </div>
        <ul className="flex items-center gap-4 text-sm" aria-label="Legend">
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: KEPT }} />
            Kept
          </li>
          <li className="flex items-center gap-2">
            <span aria-hidden="true" className="size-2.5 rounded-[3px]" style={{ background: CANCELLED }} />
            Cancelled
          </li>
        </ul>
      </figcaption>

      {total === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No appointments in this period yet.
        </p>
      ) : (
        <div className="relative" onPointerLeave={() => setActive(null)}>
          <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Stacked column chart of daily appointments" className="block h-auto w-full">
            {ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={MARGIN.left}
                  x2={W - MARGIN.right}
                  y1={y(tick)}
                  y2={y(tick)}
                  style={{ stroke: tick === 0 ? "var(--viz-axis)" : "var(--viz-grid)" }}
                  strokeWidth={1}
                />
                <text x={MARGIN.left - 8} y={y(tick) + 4} textAnchor="end" fontSize={11} style={{ fill: "var(--viz-muted)" }} className="tabular-nums">
                  {tick}
                </text>
              </g>
            ))}

            {data.map((point, index) => {
              const cx = MARGIN.left + slot * (index + 0.5);
              const x = cx - barWidth / 2;
              const kept = point.total - point.cancelled;
              const keptHeight = (kept / max) * INNER_H;
              const cancelledHeight = (point.cancelled / max) * INNER_H;
              const stacked = kept > 0 && point.cancelled > 0;
              const keptTop = baseline - keptHeight;
              const cancelledTop = keptTop - (stacked ? GAP : 0) - cancelledHeight;
              const isActive = active === index;

              return (
                <g
                  key={point.date}
                  tabIndex={0}
                  role="img"
                  aria-label={`${longDayFormat.format(asUtc(point.date))}: ${point.total} appointments, ${point.cancelled} cancelled`}
                  onPointerEnter={() => setActive(index)}
                  onPointerMove={() => setActive(index)}
                  onFocus={() => setActive(index)}
                  onBlur={() => setActive(null)}
                  className="outline-none"
                  data-testid="volume-column"
                >
                  {isActive ? (
                    <rect x={MARGIN.left + slot * index} y={MARGIN.top} width={slot} height={INNER_H} rx={6} style={{ fill: "var(--muted)" }} opacity={0.7} />
                  ) : null}
                  <path d={segment(x, keptTop, barWidth, keptHeight, !stacked)} style={{ fill: KEPT }} />
                  <path d={segment(x, cancelledTop, barWidth, cancelledHeight, true)} style={{ fill: CANCELLED }} />
                  {/* Hit target is the whole slot, far larger than the painted bar. */}
                  <rect x={MARGIN.left + slot * index} y={MARGIN.top} width={slot} height={INNER_H} fill="transparent" />
                  {index === last && point.total > 0 ? (
                    <text x={cx} y={cancelledTop - 6} textAnchor="middle" fontSize={12} fontWeight={600} style={{ fill: "var(--foreground)" }}>
                      {point.total}
                    </text>
                  ) : null}
                  {(last - index) % 2 === 0 ? (
                    <text x={cx} y={H - 12} textAnchor="middle" fontSize={11} style={{ fill: "var(--viz-muted)" }}>
                      {dayFormat.format(asUtc(point.date))}
                    </text>
                  ) : null}
                </g>
              );
            })}
          </svg>

          {activePoint ? (
            <div
              role="tooltip"
              data-testid="volume-tooltip"
              className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-lg border bg-popover p-3 text-sm shadow-md"
              style={{ left: `clamp(5.5rem, ${(activeCenter / W) * 100}%, calc(100% - 5.5rem))` }}
            >
              <p className="text-xs text-muted-foreground">{longDayFormat.format(asUtc(activePoint.date))}</p>
              <dl className="mt-1.5 grid gap-1">
                {[
                  { label: "Kept", value: activePoint.total - activePoint.cancelled, color: KEPT },
                  { label: "Cancelled", value: activePoint.cancelled, color: CANCELLED },
                ].map((row) => (
                  <div key={row.label} className="flex items-center justify-between gap-3">
                    <dt className="flex items-center gap-2 text-muted-foreground">
                      <span aria-hidden="true" className="h-0.5 w-3 rounded-full" style={{ background: row.color }} />
                      {row.label}
                    </dt>
                    <dd className="font-semibold tabular-nums">{row.value}</dd>
                  </div>
                ))}
                <div className="flex items-center justify-between gap-3 border-t pt-1">
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="font-semibold tabular-nums">{activePoint.total}</dd>
                </div>
              </dl>
            </div>
          ) : null}
        </div>
      )}

      <div>
        <button
          type="button"
          onClick={() => setShowTable((current) => !current)}
          aria-expanded={showTable}
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          {showTable ? "Hide table" : "View as table"}
        </button>
        {showTable ? (
          <div className="mt-3 overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <caption className="sr-only">Appointments per day</caption>
              <thead className="bg-muted/50 text-left text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Kept
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Cancelled
                  </th>
                  <th scope="col" className="px-3 py-2 text-right font-medium">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {data.map((point) => (
                  <tr key={point.date} className="border-t">
                    <th scope="row" className="px-3 py-1.5 text-left font-normal">
                      {longDayFormat.format(asUtc(point.date))}
                    </th>
                    <td className="px-3 py-1.5 text-right">{point.total - point.cancelled}</td>
                    <td className="px-3 py-1.5 text-right">{point.cancelled}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{point.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </figure>
  );
}
