export function cn(...xs: (string | false | null | undefined)[]) {
  return xs.filter(Boolean).join(' ')
}

export const fmtDate = (s?: string | null) => {
  if (!s) return '—'
  const d = new Date(s.length === 10 ? s + 'T00:00:00' : s)
  return isNaN(+d) ? s : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export const fmtTime = (s?: string | null) => {
  if (!s) return ''
  const d = new Date(s)
  return isNaN(+d) ? s : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export const pct = (x?: number | null, digits = 0) => (x == null ? '—' : `${(x * 100).toFixed(digits)}%`)

export function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export const riskColor: Record<string, string> = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', low: '#22c55e' }
export const sevColor: Record<string, string> = { SEV1: '#ef4444', SEV2: '#f59e0b', SEV3: '#64708a' }
export const fixColor: Record<string, string> = { resolved: '#22c55e', temporary: '#f59e0b', failed: '#ef4444' }
