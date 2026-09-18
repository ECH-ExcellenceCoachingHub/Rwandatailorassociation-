import type { Locale } from "@/types";

/**
 * The member's own dashboard: savings, loans, withdrawals, statements, profile.
 *
 * The most important area of the platform to translate. An administrator is
 * paid to learn the system's vocabulary; a tailor is not, and this is where
 * they read what they are owed and what they owe. Where a sentence carries
 * money or a deadline it is translated in full rather than shortened, because
 * a member acting on half an instruction is the failure this is meant to avoid.
 */
export interface MemberCopy {
  overview: {
    welcome: string;
    lastActivity: string;
    firstContribution: string;
    overdueTitle: string;
    overdueBody: string;
    makeRepayment: string;
    applicationTitle: string;
    applicationBody: string;
    viewDetails: string;
    savingsBalance: string;
    availableHint: string;
    activeLoan: string;
    noLoanRunning: string;
    outstandingLoan: string;
    repaidPercent: string;
    nothingOwed: string;
    nextRepayment: string;
    dueOn: string;
    dueInDays: string;
    noRepaymentScheduled: string;
    quickActions: string;
    makeDeposit: string;
    requestWithdrawal: string;
    applyLoan: string;
    savingsGrowth: string;
    savingsGrowthHint: string;
    savingsGrowthEmpty: string;
    contributions: string;
    contributionsHint: string;
    contributionsEmpty: string;
    repaymentProgress: string;
    totalPayableHint: string;
    recentTransactions: string;
    noTransactions: string;
    noTransactionsHint: string;
    noAccountTitle: string;
    noAccountBody: string;
  };
  savings: {
    title: string;
    accountOpened: string;
    statement: string;
    deposit: string;
    currentBalance: string;
    transactionCount: string;
    available: string;
    pledged: string;
    nothingPledged: string;
    totalContributed: string;
    lifetimeDeposits: string;
    totalWithdrawn: string;
    lifetimeWithdrawals: string;
    pledgedNotice: string;
    tileDeposit: string;
    tileDepositHint: string;
    tileWithdraw: string;
    tileWithdrawHint: string;
    tileTransactions: string;
    tileTransactionsHint: string;
    recentActivity: string;
    noTransactionsQuote: string;
    noAccountTitle: string;
    noAccountBody: string;
  };
  deposit: {
    title: string;
    description: string;
    alwaysQuoteTitle: string;
    alwaysQuoteBody: string;
    bankTransfer: string;
    bank: string;
    accountName: string;
    accountNumber: string;
    branchCode: string;
    referenceToQuote: string;
    noAccountPublished: string;
    noAccountPhone: string;
    noAccountQuote: string;
    mobileMoney: string;
    mobileMoneyBody: string;
    contributionRules: string;
    minimumDeposit: string;
    monthlyContribution: string;
    dueEachMonth: string;
    day: string;
  };
  transactions: {
    title: string;
    description: string;
    matching: string;
    totalIn: string;
    totalOut: string;
    balanceAfter: string;
    noneFoundTitle: string;
    noneFoundBody: string;
  };
  loans: {
    title: string;
    description: string;
    applyAction: string;
    noneTitle: string;
    noneBody: string;
    applications: string;
    submittedOn: string;
    purpose: string;
    needMoreInformation: string;
    notApproved: string;
    approvedFor: string;
    approvedBody: string;
    disbursedOn: string;
    overdueAmount: string;
    penaltiesMayApply: string;
    interestRate: string;
    perYear: string;
    totalPayable: string;
    repaid: string;
    outstanding: string;
    schedule: string;
    dueDate: string;
    principal: string;
    interest: string;
    fees: string;
    totalDue: string;
    paid: string;
    remaining: string;
  };
  apply: {
    title: string;
    description: string;
    noProductsTitle: string;
    noProductsBody: string;
    activeLoanTitle: string;
    activeLoanBody: string;
    viewMyLoan: string;

    /** Repayment frequencies, keyed by the database enum. */
    freqDAILY: string;
    freqWEEKLY: string;
    freqBIWEEKLY: string;
    freqMONTHLY: string;
    freqQUARTERLY: string;

    productLabel: string;
    productOption: string;
    monthsCount: string;
    amountLabel: string;
    amountHint: string;
    amountTooSmall: string;
    amountTooLarge: string;
    termLabel: string;
    termHint: string;
    termIssue: string;
    collateralTitle: string;
    collateralIntro: string;
    collateralDescriptionLabel: string;
    collateralDescriptionHint: string;
    collateralValueLabel: string;
    collateralValueHint: string;
    collateralSatisfied: string;
    frequencyLabel: string;
    purposeLabel: string;
    purposeHint: string;
    purposePlaceholder: string;
    guarantorsTitle: string;
    guarantorsIntro: string;
    guarantorNumber: string;
    guarantorRemove: string;
    guarantorChange: string;
    guarantorLookupLabel: string;
    guarantorLookupPlaceholder: string;
    guarantorFind: string;
    guarantorNotFound: string;
    guarantorDuplicate: string;
    guarantorAmountLabel: string;
    guarantorAdd: string;
    guarantorsCovered: string;
    guarantorsRemaining: string;
    guarantorsComplete: string;
    guarantorsOver: string;
    guarantorIncomplete: string;
    guarantorsHowItWorks: string;
    submitApplication: string;
    submitFailed: string;
    ineligibleTitle: string;
    successTitle: string;
    successBody: string;
    trackIt: string;

    previewTitle: string;
    previewEmpty: string;
    lineLoanAmount: string;
    lineYouReceive: string;
    lineInterest: string;
    lineInterestBack: string;
    lineNetCost: string;
    lineTotalRepay: string;
    paymentLabel: string;
    paymentsCount: string;
    previewNote: string;
  };
  repayments: {
    title: string;
    description: string;
    noLoansTitle: string;
    noLoansBody: string;
    applyAction: string;
    arrearsTitle: string;
    arrearsBody: string;
    totalOutstanding: string;
    acrossLoans: string;
    nextInstalment: string;
    dueOn: string;
    nothingScheduled: string;
    inArrears: string;
    settleSoon: string;
    upToDate: string;
    schedule: string;
    loan: string;
    instalment: string;
    daysLate: string;
    noSchedule: string;
    received: string;
    penalty: string;
    balanceAfter: string;
    noneReceived: string;
    matchingNote: string;
  };
  withdrawals: {
    title: string;
    description: string;
    suspendedTitle: string;
    suspendedBody: string;
    yourRequests: string;
    requested: string;
    fee: string;
    youReceive: string;
    noneYet: string;
    reviewNote: string;

    formTitle: string;
    availableNow: string;
    hintMin: string;
    hintMinMax: string;
    payoutMethod: string;
    methodMobileMoney: string;
    methodBank: string;
    methodCash: string;
    mobileNumber: string;
    bankAccount: string;
    destinationHint: string;
    accountNumberPlaceholder: string;
    reasonLabel: string;
    reasonPlaceholder: string;
    amountRequested: string;
    withdrawalFee: string;
    deductedFromBalance: string;
    errExceedsAvailable: string;
    errBelowMinimum: string;
    errAboveMaximum: string;
    errMinimumBalance: string;
    submitRequest: string;
    approvalNote: string;
    submitFailed: string;
    successTitle: string;
    successReference: string;
    successUnderReview: string;
    successPayingOut: string;
    makeAnother: string;
  };
  statements: {
    title: string;
    description: string;
    ledgerNote: string;
    formatNote: string;
  };
  notifications: {
    title: string;
    unread: string;
    upToDate: string;
    noneTitle: string;
    noneBody: string;
    unreadLabel: string;
    justNow: string;
    minutesAgo: string;
    hoursAgo: string;
    daysAgo: string;
  };
  profile: {
    title: string;
    description: string;
    changePassword: string;
    incompleteTitle: string;
    incompleteBody: string;
    yourReference: string;
    yourReferenceBody: string;
    membership: string;
    memberNumber: string;
    identityCheck: string;
    association: string;
    joined: string;
    approvedOn: string;
    contactSecurity: string;
    emailVerified: string;
    phoneVerified: string;
    notVerified: string;
    twoFactor: string;
    enabled: string;
    disabled: string;
    passwordChanged: string;
    lastSignIn: string;
    personalDetails: string;
    business: string;
    payoutKin: string;
    mobileMoney: string;
    bankAccount: string;
    nextOfKin: string;
    theirPhone: string;
    relationship: string;
    maintainedNote: string;
    anAdministrator: string;
    orCall: string;
  };
  /**
   * The association's own books, read by a member.
   *
   * The hardest section in this file to translate, because most of it has no
   * settled Kinyarwanda equivalent — savings associations here keep their
   * accounts verbally. Where no term exists the phrasing is descriptive rather
   * than a coinage: "amafaranga ihuriro rifite" says what it means to someone
   * who has never read a balance sheet, and a member who does not understand
   * the words on this page is exactly the reader it fails.
   */
  association: {
    title: string;
    description: string;

    pool: string;
    poolHint: string;
    lentOut: string;
    lentOutHint: string;
    lentOutOwed: string;
    borrowed: string;
    borrowedHint: string;
    noBorrowingHint: string;
    surplus: string;
    loss: string;
    surplusHint: string;
    lossHint: string;

    yourStakeTitle: string;
    yourStakeBody: string;
    yourSavings: string;
    yourShare: string;
    yourIndicativeShare: string;
    indicativeNote: string;

    whereTitle: string;
    whereHint: string;
    whereLent: string;
    whereInvested: string;
    whereHeld: string;
    /// The platform's service fee, collected and not yet paid over. Shown on
    /// the members' own page so the association is never seen to be holding
    /// money it has not accounted for.
    whereServiceFee: string;
    booksIncompleteTitle: string;
    booksIncompleteBody: string;

    statementTitle: string;
    statementHint: string;
    earnedTitle: string;
    loanInterest: string;
    loanFees: string;
    penalties: string;
    accountFees: string;
    investmentReturns: string;
    totalEarned: string;
    spentTitle: string;
    memberInterest: string;
    borrowingInterest: string;
    borrowingFees: string;
    totalSpent: string;
    netSurplus: string;
    netLoss: string;

    incomeTrend: string;
    incomeTrendHint: string;
    incomeTrendEmpty: string;

    borrowingsTitle: string;
    borrowingsHint: string;
    noBorrowingsTitle: string;
    noBorrowingsBody: string;
    pledgedTitle: string;
    pledgedBody: string;
    lender: string;
    purpose: string;
    facilityAmount: string;
    repaid: string;
    stillOwed: string;
    interestRate: string;
    nextPayment: string;
    matures: string;
    security: string;
    fundedProjects: string;
    overdueWarning: string;

    investmentsTitle: string;
    investmentsHint: string;
    noInvestmentsTitle: string;
    noInvestmentsBody: string;
    invested: string;
    returnedSoFar: string;
    benefitTitle: string;
    membersBenefited: string;
    paidForBy: string;
    projectsCount: string;

    sourceNote: string;
  };
  /// The store, from the member's side: what is on the shelf, what they have
  /// taken, and what they are paying off.
  warehouse: {
    title: string;
    description: string;

    tabStock: string;
    tabMine: string;
    tabCredit: string;

    // What is on the shelf ---------------------------------------------------
    stockTitle: string;
    stockHint: string;
    itemColumn: string;
    categoryColumn: string;
    priceColumn: string;
    availableColumn: string;
    inStock: string;
    lowStock: string;
    outOfStock: string;
    searchPlaceholder: string;
    allCategories: string;
    stockEmptyTitle: string;
    stockEmptyBody: string;
    askOfficer: string;

    // What I took ------------------------------------------------------------
    mineTitle: string;
    mineHint: string;
    referenceColumn: string;
    dateColumn: string;
    valueColumn: string;
    termsColumn: string;
    statusColumn: string;
    owedColumn: string;
    mineEmptyTitle: string;
    mineEmptyBody: string;
    itemsTaken: string;
    dueBack: string;
    overdueBack: string;
    settledOn: string;

    // Headline figures -------------------------------------------------------
    takenTotal: string;
    takenTotalHint: string;
    owedOutright: string;
    owedOutrightHint: string;
    owedOnCredit: string;
    owedOnCreditHint: string;
    nextPayment: string;
    nextPaymentHint: string;
    nothingDue: string;

    // Credit -----------------------------------------------------------------
    creditTitle: string;
    creditHint: string;
    creditEmptyTitle: string;
    creditEmptyBody: string;
    goodsValue: string;
    interestCharged: string;
    totalToPay: string;
    paidSoFar: string;
    stillOwed: string;
    openedOn: string;
    finishBy: string;
    monthColumn: string;
    dueDateColumn: string;
    amountColumn: string;
    paidColumn: string;
    remainingColumn: string;
    scheduleTitle: string;
    paymentsTitle: string;
    noPaymentsYet: string;
    paidFromSavings: string;
    paidInCash: string;
    towardGoods: string;
    towardInterest: string;
    towardFine: string;

    // Instalment standing ----------------------------------------------------
    statusUpcoming: string;
    statusDue: string;
    statusPartial: string;
    statusPaid: string;
    statusOverdue: string;
    statusWaived: string;
    daysLate: string;
    dueInDays: string;
    dueToday: string;

    // Fines ------------------------------------------------------------------
    fineTitle: string;
    fineBody: string;
    fineOn: string;
    fineWaived: string;
    fineSettled: string;
    finesTotal: string;

    // The rules, restated where they bite ------------------------------------
    rulesTitle: string;
    rulesInterest: string;
    rulesTerm: string;
    rulesFine: string;
    rulesDestination: string;
    readFullRules: string;

    howToPayTitle: string;
    howToPayBody: string;
  };
  security: {
    title: string;
    description: string;
    forcedTitle: string;
    forcedBody: string;
    activeSessions: string;
    sessionsCount: string;
    sessionsWarning: string;
    recentActivity: string;
    successfulSignIn: string;
    failedAttempt: string;
    unknownIp: string;
    warning: string;
  };
}

