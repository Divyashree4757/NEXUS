import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layout/AppLayout'
import { AppProvider } from '@/state/app'
import DecisionDetail from '@/pages/DecisionDetail'
import DecisionDNA from '@/pages/DecisionDNA'
import KnowledgeRetention from '@/pages/KnowledgeRetention'
import LearningEngine from '@/pages/LearningEngine'
import MemoryConflicts from '@/pages/MemoryConflicts'
import MemoryScorecard from '@/pages/MemoryScorecard'
import RiskPropagation from '@/pages/RiskPropagation'
import WhatIf from '@/pages/WhatIf'
import Decisions from '@/pages/Decisions'
import IncidentDetail from '@/pages/IncidentDetail'
import Incidents from '@/pages/Incidents'
import KnowledgeGraph from '@/pages/KnowledgeGraph'
import MemoryExplorer from '@/pages/MemoryExplorer'
import NotFound from '@/pages/NotFound'
import Overview from '@/pages/Overview'
import PredictionAccuracy from '@/pages/PredictionAccuracy'
import Projects from '@/pages/Projects'
import RiskAnalytics from '@/pages/RiskAnalytics'
import Services from '@/pages/Services'
import Settings from '@/pages/Settings'
import TeamInsights from '@/pages/TeamInsights'

// HashRouter so the static build works on any host without rewrite rules.
export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route index element={<Overview />} />
            <Route path="decisions" element={<Decisions />} />
            <Route path="decisions/:id" element={<DecisionDetail />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="incidents/:id" element={<IncidentDetail />} />
            <Route path="dna" element={<DecisionDNA />} />
            <Route path="propagation" element={<RiskPropagation />} />
            <Route path="whatif" element={<WhatIf />} />
            <Route path="memory" element={<MemoryExplorer />} />
            <Route path="conflicts" element={<MemoryConflicts />} />
            <Route path="learning" element={<LearningEngine />} />
            <Route path="knowledge" element={<KnowledgeRetention />} />
            <Route path="scorecard" element={<MemoryScorecard />} />
            <Route path="graph" element={<KnowledgeGraph />} />
            <Route path="analytics/risk" element={<RiskAnalytics />} />
            <Route path="analytics/accuracy" element={<PredictionAccuracy />} />
            <Route path="analytics/teams" element={<TeamInsights />} />
            <Route path="projects" element={<Projects />} />
            <Route path="services" element={<Services />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  )
}
