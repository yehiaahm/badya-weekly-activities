import { useRef, useState, type FocusEvent, type PointerEvent } from 'react';

export interface BarDatum {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  /** Extra context shown in the tooltip only (the value itself is always labelled at the bar tip). */
  detail?: string;
}

interface Tooltip {
  datum: BarDatum;
  x: number;
  y: number;
}

/**
 * Single-series horizontal bar chart: one hue for every bar, value at the tip,
 * a per-bar tooltip on hover and keyboard focus. The title of the surrounding
 * card names the measure, so no legend is needed.
 */
export function BarChart({ data, unit, format = String }: { data: BarDatum[]; unit: string; format?: (value: number) => string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));

  const place = (datum: BarDatum, clientX: number, clientY: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTooltip({ datum, x: Math.min(clientX - box.left + 12, box.width - 180), y: clientY - box.top + 14 });
  };

  const onFocus = (datum: BarDatum) => (event: FocusEvent<HTMLDivElement>) => {
    const bar = event.currentTarget.getBoundingClientRect();
    place(datum, bar.left + bar.width / 2, bar.top + bar.height / 2);
  };

  return (
    <div className="bar-chart" ref={ref} onPointerLeave={() => setTooltip(null)}>
      {data.map((datum) => (
        <div key={datum.key} className="bar-row">
          <div className="bar-label" title={datum.label}>
            {datum.label}
            {datum.sublabel && <small>{datum.sublabel}</small>}
          </div>
          <div
            className={`bar-hit ${tooltip?.datum.key === datum.key ? 'is-hovered' : ''}`}
            tabIndex={0}
            aria-label={`${datum.label}: ${format(datum.value)} ${unit}${datum.detail ? `, ${datum.detail}` : ''}`}
            onPointerMove={(event: PointerEvent<HTMLDivElement>) => place(datum, event.clientX, event.clientY)}
            onFocus={onFocus(datum)}
            onBlur={() => setTooltip(null)}
          >
            <span className="bar" style={{ width: `calc((100% - 56px) * ${datum.value / max})` }} />
            <span className="bar-value">{format(datum.value)}</span>
          </div>
        </div>
      ))}
      {tooltip && (
        <div className="chart-tooltip" style={{ left: Math.max(tooltip.x, 0), top: tooltip.y }} role="tooltip">
          <div className="chart-tooltip-value">
            <span className="line-key" aria-hidden />
            <strong>{format(tooltip.datum.value)}</strong> {unit}
          </div>
          <div className="chart-tooltip-label">{tooltip.datum.label}</div>
          {tooltip.datum.detail && <div className="chart-tooltip-detail">{tooltip.datum.detail}</div>}
        </div>
      )}
    </div>
  );
}
