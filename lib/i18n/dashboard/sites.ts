import type { Locale } from "@/types";

/**
 * The platform's home (/) and the site every hosted association gets
 * automatically (/abc). RTA's site (/rta) is the hand-built marketing site and
 * has its own copy in lib/i18n/dictionary.ts.
 *
 * The association site is a template: it has to read well for an association
 * nobody has written a word about yet, so it says what membership is and what
 * it costs — the share price and fee come from that association's rulebook —
 * and leaves the rest to the association's name.
 */
export interface SitesCopy {
  platform: {
    description: string;
    eyebrow: string;
    /// The headline is two parts: the second is drawn in the gold gradient.
    headlineLead: string;
    headlineAccent: string;
    lead: string;
    findAssociation: string;
    signIn: string;
    trustLanguages: string;
    trustPhone: string;
    trustBank: string;
    /// The hero's product illustration. Its figures are samples, never data.
    compositeLabel: string;
    compositeSample: string;
    compositeMember: string;
    compositeBalance: string;
    compositeToday: string;
    compositeStreak: string;
    compositeLoan: string;
    compositeLoanTerms: string;
    compositeMatched: string;
    compositeMatchedBody: string;
    statsTitle: string;
    statAssociations: string;
    statMembers: string;
    statLanguages: string;
    howEyebrow: string;
    howTitle: string;
    howLead: string;
    stepJoin: string;
    stepJoinBody: string;
    stepRules: string;
    stepRulesBody: string;
    stepSave: string;
    stepSaveBody: string;
    stepLend: string;
    stepLendBody: string;
    featuresEyebrow: string;
    featuresTitle: string;
    featuresLead: string;
    featureSave: string;
    featureSaveBody: string;
    featureLend: string;
    featureLendBody: string;
    featureBank: string;
    featureBankBody: string;
    featureFines: string;
    featureFinesBody: string;
    featureReports: string;
    featureReportsBody: string;
    featureApp: string;
    featureAppBody: string;
    associationsEyebrow: string;
    associationsTitle: string;
    associationsLead: string;
    noAssociations: string;
    accepting: string;
    moreJoining: string;
    moreJoiningBody: string;
    website: string;
    join: string;
    login: string;
    ctaEyebrow: string;
    ctaTitle: string;
    ctaBody: string;
    ctaDirectory: string;
  };
  association: {
    eyebrow: string;
    headline: string;
    lead: string;
    apply: string;
    signIn: string;
    costTitle: string;
    sharePrice: string;
    sharePriceHint: string;
    fee: string;
    feeHint: string;
    contactTitle: string;
    poweredBy: string;
    registerTitle: string;
  };
}

