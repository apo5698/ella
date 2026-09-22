"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { ChevronRightIcon, GhostIcon, WrenchIcon } from "lucide-react";
import {
  ADMIN_NAVIGATION,
  isNavigationActive,
  MAIN_NAVIGATION,
  SETTINGS_NAVIGATION,
  UTILITY_NAVIGATION,
} from "@/components/navigation";
import ThemeToggle from "@/components/ThemeToggle";
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
  useSidebar,
} from "@/components/ui/sidebar";

type NavigationItem =
  (typeof MAIN_NAVIGATION)[number] | (typeof ADMIN_NAVIGATION)[number];

const ACTIVE_NAV_CLASS =
  "data-active:bg-sidebar-primary/10 data-active:text-sidebar-primary data-active:hover:bg-sidebar-primary/15";

function NavigationMenu({
  items,
  pathname,
  onNavigate,
}: {
  items: readonly NavigationItem[];
  pathname: string;
  onNavigate: () => void;
}) {
  const t = useTranslations("Navigation");
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isNavigationActive(pathname, item.href);
        const Icon = item.icon;
        return (
          <SidebarMenuItem key={item.href}>
            <SidebarMenuButton
              isActive={active}
              tooltip={t(item.labelKey)}
              className={ACTIVE_NAV_CLASS}
              render={<Link href={item.href} onClick={onNavigate} />}
            >
              <Icon />
              <span>{t(item.labelKey)}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        );
      })}
    </SidebarMenu>
  );
}

export default function SidebarNav() {
  const t = useTranslations("Navigation");
  const utilities = useTranslations("Utilities");
  const pathname = usePathname();
  const [utilitiesOpen, setUtilitiesOpen] = useState(() =>
    pathname.startsWith("/admin/utilities"),
  );
  const { setOpenMobile } = useSidebar();
  const closeMobileSidebar = () => setOpenMobile(false);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="flex items-center gap-2 px-2 text-lg font-medium group-data-[collapsible=icon]:hidden">
          <GhostIcon aria-hidden="true" className="size-4" />
          <span className="truncate">{APP_NAME}</span>
        </span>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavigationMenu
              items={MAIN_NAVIGATION}
              pathname={pathname}
              onNavigate={closeMobileSidebar}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>{t("administration")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavigationMenu
              items={ADMIN_NAVIGATION}
              pathname={pathname}
              onNavigate={closeMobileSidebar}
            />
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  isActive={pathname === SETTINGS_NAVIGATION.href}
                  tooltip={t("settings")}
                  className={ACTIVE_NAV_CLASS}
                  render={
                    <Link
                      href={SETTINGS_NAVIGATION.href}
                      onClick={closeMobileSidebar}
                    />
                  }
                >
                  <SETTINGS_NAVIGATION.icon />
                  <span>{t("settings")}</span>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  {SETTINGS_NAVIGATION.children.map((item) => (
                    <SidebarMenuSubItem key={item.href}>
                      <SidebarMenuSubButton
                        isActive={isNavigationActive(pathname, item.href)}
                        className={ACTIVE_NAV_CLASS}
                        render={
                          <Link href={item.href} onClick={closeMobileSidebar} />
                        }
                      >
                        <item.icon />
                        <span>{t(item.labelKey)}</span>
                      </SidebarMenuSubButton>
                    </SidebarMenuSubItem>
                  ))}
                </SidebarMenuSub>
              </SidebarMenuItem>
              <Collapsible
                open={utilitiesOpen}
                onOpenChange={setUtilitiesOpen}
                className="group/collapsible"
                render={<SidebarMenuItem />}
              >
                <CollapsibleTrigger
                  render={
                    <SidebarMenuButton
                      isActive={pathname === "/admin/utilities"}
                      tooltip={t("utilities")}
                      className={ACTIVE_NAV_CLASS}
                    />
                  }
                >
                  <WrenchIcon />
                  <span>{t("utilities")}</span>
                  <ChevronRightIcon className="ml-auto transition-transform group-data-open/collapsible:rotate-90" />
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarMenuSub>
                    {UTILITY_NAVIGATION.map((item) => (
                      <SidebarMenuSubItem key={item.href}>
                        <SidebarMenuSubButton
                          isActive={isNavigationActive(pathname, item.href)}
                          className={ACTIVE_NAV_CLASS}
                          render={
                            <Link
                              href={item.href}
                              onClick={closeMobileSidebar}
                            />
                          }
                        >
                          <item.icon />
                          <span>{utilities(item.label)}</span>
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
            <ThemeToggle />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Lets the sidebar edge itself be dragged or clicked to toggle. */}
      <SidebarRail />
    </Sidebar>
  );
}
