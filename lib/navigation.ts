import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  BarChart3,
  Bell,
  Building2,
  CalendarCheck,
  ClipboardList,
  Cog,
  Coins,
  CreditCard,
  FileText,
  FileUp,
  Gauge,
  Gavel,
  HandCoins,
  LayoutDashboard,
  Link2,
  PiggyBank,
  QrCode,
  IdCard,
  Landmark,
  Scale,
  ScrollText,
  Sprout,
  Settings,
  ShieldCheck,
  ShieldQuestion,
  UserPen,
  Users,
  Wallet,
  Warehouse,
} from "lucide-react";
import { PERMISSIONS, type PermissionCode } from "@/lib/auth/permissions";
import type { NavLabelKey } from "@/lib/i18n/dashboard";
import type { UserRole } from "@/lib/generated/prisma/enums";

/**
 * Dashboard navigation.
 *
 * `permission` here controls VISIBILITY ONLY. Hiding a link is a usability
 * decision — it keeps a screen from advertising things the user cannot do. It
 * is not access control: the page behind every one of these links calls a
 * guard from lib/auth/guards.ts, and that is what actually decides.
 */

export interface NavItem {
  /// Key into the dashboard dictionary rather than literal text, so the
  /// sidebar translates. Typed against the dictionary, so a key that has no
  /// translation is a compile error rather than a blank label in the UI.
  labelKey: NavLabelKey;
  href: string;
  icon: LucideIcon;
  /// Hide unless the user holds this permission.
  permission?: PermissionCode;
  /// Live count badge key, resolved by the shell (e.g. pending applications).
  badgeKey?: "pendingLoans" | "pendingWithdrawals" | "unmatchedPayments" | "pendingMembers";
  /// Match child routes too (default true). False for index links.
  exact?: boolean;
  /// Hide unless the user has a member record of their own. Distinct from
  /// `permission`: an administrator holds every savings permission there is
  /// and still has nothing to show here unless they save with the association
  /// themselves.
  requiresMemberAccount?: boolean;
}

export interface NavSection {
  titleKey?: NavLabelKey;
  items: NavItem[];
}

