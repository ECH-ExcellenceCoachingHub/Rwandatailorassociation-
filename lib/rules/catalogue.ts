import type {
  RuleCategory,
  RuleEnforcement,
  RuleValueType,
} from "@/lib/generated/prisma/enums";

/**
 * THE RULES THE ASSOCIATION AGREED TO, WRITTEN DOWN ONCE.
 *
 * Every number this platform enforces against a member's money lives in this
 * file, paired with the sentence that explains it in the two languages members
 * read. Nothing else in the codebase is allowed to hard-code a contribution
 * amount, a fine rate, a borrowing limit or an interest split — services ask
 * `getPolicy()` and get whatever the association has resolved these to be.
 *
 * WHY A CATALOGUE AND NOT JUST DATABASE ROWS. The rows are the truth; this is
 * the shape they must take. Holding the catalogue in code means:
 *
 *   • an association that has never opened the rules screen still has a
 *     complete, sane, documented policy from day one;
 *   • a rule the code depends on cannot be deleted, only retuned, so no
 *     service can ever find itself with no policy to apply;
 *   • adding a rule is a code change reviewed like any other, while changing
 *     what a rule *says* is a committee decision made in the UI.
 *
 * WHY EVERY RULE CARRIES ITS OWN PROSE. A settings page reading
 * "penalty.amount_per_share: 500" is not a rule anybody agreed to. The
 * member-facing page renders `body`, so the thing a member reads and the thing
 * the software applies are two faces of one record and cannot drift apart.
 * Committees may reword their own rules; the wording is stored per association
 * for exactly that reason, and these are only the defaults.
 *
 * THE DEFAULTS BELOW FOLLOW RTA'S WRITTEN BY-LAWS — "STGT Amategeko
 * Ngengamikorere", Nduba, 13/09/2026. Where a rule restates an article, the
 * article is cited beside it. In short: 1,000 saved daily plus a 50 service
 * fee, both per share (Art. 6); lending after six months (Art. 31) up to
 * three times your savings (Art. 34); 2% a month, repaid within three months,
 * 7% a month on whatever is still owed after that (Art. 33); half the interest
 * back to the borrower and the rest shared at year end (Art. 39).
 *
 * Rules the by-laws do not contain but the association adopted separately are
 * marked "not in the by-laws" in a comment: the 500-per-share contribution
 * fine, the 80% own-savings tier with guarantors above it, monthly repayment,
 * and the warehouse credit terms.
 */

export const RULE_KEYS = {
  // Contributions ----------------------------------------------------------
  DAILY_SAVINGS: "contribution.daily_savings",
  CATCH_UP_ALLOWED: "contribution.catch_up_allowed",
  SHARE_COUNT: "contribution.share_count",
  LATE_JOINER: "contribution.late_joiner",
  MEMBERSHIP_CARD_FEE: "membership.card_fee",

  // The platform's service fee ---------------------------------------------
  PLATFORM_FEE_DAILY: "platform_fee.daily",
  PLATFORM_FEE_SEPARATION: "platform_fee.separation",

  // Falling behind ---------------------------------------------------------
  PENALTY_GRACE_DAYS: "penalty.grace_days",
  PENALTY_PER_SHARE: "penalty.amount_per_share",
  PENALTY_BASIS: "penalty.basis",
  PENALTY_REPEAT_DAYS: "penalty.repeat_days",
  REMINDER_LEAD_DAYS: "penalty.reminder_lead_days",
  DORMANT_MONTHS: "membership.dormant_months",
  EXIT_AFTER_DORMANT_MONTHS: "membership.exit_after_dormant_months",
  EXIT_REFUND_PERCENT: "membership.exit_refund_percent",

  // Who may borrow ---------------------------------------------------------
  LENDING_UNLOCK_MONTHS: "lending.association_unlock_months",
  MEMBER_MINIMUM_MONTHS: "lending.member_minimum_months",
  OWN_SAVINGS_PERCENT: "lending.own_savings_percent",
  COLLATERAL_REQUIRED_ABOVE_SHARE: "lending.collateral_required_above_share",
  COLLATERAL_COVERAGE_PERCENT: "lending.collateral_coverage_percent",
  ARREARS_BLOCK_BORROWING: "lending.arrears_block",
  LOAN_MAX_SAVINGS_MULTIPLE: "lending.maximum_savings_multiple_percent",
  LOAN_APPLICATION_PROCESS: "lending.application_process",

  // On what terms ----------------------------------------------------------
  LOAN_MONTHLY_INTEREST: "loan.monthly_interest_percent",
  LOAN_MAX_TERM_MONTHS: "loan.maximum_term_months",
  LOAN_REPAYMENT_FREQUENCY: "loan.repayment_frequency",
  LOAN_NO_EXTRA_CHARGES: "loan.no_additional_charges",
  LOAN_DEFAULT_INTEREST: "loan.default_interest_percent",
  LOAN_DISBURSEMENT: "loan.disbursement",

  // Where the interest goes ------------------------------------------------
  INTEREST_MEMBER_POINTS: "interest.member_share_points",
  INTEREST_ASSOCIATION_POINTS: "interest.association_share_points",
  INTEREST_YEAR_END_SPLIT: "interest.year_end_split",
  WAREHOUSE_PROFIT_SPLIT: "warehouse.profit_split",
  YEAR_END_ACCOUNTS: "accounts.year_end",

  // Buying from the store on credit ----------------------------------------
  WAREHOUSE_CREDIT_INTEREST: "warehouse_credit.interest_percent",
  WAREHOUSE_CREDIT_TERM_MONTHS: "warehouse_credit.term_months",
  WAREHOUSE_CREDIT_FINE_RATE: "warehouse_credit.fine_percent",
  WAREHOUSE_CREDIT_FINE_GRACE_DAYS: "warehouse_credit.fine_grace_days",
  WAREHOUSE_CREDIT_INTEREST_DESTINATION: "warehouse_credit.interest_destination",
  WAREHOUSE_CREDIT_MINIMUM_MONTHS: "warehouse_credit.minimum_membership_months",
  WAREHOUSE_ACCESS: "warehouse.access_and_pricing",

  // How the rules themselves work ------------------------------------------
  RULES_PUBLISHED: "governance.rules_are_published",
  AMENDMENT_PROCESS: "governance.amendment_process",
  GENERAL_ASSEMBLY: "governance.general_assembly",
  COMMITTEES: "governance.committees",
  ASSEMBLY_ABSENCE_FINE: "governance.assembly_absence_fine",
  MEETING_LATE_FINE: "governance.meeting_late_fine",
  MEETING_VERY_LATE_FINE: "governance.meeting_very_late_fine",
  MISCONDUCT_FINE: "governance.misconduct_fine",

  // Mutual support -----------------------------------------------------------
  WELFARE_BEREAVEMENT: "welfare.bereavement",
  WELFARE_WEDDING: "welfare.wedding",
  WELFARE_BIRTH: "welfare.birth",
  WELFARE_HOSPITAL: "welfare.hospital",
} as const;

export type RuleKey = (typeof RULE_KEYS)[keyof typeof RULE_KEYS];

export interface RuleDefinition {
  key: RuleKey;
  category: RuleCategory;
  valueType: RuleValueType;
  enforcement: RuleEnforcement;
  /// Null for TEXT rules, which are policy prose with nothing to compute.
  defaultValue: string | null;
  displayOrder: number;
  title: { en: string; rw: string };
  body: { en: string; rw: string };
}

/**
 * The rules, in the order a member should meet them: what you owe, what the
 * fee is, what happens if you fall behind, when you may borrow, on what terms,
 * and where the interest goes.
 *
 * `displayOrder` is global rather than per-category so that reordering a rule
 * within its own group never silently reorders another group.
 */
