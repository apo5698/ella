import ThemeToggle from "@/components/ThemeToggle";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export default function MobileTopNav() {
  return (
    <div className="sticky top-0 z-20 shrink-0 bg-background/90 backdrop-blur-xl md:hidden">
      <header className="flex h-12 items-center justify-between px-4">
        <SidebarTrigger aria-label="打开导航菜单" />
        <ThemeToggle />
      </header>
      <Separator />
    </div>
  );
}
