import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api } from '@/services/api'
import type { Health } from '@/types'

export type ToastKind = 'success' | 'error' | 'info' | 'memory'
export interface Toast { id: number; kind: ToastKind; title: string; body?: string }

interface AppState {
  team: string
  setTeam: (t: string) => void
  health: Health | null
  healthError: string | null
  /** bump to make every page refetch after a write */
  version: number
  refresh: () => void
  toasts: Toast[]
  toast: (kind: ToastKind, title: string, body?: string) => void
  dismiss: (id: number) => void
  record: string | null
  openRecord: (id: string | null) => void
}

const Ctx = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [team, setTeamState] = useState<string>(() => {
    try { return localStorage.getItem('nexus.team') || 'payments' } catch { return 'payments' }
  })
  const [health, setHealth] = useState<Health | null>(null)
  const [healthError, setHealthError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [record, openRecord] = useState<string | null>(null)
  const seq = useRef(0)

  const setTeam = useCallback((t: string) => {
    setTeamState(t)
    try { localStorage.setItem('nexus.team', t) } catch { /* private mode */ }
  }, [])
  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), [])
  const toast = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = ++seq.current
    setToasts((ts) => [...ts.slice(-3), { id, kind, title, body }])
    setTimeout(() => dismiss(id), kind === 'error' ? 8000 : 4500)
  }, [dismiss])

  useEffect(() => {
    api.health().then((h) => { setHealth(h); setHealthError(null) }).catch((e: Error) => { setHealth(null); setHealthError(e.message) })
  }, [version])

  const value = useMemo(() => ({ team, setTeam, health, healthError, version, refresh, toasts, toast, dismiss, record, openRecord }),
    [team, setTeam, health, healthError, version, refresh, toasts, toast, dismiss, record])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useApp outside AppProvider')
  return c
}

/** Fetch helper with loading / error / reload, re-running when deps change. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data: T | null; error: Error | null; loading: boolean }>({ data: null, error: null, loading: true })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let live = true
    setState((s) => ({ ...s, loading: true, error: null }))
    fn().then((data) => live && setState({ data, error: null, loading: false }))
      .catch((error: Error) => live && setState({ data: null, error, loading: false }))
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])
  return { ...state, reload: () => setNonce((n) => n + 1) }
}
