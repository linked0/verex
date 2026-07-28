"use client";

// Multi-series probability chart for a group — one line per outcome (top 5
// by current probability), fixed palette + legend.

import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { GroupSeries } from "@/lib/api";

/// Series palette — starts at the Verex indigo, then diverges.
const COLORS = [
  "hsl(243 75% 55%)",
  "hsl(160 84% 35%)",
  "hsl(350 80% 55%)",
  "hsl(38 92% 50%)",
  "hsl(200 90% 45%)",
];

export function GroupChart({
  series,
  height = 260,
}: {
  series: GroupSeries[];
  height?: number;
}) {
  const top = series.slice(0, COLORS.length);

  // Merge per-member points into one time-indexed table (recharts wants
  // rows). Points are already time-ascending per member.
  const byTime = new Map<string, Record<string, number | string>>();
  for (const s of top) {
    for (const p of s.points) {
      const key = new Date(p.at).toISOString();
      const row = byTime.get(key) ?? {
        at: new Date(p.at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        ts: key,
      };
      row[s.label] = Math.round(Number(p.price) * 100);
      byTime.set(key, row);
    }
  }
  const data = [...byTime.values()].sort((a, b) =>
    String(a.ts).localeCompare(String(b.ts)),
  );

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <XAxis
            dataKey="at"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "hsl(240 4% 46%)" }}
            minTickGap={48}
          />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11, fill: "hsl(240 4% 46%)" }}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            formatter={(value, name) => [`${value}%`, name]}
            contentStyle={{
              borderRadius: 8,
              border: "1px solid hsl(240 6% 90%)",
              fontSize: 12,
            }}
          />
          {top.map((s, i) => (
            <Line
              key={s.slug}
              type="monotone"
              dataKey={s.label}
              stroke={COLORS[i]}
              strokeWidth={2}
              dot={false}
              connectNulls
              // The dash-based entry animation stalls at fully-hidden when
              // several lines mount from merged sparse rows — draw directly.
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {top.map((s, i) => (
          <span key={s.slug} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: COLORS[i] }} />
            {s.label}
          </span>
        ))}
        {series.length > top.length && (
          <span className="text-xs text-muted-foreground">+{series.length - top.length} more</span>
        )}
      </div>
    </div>
  );
}
