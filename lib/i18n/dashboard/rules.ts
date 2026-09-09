import type { Locale } from "@/types";

/**
 * The rulebook, in both languages.
 *
 * Kept in its own module rather than folded into admin.ts and member.ts,
 * because these strings are read by BOTH audiences and are the one part of the
 * dashboard where the two must say the same thing. A member reading "you are
 * three days behind" and an officer reading "3 days behind" about the same
 * person should be looking at one translation, not two that drifted.
 *
 * WHAT IS NOT HERE: the text of the rules themselves. Those live on the
 * AssociationRule rows, in both languages, because a committee must be able to
 * reword its own policy without a deployment. This file holds the furniture
 * around them — headings, column names, the words for a status.
 */
export interface RulesCopy {
  /// Group headings, shared by the member's page and the admin rulebook.
  categories: {
    CONTRIBUTIONS: string;
    PLATFORM_FEE: string;
    PENALTIES: string;
    LENDING_ELIGIBILITY: string;
    LOAN_TERMS: string;
    INTEREST_SHARING: string;
    WAREHOUSE_CREDIT: string;
    GOVERNANCE: string;
    OTHER: string;
  };

  /// How a rule is applied. Shown on every rule, so a member knows which ones
  /// the system acts on by itself.
  enforcement: {
    AUTOMATIC: string;
    ASSISTED: string;
    INFORMATIONAL: string;
    automaticHint: string;
    assistedHint: string;
    informationalHint: string;
  };

  /// Why a member cannot borrow, keyed by the rule that stopped them.
  /// lib/rules/borrowing.ts returns the rule and its numbers separately from
  /// its English sentence, so the member's page can say the same thing in
  /// Kinyarwanda. See the note on BorrowingBlocker.
  blockers: {
    LENDING_NOT_OPEN: string;
    MEMBERSHIP_TOO_SHORT: string;
    IN_ARREARS: string;
    FINE_OUTSTANDING: string;
    ACTIVE_LOAN: string;
    AMOUNT: string;
    COLLATERAL: string;
    TERM_TOO_LONG: string;
    NO_SAVINGS: string;
    COLLATERAL_TO_RECORD: string;
  };

  standing: {
    CURRENT: string;
    AT_RISK: string;
    BEHIND: string;
    FINABLE: string;
    EXEMPT: string;
  };

  units: {
    perDay: string;
    days: string;
    months: string;
    percent: string;
    yes: string;
    no: string;
  };

  /// The member's own page.
  member: {
    title: string;
    description: string;
    yourStanding: string;
    upToDate: string;
    upToDateBody: string;
    behindBy: string;
    behindBody: string;
    fineWarning: string;
    fineWarningBody: string;
    finedTitle: string;
    finedBody: string;
    exemptTitle: string;
    exemptBody: string;
    payToClear: string;
    payToClearHint: string;
    daysCovered: string;
    daysCoveredHint: string;
    daysOwed: string;
    oneDayCosts: string;
    oneDayCostsHint: string;
    /// Stated as a sentence above the rulebook itself, not only as a tile.
    /// The two halves are separate rules and a reader who meets them one at a
    /// time never adds them up — which is how somebody pays the savings half
    /// exactly and is still counted behind.
    dailyCostRule: string;
    dailyCostRuleBody: string;
    yourFines: string;
    fineOn: string;
    fineWaived: string;
    fineSettled: string;
    fineOutstanding: string;
    noFines: string;
    noFinesBody: string;

    borrowingTitle: string;
    borrowingDescription: string;
    withoutCollateral: string;
    withoutCollateralHint: string;
    aboveThat: string;
    aboveThatValue: string;
    aboveThatHint: string;
    canBorrowNow: string;
    cannotBorrowYet: string;
    whatIsStopping: string;
    monthsToWait: string;
    exampleTitle: string;
    exampleBody: string;
    exampleYouRepay: string;
    exampleComesBack: string;
    exampleRealCost: string;

    theRules: string;
    lastChanged: string;
    version: string;
    withdrawn: string;
    noRules: string;
    noRulesBody: string;
    howToPay: string;
    howToPayBody: string;
  };

  /// The committee's rulebook screen.
  admin: {
    title: string;
    description: string;
    addRule: string;
    editRule: string;
    history: string;
    historyFor: string;
    noHistory: string;
    changedBy: string;
    changedTo: string;
    systemRule: string;
    systemRuleHint: string;
    customRule: string;
    customRuleHint: string;
    active: string;
    inactive: string;
    deactivate: string;
    reactivate: string;
    deleteRule: string;
    deleteConfirm: string;

    invalidValues: string;
    invalidValuesBody: string;

    summaryDaily: string;
    summaryDailyHint: string;
    summaryFee: string;
    summaryFeeHint: string;
    summaryFine: string;
    summaryFineHint: string;
    summaryBorrowing: string;
    summaryBorrowingHint: string;
    summaryInterest: string;
    summaryInterestHint: string;

    fieldValue: string;
    fieldValueHint: string;
    fieldTitleEn: string;
    fieldTitleRw: string;
    fieldBodyEn: string;
    fieldBodyRw: string;
    fieldCategory: string;
    fieldValueType: string;
    fieldReason: string;
    fieldReasonHint: string;
    fieldNotify: string;
    fieldNotifyHint: string;
    fieldActive: string;

    saved: string;
    added: string;
    removed: string;
    cannotDisable: string;

    interestMismatch: string;
    dailyTotalNote: string;
  };

  /// Who is behind, and what to do about it.
  compliance: {
    title: string;
    description: string;
    runChecks: string;
    runChecksHint: string;
    runningChecks: string;
    runComplete: string;

    tileUpToDate: string;
    tileBehind: string;
    tileFinable: string;
    tileExempt: string;
    tileArrears: string;
    tileArrearsHint: string;
    tileFines: string;
    tileFinesHint: string;
    tileFeesPending: string;
    tileFeesPendingHint: string;

    filterAll: string;
    searchPlaceholder: string;

    colMember: string;
    colStanding: string;
    colBehind: string;
    colArrears: string;
    colFines: string;
    colToClear: string;
    colSavings: string;
    /// A real word, not an empty string: the column holds buttons and a
    /// screen reader needs a header to announce. It is hidden visually.
    colActions: string;

    daysBehind: string;
    daysToFine: string;
    fineTonight: string;

    noneTitle: string;
    noneBody: string;
    allCurrentTitle: string;
    allCurrentBody: string;

    viewMember: string;
    settleFine: string;
    settleFineConfirm: string;
    waiveFine: string;
    waiveFineTitle: string;
    waiveReason: string;
    excuseMember: string;
    excuseTitle: string;
    excuseBody: string;
    excuseUntil: string;
    excuseUntilHint: string;
    endExcuse: string;
    obligationStart: string;
    obligationStartHint: string;
    insufficientFunds: string;
  };

