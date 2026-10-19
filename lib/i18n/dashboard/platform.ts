import type { Locale } from "@/types";

/**
 * The super administrator's screens: every association on the platform, the
 * administrators who run them, integrations, background jobs and permissions.
 *
 * Translated for completeness rather than necessity — these are operator
 * screens, and an operator who cannot read English is unlikely to be running a
 * multi-tenant platform. But a half-translated product is one where nobody
 * knows which half, so the language switch works the same way everywhere.
 *
 * Machine identifiers stay as they are: job names, permission keys, integration
 * provider names and enum values are the strings the code and the logs use, and
 * translating them would make a screen impossible to match to a log line.
 */
export interface PlatformCopy {
  overview: {
    title: string;
    description: string;
    sandboxTitle: string;
    sandboxBody: string;
    integrityTitle: string;
    integrityBody: string;
    stalledJobsTitle: string;
    stalledJobsBody: string;
    suspiciousTitle: string;
    suspiciousBody: string;
    financials: string;
    totalSavings: string;
    membersAcross: string;
    loansOutstanding: string;
    activeCount: string;
    inArrears: string;
    overdueLoans: string;
    collectedToday: string;
    transactionsToday: string;
    systemHealth: string;
    unmatchedPayments: string;
    failedPayments: string;
    rejectedAtVerification: string;
    jobFailures: string;
    jobRunsHint: string;
    activeAdministrators: string;
    adminsHint: string;
    associations: string;
    manage: string;
    colAssociation: string;
    colCode: string;
    colMembers: string;
    colLoans: string;
    colCurrency: string;
    colCreated: string;
    recentJobs: string;
    colJob: string;
    colStarted: string;
    colDuration: string;
    colProcessed: string;
    colFailed: string;
    noJobs: string;
    quickAuditTitle: string;
    quickAuditDetail: string;
    quickAssociationsTitle: string;
    quickAssociationsDetail: string;
    quickAdminsTitle: string;
    quickAdminsDetail: string;
  };
  audit: {
    title: string;
    description: string;
  };
  loans: {
    title: string;
    description: string;
  };
  payments: {
    title: string;
    description: string;
  };
  transactions: {
    title: string;
    description: string;
  };
  reports: {
    title: string;
    description: string;
    savingsHeld: string;
    membersPlatformWide: string;
    loansOutstanding: string;
    activeLoans: string;
    inArrears: string;
    overdueCount: string;
    associations: string;
    activeCount: string;
    byAssociation: string;
    colAssociation: string;
    colMembers: string;
    colSavings: string;
    colLoansOwing: string;
    colOverdue: string;
    colUnmatched: string;
  };
  associations: {
    title: string;
    description: string;
    count: string;
    activeCount: string;
    members: string;
    acrossFiltered: string;
    acrossAll: string;
    savingsHeld: string;
    savingsHint: string;
    loansOutstanding: string;
    unmatchedHint: string;
    allAttributed: string;
    searchPlaceholder: string;
    allStatuses: string;
    statusActive: string;
    statusPending: string;
    statusSuspended: string;
    statusArchived: string;
    noMatchTitle: string;
    noMatchBody: string;
    noneTitle: string;
    noneBody: string;
    colAssociation: string;
    colMembers: string;
    colSavings: string;
    colLoansOwing: string;
    colUnmatched: string;
    colAdmins: string;
    colCreated: string;
    pendingSuffix: string;
    overdueSuffix: string;
  };
  admins: {
    title: string;
    description: string;
    count: string;
    matchingFilter: string;
    activeOnPage: string;
    activeHint: string;
    lockedOut: string;
    lockoutInForce: string;
    noLockouts: string;
    withOverrides: string;
    overridesHint: string;
    searchPlaceholder: string;
    role: string;
    allRoles: string;
    associationAdmin: string;
    superAdmin: string;
    allStatuses: string;
    statusActive: string;
    statusSuspended: string;
    statusLocked: string;
    statusDisabled: string;
    statusPending: string;
    noneTitle: string;
    noneBody: string;
    colAdministrator: string;
    colAssociation: string;
    colSecurity: string;
    colLastSignIn: string;
    noContact: string;
    platformWide: string;
    lockedLabel: string;
    twoFactorOn: string;
    twoFactorOff: string;
    mustChangePassword: string;
    overrideCount: string;
    never: string;
  };
  settings: {
    title: string;
    description: string;
    sandboxInProductionTitle: string;
    sandboxInProductionBody: string;
    environment: string;
    paymentMode: string;
    sandbox: string;
    live: string;
    simulated: string;
    realMoney: string;
    associations: string;
    membersPlatformWide: string;
    storedSettings: string;
    storedSettingsHint: string;
    runtime: string;
    nodeEnvironment: string;
    applicationUrl: string;
    database: string;
    databaseConfigured: string;
    paymentProvider: string;
    emailProvider: string;
    smsProvider: string;
    whereConfigLives: string;
    secretsNote: string;
    runtimeRowsNote: string;
    tenantDirectory: string;
    platformConfiguration: string;
    noStoredSettings: string;
    readOnlyNote: string;
    auditLog: string;
  };
  jobs: {
    title: string;
    description: string;
    failingTitle: string;
    failingBody: string;
    neverRanTitle: string;
    neverRanBody: string;
    succeeded24h: string;
    completedCleanly: string;
    failed24h: string;
    investigateBelow: string;
    noFailures: string;
    currentlyRunning: string;
    idle: string;
    distinctJobs: string;
    runsRecorded: string;
    latestRuns: string;
    processedLine: string;
    job: string;
    allJobs: string;
    noneTitle: string;
    noneBody: string;
    colStarted: string;
    colDuration: string;
    colProcessed: string;
    colSucceeded: string;
    colFailed: string;
  };
  permissions: {
    title: string;
    description: string;
    count: string;
    categories: string;
    activeOverrides: string;
    activeOverridesHint: string;
    revocations: string;
    revocationsHint: string;
    notInDatabase: string;
    notInDatabaseHint: string;
    inSync: string;
    outOfSyncTitle: string;
    outOfSyncBody: string;
    roleMatrix: string;
    permission: string;
    roleMember: string;
    roleAdmin: string;
    roleSuperAdmin: string;
    holdsByDefault: string;
    doesNotHold: string;
    granted: string;
    notGranted: string;
    individualOverrides: string;
    colPerson: string;
    colEffect: string;
    colExpires: string;
    colGranted: string;
    noOverrides: string;
    platformWide: string;
    revoked: string;
    never: string;
    expired: string;
    revocationsWinNote: string;
  };
  integrations: {
    title: string;
    description: string;
    sandboxTitle: string;
    sandboxBody: string;
    missingCredentialsTitle: string;
    missingCredentialsBody: string;
    unverifiedTitle: string;
    unverifiedBody: string;
    paymentsCaptured: string;
    lastPayment: string;
    awaitingAttribution: string;
    awaitingHint: string;
    flaggedPayments: string;
    flaggedHint: string;
    failedMessages: string;
    membersNotReached: string;
    allDelivered: string;
    sandbox: string;
    live: string;
    mode: string;
    baseUrl: string;
    country: string;
    lastPaymentLabel: string;
    provider: string;
    noPayments: string;
    credentials: string;
    credentialApiKey: string;
    credentialMerchantCode: string;
    credentialConsumerSecret: string;
    credentialAccount: string;
    credentialSigningKey: string;
    credentialWebhookSecret: string;
    configured: string;
    notSet: string;
    howPaymentsArrive: string;
    viaWebhook: string;
    viaPolling: string;
    enteredManually: string;
    lastWebhook: string;
    webhookHint: string;
    messaging: string;
    emailProvider: string;
    emailFrom: string;
    smtpHost: string;
    loggingOnly: string;
    smsProvider: string;
    smsSenderId: string;
    deliveryByChannel: string;
    colChannel: string;
    colDelivered: string;
    colPending: string;
    colFailed: string;
    noMessages: string;
    recentReconciliation: string;
    allJobs: string;
    colJob: string;
    colStarted: string;
    colProcessed: string;
    neverReconciled: string;
    never: string;
  };
    documents: {
    title: string;
    description: string;
    colAssociation: string;
    colType: string;
    colTitle: string;
    colMember: string;
    colUploaded: string;
    colSize: string;
    colActions: string;
    bankStatement: string;
    momoStatement: string;
    uploadTitle: string;
    uploadButton: string;
    uploadHint: string;
    chooseFile: string;
    fileRequired: string;
    typeRequired: string;
    titlePlaceholder: string;
    memberPlaceholder: string;
    uploaded: string;
    view: string;
    download: string;
    delete: string;
    deleting: string;
    deleted: string;
    noneTitle: string;
    noneBody: string;
    deletedTitle: string;
    deletedBody: string;
    uploadFailed: string;
    noPermission: string;
  };
}

