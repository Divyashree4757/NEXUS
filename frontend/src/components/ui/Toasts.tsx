import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, BrainCircuit, CheckCircle2, Info, X } from 'lucide-react'
import { useApp } from '@/state/app'

const icon = {
  success: <CheckCircle2 className="h-4 w-4 text-ok" />,
  error: <AlertCircle className="h-4 w-4 text-crit" />,
  info: <Info className="h-4 w-4 text-primary" />,
  memory: <BrainCircuit className="h-4 w-4 text-memory" />,
}

export function Toasts() {
  const { toasts, dismiss } = useApp()
  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(380px,calc(100vw-2rem))] flex-col gap-2" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: 24 }}
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-line2 bg-raised p-3.5 shadow-2xl">
            <span className="mt-0.5">{icon[t.kind]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{t.title}</div>
              {t.body && <div className="mt-0.5 text-xs text-sub">{t.body}</div>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-faint hover:text-fg" aria-label="Dismiss"><X className="h-3.5 w-3.5" /></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
