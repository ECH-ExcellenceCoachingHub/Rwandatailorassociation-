import type { Locale } from "@/types";

/**
 * The association administrator's screens: the register, payments, loans,
 * withdrawals, reports, the audit log and settings.
 *
 * Translated for the same reason as the member's own pages, even though staff
 * are more likely to read English: an association officer in a district office
 * is not necessarily an English speaker, and an administrator who half-follows
 * an instruction is approving real money.
 *
 * Enum values — a member's status, a transaction type — are rendered by
 * StatusBadge from the database value and are not translated here; they are the
 * words the ledger itself uses, and two names for one state is how a
 * reconciliation goes wrong.
 */
export interface AdminCopy {
  overview: {
    title: string;
    platform: string;
    description: string;
    unmatchedPayments: string;
    unmatchedDetail: string;
    overdueLoans: string;
    overdueDetail: string;
    membershipApplications: string;
    awaitingApproval: string;
    suspiciousTitle: string;
    suspiciousBody: string;
    reviewThem: string;
    funds: string;
    totalSavings: string;
    activeMembers: string;
    collectedToday: string;
    transactionsToday: string;
    collectedThisMonth: string;
    withdrawalsHint: string;
    outstandingLoans: string;
    activeLoans: string;
    needsAttention: string;
    pendingApplications: string;
    pendingApplicationsHint: string;
    pendingWithdrawals: string;
    unmatchedCount: string;
    overdueCount: string;
    membership: string;
    totalMembers: string;
    joinedThisMonth: string;
    active: string;
    pendingApproval: string;
    suspended: string;
    monthlyDeposits: string;
    monthlyDepositsHint: string;
    monthlyWithdrawals: string;
    monthlyWithdrawalsHint: string;
    seriesDeposits: string;
    seriesWithdrawals: string;
    noData: string;
    latestTransactions: string;
    colChannel: string;
    noTransactions: string;
  };
  members: {
    title: string;
    inRegister: string;
    enrol: string;
    noneTitle: string;
    noneBody: string;
    colMember: string;
    colContact: string;
    colSavings: string;
    colLoanOwing: string;
    colKyc: string;
    colJoined: string;
    overdue: string;

    pendingTitle: string;
    pendingDescription: string;
    pendingNoneTitle: string;
    pendingNoneBody: string;
    pendingNotice: string;

    newTitle: string;
    newDescription: string;
    newDescriptionPlain: string;
    backToRegister: string;
    noAssociationTitle: string;
    noAssociationBody: string;

    editTitle: string;
    editDescription: string;
    backToFile: string;
  };
  /// A single member's file.
  file: {
    description: string;
    editDetails: string;
    suspendedReason: string;
    savingsBalance: string;
    accountNumber: string;
    noAccount: string;
    available: string;
    locked: string;
    nothingToWithdraw: string;
    loansOwing: string;
    loansOnFile: string;
    overdueLoans: string;
    inArrears: string;
    upToDate: string;
    memberFile: string;
    memberNumber: string;
    paymentReference: string;
    business: string;
    joined: string;
    approvedOn: string;
    contactAccess: string;
    emailVerified: string;
    phoneVerified: string;
    mobileMoney: string;
    bankAccount: string;
    lastSignIn: string;
    nextOfKin: string;
    theirPhone: string;
    loans: string;
    colPrincipal: string;
    colPayable: string;
    colRepaid: string;
    colOutstanding: string;
    colDisbursed: string;
    daysLate: string;
    neverBorrowed: string;
    recentTransactions: string;
    balanceAfter: string;
    noTransactions: string;
    notes: string;
    noNotes: string;
    internal: string;
  };
  savings: {
    title: string;
    description: string;
    totalHeld: string;
    accountCount: string;
    locked: string;
    lockedHint: string;
    available: string;
    availableHint: string;
    searchPlaceholder: string;
    noneTitle: string;
    noneSearchBody: string;
    noneBody: string;
    colMember: string;
    colAccount: string;
    colLocked: string;
    colAvailable: string;
    colDeposits: string;
    colWithdrawn: string;
    colLastActivity: string;
    transactionCount: string;
  };
  transactions: {
    title: string;
    description: string;
  };
  payments: {
    title: string;
    description: string;
    unmatchedTitle: string;
    unmatchedDescription: string;
    unmatchedNoneTitle: string;
    unmatchedNoneBody: string;
    unmatchedCount: string;
    unmatchedNotice: string;

    selectedCount: string;
    selectedNote: string;
    clearSelection: string;
    deleteSelected: string;
    emptyQueueLead: string;
    emptyQueueCount: string;
    emptyQueueTail: string;
    deleteAll: string;

    selectAllOnPage: string;
    selectPayment: string;
    colReceived: string;
    colNarration: string;
    colWhyUnmatched: string;
    colAction: string;
    noNarration: string;
    flaggedSuspicious: string;
    noEvidence: string;
    possibleMembers: string;
    notVerified: string;
    match: string;
    noPermission: string;
    cannotCredit: string;

    selectMemberFirst: string;
    creditFailed: string;
    deleteFailed: string;
    nonePicked: string;
    bulkDeleteFailed: string;
    paymentDeleted: string;
    paymentsDeleted: string;

    matchTitle: string;
    matchBody: string;
    matchConfirm: string;
    matchReasonLabel: string;
    matchReasonPlaceholder: string;
    matchMemberLabel: string;
    matchMemberPlaceholder: string;
    narrationOnPayment: string;

    deleteTitle: string;
    deleteBody: string;
    deleteConfirm: string;
    deleteReasonLabel: string;
    deleteReasonPlaceholder: string;
    deleteNoteOnlyUnattributable: string;
    deleteNoteReappears: string;
    narration: string;

    bulkAllTitle: string;
    bulkSelectedTitle: string;
    bulkAllBody: string;
    bulkSelectedBody: string;
    bulkReasonLabel: string;
    bulkReasonPlaceholder: string;
    bulkNoteAudited: string;
    bulkNoteSkipsCredited: string;
    bulkNoteClearsQueue: string;
  };
  loans: {
    title: string;
    description: string;
  };
  audit: {
    title: string;
    description: string;
  };
  withdrawals: {
    title: string;
    description: string;
    noneTitle: string;
    noneBody: string;

    colRequested: string;
    colPayoutTo: string;
    colAction: string;
    net: string;
    belowRequest: string;
    recordPayout: string;
    awaitingPayout: string;
    decline: string;
    noPermission: string;
    actionFailed: string;

    approveTitle: string;
    approveBody: string;
    approveShortfall: string;
    declineTitle: string;
    declineBody: string;
    declineReasonLabel: string;
    declineReasonPlaceholder: string;
    payoutTitle: string;
    payoutBody: string;
    payoutConfirm: string;
    payoutReferenceLabel: string;
    payoutReferencePlaceholder: string;
    payoutReferenceHint: string;
  };
  import: {
    title: string;
    description: string;
    noPermission: string;
    howTitle: string;
    step1: string;
    step2: string;
    step3: string;
    step4: string;
    digitalOnly: string;
    digitalOnlyBody: string;
    reuploadSafe: string;
    creditsOnly: string;

    readFailed: string;
    uploadFailed: string;
    importFailed: string;
    completeTitle: string;
    importAnother: string;
    reading: string;
    dropPrompt: string;
    dropHint: string;

    wrongAccountTitle: string;
    wrongAccountBody: string;
    lowConfidenceTitle: string;
    lowConfidenceBody: string;
    fallbackParserTitle: string;
    fallbackParserBody: string;
    noLayoutTitle: string;
    noLayoutBody: string;
    noTextPagesTitle: string;
    noTextPagesBody: string;

    fileSummary: string;
    rowsRead: string;
    fileAccount: string;
    filePeriod: string;
    coverageLead: string;
    coverageTransactions: string;
    coverageRest: string;
    coverageUnreadable: string;

    figCredits: string;
    figWouldMatch: string;
    figWouldUnmatch: string;
    figAlreadyImported: string;

    rowsSelected: string;
    selectAllImportable: string;
    includeRow: string;
    colDescription: string;
    colWouldCredit: string;
    colParser: string;
    alreadyImported: string;
    debitNotContribution: string;
    noMemberMatched: string;
    confidenceHigh: string;
    confidenceMedium: string;
    confidenceLow: string;

    unparsedSummary: string;
    unparsedNote: string;

    importButton: string;
    confirmTitle: string;
    confirmBody: string;
    confirmLabel: string;
    confirmReasonLabel: string;
    confirmReasonPlaceholder: string;
    attestation: string;
  };
  applications: {
    title: string;
    description: string;
    noneTitle: string;
    noneBody: string;

    tabApplications: string;
    tabDisbursement: string;
    noneAwaitingReview: string;
    noneAwaitingDisbursement: string;
    actionFailed: string;
    disbursementFailed: string;

    overMonths: string;
    submittedOn: string;
    purpose: string;
    savingsBalance: string;
    savingsWas: string;
    eligibleUpTo: string;
    alreadyOwing: string;
    activeLoanCount: string;
    noActiveLoans: string;
    repaymentRecord: string;
    hasBeenOverdue: string;
    loansRepaid: string;
    noHistory: string;
    overCeiling: string;
    overdueWarning: string;
    guarantors: string;
    requestInfo: string;
    decline: string;
    disburse: string;
    noDisbursePermission: string;
    loanTerms: string;

    approveTitle: string;
    approveBody: string;
    approveConfirm: string;
    approvedAmount: string;
    approvedAmountHint: string;
    approvedAmountCeiling: string;
    declineTitle: string;
    declineBody: string;
    declineConfirm: string;
    declineReasonLabel: string;
    declineReasonPlaceholder: string;
    infoTitle: string;
    infoBody: string;
    infoConfirm: string;
    infoTooShort: string;
    infoLabel: string;
    infoPlaceholder: string;
    disburseTitle: string;
    disburseBody: string;
    disburseConfirm: string;
  };
  products: {
    title: string;
    description: string;
    noneTitle: string;
    noneBody: string;
    interest: string;
    amount: string;
    minAmount: string;
    inUse: string;
    applicationCount: string;
    eligibility: string;
    eligibilityValue: string;
    multiplier: string;
    multiplierValue: string;
    cappedAt: string;
    term: string;
    termValue: string;
    processingFee: string;
    insuranceFee: string;
    latePenalty: string;
    graceDays: string;
    guarantors: string;
    guarantorsRequired: string;
    notRequired: string;
    collateral: string;
    required: string;
    concurrent: string;
    singleLoan: string;
    multipleAllowed: string;
    advisoryNote: string;
  };
  reports: {
    title: string;
    description: string;
    savingsHeld: string;
    activeMembers: string;
    loansOutstanding: string;
    activeLoans: string;
    inArrears: string;
    overdueCount: string;
    members: string;
    joinedThisMonth: string;

    membersByStatus: string;
    loansByStatus: string;
    paymentsByChannel: string;
    ledgerByType: string;
    headMembers: string;
    headLoans: string;
    headPrincipal: string;
    headPayments: string;
    headValue: string;
    headEntries: string;
    headCategory: string;
    nothingRecorded: string;
    movementTitle: string;
    month: string;
    deposits: string;
    withdrawals: string;
    net: string;
    noMovement: string;
    largestSavers: string;
    noSavingsAccounts: string;
    arrearsTitle: string;
    daysLate: string;
    overdue: string;
    noArrears: string;
  };
  notifications: {
    title: string;
    description: string;
    sent: string;
    notYetRead: string;
    delivered: string;
    deliveredHint: string;
    handedOver: string;
    handedOverHint: string;
    failed: string;
    failedHint: string;
    noFailures: string;
    event: string;
    allEvents: string;
    noneTitle: string;
    noneBody: string;
    colRecipient: string;
    colMessage: string;
    colDelivery: string;
    colSent: string;
    colRead: string;
    inAppOnly: string;
    read: string;
    unread: string;
  };
  /// Facilities the association itself has taken from a bank, and the
  /// projects it spent the money on. Both screens write what members read on
  /// /dashboard/association, so the wording here is deliberately blunt about
  /// that: an administrator should know, while typing, who the audience is.
  borrowings: {
    title: string;
    description: string;
    noneTitle: string;
    noneBody: string;
    addFacility: string;
    recordRepayment: string;
    totalOwed: string;
    totalOwedHint: string;
    facilities: string;
    nextPayment: string;
    nothingDue: string;
    pledged: string;
    pledgedHint: string;
    lender: string;
    purpose: string;
    principal: string;
    rate: string;
    term: string;
    termMonths: string;
    repaid: string;
    outstanding: string;
    matures: string;
    security: string;
    visibleToMembers: string;
    hiddenFromMembers: string;
    hiddenWarning: string;
    repaymentHistory: string;
    noRepayments: string;
    principalPortion: string;
    interestPortion: string;
    feesPortion: string;
    fundedProjects: string;
    memberViewNote: string;

    formTitle: string;
    formIntro: string;
    lenderType: string;
    lenderReference: string;
    lenderContact: string;
    interestMethod: string;
    flat: string;
    reducing: string;
    totalInterest: string;
    totalInterestHint: string;
    totalFees: string;
    collateralAmount: string;
    disbursedAt: string;
    disbursedAtHint: string;
    firstPaymentDue: string;
    publish: string;
    publishHint: string;
    saved: string;
    repaymentTitle: string;
    repaymentIntro: string;
    amount: string;
    splitHint: string;
    paidAt: string;
    note: string;
    externalReference: string;
    repaymentSaved: string;
  };
  investments: {
    title: string;
    description: string;
    noneTitle: string;
    noneBody: string;
    addInvestment: string;
    totalInvested: string;
    totalReturned: string;
    projects: string;
    reach: string;
    reachHint: string;
    category: string;
    fundingSource: string;
    invested: string;
    returned: string;
    netReturn: string;
    benefit: string;
    noBenefitRecorded: string;
    benefitPrompt: string;
    membersBenefited: string;
    fundedBy: string;
    started: string;
    completed: string;
    visibleToMembers: string;
    hiddenFromMembers: string;
    memberViewNote: string;

    formTitle: string;
    formIntro: string;
    nameLabel: string;
    summaryLabel: string;
    detailLabel: string;
    benefitLabel: string;
    membersBenefitedLabel: string;
    amountInvested: string;
    amountReturned: string;
    amountReturnedHint: string;
    fundedByLabel: string;
    fundedByNone: string;
    startedAt: string;
    completedAt: string;
    statusLabel: string;
    publish: string;
    publishHint: string;
    saved: string;
    editTitle: string;
    editIntro: string;
  };
  settings: {
    title: string;
    descriptionPlain: string;
    description: string;
    noAssociationTitle: string;
    noAssociationBody: string;
    profile: string;
    legalName: string;
    code: string;
    registrationNo: string;
    taxId: string;
    currency: string;
    timezone: string;
    created: string;
    contact: string;
    website: string;
    administrators: string;
    loanProducts: string;
    collectionAccount: string;
    bank: string;
    accountName: string;
    accountNumber: string;
    branchCode: string;
    referenceSequence: string;
    referenceSequenceHint: string;
    rules: string;
    minimumDeposit: string;
    maximumDeposit: string;
    noLimit: string;
    minimumBalance: string;
    withdrawalsLabel: string;
    allowed: string;
    suspended: string;
    approvalRequired: string;
    withdrawalFee: string;
    noticePeriod: string;
    noticeDays: string;
    monthlyContribution: string;
    dueDay: string;
    notEnforced: string;
    annualInterest: string;
    noRule: string;
    storedConfiguration: string;
    noStoredSettings: string;
    readOnlyNote: string;
  };