export const platform: Record<Locale, PlatformCopy> = {
  en: {
    overview: {
      title: "Platform overview",
      description: "Everything across every association on the platform.",
      sandboxTitle: "Payment provider is in SANDBOX mode",
      sandboxBody:
        "Transactions are fabricated by the mock adapter and must not back real member balances. Set JENGA_MODE=live with real credentials before go-live.",
      integrityTitle: "Ledger integrity failures detected",
      integrityBody:
        "The last integrity sweep found {count} savings account whose cached balance does not match its transaction history. Investigate immediately — this indicates a bug or direct database modification.|The last integrity sweep found {count} savings accounts whose cached balance does not match their transaction history. Investigate immediately — this indicates a bug or direct database modification.",
      stalledJobsTitle: "Background jobs are failing",
      stalledJobsBody:
        "{jobs} last failed. While reconciliation is down, member payments are not being credited.",
      suspiciousTitle: "Suspicious payments held",
      suspiciousBody:
        "{count} payment has been flagged and withheld from crediting.|{count} payments have been flagged and withheld from crediting.",
      financials: "Platform financials",
      totalSavings: "Total savings held",
      membersAcross:
        "{members} members across {count} association|{members} members across {count} associations",
      loansOutstanding: "Loans outstanding",
      activeCount: "{count} active",
      inArrears: "In arrears",
      overdueLoans: "{count} overdue loan|{count} overdue loans",
      collectedToday: "Collected today",
      transactionsToday: "{count} transaction|{count} transactions",
      systemHealth: "System health",
      unmatchedPayments: "Unmatched payments",
      failedPayments: "Failed payments",
      rejectedAtVerification: "Rejected at verification",
      jobFailures: "Job failures (24h)",
      jobRunsHint: "Background job runs",
      activeAdministrators: "Active administrators",
      adminsHint: "Admins and super admins",
      associations: "Associations",
      manage: "Manage",
      colAssociation: "Association",
      colCode: "Code",
      colMembers: "Members",
      colLoans: "Loans",
      colCurrency: "Currency",
      colCreated: "Created",
      recentJobs: "Recent background jobs",
      colJob: "Job",
      colStarted: "Started",
      colDuration: "Duration",
      colProcessed: "Processed",
      colFailed: "Failed",
      noJobs:
        "No background jobs have run yet. Start the worker with `npm run worker`.",
      quickAuditTitle: "Audit log",
      quickAuditDetail: "Every consequential action, platform-wide",
      quickAssociationsTitle: "Associations",
      quickAssociationsDetail: "Create and configure tenants",
      quickAdminsTitle: "Administrators",
      quickAdminsDetail: "Manage admin accounts and permissions",
    },
    audit: {
      title: "Platform audit log",
      description: "Every consequential action across every association.",
    },
    loans: {
      title: "Loan portfolio",
      description: "Every loan on the platform, across all associations.",
    },
    payments: {
      title: "All payments",
      description:
        "Every inbound payment across every association on the platform.",
    },
    transactions: {
      title: "All transactions",
      description: "Every savings ledger movement across every association.",
    },
    reports: {
      title: "Platform reports",
      description: "Consolidated figures across every association.",
      savingsHeld: "Savings held",
      membersPlatformWide:
        "{count} member platform-wide|{count} members platform-wide",
      loansOutstanding: "Loans outstanding",
      activeLoans: "{count} active loan|{count} active loans",
      inArrears: "In arrears",
      overdueCount: "{count} overdue",
      associations: "Associations",
      activeCount: "{count} active",
      byAssociation: "By association",
      colAssociation: "Association",
      colMembers: "Members",
      colSavings: "Savings",
      colLoansOwing: "Loans owing",
      colOverdue: "Overdue",
      colUnmatched: "Unmatched",
    },
    associations: {
      title: "Associations",
      description: "Every tenant on the platform, with the money each one holds.",
      count: "Associations",
      activeCount: "{count} active",
      members: "Members",
      acrossFiltered: "Across the filtered tenants",
      acrossAll: "Across every tenant",
      savingsHeld: "Savings held",
      savingsHint: "Sum of active account balances",
      loansOutstanding: "Loans outstanding",
      unmatchedHint: "{count} unmatched payment|{count} unmatched payments",
      allAttributed: "All payments attributed",
      searchPlaceholder: "Name, code, legal name, city…",
      allStatuses: "All statuses",
      statusActive: "Active",
      statusPending: "Pending",
      statusSuspended: "Suspended",
      statusArchived: "Archived",
      noMatchTitle: "No associations match",
      noMatchBody: "Nothing matches these filters. Try clearing the search.",
      noneTitle: "No associations yet",
      noneBody:
        "The platform has no tenants. Seed the database or create the first association to get started.",
      colAssociation: "Association",
      colMembers: "Members",
      colSavings: "Savings",
      colLoansOwing: "Loans owing",
      colUnmatched: "Unmatched",
      colAdmins: "Admins",
      colCreated: "Created",
      pendingSuffix: "{count} pending",
      overdueSuffix: "{count} overdue",
    },
    admins: {
      title: "Administrators",
      description:
        "Everyone with administrative access, and what they can reach.",
      count: "Administrators",
      matchingFilter: "Matching this filter",
      activeOnPage: "Active on this page",
      activeHint: "Able to sign in right now",
      lockedOut: "Locked out",
      lockoutInForce: "Failed sign-in lockout in force",
      noLockouts: "No lockouts",
      withOverrides: "With overrides",
      overridesHint: "Permissions differ from their role",
      searchPlaceholder: "Name, email or phone…",
      role: "Role",
      allRoles: "All admin roles",
      associationAdmin: "Association admin",
      superAdmin: "Super admin",
      allStatuses: "All statuses",
      statusActive: "Active",
      statusSuspended: "Suspended",
      statusLocked: "Locked",
      statusDisabled: "Disabled",
      statusPending: "Pending verification",
      noneTitle: "No administrators found",
      noneBody: "No accounts match these filters. Try clearing them.",
      colAdministrator: "Administrator",
      colAssociation: "Association",
      colSecurity: "Security",
      colLastSignIn: "Last sign-in",
      noContact: "No contact on file",
      platformWide: "Platform-wide",
      lockedLabel: "locked out",
      twoFactorOn: "2FA on",
      twoFactorOff: "2FA off",
      mustChangePassword: "must change password",
      overrideCount:
        "{count} permission override|{count} permission overrides",
      never: "Never",
    },
    settings: {
      title: "Platform settings",
      description:
        "Global configuration and the runtime this deployment is using.",
      sandboxInProductionTitle: "Production is running the sandbox adapter",
      sandboxInProductionBody:
        "Member balances would be backed by fabricated transactions. Set JENGA_MODE=live immediately.",
      environment: "Environment",
      paymentMode: "Payment mode",
      sandbox: "Sandbox",
      live: "Live",
      simulated: "Transactions are simulated",
      realMoney: "Real money",
      associations: "Associations",
      membersPlatformWide:
        "{count} member platform-wide|{count} members platform-wide",
      storedSettings: "Stored settings",
      storedSettingsHint: "Platform-scoped configuration rows",
      runtime: "Runtime",
      nodeEnvironment: "Node environment",
      applicationUrl: "Application URL",
      database: "Database",
      databaseConfigured: "Configured",
      paymentProvider: "Payment provider",
      emailProvider: "Email provider",
      smsProvider: "SMS provider",
      whereConfigLives: "Where configuration lives",
      secretsNote:
        "Secrets and connection details come from the environment, never from the database — they must be settable before the application can start, and they must not be readable through the web interface.",
      runtimeRowsNote:
        "The rows below are the settings that can change at runtime. Association-specific rules live with each association instead; open one from the",
      tenantDirectory: "tenant directory",
      platformConfiguration: "Platform configuration",
      noStoredSettings:
        "No platform settings are stored; every value currently comes from the environment.",
      readOnlyNote:
        "This screen is read-only. Editing global financial configuration from a browser session is a single point of catastrophic failure, so changes go through deployment and are recorded in the",
      auditLog: "audit log",
    },
    jobs: {
      title: "Background jobs",
      description:
        "Reconciliation, overdue sweeps and every other scheduled task.",
      failingTitle: "A job's most recent run failed",
      failingBody:
        "{jobs} last failed. While reconciliation is down, member payments are not being credited — this is invisible on every other screen in the system.",
      neverRanTitle: "No job has ever run",
      neverRanBody:
        "The worker does not appear to be running. Start it with `npm run worker`; until then, payments will not be reconciled and overdue loans will not be flagged.",
      succeeded24h: "Succeeded (24h)",
      completedCleanly: "Completed cleanly",
      failed24h: "Failed (24h)",
      investigateBelow: "Investigate below",
      noFailures: "No failures",
      currentlyRunning: "Currently running",
      idle: "Idle",
      distinctJobs: "Distinct jobs",
      runsRecorded: "{count} run recorded|{count} runs recorded",
      latestRuns: "Latest run of each job",
      processedLine: "{processed} processed · {ok} ok · ",
      job: "Job",
      allJobs: "All jobs",
      noneTitle: "No job runs recorded",
      noneBody:
        "Start the background worker with `npm run worker` to begin reconciling payments and sweeping overdue loans.",
      colStarted: "Started",
      colDuration: "Duration",
      colProcessed: "Processed",
      colSucceeded: "Succeeded",
      colFailed: "Failed",
    },
    permissions: {
      title: "Permissions",
      description:
        "What each role may do, and every exception granted to an individual.",
      count: "Permissions",
      categories: "{count} category|{count} categories",
      activeOverrides: "Active overrides",
      activeOverridesHint: "Individual grants and revocations",
      revocations: "Revocations",
      revocationsHint: "Taken away from someone's role",
      notInDatabase: "Not in database",
      notInDatabaseHint: "Defined in code but never granted",
      inSync: "Catalogue is in sync",
      outOfSyncTitle: "Permission catalogue is out of sync",
      outOfSyncBody:
        "{count} permission exists in lib/auth/permissions.ts but has no row in the database, so nobody holds it regardless of role: {codes}. Re-run the seed to reconcile.|{count} permissions exist in lib/auth/permissions.ts but have no row in the database, so nobody holds them regardless of role: {codes}. Re-run the seed to reconcile.",
      roleMatrix: "Role matrix",
      permission: "Permission",
      roleMember: "Member",
      roleAdmin: "Admin",
      roleSuperAdmin: "Super admin",
      holdsByDefault: "{role} holds this by default",
      doesNotHold: "{role} does not hold this",
      granted: "Granted",
      notGranted: "Not granted",
      individualOverrides: "Individual overrides",
      colPerson: "Person",
      colEffect: "Effect",
      colExpires: "Expires",
      colGranted: "Granted",
      noOverrides:
        "No individual overrides are in force — everyone holds exactly what their role gives them.",
      platformWide: "Platform-wide",
      revoked: "Revoked",
      never: "Never",
      expired: "expired — no longer in force",
      revocationsWinNote:
        "Revocations beat grants: where two rules disagree about whether someone may act, the answer is no. This screen reports what the database enforces — hiding a menu item never protects anything on its own.",
    },
    integrations: {
      title: "Integrations",
      description:
        "The payment provider and messaging channels this platform depends on.",
      sandboxTitle: "Payment provider is in SANDBOX mode",
      sandboxBody:
        "The mock adapter fabricates transactions. Nothing here reflects real money, and these balances must never be treated as authoritative. Set JENGA_MODE=live with real credentials before go-live.",
      missingCredentialsTitle: "Live mode is missing credentials",
      missingCredentialsBody:
        "{items} are not configured. Payment collection and verification will fail.",
      unverifiedTitle: "Payments are awaiting verification",
      unverifiedBody:
        "{count} payment has been captured but never confirmed with the provider. A payment is never posted to a member's balance without verification, so it is not yet credited.|{count} payments have been captured but never confirmed with the provider. A payment is never posted to a member's balance without verification, so these are not yet credited.",
      paymentsCaptured: "Payments captured",
      lastPayment: "Last: {when}",
      awaitingAttribution: "Awaiting attribution",
      awaitingHint: "Could not be matched to a member",
      flaggedPayments: "Flagged payments",
      flaggedHint: "Held by the fraud checks",
      failedMessages: "Failed messages (24h)",
      membersNotReached: "Members were not reached",
      allDelivered: "All messages delivered",
      sandbox: "Sandbox",
      live: "Live",
      mode: "Mode",
      baseUrl: "Base URL",
      country: "Country",
      lastPaymentLabel: "Last payment",
      provider: "Provider",
      noPayments: "No payments yet",
      credentials: "Credentials",
      credentialApiKey: "API key",
      credentialMerchantCode: "Merchant code",
      credentialConsumerSecret: "Consumer secret",
      credentialAccount: "Collection account",
      credentialSigningKey: "Signing key",
      credentialWebhookSecret: "Webhook secret",
      configured: "Configured",
      notSet: "Not set",
      howPaymentsArrive: "How payments arrive",
      viaWebhook: "Via webhook",
      viaPolling: "Via polling",
      enteredManually: "Entered manually",
      lastWebhook: "Last webhook",
      webhookHint: "Webhooks are the fast path; polling is the safety net",
      messaging: "Messaging",
      emailProvider: "Email provider",
      emailFrom: "Email from",
      smtpHost: "SMTP host",
      loggingOnly: "Logging only",
      smsProvider: "SMS provider",
      smsSenderId: "SMS sender id",
      deliveryByChannel: "Delivery by channel",
      colChannel: "Channel",
      colDelivered: "Delivered",
      colPending: "Pending",
      colFailed: "Failed",
      noMessages: "No messages have been dispatched yet.",
      recentReconciliation: "Recent reconciliation runs",
      allJobs: "All jobs",
      colJob: "Job",
      colStarted: "Started",
      colProcessed: "Processed",
      neverReconciled:
        "Reconciliation has never run. Start the worker with `npm run worker`.",
      never: "Never",
    },
    documents: {
      title: "Evidence storage",
      description:
        "Store bank statements and MoMo statements here so they can be viewed or downloaded at any time. Every upload is recorded under your name.",
      colAssociation: "Association",
      colType: "Type",
      colTitle: "Title",
      colMember: "Member",
      colUploaded: "Uploaded",
      colSize: "Size",
      colActions: "Actions",
      bankStatement: "Bank statement",
      momoStatement: "MoMo statement",
      uploadTitle: "Upload evidence",
      uploadButton: "Upload statement",
      uploadHint: "PDF only. Up to 10 MB per file.",
      chooseFile: "Choose file",
      fileRequired: "Attach a statement file",
      typeRequired: "Choose bank statement or MoMo statement",
      titlePlaceholder: "Statement title",
      memberPlaceholder: "Member (optional)",
      uploaded: "Statement uploaded",
      view: "View",
      download: "Download",
      delete: "Delete",
      deleting: "Deleting…",
      deleted: "Deleted",
      noneTitle: "No evidence yet",
      noneBody:
        "No bank statements or MoMo statements have been uploaded. Upload one to get started.",
      deletedTitle: "Evidence deleted",
      deletedBody: "The statement has been removed from the evidence store.",
      uploadFailed: "The upload failed. Please try again.",
      noPermission: "You do not have permission to do this.",
    },
  },

  rw: {
    overview: {
      title: "Incamake y'urubuga",
      description: "Ibintu byose mu mahuriro yose ari ku rubuga.",
      sandboxTitle: "Utanga serivisi y'ubwishyu ari mu buryo bw'IKIZAMINI",
      sandboxBody:
        "Ibikorwa bihimbwa n'uburyo bw'ikizamini kandi ntibigomba kuba ishingiro ry'amafaranga nyayo y'abanyamuryango. Shyira JENGA_MODE=live ufite ibanga nyakuri mbere yo gutangira gukoresha nyabyo.",
      integrityTitle: "Byabonetse amakosa mu gitabo cy'ibaruramari",
      integrityBody:
        "Igenzura riheruka ryabonye konti {count} y'ubuzigame ifite amafaranga adahuye n'amateka y'ibikorwa byayo. Suzuma ako kanya — ibi bigaragaza ikosa muri porogaramu cyangwa impinduka yakozwe mu bubiko bw'amakuru.|Igenzura riheruka ryabonye konti {count} z'ubuzigame zifite amafaranga adahuye n'amateka y'ibikorwa byazo. Suzuma ako kanya — ibi bigaragaza ikosa muri porogaramu cyangwa impinduka yakozwe mu bubiko bw'amakuru.",
      stalledJobsTitle: "Imirimo yikora irananirwa",
      stalledJobsBody:
        "{jobs} waheruka kunanirwa. Igihe guhuza ubwishyu bidakora, ubwishyu bw'abanyamuryango ntibwandikwa.",
      suspiciousTitle: "Ubwishyu bushidikanywaho bwahagaritswe",
      suspiciousBody:
        "Ubwishyu {count} bwashyizwe ku ruhande kandi ntibwandikwa ku konti.|Ubwishyu {count} bwashyizwe ku ruhande kandi ntibwandikwa ku konti.",
      financials: "Imari y'urubuga",
      totalSavings: "Ubuzigame bwose bufitwe",
      membersAcross:
        "Abanyamuryango {members} mu ihuriro {count}|Abanyamuryango {members} mu mahuriro {count}",
      loansOutstanding: "Inguzanyo zisigaye",
      activeCount: "{count} ziriho",
      inArrears: "Umwenda urengeje igihe",
      overdueLoans:
        "Inguzanyo {count} yarengeje igihe|Inguzanyo {count} zarengeje igihe",
      collectedToday: "Yakiriwe uyu munsi",
      transactionsToday: "Igikorwa {count}|Ibikorwa {count}",
      systemHealth: "Uko sisitemu ihagaze",
      unmatchedPayments: "Ubwishyu butarahuzwa",
      failedPayments: "Ubwishyu bwananiranye",
      rejectedAtVerification: "Bwanzwe mu igenzura",
      jobFailures: "Imirimo yananiranye (amasaha 24)",
      jobRunsHint: "Ibikorwa by'imirimo yikora",
      activeAdministrators: "Abayobozi bakora",
      adminsHint: "Abayobozi n'abayobozi bakuru",
      associations: "Amahuriro",
      manage: "Yobora",
      colAssociation: "Ihuriro",
      colCode: "Kode",
      colMembers: "Abanyamuryango",
      colLoans: "Inguzanyo",
      colCurrency: "Ifaranga",
      colCreated: "Ryashyizweho",
      recentJobs: "Imirimo yikora iheruka",
      colJob: "Umurimo",
      colStarted: "Byatangiye",
      colDuration: "Igihe byamaze",
      colProcessed: "Byatunganyijwe",
      colFailed: "Byanze",
      noJobs:
        "Nta murimo wikora warakora. Tangiza umukozi wa sisitemu ukoresheje `npm run worker`.",
      quickAuditTitle: "Ibyakozwe byose",
      quickAuditDetail: "Igikorwa cyose cy'ingirakamaro ku rubuga rwose",
      quickAssociationsTitle: "Amahuriro",
      quickAssociationsDetail: "Shyiraho kandi utunganye amahuriro",
      quickAdminsTitle: "Abayobozi",
      quickAdminsDetail: "Yobora konti z'abayobozi n'uburenganzira bwabo",
    },
    audit: {
      title: "Ibyakozwe byose ku rubuga",
      description: "Igikorwa cyose cy'ingirakamaro mu mahuriro yose.",
    },
    loans: {
      title: "Inguzanyo zose",
      description: "Inguzanyo zose ku rubuga, mu mahuriro yose.",
    },
    payments: {
      title: "Ubwishyu bwose",
      description: "Ubwishyu bwose bwinjiye mu mahuriro yose ari ku rubuga.",
    },
    transactions: {
      title: "Ibikorwa byose",
      description:
        "Ibikorwa byose byo mu gitabo cy'ubuzigame mu mahuriro yose.",
    },
    reports: {
      title: "Raporo z'urubuga",
      description: "Imibare yahurijwe hamwe mu mahuriro yose.",
      savingsHeld: "Ubuzigame bufitwe",
      membersPlatformWide:
        "Umunyamuryango {count} ku rubuga rwose|Abanyamuryango {count} ku rubuga rwose",
      loansOutstanding: "Inguzanyo zisigaye",
      activeLoans: "Inguzanyo {count} iriho|Inguzanyo {count} ziriho",
      inArrears: "Umwenda urengeje igihe",
      overdueCount: "{count} yarengeje igihe",
      associations: "Amahuriro",
      activeCount: "{count} arakora",
      byAssociation: "Ku ihuriro",
      colAssociation: "Ihuriro",
      colMembers: "Abanyamuryango",
      colSavings: "Ubuzigame",
      colLoansOwing: "Umwenda w'inguzanyo",
      colOverdue: "Zarengeje igihe",
      colUnmatched: "Butarahuzwa",
    },
    associations: {
      title: "Amahuriro",
      description:
        "Amahuriro yose ari ku rubuga, n'amafaranga buri rimwe rifite.",
      count: "Amahuriro",
      activeCount: "{count} arakora",
      members: "Abanyamuryango",
      acrossFiltered: "Mu mahuriro yashunguwe",
      acrossAll: "Mu mahuriro yose",
      savingsHeld: "Ubuzigame bufitwe",
      savingsHint: "Igiteranyo cy'amafaranga ari kuri konti zikora",
      loansOutstanding: "Inguzanyo zisigaye",
      unmatchedHint:
        "Ubwishyu {count} butarahuzwa|Ubwishyu {count} butarahuzwa",
      allAttributed: "Ubwishyu bwose bwahujwe",
      searchPlaceholder: "Izina, kode, izina ryemewe, umujyi…",
      allStatuses: "Imimerere yose",
      statusActive: "Arakora",
      statusPending: "Ategereje",
      statusSuspended: "Yahagaritswe",
      statusArchived: "Yabitswe",
      noMatchTitle: "Nta huriro rihuye",
      noMatchBody:
        "Nta kintu gihuye n'ibyo washungurishije. Gerageza usibe ibyo washakishije.",
      noneTitle: "Nta huriro rirahari",
      noneBody:
        "Urubuga nta mahuriro rufite. Shyiramo amakuru y'ibanze cyangwa ushyireho ihuriro rya mbere.",
      colAssociation: "Ihuriro",
      colMembers: "Abanyamuryango",
      colSavings: "Ubuzigame",
      colLoansOwing: "Umwenda w'inguzanyo",
      colUnmatched: "Butarahuzwa",
      colAdmins: "Abayobozi",
      colCreated: "Ryashyizweho",
      pendingSuffix: "{count} bategereje",
      overdueSuffix: "{count} zarengeje igihe",
    },
    admins: {
      title: "Abayobozi",
      description:
        "Abantu bose bafite uburenganzira bwo kuyobora, n'ibyo bashobora kugeraho.",
      count: "Abayobozi",
      matchingFilter: "Bahuye n'ibi bishungurwa",
      activeOnPage: "Bakora kuri uru rupapuro",
      activeHint: "Bashobora kwinjira ubu",
      lockedOut: "Bafunzwe",
      lockoutInForce: "Bafunzwe kubera kwinjira nabi",
      noLockouts: "Nta bafunzwe",
      withOverrides: "Bafite uburenganzira bwihariye",
      overridesHint: "Uburenganzira butandukanye n'ubw'inshingano zabo",
      searchPlaceholder: "Izina, imeyili cyangwa telefone…",
      role: "Inshingano",
      allRoles: "Inshingano zose z'ubuyobozi",
      associationAdmin: "Umuyobozi w'ihuriro",
      superAdmin: "Umuyobozi mukuru",
      allStatuses: "Imimerere yose",
      statusActive: "Arakora",
      statusSuspended: "Yahagaritswe",
      statusLocked: "Yafunzwe",
      statusDisabled: "Ntakora",
      statusPending: "Ategereje kwemezwa",
      noneTitle: "Nta muyobozi wabonetse",
      noneBody:
        "Nta konti ihuye n'ibi bishungurwa. Gerageza ubisibe.",
      colAdministrator: "Umuyobozi",
      colAssociation: "Ihuriro",
      colSecurity: "Umutekano",
      colLastSignIn: "Ubwinjiro buheruka",
      noContact: "Nta makuru yo kumugeraho",
      platformWide: "Ku rubuga rwose",
      lockedLabel: "yafunzwe",
      twoFactorOn: "Kwemeza kabiri: birakora",
      twoFactorOff: "Kwemeza kabiri: ntibikora",
      mustChangePassword: "agomba guhindura ijambobanga",
      overrideCount:
        "Uburenganzira {count} bwihariye|Uburenganzira {count} bwihariye",
      never: "Nta na rimwe",
    },
    settings: {
      title: "Igenamiterere ry'urubuga",
      description:
        "Igenamiterere rusange n'ibikoresho iyi porogaramu ikoresha.",
      sandboxInProductionTitle:
        "Urubuga rukora rukoresha uburyo bw'ikizamini",
      sandboxInProductionBody:
        "Amafaranga y'abanyamuryango yaba ashingiye ku bikorwa byahimbwe. Shyira JENGA_MODE=live ako kanya.",
      environment: "Ikigega",
      paymentMode: "Uburyo bw'ubwishyu",
      sandbox: "Ikizamini",
      live: "Nyakuri",
      simulated: "Ibikorwa birigana",
      realMoney: "Amafaranga nyayo",
      associations: "Amahuriro",
      membersPlatformWide:
        "Umunyamuryango {count} ku rubuga rwose|Abanyamuryango {count} ku rubuga rwose",
      storedSettings: "Igenamiterere ryabitswe",
      storedSettingsHint: "Imirongo y'igenamiterere ry'urubuga rwose",
      runtime: "Ibikoresho",
      nodeEnvironment: "Ikigega cya Node",
      applicationUrl: "Aderesi ya porogaramu",
      database: "Ububiko bw'amakuru",
      databaseConfigured: "Byashyizweho",
      paymentProvider: "Utanga serivisi y'ubwishyu",
      emailProvider: "Utanga serivisi ya imeyili",
      smsProvider: "Utanga serivisi y'ubutumwa",
      whereConfigLives: "Aho igenamiterere ribikwa",
      secretsNote:
        "Ibanga n'amakuru y'ihuza biva mu kigega, ntibiva mu bubiko bw'amakuru — bigomba kuba bishyizweho mbere y'uko porogaramu itangira, kandi ntibigomba kusomeka ku rubuga.",
      runtimeRowsNote:
        "Imirongo iri hasi ni igenamiterere rishobora guhinduka igihe porogaramu ikora. Amabwiriza yihariye y'ihuriro abikwa kuri buri huriro; fungura rimwe mu",
      tenantDirectory: "rutonde rw'amahuriro",
      platformConfiguration: "Igenamiterere ry'urubuga",
      noStoredSettings:
        "Nta genamiterere ry'urubuga ryabitswe; agaciro kose gaturuka mu kigega.",
      readOnlyNote:
        "Uru rupapuro ni urwo kureba gusa. Guhindura igenamiterere rusange ry'imari uhereye kuri mushakisha ni ikintu gishobora gutera ibyago bikomeye, bityo impinduka zinyura mu kohereza porogaramu kandi zandikwa mu",
      auditLog: "gitabo cy'ibyakozwe",
    },
    jobs: {
      title: "Imirimo yikora",
      description:
        "Guhuza ubwishyu, kugenzura inguzanyo zarengeje igihe n'indi mirimo yose iteganyijwe.",
      failingTitle: "Umurimo waheruka kunanirwa",
      failingBody:
        "{jobs} waheruka kunanirwa. Igihe guhuza ubwishyu bidakora, ubwishyu bw'abanyamuryango ntibwandikwa — ibi ntibigaragara ku rundi rupapuro rwose rwa sisitemu.",
      neverRanTitle: "Nta murimo warakora",
      neverRanBody:
        "Bigaragara ko umukozi wa sisitemu (worker) atari gukora. Mutangize ukoresheje `npm run worker`; kugeza ubwo, ubwishyu ntibuzahuzwa kandi inguzanyo zarengeje igihe ntizizamenyekana.",
      succeeded24h: "Byakunze (amasaha 24)",
      completedCleanly: "Byarangiye neza",
      failed24h: "Byanze (amasaha 24)",
      investigateBelow: "Suzuma hasi",
      noFailures: "Nta byananiranye",
      currentlyRunning: "Birimo gukora",
      idle: "Nta gikorwa",
      distinctJobs: "Imirimo itandukanye",
      runsRecorded: "Igikorwa {count} cyanditswe|Ibikorwa {count} byanditswe",
      latestRuns: "Igikorwa giheruka cya buri murimo",
      processedLine: "{processed} byatunganyijwe · {ok} byakunze · ",
      job: "Umurimo",
      allJobs: "Imirimo yose",
      noneTitle: "Nta gikorwa cy'umurimo cyanditswe",
      noneBody:
        "Tangiza umukozi wa sisitemu ukoresheje `npm run worker` kugira ngo guhuza ubwishyu no kugenzura inguzanyo zarengeje igihe bitangire.",
      colStarted: "Byatangiye",
      colDuration: "Igihe byamaze",
      colProcessed: "Byatunganyijwe",
      colSucceeded: "Byakunze",
      colFailed: "Byanze",
    },
    permissions: {
      title: "Uburenganzira",
      description:
        "Ibyo buri nshingano yemerewe gukora, n'ibyihariye byahawe umuntu ku giti cye.",
      count: "Uburenganzira",
      categories: "Icyiciro {count}|Ibyiciro {count}",
      activeOverrides: "Ibyihariye bikora",
      activeOverridesHint: "Ibyahawe n'ibyakuwe ku muntu ku giti cye",
      revocations: "Ibyakuweho",
      revocationsHint: "Byakuwe ku nshingano y'umuntu",
      notInDatabase: "Ntabwo biri mu bubiko",
      notInDatabaseHint: "Byanditswe mu kode ariko ntibyahawe umuntu",
      inSync: "Urutonde ruhuye",
      outOfSyncTitle: "Urutonde rw'uburenganzira ntiruhuye",
      outOfSyncBody:
        "Uburenganzira {count} buri muri lib/auth/permissions.ts ariko ntabwo bufite umurongo mu bubiko bw'amakuru, ku buryo nta muntu bufite uko inshingano ze zaba: {codes}. Ongera ukoreshe seed kugira ngo bihuze.|Uburenganzira {count} buri muri lib/auth/permissions.ts ariko ntabwo bufite umurongo mu bubiko bw'amakuru, ku buryo nta muntu bufite uko inshingano ze zaba: {codes}. Ongera ukoreshe seed kugira ngo bihuze.",
      roleMatrix: "Imbonerahamwe y'inshingano",
      permission: "Uburenganzira",
      roleMember: "Umunyamuryango",
      roleAdmin: "Umuyobozi",
      roleSuperAdmin: "Umuyobozi mukuru",
      holdsByDefault: "{role} afite ubu burenganzira mu buryo busanzwe",
      doesNotHold: "{role} ntafite ubu burenganzira",
      granted: "Yabuhawe",
      notGranted: "Ntabuhawe",
      individualOverrides: "Ibyihariye ku muntu",
      colPerson: "Umuntu",
      colEffect: "Icyo bikora",
      colExpires: "Birangira",
      colGranted: "Byatanzwe",
      noOverrides:
        "Nta byihariye bikora — buri muntu afite gusa ibyo inshingano ye imuha.",
      platformWide: "Ku rubuga rwose",
      revoked: "Byakuweho",
      never: "Nta na rimwe",
      expired: "byarangiye — ntibikora",
      revocationsWinNote:
        "Gukuraho biruta gutanga: iyo amabwiriza abiri atavuga rumwe ku kuba umuntu yemerewe gukora, igisubizo ni oya. Uru rupapuro rwerekana ibyo ububiko bw'amakuru bwubahiriza — guhisha ikintu kuri menu ubwabyo ntibirinda na kimwe.",
    },
    integrations: {
      title: "Ihuzwa rya serivisi",
      description:
        "Utanga serivisi y'ubwishyu n'inzira z'ubutumwa uru rubuga rwifashisha.",
      sandboxTitle: "Utanga serivisi y'ubwishyu ari mu buryo bw'IKIZAMINI",
      sandboxBody:
        "Uburyo bw'ikizamini buhimba ibikorwa. Nta kintu kiri hano kigaragaza amafaranga nyayo, kandi aya mafaranga ntagomba kufatwa nk'ukuri. Shyira JENGA_MODE=live ufite ibanga nyakuri mbere yo gutangira gukoresha nyabyo.",
      missingCredentialsTitle: "Uburyo nyakuri bubura ibanga",
      missingCredentialsBody:
        "{items} ntibyashyizweho. Gukusanya no kugenzura ubwishyu bizanirwa.",
      unverifiedTitle: "Ubwishyu butegereje kugenzurwa",
      unverifiedBody:
        "Ubwishyu {count} bwafashwe ariko ntibwemezwa n'utanga serivisi. Ubwishyu ntibwandikwa ku mafaranga y'umunyamuryango butagenzuwe, bityo ntibwanditswe.|Ubwishyu {count} bwafashwe ariko ntibwemezwa n'utanga serivisi. Ubwishyu ntibwandikwa ku mafaranga y'umunyamuryango butagenzuwe, bityo ntibwanditswe.",
      paymentsCaptured: "Ubwishyu bwafashwe",
      lastPayment: "Buheruka: {when}",
      awaitingAttribution: "Butegereje guhuzwa",
      awaitingHint: "Ntibushoboye guhuzwa n'umunyamuryango",
      flaggedPayments: "Ubwishyu bushidikanywaho",
      flaggedHint: "Bwahagaritswe n'igenzura ry'uburiganya",
      failedMessages: "Ubutumwa butageze (amasaha 24)",
      membersNotReached: "Abanyamuryango ntibagezweho",
      allDelivered: "Ubutumwa bwose bwageze",
      sandbox: "Ikizamini",
      live: "Nyakuri",
      mode: "Uburyo",
      baseUrl: "Aderesi y'ibanze",
      country: "Igihugu",
      lastPaymentLabel: "Ubwishyu buheruka",
      provider: "Utanga serivisi",
      noPayments: "Nta bwishyu burahari",
      credentials: "Ibanga ry'ihuza",
      credentialApiKey: "Urufunguzo rwa API",
      credentialMerchantCode: "Kode y'umucuruzi",
      credentialConsumerSecret: "Ibanga ry'ukoresha",
      credentialAccount: "Konti yakira amafaranga",
      credentialSigningKey: "Urufunguzo rwo gushyira umukono",
      credentialWebhookSecret: "Ibanga rya webhook",
      configured: "Byashyizweho",
      notSet: "Ntibyashyizweho",
      howPaymentsArrive: "Uko ubwishyu bugera",
      viaWebhook: "Bunyuze kuri webhook",
      viaPolling: "Bunyuze mu kubaza",
      enteredManually: "Bwinjijwe n'intoki",
      lastWebhook: "Webhook iheruka",
      webhookHint:
        "Webhook ni inzira yihuta; kubaza ni umutekano w'inyongera",
      messaging: "Ubutumwa",
      emailProvider: "Utanga serivisi ya imeyili",
      emailFrom: "Imeyili yoherezaho",
      smtpHost: "Seriveri ya SMTP",
      loggingOnly: "Kwandika gusa",
      smsProvider: "Utanga serivisi y'ubutumwa",
      smsSenderId: "Izina ryoherereza ubutumwa",
      deliveryByChannel: "Ubutumwa ku nzira",
      colChannel: "Inzira",
      colDelivered: "Bwageze",
      colPending: "Butegereje",
      colFailed: "Butageze",
      noMessages: "Nta butumwa burohererezwa.",
      recentReconciliation: "Guhuza buheruka",
      allJobs: "Imirimo yose",
      colJob: "Umurimo",
      colStarted: "Byatangiye",
      colProcessed: "Byatunganyijwe",
      neverReconciled:
        "Guhuza ubwishyu ntibwarakora. Tangiza umukozi wa sisitemu ukoresheje `npm run worker`.",
      never: "Nta na rimwe",
    },
    documents: {
      title: "Ububiko bw'amashyo",
      description:
        "Bwonge amashyo y'abangazi n'itererwa ry'moMo hano ku rubuga, kugira ngo ube batangira kureba cyangwa kuramo igihe gishushanjwe. Uburimuso bwose bubandikwa n'umwo kuramo.",
      colAssociation: "Ihuriro",
      colType: "Ubwoko",
      colTitle: "Izina",
      colMember: "Umunyamuryango",
      colUploaded: "Byashyizweho",
      colSize: "Umubare",
      colActions: "Ibikorwa",
      bankStatement: "Inyandiko ya bangazi",
      momoStatement: "Inyandiko ya moMo",
      uploadTitle: "Wongere amashyo",
      uploadButton: "Wongera inyandiko",
      uploadHint: "PDF wa gushya tujyanya. Igiciro 10 MB gusohoka rimwe mu file.",
      chooseFile: "Bigira file",
      fileRequired: "Bigira file y'inyandiko",
      typeRequired: "Hagaruka bank statement cyangwa momo statement",
      titlePlaceholder: "Izina rya statement",
      memberPlaceholder: "Umunyamuryango (cyangwe)",
      uploaded: "Inyandiko yashyizweho",
      view: "Reba",
      download: "Kuramo",
      delete: "Siba",
      deleting: "Sibura…",
      deleted: "Byasibwe",
      noneTitle: "Nta amashyo nyarambye",
      noneBody:
        "Nta bangazi cyangwa inyandiko ya moMo ibashyizweho. Wongera rimwe ku buhoro.",
      deletedTitle: "Amashyo yasibwe",
      deletedBody: "Inyandiko yarengetseho mu ububiko bw'amashyo.",
      uploadFailed: "Ukwongera ntibyakunze. Ongera ugerageze.",
      noPermission: "Ntufite uburenganzira bwo kubikora.",
    },
  },
};