export const sites: Record<Locale, SitesCopy> = {
  en: {
    platform: {
      description:
        "A savings and loans system for private-sector associations: members, contributions, loans, bank reconciliation and reports, each association on its own site under its own rules.",
      eyebrow: "Savings & loans platform",
      headlineLead: "Every association's savings,",
      headlineAccent: "run properly.",
      lead: "SSPSG gives private-sector associations a complete savings and loans system. Each association has its own website, its own members and its own rules; SSPSG keeps them running.",
      findAssociation: "Find your association",
      signIn: "Platform sign in",
      trustLanguages: "English & Kinyarwanda",
      trustPhone: "Works on any phone",
      trustBank: "Bank statements matched automatically",
      compositeLabel:
        "Illustration of a member's view on SSPSG, with sample figures: a savings balance, a 30-day saving record, an approved loan and a matched bank statement.",
      compositeSample: "Sample",
      compositeMember: "Member · 4 shares",
      compositeBalance: "Savings balance",
      compositeToday: "today",
      compositeStreak: "Daily saving, last 30 days",
      compositeLoan: "Loan approved",
      compositeLoanTerms: "6 months",
      compositeMatched: "Bank statement matched",
      compositeMatchedBody: "42 payments",
      statsTitle: "SSPSG today",
      statAssociations: "Associations running on SSPSG",
      statMembers: "Active members saving",
      statLanguages: "Languages, on every screen",
      howEyebrow: "How it works",
      howTitle: "From joining to sharing the interest",
      howLead:
        "An association keeps its own name, its own rules and its own committee. SSPSG does the record-keeping.",
      stepJoin: "Your association joins SSPSG",
      stepJoinBody:
        "It gets its own website, sign-in and membership application, ready the day it is set up.",
      stepRules: "It sets its own rules",
      stepRulesBody:
        "Share price, service fee, fines and loan terms come from the association's own rulebook.",
      stepSave: "Members save daily by share",
      stepSaveBody:
        "Every contribution is recorded against the member's shares and matched to the bank statement.",
      stepLend: "Borrow fairly, share the interest",
      stepLendBody:
        "Loans follow the rulebook, and the interest the association earns comes back to its members.",
      featuresEyebrow: "What's inside",
      featuresTitle: "Everything a savings committee does, in one place",
      featuresLead:
        "The tools a savings and loans committee needs, without the paper ledgers and spreadsheets.",
      featureSave: "Daily share savings",
      featureSaveBody:
        "Members save by share every day. Each contribution is recorded, and every member can see their own balance at any time.",
      featureLend: "Loans by your own rulebook",
      featureLendBody:
        "Loans follow the association's own rulebook: how much, for how long, and what has to be pledged.",
      featureBank: "Automatic bank matching",
      featureBankBody:
        "Bank of Kigali statements come in, and each payment is matched to the member who made it.",
      featureFines: "Fines & compliance",
      featureFinesBody:
        "Late contributions and missed obligations are tracked, so the committee sees who is up to date.",
      featureReports: "Reports for every meeting",
      featureReportsBody:
        "Growth summaries and reports, ready to share with the committee and the members.",
      featureApp: "In your language, on your phone",
      featureAppBody:
        "Every screen in English and Kinyarwanda, and installable on any phone like an app.",
      associationsEyebrow: "Directory",
      associationsTitle: "Associations on SSPSG",
      associationsLead: "Each association has its own website, sign-in and membership application.",
      noAssociations: "No associations have joined yet.",
      accepting: "Accepting members",
      moreJoining: "More associations are joining",
      moreJoiningBody:
        "Each new association gets its place here, with its own website, sign-in and application.",
      website: "Website",
      join: "Apply to join",
      login: "Sign in",
      ctaEyebrow: "For association leaders",
      ctaTitle: "Bring your association onto SSPSG",
      ctaBody:
        "Keep your name, your rules and your committee. Your members get a clear record of every franc they save and borrow.",
      ctaDirectory: "See the associations",
    },
    association: {
      eyebrow: "Savings & loans",
      headline: "Save together. Borrow fairly. Grow.",
      lead: "Members of {name} save a little every day, borrow against what they have saved, and share in what the association earns.",
      apply: "Apply to join",
      signIn: "Sign in",
      costTitle: "What membership costs",
      sharePrice: "Daily saving per share",
      sharePriceHint: "You choose how many shares to take when you apply.",
      fee: "Service fee per share, per day",
      feeHint: "Pays for running the system that keeps your record.",
      contactTitle: "Contact",
      poweredBy: "Powered by",
      registerTitle: "Apply to join {name}",
    },
  },

  rw: {
    platform: {
      description:
        "Uburyo bwo kuzigama no kuguriza bugenewe amashyirahamwe y'abikorera: abanyamuryango, imisanzu, inguzanyo, guhuza na banki na raporo, buri shyirahamwe rifite urubuga rwaryo n'amategeko yaryo.",
      eyebrow: "Urubuga rwo kuzigama no kuguriza",
      headlineLead: "Ubuzigame bwa buri shyirahamwe,",
      headlineAccent: "bucunzwe neza.",
      lead: "SSPSG iha amashyirahamwe y'abikorera uburyo bwuzuye bwo kuzigama no kuguriza. Buri shyirahamwe rifite urubuga rwaryo, abanyamuryango baryo n'amategeko yaryo; SSPSG ibikurikirana byose.",
      findAssociation: "Shaka ishyirahamwe ryawe",
      signIn: "Kwinjira ku rubuga",
      trustLanguages: "Ikinyarwanda n'Icyongereza",
      trustPhone: "Ikora kuri telefoni iyo ari yo yose",
      trustBank: "Raporo za banki zihuzwa mu buryo bwikora",
      compositeLabel:
        "Ishusho y'ibyo umunyamuryango abona kuri SSPSG, ifite imibare y'urugero: ubuzigame, kuzigama kw'iminsi 30, inguzanyo yemejwe na raporo ya banki yahujwe.",
      compositeSample: "Urugero",
      compositeMember: "Umunyamuryango · imigabane 4",
      compositeBalance: "Ubuzigame",
      compositeToday: "uyu munsi",
      compositeStreak: "Kuzigama kwa buri munsi, iminsi 30 ishize",
      compositeLoan: "Inguzanyo yemejwe",
      compositeLoanTerms: "amezi 6",
      compositeMatched: "Raporo ya banki yahujwe",
      compositeMatchedBody: "Ubwishyu 42",
      statsTitle: "SSPSG uyu munsi",
      statAssociations: "Amashyirahamwe akoresha SSPSG",
      statMembers: "Abanyamuryango bazigama",
      statLanguages: "Indimi, kuri buri paji",
      howEyebrow: "Uko bikora",
      howTitle: "Kuva ku kwinjira kugeza ku gusangira inyungu",
      howLead:
        "Ishyirahamwe rigumana izina ryaryo, amategeko yaryo na komite yaryo. SSPSG ikabika amakuru yose.",
      stepJoin: "Ishyirahamwe ryinjira muri SSPSG",
      stepJoinBody:
        "Rihabwa urubuga rwaryo, aho kwinjira n'aho gusaba kwinjira, byose biteguye kuva umunsi rishyizweho.",
      stepRules: "Rishyiraho amategeko yaryo",
      stepRulesBody:
        "Igiciro cy'umugabane, amafaranga ya serivisi, amahazabu n'amabwiriza y'inguzanyo biva mu mategeko y'ishyirahamwe ubwaryo.",
      stepSave: "Abanyamuryango bazigama buri munsi ku migabane",
      stepSaveBody:
        "Buri musanzu wandikwa ku migabane y'umunyamuryango kandi ugahuzwa na raporo ya banki.",
      stepLend: "Baguza neza, bagasangira inyungu",
      stepLendBody:
        "Inguzanyo zikurikiza amategeko, kandi inyungu ishyirahamwe ryinjiza igaruka ku banyamuryango baryo.",
      featuresEyebrow: "Ibikubiyemo",
      featuresTitle: "Ibyo komite y'ubuzigame ikora byose, ahantu hamwe",
      featuresLead:
        "Ibikoresho komite yo kuzigama no kuguriza ikeneye, nta bitabo by'impapuro cyangwa amadosiye ya Excel.",
      featureSave: "Kuzigama ku migabane buri munsi",
      featureSaveBody:
        "Abanyamuryango bazigama ku migabane buri munsi. Buri musanzu urandikwa, kandi buri munyamuryango abona ubuzigame bwe igihe cyose.",
      featureLend: "Inguzanyo zikurikiza amategeko yanyu",
      featureLendBody:
        "Inguzanyo zikurikiza amategeko y'ishyirahamwe: ingano, igihe, n'icyo ugomba gutangaho ingwate.",
      featureBank: "Guhuza na banki mu buryo bwikora",
      featureBankBody:
        "Raporo za Banki ya Kigali zirinjizwa, buri bwishyu bugahuzwa n'umunyamuryango wabwishyuye.",
      featureFines: "Amahazabu n'iyubahirizwa ry'amategeko",
      featureFinesBody:
        "Imisanzu yatinze n'inshingano zitubahirijwe birakurikiranwa, komite ikamenya uwujuje ibisabwa.",
      featureReports: "Raporo za buri nama",
      featureReportsBody:
        "Incamake y'iterambere na raporo, biteguye gusangizwa komite n'abanyamuryango.",
      featureApp: "Mu rurimi rwawe, kuri telefoni yawe",
      featureAppBody:
        "Buri paji iri mu Kinyarwanda no mu Cyongereza, kandi ishobora gushyirwa kuri telefoni iyo ari yo yose nka porogaramu.",
      associationsEyebrow: "Urutonde",
      associationsTitle: "Amashyirahamwe ari kuri SSPSG",
      associationsLead: "Buri shyirahamwe rifite urubuga rwaryo, aho kwinjira n'aho kwiyandikisha.",
      noAssociations: "Nta shyirahamwe riraza.",
      accepting: "Irakira abanyamuryango",
      moreJoining: "Andi mashyirahamwe ari mu nzira",
      moreJoiningBody:
        "Buri shyirahamwe rishya rihabwa umwanya hano, rifite urubuga rwaryo, aho kwinjira n'aho gusaba kwinjira.",
      website: "Urubuga",
      join: "Saba kwinjira",
      login: "Injira",
      ctaEyebrow: "Ku bayobozi b'amashyirahamwe",
      ctaTitle: "Zana ishyirahamwe ryanyu kuri SSPSG",
      ctaBody:
        "Mugumana izina ryanyu, amategeko yanyu na komite yanyu. Abanyamuryango banyu babona neza buri faranga bazigamye n'iryo baguze.",
      ctaDirectory: "Reba amashyirahamwe",
    },
    association: {
      eyebrow: "Kuzigama no kuguriza",
      headline: "Tuzigamire hamwe. Tugurizanye neza. Dutere imbere.",
      lead: "Abanyamuryango ba {name} bazigama make buri munsi, bakaguza bashingiye ku byo bazigamye, kandi bagasangira inyungu ishyirahamwe ryinjiza.",
      apply: "Saba kwinjira",
      signIn: "Injira",
      costTitle: "Ibyo ubunyamuryango busaba",
      sharePrice: "Kuzigama kwa buri munsi ku mugabane",
      sharePriceHint: "Uhitamo umubare w'imigabane ufata igihe usaba kwinjira.",
      fee: "Amafaranga ya serivisi ku mugabane, ku munsi",
      feeHint: "Yishyura imikorere y'ikoranabuhanga ribika amakuru yawe.",
      contactTitle: "Aho wabariza",
      poweredBy: "Bikoreshwa na",
      registerTitle: "Saba kwinjira muri {name}",
    },
  },
};
