'use client'

import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowLeftRightIcon, CalendarDaysIcon, LayoutDashboardIcon, ListOrderedIcon, MapPinIcon, TrophyIcon, UsersIcon, CalendarRangeIcon } from "lucide-react"
import { SignOut } from "@/components/session-actions"
import { ShotclockLogo } from "@/components/shotclock-logo"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { AuthUser } from "@/lib/auth-server"

export function AppSidebar({ user, ...props }: React.ComponentProps<typeof Sidebar> & { user: AuthUser }) {
  const pathname = usePathname()
  const items = [
    { href: '/', label: 'Dashboard', icon: LayoutDashboardIcon },
    { href: '/manage/leagues', label: 'Leagues', icon: TrophyIcon },
    { href: '/manage/seasons', label: 'Seasons', icon: CalendarRangeIcon },
    { href: '/manage/teams', label: 'Teams & rosters', icon: UsersIcon },
    { href: '/manage/venues', label: 'Venues', icon: MapPinIcon },
    { href: '/manage/games', label: 'Games', icon: CalendarDaysIcon },
    { href: '/manage/standings', label: 'Standings', icon: ListOrderedIcon },
  ]
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="p-4">
        <Link href="/" aria-label="Shotclock dashboard"><ShotclockLogo /></Link>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map(({ href, label, icon: Icon }) => <SidebarMenuItem key={href}>
                <SidebarMenuButton isActive={pathname === href || (href === '/manage/teams' && pathname.startsWith('/manage/rosters/'))} render={<Link href={href} aria-current={pathname === href ? 'page' : undefined} />}>
                  <Icon /><span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>)}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="gap-3 p-4">
        <SidebarMenu><SidebarMenuItem><SidebarMenuButton render={<Link href="/organizations" />}><ArrowLeftRightIcon /><span>Switch organization</span></SidebarMenuButton></SidebarMenuItem></SidebarMenu>
        <div className="min-w-0 text-sm">
          {user.name && <p className="truncate font-medium">{user.name}</p>}
          <p className="truncate text-muted-foreground" title={user.email}>{user.email}</p>
        </div>
        <SignOut />
      </SidebarFooter>
    </Sidebar>
  )
}
