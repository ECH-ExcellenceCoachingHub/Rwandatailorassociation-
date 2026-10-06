import type { Locale } from "@/types";

/**
 * The shared components the dashboard pages are built from: filter bars,
 * pagination, the ledger and payment tables, charts and review queues.
 *
 * These are kept apart from the page dictionaries because one of them appears
 * on a dozen screens — the transaction table is the same table for a member,
 * an administrator and a super administrator — and duplicating its column
 * headings per page is how two screens end up disagreeing about what a column
 * means.
 *
 * Filter option labels are translated; their values are not. The value is the
 * database enum that reaches Prisma, so it stays in the URL and in the query
 * exactly as the schema spells it.
 */
export interface ViewsCopy {
  pagination: {
    label: string;
    showing: string;
    previous: string;
    next: string;
    page: string;
  };
  notifications: {
    markAllRead: string;
  };
  paymentCard: {
    label: string;
    copy: string;
    note: string;
  };
  filters: {
    search: string;
    apply: string;
    clear: string;
    type: string;
    from: string;
    to: string;
    searchTransactions: string;
    searchMembers: string;
    allTypes: string;
    deposits: string;
    withdrawals: string;
    loanDisbursements: string;
    loanRepayments: string;
    interest: string;
    fees: string;
    penalties: string;
    adjustments: string;
    reversals: string;
    allStatuses: string;
    pendingApproval: string;
    active: string;
    suspended: string;
    inactive: string;
    rejected: string;
    exited: string;
    account: string;
    allAccounts: string;
    district: string;
    allDistricts: string;
    noDistrict: string;
    cardPayment: string;
    anyCardPayment: string;
    cardPaid: string;
    cardUnpaid: string;
    searching: string;
  };
  transactions: {
    matching: string;
    totalIn: string;
    totalOut: string;
    noneTitle: string;
    noneBody: string;
    colMember: string;
    balanceAfter: string;
  };
  confirm: {
    reason: string;
    reasonPlaceholder: string;
    reasonTooShort: string;
    charactersNeeded: string;
    auditNote: string;
    working: string;
    actionFailed: string;
  };
  pendingMembers: {
    colApplicant: string;
    colContact: string;
    colOccupation: string;
    colApplied: string;
    colDecision: string;
    approve: string;
    decline: string;
    actionFailed: string;
    approveTitle: string;
    approveBody: string;
    approveConfirm: string;
    declineTitle: string;
    declineBody: string;
    declineConfirm: string;
    declineReasonLabel: string;
    declineReasonPlaceholder: string;
  };
  charts: {
    balance: string;
    deposits: string;
    withdrawals: string;
    repaidOf: string;
    progressLabel: string;
    noChange: string;
  };
  audit: {
    noneTitle: string;
    noneBody: string;
    colWhen: string;
    colAction: string;
    colActor: string;
    colEntity: string;
    colChange: string;
    colSeverity: string;
    system: string;
    removed: string;
  };
  statement: {
    membershipNumber: string;
    paymentReference: string;
    from: string;
    to: string;
    invalidRange: string;
    openPrintable: string;
    downloadCsv: string;
  };
  loans: {
    outstanding: string;
    openLoans: string;
    inArrears: string;
    overdueLoans: string;
    totalDisbursed: string;
    disbursedHint: string;
    awaitingDisbursement: string;
    awaitingHint: string;
    searchPlaceholder: string;
    allStatuses: string;
    statusActive: string;
    statusOverdue: string;
    statusDisbursed: string;
    statusPendingDisbursement: string;
    statusCompleted: string;
    statusDefaulted: string;
    statusWrittenOff: string;
    statusRestructured: string;
    statusCancelled: string;
    noneTitle: string;
    noneFilteredBody: string;
    noneBody: string;
    colLoan: string;
    colMember: string;
    colPrincipal: string;
    colOutstanding: string;
    colRepaid: string;
    colMaturity: string;
    overdueSuffix: string;
    repaidPercent: string;
    months: string;
  };
  payments: {
    matching: string;
    processed: string;
    creditedToMember: string;
    unmatched: string;
    needsAttribution: string;
    nothingWaiting: string;
    failed: string;
    rejectedAtVerification: string;
    searchPlaceholder: string;
    flagged: string;
    allPayments: string;
    suspiciousOnly: string;
    allStatuses: string;
    statusProcessed: string;
    statusMatched: string;
    statusVerified: string;
    statusReceived: string;
    statusPending: string;
    statusUnmatched: string;
    statusFailed: string;
    statusDuplicate: string;
    statusRejected: string;
    noneTitle: string;
    noneBody: string;
    colPayment: string;
    colPayer: string;
    colCreditedTo: string;
    colReceived: string;
    flaggedSuspicious: string;
    notAttributed: string;
    unverified: string;
  };
  settings: {
    colSetting: string;
    colValue: string;
    colType: string;
    colLastChanged: string;
    configured: string;
    notSet: string;
    platformManaged: string;
    changedBy: string;
  };
}

