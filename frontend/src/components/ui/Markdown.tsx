import { Fragment, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Inline: **bold**, *italic*, `code`. No HTML is ever injected. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const t = m[0]
    if (t.startsWith('**')) out.push(<strong key={k++} className="font-semibold text-fg">{t.slice(2, -2)}</strong>)
    else if (t.startsWith('`')) out.push(<code key={k++} className="rounded bg-bg/60 px-1 font-mono text-[0.95em]">{t.slice(1, -1)}</code>)
    else out.push(<em key={k++}>{t.slice(1, -1)}</em>)
    last = m.index + t.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Small, safe Markdown renderer for LLM / Hindsight text: headings, bullets, numbered lists, paragraphs. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const lines = (text || '').replace(/\r/g, '').split('\n')
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let para: string[] = []
  const flushPara = () => { if (para.length) { blocks.push(<p key={blocks.length}>{inline(para.join(' '))}</p>); para = [] } }
  const flushList = () => {
    if (!list) return
    const Tag = list.ordered ? 'ol' : 'ul'
    blocks.push(<Tag key={blocks.length} className={cn('space-y-1 pl-4', list.ordered ? 'list-decimal' : 'list-disc')}>
      {list.items.map((it, i) => <li key={i}>{inline(it)}</li>)}</Tag>)
    list = null
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) { flushPara(); flushList(); continue }
    const h = /^#{1,6}\s+(.*)$/.exec(line)
    if (h) { flushPara(); flushList(); blocks.push(<div key={blocks.length} className="pt-1 font-semibold text-fg">{inline(h[1].replace(/\*\*/g, ''))}</div>); continue }
    if (/^(-{3,}|\*{3,})$/.test(line)) { flushPara(); flushList(); continue }
    const b = /^[-*•]\s+(.*)$/.exec(line)
    const n = /^\d+[.)]\s+(.*)$/.exec(line)
    if (b || n) {
      flushPara()
      const ordered = !!n
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] } }
      list.items.push((b || n)![1])
      continue
    }
    flushList(); para.push(line)
  }
  flushPara(); flushList()
  return <div className={cn('space-y-2 leading-relaxed', className)}>{blocks.map((b, i) => <Fragment key={i}>{b}</Fragment>)}</div>
}

/** Plain-text version for short previews. */
export function stripMarkdown(text: string) {
  return (text || '').replace(/^#{1,6}\s+/gm, '').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
    .replace(/^\s*[-*•]\s+/gm, '').replace(/\s+/g, ' ').trim()
}