  /// The fines register, and the member's own copy of it. One section rather
  /// than two because an officer and a member looking at the same fine must
  /// read the same words for what it was raised for — see lib/services/fines.ts.
  fines: {
    title: string;
    description: string;

    tileOutstanding: string;
    tileOutstandingHint: string;
    tileMembers: string;
    tileMembersHint: string;
    tileSettled: string;
    tileSettledHint: string;
    tileWaived: string;
    tileWaivedHint: string;

    typeLabel: string;
    typeAll: string;
    typeContribution: string;
    typeWarehouse: string;
    statusLabel: string;
    statusAll: string;
    searchPlaceholder: string;

    state: {
      OUTSTANDING: string;
      SETTLED: string;
      WAIVED: string;
      CANCELLED: string;
    };

    colMember: string;
    colWhy: string;
    colAmount: string;
    colState: string;
    colAssessed: string;
    colActions: string;

    /// Why a fine was raised, in the member's own terms.
    whyContribution: string;
    whyWarehouse: string;
    /// The arithmetic behind the figure, so it is never a bare number.
    sum: string;
    creditRef: string;
    waivedBecause: string;

    noneTitle: string;
    noneBody: string;
    cleanTitle: string;
    cleanBody: string;

    /// Explains why a warehouse fine offers no "collect from savings" button.
    warehouseSettleNote: string;

    memberTitle: string;
    memberDescription: string;
    memberOwed: string;
    memberOwedHint: string;
    memberPaid: string;
    memberPaidHint: string;
    memberWaivedCount: string;
    memberWaivedHint: string;
    memberNothingTitle: string;
    memberNothingBody: string;
    memberHowToClear: string;
    memberOpenRules: string;
    memberOpenWarehouse: string;
  };

  /// Whose money is whose.
  funds: {
    title: string;
    description: string;

    membersSavings: string;
    membersSavingsHint: string;
    membersSavingsNote: string;
    availableNow: string;
    pledged: string;

    serviceFee: string;
    serviceFeeHint: string;
    serviceFeeNote: string;
    collected: string;
    remitted: string;
    owedToOperator: string;
    recordRemittance: string;
    remittanceTitle: string;
    remittanceBody: string;
    remittanceUpTo: string;
    remittanceReference: string;
    remittanceRecorded: string;
    nothingToRemit: string;

    associationIncome: string;
    associationIncomeHint: string;
    associationIncomeNote: string;
    incomeLoanInterest: string;
    incomeLoanFees: string;
    incomeLoanPenalties: string;
    incomeFines: string;
    incomeAccountFees: string;

    memberInterest: string;
    memberInterestHint: string;
    memberInterestNote: string;
    fromLoans: string;
    otherInterest: string;

    finesTitle: string;
    finesAssessed: string;
    finesOutstanding: string;
    finesSettled: string;
    finesWaived: string;

    chartTitle: string;
    chartHint: string;
    seriesFee: string;
    seriesAssociation: string;
    seriesMember: string;

    notATotal: string;
    noAssociation: string;
  };
}

