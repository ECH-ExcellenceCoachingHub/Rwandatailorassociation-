import type { Locale } from "@/types";

/**
 * The screens every signed-in person shares, whatever their role: the account
 * status page and the sign-in QR code.
 *
 * Kept out of `member.ts` because an administrator has one of these cards too,
 * and copy that says "your savings" would be wrong on their screen. The
 * member-specific figures on the status page live behind their own keys.
 *
 * The QR wording carries a security warning that has to survive translation
 * intact. "Umuntu wese ufite iyi foto ashobora kwinjira" is not a softened
 * version of "anyone holding this image can sign in" — it says the same thing,
 * because a member who does not understand that will photograph the card into
 * a WhatsApp group.
 */
export interface AccountCopy {
  status: {
    title: string;
    description: string;
    signedInWithQr: string;
    accountState: string;
    identityCheck: string;
    memberNumber: string;
    paymentReference: string;
    paymentReferenceHint: string;
    memberSince: string;
    notRecorded: string;
    outstandingLoan: string;
    nextRepayment: string;
    nothingOwed: string;
    noRepaymentScheduled: string;
    goodStandingTitle: string;
    overdueTitle: string;
    overdueBody: string;
    suspendedTitle: string;
    suspendedBody: string;
    staffTitle: string;
    staffBody: string;
    openSavingsBody: string;
    openSavingsAction: string;
    opening: string;
    openSavingsFailed: string;
    continueToDashboard: string;
    myQrCode: string;
    noSavingsAccount: string;

    // Your money, and what it lets you borrow --------------------------------
    moneyTitle: string;
    balance: string;
    balanceHint: string;
    availableBalance: string;
    availableBalanceHint: string;
    /// The own-savings share of the available balance: what the rulebook lets
    /// a member borrow without pledging anything.
    loanLimit: string;
    loanLimitHint: string;
    loanLimitBlocked: string;
    applyForLoan: string;
    none: string;
    finesPaid: string;

    // Who the association thinks you are ------------------------------------
    yourDetails: string;
    fullName: string;
    telephone: string;
    emailAddress: string;
    notProvided: string;

    // Imigabane — the shareholding -----------------------------------------
    shareholdingTitle: string;
    shareholdingHint: string;
    sharesHeld: string;
    sharesDaysHint: string;
    dailyRate: string;
    perDay: string;
    /// What a day of membership actually costs, and the two parts of it. Split
    /// out because a member shown only the savings half pays exactly that and
    /// then finds themselves in arrears by a fee nobody named.
    dailyCost: string;
    dailyCostHint: string;
    paidAhead: string;
    paidAheadHint: string;
    behindBy: string;
    behindByHint: string;
    finesOwed: string;
    contributionStatus: string;

    // Discipline — the fine, before and after it lands ----------------------
    fineRiskTitle: string;
    fineRiskBody: string;
    fineTonightTitle: string;
    fineTonightBody: string;
    finesTitle: string;
    finesSeeAll: string;
    finesCleared: string;

    // What has been paid in --------------------------------------------------
    contributionsTitle: string;
    totalContributed: string;
    totalContributedHint: string;
    totalWithdrawn: string;
    interestEarned: string;
    feesCharged: string;
    accountNumber: string;
    lockedFunds: string;
    lockedFundsHint: string;

    // Guarantees -------------------------------------------------------------
    guaranteeRequestsTitle: string;
    guaranteeRequestsHint: string;
    guaranteeRequestLine: string;
    guaranteePurpose: string;
    guaranteeYourAvailable: string;
    guaranteeAccept: string;
    guaranteeDecline: string;
    guaranteeAcceptTitle: string;
    guaranteeAcceptBody: string;
    guaranteeAcceptConfirm: string;
    guaranteeDeclineTitle: string;
    guaranteeDeclineBody: string;
    guaranteeDeclineReason: string;
    guaranteeFailed: string;
    guaranteesGivenTitle: string;
    guaranteesGivenHint: string;
    guaranteeHeldTotal: string;
    guaranteeHeldTotalHint: string;
    guaranteeForLoan: string;
    guaranteeStillOwed: string;
    guaranteeAwaitingDecision: string;
    guaranteeReleasedOn: string;
    guaranteeYouDeclined: string;
    myGuarantorsTitle: string;
    myGuarantorsHint: string;
    myGuarantorWaiting: string;
    myGuarantorHolding: string;
    myGuarantorDeclined: string;

    // Borrowing --------------------------------------------------------------
    borrowingTitle: string;
    amountBorrowed: string;
    amountRepaid: string;
    amountRemaining: string;
    currentLoan: string;
    loanCount: string;
    neverBorrowed: string;
    acrossAllLoans: string;

    // The warehouse ----------------------------------------------------------
    warehouseTitle: string;
    warehouseHint: string;
    warehouseEmpty: string;
    goodsTaken: string;
    goodsStillHeld: string;
    goodsOwed: string;
    goodsPaid: string;
    openIssues: string;
    returnOverdue: string;
    dueBack: string;
    issuedOn: string;
    againstLoan: string;
    termsPurchase: string;
    termsLoanOut: string;
    termsAgainstLoan: string;
    termsFreeIssue: string;

    // Everything that has moved ---------------------------------------------
    transactionsTitle: string;
    transactionsEmpty: string;
    showingRecent: string;
    viewFullStatement: string;
    balanceColumn: string;
    recentActivity: string;
  };
  qr: {
    title: string;
    description: string;
    noCodeTitle: string;
    noCodeBody: string;
    generate: string;
    generating: string;
    regenerate: string;
    revoke: string;
    working: string;
    regenerateConfirmTitle: string;
    regenerateConfirmBody: string;
    regenerateConfirmAction: string;
    revokeConfirmTitle: string;
    revokeConfirmBody: string;
    revokeConfirmAction: string;
    downloadPng: string;
    downloadSvg: string;
    print: string;
    issuedOn: string;
    validUntil: string;
    expiringSoon: string;
    lastUsed: string;
    neverUsed: string;
    timesUsed: string;
    howToTitle: string;
    howToStepOne: string;
    howToStepTwo: string;
    howToStepThree: string;
    keepSafeTitle: string;
    keepSafeBody: string;
    scanToSignIn: string;
    cardHolder: string;
    failedTitle: string;
    failedBody: string;
  };
  qrInvalid: {
    title: string;
    body: string;
    throttledTitle: string;
    throttledBody: string;
    whatToDo: string;
    signIn: string;
    help: string;
  };
  card: {
    title: string;
    description: string;
    previewTitle: string;
    previewBody: string;
    frontTitle: string;
    frontBody: string;
    backTitle: string;
    backBody: string;
    download: string;
    preparing: string;
    failed: string;
    printTitle: string;
    printBody: string;
    photoTitle: string;
    photoBody: string;
    choosePhoto: string;
    replacePhoto: string;
    removePhoto: string;
    uploading: string;
    photoFailed: string;
    photoTooSmall: string;
    noPhotoYet: string;
    officeTitle: string;
    officeBody: string;
  };
  /// Editing your own details. Shared rather than member-only because an
  /// administrator's name and phone number change too, and the page that lets
  /// them fix it is the same page.
  edit: {
    title: string;
    description: string;
    contactSection: string;
    contactHint: string;
    personalSection: string;
    personalHint: string;
    livelihoodSection: string;
    addressSection: string;
    payoutSection: string;
    payoutHint: string;
    nextOfKinSection: string;
    nextOfKinName: string;
    nextOfKinPhone: string;
    nextOfKinRelation: string;
    save: string;
    saving: string;
    saved: string;
    nothingChanged: string;
    failed: string;
    cancel: string;
    matchingWarning: string;
    verificationWarning: string;
    nationalIdLocked: string;
    adminOnlyTitle: string;
    adminOnlyBody: string;
    editProfile: string;
    backToProfile: string;
  };
}