export const RULE_CATALOGUE: readonly RuleDefinition[] = [
  // -------------------------------------------------------------------------
  // CONTRIBUTIONS
  // -------------------------------------------------------------------------
  {
    key: RULE_KEYS.DAILY_SAVINGS,
    category: "CONTRIBUTIONS",
    valueType: "MONEY",
    enforcement: "AUTOMATIC",
    defaultValue: "1000.00",
    displayOrder: 10,
    title: {
      en: "Save every day, for each share",
      rw: "Kuzigama buri munsi, ku mugabane",
    },
    body: {
      en: "Each share you hold saves this amount every day (Art. 6) — a member with five shares saves five times it. You may always save more than one share a day. It is your own money: it goes straight into your savings account and stays yours. The service fee below is also charged per share, so one share costs 1,050 a day and five shares 5,250.",
      rw: "Buri mugabane ufite uzigama aya mafaranga buri munsi (Ingingo ya 6) — umunyamuryango ufite imigabane itanu azigama inshuro eshanu zayo. Wemerewe gutanga umugabane urenze umwe ku munsi. Ni amafaranga yawe bwite: ajya mu konti yawe y'ubuzigame kandi akomeza kuba ayawe. Amafaranga ya serivisi ari hasi aha yongerwaho kuri buri mugabane, bityo umugabane umwe ni 1,050 ku munsi naho imigabane itanu ni 5,250.",
    },
  },
  {
    key: RULE_KEYS.CATCH_UP_ALLOWED,
    category: "CONTRIBUTIONS",
    // Not a switch. Covered days are always counted as total paid divided by
    // the daily total, so there is no "off" for this to mean; a boolean here
    // implied a setting the code never read.
    valueType: "TEXT",
    enforcement: "AUTOMATIC",
    defaultValue: null,
    displayOrder: 20,
    title: {
      en: "You may pay for several days at once",
      rw: "Ushobora kwishyura iminsi myinshi icyarimwe",
    },
    body: {
      en: "You do not have to pay every single day. What is counted is how many days your total payments cover, so paying a week at a time on market day is perfectly in order. You fall behind only when the days you have paid for fall behind the days that have passed.",
      rw: "Ntabwo usabwa kwishyura buri munsi. Icyo tubara ni umubare w'iminsi amafaranga wishyuye yose ahagarariye, bityo kwishyura icyumweru cyose ku munsi w'isoko ni byemewe rwose. Usigara inyuma gusa iyo iminsi wishyuriye iri hasi y'iminsi yashize.",
    },
  },
  {
    // Art. 45.
    key: RULE_KEYS.SHARE_COUNT,
    category: "CONTRIBUTIONS",
    valueType: "TEXT",
    enforcement: "INFORMATIONAL",
    defaultValue: null,
    displayOrder: 22,
    title: {
      en: "How your shares are counted",
      rw: "Uko imigabane ibarwa",
    },
    body: {
      en: "Your number of shares is everything you have saved divided by 1,000: 1,000 is one share, 5,000 is five, 10,000 is ten. The service fee and the membership card are not counted. Every share earns the same, so a member with two shares receives twice the profit of a member with one — but every member has the same basic rights, however many shares they hold (Art. 45–49, 53).",
      rw: "Umubare w'imigabane yawe ni amafaranga yose wazigamye agabanyijwe na 1,000: 1,000 ni umugabane 1, 5,000 ni imigabane 5, 10,000 ni imigabane 10. Amafaranga ya serivisi n'ikarita y'umunyamuryango ntibibarwa. Buri mugabane ugira igipimo kimwe cy'inyungu, bityo ufite imigabane 2 ahabwa inshuro ebyiri z'inyungu y'ufite umugabane 1 — ariko buri munyamuryango afite uburenganzira bw'ibanze bungana n'ubw'abandi, uko imigabane ye yaba ingana kose (Ingingo ya 45–49, 53).",
    },
  },
  {
    // Art. 6.
    key: RULE_KEYS.LATE_JOINER,
    category: "CONTRIBUTIONS",
    valueType: "TEXT",
    enforcement: "INFORMATIONAL",
    defaultValue: null,
    displayOrder: 24,
    title: {
      en: "Joining part-way through the year",
      rw: "Kwinjira umwaka waratangiye",
    },
    body: {
      en: "A new member may buy the shares the others have already bought that year, so their savings catch up. Those shares earn no profit for the time before the member joined.",
      rw: "Umunyamuryango mushya ushaka kugura imigabane asanze abandi baraguze muri uwo mwaka yinjiriyemo, yemererwa kuyigura, ariko ntizabarirwa inyungu mu gihe yari atarinjira.",
    },
  },
  {
    // Art. 6. Recorded by an officer; nothing in the system charges it.
    key: RULE_KEYS.MEMBERSHIP_CARD_FEE,
    category: "CONTRIBUTIONS",
    valueType: "MONEY",
    enforcement: "INFORMATIONAL",
    defaultValue: "1000.00",
    displayOrder: 26,
    title: {
      en: "The membership card",
      rw: "Ikarita y'umunyamuryango",
    },
    body: {
      en: "Every member buys an electronic membership card for this amount, once. It is not savings and is not counted in your shares. The card is how you see your own account and how you take goods from the warehouse, and it is yours alone.",
      rw: "Buri munyamuryango agura ikarita y'ikoranabuhanga y'umunyamuryango kuri aya mafaranga, rimwe gusa. Si ubuzigame kandi ntibarwa mu migabane yawe. Iyi karita ni yo ukoresha kureba konti yawe no gufata ibikoresho muri Warehouse, kandi ni iyawe wenyine.",
    },
  },

  // -------------------------------------------------------------------------
  // THE PLATFORM'S SERVICE FEE
  // -------------------------------------------------------------------------
  {
    key: RULE_KEYS.PLATFORM_FEE_DAILY,
    category: "PLATFORM_FEE",
    valueType: "MONEY",
    enforcement: "AUTOMATIC",
    defaultValue: "50.00",
    displayOrder: 30,
    title: {
      en: "Daily service fee",
      rw: "Amafaranga ya serivisi ya buri munsi",
    },
    body: {
      en: "This pays for following up, running and growing STGT, and for the technology that keeps your record (Art. 6). It is charged per share for each day your contributions cover — a member with three shares pays three times it each day — and it is not savings: it does not build up in your account and it is not returned to you.",
      rw: "Aya afasha mu bikorwa byo gukurikirana, gucunga no guteza imbere STGT, no kwishyura ikoranabuhanga ribika amakuru yawe (Ingingo ya 6). Asabwa kuri buri mugabane kuri buri munsi amafaranga wishyuye ahagarariye — umunyamuryango ufite imigabane itatu atanga inshuro zitatu buri munsi — kandi si ubuzigame: ntiyiyongera muri konti yawe kandi ntagusubizwa.",
    },
  },
  {
    key: RULE_KEYS.PLATFORM_FEE_SEPARATION,
    category: "PLATFORM_FEE",
    valueType: "TEXT",
    enforcement: "AUTOMATIC",
    defaultValue: null,
    displayOrder: 40,
    title: {
      en: "The service fee is not the association's money",
      rw: "Amafaranga ya serivisi si aya ihuriro",
    },
    body: {
      en: "The fee is collected by the association but belongs to the platform operator. It is held in a separate record from the first day, is never counted as association income, and can never be lent out or shared among members. Any member can see the running total on the association's money page.",
      rw: "Aya mafaranga akusanywa n'ihuriro ariko ni aya nyir'urubuga. Abikwa mu bitabo bitandukanye uhereye ku munsi wa mbere, ntabwo na rimwe abarwa nk'inyungu z'ihuriro, kandi ntashobora na rimwe kugurizwa cyangwa kugabanywa abanyamuryango. Umunyamuryango wese ashobora kubona igiteranyo cyayo ku ipaji y'amafaranga y'ihuriro.",
    },
  },

  // -------------------------------------------------------------------------
  // FALLING BEHIND
  // -------------------------------------------------------------------------
  {
    key: RULE_KEYS.PENALTY_GRACE_DAYS,
    category: "PENALTIES",
    valueType: "DAYS",
    enforcement: "AUTOMATIC",
    defaultValue: "7",
    displayOrder: 50,
    title: {
      en: "How many days you may miss before a fine",
      rw: "Iminsi ushobora gusiba mbere y'ihazabu",
    },
    body: {
      en: "Miss this many days of saving and a fine follows. You are warned before you reach it, and the exact number of days you are behind is on your dashboard every day.",
      rw: "Nusiba iyi minsi utazigamye, uhabwa ihazabu. Uburirwa mbere yo kuyigeraho, kandi umubare nyawo w'iminsi usigaye inyuma uboneka ku ipaji yawe buri munsi.",
    },
  },
  {
    // NOT IN THE BY-LAWS. STGT's written rules have no fine for missed daily
    // saving — their answer to not saving is Art. 7 (below). Kept because the
    // association adopted it separately; confirm with the committee.
    //
    // Was `penalty.rate`, a percentage of the unpaid saving, until the
    // association moved to a flat charge per share. The migration that made the
    // change amended each association's existing row in place, so the rule's
    // history still shows the percentage it replaced.
    key: RULE_KEYS.PENALTY_PER_SHARE,
    category: "PENALTIES",
    valueType: "MONEY",
    enforcement: "AUTOMATIC",
    defaultValue: "500.00",
    displayOrder: 60,
    title: {
      en: "The fine",
      rw: "Ihazabu",
    },
    body: {
      en: "The fine is this amount for each share you hold — a member with three shares is fined three times it. It does not depend on how much you have saved or how much you owe: missing seven days with one share is fined 500, and with three shares 1,500. Each further fine covers only the days the ones before it did not, so a second seven days adds another fine of the same size rather than charging the first week again. The fine is owed to the association, not to the platform.",
      rw: "Ihazabu ni aya mafaranga kuri buri mugabane ufite — umunyamuryango ufite imigabane itatu ahabwa ihazabu y'inshuro eshatu zayo. Ntishingira ku byo wazigamye cyangwa ku mwenda ufite: gusiba iminsi irindwi ufite umugabane umwe bihanishwa 500, naho ufite imigabane itatu 1,500. Buri hazabu ikurikira ireba gusa iminsi izayibanjirije zitarebye, bityo indi minsi irindwi yongeraho indi hazabu ingana n'iya mbere aho kongera guhana icyumweru cya mbere. Ihazabu igenerwa ihuriro, si urubuga.",
    },
  },
  {
    key: RULE_KEYS.PENALTY_BASIS,
    category: "PENALTIES",
    valueType: "TEXT",
    enforcement: "AUTOMATIC",
    defaultValue: null,
    displayOrder: 70,
    title: {
      en: "A fine never touches what you have already saved",
      rw: "Ihazabu ntabwo ikoraho ibyo wamaze kuzigama",
    },
    body: {
      en: "The fine depends only on the shares you hold and the days you have missed, never on the savings you have built up, so a member who has saved for years is not fined more than a member with the same shares who joined last month, for the same missed week. The fine is recorded as owed and shown to you before anything is taken from your account, and an officer may waive it with a written reason.",
      rw: "Ihazabu ishingira gusa ku migabane ufite no ku minsi wasibye, ntabwo ibarwa ku buzigame wubatse, bityo umunyamuryango umaze imyaka azigama ntahabwa ihazabu iruta iy'ufite imigabane ingana n'iye winjiye ukwezi gushize, ku cyumweru kimwe basibye. Ihazabu yandikwa nk'umwenda kandi ukayibona mbere y'uko hagira igikurwa muri konti yawe, kandi umuyobozi ashobora kuyireka atanze impamvu yanditse.",
    },
  },
  {
    key: RULE_KEYS.PENALTY_REPEAT_DAYS,
    category: "PENALTIES",
    valueType: "DAYS",
    enforcement: "AUTOMATIC",
    defaultValue: "7",
    displayOrder: 80,
    title: {
      en: "A further fine for every further stretch missed",
      rw: "Indi hazabu kuri buri kindi gice cy'iminsi wasibye",
    },
    body: {
      en: "If you stay behind, another fine follows after this many more missed days. The same arrears are never fined twice: each fine covers days the earlier ones did not.",
      rw: "Nukomeza gusigara inyuma, indi hazabu ikurikira nyuma y'iyi minsi yindi wasibye. Umwenda umwe ntabwo uhanirwa kabiri: buri hazabu ireba iminsi izindi zitarebye.",
    },
  },
  {
    key: RULE_KEYS.REMINDER_LEAD_DAYS,
    category: "PENALTIES",
    valueType: "DAYS",
    enforcement: "AUTOMATIC",
    defaultValue: "2",
    displayOrder: 90,
    title: {
      en: "You are warned before you are fined",
      rw: "Uburirwa mbere yo guhabwa ihazabu",
    },
    body: {
      en: "A reminder is sent this many days before you reach the fine, telling you exactly how much would clear it. Nobody should ever be fined by surprise.",
      rw: "Ubutumwa bwo kwibutsa buhabwa iyi minsi mbere y'uko ugera ku ihazabu, bukubwira neza amafaranga yayikuraho. Nta muntu ukwiye guhanwa atunguwe.",
    },
  },
  {
    // Art. 7. Not applied by the system yet: an officer acts on it.
    key: RULE_KEYS.DORMANT_MONTHS,
    category: "PENALTIES",
    valueType: "MONTHS",
    enforcement: "INFORMATIONAL",
    defaultValue: "3",
    displayOrder: 92,
    title: {
      en: "Stop saving this long and your profit stops",
      rw: "Umara iki gihe udatanga imigabane, inyungu irahagarara",
    },
    body: {
      en: "A member who buys no shares for this many months stops earning profit on what they hold until they start again.",
      rw: "Umunyamuryango umaze aya mezi adatanga imigabane ahagarikirwa inyungu ku mitungo ye kugeza yisubiyeho.",
    },
  },
  {
    // Art. 7.
    key: RULE_KEYS.EXIT_AFTER_DORMANT_MONTHS,
    category: "PENALTIES",
    valueType: "MONTHS",
    enforcement: "INFORMATIONAL",
    defaultValue: "3",
    displayOrder: 94,
    title: {
      en: "Still not saving after this long, and membership ends",
      rw: "Utisubiyeho nyuma y'iki gihe arasezererwa",
    },
    body: {
      en: "If the member has still not started saving again this many months after their profit was stopped, they are removed from STGT and paid back part of what they hold (see the next rule). A member who leaves or is removed while owing a loan settles it under the loan rules first.",
      rw: "Iyo umunyamuryango atarisubiraho nyuma y'aya mezi ahagarikiwe inyungu, asezererwa muri STGT agasubizwa igice cy'umutungo we (reba itegeko rikurikira). Uwasezeye cyangwa uwasezerewe afite inguzanyo, hakurikizwa ibiteganywa n'amategeko y'inguzanyo.",
    },
  },
  {
    // Art. 7.
    key: RULE_KEYS.EXIT_REFUND_PERCENT,
    category: "PENALTIES",
    valueType: "PERCENT",
    enforcement: "INFORMATIONAL",
    defaultValue: "80.0000",
    displayOrder: 96,
    title: {
      en: "What a removed member is paid back",
      rw: "Ayo usezerewe asubizwa",
    },
    body: {
      en: "A member removed for not saving is paid back this share of what they hold in STGT.",
      rw: "Umunyamuryango usezerewe kubera kudatanga imigabane asubizwa iyi ngano y'umutungo we muri STGT.",
    },
  },

  // -------------------------------------------------------------------------
  // WHO MAY BORROW
  // -------------------------------------------------------------------------
  {
    key: RULE_KEYS.LENDING_UNLOCK_MONTHS,
    category: "LENDING_ELIGIBILITY",
    valueType: "MONTHS",
    enforcement: "AUTOMATIC",
    defaultValue: "6",
    displayOrder: 100,
    title: {
      en: "Lending starts after the association has saved this long",
      rw: "Kugurizanya bitangira nyuma y'uko ihuriro rimaze iki gihe rizigama",
    },
    body: {
      en: "The association builds its fund for this many months before it lends anything to anyone. Until then everybody saves and nobody borrows, so that the first loans are made from a pool that can actually carry them.",
      rw: "Ihuriro ryubaka ikigega cyaryo mu mezi angana atya mbere yo kugurizanya n'umwe. Kugeza icyo gihe buri wese arazigama nta n'umwe uguza, kugira ngo inguzanyo za mbere zive mu kigega gishoboye kuzihagarara.",
    },
  },
  {
    key: RULE_KEYS.MEMBER_MINIMUM_MONTHS,
    category: "LENDING_ELIGIBILITY",
    valueType: "MONTHS",
    enforcement: "AUTOMATIC",
    defaultValue: "6",
    displayOrder: 110,
    title: {
      en: "How long you must have been saving",
      rw: "Igihe ugomba kuba umaze uzigama",
    },
    body: {
      en: "You must have been contributing for this many months before you may apply. Your dashboard shows how long you have left.",
      rw: "Ugomba kuba umaze aya mezi uzigama mbere yo gusaba. Ipaji yawe ikwereka igihe gisigaye.",
    },
  },
  {
    // Art. 34.
    key: RULE_KEYS.LOAN_MAX_SAVINGS_MULTIPLE,
    category: "LENDING_ELIGIBILITY",
    valueType: "PERCENT",
    enforcement: "AUTOMATIC",
    defaultValue: "300.0000",
    displayOrder: 115,
    title: {
      en: "The most you may borrow: three times your savings",
      rw: "Inguzanyo ntarengwa: incuro 3 z'umugabane wawe",
    },
    body: {
      en: "No loan may be larger than this share of your own savings — at 300%, a member who has saved 100,000 may borrow at most 300,000. The credit commission may approve less than you asked for.",
      rw: "Nta nguzanyo irenga iyi ngano y'ubuzigame bwawe — kuri 300%, umunyamuryango wazigamye 100,000 ashobora kuguza 300,000 gusa. Komisiyo ishinzwe inguzanyo ishobora kukwemerera ari munsi y'ayo wasabye.",
    },
  },
  {
    // NOT IN THE BY-LAWS: the 80% no-security tier, and guarantors or
    // collateral above it (next two rules), were adopted separately. The
    // by-laws leave the judgement to the credit commission (Art. 35), within
    // the cap above.
    key: RULE_KEYS.OWN_SAVINGS_PERCENT,
    category: "LENDING_ELIGIBILITY",
    valueType: "PERCENT",
    enforcement: "AUTOMATIC",
    defaultValue: "80.0000",
    displayOrder: 120,
    title: {
      en: "How much you may borrow against your own savings",
      rw: "Uko wagurizwa ushingiye ku buzigame bwawe",
    },
    body: {
      en: "You may borrow up to this share of your own savings with nothing else required. Your savings stay in your account and secure the loan; this part of a loan needs no collateral and no guarantor.",
      rw: "Ushobora kuguza kugeza kuri iyi ngano y'ubuzigame bwawe nta kindi usabwe. Ubuzigame bwawe busigara muri konti yawe bugatanga ingwate y'iyo nguzanyo; iki gice cy'inguzanyo nta ngwate cyangwa umwishingizi gisaba.",
    },
  },
  {
    key: RULE_KEYS.COLLATERAL_REQUIRED_ABOVE_SHARE,
    category: "LENDING_ELIGIBILITY",
    valueType: "BOOLEAN",
    enforcement: "AUTOMATIC",
    defaultValue: "true",
    displayOrder: 130,
    title: {
      en: "Borrowing more than your own share needs guarantors",
      rw: "Kuguza hejuru y'igice cyawe bisaba abishingizi",
    },
    body: {
      en: "Anything above your own share comes from other members' savings, so other members must stand behind it. Name one or more guarantors — registered members who have saved enough — and say how much each one covers; together they must cover everything above your share. Each guarantor accepts from their own account page, and from then on that amount is held out of their available balance. It is released back to them when you have repaid the whole loan. Any part guarantors do not cover can instead be backed by items the committee accepts and records: machines, materials or equipment.",
      rw: "Ibirenze igice cyawe biva mu buzigame bw'abandi banyamuryango, bityo abandi banyamuryango bagomba kubyishingira. Vuga umwishingizi umwe cyangwa benshi — abanyamuryango banditse bazigamye bihagije — n'amafaranga buri wese yishingira; bose hamwe bagomba kwishingira ibirenze igice cyawe byose. Buri mwishingizi abyemera kuri paji ya konti ye, kandi kuva ubwo ayo mafaranga afatirwa ku mafaranga ye ashobora gukoresha. Asubizwa igihe umaze kwishyura inguzanyo yose. Igice abishingizi batishingiye gishobora kwishingirwa n'ibintu komite yemera kandi ikandika: imashini, ibikoresho cyangwa ibindi.",
    },
  },
  {
    key: RULE_KEYS.COLLATERAL_COVERAGE_PERCENT,
    category: "LENDING_ELIGIBILITY",
    valueType: "PERCENT",
    enforcement: "ASSISTED",
    defaultValue: "100.0000",
    displayOrder: 140,
    title: {
      en: "What the collateral must be worth",
      rw: "Agaciro ingwate igomba kugira",
    },
    body: {
      en: "When items are pledged for the part above your own share that guarantors do not cover, they must be worth at least this share of that part. The committee records what was pledged and what it was valued at, and both appear on the loan file.",
      rw: "Iyo hatanzwe ibintu ho ingwate ku gice kirenze igice cyawe abishingizi batishingiye, bigomba kugira agaciro nibura kangana na iyi ngano y'icyo gice. Komite yandika icyatanzwe n'agaciro cyahawe, kandi byombi bigaragara ku idosiye y'inguzanyo.",
    },
  },
  {
    key: RULE_KEYS.ARREARS_BLOCK_BORROWING,
    category: "LENDING_ELIGIBILITY",
    valueType: "BOOLEAN",
    enforcement: "AUTOMATIC",
    defaultValue: "true",
    displayOrder: 150,
    title: {
      en: "You must be up to date to borrow",
      rw: "Ugomba kuba wishyuye byose kugira ngo uguze",
    },
    body: {
      en: "A member behind on their daily saving, or with a fine still owing, cannot take a new loan until it is cleared. Lending to somebody already behind is how an association loses both the loan and the member.",
      rw: "Umunyamuryango usigaye inyuma mu kuzigama kwa buri munsi, cyangwa ufite ihazabu akiriho, ntashobora gufata indi nguzanyo kugeza abikemuye. Kuguriza umuntu usanzwe asigaye inyuma ni ko ihuriro ritakaza inguzanyo n'umunyamuryango icyarimwe.",
    },
  },
  {
    // Art. 32, 35.
    key: RULE_KEYS.LOAN_APPLICATION_PROCESS,
    category: "LENDING_ELIGIBILITY",
    valueType: "TEXT",
    enforcement: "INFORMATIONAL",
    defaultValue: null,
    displayOrder: 155,
    title: {
      en: "How a loan is decided",
      rw: "Uko inguzanyo yemezwa",
    },
    body: {
      en: "You apply in writing to the president of the credit commission, giving everything that will help the commission follow the repayment. The commission considers applications in the order they arrived, and looks at your capacity and how regularly you have bought shares. It decides whether you receive the loan, and may grant the amount you asked for or a smaller one.",
      rw: "Usaba inguzanyo abisaba mu nyandiko yandikira Perezida wa Komisiyo ishinzwe inguzanyo, agatanga amakuru yose ashoboka yafasha komisiyo gukurikirana iyishyurwa ryayo. Komisiyo isesengura ubusabe ikurikije urutonde rw'abasabye n'igihe basabiye, ubushobozi n'uko bitabiriye kugura imigabane, ikemeza niba uhabwa inguzanyo cyangwa utayihabwa. Ushobora kuyihabwa uko wayisabye cyangwa ikagabanywa.",
    },
  },

  // -------------------------------------------------------------------------
  // ON WHAT TERMS
  // -------------------------------------------------------------------------
  {
    key: RULE_KEYS.LOAN_MONTHLY_INTEREST,
    category: "LOAN_TERMS",
    valueType: "PERCENT",
    enforcement: "AUTOMATIC",
    defaultValue: "2.0000",
    displayOrder: 160,
    title: {
      en: "Interest on a loan",
      rw: "Inyungu ku nguzanyo",
    },
    body: {
      en: "Interest is this percentage a month, worked out on the amount borrowed (Art. 33). On 100,000 over three months that is 2,000 a month — 6,000 in total, and the schedule you sign shows every instalment before you take the money.",
      rw: "Inyungu ni iyi ijanisha ku kwezi, ibarwa ku mafaranga waguze (Ingingo ya 33). Kuri 100,000 mu mezi atatu ni 2,000 ku kwezi — 6,000 yose hamwe, kandi gahunda yo kwishyura usinya ikwereka buri kwishyura mbere yo gufata amafaranga.",
    },
  },
  {
    key: RULE_KEYS.LOAN_MAX_TERM_MONTHS,
    category: "LOAN_TERMS",
    valueType: "MONTHS",
    enforcement: "AUTOMATIC",
    // Art. 33: "ntabwo agomba kurenza amezi atatu atishyuye inguzanyo".
    defaultValue: "3",
    displayOrder: 170,
    title: {
      en: "You have this long to repay",
      rw: "Ufite iki gihe cyo kwishyura",
    },
    body: {
      en: "Every loan, with its interest, is repaid within this many months (Art. 33). Borrow only what your instalments can carry: whatever is still unpaid when the time runs out is charged at the higher rate in the next rule.",
      rw: "Buri nguzanyo n'inyungu zayo byishyurwa muri aya mezi (Ingingo ya 33). Guza gusa ibyo ushobora kwishyura: ibisigaye bitarishyurwa igihe kirangiye bibarwa ku nyungu yo hejuru ivugwa mu itegeko rikurikira.",
    },
  },
  {
    // Art. 33. Overdue loans are flagged by the system, but this rate is not
    // yet applied automatically: an officer restructures the loan.
    key: RULE_KEYS.LOAN_DEFAULT_INTEREST,
    category: "LOAN_TERMS",
    valueType: "PERCENT",
    enforcement: "INFORMATIONAL",
    defaultValue: "7.0000",
    displayOrder: 175,
    title: {
      en: "Not repaid in time: 7% a month",
      rw: "Utishyuye mu gihe: 7% buri kwezi",
    },
    body: {
      en: "If a loan and its interest are not fully repaid within the repayment period, everything still owed — loan and interest together — becomes a new loan charged at this percentage a month. A member who clearly has no will to repay is referred to the competent authorities, and pays every cost of following the matter up.",
      rw: "Umunyamuryango utabashije kwishyura inguzanyo n'inyungu zayo mu gihe cyagenwe, byose biteranye bihinduka inguzanyo itangira guhita ibarwa ku nyungu y'iri janisha buri kwezi. Iyo bigaragara ko nta bushake bwo kwishyura afite, hitabazwa inzego zibifitiye ububasha kandi akishyura ibikenerwa byose mu gihe cy'ikurikiranwa ry'ikibazo.",
    },
  },
  {
    // NOT IN THE BY-LAWS: they set the period (Art. 33), not monthly
    // instalments. Kept as the association's practice.
    key: RULE_KEYS.LOAN_REPAYMENT_FREQUENCY,
    category: "LOAN_TERMS",
    valueType: "TEXT",
    enforcement: "AUTOMATIC",
    defaultValue: null,
    displayOrder: 180,
    title: {
      en: "Repay every month",
      rw: "Wishyure buri kwezi",
    },
    body: {
      en: "Repayment is monthly, on the same date each month, and it does not replace your daily saving — the two run alongside each other. A reminder is sent before every instalment falls due.",
      rw: "Kwishyura ni buri kwezi, ku itariki imwe buri kwezi, kandi ntibisimbura kuzigama kwawe kwa buri munsi — byombi bikomeza icyarimwe. Ubutumwa bwo kwibutsa buhabwa mbere y'uko buri kwishyura kugera igihe.",
    },
  },
  {
    key: RULE_KEYS.LOAN_NO_EXTRA_CHARGES,
    category: "LOAN_TERMS",
    valueType: "BOOLEAN",
    enforcement: "AUTOMATIC",
    defaultValue: "true",
    displayOrder: 190,
    title: {
      en: "Nothing is charged beyond the stated interest",
      rw: "Nta kindi cyishyuzwa uretse inyungu yavuzwe",
    },
    body: {
      en: "No processing fee, no insurance fee, no file charge. What you repay is what you borrowed plus the interest above it, and the schedule shows the whole of it on the day the loan is approved.",
      rw: "Nta mafaranga yo gutunganya, nta ay'ubwishingizi, nta ay'idosiye. Icyo wishyura ni ibyo waguze hiyongereyeho inyungu yavuzwe, kandi gahunda yo kwishyura ikwereka byose ku munsi inguzanyo yemerewe.",
    },
  },
  {
    // Art. 38.
    key: RULE_KEYS.LOAN_DISBURSEMENT,
    category: "LOAN_TERMS",
    valueType: "TEXT",
    enforcement: "INFORMATIONAL",
    defaultValue: null,
    displayOrder: 195,
    title: {
      en: "When and how an approved loan is paid out",
      rw: "Igihe n'uburyo inguzanyo yemejwe itangwa",
    },
    body: {
      en: "Approved loans are paid out at 17:00, by bank transfer. The borrower must be present by 17:10 to sign that they received it.",
      rw: "Isaha yo gutanga inguzanyo ku bayisabye bakayemererwa ni 17h00, hakoreshejwe transfer muri banki. Uhabwa inguzanyo agomba kuba ahibereye bitarenze 17h10 kugira ngo asinye ko ayakiriye.",
    },
  },

  // -------------------------------------------------------------------------
  // WHERE THE INTEREST GOES
  // -------------------------------------------------------------------------
  {
    key: RULE_KEYS.INTEREST_MEMBER_POINTS,
    category: "INTEREST_SHARING",
    valueType: "PERCENT",
    enforcement: "AUTOMATIC",
    defaultValue: "1.0000",
    displayOrder: 200,
    title: {
      en: "Half the interest comes back to the borrower",
      rw: "Kimwe cya kabiri cy'inyungu kigarukira uwaguze",
    },
    body: {
      en: "Half of the interest a borrower pays is theirs (Art. 39). Of the monthly interest, this much is credited straight back into the borrower's own savings account every time an instalment is paid. You are paying part of the interest to yourself, and it appears on your statement as an interest credit.",
      rw: "Muri inyungu ya buri kwezi, iyi ngano isubizwa ako kanya muri konti y'ubuzigame y'uwaguze buri gihe yishyuye. Uba wishyura igice cy'inyungu wowe ubwawe, kandi kigaragara ku nyandiko ya konti yawe nk'inyungu winjijwe.",
    },
  },
  {
    key: RULE_KEYS.INTEREST_ASSOCIATION_POINTS,
    category: "INTEREST_SHARING",
    valueType: "PERCENT",
    enforcement: "AUTOMATIC",
    defaultValue: "1.0000",
    displayOrder: 210,
    title: {
      en: "The other half builds the association's fund",
      rw: "Ikindi gice cyubaka ikigega cy'ihuriro",
    },
    body: {
      en: "The remainder of the monthly interest is held by STGT until the end of the year, when it is divided as the next rule describes. Until then it is reported on the association's money page as lending income — separately from the service fee, which is not the association's at all.",
      rw: "Igice gisigaye cy'inyungu ya buri kwezi kibikwa na STGT kugeza umwaka urangiye, kigasaranganywa nk'uko itegeko rikurikira ribivuga. Kugeza icyo gihe kigaragazwa ku ipaji y'amafaranga y'ihuriro nk'inyungu zo kugurizanya — ukwacyo, kikaba gitandukanye n'amafaranga ya serivisi atari aya ihuriro na gato.",
    },
  },
  {
    // Art. 39. The borrower's 50% is credited automatically (above); this
    // year-end division of the other half is done by the accounting commission.
    key: RULE_KEYS.INTEREST_YEAR_END_SPLIT,
    category: "INTEREST_SHARING",
    valueType: "TEXT",
    enforcement: "INFORMATIONAL",
    defaultValue: null,
    displayOrder: 211,
    title: {
      en: "How all loan interest is shared",
      rw: "Uko inyungu y'inguzanyo isaranganywa",
    },
    body: {
      en: "Of all the interest paid on loans: 50% goes to the borrower who paid it; 20% is shared among all members, those who borrowed and those who did not; 20% is added to every member's base share; and 10% supports the committee in running STGT.",
      rw: "Mu nyungu yose y'inguzanyo: uwagujije ahabwa 50% by'inyungu yinjije; 20% igabanwa n'abanyamuryango bose (abagujije n'abataragujije); 20% ishyirwa ku mugabane shingiro wa buri munyamuryango; naho 10% ifasha Komite mu ishyirwa mu bikorwa ry'imirimo itandukanye muri STGT.",
    },
  },
  {
    // Art. 45, 51 (chapter XII).
    key: RULE_KEYS.WAREHOUSE_PROFIT_SPLIT,
    category: "INTEREST_SHARING",
    valueType: "TEXT",
    enforcement: "INFORMATIONAL",
    defaultValue: null,
    displayOrder: 219,
    title: {
      en: "How warehouse profit is shared",
      rw: "Uko inyungu ya Warehouse isaranganywa",
    },
    body: {
      en: "When the warehouse makes a profit that may be distributed: 50% is shared among members according to their shares; 25% grows and improves the warehouse; and 25% goes into the reserve fund. These are starting proportions that a members' meeting may change.",
      rw: "Iyo Warehouse ibonye inyungu yemerewe kugabanywa: 50% igabanwa abanyamuryango hashingiwe ku migabane yabo; 25% yongera kandi iteza imbere Warehouse; naho 25% ijya mu Kigega cy'Ubwizigame (Reserve Fund). Ibi bipimo ni urugero rw'ibanze kandi bishobora guhindurwa n'inama yemewe y'abanyamuryango.",
    },
  },

  // -------------------------------------------------------------------------
  // BUYING FROM THE STORE ON CREDIT
  //
  // Placed after the lending rules and before governance, because a member
  // reads them in that order: this is the other way to get something from the
  // association, and it is the one with the shortest leash.
  // -------------------------------------------------------------------------
  {
    // NOT IN THE BY-LAWS: the 2% charge, three-month term and 7% fine on goods
    // taken on credit were adopted separately. The by-laws only say who may
    // take goods on credit (WAREHOUSE_CREDIT_MINIMUM_MONTHS below).
    key: RULE_KEYS.WAREHOUSE_CREDIT_INTEREST,
    category: "WAREHOUSE_CREDIT",
    valueType: "PERCENT",
    enforcement: "AUTOMATIC",
    defaultValue: "2.0000",
    displayOrder: 212,
    title: {
      en: "Goods taken on credit cost 2% in total",
      rw: "Ibikoresho ufatiye ku ideni bikugusaba 2% muri rusange",
    },
    body: {
      en: "Take fabric, thread or a machine out of the store without paying that day and 2% of its price is added once — for the whole three months, not every month. A machine priced at 200,000 is repaid as 204,000. The price you are charged is the one on the shelf the day you take it, and it never changes afterwards.",
      rw: "Nufata umwenda, urudodo cyangwa imashini muri Warehouse utishyuye uwo munsi, hiyongeraho 2% by'igiciro cyabyo rimwe gusa — ku mezi atatu yose, si buri kwezi. Imashini ihenda 200,000 yishyurwa 204,000. Igiciro ucibwa ni icyari ku rutonde umunsi ubifashe, kandi ntikizigera gihinduka nyuma.",
    },
  },
  {
    key: RULE_KEYS.WAREHOUSE_CREDIT_TERM_MONTHS,
    category: "WAREHOUSE_CREDIT",
    valueType: "MONTHS",
    enforcement: "AUTOMATIC",
    defaultValue: "3",
    displayOrder: 213,
    title: {
      en: "Paid off within three months, in equal monthly parts",
      rw: "Byishyurwa mu mezi atatu, mu bice bingana bya buri kwezi",
    },
    body: {
      en: "The amount is split into this many equal monthly payments, the first falling one month after you take the goods. You are shown all three dates and amounts the day the credit is opened. Paying early is allowed and costs nothing extra — the 2% does not grow, so settling in month one is cheaper in time but not in money.",
      rw: "Umubare ugabanywamo ibice bingana bya buri kwezi bingana, icya mbere kikagera nyuma y'ukwezi kumwe umaze gufata ibikoresho. Werekwa amatariki yose atatu n'imibare umunsi ideni rifunguwe. Kwishyura kare biremewe kandi nta kiguzi cyiyongera — 2% ntiyiyongera, bityo kwishyura mu kwezi kwa mbere bikugabanyiriza igihe, ariko si amafaranga.",
    },
  },
  {
    key: RULE_KEYS.WAREHOUSE_CREDIT_FINE_RATE,
    category: "WAREHOUSE_CREDIT",
    valueType: "PERCENT",
    enforcement: "AUTOMATIC",
    defaultValue: "7.0000",
    displayOrder: 214,
    title: {
      en: "Miss a month and the fine is 7%",
      rw: "Nusiba ukwezi, ihazabu ni 7%",
    },
    body: {
      en: "A monthly payment left unpaid past its date is fined this percentage of what is still unpaid on that month — not of the whole credit. Miss a month of 68,000 entirely and the fine is 4,760; pay 48,000 of it late and the fine is 7% of the 20,000 left, which is 1,400. Each month is fined at most once, however long it stays unpaid, and the fine is owed to the association.",
      rw: "Amafaranga ya buri kwezi utishyuye igihe cyayo gishize ahanishwa iyi ijanisha ry'ibisigaye kuri uko kwezi — si ku ideni ryose. Usibye ukwezi kwa 68,000 kwose ihazabu ni 4,760; wishyuye 48,000 utinze, ihazabu ni 7% ya 20,000 isigaye, ni ukuvuga 1,400. Buri kwezi guhanwa rimwe gusa, uko kwaba kumaze igihe kingana kose kutishyuwe, kandi ihazabu igenerwa ihuriro.",
    },
  },
  {
    key: RULE_KEYS.WAREHOUSE_CREDIT_FINE_GRACE_DAYS,
    category: "WAREHOUSE_CREDIT",
    valueType: "DAYS",
    enforcement: "AUTOMATIC",
    defaultValue: "0",
    displayOrder: 215,
    title: {
      en: "How long after the date before the fine falls",
      rw: "Igihe gishira nyuma y'itariki mbere y'uko ihazabu igwa",
    },
    body: {
      en: "The fine is assessed once this many days have passed since the due date. At zero it falls the day after. You are reminded before the date arrives, and the date and amount of every remaining payment are on your warehouse page from the day the credit is opened.",
      rw: "Ihazabu itangwa iyi minsi imaze gushira uhereye ku itariki yagenwe. Iyo ari zeru, igwa bukeye. Uributswa mbere y'uko itariki igera, kandi itariki n'umubare wa buri kwishyura gusigaye biboneka ku ipaji yawe ya Warehouse uhereye umunsi ideni rifunguwe.",
    },
  },
  {
    key: RULE_KEYS.WAREHOUSE_CREDIT_INTEREST_DESTINATION,
    category: "WAREHOUSE_CREDIT",
    valueType: "TEXT",
    enforcement: "AUTOMATIC",
    defaultValue: null,
    displayOrder: 216,
    title: {
      en: "This 2% goes to the association alone",
      rw: "Iyi 2% igenerwa ihuriro ryonyine",
    },
    body: {
      en: "Unlike the interest on a cash loan, which is split half back into the borrower's own savings, none of the 2% on goods returns to you. It stays with the association, because the association paid the supplier for stock you are using before you have paid for it. It appears on the association's money page as warehouse income, and not one franc of it goes to the platform.",
      rw: "Bitandukanye n'inyungu z'inguzanyo y'amafaranga, igabanywamo kimwe cya kabiri kikagaruka mu buzigame bw'uwaguze, nta na kimwe muri 2% y'ibikoresho kigarukira wowe. Isigara ku ihuriro, kuko ari ryo ryishyuye uwatanze ibicuruzwa ku bikoresho ukoresha utarabyishyura. Igaragara ku ipaji y'amafaranga y'ihuriro nk'inyungu za Warehouse, kandi nta n'ifaranga rimwe rijya ku rubuga.",
    },
  },
  {
    // Art. 15.
    key: RULE_KEYS.WAREHOUSE_CREDIT_MINIMUM_MONTHS,
    category: "WAREHOUSE_CREDIT",
    valueType: "MONTHS",
    enforcement: "AUTOMATIC",
    defaultValue: "6",
    displayOrder: 217,
    title: {
      en: "Credit only after six months of saving",
      rw: "Ideni nyuma y'amezi atandatu uzigama",
    },
    body: {
      en: "Goods are given on credit only to a member who has been saving for this many months with a good record. Before that you may still use the warehouse, but you pay cash for what you take.",
      rw: "Ibikoresho bitangwa ku ideni gusa ku munyamuryango umaze aya mezi azigama kandi ufite amateka meza y'ibikorwa (transaction record). Mbere y'aho wemerewe gukoresha Warehouse, ariko ukishyura cash ako kanya ku byo ufashe.",
    },
  },
  {
    // Art. 10–17, 49–50 (warehouse chapters).
    key: RULE_KEYS.WAREHOUSE_ACCESS,
    category: "WAREHOUSE_CREDIT",
    valueType: "TEXT",
    enforcement: "INFORMATIONAL",
    defaultValue: null,
    displayOrder: 218,
    title: {
      en: "Who may use the warehouse, and at what price",
      rw: "Uwemerewe gukoresha Warehouse n'igiciro",
    },
    body: {
      en: "Only members with an active account may buy or take goods from the warehouse. Your Member ID, account and card are yours alone and may not be lent to anyone else. Goods are sold at a member price built from what RTA paid, transport, storage, running costs and an agreed margin — to help members, not to make a profit beyond what keeps the warehouse running. Goods are served first come, first served, and holding more shares never lets a member take the whole stock or keep others from it.",
      rw: "Umunyamuryango ufite konti ikora wenyine ni we wemerewe kugura cyangwa gufata ibikoresho muri Warehouse. Indangamuryango (Member ID), konti n'ikarita yawe ni ibyawe wenyine, ntiwemerewe kubiha undi muntu. Ibikoresho bigurishwa ku Giciro cy'Abanyamuryango gishingiye ku giciro RTA yaguzeho, transport, storage, operational costs na margin yumvikanyweho — hagamijwe gufasha umunyamuryango, atari ugukorera inyungu irenze ikenewe kugira ngo Warehouse ikomeze gukora. Hakurikizwa uwaje mbere, kandi kugira imigabane myinshi ntibyemerera umunyamuryango kwiharira ububiko cyangwa kubuza abandi kubona ibikoresho.",
    },
  },

  // -------------------------------------------------------------------------
  // HOW THE RULES THEMSELVES WORK
  // -------------------------------------------------------------------------
  {
    key: RULE_KEYS.RULES_PUBLISHED,
    category: "GOVERNANCE",
    valueType: "TEXT",
    enforcement: "AUTOMATIC",
    defaultValue: null,
    displayOrder: 220,
    title: {
      en: "Every member can read every rule",
      rw: "Buri munyamuryango ashobora gusoma buri tegeko",
    },
    body: {
      en: "These rules are on every member's dashboard, in their own language, with the exact figures the system applies. Where a rule here sets a figure, that figure is the one enforced, and nothing held elsewhere overrides it.",
      rw: "Aya mategeko ari ku ipaji ya buri munyamuryango, mu rurimi rwe, hamwe n'imibare nyayo sisitemu ikoresha. Iyo itegeko rya hano rishyizeho umubare, uwo mubare ni wo ukurikizwa, kandi nta kindi kibitse ahandi kiwusimbura.",
    },
  },
  {
    key: RULE_KEYS.AMENDMENT_PROCESS,
    category: "GOVERNANCE",
    valueType: "TEXT",
    enforcement: "AUTOMATIC",
    defaultValue: null,
    displayOrder: 230,
    title: {
      en: "How a rule is changed",
      rw: "Uko itegeko rihindurwa",
    },
    body: {
      en: "Any rule may be changed or added whenever needed, once the members of STGT approve it by an absolute majority (Art. 48). The committee then records the change on this platform, and every change records who made it, when, and the reason given. The previous wording and figure are kept, so a member fined last year can still read the rule as it stood then.",
      rw: "Buri ngingo ishobora kuvugururwa cyangwa kongerwamo indi igihe cyose bibaye ngombwa, bikemezwa n'abanyamuryango ba STGT ku bwiganze busesuye (Ingingo ya 48). Komite noneho yandika iyo mpinduka kuri uru rubuga, kandi buri mpinduka yandika uwayikoze, ryari, n'impamvu yatanzwe. Amagambo n'umubare byari bisanzwe birabikwa, bityo umunyamuryango wahawe ihazabu umwaka ushize aracyashobora gusoma itegeko uko ryari rimeze icyo gihe.",
    },
  },
  {
    // Art. 37, 40.
    key: RULE_KEYS.YEAR_END_ACCOUNTS,
    category: "GOVERNANCE",
    valueType: "TEXT",
    enforcement: "INFORMATIONAL",
    defaultValue: null,
    displayOrder: 235,
    title: {
      en: "Profit and loss are worked out once a year",
      rw: "Inyungu n'igihombo bibarwa rimwe mu mwaka",
    },
    body: {
      en: "The accounts are closed once a year, after the last share-buying meeting, and each member is shown their profit or their part of any loss. If the accounting commission finds a loss, the general assembly appoints a team to examine it and decide whether it is a shared loss or one that particular people caused and must answer for.",
      rw: "Ibaruramari rikorwa rimwe mu mwaka nyuma y'inama ya nyuma y'iguramigabane, buri munyamuryango akagaragarizwa inyungu cyangwa igihombo. Iyo Komisiyo y'Ibaruramari igaragaje igihombo, inteko rusange ishyiraho itsinda ryo kugenzura imiterere yacyo, rikemeza niba ari igihombo rusange cyangwa ko hari abagiteje bakaba ari bo bakibazwa.",
    },
  },
  {
    // Art. 15, 16, 20, 21 (chapter VII).
    key: RULE_KEYS.GENERAL_ASSEMBLY,
    category: "GOVERNANCE",
    valueType: "TEXT",
    enforcement: "INFORMATIONAL",
    defaultValue: null,
    displayOrder: 240,
    title: {
      en: "The general assembly",
      rw: "Inteko rusange",
    },
    body: {
      en: "The general assembly is STGT's highest body. It meets twice a year, in June and December, called and chaired by the STGT leader (or the deputy), and may also meet when at least a third of members ask for it. Every member is told the date and place at least 15 days ahead. It may decide only when half the members plus one are present, and a decision passes only with the support of at least three quarters of those present.",
      rw: "Inteko rusange ni rwo rwego rw'ikirenga rwa STGT. Iterana kabiri mu mwaka, mu kwezi kwa Kamena n'Ukuboza, itumijwe kandi iyobowe n'Umuyobozi wa STGT (cyangwa Umwungirije), kandi ishobora guterana bisabwe nibura na 1/3 cy'abanyamuryango. Buri munyamuryango amenyeshwa igihe n'aho izabera mbere y'iminsi 15. Ifata ibyemezo iyo irimo kimwe cya kabiri wongeyeho umwe (1/2+1) by'abanyamuryango bose, kandi umwanzuro wemezwa ari uko ushyigikiwe nibura na 3/4 by'abitabiriye inama.",
    },
  },
  {
    // Art. 8–11, 17, 19, 22, 28, 46.
    key: RULE_KEYS.COMMITTEES,
    category: "GOVERNANCE",
    valueType: "TEXT",
    enforcement: "INFORMATIONAL",
    defaultValue: null,
    displayOrder: 245,
    title: {
      en: "Committees and who signs",
      rw: "Komite n'abasinya",
    },
    body: {
      en: "The executive committee and the audit committee are elected by the general assembly, with at least half the members plus one present, for two years; members may stand again. Loans are decided by the credit commission, and disputes by the RTA executive committee acting as arbitration commission. Anyone on a committee or commission who misses three meetings in a row is removed. Committee members attending a meeting receive 5,000; a member sent on the association's business receives travel, meals, lodging and 10,000 a day. Documents bind STGT only when signed by its leader or the deputy, and money leaves the bank account only with all signatories present, or with two authorised by the third.",
      rw: "Komite Nyobozi na Komite Ngenzuzi zitorwa n'inteko rusange yitabiriwe nibura na 50%+1, zikagira manda y'imyaka 2; uwari muri komite yemerewe kongera kwiyamamaza. Inguzanyo zemezwa na Komisiyo ishinzwe inguzanyo, naho amakimbirane akemurwa na Komite Nyobozi ya RTA nka komisiyo nkemurampaka. Uri muri Komite cyangwa Komisiyo usibye gahunda zayo inshuro 3 zikurikirana arasezererwa. Abitabiriye inama ya Komite bahabwa 5,000; umunyamuryango watumwe mu butumwa bufitiye inyungu STGT ahabwa urugendo, amafunguro, icumbi n'insimburamubyizi ya 10,000 ku munsi. Inyandiko zigira agaciro iyo ziriho umukono w'Umuyobozi cyangwa Umwungirije, kandi amafaranga ava kuri konti ari uko abasinya bose bahari, cyangwa umwe muri bo yahaye uburenganzira babiri basigaye.",
    },
  },
  {
    // Art. 21. Recorded by an officer.
    key: RULE_KEYS.ASSEMBLY_ABSENCE_FINE,
    category: "GOVERNANCE",
    valueType: "MONEY",
    enforcement: "INFORMATIONAL",
    defaultValue: "2000.00",
    displayOrder: 250,
    title: {
      en: "Missing the general assembly",
      rw: "Gusiba inteko rusange",
    },
    body: {
      en: "A member who does not attend the general assembly pays this fine.",
      rw: "Umunyamuryango utitabiriye inama y'inteko rusange atanga aya mande.",
    },
  },
  {
    // Closing chapter, second "Art. 45".
    key: RULE_KEYS.MEETING_LATE_FINE,
    category: "GOVERNANCE",
    valueType: "MONEY",
    enforcement: "INFORMATIONAL",
    defaultValue: "500.00",
    displayOrder: 255,
    title: {
      en: "Late for the share-buying meeting",
      rw: "Gukererwa inama y'iguramigabane",
    },
    body: {
      en: "The share-buying meeting starts at 14:00. Arriving more than 10 but not more than 30 minutes late is fined this amount.",
      rw: "Inama y'iguramigabane itangira saa 14h00. Ukererewe birenze iminota 10 ariko itarenze 30 yishyura aya mande.",
    },
  },
  {
    // Closing chapter, second "Art. 45".
    key: RULE_KEYS.MEETING_VERY_LATE_FINE,
    category: "GOVERNANCE",
    valueType: "MONEY",
    enforcement: "INFORMATIONAL",
    defaultValue: "1000.00",
    displayOrder: 256,
    title: {
      en: "More than 30 minutes late",
      rw: "Gukererwa iminota irenze 30",
    },
    body: {
      en: "Arriving more than 30 minutes late, without a reason given beforehand to the treasurer and the discipline officer, is fined this amount.",
      rw: "Gukererwa iminota irenze 30 nta mpamvu yamenyeshejwe umubitsi n'ushinzwe ikinyabupfura bihanishwa aya mande.",
    },
  },
  {
    // Closing chapter, second "Art. 47".
    key: RULE_KEYS.MISCONDUCT_FINE,
    category: "GOVERNANCE",
    valueType: "MONEY",
    enforcement: "INFORMATIONAL",
    defaultValue: "10000.00",
    displayOrder: 260,
    title: {
      en: "Insulting or demeaning another member",
      rw: "Gutukana cyangwa gusuzugura mugenzi wawe",
    },
    body: {
      en: "Misconduct such as insulting, defaming or demeaning another member goes to the discipline commission. The side found at fault pays this fine to the side it wronged; if both were at fault, each pays it into STGT's fund. The commission may add other sanctions.",
      rw: "Umunyamuryango ugaragaweho imyitwarire mibi nko gutukana, gusebanya cyangwa gusuzugura mugenzi we ashyikirizwa Komisiyo y'Ikinyabupfura. Uruhande rugaragaye ko rufite ikosa rucibwa aya mande agahabwa uruhande rwakorewe ikosa; iyo impande zombi zakoze ikosa, buri ruhande ruyacibwa agashyirwa mu isanduku ya STGT. Komisiyo ishobora gutanga ibindi bihano bikwiye.",
    },
  },

  // -------------------------------------------------------------------------
  // MUTUAL SUPPORT (Art. 41–44)
  //
  // Paid out by the committee; nothing in the system pays them automatically.
  // -------------------------------------------------------------------------
  {
    key: RULE_KEYS.WELFARE_BEREAVEMENT,
    category: "OTHER",
    valueType: "MONEY",
    enforcement: "INFORMATIONAL",
    defaultValue: "100000.00",
    displayOrder: 300,
    title: {
      en: "Support on a death in the family",
      rw: "Gutabarwa igihe wapfushije",
    },
    body: {
      en: "A member who loses a spouse, their own child or a parent is supported with this amount: half from STGT's fund and half contributed by all members.",
      rw: "Umunyamuryango wapfushije uwo bafitanye isano ryo ku rwego rwa mbere (umugore, umugabo, umwana bwite cyangwa umubyeyi) aratabarwa akagenerwa aya mafaranga: kimwe cya kabiri kiva mu isanduku ya STGT, ikindi gitangwa n'abanyamuryango bose.",
    },
  },
  {
    key: RULE_KEYS.WELFARE_WEDDING,
    category: "OTHER",
    valueType: "MONEY",
    enforcement: "INFORMATIONAL",
    defaultValue: "20000.00",
    displayOrder: 310,
    title: {
      en: "A wedding",
      rw: "Ubukwe",
    },
    body: {
      en: "A member who marries, or whose own child marries, receives this amount, and members support them in the other wedding preparations.",
      rw: "Umunyamuryango ushyingiwe cyangwa ushyingira umwana we bwite agenerwa aya mafaranga, kandi abanyamuryango bakamushyigikira no mu yindi mirimo y'ubukwe.",
    },
  },
  {
    key: RULE_KEYS.WELFARE_BIRTH,
    category: "OTHER",
    valueType: "MONEY",
    enforcement: "INFORMATIONAL",
    defaultValue: "20000.00",
    displayOrder: 320,
    title: {
      en: "A birth",
      rw: "Kubyara",
    },
    body: {
      en: "A member who gives birth receives this amount and a visit from members.",
      rw: "Umunyamuryango wabyaye agenerwa aya mafaranga kandi agasurwa.",
    },
  },
  {
    key: RULE_KEYS.WELFARE_HOSPITAL,
    category: "OTHER",
    valueType: "MONEY",
    enforcement: "INFORMATIONAL",
    defaultValue: "50000.00",
    displayOrder: 330,
    title: {
      en: "A long stay in hospital",
      rw: "Kurwara igihe kirekire",
    },
    body: {
      en: "A member who is in hospital for more than a month, or whose spouse or own child is, receives this amount and a visit, on showing the hospital papers.",
      rw: "Umunyamuryango warwaye cyangwa warwaje umugore, umugabo cyangwa umwana we bwite igihe kirenze ukwezi ari mu bitaro, kandi afite impapuro zibigaragaza, agenerwa aya mafaranga kandi agasurwa.",
    },
  },
] as const;

