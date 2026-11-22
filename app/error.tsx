'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { StatusPage } from '@/components/status-page'
import { Button } from '@/components/ui/button'

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error) }, [error])
  return <StatusPage code={error.digest ? `Error ${error.digest}` : 'Error'} title="Something went wrong" description="The page couldn’t load. Try again, or head back to the overview.">
    <Button onClick={reset}>Try again</Button>
    <Button variant="outline" nativeButton={false} render={<Link href="/" />}>Go to overview</Button>
  </StatusPage>
}