export const rules: Record<Locale, RulesCopy> = {
  en: {
    categories: {
      CONTRIBUTIONS: "Saving every day",
      PLATFORM_FEE: "The service fee",
      PENALTIES: "Falling behind",
      LENDING_ELIGIBILITY: "Who may borrow",
      LOAN_TERMS: "Loan terms",
      INTEREST_SHARING: "Where the interest goes",
      WAREHOUSE_CREDIT: "Buying from the store on credit",
      GOVERNANCE: "How the rules work",
      OTHER: "Other rules",
    },

    enforcement: {
      AUTOMATIC: "Applied automatically",
      ASSISTED: "Checked by an officer",
      INFORMATIONAL: "Written policy",
      automaticHint: "The system applies this on its own — no one has to decide.",
      assistedHint: "The system checks this and an officer confirms it.",
      informationalHint: "Agreed policy. The system does not enforce it.",
    },

    blockers: {
      LENDING_NOT_OPEN:
        "The association starts lending after {required} months of saving. That is {remaining} month(s) away.",
      MEMBERSHIP_TOO_SHORT:
        "You must have been saving for {required} months before you can borrow. You have {current}, so {remaining} more to go.",
      IN_ARREARS:
        "You are {days} day(s) behind on your daily saving. Clear it and you can apply the same day.",
      FINE_OUTSTANDING:
        "You have {amount} of unpaid fines. They must be settled or waived before you can borrow.",
      ACTIVE_LOAN:
        "You already have a loan running. It must be finished before you take another.",
      AMOUNT: "Enter the amount you want to borrow.",
      COLLATERAL:
        "Borrowing {requested} takes {above} from the association's pooled money. That needs collateral worth {required}; you have offered {offered}, so {shortfall} more is needed.",
      TERM_TOO_LONG:
        "Loans are repaid within {max} months. There is no extension, so choose {max} months or fewer.",
      NO_SAVINGS:
        "You have no savings yet, so any loan would rest entirely on collateral.",
      COLLATERAL_TO_RECORD:
        "{above} of this is above your own savings share, so the committee must record collateral worth at least {required}.",
    },

    standing: {
      CURRENT: "Up to date",
      AT_RISK: "Fine approaching",
      BEHIND: "Behind",
      FINABLE: "Fine due",
      EXEMPT: "Excused",
    },

    units: {
      perDay: "per day",
      days: "days",
      months: "months",
      percent: "%",
      yes: "Yes",
      no: "No",
    },

    member: {
      title: "Our rules",
      description:
        "Everything the association has agreed, with the exact figures the system applies — and where you stand against each one today.",
      yourStanding: "Where you stand today",
      upToDate: "You are up to date",
      upToDateBody:
        "Your daily saving is fully paid up. Nothing is owed and no fine applies.",
      behindBy: "You are {days} day(s) behind",
      behindBody:
        "Pay {amount} to be fully up to date. You have {remaining} day(s) before a fine applies.",
      fineWarning: "A fine applies in {days} day(s)",
      fineWarningBody:
        "You are {behind} day(s) behind. Pay {amount} before then and no fine is added.",
      finedTitle: "A fine has been added",
      finedBody:
        "You are {behind} day(s) behind, past the {grace} allowed. Pay {amount} to clear your arrears and the fine together.",
      exemptTitle: "You are excused from contributing",
      exemptBody:
        "No daily saving, service fee or fine is being applied to your account at present.",
      payToClear: "Pay to be fully clear",
      payToClearHint: "Missed savings, service fee and any fine, added together",
      daysCovered: "Days you have paid for",
      daysCoveredHint: "Out of {owed} days since you joined",
      daysOwed: "Days since you started",
      oneDayCosts: "One day costs",
      oneDayCostsHint: "{savings} saved for you, plus {fee} service fee",
      dailyCostRule: "One day of membership costs {total}",
      dailyCostRuleBody:
        "{savings} is saved into your own account and stays yours. {fee} is the service fee and is not savings. The two are separate rules below, but you owe both every day — paying only {savings} leaves you behind by {fee} a day, and that is what builds up into a fine.",

      yourFines: "Your fines",
      fineOn: "Assessed {date}, after {days} days behind",
      fineWaived: "Waived",
      fineSettled: "Paid",
      fineOutstanding: "Owed",
      noFines: "No fines",
      noFinesBody: "You have never been fined. Keep saving every day and you never will be.",

      borrowingTitle: "What you can borrow",
      borrowingDescription:
        "Worked out from your own savings and the association's rules, as they stand today.",
      withoutCollateral: "Without pledging anything",
      withoutCollateralHint: "{percent}% of your savings of {savings}",
      aboveThat: "Above that",
      aboveThatValue: "Collateral needed",
      aboveThatHint:
        "Anything more comes from the association's pooled money and needs collateral worth the same amount.",
      canBorrowNow: "You can apply for a loan",
      cannotBorrowYet: "You cannot borrow yet",
      whatIsStopping: "What needs to happen first",
      monthsToWait: "{months} month(s) to go",

      exampleTitle: "What a loan would cost you",
      exampleBody:
        "Borrowing {principal} over {months} months at {rate}% a month:",
      exampleYouRepay: "You repay in total",
      exampleComesBack: "Comes back into your savings",
      exampleRealCost: "So the loan really costs you",

      theRules: "The rules in full",
      lastChanged: "Last changed {date}",
      version: "Version {version}",
      withdrawn: "Withdrawn",
      noRules: "The rules have not been published yet",
      noRulesBody:
        "Ask the association's committee to open the rulebook so the rules appear here.",
      howToPay: "How to pay",
      howToPayBody:
        "Quote your payment reference {reference} on every payment. It is how your money is matched to your account.",
    },

    admin: {
      title: "Rulebook",
      description:
        "The rules every member lives under. Change a figure here and it applies from the moment you save it — and every member can read the same page.",
      addRule: "Add a rule",
      editRule: "Edit rule",
      history: "History",
      historyFor: "Amendments to “{rule}”",
      noHistory: "This rule has never been amended.",
      changedBy: "by {name}",
      changedTo: "Value was {value}",
      systemRule: "Enforced",
      systemRuleHint:
        "The software reads this rule. Changing the figure changes what happens tomorrow.",
      customRule: "Your own rule",
      customRuleHint:
        "Written by the committee and shown to members. The software does not enforce it.",
      active: "In force",
      inactive: "Withdrawn",
      deactivate: "Withdraw this rule",
      reactivate: "Put back in force",
      deleteRule: "Delete",
      deleteConfirm:
        "Delete this rule permanently? Members will no longer see it. If it has been in force, withdraw it instead so the record survives.",

      invalidValues: "{count} rule(s) could not be read",
      invalidValuesBody:
        "The system is applying the standard figure for these until they are corrected. Open each one and check its value.",

      summaryDaily: "Daily saving",
      summaryDailyHint: "Plus {fee} service fee — {total} a day in total",
      summaryFee: "Service fee",
      summaryFeeHint: "Per day. Collected for the platform, not association income.",
      summaryFine: "Fine after {days} days",
      summaryFineHint: "Of the unpaid saving. {example} on a missed week.",
      summaryBorrowing: "Borrow against savings",
      summaryBorrowingHint: "Above that, collateral is required",
      summaryInterest: "{rate}% a month",
      summaryInterestHint: "{member} to the borrower's savings, {association} to the association",

      fieldValue: "Value",
      fieldValueHint: "The figure the system applies from the moment you save.",
      fieldTitleEn: "Title (English)",
      fieldTitleRw: "Title (Kinyarwanda)",
      fieldBodyEn: "Explanation (English)",
      fieldBodyRw: "Explanation (Kinyarwanda)",
      fieldCategory: "Group",
      fieldValueType: "Kind of value",
      fieldReason: "Reason for the change",
      fieldReasonHint:
        "Recorded permanently and shown in the rule's history. Members may be told it.",
      fieldNotify: "Tell members about this change",
      fieldNotifyHint: "Sends a notice in the app. No SMS, so it costs nothing.",
      fieldActive: "In force",

      saved: "Rule updated",
      added: "Rule added",
      removed: "Rule deleted",
      cannotDisable:
        "This rule is applied automatically and cannot be switched off. Change its value instead.",

      interestMismatch:
        "The two interest shares add up to {sum}%, but the loan rate is {rate}% a month. Members will be credited their share of whatever is actually collected, but the rules read as if they disagree.",
      dailyTotalNote: "A member therefore pays {total} for each day.",
    },

    compliance: {
      title: "Contribution standing",
      description:
        "Who is up to date on the daily saving, who is close to a fine, and who already has one.",
      runChecks: "Run today's checks",
      runChecksHint:
        "Takes the service fee for days already paid for, assesses any fines due, and warns members who are close to one. Safe to run twice.",
      runningChecks: "Running…",
      runComplete:
        "Done: {fees} fee charge(s), {fines} fine(s) assessed, {reminders} member(s) warned.",

      tileUpToDate: "Up to date",
      tileBehind: "Behind",
      tileFinable: "Fine due",
      tileExempt: "Excused",
      tileArrears: "Total arrears",
      tileArrearsHint: "Savings and service fee not yet paid",
      tileFines: "Fines outstanding",
      tileFinesHint: "Assessed and not yet paid or waived",
      tileFeesPending: "Service fee to collect",
      tileFeesPendingHint: "For days paid for, not yet taken from balances",

      filterAll: "Everyone",
      searchPlaceholder: "Name, member number or reference",

      colMember: "Member",
      colStanding: "Standing",
      colBehind: "Behind",
      colArrears: "Arrears",
      colFines: "Fines",
      colToClear: "To clear",
      colSavings: "Savings",
      colActions: "Actions",

      daysBehind: "{days} day|{days} days",
      daysToFine: "{days} day to fine|{days} days to fine",
      fineTonight: "Fine due tonight",

      noneTitle: "No members match",
      noneBody: "Try a different filter or search.",
      allCurrentTitle: "Everybody is up to date",
      allCurrentBody: "No arrears and no outstanding fines in the association.",

      viewMember: "Open member",
      settleFine: "Collect from savings",
      settleFineConfirm:
        "Take {amount} from this member's savings to settle the fine? They are notified, and it appears on their statement.",
      waiveFine: "Waive",
      waiveFineTitle: "Waive this fine",
      waiveReason: "Why is this fine being waived?",
      excuseMember: "Excuse from contributing",
      excuseTitle: "Excuse this member",
      excuseBody:
        "No daily saving, service fee or fine accrues while the excuse holds. Their arrears stop growing from today.",
      excuseUntil: "Until",
      excuseUntilHint: "Leave blank for an open-ended excuse.",
      endExcuse: "End the excuse",
      obligationStart: "Day their saving started",
      obligationStartHint:
        "Changes how many days they are counted as owing. Use it when somebody was admitted late or was saving before joining.",
      insufficientFunds:
        "Their savings do not cover the fine. It stays outstanding until they contribute, or you waive it.",
    },

    fines: {
      title: "Fines",
      description:
        "Every fine the association has raised — for missed daily saving and for late warehouse-credit instalments — with what it was raised for and how it ended.",

      tileOutstanding: "Outstanding",
      tileOutstandingHint: "Raised and not yet paid or waived",
      tileMembers: "Members owing",
      tileMembersHint: "People with at least one unpaid fine",
      tileSettled: "Collected",
      tileSettledHint: "Paid, in cash or out of savings",
      tileWaived: "Waived",
      tileWaivedHint: "Forgiven by an officer, with a written reason",

      typeLabel: "Type",
      typeAll: "All fines",
      typeContribution: "Missed saving",
      typeWarehouse: "Late instalment",
      statusLabel: "Status",
      statusAll: "Any status",
      searchPlaceholder: "Name, member number or fine reference",

      state: {
        OUTSTANDING: "Unpaid",
        SETTLED: "Paid",
        WAIVED: "Waived",
        CANCELLED: "Withdrawn",
      },

      colMember: "Member",
      colWhy: "What for",
      colAmount: "Amount",
      colState: "Status",
      colAssessed: "Raised",
      colActions: "Actions",

      whyContribution: "{days} day behind on saving|{days} days behind on saving",
      whyWarehouse: "Instalment {number}, {days} day late|Instalment {number}, {days} days late",
      sum: "{rate}% of {arrears}",
      creditRef: "Credit {reference}",
      waivedBecause: "Waived: {reason}",

      noneTitle: "No fines match",
      noneBody: "Try a different type, status or search.",
      cleanTitle: "No fines have been raised",
      cleanBody:
        "Nobody in the association has been fined. Fines appear here the moment the nightly checks raise one.",

      warehouseSettleNote:
        "A late-instalment fine is cleared by paying the credit, not from savings — record the payment against the credit in the warehouse. It can still be waived here.",

      memberTitle: "My fines",
      memberDescription:
        "Every fine you have been given, what it was for, and how it was worked out.",
      memberOwed: "You owe",
      memberOwedHint: "Unpaid fines. Clearing these restores your standing.",
      memberPaid: "Already paid",
      memberPaidHint: "Fines settled from your savings or in cash",
      memberWaivedCount: "Waived",
      memberWaivedHint: "Forgiven by the committee",
      memberNothingTitle: "You have no fines",
      memberNothingBody:
        "Nothing has been raised against you. Keep your daily saving up to date and any warehouse instalments on time, and it stays that way.",
      memberHowToClear:
        "A fine for missed saving is taken from your savings once you have the balance, or the committee may waive it. A fine on a warehouse credit is cleared when you pay that instalment.",
      memberOpenRules: "See the rules",
      memberOpenWarehouse: "Open my warehouse credit",
    },

    funds: {
      title: "Whose money is whose",
      description:
        "Four different pots with four different owners. They are never added together, because only one of them is the association's to decide about.",

      membersSavings: "Members' savings",
      membersSavingsHint: "{savers} member(s) saving",
      membersSavingsNote:
        "Owed to the members who saved it. Not the association's money and never available to spend.",
      availableNow: "Free to withdraw",
      pledged: "Pledged against loans",

      serviceFee: "Platform service fee",
      serviceFeeHint: "Collected from {members} member(s)",
      serviceFeeNote:
        "Collected on the platform operator's behalf. It is not association income, cannot be lent or invested, and is owed until it is paid over.",
      collected: "Collected all time",
      remitted: "Paid over",
      owedToOperator: "Still owed to the operator",
      recordRemittance: "Record a payment to the operator",
      remittanceTitle: "Record fee remittance",
      remittanceBody:
        "This records that fees collected up to a date have been paid over. It does not move any money — record it after the payment has actually been made.",
      remittanceUpTo: "Fees collected up to",
      remittanceReference: "Payment reference (optional)",
      remittanceRecorded: "{count} charge(s) totalling {amount} marked as paid over.",
      nothingToRemit: "There are no unremitted service fees up to that date.",

      associationIncome: "The association's own income",
      associationIncomeHint: "All time, realised",
      associationIncomeNote:
        "The only pot the committee decides about. Earned, not held on anyone's behalf.",
      incomeLoanInterest: "Its share of loan interest",
      incomeLoanFees: "Loan fees",
      incomeLoanPenalties: "Late-payment penalties",
      incomeFines: "Contribution fines collected",
      incomeAccountFees: "Account fees",

      memberInterest: "Returned to members",
      memberInterestHint: "Under the interest-sharing rule",
      memberInterestNote:
        "Already paid out, into the savings of the members who borrowed. Shown here so the whole of the interest is accounted for.",
      fromLoans: "Borrowers' share of loan interest",
      otherInterest: "Other interest paid on savings",

      finesTitle: "Fines",
      finesAssessed: "Assessed",
      finesOutstanding: "Still owed",
      finesSettled: "Collected",
      finesWaived: "Waived",

      chartTitle: "The last twelve months",
      chartHint: "Service fee collected, and the two halves of the loan interest.",
      seriesFee: "Service fee",
      seriesAssociation: "Association's interest",
      seriesMember: "Members' interest",

      notATotal:
        "These figures are deliberately not added up. A liability, a sum held for somebody else and an income are three different things, and one total across them would mean nothing.",
      noAssociation: "Choose an association to see how its money is separated.",
    },
  },

  rw: {
    categories: {
      CONTRIBUTIONS: "Kuzigama buri munsi",
      PLATFORM_FEE: "Amafaranga ya serivisi",
      PENALTIES: "Gusigara inyuma",
      LENDING_ELIGIBILITY: "Uwemerewe kuguza",
      LOAN_TERMS: "Amabwiriza y'inguzanyo",
      INTEREST_SHARING: "Aho inyungu ijya",
      WAREHOUSE_CREDIT: "Kugura muri Warehouse ku ideni",
      GOVERNANCE: "Uko amategeko akora",
      OTHER: "Andi mategeko",
    },

    enforcement: {
      AUTOMATIC: "Rikurikizwa ryikora",
      ASSISTED: "Rigenzurwa n'umuyobozi",
      INFORMATIONAL: "Politiki yanditse",
      automaticHint: "Sisitemu irikurikiza yonyine — nta muntu ubyemeza.",
      assistedHint: "Sisitemu iragenzura, umuyobozi akemeza.",
      informationalHint: "Politiki yemeranyijweho. Sisitemu ntiyihatira.",
    },

    blockers: {
      LENDING_NOT_OPEN:
        "Ihuriro ritangira kugurizanya nyuma y'amezi {required} rizigama. Hasigaye amezi {remaining}.",
      MEMBERSHIP_TOO_SHORT:
        "Ugomba kuba umaze amezi {required} uzigama mbere yo kuguza. Umaze {current}, hasigaye {remaining}.",
      IN_ARREARS:
        "Usigaye inyuma iminsi {days} mu kuzigama kwa buri munsi. Bikemure ushobora gusaba uwo munsi nyine.",
      FINE_OUTSTANDING:
        "Ufite amahazabu ya {amount} atarishyurwa. Agomba kwishyurwa cyangwa kurekwa mbere yo kuguza.",
      ACTIVE_LOAN:
        "Usanzwe ufite inguzanyo igenda. Igomba kurangira mbere yo gufata indi.",
      AMOUNT: "Andika amafaranga ushaka kuguza.",
      COLLATERAL:
        "Kuguza {requested} bikura {above} mu kigega rusange cy'ihuriro. Ibyo bisaba ingwate ifite agaciro ka {required}; watanze {offered}, bityo hakenewe andi {shortfall}.",
      TERM_TOO_LONG:
        "Inguzanyo zishyurwa mu mezi {max}. Nta kongererwa igihe, bityo hitamo amezi {max} cyangwa macye.",
      NO_SAVINGS:
        "Nta buzigame ufite, bityo inguzanyo iyo ari yo yose yashingira ku ngwate gusa.",
      COLLATERAL_TO_RECORD:
        "{above} muri aya arenze igice cy'ubuzigame bwawe, bityo komite igomba kwandika ingwate ifite nibura agaciro ka {required}.",
    },

    standing: {
      CURRENT: "Wishyuye byose",
      AT_RISK: "Ihazabu iregereje",
      BEHIND: "Usigaye inyuma",
      FINABLE: "Ihazabu iratanzwe",
      EXEMPT: "Wasonewe",
    },

    units: {
      perDay: "ku munsi",
      days: "iminsi",
      months: "amezi",
      percent: "%",
      yes: "Yego",
      no: "Oya",
    },

    member: {
      title: "Amategeko yacu",
      description:
        "Ibyo ihuriro ryemeranyijweho byose, hamwe n'imibare nyayo sisitemu ikoresha — n'aho uhagaze kuri buri rimwe uyu munsi.",
      yourStanding: "Aho uhagaze uyu munsi",
      upToDate: "Wishyuye byose",
      upToDateBody:
        "Kuzigama kwawe kwa buri munsi kwishyuwe kose. Nta mwenda ufite kandi nta hazabu ikureba.",
      behindBy: "Usigaye inyuma iminsi {days}",
      behindBody:
        "Ishyura {amount} kugira ngo wishyure byose. Usigaje iminsi {remaining} mbere y'uko ihazabu ikureba.",
      fineWarning: "Ihazabu izakureba mu minsi {days}",
      fineWarningBody:
        "Usigaye inyuma iminsi {behind}. Ishyura {amount} mbere y'icyo gihe nta hazabu izongerwaho.",
      finedTitle: "Ihazabu yongeweho",
      finedBody:
        "Usigaye inyuma iminsi {behind}, urenze iminsi {grace} yemewe. Ishyura {amount} kugira ngo ukureho umwenda n'ihazabu icyarimwe.",
      exemptTitle: "Wasonewe kuzigama",
      exemptBody:
        "Nta kuzigama kwa buri munsi, nta mafaranga ya serivisi, nta n'ihazabu bikurikizwa kuri konti yawe muri iki gihe.",
      payToClear: "Ishyura kugira ngo ukureho byose",
      payToClearHint: "Ubuzigame busibye, amafaranga ya serivisi n'ihazabu iyo ari yo yose, byateranyijwe",
      daysCovered: "Iminsi wishyuriye",
      daysCoveredHint: "Muri iminsi {owed} kuva winjira",
      daysOwed: "Iminsi kuva watangira",
      oneDayCosts: "Umunsi umwe ugutwara",
      oneDayCostsHint: "{savings} bakuzigamira, hiyongereyeho {fee} ya serivisi",
      dailyCostRule: "Umunsi umwe wo kuba umunyamuryango ugutwara {total}",
      dailyCostRuleBody:
        "{savings} abikwa muri konti yawe bwite kandi akomeza kuba ayawe. {fee} ni amafaranga ya serivisi, si ubuzigame. Ni amategeko abiri atandukanye hasi aha, ariko urimo yombi buri munsi — wishyura {savings} gusa usigara inyuma {fee} ku munsi, kandi ni byo byiyongera bigatuma uhabwa ihazabu.",

      yourFines: "Amahazabu yawe",
      fineOn: "Yatanzwe ku wa {date}, nyuma y'iminsi {days} usigaye inyuma",
      fineWaived: "Yarekewe",
      fineSettled: "Yishyuwe",
      fineOutstanding: "Iracyariho",
      noFines: "Nta hazabu",
      noFinesBody:
        "Ntabwo wigeze uhabwa ihazabu. Komeza uzigame buri munsi ntuzayihabwa.",

      borrowingTitle: "Icyo ushobora kuguza",
      borrowingDescription:
        "Byabazwe hashingiwe ku buzigame bwawe n'amategeko y'ihuriro, uko ari uyu munsi.",
      withoutCollateral: "Utatanze ingwate",
      withoutCollateralHint: "{percent}% by'ubuzigame bwawe bwa {savings}",
      aboveThat: "Hejuru y'ibyo",
      aboveThatValue: "Ingwate irasabwa",
      aboveThatHint:
        "Ibirenzeho biva mu kigega rusange cy'ihuriro kandi bisaba ingwate ifite agaciro kangana.",
      canBorrowNow: "Ushobora gusaba inguzanyo",
      cannotBorrowYet: "Ntushobora kuguza ubu",
      whatIsStopping: "Ibigomba kubanza gukorwa",
      monthsToWait: "Hasigaye amezi {months}",

      exampleTitle: "Icyo inguzanyo yagutwara",
      exampleBody:
        "Kuguza {principal} mu mezi {months} ku gipimo cya {rate}% ku kwezi:",
      exampleYouRepay: "Wishyura yose hamwe",
      exampleComesBack: "Bigarukira mu buzigame bwawe",
      exampleRealCost: "Bityo inguzanyo ikugura",

      theRules: "Amategeko yose",
      lastChanged: "Yahinduwe bwa nyuma ku wa {date}",
      version: "Verisiyo {version}",
      withdrawn: "Ryakuweho",
      noRules: "Amategeko ntiyaratangazwa",
      noRulesBody:
        "Saba komite y'ihuriro gufungura igitabo cy'amategeko kugira ngo agaragare hano.",
      howToPay: "Uko wishyura",
      howToPayBody:
        "Andika nimero yawe y'ubwishyu {reference} kuri buri bwishyu. Ni bwo buryo amafaranga yawe ashyirwa kuri konti yawe.",
    },

    admin: {
      title: "Igitabo cy'amategeko",
      description:
        "Amategeko buri munyamuryango abamo. Guhindura umubare hano bitangira gukurikizwa ako kanya — kandi buri munyamuryango asoma iyi paji imwe.",
      addRule: "Ongeraho itegeko",
      editRule: "Hindura itegeko",
      history: "Amateka",
      historyFor: "Impinduka za “{rule}”",
      noHistory: "Iri tegeko ntiryigeze rihinduka.",
      changedBy: "na {name}",
      changedTo: "Umubare wari {value}",
      systemRule: "Rikurikizwa",
      systemRuleHint:
        "Sisitemu isoma iri tegeko. Guhindura umubare bihindura ibizabaho ejo.",
      customRule: "Itegeko ryanyu",
      customRuleHint:
        "Ryanditswe na komite kandi ryerekwa abanyamuryango. Sisitemu ntiryihatira.",
      active: "Rirakurikizwa",
      inactive: "Ryarakuweho",
      deactivate: "Kuraho iri tegeko",
      reactivate: "Rigarure mu bikurikizwa",
      deleteRule: "Siba",
      deleteConfirm:
        "Gusiba iri tegeko burundu? Abanyamuryango ntibazongera kuribona. Niba ryarakurikizwaga, hitamo kurikuraho kugira ngo inyandiko isigare.",

      invalidValues: "Amategeko {count} ntiyashoboye gusomwa",
      invalidValuesBody:
        "Sisitemu ikoresha umubare usanzwe kuri aya kugeza akosowe. Fungura buri rimwe urebe umubare waryo.",

      summaryDaily: "Kuzigama kwa buri munsi",
      summaryDailyHint: "Hiyongereyeho {fee} ya serivisi — {total} ku munsi yose hamwe",
      summaryFee: "Amafaranga ya serivisi",
      summaryFeeHint: "Ku munsi. Akusanyirizwa urubuga, si inyungu z'ihuriro.",
      summaryFine: "Ihazabu nyuma y'iminsi {days}",
      summaryFineHint: "Ku buzigame butarishyuwe. {example} ku cyumweru gisibye.",
      summaryBorrowing: "Kuguza ushingiye ku buzigame",
      summaryBorrowingHint: "Hejuru y'ibyo, ingwate irasabwa",
      summaryInterest: "{rate}% ku kwezi",
      summaryInterestHint: "{member} bijya mu buzigame bw'uwaguze, {association} ku ihuriro",

      fieldValue: "Umubare",
      fieldValueHint: "Umubare sisitemu ikurikiza guhera ubwo ubitse.",
      fieldTitleEn: "Umutwe (Icyongereza)",
      fieldTitleRw: "Umutwe (Ikinyarwanda)",
      fieldBodyEn: "Ibisobanuro (Icyongereza)",
      fieldBodyRw: "Ibisobanuro (Ikinyarwanda)",
      fieldCategory: "Itsinda",
      fieldValueType: "Ubwoko bw'umubare",
      fieldReason: "Impamvu y'impinduka",
      fieldReasonHint:
        "Ibikwa burundu kandi bigaragara mu mateka y'itegeko. Abanyamuryango bashobora kubibwirwa.",
      fieldNotify: "Menyesha abanyamuryango iyi mpinduka",
      fieldNotifyHint: "Bohereza ubutumwa muri porogaramu. Nta SMS, bityo nta kiguzi.",
      fieldActive: "Rirakurikizwa",

      saved: "Itegeko ryahinduwe",
      added: "Itegeko ryongewemo",
      removed: "Itegeko ryasibwe",
      cannotDisable:
        "Iri tegeko rikurikizwa ryikora ntirishobora guhagarikwa. Ahubwo hindura umubare waryo.",

      interestMismatch:
        "Ibice byombi by'inyungu biteranya bikagera kuri {sum}%, ariko igipimo cy'inguzanyo ni {rate}% ku kwezi. Abanyamuryango bazahabwa igice cyabo cy'ibyakusanyijwe koko, ariko amategeko asa n'atavuga rumwe.",
      dailyTotalNote: "Bityo umunyamuryango yishyura {total} kuri buri munsi.",
    },

    compliance: {
      title: "Uko kuzigama guhagaze",
      description:
        "Uwishyuye byose mu kuzigama kwa buri munsi, uwegereje ihazabu, n'uwayimaze guhabwa.",
      runChecks: "Kora igenzura ry'uyu munsi",
      runChecksHint:
        "Rifata amafaranga ya serivisi ku minsi yamaze kwishyurwa, rigatanga amahazabu akwiye, kandi rikaburira abegereje kuyahabwa. Nta kibazo no kurikora kabiri.",
      runningChecks: "Birakorwa…",
      runComplete:
        "Byarangiye: serivisi {fees}, amahazabu {fines} yatanzwe, abanyamuryango {reminders} baburiwe.",

      tileUpToDate: "Bishyuye byose",
      tileBehind: "Basigaye inyuma",
      tileFinable: "Bagomba guhabwa ihazabu",
      tileExempt: "Basonewe",
      tileArrears: "Umwenda wose",
      tileArrearsHint: "Ubuzigame n'amafaranga ya serivisi bitarishyurwa",
      tileFines: "Amahazabu akiriho",
      tileFinesHint: "Yatanzwe ntiyishyurwe cyangwa ngo arekwe",
      tileFeesPending: "Serivisi igomba gukusanywa",
      tileFeesPendingHint: "Ku minsi yishyuwe, itarakurwa muri konti",

      filterAll: "Bose",
      searchPlaceholder: "Izina, nimero y'umunyamuryango cyangwa iy'ubwishyu",

      colMember: "Umunyamuryango",
      colStanding: "Uko ahagaze",
      colBehind: "Asigaye",
      colArrears: "Umwenda",
      colFines: "Amahazabu",
      colToClear: "Kugira ngo akureho",
      colSavings: "Ubuzigame",
      colActions: "Ibikorwa",

      daysBehind: "umunsi {days}|iminsi {days}",
      daysToFine: "umunsi {days} ku ihazabu|iminsi {days} ku ihazabu",
      fineTonight: "Ihazabu iratangwa muri iri joro",

      noneTitle: "Nta munyamuryango uhuye",
      noneBody: "Gerageza ubundi buryo bwo gushakisha.",
      allCurrentTitle: "Buri wese yishyuye byose",
      allCurrentBody: "Nta mwenda kandi nta hazabu iri mu ihuriro.",

      viewMember: "Fungura umunyamuryango",
      settleFine: "Kuraho mu buzigame",
      settleFineConfirm:
        "Gukura {amount} mu buzigame bw'uyu munyamuryango kugira ngo ihazabu yishyurwe? Aramenyeshwa, kandi bigaragara ku nyandiko ya konti ye.",
      waiveFine: "Reka ihazabu",
      waiveFineTitle: "Reka iyi hazabu",
      waiveReason: "Kuki iyi hazabu irekwa?",
      excuseMember: "Sonera kuzigama",
      excuseTitle: "Sonera uyu munyamuryango",
      excuseBody:
        "Nta kuzigama kwa buri munsi, nta serivisi, nta n'ihazabu byiyongera igihe isonerwa rikomeje. Umwenda we ntukomeza kwiyongera guhera uyu munsi.",
      excuseUntil: "Kugeza",
      excuseUntilHint: "Siga ubusa niba isonerwa ridafite igihe ntarengwa.",
      endExcuse: "Hagarika isonerwa",
      obligationStart: "Umunsi kuzigama kwe kwatangiye",
      obligationStartHint:
        "Bihindura umubare w'iminsi abarwaho. Bikoreshwa iyo umuntu yinjiye atinze cyangwa yari asanzwe azigama mbere yo kwinjira.",
      insufficientFunds:
        "Ubuzigame bwe ntibuhagije kuri iyo hazabu. Iguma iriho kugeza azigamye, cyangwa uyirekeye.",
    },

    fines: {
      title: "Amahazabu",
      description:
        "Amahazabu yose ihuriro ryatanze — ku kuzigama kwa buri munsi kwabuze no ku kwishyura gutinze kw'ububiko — hamwe n'impamvu yayo n'uko yarangiye.",

      tileOutstanding: "Akiriho",
      tileOutstandingHint: "Yatanzwe ntiyishyurwe cyangwa ngo arekwe",
      tileMembers: "Abafite umwenda",
      tileMembersHint: "Abafite nibura ihazabu imwe itishyuwe",
      tileSettled: "Yishyuwe",
      tileSettledHint: "Yishyuwe, mu mafaranga cyangwa mu buzigame",
      tileWaived: "Yarekewe",
      tileWaivedHint: "Yarekewe n'umuyobozi, hari impamvu yanditse",

      typeLabel: "Ubwoko",
      typeAll: "Amahazabu yose",
      typeContribution: "Kuzigama kwabuze",
      typeWarehouse: "Kwishyura gutinze",
      statusLabel: "Uko ihagaze",
      statusAll: "Uko yaba ihagaze kose",
      searchPlaceholder: "Izina, nimero y'umunyamuryango cyangwa iy'ihazabu",

      state: {
        OUTSTANDING: "Itishyuwe",
        SETTLED: "Yishyuwe",
        WAIVED: "Yarekewe",
        CANCELLED: "Yakuweho",
      },

      colMember: "Umunyamuryango",
      colWhy: "Impamvu",
      colAmount: "Umubare",
      colState: "Uko ihagaze",
      colAssessed: "Yatanzwe",
      colActions: "Ibikorwa",

      whyContribution: "Asigaye umunsi {days} mu kuzigama|Asigaye iminsi {days} mu kuzigama",
      whyWarehouse: "Kwishyura kwa {number}, gutinze umunsi {days}|Kwishyura kwa {number}, gutinze iminsi {days}",
      sum: "{rate}% bya {arrears}",
      creditRef: "Ideni {reference}",
      waivedBecause: "Yarekewe: {reason}",

      noneTitle: "Nta hazabu ihuye",
      noneBody: "Gerageza ubundi bwoko, ubundi buryo cyangwa irindi shakisha.",
      cleanTitle: "Nta hazabu yatanzwe",
      cleanBody:
        "Nta munyamuryango wahawe ihazabu. Amahazabu agaragara hano ako kanya igenzura rya buri joro riyatanze.",

      warehouseSettleNote:
        "Ihazabu yo gutinda kwishyura ivanwaho wishyuye ideni, ntivanwa mu buzigame — andika ubwishyu ku ideni mu bubiko. Ariko ishobora kurekerwa hano.",

      memberTitle: "Amahazabu yanjye",
      memberDescription:
        "Ihazabu yose wahawe, impamvu yayo, n'uko yabaruwe.",
      memberOwed: "Ufite umwenda wa",
      memberOwedHint: "Amahazabu atishyuwe. Kuyishyura bigarura uko uhagaze.",
      memberPaid: "Wamaze kwishyura",
      memberPaidHint: "Amahazabu yishyuwe mu buzigame cyangwa mu mafaranga",
      memberWaivedCount: "Yarekewe",
      memberWaivedHint: "Yarekewe n'ubuyobozi",
      memberNothingTitle: "Nta hazabu ufite",
      memberNothingBody:
        "Nta kintu wahaniwe. Komeza kuzigama buri munsi kandi wishyure ku gihe amadeni y'ububiko, bizakomeza gutya.",
      memberHowToClear:
        "Ihazabu yo kutazigama ikurwa mu buzigame bwawe iyo ufite amafaranga ahagije, cyangwa ubuyobozi bushobora kuyireka. Ihazabu y'ideni ry'ububiko ivaho iyo wishyuye ukwo kwishyura.",
      memberOpenRules: "Reba amategeko",
      memberOpenWarehouse: "Fungura ideni ryanjye ry'ububiko",
    },

    funds: {
      title: "Amafaranga y'undi n'ay'undi",
      description:
        "Ibigega bine bitandukanye bifite ba nyirabyo bane batandukanye. Ntibiteranywa na rimwe, kuko ni kimwe gusa ihuriro rifitiye ububasha.",

      membersSavings: "Ubuzigame bw'abanyamuryango",
      membersSavingsHint: "Abanyamuryango {savers} bazigama",
      membersSavingsNote:
        "Bugenewe abanyamuryango babuzigamye. Si amafaranga y'ihuriro kandi ntashobora gukoreshwa.",
      availableNow: "Bushobora kubikuzwa",
      pledged: "Buri ku ngwate y'inguzanyo",

      serviceFee: "Amafaranga ya serivisi y'urubuga",
      serviceFeeHint: "Yakusanyijwe ku banyamuryango {members}",
      serviceFeeNote:
        "Akusanyirizwa nyir'urubuga. Si inyungu z'ihuriro, ntashobora kugurizwa cyangwa gushorwa, kandi ni umwenda kugeza yishyuwe.",
      collected: "Yakusanyijwe kuva kera",
      remitted: "Yishyuwe",
      owedToOperator: "Akiri umwenda kuri nyir'urubuga",
      recordRemittance: "Andika ubwishyu bwahawe nyir'urubuga",
      remittanceTitle: "Andika ubwishyu bwa serivisi",
      remittanceBody:
        "Ibi byandika ko amafaranga yakusanyijwe kugeza ku itariki yishyuwe. Ntibimura amafaranga — byandike nyuma y'uko ubwishyu bwakozwe koko.",
      remittanceUpTo: "Amafaranga yakusanyijwe kugeza",
      remittanceReference: "Nimero y'ubwishyu (si ngombwa)",
      remittanceRecorded: "Ubwishyu {count} bungana na {amount} bwanditswe nk'ubwishyuwe.",
      nothingToRemit: "Nta mafaranga ya serivisi atarishyurwa kugeza kuri iyo tariki.",

      associationIncome: "Inyungu z'ihuriro ubwaryo",
      associationIncomeHint: "Kuva kera, zinjiye koko",
      associationIncomeNote:
        "Ni cyo kigega komite ifitiye ububasha. Cyinjijwe, ntikibikirwa undi muntu.",
      incomeLoanInterest: "Igice cyaryo cy'inyungu z'inguzanyo",
      incomeLoanFees: "Amafaranga y'inguzanyo",
      incomeLoanPenalties: "Ihazabu yo gutinda kwishyura",
      incomeFines: "Amahazabu yo kuzigama yakusanyijwe",
      incomeAccountFees: "Amafaranga ya konti",

      memberInterest: "Byasubijwe abanyamuryango",
      memberInterestHint: "Hakurikijwe itegeko ryo kugabana inyungu",
      memberInterestNote:
        "Byamaze gutangwa, bijya mu buzigame bw'abanyamuryango baguze. Bigaragazwa hano kugira ngo inyungu yose ibarwe.",
      fromLoans: "Igice cy'abaguze mu nyungu z'inguzanyo",
      otherInterest: "Izindi nyungu zatanzwe ku buzigame",

      finesTitle: "Amahazabu",
      finesAssessed: "Yatanzwe",
      finesOutstanding: "Akiriho",
      finesSettled: "Yakusanyijwe",
      finesWaived: "Yarekewe",

      chartTitle: "Amezi cumi n'abiri ashize",
      chartHint: "Serivisi yakusanyijwe, n'ibice byombi by'inyungu z'inguzanyo.",
      seriesFee: "Serivisi",
      seriesAssociation: "Inyungu z'ihuriro",
      seriesMember: "Inyungu z'abanyamuryango",

      notATotal:
        "Iyi mibare ntiteranywa ku bushake. Umwenda, amafaranga abikiwe undi muntu, n'inyungu ni ibintu bitatu bitandukanye, kandi igiteranyo cyabyo nta cyo cyavuga.",
      noAssociation: "Hitamo ihuriro urebe uko amafaranga yaryo atandukanyijwe.",
    },
  },
};
