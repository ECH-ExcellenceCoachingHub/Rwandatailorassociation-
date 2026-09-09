import type { Locale } from "@/types";

/** Sidebar section headings and item labels, keyed to lib/navigation.ts. */
export interface NavCopy {
  overview: string;
  savings: string;
  mySavings: string;
  transactions: string;
  deposit: string;
  withdrawals: string;
  loans: string;
  myLoans: string;
  applyLoan: string;
  repayments: string;
  account: string;
  myAccount: string;
  myDashboard: string;
  accountStatus: string;
  qrCode: string;
  membershipCard: string;
  statements: string;
  notifications: string;
  profile: string;
  myDetails: string;

  ourAssociation: string;
  ourMoney: string;
  ourRules: string;
  myFines: string;
  borrowings: string;
  investments: string;
  warehouse: string;

  rulesAndDiscipline: string;
  rulebook: string;
  contributionStanding: string;
  fines: string;
  fundsSeparation: string;

  members: string;
  allMembers: string;
  pendingApprovals: string;
  accounts: string;
  payments: string;
  allPayments: string;
  unmatched: string;
  importStatement: string;
  bkEvents: string;
  portfolio: string;
  applications: string;
  loanProducts: string;
  association: string;
  reports: string;
  auditLog: string;
  settings: string;

  platformOverview: string;
  tenants: string;
  associations: string;
  administrators: string;
  permissions: string;
  financialOversight: string;
  allTransactions: string;
  loanPortfolio: string;
  system: string;
  integrations: string;
  backgroundJobs: string;
}

export const nav: Record<Locale, NavCopy> = {
  en: {
    overview: "Overview",
    savings: "Savings",
    mySavings: "My savings",
    transactions: "Transactions",
    deposit: "Deposit",
    withdrawals: "Withdrawals",
    loans: "Loans",
    myLoans: "My loans",
    applyLoan: "Apply for a loan",
    repayments: "Repayments",
    account: "Account",
    myAccount: "My money",
    myDashboard: "My overview",
    accountStatus: "Account status",
    qrCode: "My QR code",
    membershipCard: "My card",
    statements: "Statements",
    notifications: "Notifications",
    profile: "Profile",
    myDetails: "My details",

    ourAssociation: "Our association",
    ourMoney: "Our money",
    ourRules: "Our rules",
    myFines: "My fines",
    borrowings: "Bank borrowing",
    investments: "What our money did",
    warehouse: "Warehouse",

    rulesAndDiscipline: "Rules & discipline",
    rulebook: "Rulebook",
    contributionStanding: "Who is up to date",
    fines: "Fines",
    fundsSeparation: "Whose money is whose",

    members: "Members",
    allMembers: "All members",
    pendingApprovals: "Pending approvals",
    accounts: "Accounts",
    payments: "Payments",
    allPayments: "All payments",
    unmatched: "Unmatched",
    importStatement: "Import statement",
    bkEvents: "BK events",
    portfolio: "Portfolio",
    applications: "Applications",
    loanProducts: "Loan products",
    association: "Association",
    reports: "Reports",
    auditLog: "Audit log",
    settings: "Settings",

    platformOverview: "Platform overview",
    tenants: "Tenants",
    associations: "Associations",
    administrators: "Administrators",
    permissions: "Permissions",
    financialOversight: "Financial oversight",
    allTransactions: "All transactions",
    loanPortfolio: "Loan portfolio",
    system: "System",
    integrations: "Integrations",
    backgroundJobs: "Background jobs",
  },

  rw: {
    overview: "Incamake",
    savings: "Kuzigama",
    mySavings: "Ubuzigame bwanjye",
    transactions: "Ibikorwa",
    deposit: "Kubitsa",
    withdrawals: "Kubikuza",
    loans: "Inguzanyo",
    myLoans: "Inguzanyo zanjye",
    applyLoan: "Gusaba inguzanyo",
    repayments: "Kwishyura",
    account: "Konti",
    myAccount: "Amafaranga yanjye",
    myDashboard: "Incamake yanjye",
    accountStatus: "Uko konti ihagaze",
    qrCode: "Kode yanjye ya QR",
    membershipCard: "Ikarita yanjye",
    statements: "Inyandiko za konti",
    notifications: "Ubutumwa",
    profile: "Umwirondoro",
    myDetails: "Amakuru yanjye",

    ourAssociation: "Ihuriro ryacu",
    ourMoney: "Amafaranga yacu",
    ourRules: "Amategeko yacu",
    myFines: "Amahazabu yanjye",
    borrowings: "Inguzanyo za banki",
    investments: "Icyo amafaranga yacu yakoze",
    warehouse: "Ububiko",

    rulesAndDiscipline: "Amategeko n'imyitwarire",
    rulebook: "Igitabo cy'amategeko",
    contributionStanding: "Abishyuye byose",
    fines: "Amahazabu",
    fundsSeparation: "Amafaranga y'undi n'ay'undi",

    members: "Abanyamuryango",
    allMembers: "Abanyamuryango bose",
    pendingApprovals: "Bategereje kwemezwa",
    accounts: "Konti",
    payments: "Ubwishyu",
    allPayments: "Ubwishyu bwose",
    unmatched: "Butarahuzwa",
    importStatement: "Kwinjiza inyandiko ya banki",
    bkEvents: "Ibikorwa bya BK",
    portfolio: "Inguzanyo zose",
    applications: "Ubusabe",
    loanProducts: "Ubwoko bw'inguzanyo",
    association: "Ihuriro",
    reports: "Raporo",
    auditLog: "Ibyakozwe byose",
    settings: "Igenamiterere",

    platformOverview: "Incamake y'urubuga",
    tenants: "Amahuriro",
    associations: "Amahuriro",
    administrators: "Abayobozi",
    permissions: "Uburenganzira",
    financialOversight: "Igenzura ry'imari",
    allTransactions: "Ibikorwa byose",
    loanPortfolio: "Inguzanyo zose",
    system: "Sisitemu",
    integrations: "Ihuzwa rya serivisi",
    backgroundJobs: "Imirimo yikora",
  },
};