/** Lookup by key. Built once — the catalogue never changes at runtime. */
export const RULE_BY_KEY: ReadonlyMap<string, RuleDefinition> = new Map(
  RULE_CATALOGUE.map((rule) => [rule.key as string, rule])
);

/**
 * The order categories are drawn in, on both the admin rulebook and the
 * member's page. Follows the member's own journey rather than the alphabet:
 * what you pay, what it costs, what happens if you slip, when you can borrow,
 * on what terms, and where the money ends up.
 */
export const RULE_CATEGORY_ORDER: readonly RuleCategory[] = [
  "CONTRIBUTIONS",
  "PLATFORM_FEE",
  "PENALTIES",
  "LENDING_ELIGIBILITY",
  "LOAN_TERMS",
  "INTEREST_SHARING",
  "WAREHOUSE_CREDIT",
  "GOVERNANCE",
  "OTHER",
] as const;

/**
 * Turns a rule value into a slug-safe key for a committee's own rule.
 *
 * Prefixed with `custom.` so a custom rule can never collide with a catalogue
 * key, which is what keeps `getPolicy()` from picking up a hand-written row
 * where it expects a system one.
 */
export function customRuleKey(title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);

  // A title of pure punctuation would slug to nothing; fall back to a stamp
  // rather than minting `custom.`, which would collide with the next one.
  return `custom.${slug || `rule_${Date.now().toString(36)}`}`;
}
