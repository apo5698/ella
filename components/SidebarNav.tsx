"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Wrench } from "lucide-react";
import {
  ADMIN_NAVIGATION,
  APP_NAVIGATION,
  isNavigationActive,
  MAIN_NAVIGATION,
  UTILITY_NAVIGATION,
} from "@/components/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useTaskQueue } from "@/hooks/useTaskQueue";
import { APP_NAME } from "@/lib/brand";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

type NavigationItem = (typeof APP_NAVIGATION)[number];

function NavigationMenu({
  items,
  pathname,
  onNavigate,
  activeTasks = 0,
}: {
  items: readonly NavigationItem[];
  pathname: string;
  onNavigate: () => void;
  activeTasks?: number;
}) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isNavigationActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={active}
              tooltip={item.label}
              className={cn(active && "text-sidebar-primary")}
              render={<Link href={item.href} onClick={onNavigate} />}
            >
              <Icon />
              <span>{item.label}</span>
              {item.href === "/admin/tasks" && activeTasks > 0 && (
                <Badge
                  variant="secondary"
                  className="ml-auto tabular-nums group-data-[collapsible=icon]:hidden"
                >
                  {activeTasks}
                </Badge>
              )}
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export default function SidebarNav() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();
  const { activeCount } = useTaskQueue();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center gap-1">
        {/* The name gives way when collapsed; the toggle has to stay, so it
            centres itself in the icon-width rail instead of hugging the edge. */}
        <span className="truncate px-2 text-lg font-semibold group-data-[collapsible=icon]:hidden">
          {APP_NAME}
        </span>
        <SidebarTrigger className="ml-auto group-data-[collapsible=icon]:mx-auto" />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavigationMenu
              items={MAIN_NAVIGATION}
              pathname={pathname}
              onNavigate={() => setOpenMobile(false)}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Admin</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavigationMenu
              items={ADMIN_NAVIGATION}
              pathname={pathname}
              onNavigate={() => setOpenMobile(false)}
              activeTasks={activeCount}
            />
            <SidebarMenu>
              <Collapsible
                defaultOpen={pathname.startsWith("/admin/utilities")}
                className="group/collapsible"
                render={<SidebarMenuItem />}
              >
                <CollapsibleTrigger
                  render={
                    <SidebarMenuButton
                      isActive={pathname === "/admin/utilities"}
                      tooltip="实用工具"
                      className={cn(
                        pathname === "/admin/utilities" &&
                          "text-sidebar-primary",
                      )}
                    />
                  }
                >
                  <Wrench />
                  <span>实用工具</span>
                  <ChevronRight className="ml-auto transition-transform group-data-open/collapsible:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {UTILITY_NAVIGATION.map((item) => (
                      <SidebarMenuSubItem key={item.href}>
                        <SidebarMenuSubButton
                          isActive={isNavigationActive(pathname, item.href)}
                          className={cn(
                            isNavigationActive(pathname, item.href) &&
                              "text-sidebar-primary",
                          )}
                          render={
                            <Link
                              href={item.href}
                              onClick={() => setOpenMobile(false)}
                            />
                          }
                        >
                          <item.icon />
                          <span>{item.label}</span>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </Collapsible>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <ThemeToggle variant="sidebar" />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Lets the sidebar edge itself be dragged or clicked to toggle. */}
      <SidebarRail />
    </Sidebar>
  );
}
