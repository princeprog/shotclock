'use client'

import type { ReactNode } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useAppDispatch, useAppSelector } from '@/lib/store-hooks'
import { setSidebarOpen } from '@/lib/ui-slice'

export function AppSidebarProvider({ children }: { children: ReactNode }) {
  const open = useAppSelector((state) => state.ui.sidebarOpen)
  const dispatch = useAppDispatch()
  return <SidebarProvider open={open} onOpenChange={(value) => dispatch(setSidebarOpen(value))} style={{ '--sidebar-width': 'calc(var(--spacing) * 72)', '--header-height': 'calc(var(--spacing) * 12)' } as React.CSSProperties}>{children}</SidebarProvider>
}
