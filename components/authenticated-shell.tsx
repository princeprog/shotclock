import type { ReactNode } from "react"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { AppSidebarProvider } from "@/components/app-sidebar-provider"
import { RestoreSession } from "@/components/session-actions"
import { SiteHeader } from "@/components/site-header"
import { WorkspaceProvider } from "@/components/workspace-context"
import { SidebarInset } from "@/components/ui/sidebar"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { sessionState } from "@/lib/auth-server"

export async function AuthenticatedShell({ children, title = 'Dashboard' }: { children: ReactNode; title?: string }) {
  const session = await sessionState()
  if (session.state === "anonymous") redirect("/login")
  if (session.state === "restore") return <RestoreSession />
  if (session.state === "unavailable") return <main className="flex min-h-svh items-center justify-center p-6">Authentication is temporarily unavailable. Please try again later.</main>

  return (
    <TooltipProvider>
      <AppSidebarProvider>
        <WorkspaceProvider>
          <AppSidebar user={session.user} variant="inset" />
          <SidebarInset className="min-w-0">
            <SiteHeader title={title} />{children}
          </SidebarInset>
        </WorkspaceProvider>
      </AppSidebarProvider>
      <Toaster />
    </TooltipProvider>
  )
}
