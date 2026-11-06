import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, ArrowDown, ArrowUp, ChevronsUpDown, Database, FlaskConical, Inbox, Loader2, RefreshCw, X } from 'lucide-react'
import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { useApp } from '@/state/app'

/* ------------------------------------------------------------------ surfaces */
export function Card({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('card', className)} {...rest}>{children}</div>
}

export function CardHeader({ title, subtitle, icon, action, className }: {
  title: ReactNode; subtitle?: ReactNode; icon?: ReactNode; action?: ReactNode; className?: string
}) {
  return (
    <div className={cn('flex items-start justify-between gap-3 px-5 pt-4', className)}>
      <div className="min-w-0">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">{icon && <span className="text-sub">{icon}</span>}{title}</div>
        {subtitle && <div className="mt-0.5 text-xs text-sub">{subtitle}</div>}
      </div>
      {action}
    </div>
  )
}

export function PageHeader({ title, description, actions, meta }: { title: string; description?: string; actions?: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg md:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-sub">{description}</p>}
        {meta && <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------ buttons */
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'memory' | 'danger'
export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-primary text-white hover:bg-[#2f74e6] border-transparent',
    memory: 'bg-memory text-white hover:bg-[#7c4ff0] border-transparent',
    secondary: 'bg-raised text-fg hover:bg-[#1d283d] border-line2',
    ghost: 'bg-transparent text-sub hover:text-fg hover:bg-raised border-transparent',
    danger: 'bg-crit/90 text-white hover:bg-crit border-transparent',
  }
  return (
    <button
      className={cn('inline-flex items-center justify-center gap-2 rounded-lg border font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-8 px-2.5 text-xs' : 'h-9 px-3.5 text-sm', v[variant], className)}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  )
}

/* ------------------------------------------------------------------ badges */
const tone = {
  neutral: 'bg-raised text-sub border-line2',
  blue: 'bg-primary-soft/60 text-primary-fg border-primary/30',
  violet: 'bg-memory-soft/70 text-memory-fg border-memory/30',
  green: 'bg-ok-soft text-ok-fg border-ok/25',
  amber: 'bg-warn-soft text-warn-fg border-warn/25',
  red: 'bg-crit-soft text-crit-fg border-crit/30',
}
export type Tone = keyof typeof tone
export function Badge({ tone: t = 'neutral', children, className, icon }: { tone?: Tone; children: ReactNode; className?: string; icon?: ReactNode }) {
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-2xs font-medium', tone[t], className)}>{icon}{children}</span>
}

export function RiskBadge({ level, score }: { level: string; score?: number }) {
  const t: Record<string, Tone> = { critical: 'red', high: 'red', medium: 'amber', low: 'green' }
  return <Badge tone={t[level] || 'neutral'} className="capitalize"><span className="h-1.5 w-1.5 rounded-full" style={{ background: 'currentColor' }} />{level}{score != null && <span className="tnum opacity-75">· {score}</span>}</Badge>
}

export function SeverityBadge({ sev }: { sev: string }) {
  return <Badge tone={sev === 'SEV1' ? 'red' : sev === 'SEV2' ? 'amber' : 'neutral'}>{sev}</Badge>
}

/** Where a piece of data came from: a live Hindsight API call, the local fallback store, or seeded illustrative data. */
export function SourceBadge({ source }: { source: 'hindsight' | 'local-fallback' | 'seed' | string }) {
  if (source === 'hindsight') return <Badge tone="violet" icon={<Database className="h-3 w-3" />}>Hindsight API</Badge>
  if (source === 'local-fallback') return <Badge tone="amber" icon={<Database className="h-3 w-3" />}>Local fallback store</Badge>
  return <Badge tone="neutral" icon={<FlaskConical className="h-3 w-3" />}>Illustrative seed data</Badge>
}

/** An ID chip — opens the record drawer. */
export function Ref({ id, className }: { id: string; className?: string }) {
  const { openRecord } = useApp()
  const inc = id.startsWith('INC')
  return (
    <button onClick={(e) => { e.stopPropagation(); openRecord(id) }}
      className={cn('inline-flex shrink-0 items-center whitespace-nowrap rounded-md border px-1.5 py-0.5 font-mono text-2xs transition-colors',
        inc ? 'border-crit/30 bg-crit-soft/50 text-crit-fg hover:bg-crit-soft' : 'border-memory/30 bg-memory-soft/50 text-memory-fg hover:bg-memory-soft', className)}>
      {id}
    </button>
  )
}

export function Confidence({ value, className }: { value: number; className?: string }) {
  const c = value >= 0.75 ? '#8b5cf6' : value >= 0.55 ? '#3b82f6' : '#64708a'
  return (
    <div className={cn('flex items-center gap-2', className)} title={`${Math.round(value * 100)}% confidence`}>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-line"><motion.div className="h-full rounded-full" style={{ background: c }} initial={{ width: 0 }} animate={{ width: `${value * 100}%` }} transition={{ duration: 0.6 }} /></div>
      <span className="tnum text-2xs text-sub">{Math.round(value * 100)}%</span>
    </div>
  )
}

/* ------------------------------------------------------------------ stat */
export function Stat({ label, value, sub, icon, accent = 'blue', loading }: {
  label: string; value: ReactNode; sub?: ReactNode; icon: ReactNode; accent?: 'blue' | 'violet' | 'green' | 'amber' | 'red'; loading?: boolean
}) {
  const a = { blue: 'text-primary bg-primary-soft/50', violet: 'text-memory bg-memory-soft/60', green: 'text-ok bg-ok-soft', amber: 'text-warn bg-warn-soft', red: 'text-crit bg-crit-soft' }[accent]
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-sub">{label}</span>
        <span className={cn('grid h-7 w-7 place-items-center rounded-lg', a)}>{icon}</span>
      </div>
      {loading ? <Skeleton className="mt-3 h-8 w-20" /> : <div className="tnum mt-2 text-[28px] font-semibold leading-none tracking-tight">{value}</div>}
      {sub && <div className="mt-2 text-xs text-sub">{sub}</div>}
    </Card>
  )
}

/* ------------------------------------------------------------------ states */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-raised', className)} />
}