  bk: {
    title: string;
    description: string;
    connectionTitle: string;
    mode: string;
    baseUrl: string;
    collectionAccount: string;
    credentials: string;
    configured: string;
    notConfigured: string;
    notSet: string;

    howTitle: string;
    howStep1: string;
    howStep2: string;
    howStep3: string;

    claimTitle: string;
    claimDescription: string;
    payerCode: string;
    payerCodeHint: string;
    narration: string;
    amount: string;
    forMember: string;
    noMember: string;
    claimButton: string;
    claiming: string;
    claimFailed: string;
    claimSucceeded: string;

    syncTitle: string;
    syncDescription: string;
    syncButton: string;
    syncing: string;
    syncFailed: string;
    syncSucceeded: string;

    claimsTitle: string;
    reference: string;
    status: string;
    raised: string;
    observed: string;
    notYetSeen: string;
    seenAfter: string;
    noClaims: string;
    noPermission: string;

    statFetched: string;
    statCreated: string;
    statMatched: string;
    statUnmatched: string;
  };
}

export const admin: Record<Locale, AdminCopy> = {
  en: {
    overview: {
      title: "{association} overview",
      platform: "Platform",
      description: "Today's position across savings, loans and payments.",
      unmatchedPayments:
        "{count} unmatched payment|{count} unmatched payments",
      unmatchedDetail: "{amount} received but not yet credited to a member",
      overdueLoans: "{count} overdue loan|{count} overdue loans",
      overdueDetail: "{amount} in arrears",
      membershipApplications:
        "{count} membership application|{count} membership applications",
      awaitingApproval: "Awaiting your approval",
      suspiciousTitle: "Payments flagged as suspicious",
      suspiciousBody:
        "{count} payment has been flagged and held.|{count} payments have been flagged and held.",
      reviewThem: "Review them",
      funds: "Association funds",
      totalSavings: "Total savings held",
      activeMembers: "{count} active member|{count} active members",
      collectedToday: "Collected today",
      transactionsToday: "{count} transaction|{count} transactions",
      collectedThisMonth: "Collected this month",
      withdrawalsHint: "Withdrawals {amount}",
      outstandingLoans: "Outstanding loans",
      activeLoans: "{count} active loan|{count} active loans",
      needsAttention: "Needs attention",
      pendingApplications: "Pending applications",
      pendingApplicationsHint: "Loan applications awaiting review",
      pendingWithdrawals: "Pending withdrawals",
      unmatchedCount: "Unmatched payments",
      overdueCount: "Overdue loans",
      membership: "Membership",
      totalMembers: "Total members",
      joinedThisMonth: "{count} joined this month",
      active: "Active",
      pendingApproval: "Pending approval",
      suspended: "Suspended",
      monthlyDeposits: "Monthly deposits",
      monthlyDepositsHint: "Contributions received per month",
      monthlyWithdrawals: "Monthly withdrawals",
      monthlyWithdrawalsHint: "Paid out per month",
      seriesDeposits: "Deposits",
      seriesWithdrawals: "Withdrawals",
      noData: "No data for this period yet.",
      latestTransactions: "Latest transactions",
      colChannel: "Channel",
      noTransactions: "No transactions recorded yet.",
    },
    members: {
      title: "Members",
      inRegister:
        "{count} member in the register.|{count} members in the register.",
      enrol: "Enrol member",
      noneTitle: "No members found",
      noneBody: "No members match these filters. Try clearing the search.",
      colMember: "Member",
      colContact: "Contact",
      colSavings: "Savings",
      colLoanOwing: "Loan owing",
      colKyc: "KYC",
      colJoined: "Joined",
      overdue: "overdue",

      pendingTitle: "Pending approvals",
      pendingDescription: "Membership applications awaiting a decision.",
      pendingNoneTitle: "Nothing waiting",
      pendingNoneBody:
        "Every membership application has been reviewed. New applications will appear here.",
      pendingNotice:
        "Approving activates the member's login and opens their savings account. They will be sent their payment reference, which is what their contributions are matched on.",

      newTitle: "Enrol a member",
      newDescription:
        "Add someone to {association}'s register directly, without waiting for them to sign up.",
      newDescriptionPlain: "Add someone to the association's register.",
      backToRegister: "Back to register",
      noAssociationTitle: "No association selected",
      noAssociationBody:
        "Members belong to one association. Open an association from the platform directory before enrolling anyone.",

      editTitle: "Edit {name}",
      editDescription:
        "Member {number}. Their member number and payment reference cannot be changed — those are printed on every payment instruction they hold.",
      backToFile: "Back to member file",
    },
    file: {
      description: "Member {number} · payment reference {reference}",
      editDetails: "Edit details",
      suspendedReason: "Suspended: {reason}",
      savingsBalance: "Savings balance",
      accountNumber: "Account {number}",
      noAccount: "No account opened",
      available: "Available",
      locked: "{amount} locked",
      nothingToWithdraw: "Nothing to withdraw",
      loansOwing: "Loans owing",
      loansOnFile: "{count} loan on file|{count} loans on file",
      overdueLoans: "Overdue loans",
      inArrears: "In arrears",
      upToDate: "Up to date",
      memberFile: "Member file",
      memberNumber: "Member number",
      paymentReference: "Payment reference",
      business: "Business",
      joined: "Joined",
      approvedOn: "Approved",
      contactAccess: "Contact and access",
      emailVerified: "Email verified",
      phoneVerified: "Phone verified",
      mobileMoney: "Mobile money",
      bankAccount: "Bank account",
      lastSignIn: "Last sign-in",
      nextOfKin: "Next of kin",
      theirPhone: "Their phone",
      loans: "Loans",
      colPrincipal: "Principal",
      colPayable: "Payable",
      colRepaid: "Repaid",
      colOutstanding: "Outstanding",
      colDisbursed: "Disbursed",
      daysLate: "{count} day late|{count} days late",
      neverBorrowed: "This member has never taken a loan.",
      recentTransactions: "Recent transactions",
      balanceAfter: "Balance after",
      noTransactions: "No transactions have been posted to this account.",
      notes: "Administrator notes",
      noNotes: "No notes have been recorded on this member.",
      internal: "internal",
    },
    savings: {
      title: "Savings accounts",
      description: "Every member savings account and the balance it holds.",
      totalHeld: "Total held",
      accountCount: "{count} account|{count} accounts",
      locked: "Locked",
      lockedHint: "Pledged against loans and pending withdrawals",
      available: "Available",
      availableHint: "Balance members could withdraw today",
      searchPlaceholder:
        "Member name, number, payment reference or account number…",
      noneTitle: "No savings accounts found",
      noneSearchBody: "No accounts match this search. Try clearing it.",
      noneBody:
        "No savings accounts have been opened yet. One is created when a member is approved.",
      colMember: "Member",
      colAccount: "Account",
      colLocked: "Locked",
      colAvailable: "Available",
      colDeposits: "Deposits",
      colWithdrawn: "Withdrawn",
      colLastActivity: "Last activity",
      transactionCount: "{count} transaction|{count} transactions",
    },
    transactions: {
      title: "Transactions",
      description: "Every movement across every member's savings account.",
    },
    payments: {
      title: "Payments",
      description: "Every payment the association has received from the provider.",
      unmatchedTitle: "Unmatched payments",
      unmatchedDescription:
        "Money received that could not be attributed to a member automatically.",
      unmatchedNoneTitle: "Nothing waiting",
      unmatchedNoneBody:
        "Every payment received has been matched to a member and credited. New unmatched payments will appear here.",
      unmatchedCount:
        "{count} payment awaiting attention.|{count} payments awaiting attention.",
      unmatchedNotice:
        "Each one is money in the association's account that a member has not been credited for. Match it only when you are confident whose it is — the decision is recorded against your name.",

      selectedCount: "{count} payment selected|{count} payments selected",
      selectedNote:
        "on this page. Deleting removes them from the queue and keeps them only in the audit log.",
      clearSelection: "Clear selection",
      deleteSelected: "Delete selected",
      emptyQueueLead: "Clearing out a bad import? You can empty the whole queue —",
      emptyQueueCount:
        "all {count} unmatched payment|all {count} unmatched payments",
      emptyQueueTail: ", including those on other pages.",
      deleteAll: "Delete all {count}",

      selectAllOnPage: "Select every payment on this page",
      selectPayment: "Select payment {reference}",
      colReceived: "Received",
      colNarration: "Narration / payer",
      colWhyUnmatched: "Why unmatched",
      colAction: "Action",
      noNarration: "No narration supplied",
      flaggedSuspicious: "Flagged as suspicious",
      noEvidence: "No matching evidence found",
      possibleMembers: "Possible members:",
      notVerified: "Not verified with the bank",
      match: "Match",
      noPermission: "No permission",
      cannotCredit: "Cannot credit",

      selectMemberFirst: "Select the member this payment belongs to",
      creditFailed: "Could not credit this payment",
      deleteFailed: "Could not delete this payment",
      nonePicked: "Nothing selected",
      bulkDeleteFailed: "Could not delete these payments",
      paymentDeleted: "Payment deleted.",
      paymentsDeleted: "Payments deleted.",

      matchTitle: "Credit this payment to a member",
      matchBody:
        "{amount} received on {date}. This posts the money to the member's savings account immediately.",
      matchConfirm: "Credit member",
      matchReasonLabel: "Why does this payment belong to this member?",
      matchReasonPlaceholder:
        "e.g. Member confirmed by phone that they paid from their sister's mobile money account",
      matchMemberLabel: "Member",
      matchMemberPlaceholder: "Select the member…",
      narrationOnPayment: "Narration on the payment:",

      deleteTitle: "Delete this payment",
      deleteBody:
        "{amount} received on {date}. The record is removed from the queue and kept only in the audit log.",
      deleteConfirm: "Delete payment",
      deleteReasonLabel: "Why can this payment never belong to a member?",
      deleteReasonPlaceholder:
        "e.g. This is the association's own transfer between its bank accounts, not a member contribution",
      deleteNoteOnlyUnattributable:
        "Delete only a payment that will never be attributable — the association's own transfers, bank charges, or a line the PDF parser read incorrectly.",
      deleteNoteReappears:
        "If the same payment arrives again from the bank or in another statement upload, it will reappear here.",
      narration: "Narration:",

      bulkAllTitle: "Delete all {count} unmatched payments",
      bulkSelectedTitle:
        "Delete {count} selected payment|Delete {count} selected payments",
      bulkAllBody:
        "Every unmatched payment in this association will be removed from the queue — including those on pages you have not opened.",
      bulkSelectedBody:
        "The {count} payment you ticked will be removed from the queue.|The {count} payments you ticked will be removed from the queue.",
      bulkReasonLabel: "Why can none of these payments belong to a member?",
      bulkReasonPlaceholder:
        "e.g. Statement upload was the wrong account and every row was parsed from the association's own transfers",
      bulkNoteAudited:
        "Each deletion is recorded separately in the audit log against your name, with the full payment record attached.",
      bulkNoteSkipsCredited:
        "Any payment that has already been credited to a member is skipped automatically — those must be reversed, not deleted — and you will be told how many were skipped.",
      bulkNoteClearsQueue:
        "This clears the entire queue. If any of these payments really do belong to a member, that member will not be credited.",
    },
    loans: {
      title: "Loan portfolio",
      description: "Every loan the association has on its books.",
    },
    audit: {
      title: "Audit log",
      description:
        "Every consequential action taken in this association, with who did it and why.",
    },
    withdrawals: {
      title: "Withdrawals",
      description: "Requests awaiting review, and approved payouts to record.",
      noneTitle: "No open withdrawal requests",
      noneBody: "Requests awaiting approval or payout will appear here.",

      colRequested: "Requested",
      colPayoutTo: "Payout to",
      colAction: "Action",
      net: "net {amount}",
      belowRequest: "below request",
      recordPayout: "Record payout",
      awaitingPayout: "Awaiting payout",
      decline: "Decline",
      noPermission: "No permission",
      actionFailed: "The action could not be completed",

      approveTitle: "Approve this withdrawal?",
      approveBody:
        "{name} will be approved to withdraw {amount}. Their balance is not debited until you record the payout.",
      approveShortfall:
        "This member's balance is now {balance}, which is less than the {amount} requested. The payout will be refused unless they deposit more first.",
      declineTitle: "Decline this withdrawal?",
      declineBody:
        "{name} will be told their request for {amount} was declined, and the hold on their balance will be released.",
      declineReasonLabel: "Why is this being declined?",
      declineReasonPlaceholder:
        "e.g. Outstanding loan repayment must be settled first",
      payoutTitle: "Record this payout?",
      payoutBody:
        "Confirm that {amount} has actually been sent to {name}. This debits their savings account immediately and cannot be undone except by a reversal.",
      payoutConfirm: "Confirm payout",
      payoutReferenceLabel: "Bank or mobile money reference (optional)",
      payoutReferencePlaceholder: "e.g. the transfer confirmation code",
      payoutReferenceHint:
        "Recording it makes the payout traceable back to the bank record.",
    },
    import: {
      title: "Import bank statement",
      description: "Upload a PDF statement to credit members who have paid.",
      noPermission:
        "You can upload and preview a statement, but you do not have permission to commit an import. Ask a super administrator for the “Match payments manually” permission.",
      howTitle: "How this works",
      step1: "Upload the PDF statement from your association's bank account.",
      step2:
        "Review every row. The system shows which member each payment would be credited to, and why.",
      step3:
        "Tick the rows you have checked and confirm. Only ticked rows are imported.",
      step4:
        "Members are credited and receive an SMS confirming their new balance.",
      digitalOnly: "The PDF must be a digital statement",
      digitalOnlyBody:
        ", not a scan or a photograph. A scanned image contains no text to read. If your bank only provides scans, ask for the PDF or CSV export from internet banking.",
      reuploadSafe:
        "Re-uploading the same statement is safe. Rows already imported are detected and skipped, so nobody is credited twice.",
      creditsOnly:
        "Only credits can be member contributions. Debits are shown for context but never imported.",

      readFailed: "Could not read this statement",
      uploadFailed: "Could not upload the file. Check your connection and try again.",
      importFailed: "The import failed",
      completeTitle: "Import complete",
      importAnother: "Import another statement",
      reading: "Reading the statement…",
      dropPrompt: "Upload a bank statement PDF",
      dropHint:
        "Drag the file here, or click to choose it. Nothing is written until you review and confirm.",

      wrongAccountTitle: "This may be the wrong account",
      wrongAccountBody:
        "The statement appears to be for account {detected}, but this association's collection account is {expected}. Check you have uploaded the right file before importing.",
      lowConfidenceTitle: "Some rows could not be read confidently",
      lowConfidenceBody:
        "{count} row is marked low confidence and is not ticked. Check it against the PDF before including it.|{count} rows are marked low confidence and are not ticked. Check them against the PDF before including them.",
      fallbackParserTitle: "Read with the fallback parser",
      fallbackParserBody:
        "The high-accuracy extractor was unavailable, so this statement was read with the JavaScript parser. On statements whose columns sit tightly together it can merge two columns into one wrong amount. Check each amount against the PDF, and install the Python extractor (pip install -r scripts/requirements.txt) to avoid this.",
      noLayoutTitle: "This PDF had no usable column layout",
      noLayoutBody:
        "The text was read with no table structure at all, so amounts and dates are very likely to have been misread. Check every single row against the document before importing anything.",
      noTextPagesTitle: "Some pages contained no text",
      noTextPagesBody:
        "Page {pages} yielded nothing — it is probably a scanned image. Any transactions printed on it are missing from the table below.|Pages {pages} yielded nothing — they are probably scanned images. Any transactions printed on them are missing from the table below.",

      fileSummary: "{pages} page|{pages} pages",
      rowsRead: "{count} row read|{count} rows read",
      fileAccount: " · account {account}",
      filePeriod: " · {from} to {to}",
      coverageLead: "Read {count} lines from the PDF:",
      coverageTransactions: "{count} transactions",
      coverageRest: ", {structural} header/footer, {other} other",
      coverageUnreadable: "{count} unreadable",

      figCredits: "Credits found",
      figWouldMatch: "Would match a member",
      figWouldUnmatch: "Would go to unmatched",
      figAlreadyImported: "Already imported",

      rowsSelected: "{count} row selected|{count} rows selected",
      selectAllImportable: "Select all importable",
      includeRow: "Include {description}",
      colDescription: "Description read from the PDF",
      colWouldCredit: "Would credit",
      colParser: "Parser",
      alreadyImported: "Already imported",
      debitNotContribution: "Debit — not a contribution",
      noMemberMatched: "No member matched — will wait in the unmatched queue",
      confidenceHigh: "high",
      confidenceMedium: "medium",
      confidenceLow: "low",

      unparsedSummary:
        "{count} line could not be interpreted|{count} lines could not be interpreted",
      unparsedNote:
        "These lines looked like they might be transactions but could not be read. Check the PDF — if any are real payments, credit them manually from the unmatched queue.",

      importButton: "Import {count} payment|Import {count} payments",
      confirmTitle: "Import {count} payment?|Import {count} payments?",
      confirmBody:
        "{amount} will be credited to members' savings accounts, and each member will receive an SMS confirming their new balance. This posts to the ledger and can only be undone by a reversal.",
      confirmLabel: "Import and credit members",
      confirmReasonLabel:
        "Confirm this is your association's genuine bank statement",
      confirmReasonPlaceholder:
        "e.g. Equity Bank statement for August 2026, downloaded from internet banking on 14 Aug",
      attestation:
        "You are attesting that this PDF is a genuine statement for this association's account and that you have checked the rows you selected. Your name is recorded against every payment this creates.",
    },
    applications: {
      title: "Loan applications",
      description: "Review applications and disburse approved loans.",
      noneTitle: "No applications waiting",
      noneBody:
        "New loan applications and approved loans awaiting disbursement will appear here.",

      tabApplications: "Applications",
      tabDisbursement: "Awaiting disbursement",
      noneAwaitingReview: "No applications awaiting review.",
      noneAwaitingDisbursement: "No approved loans awaiting disbursement.",
      actionFailed: "The action could not be completed",
      disbursementFailed: "Disbursement failed",

      overMonths: "over {months} months · {product}",
      submittedOn: " · submitted {date}",
      purpose: "Purpose:",
      savingsBalance: "Savings balance",
      savingsWas: "was {amount} at application",
      eligibleUpTo: "Eligible up to",
      alreadyOwing: "Already owing",
      activeLoanCount: "{count} active loan|{count} active loans",
      noActiveLoans: "No active loans",
      repaymentRecord: "Repayment record",
      hasBeenOverdue: "Has been overdue",
      loansRepaid: "{count} repaid",
      noHistory: "No history",
      overCeiling:
        "The request of {amount} exceeds the member's current ceiling of {ceiling}. Approve a lower amount, or decline.",
      overdueWarning: "This member has been overdue on a previous loan.",
      guarantors: "Guarantors",
      requestInfo: "Request info",
      decline: "Decline",
      disburse: "Disburse",
      noDisbursePermission: "No permission to disburse",
      loanTerms: "{product} · {rate}% · {months} months",

      approveTitle: "Approve this loan?",
      approveBody:
        "A loan will be created for {name} awaiting disbursement. No money moves until you disburse it.",
      approveConfirm: "Approve loan",
      approvedAmount: "Approved amount",
      approvedAmountHint: "You may approve less than requested, but never more.",
      approvedAmountCeiling: " This member's ceiling is {amount}.",
      declineTitle: "Decline this application?",
      declineBody:
        "{name} will be told their application was not approved, and given the reason.",
      declineConfirm: "Decline application",
      declineReasonLabel: "Why is this being declined?",
      declineReasonPlaceholder:
        "e.g. Requested amount exceeds three times the member's savings",
      infoTitle: "Request more information",
      infoBody:
        "The member will be notified and the application held until they respond.",
      infoConfirm: "Send request",
      infoTooShort: "Say what information is needed, in at least 10 characters",
      infoLabel: "What do you need from the member?",
      infoPlaceholder:
        "e.g. Please provide a quotation for the machines you intend to buy",
      disburseTitle: "Disburse this loan?",
      disburseBody:
        "{amount} will be credited to {name}'s savings account, less any fees, and the full repayment schedule will be generated. This cannot be undone except by a reversal.",
      disburseConfirm: "Disburse now",
    },
    products: {
      title: "Loan products",
      description: "The rules every loan application is assessed against.",
      noneTitle: "No loan products configured",
      noneBody:
        "Members cannot apply for a loan until at least one product exists. Products are created by seeding or by a platform administrator.",
      interest: "Interest",
      amount: "Amount",
      minAmount: "min {amount}",
      inUse: "In use",
      applicationCount: "{count} application|{count} applications",
      eligibility: "Eligibility",
      eligibilityValue:
        "{amount} saved · {months} month membership|{amount} saved · {months} months membership",
      multiplier: "Savings multiplier",
      multiplierValue: "{factor}× savings",
      cappedAt: ", capped at {amount}",
      term: "Term",
      termValue: "{min}–{max} months, {frequency}",
      processingFee: "Processing fee",
      insuranceFee: "Insurance fee",
      latePenalty: "Late penalty",
      graceDays: " after {count} grace day| after {count} grace days",
      guarantors: "Guarantors",
      guarantorsRequired: "{count} required",
      notRequired: "Not required",
      collateral: "Collateral",
      required: "Required",
      concurrent: "Concurrent loans",
      singleLoan: "One active loan per member",
      multipleAllowed: "Multiple allowed",
      advisoryNote:
        "These rules are advisory in the application form and authoritative on submission — eligibility is re-checked server-side when a member applies, so changing a product here changes what is actually enforced.",
    },
    reports: {
      title: "Reports",
      description: "Where the association's money is, and how it moved.",
      savingsHeld: "Savings held",
      activeMembers: "{count} active member|{count} active members",
      loansOutstanding: "Loans outstanding",
      activeLoans: "{count} active loan|{count} active loans",
      inArrears: "In arrears",
      overdueCount: "{count} overdue",
      members: "Members",
      joinedThisMonth: "{count} joined this month",

      membersByStatus: "Members by status",
      loansByStatus: "Loans by status",
      paymentsByChannel: "Payments by channel",
      ledgerByType: "Ledger movement by type",
      headMembers: "Members",
      headLoans: "Loans",
      headPrincipal: "Principal",
      headPayments: "Payments",
      headValue: "Value",
      headEntries: "Entries",
      headCategory: "Category",
      nothingRecorded: "Nothing recorded yet.",
      movementTitle: "Deposits and withdrawals, last 12 months",
      month: "Month",
      deposits: "Deposits",
      withdrawals: "Withdrawals",
      net: "Net",
      noMovement: "No ledger movement recorded in the last twelve months.",
      largestSavers: "Largest savers",
      noSavingsAccounts: "No savings accounts yet.",
      arrearsTitle: "Arrears",
      daysLate: "Days late",
      overdue: "Overdue",
      noArrears: "No loan is currently in arrears.",
    },
    notifications: {
      title: "Notifications",
      description:
        "Everything the system has sent to members, and whether it arrived.",
      sent: "Notifications sent",
      notYetRead: "{count} not yet read",
      delivered: "Delivered",
      deliveredHint: "Confirmed by the provider",
      handedOver: "Sent",
      handedOverHint: "Handed to the provider",
      failed: "Failed deliveries",
      failedHint: "Members were not reached",
      noFailures: "No delivery failures",
      event: "Event",
      allEvents: "All events",
      noneTitle: "Nothing has been sent yet",
      noneBody:
        "Notifications are raised automatically when payments are credited, loans are decided and withdrawals are processed.",
      colRecipient: "Recipient",
      colMessage: "Message",
      colDelivery: "Delivery",
      colSent: "Sent",
      colRead: "Read",
      inAppOnly: "In-app only",
      read: "Read",
      unread: "Unread",
    },
    borrowings: {
      title: "Bank borrowing",
      description:
        "Money the association has borrowed. Every facility marked visible appears on the members' page.",
      noneTitle: "No borrowing recorded",
      noneBody:
        "The association has taken no loan from a bank or other lender. Record one here when it does, and members will see it alongside what it paid for.",
      addFacility: "Record a facility",
      recordRepayment: "Record a repayment",
      totalOwed: "Still owed",
      totalOwedHint: "Across {count} live facility|Across {count} live facilities",
      facilities: "Facilities",
      nextPayment: "Next payment due",
      nothingDue: "Nothing scheduled",
      pledged: "Pledged against savings",
      pledgedHint: "Borrowing as a share of members' total savings",
      lender: "Lender",
      purpose: "Purpose",
      principal: "Principal",
      rate: "Rate",
      term: "Term",
      termMonths: "{count} month|{count} months",
      repaid: "Repaid",
      outstanding: "Outstanding",
      matures: "Matures",
      security: "Security",
      visibleToMembers: "Visible to members",
      hiddenFromMembers: "Hidden from members",
      hiddenWarning:
        "Members cannot see this facility. If their savings secure it, they are entitled to know — hiding it is recorded in the audit log.",
      repaymentHistory: "Repayment history",
      noRepayments: "No repayment has been recorded against this facility yet.",
      principalPortion: "Principal",
      interestPortion: "Interest",
      feesPortion: "Fees",
      fundedProjects: "Projects funded by this facility",
      memberViewNote:
        "What you enter here is what members read. Write the purpose in words a member would use, not in banking terms.",

      formTitle: "Record a bank facility",
      formIntro:
        "Enter it as the offer letter states it. Members will see the lender, the purpose, the amount and what is still owed.",
      lenderType: "Kind of lender",
      lenderReference: "Lender's reference",
      lenderContact: "Contact at the lender",
      interestMethod: "Interest method",
      flat: "Flat",
      reducing: "Reducing balance",
      totalInterest: "Total interest",
      totalInterestHint:
        "From the offer letter. Leave blank to estimate it from the rate and term.",
      totalFees: "Arrangement fees",
      collateralAmount: "Value of security",
      disbursedAt: "Date received",
      disbursedAtHint:
        "Leave blank until the money arrives — nothing is owed before then.",
      firstPaymentDue: "First payment due",
      publish: "Show this to members",
      publishHint:
        "Members whose savings secure this facility are entitled to see it. Withholding it is recorded in the audit log.",
      saved: "Facility recorded.",
      repaymentTitle: "Record a repayment",
      repaymentIntro: "Enter it as the lender's advice note states it.",
      amount: "Amount paid",
      splitHint:
        "Leave the split blank and interest is cleared first, then principal.",
      paidAt: "Date paid",
      note: "Note",
      externalReference: "Bank reference",
      repaymentSaved: "Repayment recorded.",
    },
    investments: {
      title: "What our money did",
      description:
        "What the association put money into, and what members got out of it.",
      noneTitle: "Nothing recorded",
      noneBody:
        "Equipment, workshop space, training, bulk fabric — anything the association spent members' money on belongs here, with what it cost and who it helped.",
      addInvestment: "Record an investment",
      totalInvested: "Put in",
      totalReturned: "Brought back",
      projects: "Projects",
      reach: "Members reached",
      reachHint: "The largest number any single project helped",
      category: "Category",
      fundingSource: "Paid for with",
      invested: "Invested",
      returned: "Returned so far",
      netReturn: "Net",
      benefit: "Benefit to members",
      noBenefitRecorded: "No benefit recorded",
      benefitPrompt:
        "Members see this sentence. Say what changed for them, not what was bought.",
      membersBenefited: "{count} member|{count} members",
      fundedBy: "Funded by {reference}",
      started: "Started",
      completed: "Completed",
      visibleToMembers: "Visible to members",
      hiddenFromMembers: "Hidden from members",
      memberViewNote:
        "Only realised returns belong in the returns figure. A projection entered there becomes part of the surplus every member is shown, and part of the share they believe is theirs.",

      formTitle: "Record an investment",
      formIntro:
        "What the association bought or paid for with members' money, and what members get from it.",
      nameLabel: "What is it",
      summaryLabel: "Describe it",
      detailLabel: "Fuller detail",
      benefitLabel: "What members get from it",
      membersBenefitedLabel: "Members it helps",
      amountInvested: "Amount put in",
      amountReturned: "Brought back so far",
      amountReturnedHint:
        "Money actually received — rent, sales, savings from buying in bulk. Not what it is expected to bring.",
      fundedByLabel: "Paid for with a bank facility",
      fundedByNone: "Not from a bank facility",
      startedAt: "Started",
      completedAt: "Completed",
      statusLabel: "Stage",
      publish: "Show this to members",
      publishHint:
        "This is the page members open to see what their savings did. Hidden entries count for nothing there.",
      saved: "Investment recorded.",
      editTitle: "Update this investment",
      editIntro:
        "Raise the returns figure as it pays for itself, and fill in the benefit once there is something real to say.",
    },
    settings: {
      title: "Association settings",
      descriptionPlain: "Configuration for a single association.",
      description: "Configuration for {association}.",
      noAssociationTitle: "No association selected",
      noAssociationBody:
        "These settings belong to one association. Open an association from the platform directory, or use platform settings for global configuration.",
      profile: "Profile",
      legalName: "Legal name",
      code: "Code",
      registrationNo: "Registration no.",
      taxId: "Tax id",
      currency: "Currency",
      timezone: "Timezone",
      created: "Created",
      contact: "Contact",
      website: "Website",
      administrators: "Administrators",
      loanProducts: "Loan products",
      collectionAccount: "Collection account",
      bank: "Bank",
      accountName: "Account name",
      accountNumber: "Account number",
      branchCode: "Branch code",
      referenceSequence: "Reference sequence",
      referenceSequenceHint:
        "Next member payment reference is minted from this counter",
      rules: "Savings and withdrawal rules",
      minimumDeposit: "Minimum deposit",
      maximumDeposit: "Maximum deposit",
      noLimit: "No limit",
      minimumBalance: "Minimum balance",
      withdrawalsLabel: "Withdrawals",
      allowed: "Allowed",
      suspended: "Suspended",
      approvalRequired: "Approval required",
      withdrawalFee: "Withdrawal fee",
      noticePeriod: "Notice period",
      noticeDays: "{count} day|{count} days",
      monthlyContribution: "Monthly contribution",
      dueDay: ", due day {day}",
      notEnforced: "Not enforced",
      annualInterest: "Annual interest",
      noRule:
        "No savings rule is configured, so platform defaults apply: deposits are unrestricted and withdrawals require approval.",
      storedConfiguration: "Stored configuration",
      noStoredSettings:
        "This association has no stored settings; platform defaults apply to everything.",
      readOnlyNote:
        "This screen is read-only. Changing a financial rule alters how every future deposit, withdrawal and loan is calculated, so edits are made through a migration or by a platform administrator, and every change is recorded in the audit log.",
    },

    bk: {
      title: "Bank of Kigali events",
      description:
        "Raise a payment claim with BK, then run the sync and watch whether the transaction comes back.",
      connectionTitle: "Connection",
      mode: "Mode",
      baseUrl: "API address",
      collectionAccount: "Collection account",
      credentials: "Credentials",
      configured: "Configured",
      notConfigured: "Not configured",
      notSet: "Not set",

      howTitle: "How this test works",
      howStep1:
        "Claim a payment. RTA generates a client reference and registers the claim with BK, which answers CLAIMED.",
      howStep2:
        "Run the transaction sync. It reads BK's transaction list and stores whatever it finds.",
      howStep3:
        "If a transaction carrying the same client reference comes back, the claim is marked Seen. Until then it stays Waiting.",

      claimTitle: "Claim a payment",
      claimDescription:
        "The payer generates a six-digit code in Internet Banking or the BK app and reads it to you.",
      payerCode: "Payer code",
      payerCodeHint: "Six digits",
      narration: "Narration",
      amount: "Amount",
      forMember: "For member",
      noMember: "Not linked to a member",
      claimButton: "Claim payment",
      claiming: "Claiming…",
      claimFailed: "The claim failed",
      claimSucceeded: "Payment claimed",

      syncTitle: "Transaction sync",
      syncDescription:
        "Reads BK's transaction list for the configured lookback window and ingests anything new.",
      syncButton: "Run sync now",
      syncing: "Syncing…",
      syncFailed: "The sync failed",
      syncSucceeded: "Sync finished",

      claimsTitle: "Claims raised",
      reference: "Reference",
      status: "Status",
      raised: "Raised",
      observed: "Seen by sync",
      notYetSeen: "Waiting",
      seenAfter: "Seen after {duration}",
      noClaims: "No payment claims have been raised yet.",
      noPermission:
        "You can view BK events but not raise claims or run a sync. Ask a platform administrator for the BK permissions.",

      statFetched: "Fetched",
      statCreated: "New",
      statMatched: "Matched",
      statUnmatched: "Unmatched",
    },
  },

  rw: {
    overview: {
      title: "Incamake ya {association}",
      platform: "Urubuga",
      description: "Uko bihagaze uyu munsi ku buzigame, inguzanyo n'ubwishyu.",
      unmatchedPayments:
        "Ubwishyu {count} butarahuzwa|Ubwishyu {count} butarahuzwa",
      unmatchedDetail:
        "{amount} yakiriwe ariko ntiyandikwa kuri konti y'umunyamuryango",
      overdueLoans:
        "Inguzanyo {count} yarengeje igihe|Inguzanyo {count} zarengeje igihe",
      overdueDetail: "{amount} y'umwenda urengeje igihe",
      membershipApplications:
        "Ubusabe {count} bw'ubunyamuryango|Ubusabe {count} bw'ubunyamuryango",
      awaitingApproval: "Butegereje ko wemeza",
      suspiciousTitle: "Ubwishyu bushidikanywaho",
      suspiciousBody:
        "Ubwishyu {count} bwashyizwe ku ruhande kandi bwahagaritswe.|Ubwishyu {count} bwashyizwe ku ruhande kandi bwahagaritswe.",
      reviewThem: "Busuzume",
      funds: "Amafaranga y'ihuriro",
      totalSavings: "Ubuzigame bwose bufitwe",
      activeMembers:
        "Umunyamuryango {count} ukora|Abanyamuryango {count} bakora",
      collectedToday: "Yakiriwe uyu munsi",
      transactionsToday: "Igikorwa {count}|Ibikorwa {count}",
      collectedThisMonth: "Yakiriwe uku kwezi",
      withdrawalsHint: "Ubwikuze {amount}",
      outstandingLoans: "Inguzanyo zisigaye",
      activeLoans: "Inguzanyo {count} iriho|Inguzanyo {count} ziriho",
      needsAttention: "Bisaba kwitabwaho",
      pendingApplications: "Ubusabe butegereje",
      pendingApplicationsHint: "Ubusabe bw'inguzanyo butegereje isuzuma",
      pendingWithdrawals: "Ubwikuze butegereje",
      unmatchedCount: "Ubwishyu butarahuzwa",
      overdueCount: "Inguzanyo zarengeje igihe",
      membership: "Ubunyamuryango",
      totalMembers: "Abanyamuryango bose",
      joinedThisMonth: "{count} binjiye uku kwezi",
      active: "Barakora",
      pendingApproval: "Bategereje kwemezwa",
      suspended: "Bahagaritswe",
      monthlyDeposits: "Ubwitso bwa buri kwezi",
      monthlyDepositsHint: "Imisanzu yakiriwe buri kwezi",
      monthlyWithdrawals: "Ubwikuze bwa buri kwezi",
      monthlyWithdrawalsHint: "Yishyuwe buri kwezi",
      seriesDeposits: "Ubwitso",
      seriesWithdrawals: "Ubwikuze",
      noData: "Nta makuru ahari kuri iki gihe.",
      latestTransactions: "Ibikorwa biheruka",
      colChannel: "Uburyo",
      noTransactions: "Nta gikorwa kirandikwa.",
    },
    members: {
      title: "Abanyamuryango",
      inRegister:
        "Umunyamuryango {count} uri mu gitabo.|Abanyamuryango {count} bari mu gitabo.",
      enrol: "Injiza umunyamuryango",
      noneTitle: "Nta munyamuryango wabonetse",
      noneBody:
        "Nta munyamuryango uhuye n'ibyo washungurishije. Gerageza usibe ibyo washakishije.",
      colMember: "Umunyamuryango",
      colContact: "Aho bamugeraho",
      colSavings: "Ubuzigame",
      colLoanOwing: "Umwenda w'inguzanyo",
      colKyc: "Umwirondoro",
      colJoined: "Yinjiye",
      overdue: "byarengeje igihe",

      pendingTitle: "Bategereje kwemezwa",
      pendingDescription: "Ubusabe bw'ubunyamuryango butegereje icyemezo.",
      pendingNoneTitle: "Nta kintu gitegereje",
      pendingNoneBody:
        "Ubusabe bwose bw'ubunyamuryango bwasuzumwe. Ubusabe bushya buzagaragara hano.",
      pendingNotice:
        "Kwemeza bituma ubwinjiro bw'umunyamuryango butangira gukora kandi konti ye y'ubuzigame ifungurwa. Azoherezwa nimero ye y'ubwishyu, ari yo imisanzu ye ihuzwa na yo.",

      newTitle: "Injiza umunyamuryango",
      newDescription:
        "Ongeraho umuntu mu gitabo cya {association} ako kanya, utegereje ko yiyandikisha.",
      newDescriptionPlain: "Ongeraho umuntu mu gitabo cy'ihuriro.",
      backToRegister: "Subira ku gitabo",
      noAssociationTitle: "Nta huriro ryatoranyijwe",
      noAssociationBody:
        "Abanyamuryango bari mu ihuriro rimwe. Fungura ihuriro mu rutonde rw'urubuga mbere yo kwinjiza umuntu.",

      editTitle: "Hindura {name}",
      editDescription:
        "Umunyamuryango {number}. Nimero ye y'umunyamuryango na nimero y'ubwishyu ntizihinduka — zanditse ku mabwiriza yose y'ubwishyu afite.",
      backToFile: "Subira ku dosiye y'umunyamuryango",
    },
    file: {
      description: "Umunyamuryango {number} · nimero y'ubwishyu {reference}",
      editDetails: "Hindura amakuru",
      suspendedReason: "Yahagaritswe: {reason}",
      savingsBalance: "Amafaranga y'ubuzigame",
      accountNumber: "Konti {number}",
      noAccount: "Nta konti yafunguwe",
      available: "Ashobora gukoreshwa",
      locked: "{amount} yafatiriwe",
      nothingToWithdraw: "Nta yo kubikuza",
      loansOwing: "Umwenda w'inguzanyo",
      loansOnFile:
        "Inguzanyo {count} iri mu dosiye|Inguzanyo {count} ziri mu dosiye",
      overdueLoans: "Inguzanyo zarengeje igihe",
      inArrears: "Arafite umwenda urengeje igihe",
      upToDate: "Ari ku gihe",
      memberFile: "Dosiye y'umunyamuryango",
      memberNumber: "Nimero y'umunyamuryango",
      paymentReference: "Nimero y'ubwishyu",
      business: "Ubucuruzi",
      joined: "Yinjiye",
      approvedOn: "Yemejwe",
      contactAccess: "Aho bamugeraho n'uburenganzira",
      emailVerified: "Imeyili yemejwe",
      phoneVerified: "Telefone yemejwe",
      mobileMoney: "Mobile money",
      bankAccount: "Konti ya banki",
      lastSignIn: "Ubwinjiro buheruka",
      nextOfKin: "Uwo begereye",
      theirPhone: "Telefone ye",
      loans: "Inguzanyo",
      colPrincipal: "Umwenda w'ibanze",
      colPayable: "Agomba kwishyurwa",
      colRepaid: "Yishyuwe",
      colOutstanding: "Asigaye",
      colDisbursed: "Yatanzwe",
      daysLate: "Umunsi {count} warenze|Iminsi {count} yarenze",
      neverBorrowed: "Uyu munyamuryango ntiyafashe inguzanyo na rimwe.",
      recentTransactions: "Ibikorwa biherutse",
      balanceAfter: "Amafaranga asigaye",
      noTransactions: "Nta gikorwa cyanditswe kuri iyi konti.",
      notes: "Ibyitonderwa by'umuyobozi",
      noNotes: "Nta cyitonderwa cyanditswe kuri uyu munyamuryango.",
      internal: "by'imbere",
    },
    savings: {
      title: "Konti z'ubuzigame",
      description:
        "Konti zose z'ubuzigame z'abanyamuryango n'amafaranga ziriho.",
      totalHeld: "Yose afitwe",
      accountCount: "Konti {count}|Konti {count}",
      locked: "Yafatiriwe",
      lockedHint: "Yafatiriwe kubera inguzanyo n'ubwikuze butegereje",
      available: "Ashobora gukoreshwa",
      availableHint: "Amafaranga abanyamuryango bashobora kubikuza uyu munsi",
      searchPlaceholder:
        "Izina ry'umunyamuryango, nimero ye, nimero y'ubwishyu cyangwa nimero ya konti…",
      noneTitle: "Nta konti y'ubuzigame yabonetse",
      noneSearchBody:
        "Nta konti ihuye n'ibyo washakishije. Gerageza usibe ibyo washakishije.",
      noneBody:
        "Nta konti y'ubuzigame irafungurwa. Ifungurwa igihe umunyamuryango yemejwe.",
      colMember: "Umunyamuryango",
      colAccount: "Konti",
      colLocked: "Yafatiriwe",
      colAvailable: "Ashobora gukoreshwa",
      colDeposits: "Ubwitso",
      colWithdrawn: "Yabikujwe",
      colLastActivity: "Igikorwa giheruka",
      transactionCount: "Igikorwa {count}|Ibikorwa {count}",
    },
    transactions: {
      title: "Ibikorwa",
      description:
        "Ibikorwa byose byakozwe kuri konti z'ubuzigame z'abanyamuryango bose.",
    },
    payments: {
      title: "Ubwishyu",
      description: "Ubwishyu bwose ihuriro ryakiriye kuva ku utanga serivisi.",
      unmatchedTitle: "Ubwishyu butarahuzwa",
      unmatchedDescription:
        "Amafaranga yakiriwe adashoboye guhuzwa n'umunyamuryango byikora.",
      unmatchedNoneTitle: "Nta kintu gitegereje",
      unmatchedNoneBody:
        "Ubwishyu bwose bwakiriwe bwahujwe n'abanyamuryango kandi bwanditswe. Ubwishyu butarahuzwa buzagaragara hano.",
      unmatchedCount:
        "Ubwishyu {count} butegereje kwitabwaho.|Ubwishyu {count} butegereje kwitabwaho.",
      unmatchedNotice:
        "Buri bumwe ni amafaranga ari kuri konti y'ihuriro umunyamuryango atarandikirwa. Buhuze gusa iyo uzi neza uwo ari bwe — icyemezo cyandikwa ku izina ryawe.",

      selectedCount:
        "Ubwishyu {count} bwatoranyijwe|Ubwishyu {count} bwatoranyijwe",
      selectedNote:
        "kuri uru rupapuro. Kubusiba bibukura ku rutonde, bugume mu gitabo cy'ibyakozwe gusa.",
      clearSelection: "Kuraho ibyatoranyijwe",
      deleteSelected: "Siba ibyatoranyijwe",
      emptyQueueLead:
        "Uri gukuraho amakuru yinjijwe nabi? Ushobora gusiba urutonde rwose —",
      emptyQueueCount:
        "ubwishyu {count} butarahuzwa bwose|ubwishyu {count} butarahuzwa bwose",
      emptyQueueTail: ", harimo n'ubwo ku zindi mpapuro.",
      deleteAll: "Siba byose {count}",

      selectAllOnPage: "Toranya ubwishyu bwose buri kuri uru rupapuro",
      selectPayment: "Toranya ubwishyu {reference}",
      colReceived: "Bwakiriwe",
      colNarration: "Ibisobanuro / uwishyuye",
      colWhyUnmatched: "Impamvu butahujwe",
      colAction: "Igikorwa",
      noNarration: "Nta bisobanuro byatanzwe",
      flaggedSuspicious: "Bwaranzwe nk'ubukekwaho",
      noEvidence: "Nta gimenyetso cyo guhuza cyabonetse",
      possibleMembers: "Abanyamuryango bishoboka:",
      notVerified: "Ntibwemejwe na banki",
      match: "Huza",
      noPermission: "Nta burenganzira",
      cannotCredit: "Ntibishobora kwandikwa",

      selectMemberFirst: "Toranya umunyamuryango ubu bwishyu bwa we",
      creditFailed: "Ntibyashobotse kwandika ubu bwishyu",
      deleteFailed: "Ntibyashobotse gusiba ubu bwishyu",
      nonePicked: "Nta kintu cyatoranyijwe",
      bulkDeleteFailed: "Ntibyashobotse gusiba ubu bwishyu",
      paymentDeleted: "Ubwishyu bwasibwe.",
      paymentsDeleted: "Ubwishyu bwasibwe.",

      matchTitle: "Andika ubu bwishyu ku munyamuryango",
      matchBody:
        "{amount} yakiriwe ku wa {date}. Ibi bishyira ayo mafaranga kuri konti y'ubuzigame y'umunyamuryango ako kanya.",
      matchConfirm: "Andikira umunyamuryango",
      matchReasonLabel: "Kuki ubu bwishyu ari ubw'uyu munyamuryango?",
      matchReasonPlaceholder:
        "urugero: Umunyamuryango yemeje kuri telefone ko yishyuye akoresheje mobile money ya mushiki we",
      matchMemberLabel: "Umunyamuryango",
      matchMemberPlaceholder: "Toranya umunyamuryango…",
      narrationOnPayment: "Ibisobanuro biri ku bwishyu:",

      deleteTitle: "Siba ubu bwishyu",
      deleteBody:
        "{amount} yakiriwe ku wa {date}. Iyi nyandiko ikurwa ku rutonde igume mu gitabo cy'ibyakozwe gusa.",
      deleteConfirm: "Siba ubwishyu",
      deleteReasonLabel:
        "Kuki ubu bwishyu butazigera buba ubw'umunyamuryango?",
      deleteReasonPlaceholder:
        "urugero: Aya ni amafaranga ihuriro ryimuriye hagati ya konti zaryo, si umusanzu w'umunyamuryango",
      deleteNoteOnlyUnattributable:
        "Siba gusa ubwishyu butazigera bumenyekana nyirabwo — amafaranga ihuriro ryimurira ubwaryo, amafaranga ya banki, cyangwa umurongo porogaramu yasomye nabi muri PDF.",
      deleteNoteReappears:
        "Ubwishyu bumwe nibwongera kuza buvuye muri banki cyangwa mu yandi makuru ya konti winjije, buzongera kugaragara hano.",
      narration: "Ibisobanuro:",

      bulkAllTitle: "Siba ubwishyu {count} butarahuzwa bwose",
      bulkSelectedTitle:
        "Siba ubwishyu {count} bwatoranyijwe|Siba ubwishyu {count} bwatoranyijwe",
      bulkAllBody:
        "Ubwishyu bwose butarahuzwa muri iri huriro buzakurwa ku rutonde — harimo n'ubwo ku mpapuro utarafungura.",
      bulkSelectedBody:
        "Ubwishyu {count} watoranyije buzakurwa ku rutonde.|Ubwishyu {count} watoranyije buzakurwa ku rutonde.",
      bulkReasonLabel:
        "Kuki nta na bumwe muri ubu bwishyu bwaba ubw'umunyamuryango?",
      bulkReasonPlaceholder:
        "urugero: Amakuru ya konti yinjijwe si aya konti ikwiye, kandi buri murongo waturutse ku mafaranga ihuriro ryimuriye ubwaryo",
      bulkNoteAudited:
        "Buri gusiba byandikwa ukwabyo mu gitabo cy'ibyakozwe ku izina ryawe, hamwe n'inyandiko yuzuye y'ubwishyu.",
      bulkNoteSkipsCredited:
        "Ubwishyu bumaze kwandikwa ku munyamuryango busimburwa byikora — ubwo bugomba gusubizwa, ntibusibwe — kandi uzabwirwa umubare wasimbutswe.",
      bulkNoteClearsQueue:
        "Ibi bisiba urutonde rwose. Niba hari ubwishyu muri ubu bwa nyabwo bw'umunyamuryango, uwo munyamuryango ntazabwandikirwa.",
    },
    loans: {
      title: "Inguzanyo zose",
      description: "Inguzanyo zose ihuriro rifite mu bitabo byaryo.",
    },
    audit: {
      title: "Ibyakozwe byose",
      description:
        "Igikorwa cyose cy'ingirakamaro cyakozwe muri iri huriro, n'uwagikoze n'impamvu.",
    },
    withdrawals: {
      title: "Kubikuza",
      description:
        "Ubusabe butegereje isuzuma, n'ubwishyu bwemejwe bugomba kwandikwa.",
      noneTitle: "Nta busabe bwo kubikuza bufunguye",
      noneBody:
        "Ubusabe butegereje kwemezwa cyangwa kwishyurwa buzagaragara hano.",

      colRequested: "Byasabwe",
      colPayoutTo: "Bishyurwa kuri",
      colAction: "Igikorwa",
      net: "asigaye {amount}",
      belowRequest: "ari munsi y'ubusabe",
      recordPayout: "Andika ubwishyu",
      awaitingPayout: "Bitegereje kwishyurwa",
      decline: "Anga",
      noPermission: "Nta burenganzira",
      actionFailed: "Igikorwa ntikishoboye kurangira",

      approveTitle: "Wemeza ubu bwikuze?",
      approveBody:
        "{name} aremerewe kubikuza {amount}. Amafaranga ye ntakurwaho kugeza wanditse ko yishyuwe.",
      approveShortfall:
        "Amafaranga uyu munyamuryango afite ubu ni {balance}, ari munsi ya {amount} yasabye. Ubwishyu buzangwa keretse abanje kubitsa andi.",
      declineTitle: "Wanga ubu bwikuze?",
      declineBody:
        "{name} azabwirwa ko ubusabe bwe bwa {amount} bwanzwe, kandi amafaranga yari yafatiriwe azarekurwa.",
      declineReasonLabel: "Kuki ubu busabe bwangwa?",
      declineReasonPlaceholder:
        "urugero: Inguzanyo asigaje kwishyura igomba kubanza gukemuka",
      payoutTitle: "Wandika ubu bwishyu?",
      payoutBody:
        "Emeza ko {amount} yoherejwe koko kuri {name}. Ibi bikura ayo mafaranga kuri konti ye y'ubuzigame ako kanya, kandi ntibisubirwaho keretse hakozwe isubizwa.",
      payoutConfirm: "Emeza ubwishyu",
      payoutReferenceLabel: "Nimero ya banki cyangwa ya mobile money (ntibigomba)",
      payoutReferencePlaceholder: "urugero: kode yemeza ko amafaranga yoherejwe",
      payoutReferenceHint:
        "Kuyandika bituma ubwishyu bushobora gukurikiranwa mu nyandiko za banki.",
    },
    import: {
      title: "Kwinjiza inyandiko ya banki",
      description:
        "Ohereza inyandiko ya banki (PDF) kugira ngo abanyamuryango bishyuye bandikirwe.",
      noPermission:
        "Ushobora kohereza no kureba inyandiko, ariko ntufite uburenganzira bwo kwemeza kwinjiza. Saba umuyobozi mukuru uburenganzira bwa “Guhuza ubwishyu n'intoki”.",
      howTitle: "Uko bikorwa",
      step1: "Ohereza inyandiko PDF iva kuri konti ya banki y'ihuriro ryanyu.",
      step2:
        "Suzuma buri murongo. Sisitemu yerekana umunyamuryango buri bwishyu bwandikirwa, n'impamvu.",
      step3:
        "Shyira akamenyetso ku mirongo wagenzuye hanyuma wemeze. Imirongo ifite akamenyetso gusa yinjizwa.",
      step4:
        "Abanyamuryango bandikirwa kandi bakohererezwa ubutumwa bwemeza amafaranga bafite.",
      digitalOnly: "Inyandiko PDF igomba kuba iya digitale",
      digitalOnlyBody:
        ", ntabwo ari iyakoporowe cyangwa ifoto. Ifoto yakoporowe ntirimo inyandiko ishobora kusomwa. Niba banki yanyu itanga gusa amakopi, sabaza PDF cyangwa CSV kuri interineti ya banki.",
      reuploadSafe:
        "Kongera kohereza inyandiko imwe nta kibazo. Imirongo yamaze kwinjizwa imenyekana kandi isimbukwa, ku buryo nta muntu wandikirwa kabiri.",
      creditsOnly:
        "Amafaranga yinjiye gusa ashobora kuba imisanzu y'abanyamuryango. Ayasohotse yerekanwa kugira ngo umenye uko byagenze ariko ntayinjizwa.",

      readFailed: "Ntibyashobotse gusoma iyi nyandiko",
      uploadFailed:
        "Ntibyashobotse kohereza dosiye. Reba umurongo wa interineti hanyuma wongere ugerageze.",
      importFailed: "Kwinjiza ntibyashobotse",
      completeTitle: "Kwinjiza byarangiye",
      importAnother: "Injiza indi nyandiko ya banki",
      reading: "Turasoma inyandiko…",
      dropPrompt: "Ohereza inyandiko ya banki muri PDF",
      dropHint:
        "Kurura dosiye hano, cyangwa ukande uyihitemo. Nta kintu na kimwe cyandikwa mbere y'uko usuzuma ukanemeza.",

      wrongAccountTitle: "Ishobora kuba ari iya konti itari yo",
      wrongAccountBody:
        "Iyi nyandiko isa n'iya konti {detected}, nyamara konti y'ihuriro yakiriramo amafaranga ni {expected}. Genzura ko wohereje dosiye ikwiye mbere yo kwinjiza.",
      lowConfidenceTitle: "Hari imirongo itasomwe neza",
      lowConfidenceBody:
        "Umurongo {count} washyizweho ikimenyetso cy'uko utizewe kandi nta kamenyetso ufite. Uwugereranye na PDF mbere yo kuwushyiramo.|Imirongo {count} yashyizweho ikimenyetso cy'uko itizewe kandi nta tumenyetso ifite. Uyigereranye na PDF mbere yo kuyishyiramo.",
      fallbackParserTitle: "Byasomwe hakoreshejwe uburyo bw'inyongera",
      fallbackParserBody:
        "Uburyo bwizewe bwo gusoma ntibwabonetse, bituma iyi nyandiko isomwa n'uburyo bwa JavaScript. Ku nyandiko zifite inkingi zegeranye cyane, bushobora guhuza inkingi ebyiri bigatanga umubare utari wo. Genzura buri mubare ku nyandiko ya PDF, kandi ushyireho uburyo bwa Python (pip install -r scripts/requirements.txt) kugira ngo ibi bitongera kubaho.",
      noLayoutTitle: "Iyi PDF nta miterere y'inkingi ifite",
      noLayoutBody:
        "Inyandiko yasomwe nta miterere y'imbonerahamwe na mba, bityo imibare n'amatariki bishoboka cyane ko byasomwe nabi. Genzura buri murongo wose ku nyandiko mbere yo kwinjiza icyo ari cyo cyose.",
      noTextPagesTitle: "Hari impapuro zitariho inyandiko",
      noTextPagesBody:
        "Urupapuro {pages} nta kintu rwatanze — bishoboka ko ari ifoto yakoporowe. Ibikorwa byanditse kuri rwo ntabwo biri mu mbonerahamwe iri hasi.|Impapuro {pages} nta kintu zatanze — bishoboka ko ari amafoto yakoporowe. Ibikorwa byanditse kuri zo ntabwo biri mu mbonerahamwe iri hasi.",

      fileSummary: "urupapuro {pages}|impapuro {pages}",
      rowsRead: "umurongo {count} wasomwe|imirongo {count} yasomwe",
      fileAccount: " · konti {account}",
      filePeriod: " · kuva {from} kugeza {to}",
      coverageLead: "Hasomwe imirongo {count} muri PDF:",
      coverageTransactions: "ibikorwa {count}",
      coverageRest: ", {structural} y'umutwe/ikirenge, {other} indi",
      coverageUnreadable: "{count} itasomeka",

      figCredits: "Amafaranga yinjiye yabonetse",
      figWouldMatch: "Yahuza n'umunyamuryango",
      figWouldUnmatch: "Yajya mu butarahuzwa",
      figAlreadyImported: "Yamaze kwinjizwa",

      rowsSelected: "umurongo {count} watoranyijwe|imirongo {count} yatoranyijwe",
      selectAllImportable: "Toranya iyinjizwa yose",
      includeRow: "Shyiramo {description}",
      colDescription: "Ibisobanuro byasomwe muri PDF",
      colWouldCredit: "Byandikirwa",
      colParser: "Isomwa",
      alreadyImported: "Byamaze kwinjizwa",
      debitNotContribution: "Amafaranga yasohotse — si umusanzu",
      noMemberMatched:
        "Nta munyamuryango wahuye — bizategereza ku rutonde rw'ibitarahuzwa",
      confidenceHigh: "byizewe",
      confidenceMedium: "hagati",
      confidenceLow: "bitizewe",

      unparsedSummary:
        "umurongo {count} ntiwashoboye gusobanurwa|imirongo {count} ntiyashoboye gusobanurwa",
      unparsedNote:
        "Iyi mirongo isa n'aho yari ibikorwa ariko ntiyashoboye gusomwa. Genzura PDF — niba hari ubwishyu bwa nyabwo, ubwandike n'intoki uhereye ku rutonde rw'ibitarahuzwa.",

      importButton: "Injiza ubwishyu {count}|Injiza ubwishyu {count}",
      confirmTitle: "Winjiza ubwishyu {count}?|Winjiza ubwishyu {count}?",
      confirmBody:
        "{amount} azandikwa kuri konti z'ubuzigame z'abanyamuryango, kandi buri munyamuryango azahabwa ubutumwa bwemeza amafaranga afite. Ibi byandikwa mu gitabo kandi ntibisubirwaho keretse hakozwe isubizwa.",
      confirmLabel: "Injiza kandi wandikire abanyamuryango",
      confirmReasonLabel:
        "Emeza ko iyi ari inyandiko ya banki nyayo y'ihuriro ryanyu",
      confirmReasonPlaceholder:
        "urugero: Inyandiko ya Equity Bank yo muri Kanama 2026, yakuwe kuri interineti ya banki ku wa 14 Kanama",
      attestation:
        "Uremeza ko iyi PDF ari inyandiko nyayo ya konti y'iri huriro kandi ko wagenzuye imirongo watoranyije. Izina ryawe ryandikwa kuri buri bwishyu ibi bizakora.",
    },
    applications: {
      title: "Ubusabe bw'inguzanyo",
      description: "Suzuma ubusabe kandi utange inguzanyo zemejwe.",
      noneTitle: "Nta busabe butegereje",
      noneBody:
        "Ubusabe bushya bw'inguzanyo n'inguzanyo zemejwe zitegereje gutangwa bizagaragara hano.",

      tabApplications: "Ubusabe",
      tabDisbursement: "Butegereje gutangwa",
      noneAwaitingReview: "Nta busabe butegereje isuzuma.",
      noneAwaitingDisbursement: "Nta nguzanyo yemejwe itegereje gutangwa.",
      actionFailed: "Igikorwa ntikishoboye kurangira",
      disbursementFailed: "Gutanga inguzanyo ntibyashobotse",

      overMonths: "mu mezi {months} · {product}",
      submittedOn: " · bwoherejwe ku wa {date}",
      purpose: "Icyo igenewe:",
      savingsBalance: "Ubuzigame afite",
      savingsWas: "bwari {amount} igihe yasabaga",
      eligibleUpTo: "Yemererwa kugeza kuri",
      alreadyOwing: "Asanzwe abereyemo",
      activeLoanCount: "inguzanyo {count} iriho|inguzanyo {count} ziriho",
      noActiveLoans: "Nta nguzanyo iriho",
      repaymentRecord: "Amateka yo kwishyura",
      hasBeenOverdue: "Yarigeze kurenza igihe",
      loansRepaid: "{count} yishyuwe",
      noHistory: "Nta mateka",
      overCeiling:
        "Ubusabe bwa {amount} burenze urwego uyu munyamuryango yemererwa ubu, ari rwo {ceiling}. Emeza amafaranga make, cyangwa wange.",
      overdueWarning:
        "Uyu munyamuryango yarigeze kurenza igihe ku nguzanyo yabanje.",
      guarantors: "Abishingizi",
      requestInfo: "Saba andi makuru",
      decline: "Anga",
      disburse: "Tanga inguzanyo",
      noDisbursePermission: "Nta burenganzira bwo gutanga inguzanyo",
      loanTerms: "{product} · {rate}% · amezi {months}",

      approveTitle: "Wemeza iyi nguzanyo?",
      approveBody:
        "Hazakorwa inguzanyo ya {name} itegereje gutangwa. Nta mafaranga agenda kugeza uyitanze.",
      approveConfirm: "Emeza inguzanyo",
      approvedAmount: "Amafaranga yemejwe",
      approvedAmountHint:
        "Ushobora kwemeza make kuruta ayasabwe, ariko ntushobora kwemeza menshi.",
      approvedAmountCeiling: " Urwego uyu munyamuryango yemererwa ni {amount}.",
      declineTitle: "Wanga ubu busabe?",
      declineBody:
        "{name} azabwirwa ko ubusabe bwe butemewe, kandi ahabwe impamvu.",
      declineConfirm: "Anga ubusabe",
      declineReasonLabel: "Kuki ubu busabe bwangwa?",
      declineReasonPlaceholder:
        "urugero: Amafaranga yasabwe arenze inshuro eshatu z'ubuzigame bwe",
      infoTitle: "Saba andi makuru",
      infoBody:
        "Umunyamuryango azamenyeshwa, kandi ubusabe buzategereza kugeza asubije.",
      infoConfirm: "Ohereza ubusabe",
      infoTooShort: "Vuga amakuru akenewe, nibura mu nyuguti 10",
      infoLabel: "Ni ayahe makuru ukeneye ku munyamuryango?",
      infoPlaceholder: "urugero: Ohereza ifatabuguzi ry'imashini ugiye kugura",
      disburseTitle: "Utanga iyi nguzanyo?",
      disburseBody:
        "{amount} azashyirwa kuri konti y'ubuzigame ya {name}, hakuwemo ibiguzi, kandi gahunda yose yo kwishyura izakorwa. Ibi ntibisubirwaho keretse hakozwe isubizwa.",
      disburseConfirm: "Tanga ubu",
    },
    products: {
      title: "Ubwoko bw'inguzanyo",
      description: "Amabwiriza buri busabe bw'inguzanyo busuzumirwa.",
      noneTitle: "Nta bwoko bw'inguzanyo bwashyizweho",
      noneBody:
        "Abanyamuryango ntibashobora gusaba inguzanyo hatariho nibura ubwoko bumwe. Ubwoko bushyirwaho n'umuyobozi w'urubuga.",
      interest: "Inyungu",
      amount: "Umubare",
      minAmount: "muto {amount}",
      inUse: "Zikoreshwa",
      applicationCount: "Ubusabe {count}|Ubusabe {count}",
      eligibility: "Ibisabwa",
      eligibilityValue:
        "{amount} yazigamwe · ukwezi {months} mu bunyamuryango|{amount} yazigamwe · amezi {months} mu bunyamuryango",
      multiplier: "Ikigereranyo ku buzigame",
      multiplierValue: "{factor}× ubuzigame",
      cappedAt: ", ntarengwa {amount}",
      term: "Igihe",
      termValue: "Amezi {min}–{max}, {frequency}",
      processingFee: "Amafaranga y'itunganya",
      insuranceFee: "Amafaranga y'ubwishingizi",
      latePenalty: "Ihazabu yo gutinda",
      graceDays:
        " nyuma y'umunsi {count} w'imbabazi| nyuma y'iminsi {count} y'imbabazi",
      guarantors: "Abishingizi",
      guarantorsRequired: "{count} basabwa",
      notRequired: "Ntibisabwa",
      collateral: "Ingwate",
      required: "Birasabwa",
      concurrent: "Inguzanyo nyinshi icyarimwe",
      singleLoan: "Inguzanyo imwe ikora ku munyamuryango",
      multipleAllowed: "Nyinshi zemewe",
      advisoryNote:
        "Aya mabwiriza ni inama mu rupapuro rw'ubusabe kandi ni itegeko igihe ubusabe bwoherejwe — ibisabwa bisubirwamo kuri seriveri igihe umunyamuryango asaba, ku buryo guhindura ubwoko hano bihindura ibyubahirizwa koko.",
    },
    reports: {
      title: "Raporo",
      description: "Aho amafaranga y'ihuriro ari, n'uko yagenze.",
      savingsHeld: "Ubuzigame bufitwe",
      activeMembers:
        "Umunyamuryango {count} ukora|Abanyamuryango {count} bakora",
      loansOutstanding: "Inguzanyo zisigaye",
      activeLoans: "Inguzanyo {count} iriho|Inguzanyo {count} ziriho",
      inArrears: "Umwenda urengeje igihe",
      overdueCount: "{count} yarengeje igihe",
      members: "Abanyamuryango",
      joinedThisMonth: "{count} binjiye uku kwezi",

      membersByStatus: "Abanyamuryango bakurikije imimerere",
      loansByStatus: "Inguzanyo zikurikije imimerere",
      paymentsByChannel: "Ubwishyu bukurikije uburyo",
      ledgerByType: "Ibikorwa by'igitabo bikurikije ubwoko",
      headMembers: "Abanyamuryango",
      headLoans: "Inguzanyo",
      headPrincipal: "Umutungo watanzwe",
      headPayments: "Ubwishyu",
      headValue: "Agaciro",
      headEntries: "Ibyanditswe",
      headCategory: "Icyiciro",
      nothingRecorded: "Nta kintu kiranditswe.",
      movementTitle: "Kubitsa no kubikuza, mu mezi 12 ashize",
      month: "Ukwezi",
      deposits: "Ayabitswe",
      withdrawals: "Ayabikujwe",
      net: "Asigaye",
      noMovement: "Nta gikorwa cy'igitabo cyanditswe mu mezi cumi n'abiri ashize.",
      largestSavers: "Abazigamye cyane",
      noSavingsAccounts: "Nta konti z'ubuzigame ziriho.",
      arrearsTitle: "Imyenda irengeje igihe",
      daysLate: "Iminsi yatinze",
      overdue: "Yarengeje igihe",
      noArrears: "Nta nguzanyo irengeje igihe kugeza ubu.",
    },
    notifications: {
      title: "Ubutumwa",
      description:
        "Ubutumwa bwose sisitemu yohereje abanyamuryango, n'uko bwageze.",
      sent: "Ubutumwa bwoherejwe",
      notYetRead: "{count} butarasomwa",
      delivered: "Bwageze",
      deliveredHint: "Byemejwe n'utanga serivisi",
      handedOver: "Bwoherejwe",
      handedOverHint: "Bwahawe utanga serivisi",
      failed: "Ubutumwa butageze",
      failedHint: "Abanyamuryango ntibagezweho",
      noFailures: "Nta butumwa butageze",
      event: "Igikorwa",
      allEvents: "Ibikorwa byose",
      noneTitle: "Nta butumwa burohererezwa",
      noneBody:
        "Ubutumwa bwoherezwa byikora igihe ubwishyu bwanditswe, inguzanyo zafatiwe icyemezo n'ubwikuze bwatunganyijwe.",
      colRecipient: "Uwoherejwe",
      colMessage: "Ubutumwa",
      colDelivery: "Uko bwageze",
      colSent: "Bwoherejwe",
      colRead: "Bwasomwe",
      inAppOnly: "Muri porogaramu gusa",
      read: "Bwasomwe",
      unread: "Butarasomwa",
    },
    borrowings: {
      title: "Inguzanyo za banki",
      description:
        "Amafaranga ihuriro ryaguzwe. Buri nguzanyo yashyizwe ahagaragara igaragara ku ipaji y'abanyamuryango.",
      noneTitle: "Nta nguzanyo yanditswe",
      noneBody:
        "Ihuriro nta nguzanyo ryafashe muri banki cyangwa ku wundi muguriza. Yandike hano niriyifata, kandi abanyamuryango bazayibona hamwe n'ibyo yishyuye.",
      addFacility: "Andika inguzanyo",
      recordRepayment: "Andika ubwishyu",
      totalOwed: "Agisigaye",
      totalOwedHint: "Mu nguzanyo {count} ikora|Mu nguzanyo {count} zikora",
      facilities: "Inguzanyo",
      nextPayment: "Ubwishyu bukurikira",
      nothingDue: "Nta bwishyu buteganyijwe",
      pledged: "Byatanzwe nk'ingwate",
      pledgedHint: "Inguzanyo ugereranyije n'ubuzigame bwose bw'abanyamuryango",
      lender: "Umuguriza",
      purpose: "Icyo yagenewe",
      principal: "Umutungo w'ibanze",
      rate: "Igipimo cy'inyungu",
      term: "Igihe",
      termMonths: "Ukwezi {count}|Amezi {count}",
      repaid: "Yishyuwe",
      outstanding: "Agisigaye",
      matures: "Irangira",
      security: "Ingwate",
      visibleToMembers: "Bigaragara ku banyamuryango",
      hiddenFromMembers: "Bihishwe abanyamuryango",
      hiddenWarning:
        "Abanyamuryango ntibashobora kubona iyi nguzanyo. Niba ubuzigame bwabo ari bwo ngwate, bafite uburenganzira bwo kubimenya — guhisha bijya mu byanditswe by'igenzura.",
      repaymentHistory: "Amateka y'ubwishyu",
      noRepayments: "Nta bwishyu buranditswe kuri iyi nguzanyo.",
      principalPortion: "Umutungo w'ibanze",
      interestPortion: "Inyungu",
      feesPortion: "Amafaranga",
      fundedProjects: "Imishinga yishyuwe n'iyi nguzanyo",
      memberViewNote:
        "Ibyo wandika hano ni byo abanyamuryango basoma. Andika icyo yagenewe mu magambo umunyamuryango yakoresha, atari mu magambo ya banki.",

      formTitle: "Andika inguzanyo ya banki",
      formIntro:
        "Yandike uko ibaruwa y'umuguriza ibivuga. Abanyamuryango bazabona umuguriza, icyo yagenewe, ingano n'agisigaye.",
      lenderType: "Ubwoko bw'umuguriza",
      lenderReference: "Nomero y'umuguriza",
      lenderContact: "Uwo muvugana ku muguriza",
      interestMethod: "Uburyo bw'inyungu",
      flat: "Ihoraho",
      reducing: "Igabanuka",
      totalInterest: "Inyungu yose",
      totalInterestHint:
        "Iva mu ibaruwa y'umuguriza. Nusiga ubusa, izabarwa hakoreshejwe igipimo n'igihe.",
      totalFees: "Amafaranga y'itegurwa",
      collateralAmount: "Agaciro k'ingwate",
      disbursedAt: "Itariki yakiriweho",
      disbursedAtHint:
        "Siga ubusa kugeza amafaranga agiye kuboneka — nta kintu kirabereyemo mbere y'aho.",
      firstPaymentDue: "Ubwishyu bwa mbere",
      publish: "Bibonwe n'abanyamuryango",
      publishHint:
        "Abanyamuryango ubuzigame bwabo ari bwo ngwate bafite uburenganzira bwo kubibona. Kubihisha bijya mu byanditswe by'igenzura.",
      saved: "Inguzanyo yanditswe.",
      repaymentTitle: "Andika ubwishyu",
      repaymentIntro: "Bwandike uko inyandiko y'umuguriza ibivuga.",
      amount: "Amafaranga yishyuwe",
      splitHint:
        "Nusiga igabana ubusa, inyungu ibanza kwishyurwa, hakurikireho umutungo w'ibanze.",
      paidAt: "Itariki yishyuriweho",
      note: "Icyitonderwa",
      externalReference: "Nomero ya banki",
      repaymentSaved: "Ubwishyu bwanditswe.",
    },
    investments: {
      title: "Icyo amafaranga yacu yakoze",
      description:
        "Ibyo ihuriro rishoyemo amafaranga, n'ibyo abanyamuryango babikuyemo.",
      noneTitle: "Nta kintu kiranditswe",
      noneBody:
        "Ibikoresho, ahakorerwa, amahugurwa, imyenda yaguzwe ari myinshi — ikintu cyose ihuriro ryakoresheje amafaranga y'abanyamuryango kigomba kuza hano, hamwe n'ikiguzi n'abo cyafashije.",
      addInvestment: "Andika ishoramari",
      totalInvested: "Yashowe",
      totalReturned: "Yagarutse",
      projects: "Imishinga",
      reach: "Abanyamuryango bagezweho",
      reachHint: "Umubare munini umushinga umwe wafashije",
      category: "Ubwoko",
      fundingSource: "Byishyuwe na",
      invested: "Yashowe",
      returned: "Yagarutse kugeza ubu",
      netReturn: "Icyavuyemo",
      benefit: "Icyo abanyamuryango babikuramo",
      noBenefitRecorded: "Nta nyungu yanditswe",
      benefitPrompt:
        "Abanyamuryango basoma iyi nteruro. Vuga icyahindutse kuri bo, atari icyaguzwe.",
      membersBenefited: "Umunyamuryango {count}|Abanyamuryango {count}",
      fundedBy: "Byishyuwe na {reference}",
      started: "Byatangiye",
      completed: "Byarangiye",
      visibleToMembers: "Bigaragara ku banyamuryango",
      hiddenFromMembers: "Bihishwe abanyamuryango",
      memberViewNote:
        "Inyungu yagarutse koko ni yo yonyine igomba kwandikwa. Urugero rwandikwaho ruba igice cy'inyungu buri munyamuryango yerekwa, n'igice cy'umugabane akeka ko ari uwe.",

      formTitle: "Andika ishoramari",
      formIntro:
        "Icyo ihuriro ryaguze cyangwa ryishyuye rikoresheje amafaranga y'abanyamuryango, n'icyo abanyamuryango babikuramo.",
      nameLabel: "Ni iki",
      summaryLabel: "Kivuge muri make",
      detailLabel: "Ibisobanuro birambuye",
      benefitLabel: "Icyo abanyamuryango babikuramo",
      membersBenefitedLabel: "Abanyamuryango bifasha",
      amountInvested: "Amafaranga yashowe",
      amountReturned: "Yagarutse kugeza ubu",
      amountReturnedHint:
        "Amafaranga yakiriwe koko — ubukode, ibyacurujwe, ayazigamwe mu kugura ari byinshi. Si ayateganyijwe kuzabonekaho.",
      fundedByLabel: "Byishyuwe n'inguzanyo ya banki",
      fundedByNone: "Ntibyavuye ku nguzanyo ya banki",
      startedAt: "Byatangiye",
      completedAt: "Byarangiye",
      statusLabel: "Aho bigeze",
      publish: "Bibonwe n'abanyamuryango",
      publishHint:
        "Iyi ni paji abanyamuryango bafungura kugira ngo barebe icyo ubuzigame bwabo bwakoze. Ibihishwe nta cyo bimarayo.",
      saved: "Ishoramari ryanditswe.",
      editTitle: "Vugurura iri shoramari",
      editIntro:
        "Zamura umubare w'inyungu uko ryigaburira, kandi wuzuze inyungu igihe hari icyo kuvuga koko.",
    },
    settings: {
      title: "Igenamiterere ry'ihuriro",
      descriptionPlain: "Igenamiterere ry'ihuriro rimwe.",
      description: "Igenamiterere rya {association}.",
      noAssociationTitle: "Nta huriro ryatoranyijwe",
      noAssociationBody:
        "Iri genamiterere ni ry'ihuriro rimwe. Fungura ihuriro mu rutonde rw'urubuga, cyangwa ukoreshe igenamiterere ry'urubuga rusange.",
      profile: "Umwirondoro",
      legalName: "Izina ryemewe n'amategeko",
      code: "Kode",
      registrationNo: "Nimero y'iyandikwa",
      taxId: "Nimero y'imisoro",
      currency: "Ifaranga",
      timezone: "Isaha y'akarere",
      created: "Ryashyizweho",
      contact: "Aho bagerwaho",
      website: "Urubuga",
      administrators: "Abayobozi",
      loanProducts: "Ubwoko bw'inguzanyo",
      collectionAccount: "Konti yakira amafaranga",
      bank: "Banki",
      accountName: "Izina rya konti",
      accountNumber: "Nimero ya konti",
      branchCode: "Kode y'ishami",
      referenceSequence: "Urukurikirane rwa nimero z'ubwishyu",
      referenceSequenceHint:
        "Nimero y'ubwishyu y'umunyamuryango ukurikira ikorwa kuva kuri iyi mibare",
      rules: "Amabwiriza yo kuzigama no kubikuza",
      minimumDeposit: "Ubwitso buto ntarengwa",
      maximumDeposit: "Ubwitso bunini ntarengwa",
      noLimit: "Nta ntarengwa",
      minimumBalance: "Amafaranga make ntarengwa",
      withdrawalsLabel: "Kubikuza",
      allowed: "Byemewe",
      suspended: "Byahagaritswe",
      approvalRequired: "Bisaba kwemezwa",
      withdrawalFee: "Ikiguzi cyo kubikuza",
      noticePeriod: "Igihe cyo kumenyesha",
      noticeDays: "Umunsi {count}|Iminsi {count}",
      monthlyContribution: "Umusanzu w'ukwezi",
      dueDay: ", ku munsi wa {day}",
      notEnforced: "Ntibitegetswe",
      annualInterest: "Inyungu ku mwaka",
      noRule:
        "Nta bwiriza ry'ubuzigame ryashyizweho, bityo amabwiriza asanzwe y'urubuga akoreshwa: ubwitso ntibugarukira kandi kubikuza bisaba kwemezwa.",
      storedConfiguration: "Igenamiterere ryabitswe",
      noStoredSettings:
        "Iri huriro nta genamiterere ryabitswe rifite; amabwiriza asanzwe y'urubuga akurikizwa kuri byose.",
      readOnlyNote:
        "Uru rupapuro ni urwo kureba gusa. Guhindura ibwiriza ry'imari bihindura uko buri bwitso, ubwikuze n'inguzanyo bizabarwa, bityo impinduka zikorwa n'umuyobozi w'urubuga, kandi buri mpinduka yandikwa mu gitabo cy'ibyakozwe.",
    },

    bk: {
      title: "Ibikorwa bya Bank of Kigali",
      description:
        "Saba ubwishyu kuri BK, hanyuma ukore isuzuma urebe niba ubwo bwishyu bugaruka.",
      connectionTitle: "Ihuza",
      mode: "Uburyo",
      baseUrl: "Aderesi ya API",
      collectionAccount: "Konti yakira amafaranga",
      credentials: "Impushya",
      configured: "Byashyizweho",
      notConfigured: "Ntibyashyizweho",
      notSet: "Ntibyuzuzwa",

      howTitle: "Uko iri suzuma rikora",
      howStep1:
        "Saba ubwishyu. RTA itanga nomero yihariye maze ikayandikisha kuri BK, na yo igasubiza CLAIMED.",
      howStep2:
        "Kora isuzuma ry'ibikorwa. Risoma urutonde rw'ibikorwa bya BK maze rikabika ibyo rusanze.",
      howStep3:
        "Niba habonetse igikorwa gifite iyo nomero, icyasabwe kigaragara nka Cyabonetse. Kitaraboneka kiguma ku Gitegereje.",

      claimTitle: "Saba ubwishyu",
      claimDescription:
        "Uwishyura yikorera kode y'imibare itandatu muri Internet Banking cyangwa porogaramu ya BK akakubwira.",
      payerCode: "Kode y'uwishyura",
      payerCodeHint: "Imibare itandatu",
      narration: "Ibisobanuro",
      amount: "Umubare w'amafaranga",
      forMember: "Ku munyamuryango",
      noMember: "Ntabwo bifitanye isano n'umunyamuryango",
      claimButton: "Saba ubwishyu",
      claiming: "Birimo gusabwa…",
      claimFailed: "Gusaba byanze",
      claimSucceeded: "Ubwishyu bwasabwe",

      syncTitle: "Isuzuma ry'ibikorwa",
      syncDescription:
        "Risoma urutonde rw'ibikorwa bya BK mu gihe cyagenwe maze rikinjiza ibishya.",
      syncButton: "Kora isuzuma nonaha",
      syncing: "Birimo gusuzumwa…",
      syncFailed: "Isuzuma ryanze",
      syncSucceeded: "Isuzuma ryarangiye",

      claimsTitle: "Ibyasabwe",
      reference: "Nomero",
      status: "Imimerere",
      raised: "Byasabwe",
      observed: "Byabonetse mu isuzuma",
      notYetSeen: "Gitegereje",
      seenAfter: "Byabonetse nyuma ya {duration}",
      noClaims: "Nta bwishyu buracyasabwa.",
      noPermission:
        "Ushobora kureba ibikorwa bya BK ariko ntushobora gusaba ubwishyu cyangwa gukora isuzuma. Saba umuyobozi w'urubuga uburenganzira bwa BK.",

      statFetched: "Byasomwe",
      statCreated: "Bishya",
      statMatched: "Byahujwe",
      statUnmatched: "Bitarahuzwa",
    },
  },
};
