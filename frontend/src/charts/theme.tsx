import type { ReactNode } from 'react'
import { Card, CardHeader } from '@/components/ui'

export const C = {
  blue: '#3b82f6', violet: '#8b5cf6', green: '#22c55e', amber: '#f59e0b', red: '#ef4444', orange: '#f97316',
  grid: '#1d2638', axis: '#64708a', muted: '#475166', text: '#97a3b8',
}

export const axis = { stroke: C.grid, tick: { fill: C.axis, fontSize: 11 }, tickLine: false, axisLine: false } as const

/** Dark tooltip shared by all charts. */
export function ChartTooltip({ active, payload, label, fmt, labelFmt }: {
  active?: boolean; payload?: { name: string; value: number; color: string; payload: Record<string, unknown> }[]; label?: string
  fmt?: (v: number, name: string, p: Record<string, unknown>) => string; labelFmt?: (l: string, p?: Record<string, unknown>) => ReactNode
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="min-w-[160px] rounded-lg border border-line2 bg-[#0d1320]/95 px-3 py-2 text-xs shadow-2xl">
      {label != null && <div className="mb-1.5 max-w-[260px] font-medium text-fg">{labelFmt ? labelFmt(label, payload[0]?.payload) : label}</div>}
      {payload.map((p) => (
        <div key={p.name} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-sub"><span className="h-2 w-2 rounded-sm" style={{ background: p.color }} />{p.name}</span>
          <span className="tnum font-medium text-fg">{fmt ? fmt(p.value, p.name, p.payload) : p.value}</span>
        </div>
      ))}
    </div>
  )
}

export function ChartCard({ title, subtitle, icon, action, children, footer, className }: {
  title: string; subtitle?: string; icon?: ReactNode; action?: ReactNode; children: ReactNode; footer?: ReactNode; className?: string
}) {
  return (
    <Card className={className}>
      <CardHeader title={title} subtitle={subtitle} icon={icon} action={action} />
      <div className="px-3 pb-3 pt-4">{children}</div>
      {footer && <div className="border-t border-line px-5 py-2.5 text-2xs text-faint">{footer}</div>}
    </Card>
  )
}

export function Legend({ items }: { items: { label: string; color: string; dashed?: boolean }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 px-2 pt-2 text-2xs text-sub">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className="h-0.5 w-3.5 rounded" style={{ background: i.dashed ? 'transparent' : i.color, borderTop: i.dashed ? `2px dashed ${i.color}` : undefined }} />
          {i.label}
        </span>
      ))}
    </div>
  )
}