const MEMBER_NAV: NavSection[] = [
  {
    items: [
      { labelKey: "overview", href: "/dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  // Second from the top, above the member's own savings, and carrying no
  // permission. What the association holds, owes and earned is not privileged
  // information that members are granted sight of — it is their money, and
  // burying it under "Account" would say the opposite.
  {
    titleKey: "ourAssociation",
    items: [
      {
        labelKey: "ourMoney",
        href: "/dashboard/association",
        icon: Landmark,
        exact: true,
      },
      // Beside "our money", and above the member's own savings, for the same
      // reason: the rules are what a member is held to, not a reference
      // document filed under settings. This is also where they see how far
      // behind they are and what a fine would cost, so burying it would mean
      // the first they hear of a rule is the day it catches them.
      {
        labelKey: "ourRules",
        href: "/dashboard/rules",
        icon: Scale,
        exact: true,
      },
      // Beside the association's money and its rules, because the store is
      // both: stock the members' money paid for, and the one place a member
      // can take something home before they have paid for it. Carries no
      // permission for the same reason the other two do not — a member is
      // entitled to see what the association bought with their savings, and
      // what taking a machine would cost them.
      {
        labelKey: "warehouse",
        href: "/dashboard/warehouse",
        icon: Warehouse,
        exact: true,
      },
    ],
  },
  {
    titleKey: "savings",
    items: [
      { labelKey: "mySavings", href: "/dashboard/savings", icon: PiggyBank, exact: true },
      { labelKey: "transactions", href: "/dashboard/savings/transactions", icon: ScrollText },
      { labelKey: "deposit", href: "/dashboard/savings/deposit", icon: ArrowDownToLine },
      { labelKey: "withdrawals", href: "/dashboard/withdrawals", icon: ArrowUpFromLine },
    ],
  },
  {
    titleKey: "loans",
    items: [
      { labelKey: "myLoans", href: "/dashboard/loans", icon: HandCoins, exact: true },
      { labelKey: "applyLoan", href: "/dashboard/loans/apply", icon: ClipboardList },
      { labelKey: "repayments", href: "/dashboard/loans/repayments", icon: Banknote },
    ],
  },
  {
    titleKey: "account",
    items: [
      // First in the section, and named the thing it is. A member who has been
      // fined should not have to work out that the penalty against them lives
      // under "Our rules" — the word they are looking for is "fines", so that
      // is the word in the sidebar. Carries no permission and no
      // `requiresMemberAccount`: the page tells a member with a clean record
      // that they have none, which is itself worth being able to check.
      { labelKey: "myFines", href: "/dashboard/fines", icon: Gavel, exact: true },
      { labelKey: "accountStatus", href: "/account/status", icon: ShieldQuestion },
      { labelKey: "qrCode", href: "/account/qr", icon: QrCode },
      { labelKey: "membershipCard", href: "/account/card", icon: IdCard },
      { labelKey: "statements", href: "/dashboard/statements", icon: FileText },
      { labelKey: "notifications", href: "/dashboard/notifications", icon: Bell },
      { labelKey: "profile", href: "/dashboard/profile", icon: Settings },
      { labelKey: "myDetails", href: "/account/profile", icon: UserPen },
    ],
  },
];

/**
 * The staff member's own money.
 *
 * Administrators in a savings association are usually members of it: they
 * contribute monthly and borrow like everyone else. These links point at the
 * same personal pages a member uses — the guard behind them scopes every query
 * to the caller's own record — so nothing here grants sight of anyone else's
 * account.
 *
 * The status and QR links have no `requiresMemberAccount` flag because they
 * are meaningful for a pure staff account too: one shows who they are and
 * whether their access is in order, the other is how they sign in.
 */
const PERSONAL_SECTION: NavSection = {
  titleKey: "myAccount",
  items: [
    { labelKey: "accountStatus", href: "/account/status", icon: ShieldQuestion },
    {
      labelKey: "myDashboard",
      href: "/dashboard",
      icon: LayoutDashboard,
      exact: true,
      requiresMemberAccount: true,
    },
    {
      labelKey: "mySavings",
      href: "/dashboard/savings",
      icon: PiggyBank,
      requiresMemberAccount: true,
    },
    {
      labelKey: "myLoans",
      href: "/dashboard/loans",
      icon: HandCoins,
      requiresMemberAccount: true,
    },
    // An officer who saves with the association is fined by the same rules as
    // anybody else, and the register next door shows them everyone's fines but
    // not their own in the personal terms this page uses.
    {
      labelKey: "myFines",
      href: "/dashboard/fines",
      icon: Gavel,
      exact: true,
      requiresMemberAccount: true,
    },
    {
      labelKey: "statements",
      href: "/dashboard/statements",
      icon: FileText,
      requiresMemberAccount: true,
    },
    { labelKey: "qrCode", href: "/account/qr", icon: QrCode },
    { labelKey: "membershipCard", href: "/account/card", icon: IdCard },
    // No `requiresMemberAccount` flag: a staff account with no savings of its
    // own still has a name and a phone number to correct, and this is the only
    // page in the tree that lets them do it.
    { labelKey: "myDetails", href: "/account/profile", icon: UserPen },
  ],
};

const ADMIN_NAV: NavSection[] = [
  {
    items: [{ labelKey: "overview", href: "/admin", icon: LayoutDashboard, exact: true }],
  },
  {
    titleKey: "members",
    items: [
      {
        labelKey: "allMembers",
        href: "/admin/members",
        icon: Users,
        permission: PERMISSIONS.MEMBERS_VIEW,
        exact: true,
      },
      {
        labelKey: "pendingApprovals",
        href: "/admin/members/pending",
        icon: ShieldCheck,
        permission: PERMISSIONS.MEMBERS_APPROVE,
        badgeKey: "pendingMembers",
      },
      // Every member's card in one place, for the office that prints them —
      // most members have no printer, so the association prints and hands
      // them out. Behind the same permission as the register it is drawn from.
      {
        labelKey: "memberCards",
        href: "/admin/members/cards",
        icon: IdCard,
        permission: PERMISSIONS.MEMBERS_VIEW,
      },
    ],
  },
  {
    titleKey: "savings",
    items: [
      {
        labelKey: "accounts",
        href: "/admin/savings",
        icon: Wallet,
        permission: PERMISSIONS.SAVINGS_VIEW_ALL,
        exact: true,
      },
      {
        labelKey: "transactions",
        href: "/admin/savings/transactions",
        icon: ScrollText,
        permission: PERMISSIONS.SAVINGS_VIEW_ALL,
      },
      {
        labelKey: "withdrawals",
        href: "/admin/withdrawals",
        icon: ArrowUpFromLine,
        permission: PERMISSIONS.WITHDRAWALS_VIEW_ALL,
        badgeKey: "pendingWithdrawals",
      },
    ],
  },
  {
    titleKey: "payments",
    items: [
      {
        labelKey: "allPayments",
        href: "/admin/payments",
        icon: CreditCard,
        permission: PERMISSIONS.PAYMENTS_VIEW,
        exact: true,
      },
      {
        labelKey: "unmatched",
        href: "/admin/payments/unmatched",
        icon: Link2,
        permission: PERMISSIONS.PAYMENTS_RECONCILE,
        badgeKey: "unmatchedPayments",
      },
      {
        labelKey: "importStatement",
        href: "/admin/payments/import",
        icon: FileUp,
        permission: PERMISSIONS.PAYMENTS_RECONCILE,
      },
      {
        labelKey: "bkEvents",
        href: "/admin/bk",
        icon: Landmark,
        permission: PERMISSIONS.BK_VIEW,
      },
    ],
  },
  {
    titleKey: "loans",
    items: [
      {
        labelKey: "portfolio",
        href: "/admin/loans",
        icon: HandCoins,
        permission: PERMISSIONS.LOANS_VIEW_ALL,
        exact: true,
      },
      {
        labelKey: "applications",
        href: "/admin/loans/applications",
        icon: ClipboardList,
        permission: PERMISSIONS.LOANS_REVIEW,
        badgeKey: "pendingLoans",
      },
      {
        labelKey: "loanProducts",
        href: "/admin/loans/products",
        icon: Cog,
        permission: PERMISSIONS.LOAN_PRODUCTS_MANAGE,
      },
    ],
  },
  // Ahead of the association section: the rulebook decides what every other
  // screen in this list does, and the arrears list is the one an officer needs
  // to open daily rather than monthly.
  {
    titleKey: "rulesAndDiscipline",
    items: [
      {
        labelKey: "rulebook",
        href: "/admin/rules",
        icon: Scale,
        permission: PERMISSIONS.RULES_MANAGE,
        exact: true,
      },
      {
        labelKey: "contributionStanding",
        href: "/admin/compliance",
        icon: CalendarCheck,
        permission: PERMISSIONS.COMPLIANCE_VIEW,
        exact: true,
      },
      // Beside the arrears list rather than inside it. The two answer different
      // questions: that screen is "who do I call today", this one is "what have
      // we raised, collected and forgiven" — and the second is the one a
      // committee is asked at a meeting. It also gathers the warehouse-credit
      // fines, which have no home on the compliance screen at all.
      {
        labelKey: "fines",
        href: "/admin/fines",
        icon: Gavel,
        permission: PERMISSIONS.COMPLIANCE_VIEW,
        exact: true,
      },
      {
        labelKey: "fundsSeparation",
        href: "/admin/funds",
        icon: Coins,
        permission: PERMISSIONS.PLATFORM_FEES_VIEW,
        exact: true,
      },
    ],
  },
  {
    titleKey: "association",
    items: [
      {
        labelKey: "borrowings",
        href: "/admin/borrowings",
        icon: Landmark,
        permission: PERMISSIONS.BORROWINGS_VIEW,
        exact: true,
      },
      {
        labelKey: "investments",
        href: "/admin/investments",
        icon: Sprout,
        permission: PERMISSIONS.INVESTMENTS_VIEW,
        exact: true,
      },
      // Association property held in a form that is not cash. It sits beside
      // borrowings and investments rather than under savings because that is
      // what it is: another place the members' money currently lives.
      {
        labelKey: "warehouse",
        href: "/admin/warehouse",
        icon: Warehouse,
        permission: PERMISSIONS.WAREHOUSE_VIEW,
        exact: true,
      },
      {
        labelKey: "reports",
        href: "/admin/reports",
        icon: BarChart3,
        permission: PERMISSIONS.REPORTS_VIEW_ASSOCIATION,
      },
      {
        labelKey: "notifications",
        href: "/admin/notifications",
        icon: Bell,
        permission: PERMISSIONS.NOTIFICATIONS_SEND,
      },
      {
        labelKey: "auditLog",
        href: "/admin/audit",
        icon: Activity,
        permission: PERMISSIONS.AUDIT_VIEW,
      },
      {
        labelKey: "settings",
        href: "/admin/settings",
        icon: Settings,
        permission: PERMISSIONS.ASSOCIATION_SETTINGS,
      },
    ],
  },
  PERSONAL_SECTION,
];

const SUPER_ADMIN_NAV: NavSection[] = [
  {
    items: [
      { labelKey: "platformOverview", href: "/super-admin", icon: Gauge, exact: true },
    ],
  },
  {
    titleKey: "tenants",
    items: [
      { labelKey: "associations", href: "/super-admin/associations", icon: Building2 },
      { labelKey: "administrators", href: "/super-admin/admins", icon: ShieldCheck },
      { labelKey: "permissions", href: "/super-admin/permissions", icon: Users },
    ],
  },
  {
    titleKey: "financialOversight",
    items: [
      { labelKey: "allTransactions", href: "/super-admin/transactions", icon: ScrollText },
      { labelKey: "allPayments", href: "/super-admin/payments", icon: CreditCard },
      { labelKey: "loanPortfolio", href: "/super-admin/loans", icon: HandCoins },
      { labelKey: "reports", href: "/super-admin/reports", icon: BarChart3 },
    ],
  },
  {
    titleKey: "system",
    items: [
      { labelKey: "integrations", href: "/super-admin/integrations", icon: Link2 },
      { labelKey: "backgroundJobs", href: "/super-admin/jobs", icon: Activity },
      { labelKey: "auditLog", href: "/super-admin/audit", icon: ScrollText },
      { labelKey: "settings", href: "/super-admin/settings", icon: Settings },
    ],
  },
  PERSONAL_SECTION,
];

export function navigationFor(role: UserRole): NavSection[] {
  switch (role) {
    case "MEMBER":
      return MEMBER_NAV;
    case "ADMIN":
      return ADMIN_NAV;
    case "SUPER_ADMIN":
      return SUPER_ADMIN_NAV;
  }
}

/**
 * Filters a navigation tree down to what the user may see.
 *
 * Two independent filters, because they answer different questions. A
 * permission decides what someone is allowed to do to the association's
 * records; `hasMemberAccount` decides whether they have records of their own to
 * look at. An administrator passes the first for every savings link in the
 * tree and still has no personal balance to show.
 *
 * A section that empties out is dropped, so a staff account with no membership
 * does not get a "My money" heading with nothing under it.
 */
export function visibleNavigation(
  role: UserRole,
  permissions: Set<string> | string[],
  options: { hasMemberAccount?: boolean } = {}
): NavSection[] {
  const held = permissions instanceof Set ? permissions : new Set(permissions);
  const hasMemberAccount = options.hasMemberAccount ?? role === "MEMBER";

  return navigationFor(role)
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) =>
          (!item.permission || held.has(item.permission)) &&
          (!item.requiresMemberAccount || hasMemberAccount)
      ),
    }))
    .filter((section) => section.items.length > 0);
}

/** True when `pathname` should highlight `item`. */
export function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/**
 * Human-readable labels for breadcrumb segments that are not obvious from the
 * URL. Anything unlisted is title-cased from the slug.
 */
export const BREADCRUMB_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  admin: "Administration",
  "super-admin": "Platform",
  savings: "Savings",
  transactions: "Transactions",
  withdrawals: "Withdrawals",
  loans: "Loans",
  applications: "Applications",
  products: "Loan products",
  repayments: "Repayments",
  payments: "Payments",
  unmatched: "Unmatched payments",
  members: "Members",
  pending: "Pending approvals",
  reports: "Reports",
  statements: "Statements",
  notifications: "Notifications",
  profile: "Profile",
  settings: "Settings",
  audit: "Audit log",
  associations: "Associations",
  admins: "Administrators",
  permissions: "Permissions",
  integrations: "Integrations",
  jobs: "Background jobs",
  apply: "New application",
  association: "Our association",
  borrowings: "Bank borrowing",
  investments: "Investments",
  warehouse: "Warehouse",
  fines: "Fines",
  compliance: "Contribution standing",
  deposit: "Make a deposit",
  account: "Account",
  status: "Account status",
  qr: "Sign-in QR code",
  password: "Security & password",
};
