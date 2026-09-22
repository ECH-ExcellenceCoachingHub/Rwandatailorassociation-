"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Bell,
  ChevronRight,
  LogOut,
  Menu,
  QrCode,
  Settings,
  ShieldQuestion,
  User as UserIcon,
  X,
} from "lucide-react";
import { SidebarContent, type BadgeCounts } from "@/components/dashboard/Sidebar";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useLanguage } from "@/components/LanguageProvider";
import { BREADCRUMB_LABELS, visibleNavigation } from "@/lib/navigation";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Dashboard chrome: fixed sidebar on desktop, slide-over on mobile, plus the
 * top bar with breadcrumbs, notifications and the account menu.
 *
 * All navigation state lives here on the client; the page content itself is
 * rendered on the server and passed in as children, so data fetching and
 * authorisation stay server-side.
 */

export interface ShellUser {
  fullName: string;
  email: string | null;
  role: UserRole;
  avatarUrl: string | null;
  memberNumber?: string | null;
}

export function DashboardShell({
  user,
  permissions,
  associationName,
  badges,
  unreadNotifications = 0,
  children,
}: {
  user: ShellUser;
  /// Effective permission codes. Plain strings, deliberately: the navigation
  /// tree carries Lucide icon *components*, and React cannot serialise a
  /// function across the server/client boundary. So the server sends the role
  /// and this list, and the tree is built here on the client.
  permissions: string[];
  associationName: string;
  badges?: BadgeCounts;
  unreadNotifications?: number;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { d } = useLanguage();

  // `memberNumber` is the shell's existing proxy for "this person has a member
  // record of their own" — it is already sent for exactly those accounts, and
  // it is what decides whether staff see their own savings links.
  const sections = useMemo(
    () =>
      visibleNavigation(user.role, permissions, {
        hasMemberAccount: Boolean(user.memberNumber),
      }),
    [user.role, permissions, user.memberNumber]
  );

  // The slide-over closes via each link's onNavigate rather than an effect on
  // pathname — synchronising it from a route change would mean a setState
  // inside an effect and an extra render on every navigation.

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileOpen]);

  // A tab left open for hours can outlive its session: the server idle-times
  // it out while the page still looks signed in, and the first sign would be
  // a form that fails on submit. So when someone comes back to the tab, ask
  // the server. A 401 from /api/auth/me also clears the stale cookie, which is
  // what lets /login render instead of bouncing them straight back here.
  useEffect(() => {
    let lastChecked = Date.now();

    async function checkSession() {
      if (document.visibilityState !== "visible") return;
      // A quick tab switch is not worth a database round trip.
      if (Date.now() - lastChecked < 60_000) return;
      lastChecked = Date.now();

      const response = await fetch("/api/auth/me", { cache: "no-store" }).catch(
        () => null
      );
      if (response?.status === 401) {
        const here = window.location.pathname + window.location.search;
        window.location.assign(
          `/login?next=${encodeURIComponent(here)}&expired=1`
        );
      }
    }

    document.addEventListener("visibilitychange", checkSession);
    window.addEventListener("focus", checkSession);
    return () => {
      document.removeEventListener("visibilitychange", checkSession);
      window.removeEventListener("focus", checkSession);
    };
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[264px] lg:block">
        <SidebarContent
          sections={sections}
          role={user.role}
          associationName={associationName}
          badges={badges}
        />
      </aside>

      {/* Mobile slide-over */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            aria-label={d.shell.closeMenu}
            onClick={() => setMobileOpen(false)}
            className="absolute inset-0 bg-ink/60 backdrop-blur-sm"
          />
          <div className="absolute inset-y-0 left-0 w-[280px] max-w-[85vw] animate-in slide-in-from-left duration-200">
            <SidebarContent
              sections={sections}
              role={user.role}
              associationName={associationName}
              badges={badges}
              onNavigate={() => setMobileOpen(false)}
            />
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label={d.shell.closeMenu}
              className="absolute -right-11 top-4 flex size-9 items-center justify-center rounded-full bg-white text-ink shadow-lift"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="lg:pl-[264px]">
        <TopBar
          user={user}
          onOpenMenu={() => setMobileOpen(true)}
          unreadNotifications={unreadNotifications}
        />

        <main className="px-5 py-6 sm:px-7 lg:px-9 lg:py-8">{children}</main>
      </div>
    </div>
  );
}

function TopBar({
  user,
  onOpenMenu,
  unreadNotifications,
}: {
  user: ShellUser;
  onOpenMenu: () => void;
  unreadNotifications: number;
}) {
  const pathname = usePathname();
  const crumbs = buildBreadcrumbs(pathname);
  const notificationsHref = notificationsHrefFor(user.role);
  const { d } = useLanguage();

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-white/95 backdrop-blur">
      <div className="flex h-[68px] items-center gap-3 px-5 sm:px-7 lg:px-9">
        <button
          type="button"
          onClick={onOpenMenu}
          aria-label={d.shell.openMenu}
          className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border text-ink lg:hidden"
        >
          <Menu className="size-5" aria-hidden="true" />
        </button>

        <nav aria-label={d.shell.breadcrumb} className="min-w-0 flex-1">
          <ol className="flex items-center gap-1.5 text-sm">
            {crumbs.map((crumb, index) => {
              const last = index === crumbs.length - 1;
              return (
                <li key={crumb.href} className="flex min-w-0 items-center gap-1.5">
                  {index > 0 && (
                    <ChevronRight
                      className="size-3.5 shrink-0 text-ink-muted/50"
                      aria-hidden="true"
                    />
                  )}
                  {last ? (
                    <span
                      aria-current="page"
                      className="truncate font-heading font-semibold text-ink"
                    >
                      {crumb.label}
                    </span>
                  ) : (
                    <Link
                      href={crumb.href}
                      className="hidden truncate text-ink-muted transition-colors hover:text-primary sm:block"
                    >
                      {crumb.label}
                    </Link>
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        <LanguageToggle />

        <Link
          href={notificationsHref}
          aria-label={
            unreadNotifications > 0
              ? `${d.shell.notifications}, ${unreadNotifications} ${d.shell.notificationsUnread}`
              : d.shell.notifications
          }
          className="relative flex size-10 shrink-0 items-center justify-center rounded-xl text-ink-muted transition-colors hover:bg-primary-50 hover:text-primary"
        >
          <Bell className="size-5" aria-hidden="true" />
          {unreadNotifications > 0 && (
            <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </span>
          )}
        </Link>

        <UserMenu user={user} />
      </div>
    </header>
  );
}

function UserMenu({ user }: { user: ShellUser }) {
  const router = useRouter();
  const { d } = useLanguage();
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  }

  const initials = user.fullName
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  // Keyed on having a member record rather than on role. A member's profile is
  // their whole file — the association's record of them, with their payment
  // reference at the top — so that is where "my profile" belongs for anyone who
  // has one. A staff account with no membership has no such file, and goes
  // straight to the form where its name and phone number are edited.
  const profileHref = user.memberNumber ? "/dashboard/profile" : "/account/profile";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex shrink-0 items-center gap-2.5 rounded-xl py-1.5 pl-1.5 pr-2 transition-colors hover:bg-ink/[0.04] data-[state=open]:bg-ink/[0.04]"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white">
            {initials || "?"}
          </span>
          <span className="hidden text-left leading-tight sm:block">
            <span className="block max-w-[150px] truncate text-[13px] font-semibold text-ink">
              {user.fullName}
            </span>
            <span className="block max-w-[150px] truncate text-[11px] text-ink-muted">
              {user.memberNumber ?? user.email}
            </span>
          </span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 w-60 overflow-hidden rounded-xl border border-border bg-white p-1.5 shadow-lift"
        >
          <div className="border-b border-border px-3 py-2.5">
            <p className="truncate text-sm font-semibold text-ink">{user.fullName}</p>
            <p className="truncate text-xs text-ink-muted">{user.email}</p>
          </div>

          <DropdownMenu.Item asChild>
            <Link
              href={profileHref}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ink outline-none transition-colors",
                "data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-hover"
              )}
            >
              <UserIcon className="size-4" aria-hidden="true" />
              {d.shell.myProfile}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href="/account/status"
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ink outline-none transition-colors",
                "data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-hover"
              )}
            >
              <ShieldQuestion className="size-4" aria-hidden="true" />
              {d.shell.accountStatus}
            </Link>
          </DropdownMenu.Item>

          {/* Reachable from every role's menu, not only the member sidebar:
              an administrator signing in at a workshop has the same problem a
              member does. */}
          <DropdownMenu.Item asChild>
            <Link
              href="/account/qr"
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ink outline-none transition-colors",
                "data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-hover"
              )}
            >
              <QrCode className="size-4" aria-hidden="true" />
              {d.shell.myQrCode}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href="/account/password"
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-ink outline-none transition-colors",
                "data-[highlighted]:bg-primary-50 data-[highlighted]:text-primary-hover"
              )}
            >
              <Settings className="size-4" aria-hidden="true" />
              {d.shell.securityPassword}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Separator className="my-1 h-px bg-border" />

          <DropdownMenu.Item
            onSelect={(event) => {
              event.preventDefault();
              void handleSignOut();
            }}
            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm text-red-600 outline-none transition-colors data-[highlighted]:bg-red-50"
          >
            <LogOut className="size-4" aria-hidden="true" />
            {signingOut ? d.shell.signingOut : d.shell.signOut}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function notificationsHrefFor(role: UserRole): string {
  if (role === "MEMBER") return "/dashboard/notifications";
  if (role === "ADMIN") return "/admin/notifications";
  return "/super-admin";
}

function buildBreadcrumbs(pathname: string): { label: string; href: string }[] {
  const segments = pathname.split("/").filter(Boolean);

  return segments.map((segment, index) => ({
    href: `/${segments.slice(0, index + 1).join("/")}`,
    label:
      BREADCRUMB_LABELS[segment] ??
      // Unlisted segments are usually record ids; shorten rather than showing
      // a 25-character cuid in the breadcrumb bar.
      (segment.length > 14
        ? `${segment.slice(0, 8)}…`
        : segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ")),
  }));
}

/** Standard page header used inside dashboard pages. */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between",
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="font-heading text-2xl font-bold text-ink">{title}</h1>
        {description && (
          <p className="mt-1.5 text-[15px] leading-relaxed text-ink-muted">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </div>
  );
}
