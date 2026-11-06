import { Compass } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, EmptyState } from '@/components/ui'

export default function NotFound() {
  const nav = useNavigate()
  return (
    <Card><EmptyState icon={<Compass className="h-5 w-5" />} title="This page doesn't exist" body="The link may be out of date. Head back to the overview to keep going."
      action={<Button variant="primary" onClick={() => nav('/')}>Go to overview</Button>} /></Card>
  )
}
