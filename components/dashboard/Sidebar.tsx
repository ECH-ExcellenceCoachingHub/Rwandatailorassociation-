"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { isNavItemActive, type NavSection } from "@/lib/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import { cn } from "@/lib/utils";
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Dashboard sidebar.
 *
 * Rendered twice — fixed on desktop, inside a slide-over on mobile — from the
 * same component, so the two can never drift apart.
 */

export type BadgeCounts = Partial<
  Record<"pendingLoans" | "pendingWithdrawals" | "unmatchedPayments" | "pendingMembers", number>
>;

const ROLE_LABEL: Record<UserRole, string> = {
  MEMBER: "Member portal",
  ADMIN: "Association admin",
  SUPER_ADMIN: "Platform admin",
};

export function SidebarContent({
  sections,
  role,
  associationName,
  badges = {},
  onNavigate,
}: {
  sections: NavSection[];
  role: UserRole;
  associationName: string;
  badges?: BadgeCounts;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { d } = useLanguage();

  return (
    <div className="flex h-full flex-col bg-footer">
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
        <Image
          src="/images/rtalogo.jpg"
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-full object-cover"
        />
        <div className="min-w-0">
          <p className="truncate font-heading text-sm font-bold leading-tight text-white">
            {associationName}
          </p>
          <p className="truncate text-[11px] font-semibold uppercase tracking-wider text-primary-light">
            {ROLE_LABEL[role]}
          </p>
        </div>
      </div>

      {/* Navigation */}
      <nav
        aria-label={d.shell.dashboard}
        className="flex-1 overflow-y-auto px-3 py-5 [scrollbar-width:thin]"
      >
        {sections.map((section, index) => (
          <div key={section.titleKey ?? index} className={cn(index > 0 && "mt-6")}>
            {section.titleKey && (
              <p className="px-3 pb-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-white/35">
                {d.nav[section.titleKey]}
              </p>
            )}

            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = isNavItemActive(item, pathname);
                const badge = item.badgeKey ? badges[item.badgeKey] : undefined;

                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-colors",
                        active
                          ? "bg-primary text-white"
                          : "text-white/65 hover:bg-white/[0.07] hover:text-white"
                      )}
                    >
                      <item.icon
                        className={cn(
                          "size-4.5 shrink-0",
                          active ? "text-white" : "text-white/45 group-hover:text-white/80"
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{d.nav[item.labelKey]}</span>

                      {badge !== undefined && badge > 0 && (
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums",
                            active ? "bg-white/25 text-white" : "bg-gold text-footer"
                          )}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/10 px-5 py-4">
        <Link
          href="/"
          onClick={onNavigate}
          className="text-xs font-medium text-white/45 transition-colors hover:text-white"
        >
          ← Back to public website
        </Link>
      </div>
    </div>
  );
}