export function LoadingBlock({ rows = 4, label }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-3 p-5" aria-busy="true">
      {label && <div className="flex items-center gap-2 text-xs text-sub"><Loader2 className="h-3.5 w-3.5 animate-spin" />{label}</div>}
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-4" />)}
    </div>
  )
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 grid h-10 w-10 place-items-center rounded-xl border border-line2 bg-raised text-sub">{icon || <Inbox className="h-5 w-5" />}</div>
      <div className="text-sm font-medium">{title}</div>
      {body && <p className="mt-1 max-w-sm text-xs text-sub">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: Error | string; onRetry?: () => void }) {
  return (
    <div className="m-4 flex items-start gap-3 rounded-lg border border-crit/30 bg-crit-soft/40 p-4 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-crit" />
      <div className="flex-1">
        <div className="font-medium text-crit-fg">Couldn't load this data</div>
        <div className="mt-0.5 text-xs text-sub">{typeof error === 'string' ? error : error.message}</div>
      </div>
      {onRetry && <Button size="sm" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>Retry</Button>}
    </div>
  )
}

/* ------------------------------------------------------------------ form controls */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      <div className="mt-1.5">{children}</div>
      {hint && <span className="mt-1 block text-2xs text-faint">{hint}</span>}
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-line2 bg-bg/50 p-0.5" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors', value === o.value ? 'text-fg' : 'text-sub hover:text-fg')}>
          {value === o.value && <motion.span layoutId={`seg-${options.map((x) => x.value).join()}`} className="absolute inset-0 rounded-md bg-raised ring-1 ring-line2" />}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ dialog */
export function Dialog({ open, onClose, title, description, children, footer, wide }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; wide?: boolean
}) {
  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} />
          <motion.div role="dialog" aria-modal="true" aria-label={title}
            className={cn('relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-line2 bg-panel shadow-2xl sm:rounded-2xl', wide ? 'max-w-3xl' : 'max-w-lg')}
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.18 }}>
            <div className="flex items-start justify-between border-b border-line px-6 py-4">
              <div>
                <h2 className="text-base font-semibold">{title}</h2>
                {description && <p className="mt-0.5 text-xs text-sub">{description}</p>}
              </div>
              <button onClick={onClose} className="rounded-md p-1 text-sub hover:bg-raised hover:text-fg" aria-label="Close"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
            {footer && <div className="flex items-center justify-end gap-2 border-t border-line bg-bg/40 px-6 py-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ sortable table */
export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  sort?: (row: T) => string | number | null | undefined
  className?: string
  hideOnMobile?: boolean
}

export function DataTable<T>({ rows, columns, rowKey, onRowClick, empty, initialSort, pageSize = 12 }: {
  rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string; onRowClick?: (r: T) => void; empty?: ReactNode
  initialSort?: { key: string; dir: 'asc' | 'desc' }; pageSize?: number
}) {
  const [sort, setSort] = useState(initialSort || null)
  const [page, setPage] = useState(0)
  const sorted = useMemo(() => {
    if (!sort) return rows
    const col = columns.find((c) => c.key === sort.key)
    if (!col?.sort) return rows
    return [...rows].sort((a, b) => {
      const x = col.sort!(a), y = col.sort!(b)
      if (x == null) return 1
      if (y == null) return -1
      return (x < y ? -1 : x > y ? 1 : 0) * (sort.dir === 'asc' ? 1 : -1)
    })
  }, [rows, columns, sort])
  useEffect(() => setPage(0), [rows.length])
  const pages = Math.max(1, Math.ceil(sorted.length / pageSize))
  const view = sorted.slice(page * pageSize, page * pageSize + pageSize)
  if (!rows.length) return <>{empty}</>
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-2xs uppercase tracking-wide text-faint">
              {columns.map((c) => (
                <th key={c.key} className={cn('whitespace-nowrap px-4 py-2.5 font-medium', c.hideOnMobile && 'hidden md:table-cell', c.className)}>
                  {c.sort ? (
                    <button className="inline-flex items-center gap-1 hover:text-fg" onClick={() => setSort((s) => ({ key: c.key, dir: s?.key === c.key && s.dir === 'desc' ? 'asc' : 'desc' }))}>
                      {c.header}
                      {sort?.key === c.key ? (sort.dir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-50" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('border-b border-line/60 transition-colors last:border-0', onRowClick && 'cursor-pointer hover:bg-raised/60')}>
                {columns.map((c) => <td key={c.key} className={cn('px-4 py-3 align-middle', c.hideOnMobile && 'hidden md:table-cell', c.className)}>{c.render(r)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-xs text-sub">
          <span className="tnum">{page * pageSize + 1}–{Math.min(sorted.length, (page + 1) * pageSize)} of {sorted.length}</span>
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button size="sm" variant="ghost" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  )
}

export function Select({ value, onChange, options, label, className }: {
  value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; className?: string
}) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn('input h-9 w-auto py-0 pr-8', className)}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
