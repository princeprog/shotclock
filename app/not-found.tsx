import Link from 'next/link'
import { StatusPage } from '@/components/status-page'
import { Button } from '@/components/ui/button'

export default function NotFound() {
  return <StatusPage code="404" title="Page not found" description="This page doesn’t exist or may have been moved.">
    <Button nativeButton={false} render={<Link href="/" />}>Go to dashboard</Button>
  </StatusPage>
}