export const views: Record<Locale, ViewsCopy> = {
  en: {
    pagination: {
      label: "Pagination",
      showing: "Showing",
      previous: "Previous page",
      next: "Next page",
      page: "Page {page}",
    },
    notifications: {
      markAllRead: "Mark all read",
    },
    paymentCard: {
      label: "Your payment reference",
      copy: "Copy payment reference",
      note: "Quote this on every payment you make. Without it your contribution cannot be matched to your account automatically.",
    },
    filters: {
      search: "Search",
      apply: "Apply",
      clear: "Clear",
      type: "Type",
      from: "From",
      to: "To",
      searchTransactions: "Reference or description…",
      searchMembers: "Name, member number, phone, payment reference…",
      allTypes: "All types",
      deposits: "Deposits",
      withdrawals: "Withdrawals",
      loanDisbursements: "Loan disbursements",
      loanRepayments: "Loan repayments",
      interest: "Interest",
      fees: "Fees",
      penalties: "Penalties",
      adjustments: "Adjustments",
      reversals: "Reversals",
      allStatuses: "All statuses",
      pendingApproval: "Pending approval",
      active: "Active",
      suspended: "Suspended",
      inactive: "Inactive",
      rejected: "Rejected",
      exited: "Exited",
      account: "Account",
      allAccounts: "All accounts",
      district: "District",
      allDistricts: "All districts",
      noDistrict: "No district on file",
      cardPayment: "Card payment",
      anyCardPayment: "Paid or not",
      cardPaid: "Card paid",
      cardUnpaid: "Card not paid",
      searching: "Searching…",
    },
    transactions: {
      matching: "Matching transactions",
      totalIn: "Total in",
      totalOut: "Total out",
      noneTitle: "No transactions found",
      noneBody:
        "No transactions match these filters. Try widening the date range or clearing the search.",
      colMember: "Member",
      balanceAfter: "Balance after",
    },
    confirm: {
      reason: "Reason",
      reasonPlaceholder: "Explain why this action is being taken…",
      reasonTooShort:
        "Please give a reason of at least {count} character.|Please give a reason of at least {count} characters.",
      charactersNeeded:
        "{count} more character needed.|{count} more characters needed.",
      auditNote:
        "This is recorded permanently in the audit log against your name.",
      working: "Working…",
      actionFailed: "The action could not be completed.",
    },
    pendingMembers: {
      colApplicant: "Applicant",
      colContact: "Contact",
      colOccupation: "Occupation",
      colApplied: "Applied",
      colDecision: "Decision",
      approve: "Approve",
      decline: "Decline",
      actionFailed: "The action could not be completed",
      approveTitle: "Approve this membership?",
      approveBody:
        "{name} will be able to sign in, and their savings account will be opened. They will be sent payment reference {reference}.",
      approveConfirm: "Approve membership",
      declineTitle: "Decline this application?",
      declineBody:
        "{name} will be told their application was not approved, and will not be able to sign in.",
      declineConfirm: "Decline application",
      declineReasonLabel: "Why is this application being declined?",
      declineReasonPlaceholder:
        "e.g. Could not verify the national ID provided",
    },
    charts: {
      balance: "Balance",
      deposits: "Deposits",
      withdrawals: "Withdrawals",
      repaidOf: "of {total} repaid",
      progressLabel: "Loan repayment progress",
      noChange: "No change",
    },
    audit: {
      noneTitle: "No audit entries",
      noneBody:
        "Consequential actions — approvals, adjustments, reversals, permission changes — are recorded here as they happen.",
      colWhen: "When",
      colAction: "Action",
      colActor: "Actor",
      colEntity: "Entity",
      colChange: "Change",
      colSeverity: "Severity",
      system: "system",
      removed: "(removed)",
    },
    statement: {
      membershipNumber: "Membership number",
      paymentReference: "Payment reference",
      from: "From",
      to: "To",
      invalidRange: "The end date must be after the start date",
      openPrintable: "Open printable statement (PDF)",
      downloadCsv: "Download CSV",
    },
    loans: {
      outstanding: "Outstanding",
      openLoans: "{count} open loan|{count} open loans",
      inArrears: "In arrears",
      overdueLoans: "{count} overdue loan|{count} overdue loans",
      totalDisbursed: "Total disbursed",
      disbursedHint: "Principal paid out to date",
      awaitingDisbursement: "Awaiting disbursement",
      awaitingHint: "Approved but not yet paid out",
      searchPlaceholder: "Loan reference, member name or member number…",
      allStatuses: "All statuses",
      statusActive: "Active",
      statusOverdue: "Overdue",
      statusDisbursed: "Disbursed",
      statusPendingDisbursement: "Awaiting disbursement",
      statusCompleted: "Completed",
      statusDefaulted: "Defaulted",
      statusWrittenOff: "Written off",
      statusRestructured: "Restructured",
      statusCancelled: "Cancelled",
      noneTitle: "No loans found",
      noneFilteredBody: "No loans match these filters. Try clearing them.",
      noneBody:
        "No loans have been disbursed yet. Approved applications appear here once disbursed.",
      colLoan: "Loan",
      colMember: "Member",
      colPrincipal: "Principal",
      colOutstanding: "Outstanding",
      colRepaid: "Repaid",
      colMaturity: "Maturity",
      overdueSuffix: "{amount} overdue",
      repaidPercent: "{percent}% repaid",
      months: "{count}mo",
    },
    payments: {
      matching: "Matching payments",
      processed: "Processed",
      creditedToMember: "Credited to a member",
      unmatched: "Unmatched",
      needsAttribution: "Needs manual attribution",
      nothingWaiting: "Nothing waiting",
      failed: "Failed",
      rejectedAtVerification: "Rejected at verification",
      searchPlaceholder:
        "Provider id, reference, payer name, phone or narration…",
      flagged: "Flagged",
      allPayments: "All payments",
      suspiciousOnly: "Suspicious only",
      allStatuses: "All statuses",
      statusProcessed: "Processed",
      statusMatched: "Matched",
      statusVerified: "Verified",
      statusReceived: "Received",
      statusPending: "Pending",
      statusUnmatched: "Unmatched",
      statusFailed: "Failed",
      statusDuplicate: "Duplicate",
      statusRejected: "Rejected",
      noneTitle: "No payments found",
      noneBody:
        "No payments match these filters. Try clearing them, or check that the reconciliation worker is running.",
      colPayment: "Payment",
      colPayer: "Payer",
      colCreditedTo: "Credited to",
      colReceived: "Received",
      flaggedSuspicious: "Flagged as suspicious",
      notAttributed: "Not attributed",
      unverified: "unverified",
    },
    settings: {
      colSetting: "Setting",
      colValue: "Value",
      colType: "Type",
      colLastChanged: "Last changed",
      configured: "Configured",
      notSet: "Not set",
      platformManaged: "Platform-managed",
      changedBy: "by {name}",
    },
  },

  rw: {
    pagination: {
      label: "Impapuro",
      showing: "Byerekanwe",
      previous: "Urupapuro rwabanje",
      next: "Urupapuro rukurikira",
      page: "Urupapuro rwa {page}",
    },
    notifications: {
      markAllRead: "Shyira byose nk'ibisomwe",
    },
    paymentCard: {
      label: "Nimero yawe y'ubwishyu",
      copy: "Koporora nimero y'ubwishyu",
      note: "Andika iyi nimero kuri buri bwishyu ukora. Utayanditse, umusanzu wawe ntushobora guhuzwa na konti yawe byikora.",
    },
    filters: {
      search: "Shakisha",
      apply: "Emeza",
      clear: "Siba",
      type: "Ubwoko",
      from: "Kuva",
      to: "Kugeza",
      searchTransactions: "Nimero cyangwa ibisobanuro…",
      searchMembers:
        "Izina, nimero y'umunyamuryango, telefone, nimero y'ubwishyu…",
      allTypes: "Ubwoko bwose",
      deposits: "Ubwitso",
      withdrawals: "Ubwikuze",
      loanDisbursements: "Itangwa ry'inguzanyo",
      loanRepayments: "Ubwishyu bw'inguzanyo",
      interest: "Inyungu",
      fees: "Amafaranga y'ikiguzi",
      penalties: "Ihazabu",
      adjustments: "Ibikosorwa",
      reversals: "Ibisubizwa inyuma",
      allStatuses: "Imimerere yose",
      pendingApproval: "Ategereje kwemezwa",
      active: "Arakora",
      suspended: "Yahagaritswe",
      inactive: "Ntakora",
      rejected: "Yanzwe",
      exited: "Yavuye mu ihuriro",
      account: "Konti",
      allAccounts: "Konti zose",
      district: "Akarere",
      allDistricts: "Uturere twose",
      noDistrict: "Nta karere kanditse",
      cardPayment: "Kwishyura ikarita",
      anyCardPayment: "Yishyuwe cyangwa itishyuwe",
      cardPaid: "Ikarita yishyuwe",
      cardUnpaid: "Ikarita itarishyurwa",
      searching: "Birashakishwa…",
    },
    transactions: {
      matching: "Ibikorwa bihuye",
      totalIn: "Ayinjiye yose",
      totalOut: "Ayasohotse yose",
      noneTitle: "Nta gikorwa cyabonetse",
      noneBody:
        "Nta gikorwa gihuye n'ibyo washungurishije. Gerageza wagure igihe cyangwa usibe ibyo washakishije.",
      colMember: "Umunyamuryango",
      balanceAfter: "Amafaranga asigaye",
    },
    confirm: {
      reason: "Impamvu",
      reasonPlaceholder: "Sobanura impamvu iki gikorwa gikorwa…",
      reasonTooShort:
        "Tanga impamvu ifite byibuze inyuguti {count}.|Tanga impamvu ifite byibuze inyuguti {count}.",
      charactersNeeded:
        "Hasigaye inyuguti {count}.|Hasigaye inyuguti {count}.",
      auditNote:
        "Ibi byandikwa burundu mu gitabo cy'ibyakozwe ku izina ryawe.",
      working: "Turakora…",
      actionFailed: "Igikorwa ntikashoboye kurangira.",
    },
    pendingMembers: {
      colApplicant: "Usaba",
      colContact: "Aho bamugeraho",
      colOccupation: "Umwuga",
      colApplied: "Yasabye",
      colDecision: "Icyemezo",
      approve: "Emeza",
      decline: "Anga",
      actionFailed: "Igikorwa ntikashoboye kurangira",
      approveTitle: "Wemeza ubu bunyamuryango?",
      approveBody:
        "{name} azashobora kwinjira, kandi konti ye y'ubuzigame izafungurwa. Azoherezwa nimero y'ubwishyu {reference}.",
      approveConfirm: "Emeza ubunyamuryango",
      declineTitle: "Wanga ubu busabe?",
      declineBody:
        "{name} azabwirwa ko ubusabe bwe butemewe, kandi ntazashobora kwinjira.",
      declineConfirm: "Anga ubusabe",
      declineReasonLabel: "Kuki ubu busabe bwangwa?",
      declineReasonPlaceholder:
        "urugero: Ntitwashoboye kugenzura indangamuntu yatanzwe",
    },
    charts: {
      balance: "Amafaranga asigaye",
      deposits: "Ubwitso",
      withdrawals: "Ubwikuze",
      repaidOf: "kuri {total} yishyuwe",
      progressLabel: "Aho ubwishyu bw'inguzanyo bugeze",
      noChange: "Nta mpinduka",
    },
    audit: {
      noneTitle: "Nta cyanditswe",
      noneBody:
        "Ibikorwa by'ingirakamaro — kwemeza, gukosora, gusubiza inyuma, guhindura uburenganzira — byandikwa hano uko bibaye.",
      colWhen: "Igihe",
      colAction: "Igikorwa",
      colActor: "Uwagikoze",
      colEntity: "Icyakozweho",
      colChange: "Impinduka",
      colSeverity: "Uburemere",
      system: "sisitemu",
      removed: "(cyakuweho)",
    },
    statement: {
      membershipNumber: "Nimero y'umunyamuryango",
      paymentReference: "Nimero y'ubwishyu",
      from: "Kuva",
      to: "Kugeza",
      invalidRange: "Itariki y'iherezo igomba kuza nyuma y'itariki y'itangiriro",
      openPrintable: "Fungura inyandiko ishobora gucapwa (PDF)",
      downloadCsv: "Kuramo CSV",
    },
    loans: {
      outstanding: "Asigaye",
      openLoans: "Inguzanyo {count} ifunguye|Inguzanyo {count} zifunguye",
      inArrears: "Umwenda urengeje igihe",
      overdueLoans:
        "Inguzanyo {count} yarengeje igihe|Inguzanyo {count} zarengeje igihe",
      totalDisbursed: "Yatanzwe yose",
      disbursedHint: "Amafaranga y'ibanze yatanzwe kugeza ubu",
      awaitingDisbursement: "Zitegereje gutangwa",
      awaitingHint: "Zemejwe ariko ntizatanzwe",
      searchPlaceholder:
        "Nimero y'inguzanyo, izina cyangwa nimero y'umunyamuryango…",
      allStatuses: "Imimerere yose",
      statusActive: "Irakora",
      statusOverdue: "Yarengeje igihe",
      statusDisbursed: "Yatanzwe",
      statusPendingDisbursement: "Itegereje gutangwa",
      statusCompleted: "Yarangiye",
      statusDefaulted: "Yanze kwishyurwa",
      statusWrittenOff: "Yasibwe mu bitabo",
      statusRestructured: "Yavuguruwe",
      statusCancelled: "Yahagaritswe",
      noneTitle: "Nta nguzanyo yabonetse",
      noneFilteredBody:
        "Nta nguzanyo ihuye n'ibi bishungurwa. Gerageza ubisibe.",
      noneBody:
        "Nta nguzanyo iratangwa. Ubusabe bwemejwe bugaragara hano bumaze gutangwa.",
      colLoan: "Inguzanyo",
      colMember: "Umunyamuryango",
      colPrincipal: "Umwenda w'ibanze",
      colOutstanding: "Asigaye",
      colRepaid: "Yishyuwe",
      colMaturity: "Irangira",
      overdueSuffix: "{amount} yarengeje igihe",
      repaidPercent: "{percent}% byishyuwe",
      months: "amezi {count}",
    },
    payments: {
      matching: "Ubwishyu buhuye",
      processed: "Bwatunganyijwe",
      creditedToMember: "Bwanditswe kuri konti y'umunyamuryango",
      unmatched: "Butarahuzwa",
      needsAttribution: "Busaba guhuzwa n'intoki",
      nothingWaiting: "Nta kintu gitegereje",
      failed: "Bwananiranye",
      rejectedAtVerification: "Bwanzwe mu igenzura",
      searchPlaceholder:
        "Nimero y'utanga serivisi, nimero y'ubwishyu, izina ry'uwishyuye, telefone cyangwa ibisobanuro…",
      flagged: "Bushidikanywaho",
      allPayments: "Ubwishyu bwose",
      suspiciousOnly: "Bushidikanywaho gusa",
      allStatuses: "Imimerere yose",
      statusProcessed: "Bwatunganyijwe",
      statusMatched: "Bwahujwe",
      statusVerified: "Bwagenzuwe",
      statusReceived: "Bwakiriwe",
      statusPending: "Butegereje",
      statusUnmatched: "Butarahuzwa",
      statusFailed: "Bwananiranye",
      statusDuplicate: "Busubiranamo",
      statusRejected: "Bwanzwe",
      noneTitle: "Nta bwishyu bwabonetse",
      noneBody:
        "Nta bwishyu buhuye n'ibi bishungurwa. Gerageza ubisibe, cyangwa ugenzure ko umukozi uhuza ubwishyu arakora.",
      colPayment: "Ubwishyu",
      colPayer: "Uwishyuye",
      colCreditedTo: "Bwanditswe kuri",
      colReceived: "Bwakiriwe",
      flaggedSuspicious: "Bushyizwe ku ruhande nk'ubushidikanywaho",
      notAttributed: "Ntibwahuzwa",
      unverified: "ntibwagenzuwe",
    },
    settings: {
      colSetting: "Igenamiterere",
      colValue: "Agaciro",
      colType: "Ubwoko",
      colLastChanged: "Byaheruka guhindurwa",
      configured: "Byashyizweho",
      notSet: "Ntibyashyizweho",
      platformManaged: "Bigengwa n'urubuga",
      changedBy: "na {name}",
    },
  },
};
