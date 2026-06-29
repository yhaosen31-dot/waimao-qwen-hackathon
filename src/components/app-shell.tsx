"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  ChevronDown,
  ClipboardCheck,
  FileText,
  HelpCircle,
  Home,
  LayoutDashboard,
  LogOut,
  Mail,
  PlusCircle,
  PlayCircle,
  Search,
  Send,
  Settings,
  Upload,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    href: "/runs/new",
    label: "仪表盘",
    icon: Home,
    match: (pathname: string) => pathname === "/"
  },
  {
    href: "/runs/new",
    label: "创建任务",
    icon: PlusCircle,
    match: (pathname: string) => pathname === "/runs/new" || pathname === "/tasks/new"
  },
  {
    href: "/runs/new#workflow",
    label: "任务运行",
    icon: PlayCircle,
    match: (pathname: string) => pathname.startsWith("/runs/") && pathname !== "/runs/new"
  },
  {
    href: "/imports/new",
    label: "Excel 导入",
    icon: Upload,
    match: (pathname: string) => pathname.startsWith("/imports")
  },
  {
    href: "/reviews",
    label: "人工审核",
    icon: ClipboardCheck,
    match: (pathname: string) => pathname === "/reviews"
  },
  {
    href: "/companies",
    label: "客户列表",
    icon: Users,
    match: (pathname: string) => pathname === "/companies"
  },
  {
    href: "/companies",
    label: "客户详情",
    icon: FileText,
    match: (pathname: string) => pathname.startsWith("/companies/")
  },
  {
    href: "/email-drafts",
    label: "邮件草稿",
    icon: Mail,
    match: (pathname: string) => pathname === "/email-drafts"
  },
  {
    href: "/drafts",
    label: "发送记录",
    icon: Send,
    match: (pathname: string) => pathname.startsWith("/drafts")
  },
  {
    href: "/settings",
    label: "设置",
    icon: Settings,
    match: (pathname: string) => pathname === "/settings"
  }
];

const pageTitles: Array<{ match: (pathname: string) => boolean; title: string }> = [
  {
    match: (pathname) => pathname === "/runs/new" || pathname === "/tasks/new",
    title: "创建获客任务 / 任务控制台"
  },
  {
    match: (pathname) => pathname.startsWith("/runs/"),
    title: "任务运行 / LangGraph 控制台"
  },
  {
    match: (pathname) => pathname === "/imports/new",
    title: "Excel 导入获客"
  },
  {
    match: (pathname) => pathname.startsWith("/imports/"),
    title: "导入任务详情"
  },
  {
    match: (pathname) => pathname.startsWith("/companies/"),
    title: "客户详情 / CRM 档案"
  },
  {
    match: (pathname) => pathname === "/companies",
    title: "客户列表 / CRM"
  },
  {
    match: (pathname) => pathname === "/reviews",
    title: "人工审核 / Review Center"
  },
  {
    match: (pathname) => pathname === "/email-drafts",
    title: "邮件草稿 / Draft Review"
  },
  {
    match: (pathname) => pathname === "/settings",
    title: "设置 / Providers"
  },
  {
    match: (pathname) => pathname.startsWith("/drafts"),
    title: "发送记录"
  }
];

export function AppShell({
  authEnabled,
  children,
  userEmail
}: {
  authEnabled?: boolean;
  children: ReactNode;
  userEmail?: string;
}) {
  const pathname = usePathname();
  const isAuthPage = pathname === "/login" || pathname === "/unauthorized";
  const pageTitle = pageTitles.find((item) => item.match(pathname))?.title ?? "跨境获客 AI Agent";

  if (isAuthPage) return <>{children}</>;

  return (
    <div className="min-h-screen bg-[#f7faff] text-slate-950">
      <aside className="fixed inset-y-0 left-0 hidden w-[266px] flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-[76px] shrink-0 items-center gap-3 px-5">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-base font-bold text-white shadow-sm shadow-blue-200">
            Ai
          </div>
          <div>
            <div className="text-base font-semibold tracking-normal">跨境获客 AI Agent</div>
            <div className="mt-0.5 text-xs text-slate-500">让获客更智能，让增长更简单</div>
          </div>
        </div>
        <nav className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
          {navItems.map((item) => {
            const isActive = item.match(pathname);
            return (
              <Link
                className={cn(
                  "flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700",
                  isActive && "bg-blue-50 text-blue-700"
                )}
                href={item.href}
                key={`${item.label}-${item.href}`}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="shrink-0 space-y-4 px-4 pb-5">
          <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>当前套餐</span>
              <Link className="font-medium text-blue-600" href="/settings">
                升级套餐
              </Link>
            </div>
            <div className="mt-2 text-sm font-semibold">企业版 Pro</div>
            <div className="mt-5 flex items-center justify-between text-xs text-slate-500">
              <span>使用量</span>
              <span>68%</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-white">
              <div className="h-2 w-[68%] rounded-full bg-blue-600" />
            </div>
            <div className="mt-3 text-xs text-slate-500">本月已用 68,200 / 100,000 条</div>
          </div>
          <Link
            className="flex h-10 items-center gap-3 text-sm font-medium text-slate-600 hover:text-blue-700"
            href="/settings"
          >
            <HelpCircle className="h-5 w-5" />
            帮助中心
          </Link>
        </div>
      </aside>
      <div className="lg:pl-[266px]">
        <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <LayoutDashboard className="h-5 w-5 text-blue-600 lg:hidden" />
            <h1 className="truncate text-xl font-semibold tracking-normal text-slate-950">
              {pageTitle}
            </h1>
          </div>
          <div className="hidden min-w-0 flex-1 items-center justify-end gap-6 xl:flex">
            <div className="relative w-[400px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                placeholder="搜索客户、公司、邮箱、WhatsApp..."
                type="search"
              />
            </div>
            <button
              aria-label="通知"
              className="relative flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100"
              type="button"
            >
              <Bell className="h-5 w-5" />
              <span className="absolute right-1.5 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
                12
              </span>
            </button>
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full border border-slate-200 bg-[linear-gradient(135deg,#dbeafe,#f8fafc)]" />
              <div className="leading-tight">
                <div className="max-w-[180px] truncate text-sm font-semibold">
                  {userEmail ?? "本地调试"}
                </div>
                <div className="text-xs text-slate-500">
                  {authEnabled ? "已登录" : "Auth 未启用"}
                </div>
              </div>
              {authEnabled ? (
                <form action="/auth/logout" method="post">
                  <button
                    aria-label="退出登录"
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 hover:text-blue-700"
                    type="submit"
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </form>
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-500" />
              )}
            </div>
          </div>
          <Link
            className="flex items-center gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 xl:hidden"
            href="/runs/new"
          >
            <FileText className="h-4 w-4" />
            创建任务
          </Link>
        </header>
        <main className="px-4 py-5 lg:px-5">{children}</main>
      </div>
    </div>
  );
}
