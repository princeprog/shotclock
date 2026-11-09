'use client'

import Link from "next/link"
import { useEffect } from "react"
import { usePathname } from "next/navigation"
import { ArrowLeftRightIcon, Building2Icon, CalendarDaysIcon, LayoutDashboardIcon, ListOrderedIcon, LayersIcon, LogOutIcon, MapPinIcon, MoreVerticalIcon, TrophyIcon, UsersIcon, CalendarRangeIcon } from "lucide-react"
import { useSignOut } from "@/components/session-actions"
import { ShotclockLogo } from "@/components/shotclock-logo"
import { useWorkspace } from "@/components/workspace-context"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar,
} from "@/components/ui/sidebar"
import type { AuthUser } from "@/lib/auth-server"

export function AppSidebar({ user, ...props }: React.ComponentProps<typeof Sidebar> & { user: AuthUser }) {
  const pathname = usePathname()
  const { organization, organizations } = useWorkspace()
  const { isMobile, state } = useSidebar()
  const { signOut, pending, error } = useSignOut()
  useEffect(() => { if (error && state === 'collapsed' && !isMobile) toast.error(error) }, [error, state, isMobile])
  const name = user.name?.trim()
  const initials = (name || user.email).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => Array.from(part)[0]).join('').toUpperCase()
  const items = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboardIcon },
    { href: '/manage/leagues', label: 'Leagues', icon: TrophyIcon },
    { href: '/manage/seasons', label: 'Seasons', icon: CalendarRangeIcon },
    { href: '/manage/divisions', label: 'Divisions', icon: LayersIcon },
    { href: '/manage/teams', label: 'Teams & rosters', icon: UsersIcon },
    { href: '/manage/venues', label: 'Venues', icon: MapPinIcon },
    { href: '/manage/games', label: 'Games', icon: CalendarDaysIcon },
    { href: '/manage/standings', label: 'Standings', icon: ListOrderedIcon },
  ]
  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="overflow-hidden p-4 transition-[padding] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-data-[collapsible=icon]:p-2">
        <Link href="/" aria-label="Shotclock dashboard"><ShotclockLogo compactInSidebar /></Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(({ href, label, icon: Icon }) => <SidebarMenuItem key={href}>
                <SidebarMenuButton className="h-9 text-[15px] [&>svg]:size-[17px] group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-1.5!" tooltip={label} isActive={pathname === href || (href === '/manage/teams' && pathname.startsWith('/manage/rosters/'))} render={<Link href={href} aria-label={label} aria-current={pathname === href ? 'page' : undefined} />}>
                  <Icon /><span className="min-w-0 flex-1 whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none group-data-[collapsible=icon]:opacity-0">{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-2 p-3 transition-[padding] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none group-data-[collapsible=icon]:p-2">
        <Separator className="mb-1 bg-sidebar-border" />
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" tooltip="Switch organization" className="h-14 group-data-[collapsible=icon]:justify-center" render={<Link href="/organizations" aria-label={organization ? `Switch organization, current organization ${organization.name}` : 'Choose organization'} />}>
              <Avatar className="rounded-lg"><AvatarFallback className="rounded-lg"><Building2Icon aria-hidden="true" /></AvatarFallback></Avatar>
              <span className="grid min-w-0 flex-1 gap-0.5 overflow-hidden text-left whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none group-data-[collapsible=icon]:opacity-0">
                <span className="truncate font-medium" title={organization?.name}>{organizations.isLoading ? 'Loading organization…' : organizations.isError ? 'Organization unavailable' : organization?.name ?? 'Choose organization'}</span>
                <span className="truncate text-xs text-muted-foreground">{organization ? 'Switch organization' : 'Choose organization'}</span>
              </span>
              <ArrowLeftRightIcon aria-hidden="true" className="text-muted-foreground group-data-[collapsible=icon]:hidden" />
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger render={<SidebarMenuButton size="lg" className="h-12 bg-sidebar-accent text-sidebar-accent-foreground group-data-[collapsible=icon]:justify-center" disabled={pending} aria-label={name ? `Account menu for ${name}` : `Account menu for ${user.email}`} />}>
                <Avatar className="rounded-lg after:rounded-lg"><AvatarFallback className="rounded-lg">{initials}</AvatarFallback></Avatar>
                <span className="grid min-w-0 flex-1 gap-0.5 overflow-hidden text-left whitespace-nowrap transition-opacity duration-150 motion-reduce:transition-none group-data-[collapsible=icon]:opacity-0">
                  <span className="truncate font-medium" title={name || undefined}>{name || 'Account'}</span>
                  <span className="truncate text-xs text-muted-foreground" title={user.email}>{pending ? 'Signing out…' : user.email}</span>
                </span>
                <MoreVerticalIcon aria-hidden="true" className="group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>
              <DropdownMenuContent side={isMobile ? 'top' : 'right'} align="end" sideOffset={8} className="w-60">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="flex min-w-0 items-center gap-2 px-2 py-2">
                    <Avatar className="rounded-lg after:rounded-lg"><AvatarFallback className="rounded-lg">{initials}</AvatarFallback></Avatar>
                    <span className="grid min-w-0 flex-1 gap-0.5 text-left"><span className="truncate text-sm font-medium text-foreground">{name || 'Account'}</span><span className="truncate font-normal" title={user.email}>{user.email}</span></span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={pending} onClick={() => void signOut()}><LogOutIcon />Sign out</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
        {error && <p role="alert" className="px-2 text-xs text-destructive group-data-[collapsible=icon]:sr-only">{error}</p>}
      </SidebarFooter>
    </Sidebar>
  )
}