export const member: Record<Locale, MemberCopy> = {
  en: {
    overview: {
      welcome: "Welcome, {name}",
      lastActivity: "Last activity on your account: {date}",
      firstContribution:
        "Here is your account. Make your first contribution to get started.",
      overdueTitle: "Your loan repayment is overdue",
      overdueBody:
        "Your loan is {days} day past due. Penalties may apply until it is settled.|Your loan is {days} days past due. Penalties may apply until it is settled.",
      makeRepayment: "Make a repayment",
      applicationTitle: "Loan application {reference}",
      applicationBody: "Your request for {amount} is {status}.",
      viewDetails: "View details",
      savingsBalance: "Savings balance",
      availableHint: "Available: {amount}",
      activeLoan: "Active loan",
      noLoanRunning: "No loan currently running",
      outstandingLoan: "Outstanding loan",
      repaidPercent: "{percent}% repaid",
      nothingOwed: "Nothing owed",
      nextRepayment: "Next repayment",
      dueOn: "Due {date}",
      dueInDays: "in {days} day|in {days} days",
      noRepaymentScheduled: "No repayment scheduled",
      quickActions: "Quick actions",
      makeDeposit: "Make a deposit",
      requestWithdrawal: "Request withdrawal",
      applyLoan: "Apply for a loan",
      savingsGrowth: "Savings growth",
      savingsGrowthHint: "Closing balance at the end of each month",
      savingsGrowthEmpty:
        "Your savings growth will appear here after your first contribution.",
      contributions: "Monthly contributions",
      contributionsHint: "Deposits and withdrawals over the last 12 months",
      contributionsEmpty:
        "Contribution history will appear here once you start saving.",
      repaymentProgress: "Loan repayment progress",
      totalPayableHint: "{amount} total payable",
      recentTransactions: "Recent transactions",
      noTransactions: "No transactions yet",
      noTransactionsHint:
        "Make your first contribution using payment reference {reference} and it will appear here.",
      noAccountTitle: "No savings account yet",
      noAccountBody:
        "Your membership is active but no savings account has been opened. Please contact your association administrator.",
    },
    savings: {
      title: "My savings",
      accountOpened: "Account {number} · opened {date}",
      statement: "Statement",
      deposit: "Deposit",
      currentBalance: "Current balance",
      transactionCount: "{count} transaction|{count} transactions",
      available: "Available",
      pledged: "{amount} pledged",
      nothingPledged: "Nothing pledged",
      totalContributed: "Total contributed",
      lifetimeDeposits: "Lifetime deposits",
      totalWithdrawn: "Total withdrawn",
      lifetimeWithdrawals: "Lifetime withdrawals",
      pledgedNotice:
        "of your balance is pledged against an active loan or a pending withdrawal, so it cannot be withdrawn until that is settled.",
      tileDeposit: "Make a deposit",
      tileDepositHint: "How to pay, and your reference",
      tileWithdraw: "Request a withdrawal",
      tileWithdrawHint: "Subject to association approval",
      tileTransactions: "All transactions",
      tileTransactionsHint: "Search and filter your history",
      recentActivity: "Recent activity",
      noTransactionsQuote: "No transactions yet. Quote reference",
      noAccountTitle: "No savings account",
      noAccountBody:
        "No savings account has been opened for your membership yet. Please contact your association administrator.",
    },
    deposit: {
      title: "Make a deposit",
      description: "How to send money to your savings account.",
      alwaysQuoteTitle: "Always quote your reference",
      alwaysQuoteBody:
        "cannot be matched to you automatically. It will be held until an administrator identifies it by hand, which delays your balance updating.",
      bankTransfer: "Bank transfer",
      bank: "Bank",
      accountName: "Account name",
      accountNumber: "Account number",
      branchCode: "Branch code",
      referenceToQuote: "Reference to quote",
      noAccountPublished:
        "The association has not yet published its collection account details. Please contact the office",
      noAccountPhone: "on {phone}",
      noAccountQuote: "for payment instructions, and quote",
      mobileMoney: "Mobile money",
      mobileMoneyBody:
        "in the reason or reference field. Payments are collected from the association's bank account and matched automatically — your balance normally updates within 15 minutes of the money arriving.",
      contributionRules: "Contribution rules",
      minimumDeposit: "Minimum deposit",
      monthlyContribution: "Expected monthly contribution",
      dueEachMonth: "Due each month by",
      day: "Day {day}",
    },
    transactions: {
      title: "Transactions",
      description: "Every movement on your savings account, newest first.",
      matching: "Matching transactions",
      totalIn: "Total in",
      totalOut: "Total out",
      balanceAfter: "Balance after",
      noneFoundTitle: "No transactions found",
      noneFoundBody:
        "No transactions match these filters. Try widening the date range or clearing the search.",
    },
    loans: {
      title: "My loans",
      description:
        "Your loan applications, active loans and repayment schedules.",
      applyAction: "Apply for a loan",
      noneTitle: "No loans yet",
      noneBody:
        "You have not applied for a loan. How much you can borrow depends on your savings balance and how long you have been a member.",
      applications: "Applications",
      submittedOn: "submitted {date}",
      purpose: "Purpose:",
      needMoreInformation: "The association needs more information:",
      notApproved: "Not approved:",
      approvedFor: "Approved for",
      approvedBody: ". You will be notified when the funds are disbursed.",
      disbursedOn: "disbursed {date}",
      overdueAmount:
        "{amount} is {days} day overdue.|{amount} is {days} days overdue.",
      penaltiesMayApply: "Penalties may be applied until it is settled.",
      interestRate: "Interest rate",
      perYear: "p.a.",
      totalPayable: "Total payable",
      repaid: "Repaid",
      outstanding: "Outstanding",
      schedule: "Repayment schedule",
      dueDate: "Due date",
      principal: "Principal",
      interest: "Interest",
      fees: "Fees",
      totalDue: "Total due",
      paid: "Paid",
      remaining: "Remaining",
    },
    apply: {
      title: "Apply for a loan",
      description: "Choose a product, then tell us how much you need and what for.",
      noProductsTitle: "No loan products available",
      noProductsBody:
        "The association has not published any loan products yet. Please check back later or contact the office.",
      activeLoanTitle: "You already have an active loan",
      activeLoanBody:
        "This association allows one loan at a time. You can apply again once your current loan is fully repaid.",
      viewMyLoan: "View my loan",

      freqDAILY: "Daily",
      freqWEEKLY: "Weekly",
      freqBIWEEKLY: "Every two weeks",
      freqMONTHLY: "Monthly",
      freqQUARTERLY: "Quarterly",

      productLabel: "Loan product",
      productOption: "{name} — {rate}% a month",
      monthsCount: "{count} month|{count} months",
      amountLabel: "Amount you need",
      amountHint:
        "Up to {amount} on your own savings, with nobody else involved. You may ask for more if other members guarantee the rest.",
      amountTooSmall: "The smallest loan under {product} is {amount}",
      amountTooLarge:
        "Based on your savings of {savings}, you can borrow up to {amount}",
      termLabel: "Repayment period (months)",
      termHint: "Up to {max} months. There is no extension.",
      termIssue:
        "Loans are repaid within {max} months, so choose {max} months or fewer",
      collateralTitle: "Or pledge items for the rest",
      collateralIntro:
        "If your guarantors cannot cover the remaining {uncovered}, you may pledge items worth {required} for it instead. The committee checks them before approval.",
      collateralDescriptionLabel: "What are you pledging?",
      collateralDescriptionHint:
        "Machines, materials, equipment or any property the committee accepts",
      collateralValueLabel: "What is it worth?",
      collateralValueHint: "The committee will verify this before approval",
      collateralSatisfied: "The collateral you have pledged covers this.",
      frequencyLabel: "Repayment frequency",
      purposeLabel: "What is the loan for?",
      purposeHint: "Be specific — it helps the review committee decide",
      purposePlaceholder:
        "e.g. Buy two industrial sewing machines to take on school uniform contracts",
      guarantorsTitle: "Guarantors",
      guarantorsIntro:
        "You can borrow {own} on your own savings. The other {above} comes from other members' savings, so members must guarantee it. Name one or more members and how much each covers. Together they must cover {above}.",
      guarantorNumber: "Guarantor {number}",
      guarantorRemove: "Remove",
      guarantorChange: "Change",
      guarantorLookupLabel: "Their member number or phone",
      guarantorLookupPlaceholder: "e.g. 0788 123 456",
      guarantorFind: "Find",
      guarantorNotFound:
        "No active member has that member number or phone number.",
      guarantorDuplicate: "This member is already one of your guarantors.",
      guarantorAmountLabel: "Amount they cover",
      guarantorAdd: "Add a guarantor",
      guarantorsCovered: "Guarantors cover {covered} of {above}",
      guarantorsRemaining: "{remaining} still to cover",
      guarantorsComplete: "Fully covered",
      guarantorsOver:
        "Your guarantors cover {over} more than is needed. Lower their amounts so nobody's savings are held for more than the loan needs.",
      guarantorIncomplete:
        "Find each guarantor and enter the amount they cover, or remove the row.",
      guarantorsHowItWorks:
        "Each guarantor must be a member who has saved the amount. They accept on their own account page, and from then on that amount is held from their savings. You repay the loan. When it is fully repaid, their money is released back to them.",
      submitApplication: "Submit application",
      submitFailed: "Could not submit your application",
      ineligibleTitle: "You are not eligible for this loan",
      successTitle: "Application submitted",
      successBody:
        "Your loan application {reference} has been received. You will be notified once it has been reviewed.",
      trackIt: "Track it here",

      previewTitle: "What you would repay",
      previewEmpty:
        "Enter an amount and a repayment period to see your schedule.",
      lineLoanAmount: "Loan amount",
      lineYouReceive: "You receive",
      lineInterest: "Interest ({rate}% a month)",
      lineInterestBack: "Of which comes back to you",
      lineNetCost: "What the loan actually costs you",
      lineTotalRepay: "Total to repay",
      paymentLabel: "{frequency} payment",
      paymentsCount: "{count} payments · first due {date}",
      previewNote:
        "There is no processing or insurance fee, so you receive the full amount. Half the interest is credited back into your savings as you repay. Final terms are confirmed on approval.",
    },
    repayments: {
      title: "Repayments",
      description:
        "Your repayment schedule and everything you have paid so far.",
      noLoansTitle: "You have no active loans",
      noLoansBody:
        "Once a loan is disbursed to you, its repayment schedule will appear here.",
      applyAction: "Apply for a loan",
      arrearsTitle: "You have overdue repayments",
      arrearsBody:
        "{amount} is past its due date. Penalties may continue to accrue until it is settled.",
      totalOutstanding: "Total outstanding",
      acrossLoans: "Across {count} loan|Across {count} loans",
      nextInstalment: "Next instalment",
      dueOn: "Due {date}",
      nothingScheduled: "Nothing scheduled",
      inArrears: "In arrears",
      settleSoon: "Settle as soon as possible",
      upToDate: "You are up to date",
      schedule: "Repayment schedule",
      loan: "Loan",
      instalment: "Instalment",
      daysLate: "{days} day late|{days} days late",
      noSchedule:
        "No schedule has been generated yet. It is created when the loan is disbursed.",
      received: "Repayments received",
      penalty: "Penalty",
      balanceAfter: "Balance after",
      noneReceived: "No repayments have been posted yet.",
      matchingNote:
        "Repayments are matched automatically when you pay using your payment reference {reference}. Allow up to one working day for a payment to appear here.",
    },
    withdrawals: {
      title: "Withdrawals",
      description: "Request money from your savings and track approval.",
      suspendedTitle: "Withdrawals are not currently available",
      suspendedBody:
        "The association has suspended withdrawals. Please contact the office if you need assistance.",
      yourRequests: "Your requests",
      requested: "Requested",
      fee: "Fee",
      youReceive: "You receive",
      noneYet: "You have not requested any withdrawals.",
      reviewNote:
        "Withdrawals are reviewed by the association before payout. Money leaves your balance only once the payout has actually been made.",

      formTitle: "Request a withdrawal",
      availableNow: "You can withdraw up to {amount} right now.",
      hintMin: "Minimum {min}",
      hintMinMax: "Minimum {min} · maximum {max}",
      payoutMethod: "Payout method",
      methodMobileMoney: "Mobile money",
      methodBank: "Bank transfer",
      methodCash: "Cash at the office",
      mobileNumber: "Mobile money number",
      bankAccount: "Bank account",
      destinationHint: "Leave blank to use the details on your profile",
      accountNumberPlaceholder: "Account number",
      reasonLabel: "Reason (optional)",
      reasonPlaceholder: "What is the withdrawal for?",
      amountRequested: "Amount requested",
      withdrawalFee: "Withdrawal fee",
      deductedFromBalance: "Deducted from your balance",
      errExceedsAvailable: "This exceeds your available balance of {amount}.",
      errBelowMinimum: "The minimum withdrawal is {amount}.",
      errAboveMaximum: "The maximum withdrawal is {amount}.",
      errMinimumBalance: "You must keep at least {amount} in your account.",
      submitRequest: "Submit request",
      approvalNote:
        "Requests are reviewed by the association. Your balance is only reduced once the payout has been made.",
      submitFailed: "Could not submit your request",
      successTitle: "Withdrawal request submitted",
      successReference: "Reference {reference}.",
      successUnderReview: "An administrator will review it shortly.",
      successPayingOut: "It will be paid out shortly.",
      makeAnother: "Make another request",
    },
    statements: {
      title: "Statements",
      description:
        "Download a statement of your savings account for any period.",
      ledgerNote:
        "Statements are produced directly from the association's transaction ledger. Every entry shows its reference and the running balance after it, so the document reconciles line by line.",
      formatNote:
        "Choose PDF to open a printable statement — use your browser's print dialog and select “Save as PDF”. Choose CSV to open the data in Excel.",
    },
    notifications: {
      title: "Notifications",
      unread: "{count} unread",
      upToDate: "You are up to date.",
      noneTitle: "No notifications",
      noneBody:
        "Payment confirmations, loan updates and reminders will appear here.",
      unreadLabel: "Unread",
      justNow: "just now",
      minutesAgo: "{count}m ago",
      hoursAgo: "{count}h ago",
      daysAgo: "{count}d ago",
    },
    profile: {
      title: "Profile",
      description:
        "Your membership details as they are held by the association.",
      changePassword: "Change password",
      incompleteTitle: "Your contact details are incomplete",
      incompleteBody:
        "The association uses your phone and email to notify you about payments, loan decisions and withdrawals. Add them on your details page.",
      yourReference: "Your payment reference",
      yourReferenceBody:
        "Quote this on every deposit so it is credited to your account automatically. A payment without it has to be matched by hand and will take longer to appear.",
      membership: "Membership",
      memberNumber: "Member number",
      identityCheck: "Identity check",
      association: "Association",
      joined: "Joined",
      approvedOn: "Approved",
      contactSecurity: "Contact and security",
      emailVerified: "Email verified",
      phoneVerified: "Phone verified",
      notVerified: "Not verified",
      twoFactor: "Two-factor",
      enabled: "Enabled",
      disabled: "Disabled",
      passwordChanged: "Password changed",
      lastSignIn: "Last sign-in",
      personalDetails: "Personal details",
      business: "Business",
      payoutKin: "Payout and next of kin",
      mobileMoney: "Mobile money",
      bankAccount: "Bank account",
      nextOfKin: "Next of kin",
      theirPhone: "Their phone",
      relationship: "Relationship",
      maintainedNote:
        "Your membership number, payment reference and membership status are set by the association and are not editable here. To correct one of those, contact",
      anAdministrator: "an administrator",
      orCall: "or call {phone}",
    },
    association: {
      title: "Our association's money",
      description:
        "Everything the association holds, owes and has earned. The same figures the committee sees.",

      pool: "Members' savings",
      poolHint: "Saved by {count} members",
      lentOut: "Lent to members",
      lentOutHint: "Across {count} running loans",
      lentOutOwed: "{amount} owed once interest is added",
      borrowed: "Borrowed from lenders",
      borrowedHint: "Across {count} facilities",
      noBorrowingHint: "The association has no debt",
      surplus: "Surplus earned",
      loss: "Loss so far",
      surplusHint: "Since the association started",
      lossHint: "Costs have exceeded income so far",

      yourStakeTitle: "Your part in this",
      yourStakeBody:
        "Your savings are {percent}% of everything members have put in.",
      yourSavings: "Your savings",
      yourShare: "Your share of the pool",
      yourIndicativeShare: "Your share of the surplus",
      indicativeNote:
        "This is an indication, not money you can withdraw. A surplus becomes yours only when the general meeting resolves to share it out.",

      whereTitle: "Where the money is",
      whereHint:
        "What members saved, plus what the association borrowed, less what has gone out.",
      whereLent: "Out on loan to members",
      whereInvested: "Put into projects",
      whereHeld: "Not yet lent out or invested",
      whereServiceFee: "Service fee held for the platform",
      booksIncompleteTitle: "These figures do not balance",
      booksIncompleteBody:
        "More has been lent out and invested than the records account for. Ask the committee to check that every loan, project and bank facility has been entered.",

      statementTitle: "How the surplus was earned",
      statementHint:
        "Money actually received and actually paid — not what is still owed.",
      earnedTitle: "What came in",
      loanInterest: "Interest on member loans",
      loanFees: "Loan fees",
      penalties: "Late-payment penalties",
      accountFees: "Account fees",
      investmentReturns: "Returns from projects",
      totalEarned: "Total earned",
      spentTitle: "What it cost",
      memberInterest: "Interest paid to members",
      borrowingInterest: "Interest paid to lenders",
      borrowingFees: "Lender fees",
      totalSpent: "Total cost",
      netSurplus: "Surplus",
      netLoss: "Loss",

      incomeTrend: "What lending earned",
      incomeTrendHint: "Interest, fees and penalties received each month",
      incomeTrendEmpty:
        "Nothing yet. This fills in as members repay their loans.",

      borrowingsTitle: "Money the association borrowed",
      borrowingsHint:
        "Loans taken from a bank or other lender to back the members' savings.",
      noBorrowingsTitle: "The association owes nothing",
      noBorrowingsBody:
        "Everything the association lends and invests comes from members' own savings. If it ever borrows, the facility will appear here.",
      pledgedTitle: "{percent}% of your savings is pledged",
      pledgedBody:
        "The association's borrowing equals {percent}% of everything members have saved. That security is what the lender can claim if the association cannot repay.",
      lender: "Lender",
      purpose: "What it is for",
      facilityAmount: "Borrowed",
      repaid: "Repaid so far",
      stillOwed: "Still owed",
      interestRate: "Interest",
      nextPayment: "Next payment",
      matures: "Final payment",
      security: "Security given",
      fundedProjects: "This paid for",
      overdueWarning: "This facility is {days} day late.|This facility is {days} days late.",

      investmentsTitle: "What our money did",
      investmentsHint:
        "What the association put money into, and what members got out of it.",
      noInvestmentsTitle: "Nothing recorded yet",
      noInvestmentsBody:
        "When the association buys equipment, rents a workshop or funds training, it will be listed here with what it cost and who it helped.",
      invested: "Put in",
      returnedSoFar: "Brought back so far",
      benefitTitle: "What members get from it",
      membersBenefited: "{count} member helped|{count} members helped",
      paidForBy: "Paid for with {source}",
      projectsCount: "{count} project|{count} projects",

      sourceNote:
        "Every figure on this page is added up from the association's own records of payments, loans and repayments. Nothing here is an estimate. If something looks wrong, raise it with the committee — and it will be visible in the audit log.",
    },
    warehouse: {
      title: "The warehouse",
      description:
        "What the association has in the store, what you have taken from it, and what you still owe for it.",

      tabStock: "In the store",
      tabMine: "What I took",
      tabCredit: "Paying off",

      stockTitle: "On the shelf today",
      stockHint:
        "The association buys fabric, thread and machines in bulk so members pay less than they would in the market. These are the prices you would be charged.",
      itemColumn: "Item",
      categoryColumn: "Kind",
      priceColumn: "Price",
      availableColumn: "Available",
      inStock: "In stock",
      lowStock: "Running low",
      outOfStock: "Out of stock",
      searchPlaceholder: "Search the store",
      allCategories: "Everything",
      stockEmptyTitle: "The store is empty",
      stockEmptyBody:
        "Nothing has been stocked yet. When the association buys in fabric or machines, they will be listed here with their prices.",
      askOfficer:
        "To take something, speak to the storekeeper. They record it against your name, and it appears here the same day.",

      mineTitle: "What you have taken",
      mineHint:
        "Every issue on your file, newest first — including anything you were given free or lent for a job.",
      referenceColumn: "Reference",
      dateColumn: "Taken on",
      valueColumn: "Value",
      termsColumn: "Terms",
      statusColumn: "Standing",
      owedColumn: "Still owed",
      mineEmptyTitle: "You have not taken anything from the store",
      mineEmptyBody:
        "When you collect fabric, thread or a machine, it is recorded against your name and appears here with what it cost.",
      itemsTaken: "{count} item|{count} items",
      dueBack: "Due back {date}",
      overdueBack: "Should have been returned {date}",
      settledOn: "Paid on {date}",

      takenTotal: "Taken from the store",
      takenTotalHint: "Everything ever issued to you, at the value on the day",
      owedOutright: "Owed outright",
      owedOutrightHint: "Goods you took and have not yet paid for",
      owedOnCredit: "Owed on credit",
      owedOnCreditHint: "Instalments, interest and any fine still to pay",
      nextPayment: "Next payment",
      nextPaymentHint: "The soonest instalment still owed",
      nothingDue: "Nothing due",

      creditTitle: "Goods you are paying off",
      creditHint:
        "Anything you took without paying that day is repaid over three months. Each month shows what is owed and by when.",
      creditEmptyTitle: "You are not paying anything off",
      creditEmptyBody:
        "When you take goods on credit, the three monthly payments appear here with their dates the same day.",
      goodsValue: "Value of the goods",
      interestCharged: "Interest (2% once)",
      totalToPay: "Total to pay",
      paidSoFar: "Paid so far",
      stillOwed: "Still owed",
      openedOn: "Taken on {date}",
      finishBy: "To be finished by {date}",
      monthColumn: "Month",
      dueDateColumn: "Due",
      amountColumn: "To pay",
      paidColumn: "Paid",
      remainingColumn: "Left",
      scheduleTitle: "Your three payments",
      paymentsTitle: "What you have paid",
      noPaymentsYet: "Nothing paid on this yet.",
      paidFromSavings: "From your savings",
      paidInCash: "In cash",
      towardGoods: "goods",
      towardInterest: "interest",
      towardFine: "fine",

      statusUpcoming: "Not yet due",
      statusDue: "Due",
      statusPartial: "Part paid",
      statusPaid: "Paid",
      statusOverdue: "Late",
      statusWaived: "Waived",
      daysLate: "{count} day late|{count} days late",
      dueInDays: "Due in {count} day|Due in {count} days",
      dueToday: "Due today",

      fineTitle: "A fine was added for a missed month",
      fineBody:
        "You were charged {amount} — {rate}% of the {arrears} still unpaid on that month. Paying it clears the fine first, then the interest, then the goods.",
      fineOn: "Fine on month {number}",
      fineWaived: "Forgiven",
      fineSettled: "Fine paid",
      finesTotal: "Fines",

      rulesTitle: "The rules on buying from the store",
      rulesInterest: "2% is added once, for the whole three months — not monthly.",
      rulesTerm: "Paid in {count} equal monthly payments, starting a month after you take the goods.",
      rulesFine: "Miss a month and {rate}% of what is still owed on that month is added as a fine.",
      rulesDestination:
        "This interest goes to the association alone. Unlike a cash loan, none of it comes back into your savings.",
      readFullRules: "Read the full rules",

      howToPayTitle: "How to pay",
      howToPayBody:
        "Pay the storekeeper in cash, or ask for it to be taken from your savings. Either way it is recorded here the same day, and it always pays the oldest month first.",
    },
    security: {
      title: "Security & password",
      description: "Change your password and review recent sign-in activity.",
      forcedTitle: "You must change your password",
      forcedBody:
        "This account was created with a temporary password. Choose a new one before continuing.",
      activeSessions: "Active sessions",
      sessionsCount:
        "You are signed in on {count} device.|You are signed in on {count} devices.",
      sessionsWarning:
        "Changing your password signs out every other device immediately.",
      recentActivity: "Recent sign-in activity",
      successfulSignIn: "Successful sign-in",
      failedAttempt: "Failed attempt",
      unknownIp: "unknown IP",
      warning:
        "If you see a sign-in you do not recognise, change your password immediately and contact your association administrator.",
    },
  },

  rw: {
    overview: {
      welcome: "Murakaza neza, {name}",
      lastActivity: "Igikorwa giheruka kuri konti yawe: {date}",
      firstContribution:
        "Iyi ni konti yawe. Tanga umusanzu wawe wa mbere kugira ngo utangire.",
      overdueTitle: "Ubwishyu bw'inguzanyo yawe burengeje igihe",
      overdueBody:
        "Inguzanyo yawe irengeje umunsi {days}. Ihazabu ishobora gukurikiranwa kugeza yishyuwe.|Inguzanyo yawe irengeje iminsi {days}. Ihazabu ishobora gukurikiranwa kugeza yishyuwe.",
      makeRepayment: "Ishyura",
      applicationTitle: "Ubusabe bw'inguzanyo {reference}",
      applicationBody: "Ubusabe bwawe bwa {amount} ni {status}.",
      viewDetails: "Reba ibisobanuro",
      savingsBalance: "Amafaranga y'ubuzigame",
      availableHint: "Ashobora gukoreshwa: {amount}",
      activeLoan: "Inguzanyo iriho",
      noLoanRunning: "Nta nguzanyo iriho ubu",
      outstandingLoan: "Inguzanyo isigaye",
      repaidPercent: "{percent}% byishyuwe",
      nothingOwed: "Nta mwenda uhari",
      nextRepayment: "Ubwishyu bukurikira",
      dueOn: "Bugomba kwishyurwa {date}",
      dueInDays: "mu munsi umwe|mu minsi {days}",
      noRepaymentScheduled: "Nta bwishyu buteganyijwe",
      quickActions: "Ibikorwa byihuse",
      makeDeposit: "Bitsa amafaranga",
      requestWithdrawal: "Saba kubikuza",
      applyLoan: "Saba inguzanyo",
      savingsGrowth: "Ukwiyongera k'ubuzigame",
      savingsGrowthHint: "Amafaranga asigaye ku mpera za buri kwezi",
      savingsGrowthEmpty:
        "Ukwiyongera k'ubuzigame bwawe bizagaragara hano nyuma y'umusanzu wawe wa mbere.",
      contributions: "Imisanzu ya buri kwezi",
      contributionsHint: "Ubwitso n'ubwikuze mu mezi 12 ashize",
      contributionsEmpty:
        "Amateka y'imisanzu azagaragara hano nyuma yo gutangira kuzigama.",
      repaymentProgress: "Aho ubwishyu bw'inguzanyo bugeze",
      totalPayableHint: "{amount} agomba kwishyurwa yose",
      recentTransactions: "Ibikorwa biherutse",
      noTransactions: "Nta gikorwa kirakorwa",
      noTransactionsHint:
        "Tanga umusanzu wawe wa mbere ukoresheje nimero y'ubwishyu {reference}, uzagaragara hano.",
      noAccountTitle: "Nta konti y'ubuzigame irahafungurwa",
      noAccountBody:
        "Ubunyamuryango bwawe burakora ariko nta konti y'ubuzigame irafungurwa. Vugana n'umuyobozi w'ihuriro.",
    },
    savings: {
      title: "Ubuzigame bwanjye",
      accountOpened: "Konti {number} · yafunguwe {date}",
      statement: "Inyandiko ya konti",
      deposit: "Bitsa",
      currentBalance: "Amafaranga ari kuri konti",
      transactionCount: "Igikorwa {count}|Ibikorwa {count}",
      available: "Ashobora gukoreshwa",
      pledged: "{amount} yafatiriwe",
      nothingPledged: "Nta yafatiriwe",
      totalContributed: "Amafaranga yose yatanzwe",
      lifetimeDeposits: "Ubwitso bwose bwakozwe",
      totalWithdrawn: "Amafaranga yose yabikujwe",
      lifetimeWithdrawals: "Ubwikuze bwose bwakozwe",
      pledgedNotice:
        "ku mafaranga yawe yafatiriwe kubera inguzanyo iriho cyangwa ubusabe bwo kubikuza butegereje, ku buryo adashobora kubikuzwa kugeza ibyo birangiye.",
      tileDeposit: "Bitsa amafaranga",
      tileDepositHint: "Uko wishyura, na nimero yawe",
      tileWithdraw: "Saba kubikuza",
      tileWithdrawHint: "Bisaba kwemezwa n'ihuriro",
      tileTransactions: "Ibikorwa byose",
      tileTransactionsHint: "Shakisha kandi ushungure amateka yawe",
      recentActivity: "Ibikorwa biherutse",
      noTransactionsQuote: "Nta gikorwa kirakorwa. Andika nimero",
      noAccountTitle: "Nta konti y'ubuzigame",
      noAccountBody:
        "Nta konti y'ubuzigame irafungurwa ku bunyamuryango bwawe. Vugana n'umuyobozi w'ihuriro.",
    },
    deposit: {
      title: "Bitsa amafaranga",
      description: "Uko wohereza amafaranga kuri konti yawe y'ubuzigame.",
      alwaysQuoteTitle: "Buri gihe andika nimero yawe y'ubwishyu",
      alwaysQuoteBody:
        "ntibashobora guhuzwa nawe byikora. Bizabikwa kugeza umuyobozi abimenye n'intoki, bituma amafaranga yawe atinda kugaragara.",
      bankTransfer: "Kohereza kuri banki",
      bank: "Banki",
      accountName: "Izina rya konti",
      accountNumber: "Nimero ya konti",
      branchCode: "Kode y'ishami",
      referenceToQuote: "Nimero ugomba kwandika",
      noAccountPublished:
        "Ihuriro ntiratangaza amakuru ya konti yakira amafaranga. Vugana n'ibiro",
      noAccountPhone: "kuri {phone}",
      noAccountQuote: "kubona amabwiriza y'ubwishyu, kandi wandike",
      mobileMoney: "Mobile money",
      mobileMoneyBody:
        "mu mwanya w'impamvu cyangwa wa nimero y'ubwishyu. Amafaranga akurwa kuri konti ya banki y'ihuriro kandi ahuzwa byikora — amafaranga yawe akunda kugaragara mu minota 15 nyuma yo kugera.",
      contributionRules: "Amabwiriza y'imisanzu",
      minimumDeposit: "Ubwitso buto ntarengwa",
      monthlyContribution: "Umusanzu w'ukwezi witezwe",
      dueEachMonth: "Bugomba kwishyurwa buri kwezi bitarenze",
      day: "Umunsi wa {day}",
    },
    transactions: {
      title: "Ibikorwa",
      description:
        "Ibikorwa byose byakozwe kuri konti yawe y'ubuzigame, bishya mbere.",
      matching: "Ibikorwa bihuye",
      totalIn: "Ayinjiye yose",
      totalOut: "Ayasohotse yose",
      balanceAfter: "Amafaranga asigaye",
      noneFoundTitle: "Nta gikorwa cyabonetse",
      noneFoundBody:
        "Nta gikorwa gihuye n'ibyo washungurishije. Gerageza wagure igihe cyangwa usibe ibyo washakishije.",
    },
    loans: {
      title: "Inguzanyo zanjye",
      description:
        "Ubusabe bwawe bw'inguzanyo, inguzanyo ziriho na gahunda y'ubwishyu.",
      applyAction: "Saba inguzanyo",
      noneTitle: "Nta nguzanyo irahari",
      noneBody:
        "Ntiwasabye inguzanyo. Amafaranga ushobora kuguza bishingira ku buzigame bwawe n'igihe umaze mu ihuriro.",
      applications: "Ubusabe",
      submittedOn: "bwatanzwe {date}",
      purpose: "Impamvu:",
      needMoreInformation: "Ihuriro rikeneye andi makuru:",
      notApproved: "Ntibyemewe:",
      approvedFor: "Byemewe kuri",
      approvedBody: ". Uzamenyeshwa igihe amafaranga azoherezwa.",
      disbursedOn: "yatanzwe {date}",
      overdueAmount:
        "{amount} yarengeje umunsi {days}.|{amount} yarengeje iminsi {days}.",
      penaltiesMayApply:
        "Ihazabu ishobora gushyirwaho kugeza byishyuwe.",
      interestRate: "Inyungu",
      perYear: "ku mwaka",
      totalPayable: "Yose agomba kwishyurwa",
      repaid: "Yishyuwe",
      outstanding: "Asigaye",
      schedule: "Gahunda y'ubwishyu",
      dueDate: "Itariki ntarengwa",
      principal: "Umwenda w'ibanze",
      interest: "Inyungu",
      fees: "Amafaranga y'ikiguzi",
      totalDue: "Yose agomba kwishyurwa",
      paid: "Yishyuwe",
      remaining: "Asigaye",
    },
    apply: {
      title: "Saba inguzanyo",
      description:
        "Hitamo ubwoko bw'inguzanyo, hanyuma utubwire amafaranga ukeneye n'icyo uzayakoresha.",
      noProductsTitle: "Nta bwoko bw'inguzanyo buhari",
      noProductsBody:
        "Ihuriro ntiratangaza ubwoko bw'inguzanyo. Ongera ugaruke cyangwa uvugane n'ibiro.",
      activeLoanTitle: "Usanzwe ufite inguzanyo iriho",
      activeLoanBody:
        "Iri huriro ryemera inguzanyo imwe icyarimwe. Uzashobora kongera gusaba nyuma yo kwishyura inguzanyo yawe yose.",
      viewMyLoan: "Reba inguzanyo yanjye",

      freqDAILY: "Buri munsi",
      freqWEEKLY: "Buri cyumweru",
      freqBIWEEKLY: "Buri byumweru bibiri",
      freqMONTHLY: "Buri kwezi",
      freqQUARTERLY: "Buri mezi atatu",

      productLabel: "Ubwoko bw'inguzanyo",
      productOption: "{name} — {rate}% ku kwezi",
      monthsCount: "ukwezi {count}|amezi {count}",
      amountLabel: "Amafaranga ukeneye",
      amountHint:
        "Kugeza kuri {amount} ku buzigame bwawe, nta wundi muntu ubigizemo uruhare. Ushobora gusaba menshi niba abandi banyamuryango bishingiye asigaye.",
      amountTooSmall: "Inguzanyo ntoya ishoboka muri {product} ni {amount}",
      amountTooLarge:
        "Ukurikije ubuzigame bwawe bwa {savings}, ushobora kuguza kugeza kuri {amount}",
      termLabel: "Igihe cyo kwishyura (amezi)",
      termHint: "Kugeza ku mezi {max}. Nta kongererwa igihe.",
      termIssue:
        "Inguzanyo yishyurwa mu mezi {max}, bityo hitamo amezi {max} cyangwa macye",
      collateralTitle: "Cyangwa utange ingwate y'ibintu ku gisigaye",
      collateralIntro:
        "Niba abishingizi bawe badashoboye kwishingira {uncovered} isigaye, ushobora gutanga ingwate y'ibintu bifite agaciro ka {required} mu mwanya wabo. Komite ibigenzura mbere yo kwemeza.",
      collateralDescriptionLabel: "Ni iki ushyiraho ingwate?",
      collateralDescriptionHint:
        "Imashini, ibikoresho, cyangwa undi mutungo komite yemera",
      collateralValueLabel: "Bifite agaciro kangahe?",
      collateralValueHint: "Komite izabigenzura mbere yo kwemeza",
      collateralSatisfied: "Ingwate washyizeho irahagije.",
      frequencyLabel: "Uko kwishyura bisubirwamo",
      purposeLabel: "Iyi nguzanyo igenewe iki?",
      purposeHint: "Sobanura neza — bifasha komite isuzuma gufata icyemezo",
      purposePlaceholder:
        "urugero: Kugura imashini ebyiri z'uruganda zidoda kugira ngo mfate amasoko y'imyenda y'ishuri",
      guarantorsTitle: "Abishingizi",
      guarantorsIntro:
        "Ushobora kuguza {own} ku buzigame bwawe. Andi {above} ava mu buzigame bw'abandi banyamuryango, bityo abanyamuryango bagomba kuyishingira. Vuga umunyamuryango umwe cyangwa benshi n'amafaranga buri wese yishingira. Bose hamwe bagomba kwishingira {above}.",
      guarantorNumber: "Umwishingizi wa {number}",
      guarantorRemove: "Kuramo",
      guarantorChange: "Hindura",
      guarantorLookupLabel: "Nimero ye y'umunyamuryango cyangwa telefone",
      guarantorLookupPlaceholder: "urugero: 0788 123 456",
      guarantorFind: "Shakisha",
      guarantorNotFound:
        "Nta munyamuryango ukora ufite iyo nimero y'umunyamuryango cyangwa iyo telefone.",
      guarantorDuplicate: "Uyu munyamuryango asanzwe ari umwe mu bishingizi bawe.",
      guarantorAmountLabel: "Amafaranga yishingira",
      guarantorAdd: "Ongeraho umwishingizi",
      guarantorsCovered: "Abishingizi bishingira {covered} kuri {above}",
      guarantorsRemaining: "Hasigaye {remaining}",
      guarantorsComplete: "Byishingiwe byose",
      guarantorsOver:
        "Abishingizi bawe barengeje ibikenewe ho {over}. Gabanya amafaranga yabo kugira ngo nta buzigame bw'umuntu bufatirwa kurenza ibyo inguzanyo ikeneye.",
      guarantorIncomplete:
        "Shakisha buri mwishingizi kandi wandike amafaranga yishingira, cyangwa ukureho uwo murongo.",
      guarantorsHowItWorks:
        "Buri mwishingizi agomba kuba umunyamuryango wazigamye ayo mafaranga. Abyemera kuri paji ya konti ye, kandi kuva ubwo ayo mafaranga afatirwa ku buzigame bwe. Ni wowe wishyura inguzanyo. Iyo imaze kwishyurwa yose, amafaranga ye aramusubizwa.",
      submitApplication: "Ohereza ubusabe",
      submitFailed: "Ntibyashobotse kohereza ubusabe bwawe",
      ineligibleTitle: "Ntabwo wujuje ibisabwa kuri iyi nguzanyo",
      successTitle: "Ubusabe bwoherejwe",
      successBody:
        "Ubusabe bwawe bw'inguzanyo {reference} bwakiriwe. Uzamenyeshwa igihe buzaba bumaze gusuzumwa.",
      trackIt: "Bukurikirane hano",

      previewTitle: "Ibyo wakwishyura",
      previewEmpty:
        "Andika amafaranga n'igihe cyo kwishyura kugira ngo urebe gahunda yawe.",
      lineLoanAmount: "Amafaranga y'inguzanyo",
      lineYouReceive: "Uzahabwa",
      lineInterest: "Inyungu ({rate}% ku kwezi)",
      lineInterestBack: "Muri yo, igarukira wowe",
      lineNetCost: "Icyo inguzanyo ikugusaba by'ukuri",
      lineTotalRepay: "Igiteranyo cyo kwishyura",
      paymentLabel: "Ubwishyu {frequency}",
      paymentsCount: "ubwishyu {count} · ubwa mbere ku wa {date}",
      previewNote:
        "Nta kiguzi cyo gutunganya cyangwa cy'ubwishingizi, bityo uhabwa amafaranga yose. Kimwe cya kabiri cy'inyungu kigarurwa mu buzigame bwawe uko wishyura. Amasezerano ya nyuma yemezwa igihe inguzanyo yemewe.",
    },
    repayments: {
      title: "Kwishyura",
      description:
        "Gahunda y'ubwishyu bwawe n'ibyose umaze kwishyura.",
      noLoansTitle: "Nta nguzanyo iriho ufite",
      noLoansBody:
        "Igihe inguzanyo izaba yakoherejwe, gahunda y'ubwishyu izagaragara hano.",
      applyAction: "Saba inguzanyo",
      arrearsTitle: "Ufite ubwishyu bwarengeje igihe",
      arrearsBody:
        "{amount} yarengeje itariki ntarengwa. Ihazabu ishobora gukomeza kwiyongera kugeza yishyuwe.",
      totalOutstanding: "Umwenda wose usigaye",
      acrossLoans: "Ku nguzanyo imwe|Ku nguzanyo {count}",
      nextInstalment: "Igice cy'ubwishyu gikurikira",
      dueOn: "Kigomba kwishyurwa {date}",
      nothingScheduled: "Nta kiteganyijwe",
      inArrears: "Byarengeje igihe",
      settleSoon: "Ishyura vuba bishoboka",
      upToDate: "Uri ku gihe",
      schedule: "Gahunda y'ubwishyu",
      loan: "Inguzanyo",
      instalment: "Igice cy'ubwishyu",
      daysLate: "Umunsi {days} warenze|Iminsi {days} yarenze",
      noSchedule:
        "Nta gahunda irakorwa. Ikorwa igihe inguzanyo yoherejwe.",
      received: "Ubwishyu bwakiriwe",
      penalty: "Ihazabu",
      balanceAfter: "Amafaranga asigaye",
      noneReceived: "Nta bwishyu burashyirwaho.",
      matchingNote:
        "Ubwishyu buhuzwa byikora igihe wishyuye ukoresheje nimero yawe y'ubwishyu {reference}. Tegereza kugeza ku munsi umwe w'akazi ngo ubwishyu bugaragare hano.",
    },
    withdrawals: {
      title: "Kubikuza",
      description:
        "Saba amafaranga ku buzigame bwawe kandi ukurikirane uko byemezwa.",
      suspendedTitle: "Kubikuza ntibishoboka ubu",
      suspendedBody:
        "Ihuriro rimaze guhagarika kubikuza. Vugana n'ibiro niba ukeneye ubufasha.",
      yourRequests: "Ubusabe bwawe",
      requested: "Byasabwe",
      fee: "Ikiguzi",
      youReceive: "Uzahabwa",
      noneYet: "Ntiwasabye kubikuza na rimwe.",
      reviewNote:
        "Ubusabe bwo kubikuza busuzumwa n'ihuriro mbere yo kwishyurwa. Amafaranga akurwa ku konti yawe ari uko yishyuwe koko.",

      formTitle: "Saba kubikuza",
      availableNow: "Ubu ushobora kubikuza kugeza kuri {amount}.",
      hintMin: "Ntoya ishoboka ni {min}",
      hintMinMax: "Ntoya ishoboka ni {min} · nyinshi ishoboka ni {max}",
      payoutMethod: "Uburyo bwo kwishyurwa",
      methodMobileMoney: "Mobile money",
      methodBank: "Kohereza kuri banki",
      methodCash: "Amafaranga mu ntoki ku biro",
      mobileNumber: "Nimero ya mobile money",
      bankAccount: "Konti ya banki",
      destinationHint:
        "Sigara ubusa niba ushaka gukoresha amakuru ari kuri konti yawe",
      accountNumberPlaceholder: "Nimero ya konti",
      reasonLabel: "Impamvu (ntibigomba)",
      reasonPlaceholder: "Aya mafaranga ugiye kuyakoresha iki?",
      amountRequested: "Amafaranga wasabye",
      withdrawalFee: "Ikiguzi cyo kubikuza",
      deductedFromBalance: "Bikurwa ku mafaranga yawe",
      errExceedsAvailable:
        "Ibi birenze amafaranga ufite ashobora gukurwaho, ari yo {amount}.",
      errBelowMinimum: "Amafaranga make ushobora kubikuza ni {amount}.",
      errAboveMaximum: "Amafaranga menshi ushobora kubikuza ni {amount}.",
      errMinimumBalance: "Ugomba gusigaza nibura {amount} kuri konti yawe.",
      submitRequest: "Ohereza ubusabe",
      approvalNote:
        "Ubusabe busuzumwa n'ihuriro. Amafaranga yawe agabanuka ari uko wamaze kwishyurwa.",
      submitFailed: "Ntibyashobotse kohereza ubusabe bwawe",
      successTitle: "Ubusabe bwo kubikuza bwoherejwe",
      successReference: "Nimero y'ubusabe {reference}.",
      successUnderReview: "Umuyobozi agiye kubusuzuma vuba.",
      successPayingOut: "Ugiye kwishyurwa vuba.",
      makeAnother: "Saba ubundi bwikuze",
    },
    statements: {
      title: "Inyandiko za konti",
      description:
        "Kuramo inyandiko ya konti yawe y'ubuzigame ku gihe icyo ari cyo cyose.",
      ledgerNote:
        "Inyandiko za konti zikorwa hakoreshejwe igitabo cy'ibikorwa cy'ihuriro. Buri gikorwa kigaragaza nimero yacyo n'amafaranga asigaye nyuma yacyo, ku buryo inyandiko ihuza umurongo ku murongo.",
      formatNote:
        "Hitamo PDF kugira ngo ubone inyandiko ishobora gucapwa — koresha idirishya ryo gucapa rya mushakisha hanyuma uhitemo “Save as PDF”. Hitamo CSV kugira ngo ufungure amakuru muri Excel.",
    },
    notifications: {
      title: "Ubutumwa",
      unread: "{count} butarasomwa",
      upToDate: "Uri ku gihe.",
      noneTitle: "Nta butumwa buhari",
      noneBody:
        "Kwemeza ubwishyu, amakuru y'inguzanyo n'ibyibutsa bizagaragara hano.",
      unreadLabel: "Butarasomwa",
      justNow: "nonaha",
      minutesAgo: "hashize iminota {count}",
      hoursAgo: "hashize amasaha {count}",
      daysAgo: "hashize iminsi {count}",
    },
    profile: {
      title: "Umwirondoro",
      description:
        "Amakuru y'ubunyamuryango bwawe nk'uko ihuriro ayafite.",
      changePassword: "Hindura ijambobanga",
      incompleteTitle: "Amakuru yawe yo kuvugana ntuzuye",
      incompleteBody:
        "Ihuriro rikoresha telefone na imeyili yawe mu kumenyesha ibijyanye n'ubwishyu, ibyemezo by'inguzanyo no kubikuza. Yandike ku rupapuro rw'amakuru yawe.",
      yourReference: "Nimero yawe y'ubwishyu",
      yourReferenceBody:
        "Andika iyi nimero kuri buri bwitso kugira ngo yandikwe kuri konti yawe ako kanya. Ubwishyu butayifite bugomba guhuzwa n'intoki kandi butinda kugaragara.",
      membership: "Ubunyamuryango",
      memberNumber: "Nimero y'umunyamuryango",
      identityCheck: "Igenzura ry'umwirondoro",
      association: "Ihuriro",
      joined: "Yinjiye",
      approvedOn: "Yemejwe",
      contactSecurity: "Kuvugana n'umutekano",
      emailVerified: "Imeyili yemejwe",
      phoneVerified: "Telefone yemejwe",
      notVerified: "Ntiyemejwe",
      twoFactor: "Kwemeza kabiri",
      enabled: "Birakora",
      disabled: "Ntibikora",
      passwordChanged: "Ijambobanga ryahindutse",
      lastSignIn: "Ubwinjiro buheruka",
      personalDetails: "Amakuru bwite",
      business: "Ubucuruzi",
      payoutKin: "Kwishyurwa n'uwo mwegereye",
      mobileMoney: "Mobile money",
      bankAccount: "Konti ya banki",
      nextOfKin: "Uwo mwegereye",
      theirPhone: "Telefone ye",
      relationship: "Isano",
      maintainedNote:
        "Nimero y'ubunyamuryango, nimero y'ubwishyu n'imiterere y'ubunyamuryango bishyirwaho n'ihuriro kandi ntibihindurirwa hano. Kugira ngo ukosore kimwe muri byo, vugana na",
      anAdministrator: "umuyobozi",
      orCall: "cyangwa uhamagare {phone}",
    },
    association: {
      title: "Amafaranga y'ihuriro ryacu",
      description:
        "Ibyo ihuriro rifite, ibyo ribereyemo abandi n'inyungu ryinjije. Ni imibare imwe komite ibona.",

      pool: "Ubuzigame bw'abanyamuryango",
      poolHint: "Bwazigamwe n'abanyamuryango {count}",
      lentOut: "Yatanzwe ku banyamuryango",
      lentOutHint: "Mu nguzanyo {count} zigikora",
      lentOutOwed: "{amount} bagomba kwishyura hiyongereyeho inyungu",
      borrowed: "Yaguzwe ku baguriza",
      borrowedHint: "Mu nguzanyo {count}",
      noBorrowingHint: "Ihuriro nta mwenda rifite",
      surplus: "Inyungu yinjiye",
      loss: "Igihombo kugeza ubu",
      surplusHint: "Kuva ihuriro ryatangira",
      lossHint: "Ikiguzi kirenze ibyinjiye kugeza ubu",

      yourStakeTitle: "Umugabane wawe muri ibi",
      yourStakeBody:
        "Ubuzigame bwawe ni {percent}% by'ibyo abanyamuryango bose bashyizemo.",
      yourSavings: "Ubuzigame bwawe",
      yourShare: "Umugabane wawe mu buzigame bwose",
      yourIndicativeShare: "Umugabane wawe ku nyungu",
      indicativeNote:
        "Iyi ni imibare y'urugero, si amafaranga wakura ubu. Inyungu iba iyawe gusa igihe inteko rusange yemeje ko igabanywa.",

      whereTitle: "Aho amafaranga ari",
      whereHint:
        "Ibyo abanyamuryango bazigamye, hiyongereyeho ibyo ihuriro ryaguzwe, hakuwemo ibyasohotse.",
      whereLent: "Ari mu nguzanyo z'abanyamuryango",
      whereInvested: "Ashowe mu mishinga",
      whereHeld: "Ataratangwa cyangwa ngo ashorwe",
      whereServiceFee: "Serivisi ibikiwe urubuga",
      booksIncompleteTitle: "Iyi mibare ntihuye",
      booksIncompleteBody:
        "Hatanzwe kandi hashowe menshi kurusha ibyanditswe. Saba komite kugenzura ko buri nguzanyo, buri mushinga na buri nguzanyo ya banki byanditswe.",

      statementTitle: "Uko inyungu yabonetse",
      statementHint:
        "Amafaranga yakiriwe koko n'ayatanzwe koko — si ayagitegerejwe.",
      earnedTitle: "Ibyinjiye",
      loanInterest: "Inyungu ku nguzanyo z'abanyamuryango",
      loanFees: "Amafaranga y'inguzanyo",
      penalties: "Amande yo gutinda kwishyura",
      accountFees: "Amafaranga ya konti",
      investmentReturns: "Inyungu ziva mu mishinga",
      totalEarned: "Byinjiye byose",
      spentTitle: "Ikiguzi",
      memberInterest: "Inyungu yahawe abanyamuryango",
      borrowingInterest: "Inyungu yahawe abaguriza",
      borrowingFees: "Amafaranga y'abaguriza",
      totalSpent: "Ikiguzi cyose",
      netSurplus: "Inyungu",
      netLoss: "Igihombo",

      incomeTrend: "Ibyo inguzanyo zinjije",
      incomeTrendHint: "Inyungu, amafaranga n'amande byakiriwe buri kwezi",
      incomeTrendEmpty:
        "Nta kintu kiraboneka. Bizuzura uko abanyamuryango bishyura inguzanyo zabo.",

      borrowingsTitle: "Amafaranga ihuriro ryaguzwe",
      borrowingsHint:
        "Inguzanyo zavuye muri banki cyangwa undi muguriza kugira ngo zishyigikire ubuzigame bw'abanyamuryango.",
      noBorrowingsTitle: "Ihuriro nta mwenda rifite",
      noBorrowingsBody:
        "Ibyo ihuriro ritanga kandi rishora byose biva mu buzigame bw'abanyamuryango. Niriramuka ryaguze, inguzanyo izagaragara hano.",
      pledgedTitle: "{percent}% by'ubuzigame bwawe bwatanzwe nk'ingwate",
      pledgedBody:
        "Inguzanyo z'ihuriro zingana na {percent}% by'ibyo abanyamuryango bose bazigamye. Iyo ngwate ni yo umuguriza yafata ihuriro ridashoboye kwishyura.",
      lender: "Umuguriza",
      purpose: "Icyo yagenewe",
      facilityAmount: "Yaguzwe",
      repaid: "Yishyuwe kugeza ubu",
      stillOwed: "Agisigaye",
      interestRate: "Inyungu",
      nextPayment: "Ubwishyu bukurikira",
      matures: "Ubwishyu bwa nyuma",
      security: "Ingwate yatanzwe",
      fundedProjects: "Ibi yishyuye",
      overdueWarning:
        "Iyi nguzanyo yatinze umunsi {days}.|Iyi nguzanyo yatinze iminsi {days}.",

      investmentsTitle: "Icyo amafaranga yacu yakoze",
      investmentsHint:
        "Ibyo ihuriro rishoyemo amafaranga, n'ibyo abanyamuryango babikuyemo.",
      noInvestmentsTitle: "Nta kintu kiranditswe",
      noInvestmentsBody:
        "Igihe ihuriro rizagura ibikoresho, rikodesha ahakorerwa cyangwa rigatera inkunga amahugurwa, bizandikwa hano hamwe n'ikiguzi n'abo byafashije.",
      invested: "Yashowe",
      returnedSoFar: "Yagarutse kugeza ubu",
      benefitTitle: "Icyo abanyamuryango babikuramo",
      membersBenefited:
        "Umunyamuryango {count} yafashijwe|Abanyamuryango {count} bafashijwe",
      paidForBy: "Byishyuwe na {source}",
      projectsCount: "Umushinga {count}|Imishinga {count}",

      sourceNote:
        "Buri mubare uri kuri iyi paji uterurwa mu byanditswe by'ihuriro ku bwishyu, inguzanyo no kwishyura. Nta kintu na kimwe hano ari urugero. Niba hari ikitagenda neza, bibwire komite — kandi bizagaragara mu byanditswe by'igenzura.",
    },
    warehouse: {
      title: "Ububiko (Warehouse)",
      description:
        "Ibyo ihuriro ribitse mu bubiko, ibyo wafashemo, n'ibyo ukibereyemo umwenda.",

      tabStock: "Ibiri mu bubiko",
      tabMine: "Ibyo nafashe",
      tabCredit: "Ibyo nishyura",

      stockTitle: "Ibiri ku rutonde uyu munsi",
      stockHint:
        "Ihuriro rigura imyenda, imidodo n'imashini ku bwinshi kugira ngo abanyamuryango bishyure make kurusha ku isoko. Ibi ni ibiciro wacibwa.",
      itemColumn: "Ikintu",
      categoryColumn: "Ubwoko",
      priceColumn: "Igiciro",
      availableColumn: "Bihari",
      inStock: "Birahari",
      lowStock: "Bigiye gushira",
      outOfStock: "Byashize",
      searchPlaceholder: "Shakisha mu bubiko",
      allCategories: "Byose",
      stockEmptyTitle: "Ububiko burimo ubusa",
      stockEmptyBody:
        "Nta kintu kirashyirwamo. Igihe ihuriro rizagura imyenda cyangwa imashini, bizagaragara hano n'ibiciro byabyo.",
      askOfficer:
        "Kugira ngo ufate ikintu, vugana n'ushinzwe ububiko. Arabyandika ku izina ryawe, bikagaragara hano uwo munsi.",

      mineTitle: "Ibyo wafashe",
      mineHint:
        "Buri kintu cyanditswe ku ifishi yawe, gitangirira ku giheruka — hamwe n'ibyo wahawe ku buntu cyangwa wagurijwe akazi.",
      referenceColumn: "Nomero",
      dateColumn: "Wabifashe",
      valueColumn: "Agaciro",
      termsColumn: "Amasezerano",
      statusColumn: "Aho bigeze",
      owedColumn: "Usigaje kwishyura",
      mineEmptyTitle: "Nta kintu warafata mu bubiko",
      mineEmptyBody:
        "Igihe uzafata umwenda, urudodo cyangwa imashini, bizandikwa ku izina ryawe bikagaragara hano n'igiciro byaguze.",
      itemsTaken: "ikintu {count}|ibintu {count}",
      dueBack: "Bigomba gusubizwa {date}",
      overdueBack: "Byari bikwiye gusubizwa {date}",
      settledOn: "Byishyuwe {date}",

      takenTotal: "Ibyo wafashe mu bubiko",
      takenTotalHint: "Ibyaguhawe byose, ku giciro cyo ku munsi wabifasheho",
      owedOutright: "Umwenda utaziguye",
      owedOutrightHint: "Ibintu wafashe utarishyura",
      owedOnCredit: "Umwenda w'ideni",
      owedOnCreditHint: "Ibyishyurwa buri kwezi, inyungu n'ihazabu bisigaye",
      nextPayment: "Ubwishyu bukurikira",
      nextPaymentHint: "Ukwezi kwa vuba usigaje kwishyura",
      nothingDue: "Nta cyo usabwa",

      creditTitle: "Ibintu uri kwishyura buhoro",
      creditHint:
        "Ikintu cyose wafashe utishyuye uwo munsi cyishyurwa mu mezi atatu. Buri kwezi kwerekana icyo usabwa n'itariki.",
      creditEmptyTitle: "Nta kintu uri kwishyura",
      creditEmptyBody:
        "Igihe uzafata ibintu ku ideni, ibyishyurwa bitatu bya buri kwezi bizagaragara hano n'amatariki yabyo uwo munsi.",
      goodsValue: "Agaciro k'ibintu",
      interestCharged: "Inyungu (2% rimwe)",
      totalToPay: "Byose ugomba kwishyura",
      paidSoFar: "Wamaze kwishyura",
      stillOwed: "Usigaje kwishyura",
      openedOn: "Wabifashe {date}",
      finishBy: "Bigomba kurangira {date}",
      monthColumn: "Ukwezi",
      dueDateColumn: "Itariki",
      amountColumn: "Ugomba kwishyura",
      paidColumn: "Wishyuye",
      remainingColumn: "Bisigaye",
      scheduleTitle: "Ibyishyurwa byawe bitatu",
      paymentsTitle: "Ibyo wishyuye",
      noPaymentsYet: "Nta kintu kirishyurwa kuri iki.",
      paidFromSavings: "Bivuye mu buzigame bwawe",
      paidInCash: "Mu mafaranga",
      towardGoods: "ibintu",
      towardInterest: "inyungu",
      towardFine: "ihazabu",

      statusUpcoming: "Itarageza",
      statusDue: "Igeze",
      statusPartial: "Yishyuwe igice",
      statusPaid: "Yishyuwe",
      statusOverdue: "Yatinze",
      statusWaived: "Yarekewe",
      daysLate: "yatinze umunsi {count}|yatinze iminsi {count}",
      dueInDays: "Isigaje umunsi {count}|Isigaje iminsi {count}",
      dueToday: "Igomba kwishyurwa uyu munsi",

      fineTitle: "Habaye ihazabu yo gusiba ukwezi",
      fineBody:
        "Waciwe {amount} — {rate}% bya {arrears} wari usigaje kuri uko kwezi. Kwishyura bibanza gukuraho ihazabu, hanyuma inyungu, hanyuma ibintu.",
      fineOn: "Ihazabu y'ukwezi kwa {number}",
      fineWaived: "Yarekewe",
      fineSettled: "Ihazabu yishyuwe",
      finesTotal: "Amahazabu",

      rulesTitle: "Amategeko yo kugura mu bubiko",
      rulesInterest: "2% yiyongeraho rimwe gusa, ku mezi atatu yose — si buri kwezi.",
      rulesTerm:
        "Byishyurwa mu byishyurwa {count} bingana bya buri kwezi, bitangira ukwezi kumwe umaze gufata ibintu.",
      rulesFine:
        "Nusiba ukwezi, {rate}% by'ibisigaye kuri uko kwezi biyongeraho nk'ihazabu.",
      rulesDestination:
        "Iyi nyungu igenerwa ihuriro ryonyine. Bitandukanye n'inguzanyo y'amafaranga, nta na kimwe kigaruka mu buzigame bwawe.",
      readFullRules: "Soma amategeko yose",

      howToPayTitle: "Uko wishyura",
      howToPayBody:
        "Ishyura ushinzwe ububiko mu mafaranga, cyangwa usabe ko bikurwa mu buzigame bwawe. Uko byaba byose bihita byandikwa hano uwo munsi, kandi bibanza kwishyura ukwezi kwa mbere.",
    },
    security: {
      title: "Umutekano n'ijambobanga",
      description:
        "Hindura ijambobanga ryawe kandi urebe ibyaherutse ku bwinjiro bwawe.",
      forcedTitle: "Ugomba guhindura ijambobanga",
      forcedBody:
        "Iyi konti yakoreshejwe ijambobanga ry'agateganyo. Hitamo irishya mbere yo kubandanya.",
      activeSessions: "Ibyuma winjiyeho",
      sessionsCount:
        "Winjiye ku gikoresho {count}.|Winjiye ku bikoresho {count}.",
      sessionsWarning:
        "Guhindura ijambobanga bikura ibindi byuma byose ako kanya.",
      recentActivity: "Ubwinjiro buheruka",
      successfulSignIn: "Ubwinjiro bwagenze neza",
      failedAttempt: "Ubwinjiro bwanze",
      unknownIp: "IP itazwi",
      warning:
        "Nubona ubwinjiro utazi, hindura ijambobanga ako kanya kandi uvugane n'umuyobozi w'ihuriro.",
    },
  },
};
