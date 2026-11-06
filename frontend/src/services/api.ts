import type {
  DnaPattern, KnowledgeReport, LearningReport, MemoryConflict, PropEdge, PropNode, ScoreMetric, WhatIfResult,
  AnalyticsBundle, Decision, GenericReport, GraphEdge, GraphNode, Health, IgnoredWarnings, Incident, Investigation,
  Lesson, Memory, MemoryOp, Overview, PremortemReport, ProjectRow, ServiceRow,
} from '@/types'

export const API_BASE: string = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export class ApiError extends Error {
  constructor(message: string, public status?: number) { super(message) }
}

async function req<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(API_BASE + path, {
      method: init.method || 'GET',
      headers: init.body ? { 'Content-Type': 'application/json' } : undefined,
      body: init.body ? JSON.stringify(init.body) : undefined,
    })
  } catch {
    throw new ApiError(`Can't reach the NEXUS API at ${API_BASE}. Start it with "uvicorn app.main:app --port 8000".`)
  }
  if (!res.ok) {
    let detail = res.statusText
    try {
      const j = await res.json()
      detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
    } catch { /* not json */ }
    throw new ApiError(`${path.split('?')[0]} returned ${res.status}: ${detail}`, res.status)
  }
  return res.json() as Promise<T>
}

const q = (team: string) => `team=${encodeURIComponent(team)}`

export const api = {
  health: () => req<Health>('/health'),
  reseed: () => req<{ retained: Record<string, number> }>('/admin/seed?reset=true', { method: 'POST' }),
  overview: (team: string) => req<Overview>(`/overview?${q(team)}`),

  // PREMORTEM
  decisions: (team: string) => req<Decision[]>(`/decisions?${q(team)}`),
  decision: (id: string) => req<Decision>(`/decisions/${id}`),
  createDecision: (body: Record<string, unknown>) => req<Decision>('/decisions', { method: 'POST', body }),
  premortem: (team: string, decision_id: string, compare = true) =>
    req<{ with_memory: PremortemReport; without_memory?: GenericReport & { proposal: unknown } }>('/premortem', {
      method: 'POST', body: { team, decision_id, compare },
    }),
  logOutcome: (id: string, body: Record<string, unknown>) =>
    req<{ decision: Decision; learning: { category: string; factor_before: number | null; factor_after: number; team_before: number; team_after: number; lessons_changed: { lesson: string; before: number | null; after: number }[] } }>(
      `/decisions/${id}/outcome`, { method: 'POST', body }),
  replay: (id: string) =>
    req<{ decision: Decision; nexus_at_the_time: PremortemReport; what_actually_happened: { actual_weeks: number; estimate_weeks: number; broken_assumptions: Assumption[]; ignored_risks: { raised_by: string; text: string }[]; incidents: string[]; outcome_summary: string }; would_have_caught: string[] }>(`/replay/${id}`),

  // RECALL-X
  incidents: (team: string) => req<Incident[]>(`/incidents?${q(team)}`),
  incident: (id: string) => req<Incident>(`/incidents/${id}`),
  createIncident: (body: Record<string, unknown>) => req<Incident>('/incidents', { method: 'POST', body }),
  analyzeIncident: (id: string) =>
    req<{ incident: Incident; with_memory: Investigation; without_memory?: { hypothesis: string; recommended_actions: { action: string; why: string }[] } }>(
      `/incidents/${id}/analyze`, { method: 'POST' }),
  checkFix: (team: string, service: string | null, action: string) =>
    req<{ warning: boolean; message: string; matches: (import('@/types').FixStat & { similarity: number })[] }>(
      '/incidents/check-fix', { method: 'POST', body: { team, service, action } }),
  resolveIncident: (id: string, body: Record<string, unknown>) => req<Incident>(`/incidents/${id}/resolve`, { method: 'POST', body }),

  // Memory
  memoryActivity: (team: string, limit = 80) => req<MemoryOp[]>(`/memory/activity?${q(team)}&limit=${limit}`),
  memoryStats: (team: string) =>
    req<{ mode: string; bank: string; retained: Record<string, number>; ops: Record<string, number>; patterns: number }>(`/memory/stats?${q(team)}`),
  recall: (team: string, query: string, tags?: string[]) =>
    req<{ source: string; results: Memory[]; error?: string | null }>('/memory/recall', { method: 'POST', body: { team, query, tags } }),
  reflect: (team: string, query: string) =>
    req<{ source: string; text: string | null; available: boolean; message: string | null }>('/memory/reflect', { method: 'POST', body: { team, query } }),
  lessons: (team: string) => req<{ lessons: Lesson[] }>(`/insights/lessons?${q(team)}`),
  ignored: (team: string) => req<IgnoredWarnings>(`/insights/ignored?${q(team)}`),

  // Analytics + management
  analytics: (team: string) => req<AnalyticsBundle>(`/analytics?${q(team)}`),
  graph: (team: string) => req<{ nodes: GraphNode[]; edges: GraphEdge[] }>(`/knowledge-graph?${q(team)}`),
  services: (team: string) => req<ServiceRow[]>(`/services?${q(team)}`),
  projects: (team: string) => req<ProjectRow[]>(`/projects?${q(team)}`),
  // Organisational intelligence
  dna: (team: string) => req<{ closed_decisions: number; patterns: DnaPattern[] }>(`/intelligence/dna?${q(team)}`),
  conflicts: (team: string) => req<MemoryConflict[]>(`/intelligence/conflicts?${q(team)}`),
  explainConflict: (team: string, conflict_id: string) =>
    req<{ available: boolean; message: string | null; llm: { why: string; unknowns: string[]; recommendation: string } | null }>(
      '/intelligence/conflicts/explain', { method: 'POST', body: { team, conflict_id } }),
  propagation: (team: string) => req<{ nodes: PropNode[]; edges: PropEdge[]; legend: Record<string, string> }>(`/intelligence/propagation?${q(team)}`),
  whatif: (body: Record<string, unknown>) => req<WhatIfResult>('/intelligence/whatif', { method: 'POST', body }),
  knowledge: (team: string) => req<KnowledgeReport>(`/intelligence/knowledge?${q(team)}`),
  runbook: (team: string, service: string) => req<{ markdown: string; incidents: string[] }>(`/intelligence/runbook?${q(team)}&service=${encodeURIComponent(service)}`),
  learning: (team: string) => req<LearningReport>(`/intelligence/learning?${q(team)}`),
  scorecard: (team: string) => req<{ metrics: ScoreMetric[]; note: string; generated: string }>(`/intelligence/scorecard?${q(team)}`),
  addProgress: (id: string, note: string) => req<Decision>(`/decisions/${id}/progress`, { method: 'POST', body: { note } }),

  prComment: (team: string, title: string, body: string) =>
    req<{ comment_markdown: string }>('/integrations/github/pr', { method: 'POST', body: { team, title, body } }),
}

type Assumption = import('@/types').Assumption
