"use client";

// YES-probability over time. Recharts area chart themed with the Verex
// indigo accent.

import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useLocale } from "@/components/LocaleProvider";
import type { PricePoint } from "@/lib/api";

export function ProbChart({
  points,
  height = 220,
}: {
  points: PricePoint[];
  height?: number;
}) {
  const { intl } = useLocale();
  const data = points.map((p) => ({
    at: new Date(p.at).toLocaleDateString(intl, { month: "short", day: "numeric" }),
    pct: Math.round(Number(p.price) * 100),
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="probFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(243 75% 55%)" stopOpacity={0.25} />
            <stop offset="100%" stopColor="hsl(243 75% 55%)" stopOpacity={0} />
          </linearGradient>
        </defs>
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
          formatter={(value) => [`${value}%`, "Yes"]}
          contentStyle={{
            borderRadius: 8,
            border: "1px solid hsl(240 6% 90%)",
            fontSize: 12,
          }}
        />
        <Area
          type="monotone"
          dataKey="pct"
          stroke="hsl(243 75% 55%)"
          strokeWidth={2}
          fill="url(#probFill)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
