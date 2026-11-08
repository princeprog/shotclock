import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"

export function SiteHeader({ title = "Dashboard" }: { title?: string }) {
  return (
    <header className="flex min-h-(--header-height) shrink-0 items-center gap-2 border-b">
      <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-3 px-4 py-2 lg:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mx-2 h-4 data-vertical:self-auto" />
        <h1 className="text-base font-medium">{title}</h1>
        <WorkspaceSwitcher />
      </div>
    </header>
  )
}