export const account: Record<Locale, AccountCopy> = {
  en: {
    status: {
      title: "Your account",
      description: "Where your membership and your money stand today.",
      signedInWithQr: "Signed in with your QR code.",
      accountState: "Account",
      identityCheck: "Identity check",
      memberNumber: "Membership number",
      paymentReference: "Payment reference",
      paymentReferenceHint:
        "Quote this on every payment so it reaches your account the same day.",
      memberSince: "Member since",
      notRecorded: "Not recorded",
      outstandingLoan: "Loan outstanding",
      nextRepayment: "Next repayment",
      nothingOwed: "Nothing owed",
      noRepaymentScheduled: "None scheduled",
      goodStandingTitle: "Your account is in good standing",
      overdueTitle: "A repayment is overdue",
      overdueBody:
        "Your loan is {days} days past due. Settle it to keep your account in good standing.",
      suspendedTitle: "Your membership is suspended",
      suspendedBody:
        "You can still see your records, but deposits, withdrawals and loan applications are paused. Speak to an administrator.",
      staffTitle: "Staff account",
      staffBody:
        "This account administers the association rather than holding savings of its own.",
      openSavingsBody:
        "Staff save with the association too. Open a savings account under this same login and your contributions, loans and statements appear here alongside your administrative work.",
      openSavingsAction: "Open my savings account",
      opening: "Opening…",
      openSavingsFailed:
        "The account could not be opened. Please try again, or ask another administrator.",
      continueToDashboard: "Go to my dashboard",
      myQrCode: "My QR code",
      noSavingsAccount: "No savings account has been opened yet.",

      moneyTitle: "Your money",
      balance: "Balance",
      balanceHint: "Everything on your savings account",
      availableBalance: "Available balance",
      availableBalanceHint: "Your balance, less anything held against a loan",
      loanLimit: "Loan you can get",
      loanLimitHint: "{percent}% of your available balance ({basis})",
      loanLimitBlocked: "You cannot borrow yet",
      applyForLoan: "Apply for a loan",
      none: "None",
      finesPaid: "Fines paid",

      yourDetails: "Your details",
      fullName: "Full name",
      telephone: "Telephone",
      emailAddress: "Email",
      notProvided: "Not provided",

      shareholdingTitle: "Your shares",
      shareholdingHint:
        "Your shares grow by one day's saving for every day you have paid for. Money paid in advance is still yours — it becomes shares as those days arrive.",
      sharesHeld: "Shares held",
      sharesDaysHint: "{days} days at {rate}",
      dailyRate: "Daily saving",
      perDay: "per day",
      dailyCost: "One day costs",
      dailyCostHint: "{savings} becomes your shares + {fee} service fee per share",
      paidAhead: "Paid in advance",
      paidAheadHint: "{days} days ahead",
      behindBy: "Behind by",
      behindByHint: "{days} days not yet paid",
      finesOwed: "Fines owed",
      contributionStatus: "Contribution standing",

      fineRiskTitle: "A fine lands in {days} day|A fine lands in {days} days",
      fineRiskBody:
        "You are {behind} day(s) behind. Pay {amount} before then and no fine is raised.",
      fineTonightTitle: "A fine is due tonight",
      fineTonightBody:
        "You are {behind} day(s) behind. Paying {amount} today is the last chance to avoid it.",
      finesTitle: "Fines against you",
      finesSeeAll: "See all my fines",
      finesCleared: "No unpaid fines",

      contributionsTitle: "What you have paid in",
      totalContributed: "Total paid in",
      totalContributedHint: "Everything ever credited to your account",
      totalWithdrawn: "Total withdrawn",
      interestEarned: "Interest earned",
      feesCharged: "Fees charged",
      accountNumber: "Account number",
      lockedFunds: "Held from your balance",
      lockedFundsHint:
        "Part of your balance you cannot use right now: money you pledged as a guarantor, and withdrawals being processed.",

      guaranteeRequestsTitle: "Asked to guarantee a loan",
      guaranteeRequestsHint:
        "A member has named you as a guarantor. If you accept, the amount is held from your savings until they have repaid the whole loan, and then released back to you. They repay the loan, not you.",
      guaranteeRequestLine: "Loan of {loan} over {months} months · {reference}",
      guaranteePurpose: "For: {purpose}",
      guaranteeYourAvailable: "Your available balance is {available}.",
      guaranteeAccept: "Accept",
      guaranteeDecline: "Decline",
      guaranteeAcceptTitle: "Guarantee {name}'s loan?",
      guaranteeAcceptBody:
        "{amount} will be held from your savings. You cannot withdraw it or borrow against it until {name} has repaid the whole loan. Then it is released back to you.",
      guaranteeAcceptConfirm: "Accept and hold {amount}",
      guaranteeDeclineTitle: "Decline this request?",
      guaranteeDeclineBody:
        "Nothing is held from your savings. {name} will be told that you declined.",
      guaranteeDeclineReason: "Reason (optional)",
      guaranteeFailed: "Your answer could not be saved. Please try again.",
      guaranteesGivenTitle: "Loans you guarantee",
      guaranteesGivenHint:
        "Money held from your savings for other members' loans. Each amount comes back to you when that loan is fully repaid.",
      guaranteeHeldTotal: "Held for others",
      guaranteeHeldTotalHint: "Part of the amount held from your balance above",
      guaranteeForLoan: "For {name}",
      guaranteeStillOwed: "{reference} · {outstanding} still to repay",
      guaranteeAwaitingDecision: "{reference} · waiting for the committee",
      guaranteeReleasedOn: "{reference} · released {date}",
      guaranteeYouDeclined: "{reference} · you declined",
      myGuarantorsTitle: "Your guarantors",
      myGuarantorsHint:
        "Members covering the part of your loan above your own share. Their money is held until you repay the whole loan.",
      myGuarantorWaiting: "Has not answered yet",
      myGuarantorHolding: "Holding this amount for you",
      myGuarantorDeclined: "Declined",

      borrowingTitle: "Your borrowing",
      amountBorrowed: "Borrowed",
      amountRepaid: "Repaid",
      amountRemaining: "Still owed",
      currentLoan: "Current loan",
      loanCount: "{count} loan|{count} loans",
      neverBorrowed: "You have not taken a loan yet.",
      acrossAllLoans: "Across all your loans",

      warehouseTitle: "Goods from the warehouse",
      warehouseHint:
        "Fabric, machines and tools issued to you by the association, and what is still owed on them.",
      warehouseEmpty: "You have not taken anything from the warehouse.",
      goodsTaken: "Value taken",
      goodsStillHeld: "Still with you",
      goodsOwed: "Still owed",
      goodsPaid: "Paid for",
      openIssues: "{count} open issue|{count} open issues",
      returnOverdue: "Return overdue",
      dueBack: "Due back",
      issuedOn: "Issued",
      againstLoan: "Against loan {reference}",
      termsPurchase: "Bought",
      termsLoanOut: "Borrowed",
      termsAgainstLoan: "Against a loan",
      termsFreeIssue: "Given",

      transactionsTitle: "Everything on your account",
      transactionsEmpty: "Nothing has moved on your account yet.",
      showingRecent: "Showing the most recent {shown} of {total}",
      viewFullStatement: "See the full statement",
      balanceColumn: "Balance",
      recentActivity: "Recent activity",
    },
    qr: {
      title: "My sign-in QR code",
      description:
        "Scan this with your phone camera to open your account without typing a password.",
      noCodeTitle: "You do not have a QR code yet",
      noCodeBody:
        "Generate one, then print it or save the image to your phone. Scanning it takes you straight to your account.",
      generate: "Generate my QR code",
      generating: "Generating…",
      regenerate: "Replace with a new code",
      revoke: "Turn off QR sign-in",
      working: "Please wait…",
      regenerateConfirmTitle: "Replace your QR code?",
      regenerateConfirmBody:
        "The code you have now will stop working immediately, including any copy you have printed. Do this if your card has been lost or seen by someone else.",
      regenerateConfirmAction: "Replace it",
      revokeConfirmTitle: "Turn off QR sign-in?",
      revokeConfirmBody:
        "Your code will stop working immediately and you will sign in with your password until you generate a new one.",
      revokeConfirmAction: "Turn it off",
      downloadPng: "Download image",
      downloadSvg: "Download for printing",
      print: "Print card",
      issuedOn: "Created {date}",
      validUntil: "Valid until {date}",
      expiringSoon: "Expires in {days} days — replace it before then.",
      lastUsed: "Last used {date}",
      neverUsed: "Not used yet",
      timesUsed: "Used {count} time|Used {count} times",
      howToTitle: "How to use it",
      howToStepOne: "Open the camera on your phone.",
      howToStepTwo: "Point it at the code until a link appears.",
      howToStepThree: "Tap the link — your account opens straight away.",
      keepSafeTitle: "Keep this code to yourself",
      keepSafeBody:
        "Anyone holding this image can open your account. Do not send it in a message or post it in a group. If you lose it, replace it here — the old one stops working at once.",
      scanToSignIn: "Scan to sign in",
      cardHolder: "Member",
      failedTitle: "That did not work",
      failedBody: "Please try again. If it keeps failing, contact an administrator.",
    },
    qrInvalid: {
      title: "This QR code did not work",
      body:
        "It may have expired, or it may have been replaced by a newer one. Your account is fine — you just need to sign in another way.",
      throttledTitle: "Too many attempts",
      throttledBody:
        "Too many codes have been scanned from this connection. Wait a few minutes and try again.",
      whatToDo: "Sign in with your password, then generate a new code from your account.",
      signIn: "Sign in with a password",
      help: "If you did not scan this yourself, tell an administrator.",
    },
    card: {
      title: "My membership card",
      description:
        "Your association card, ready to print. The front carries your name, your photograph and your sign-in code; the back is the same on every card.",
      previewTitle: "How your card will look",
      previewBody:
        "Exactly what the two PDFs contain. If your photograph or telephone number is wrong here, it will be wrong on the printed card.",
      frontTitle: "Front of card",
      frontBody:
        "Your name, the office you hold, your telephone number and your QR code.",
      backTitle: "Back of card",
      backBody:
        "The association's notice and the numbers to ring if your card is found. Identical on every member's card.",
      download: "Download PDF",
      preparing: "Preparing…",
      failed: "The card could not be prepared. Try again.",
      printTitle: "Printing this card",
      printBody:
        "Both files are exactly 85.6 × 54 mm — standard card size. Give them to a print shop as they are, and do not let the printer scale them to fit the page.",
      photoTitle: "Your photograph",
      photoBody:
        "This is what appears on the front of your card. Choose a picture of your face, taken straight on. It is trimmed to a circle automatically.",
      choosePhoto: "Choose a photograph",
      replacePhoto: "Change photograph",
      removePhoto: "Remove",
      uploading: "Uploading…",
      photoFailed: "That photograph could not be saved. Try another one.",
      photoTooSmall:
        "That picture is too small to print clearly. Choose one at least 128 pixels across.",
      noPhotoYet:
        "No photograph yet. Your card will print with an empty circle until you add one.",
      officeTitle: "The line under your name",
      officeBody:
        "Your card prints the office you hold — Chairman, Treasurer — when an administrator has recorded one. Otherwise it prints your role.",
    },
    edit: {
      title: "Edit my details",
      description:
        "Keep your details current so the association can reach you and your money reaches you.",
      contactSection: "Name and contact",
      contactHint:
        "How the association reaches you about payments, loan decisions and withdrawals.",
      personalSection: "Personal details",
      personalHint: "Used to confirm who you are.",
      livelihoodSection: "Work",
      addressSection: "Where you live",
      payoutSection: "Where your money is paid",
      payoutHint:
        "Withdrawals are sent to these. They are also used to recognise deposits you make without quoting your payment reference.",
      nextOfKinSection: "Next of kin",
      nextOfKinName: "Their name",
      nextOfKinPhone: "Their phone",
      nextOfKinRelation: "Relationship to you",
      save: "Save changes",
      saving: "Saving…",
      saved: "Your details have been updated.",
      nothingChanged: "Nothing was changed.",
      failed: "Your details could not be saved.",
      cancel: "Cancel",
      matchingWarning:
        "Changing your phone, mobile money or bank account changes where the association looks when money arrives without a payment reference. Enter numbers that belong to you, and check them before saving.",
      verificationWarning:
        "A new phone number or email address has to be confirmed again before it counts as verified.",
      nationalIdLocked:
        "Your identity has been verified against this national ID, so it can only be changed by an administrator.",
      adminOnlyTitle: "What an administrator has to change for you",
      adminOnlyBody:
        "Your membership number, payment reference and membership status are not editable here. They are the identity your payments are matched by, so changing one is an administrator's decision and is recorded as such.",
      editProfile: "Edit my details",
      backToProfile: "Back to profile",
    },
  },

  rw: {
    status: {
      title: "Konti yawe",
      description: "Uko ubunyamuryango bwawe n'amafaranga yawe bihagaze uyu munsi.",
      signedInWithQr: "Winjiye ukoresheje kode yawe ya QR.",
      accountState: "Konti",
      identityCheck: "Igenzura ry'umwirondoro",
      memberNumber: "Nimero y'umunyamuryango",
      paymentReference: "Nimero y'ubwishyu",
      paymentReferenceHint:
        "Andika iyi nimero kuri buri bwishyu kugira ngo bugere kuri konti yawe uwo munsi.",
      memberSince: "Yinjiye",
      notRecorded: "Ntibyanditswe",
      outstandingLoan: "Inguzanyo isigaye",
      nextRepayment: "Ubwishyu bukurikira",
      nothingOwed: "Nta cyo urimo",
      noRepaymentScheduled: "Nta bwishyu buteganyijwe",
      goodStandingTitle: "Konti yawe ihagaze neza",
      overdueTitle: "Hari ubwishyu bwatinze",
      overdueBody:
        "Inguzanyo yawe yatinze iminsi {days}. Yishyure kugira ngo konti yawe ikomeze kuba nziza.",
      suspendedTitle: "Ubunyamuryango bwawe bwahagaritswe",
      suspendedBody:
        "Uracyabona amakuru yawe, ariko kubitsa, kubikuza no gusaba inguzanyo byahagaritswe. Vugana n'umuyobozi.",
      staffTitle: "Konti y'umukozi",
      staffBody:
        "Iyi konti iyobora ihuriro; nta bwizigame bwayo bwite ifite.",
      openSavingsBody:
        "Abakozi na bo bazigama mu ihuriro. Fungura konti y'ubwizigame kuri iyi konti imwe, maze ubwizigame bwawe, inguzanyo n'ibyemezo bigaragare hano hamwe n'akazi kawe ko kuyobora.",
      openSavingsAction: "Fungura konti yanjye y'ubwizigame",
      opening: "Irafungurwa…",
      openSavingsFailed:
        "Konti ntiyashoboye gufungurwa. Ongera ugerageze, cyangwa usabe undi muyobozi.",
      continueToDashboard: "Jya ku mbonerahamwe yanjye",
      myQrCode: "Kode yanjye ya QR",
      noSavingsAccount: "Nta konti y'ubwizigame irafungurwa.",

      moneyTitle: "Amafaranga yawe",
      balance: "Amafaranga ufite",
      balanceHint: "Ayo ufite yose kuri konti yawe y'ubwizigame",
      availableBalance: "Amafaranga ushobora gukoresha",
      availableBalanceHint: "Ayo ufite, ukuyemo ayafatiriwe ku nguzanyo",
      loanLimit: "Inguzanyo ushobora guhabwa",
      loanLimitHint: "{percent}% by'amafaranga ushobora gukoresha ({basis})",
      loanLimitBlocked: "Ntushobora kuguza ubu",
      applyForLoan: "Saba inguzanyo",
      none: "Ntayo",
      finesPaid: "Amahazabu wishyuye",

      yourDetails: "Amakuru yawe",
      fullName: "Amazina",
      telephone: "Telefone",
      emailAddress: "Imeyili",
      notProvided: "Ntibyatanzwe",

      shareholdingTitle: "Imigabane yawe",
      shareholdingHint:
        "Imigabane yawe yiyongeraho ubwizigame bw'umunsi umwe kuri buri munsi wishyuriye. Amafaranga wishyuye mbere aracyari ayawe — ahinduka umugabane uko iyo minsi igera.",
      sharesHeld: "Imigabane ufite",
      sharesDaysHint: "Iminsi {days} kuri {rate}",
      dailyRate: "Ubwizigame bwa buri munsi",
      perDay: "ku munsi",
      dailyCost: "Umunsi umwe ugutwara",
      dailyCostHint: "{savings} bihinduka umugabane wawe + {fee} ya serivisi ku buri mugabane",
      paidAhead: "Wishyuye mbere",
      paidAheadHint: "Iminsi {days} imbere",
      behindBy: "Usigaye inyuma",
      behindByHint: "Iminsi {days} itarishyurwa",
      finesOwed: "Amande urimo",
      contributionStatus: "Uko uhagaze mu misanzu",

      fineRiskTitle: "Ihazabu izatangwa mu munsi {days}|Ihazabu izatangwa mu minsi {days}",
      fineRiskBody:
        "Usigaye inyuma iminsi {behind}. Wishyura {amount} mbere y'aho nta hazabu izatangwa.",
      fineTonightTitle: "Ihazabu izatangwa muri iri joro",
      fineTonightBody:
        "Usigaye inyuma iminsi {behind}. Kwishyura {amount} uyu munsi ni wo mwanya wa nyuma wo kuyirinda.",
      finesTitle: "Amahazabu wahawe",
      finesSeeAll: "Reba amahazabu yanjye yose",
      finesCleared: "Nta hazabu itishyuwe",

      contributionsTitle: "Amafaranga yose watanze",
      totalContributed: "Amafaranga yose watanze",
      totalContributedHint: "Ibyinjiye byose kuri konti yawe kuva watangira",
      totalWithdrawn: "Amafaranga wabikuje",
      interestEarned: "Inyungu wabonye",
      feesCharged: "Amafaranga ya serivisi",
      accountNumber: "Nimero ya konti",
      lockedFunds: "Afatiriwe ku mafaranga yawe",
      lockedFundsHint:
        "Igice cy'amafaranga yawe udashobora gukoresha ubu: ayo wishingiye abandi, n'ayo gusaba kubikuza bitararangira.",

      guaranteeRequestsTitle: "Usabwe kwishingira inguzanyo",
      guaranteeRequestsHint:
        "Umunyamuryango yakuvuze nk'umwishingizi. Nubyemera, ayo mafaranga azafatirwa ku buzigame bwawe kugeza yishyuye inguzanyo yose, hanyuma agusubizwe. Ni we wishyura inguzanyo, si wowe.",
      guaranteeRequestLine: "Inguzanyo ya {loan} mu mezi {months} · {reference}",
      guaranteePurpose: "Igenewe: {purpose}",
      guaranteeYourAvailable: "Amafaranga ushobora gukoresha ni {available}.",
      guaranteeAccept: "Emera",
      guaranteeDecline: "Anga",
      guaranteeAcceptTitle: "Wishingire inguzanyo ya {name}?",
      guaranteeAcceptBody:
        "{amount} izafatirwa ku buzigame bwawe. Ntushobora kuyabikuza cyangwa kuyagurizaho kugeza {name} yishyuye inguzanyo yose. Hanyuma arakugarukira.",
      guaranteeAcceptConfirm: "Emera ufatire {amount}",
      guaranteeDeclineTitle: "Wanga ubu busabe?",
      guaranteeDeclineBody:
        "Nta mafaranga afatirwa ku buzigame bwawe. {name} azamenyeshwa ko wanze.",
      guaranteeDeclineReason: "Impamvu (si ngombwa)",
      guaranteeFailed: "Igisubizo cyawe nticyabitswe. Ongera ugerageze.",
      guaranteesGivenTitle: "Inguzanyo wishingiye",
      guaranteesGivenHint:
        "Amafaranga afatiriwe ku buzigame bwawe ku nguzanyo z'abandi banyamuryango. Buri yose igusubizwa iyo iyo nguzanyo imaze kwishyurwa yose.",
      guaranteeHeldTotal: "Afatiriwe abandi",
      guaranteeHeldTotalHint: "Igice cy'amafaranga afatiriwe ku mafaranga yawe haruguru",
      guaranteeForLoan: "Kwa {name}",
      guaranteeStillOwed: "{reference} · hasigaye kwishyurwa {outstanding}",
      guaranteeAwaitingDecision: "{reference} · bitegereje komite",
      guaranteeReleasedOn: "{reference} · yarekuwe {date}",
      guaranteeYouDeclined: "{reference} · wanze",
      myGuarantorsTitle: "Abishingizi bawe",
      myGuarantorsHint:
        "Abanyamuryango bishingira igice cy'inguzanyo yawe kirenze igice cyawe. Amafaranga yabo afatirwa kugeza wishyuye inguzanyo yose.",
      myGuarantorWaiting: "Ntarasubiza",
      myGuarantorHolding: "Yagufatiriye aya mafaranga",
      myGuarantorDeclined: "Yanze",

      borrowingTitle: "Inguzanyo zawe",
      amountBorrowed: "Amafaranga y'inguzanyo wafashe",
      amountRepaid: "Amafaranga umaze kwishyura",
      amountRemaining: "Amafaranga asigaye",
      currentLoan: "Inguzanyo ihari",
      loanCount: "Inguzanyo {count}|Inguzanyo {count}",
      neverBorrowed: "Nta nguzanyo urafata.",
      acrossAllLoans: "Ku nguzanyo zawe zose",

      warehouseTitle: "Ibikoresho wafashe muri Warehouse",
      warehouseHint:
        "Imyenda, imashini n'ibikoresho ihuriro ryaguhaye, n'ibisigaye kwishyurwa kuri byo.",
      warehouseEmpty: "Nta kintu warafata muri Warehouse.",
      goodsTaken: "Agaciro k'ibyo wafashe",
      goodsStillHeld: "Bikiri iwawe",
      goodsOwed: "Bisigaye kwishyurwa",
      goodsPaid: "Byishyuwe",
      openIssues: "Ifishi {count} ikinguye|Amafishi {count} akinguye",
      returnOverdue: "Kugarura byatinze",
      dueBack: "Bigomba kugarurwa",
      issuedOn: "Byatanzwe",
      againstLoan: "Ku nguzanyo {reference}",
      termsPurchase: "Byaguzwe",
      termsLoanOut: "Byatijwe",
      termsAgainstLoan: "Ku nguzanyo",
      termsFreeIssue: "Byatanzwe ku buntu",

      transactionsTitle: "Ibikorwa byose kuri konti yawe",
      transactionsEmpty: "Nta kintu kiratangira kugenda kuri konti yawe.",
      showingRecent: "Hagaragara {shown} biheruka kuri {total}",
      viewFullStatement: "Reba icyemezo cyuzuye",
      balanceColumn: "Asigaye",
      recentActivity: "Ibikorwa biheruka",
    },
    qr: {
      title: "Kode yanjye ya QR yo kwinjira",
      description:
        "Fata iyi kode na kamera ya telefone yawe winjire kuri konti utandika ijambobanga.",
      noCodeTitle: "Nta kode ya QR ufite",
      noCodeBody:
        "Kora imwe, hanyuma uyicape cyangwa ubike ifoto kuri telefone yawe. Kuyifata bikujyana kuri konti yawe ako kanya.",
      generate: "Kora kode yanjye ya QR",
      generating: "Irakorwa…",
      regenerate: "Simbuza indi nshya",
      revoke: "Hagarika kwinjira na QR",
      working: "Tegereza gato…",
      regenerateConfirmTitle: "Gusimbuza kode yawe ya QR?",
      regenerateConfirmBody:
        "Kode ufite ubu izahita ireka gukora, harimo n'iyo wacapye. Bikore niba ikarita yawe yazimiye cyangwa yabonywe n'undi muntu.",
      regenerateConfirmAction: "Yisimbuze",
      revokeConfirmTitle: "Guhagarika kwinjira na QR?",
      revokeConfirmBody:
        "Kode yawe izahita ireka gukora kandi uzajya winjira ukoresheje ijambobanga kugeza ukoze indi nshya.",
      revokeConfirmAction: "Bihagarike",
      downloadPng: "Kuramo ifoto",
      downloadSvg: "Kuramo iyo gucapa",
      print: "Capa ikarita",
      issuedOn: "Yakozwe {date}",
      validUntil: "Ikora kugeza {date}",
      expiringSoon: "Irangira mu minsi {days} — yisimbuze mbere y'aho.",
      lastUsed: "Yakoreshejwe bwa nyuma {date}",
      neverUsed: "Ntiraboneka gukoreshwa",
      timesUsed: "Yakoreshejwe inshuro {count}|Yakoreshejwe inshuro {count}",
      howToTitle: "Uko uyikoresha",
      howToStepOne: "Fungura kamera ya telefone yawe.",
      howToStepTwo: "Yerekeze kuri kode kugeza umurongo ugaragaye.",
      howToStepThree: "Kanda uwo murongo — konti yawe ihita ifunguka.",
      keepSafeTitle: "Iyi kode ni iyawe wenyine",
      keepSafeBody:
        "Umuntu wese ufite iyi foto ashobora gufungura konti yawe. Ntuyoherereze mu butumwa cyangwa mu itsinda. Nizimira, yisimbuze hano — iya kera ihita ireka gukora.",
      scanToSignIn: "Fata kode winjire",
      cardHolder: "Umunyamuryango",
      failedTitle: "Ntibyagenze neza",
      failedBody: "Ongera ugerageze. Nibikomeza kunanirana, vugana n'umuyobozi.",
    },
    qrInvalid: {
      title: "Iyi kode ya QR ntiyakoze",
      body:
        "Ashobora kuba yararangiye igihe, cyangwa yarasimbuwe n'indi nshya. Konti yawe ni nzima — usabwa gusa kwinjira ukoresheje ubundi buryo.",
      throttledTitle: "Wagerageje kenshi cyane",
      throttledBody:
        "Hafashwe kode nyinshi cyane muri uyu murongo. Tegereza iminota mike hanyuma wongere ugerageze.",
      whatToDo:
        "Injira ukoresheje ijambobanga, hanyuma ukore kode nshya uhereye kuri konti yawe.",
      signIn: "Injira ukoresheje ijambobanga",
      help: "Niba atari wowe wafashe iyi kode, bwira umuyobozi.",
    },
    card: {
      title: "Ikarita yanjye y'ubunyamuryango",
      description:
        "Ikarita yawe y'ishyirahamwe, yiteguye gucapwa. Imbere hari izina ryawe, ifoto yawe na kode yawe yo kwinjira; inyuma ni kimwe kuri buri karita.",
      previewTitle: "Uko ikarita yawe izasa",
      previewBody:
        "Ni byo nyine biri muri za PDF zombi. Niba ifoto cyangwa nimero ya telefone bitari byo hano, ntibizaba byo no ku ikarita icapwe.",
      frontTitle: "Imbere y'ikarita",
      frontBody: "Izina ryawe, umwanya ufite, nimero ya telefone na kode yawe ya QR.",
      backTitle: "Inyuma y'ikarita",
      backBody:
        "Ubutumwa bw'ishyirahamwe na nimero zo guhamagara nihagira ubona ikarita yawe. Ni kimwe kuri buri munyamuryango.",
      download: "Kuramo PDF",
      preparing: "Biritegurwa…",
      failed: "Ikarita ntiyashoboye gutegurwa. Ongera ugerageze.",
      printTitle: "Gucapa iyi karita",
      printBody:
        "Dosiye zombi ni 85.6 × 54 mm neza — ingano isanzwe y'ikarita. Zishyikirize aho bacapa uko ziri, kandi ntukemere ko mucapyi azihindura ngo zikwire urupapuro.",
      photoTitle: "Ifoto yawe",
      photoBody:
        "Ni yo igaragara imbere ku ikarita yawe. Hitamo ifoto y'isura yawe, ureba imbere. Ihita ikatwa igakora uruziga.",
      choosePhoto: "Hitamo ifoto",
      replacePhoto: "Hindura ifoto",
      removePhoto: "Kuraho",
      uploading: "Iroherezwa…",
      photoFailed: "Iyi foto ntiyashoboye kubikwa. Gerageza indi.",
      photoTooSmall:
        "Iyi foto ni nto cyane ngo icapwe neza. Hitamo ifite nibura pigiseli 128 z'ubugari.",
      noPhotoYet:
        "Nta foto irahari. Ikarita yawe izacapwa ifite uruziga rusa n'ubusa kugeza wongeyeho imwe.",
      officeTitle: "Umurongo uri munsi y'izina ryawe",
      officeBody:
        "Ikarita yawe icapa umwanya ufite — Perezida, Umubitsi — iyo umuyobozi yawanditse. Bitaba ibyo, icapa uruhare rwawe.",
    },
    edit: {
      title: "Hindura amakuru yanjye",
      description:
        "Komeza uvugurure amakuru yawe kugira ngo ihuriro rikubone kandi amafaranga yawe akugereho.",
      contactSection: "Izina n'aho bakugeraho",
      contactHint:
        "Uko ihuriro rikumenyesha ibijyanye n'ubwishyu, ibyemezo by'inguzanyo no kubikuza.",
      personalSection: "Amakuru bwite",
      personalHint: "Akoreshwa mu kwemeza uwo uri we.",
      livelihoodSection: "Akazi",
      addressSection: "Aho utuye",
      payoutSection: "Aho amafaranga yawe yoherezwa",
      payoutHint:
        "Ibyo ubikuza byoherezwa kuri izi nimero. Zinakoreshwa mu kumenya ubwitso wakoze utanditse nimero yawe y'ubwishyu.",
      nextOfKinSection: "Uwo mwegereye",
      nextOfKinName: "Izina rye",
      nextOfKinPhone: "Telefone ye",
      nextOfKinRelation: "Isano afitanye nawe",
      save: "Bika impinduka",
      saving: "Birabikwa…",
      saved: "Amakuru yawe yavuguruwe.",
      nothingChanged: "Nta cyahindutse.",
      failed: "Amakuru yawe ntiyashoboye kubikwa.",
      cancel: "Reka",
      matchingWarning:
        "Guhindura telefone, mobile money cyangwa konti ya banki bihindura aho ihuriro rireba iyo amafaranga aje adafite nimero y'ubwishyu. Andika nimero ziri izawe, kandi uzisuzume mbere yo kubika.",
      verificationWarning:
        "Nimero ya telefone nshya cyangwa imeyili nshya bigomba kongera kwemezwa mbere yo kubarwa nk'ibyemejwe.",
      nationalIdLocked:
        "Umwirondoro wawe wemejwe hakoreshejwe iyi ndangamuntu, ku buryo ihindurwa n'umuyobozi gusa.",
      adminOnlyTitle: "Ibyo umuyobozi agomba guhindura akwiyambaje",
      adminOnlyBody:
        "Nimero y'ubunyamuryango, nimero y'ubwishyu n'imiterere y'ubunyamuryango ntibihindurirwa hano. Ni byo bigena uko ubwishyu bwawe buhuzwa, bityo kubihindura ni icyemezo cy'umuyobozi kandi kirandikwa.",
      editProfile: "Hindura amakuru yanjye",
      backToProfile: "Subira ku mwirondoro",
    },
  },
};
