import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import MobileTopNav from "@/components/MobileTopNav";
import SidebarNav from "@/components/SidebarNav";
import TaskDock from "@/components/TaskDock";
import ThemeProvider from "@/components/ThemeProvider";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { TaskQueueProvider } from "@/hooks/useTaskQueue";
import { APP_NAME } from "@/lib/brand";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: APP_NAME,
  description: "本地视频标签管理与检索",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="zh"
      suppressHydrationWarning
      className={cn(
        "h-full",
        "antialiased",
        geistMono.variable,
        "font-sans",
        geist.variable,
      )}
    >
      <body className="min-h-full bg-background text-foreground">
        <a
          href="#main-content"
          className="fixed top-2 left-2 z-50 -translate-y-16 rounded-md bg-primary px-3 py-2 text-primary-foreground transition-transform focus:translate-y-0"
        >
          跳到主要内容
        </a>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider delay={200}>
            {/* SidebarProvider supplies the flex row and remembers the collapsed
                state across reloads. SidebarInset is the page's <main>, so the
                pages themselves render plain containers. */}
            <TaskQueueProvider>
              <SidebarProvider>
                <SidebarNav />
                <SidebarInset
                  id="main-content"
                  tabIndex={-1}
                  className="min-w-0"
                >
                  <MobileTopNav />
                  {children}
                </SidebarInset>
              </SidebarProvider>
              {/* Outside the sidebar layout: queued work outlives the page that
                  started it, so its report follows the user across pages. */}
              <TaskDock />
            </TaskQueueProvider>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
