import { formatMoney } from "@/lib/money";
import { formatLongDate } from "@/lib/i18n/dates";
import { NOTIFICATION_EVENTS, type NotificationEvent } from "@/lib/notifications/types";
import type { TemplateContext } from "@/lib/notifications/templates";

/**
 * The Kinyarwanda copy of every message — the only language members receive
 * by email and SMS (in-app notifications also carry the English below it).
 *
 * WORDING. Plain, formal Kinyarwanda of the kind Rwandan banks and SACCOs use
 * with their customers, so a member who has never used a dashboard still
 * understands every line:
 *
 *   ubwizigame          savings (the standard spelling, as in MoKash and the
 *                       Umwalimu SACCO press; not "ubuzigame")
 *   ishyirahamwe        the association (RTA is "Ishyirahamwe ry'Abadozi
 *                       b'u Rwanda"; "ihuriro" means a federation or forum)
 *   ubuyobozi           the association's officers, whom members contact
 *   nimero y'ubwishyu   payment reference, as on the dashboard
 *   amafaranga ya serivisi   service fee
 *   ibirarane           arrears; "gucibwa ihazabu" is to be fined
 *   inguzanyo, inyungu, umwishingizi, kubikuza   loan, interest, guarantor,
 *                       withdraw
 *
 * Amounts are written the Kinyarwanda way, "12,000 Frw", and dates with the
 * month in full ("5 Ukwakira 2026"), because an abbreviated month is the part
 * a reader is most likely to misread. No English words, "Ref" included.
 *
 * The same SMS rule applies as in templates.ts: plain ASCII only, one segment
 * where possible, so a message is never pushed into UCS-2 and billed at 70
 * characters a segment.
 *
 * Free text an officer typed (a reason, a rule's title, an announcement) is
 * passed through as written; it is not translated.
 */

export interface LocalisedCopy {
  title: string;
  body: string;
  sms?: string;
  emailSubject: string;
  emailText: string;
}

const date = (value?: Date): string => (value ? formatLongDate(value, "rw") : "");

/** e.g. "12,000 Frw". Plain ASCII, so it is safe in SMS too. */
const frw = (amount?: string): string =>
  `${formatMoney(amount ?? "0", { showSymbol: false })} Frw`;

const NOT_STATED = "Ntiyatanzwe";

/** True when a service fee was actually taken, so the message names it. */
const hasFee = (fee?: string): fee is string => Number(fee ?? 0) > 0;

export function renderKinyarwanda(
  event: NotificationEvent,
  context: TemplateContext
): LocalisedCopy {
  const { firstName, associationName } = context;
  const dear = `Muraho ${firstName},`;
  const close = `\n\nMurakoze,\n${associationName}`;
  const contact = "vugana n'ubuyobozi bw'ishyirahamwe";

  switch (event) {
    case NOTIFICATION_EVENTS.MEMBER_REGISTERED:
      return {
        title: "Ubusabe bwawe bwakiriwe",
        body: `Ubusabe bwawe bwo kuba umunyamuryango bwakiriwe kandi buri gusuzumwa. Nimero yawe y'ubwishyu ni ${context.paymentReference}.`,
        sms: `${associationName}: Ubusabe bwawe bwakiriwe. Nimero yawe y'ubwishyu ni ${context.paymentReference}. Uyibike neza, uyikoreshe igihe cyose wishyura.`,
        emailSubject: `Ubusabe bwawe bwo kuba umunyamuryango wa ${associationName} bwakiriwe`,
        emailText: `${dear}\n\nTwakiriye ubusabe bwawe bwo kuba umunyamuryango wa ${associationName}.\n\nNimero yawe y'ubwishyu ni ${context.paymentReference}. Uzajye uyikoresha igihe cyose wishyura, kuko ari yo ituma amafaranga yawe ashyirwa kuri konti yawe y'ubwizigame.\n\nTuzakumenyesha ubuyobozi nibumara gusuzuma ubusabe bwawe.${close}`,
      };

    case NOTIFICATION_EVENTS.MEMBER_APPROVED:
      return {
        title: "Wemerewe kuba umunyamuryango",
        body: `Murakaza neza muri ${associationName}. Konti yawe yatangiye gukora, ushobora gutangira kuzigama.`,
        sms: `${associationName}: Wemerewe kuba umunyamuryango. Nimero yawe y'ubwishyu ni ${context.paymentReference}. Uyikoreshe igihe cyose wishyura.`,
        emailSubject: `Murakaza neza muri ${associationName}`,
        emailText: `${dear}\n\nTunejejwe no kukumenyesha ko wemerewe kuba umunyamuryango wa ${associationName}, kandi konti yawe yatangiye gukora.\n\nNimero yawe y'ubwishyu ni ${context.paymentReference}. Uyikoreshe igihe cyose wishyura umusanzu.\n\nUbu ushobora kwinjira muri konti yawe ukareba ubwizigame bwawe, ugasaba inguzanyo, kandi ukabona raporo y'ibyakozwe kuri konti yawe.${close}`,
      };

    case NOTIFICATION_EVENTS.MEMBER_REJECTED:
      return {
        title: "Ubusabe bwawe ntibwemewe",
        body: context.reason ?? "Ubusabe bwawe bwo kuba umunyamuryango ntibwemewe.",
        emailSubject: `Ubusabe bwawe bwo kuba umunyamuryango wa ${associationName}`,
        emailText: `${dear}\n\nTubabajwe no kukumenyesha ko ubusabe bwawe bwo kuba umunyamuryango wa ${associationName} butemewe.\n\nImpamvu: ${context.reason ?? NOT_STATED}\n\nNiba wifuza ibindi bisobanuro, ${contact}.${close}`,
      };

    case NOTIFICATION_EVENTS.PAYMENT_RECEIVED:
      return {
        title: "Twakiriye ubwishyu bwawe",
        body: hasFee(context.fee)
          ? `Twakiriye ${frw(context.amount)}. Havuyemo amafaranga ya serivisi ${frw(context.fee)}. Ubwizigame bwawe ubu ni ${frw(context.balance)}.`
          : `Twakiriye ${frw(context.amount)}. Ubwizigame bwawe ubu ni ${frw(context.balance)}.`,
        sms: hasFee(context.fee)
          ? `${associationName}: Twakiriye ${frw(context.amount)}, havamo amafaranga ya serivisi ${frw(context.fee)}. Ubwizigame bwawe ni ${frw(context.balance)}. Nimero: ${context.reference}.`
          : `${associationName}: Twakiriye ${frw(context.amount)}. Ubwizigame bwawe ubu ni ${frw(context.balance)}. Nimero: ${context.reference}.`,
        emailSubject: `Twakiriye ubwishyu bwawe bwa ${frw(context.amount)}`,
        emailText: `${dear}\n\nTwakiriye umusanzu wawe wa ${frw(context.amount)}.\n\nNimero y'igikorwa: ${context.reference}\n${hasFee(context.fee) ? `Amafaranga ya serivisi yavuyemo: ${frw(context.fee)}\n` : ""}Ubwizigame bwawe ubu ni: ${frw(context.balance)}${close}`,
      };

    case NOTIFICATION_EVENTS.CONTRIBUTION_DUE_WARNING: {
      const today = context.daysUntilFine === 0;
      const when = today ? "uyu munsi" : `mu minsi ${context.daysUntilFine}`;
      return {
        title: today
          ? "Ishyura uyu munsi wirinde ihazabu"
          : `Ufite ibirarane by'iminsi ${context.daysBehind} mu kuzigama`,
        body: `Ufite ibirarane by'iminsi ${context.daysBehind} mu kuzigama kwa buri munsi. Ishyura ${frw(context.clearingAmount)} ${when} kugira ngo wirinde ihazabu ya ${frw(context.fineAmount)}.`,
        sms: `${associationName}: Ufite ibirarane by'iminsi ${context.daysBehind}. Ishyura ${frw(context.clearingAmount)} ${when} wirinde ihazabu ya ${frw(context.fineAmount)}. Nimero y'ubwishyu: ${context.paymentReference}.`,
        emailSubject: `Icyitonderwa: ufite ibirarane by'iminsi ${context.daysBehind} mu kuzigama`,
        emailText: `${dear}\n\nUfite ibirarane by'iminsi ${context.daysBehind} mu kuzigama kwa buri munsi.\n\nKugira ngo ube nta birarane ufite, ishyura ${frw(context.clearingAmount)} ukoresheje nimero yawe y'ubwishyu ${context.paymentReference}.\n\n${today ? "Niba utishyuye uyu munsi" : `Niba mu minsi ${context.daysUntilFine} uzaba ugifite ibirarane`}, uzahita ucibwa ihazabu ya ${frw(context.fineAmount)}. Kwishyura mbere y'icyo gihe bizakurinda iyo hazabu.\n\nNiba muri iki gihe udashobora kwishyura, ${contact}. Mushobora kumvikana ku gihe cy'ikiruhuko aho gucibwa ihazabu.${close}`,
      };
    }

    case NOTIFICATION_EVENTS.CONTRIBUTION_FINE_CHARGED:
      return {
        title: "Waciwe ihazabu",
        body: `Kubera ko wari ufite ibirarane by'iminsi ${context.daysBehind} mu kuzigama, waciwe ihazabu ya ${frw(context.amount)}. Ishyura ${frw(context.clearingAmount)} kugira ngo wishyure byose.`,
        sms: `${associationName}: Waciwe ihazabu ya ${frw(context.amount)} kubera ibirarane by'iminsi ${context.daysBehind}. Ayo wishyura yose ni ${frw(context.clearingAmount)}. Nimero y'ubwishyu: ${context.paymentReference}.`,
        emailSubject: `Waciwe ihazabu ya ${frw(context.amount)}`,
        emailText: `${dear}\n\nUmaze iminsi ${context.daysBehind} ufite ibirarane mu kuzigama kwa buri munsi. Hakurikijwe amategeko y'ishyirahamwe, waciwe ihazabu ya ${frw(context.finePerShare)} kuri buri mugabane ufite.\n\nIhazabu: ${frw(context.amount)} (imigabane ${context.fineShares} x ${frw(context.finePerShare)})\nNimero y'ihazabu: ${context.reference}\n\nKugira ngo wishyure ibirarane n'iyi hazabu icyarimwe, ishyura ${frw(context.clearingAmount)} ukoresheje nimero yawe y'ubwishyu ${context.paymentReference}.\n\nItegeko ryakurikijwe n'uko konti yawe ihagaze muri rusange ubisanga ku rupapuro rw'amategeko muri konti yawe. Niba ubona ko habayeho ikosa, cyangwa ukeneye igihe cyo kwishyura, ${contact}. Umuyobozi ashobora kugukuriraho ihazabu, akandika impamvu.${close}`,
      };

    case NOTIFICATION_EVENTS.CONTRIBUTION_BACK_ON_TRACK:
      return {
        title: "Nta birarane ufite",
        body: `Kuzigama kwawe kwa buri munsi kuri ku gihe. Ubwizigame bwawe ni ${frw(context.balance)}.`,
        emailSubject: "Nta birarane ufite mu kuzigama",
        emailText: `${dear}\n\nTukumenyesha ko kuzigama kwawe kwa buri munsi kuri ku gihe: nta birarane ufite kandi nta hazabu ugomba kwishyura.\n\nUbwizigame bwawe ni: ${frw(context.balance)}\n\nKomeza uzigame neza.${close}`,
      };

    case NOTIFICATION_EVENTS.INTEREST_SHARE_CREDITED:
      return {
        title: "Wasubijwe igice cy'inyungu y'inguzanyo",
        body: `Amafaranga ${frw(context.amount)} yo ku nyungu wishyuye ku nguzanyo yashyizwe mu bwizigame bwawe. Ubwizigame bwawe ubu ni ${frw(context.balance)}.`,
        emailSubject: `Amafaranga ${frw(context.amount)} y'inyungu yashyizwe mu bwizigame bwawe`,
        emailText: `${dear}\n\nHakurikijwe itegeko ry'ishyirahamwe ryo kugabana inyungu, kimwe cya kabiri cy'inyungu wishyura ku nguzanyo kigusubizwa.\n\nAmafaranga yashyizwe mu bwizigame bwawe: ${frw(context.amount)}\nNimero y'inguzanyo: ${context.reference}\nUbwizigame bwawe ubu ni: ${frw(context.balance)}${close}`,
      };

    case NOTIFICATION_EVENTS.RULE_CHANGED:
      return {
        title: "Itegeko ryavuguruwe",
        body: `Itegeko "${context.ruleTitle}" ryavuguruwe. ${context.reason ?? ""}`.trim(),
        emailSubject: `${associationName}: itegeko ryavuguruwe`,
        emailText: `${dear}\n\nIshyirahamwe ryavuguruye rimwe mu mategeko yaryo.\n\nItegeko: ${context.ruleTitle}\nImpamvu: ${context.reason ?? NOT_STATED}\n\nUshobora gusoma iri tegeko ryose n'amavugurura yarikozweho ku rupapuro rw'amategeko muri konti yawe.${close}`,
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_SUBMITTED:
      return {
        title: "Ubusabe bwo kubikuza bwakiriwe",
        body: `Ubusabe bwawe bwo kubikuza ${frw(context.amount)} bwakiriwe, burategereje kwemezwa.`,
        sms: `${associationName}: Ubusabe bwawe bwo kubikuza ${frw(context.amount)} bwakiriwe, burategereje kwemezwa. Nimero: ${context.reference}.`,
        emailSubject: "Ubusabe bwawe bwo kubikuza bwakiriwe",
        emailText: `${dear}\n\nTwakiriye ubusabe bwawe bwo kubikuza ${frw(context.amount)}. Burategereje kwemezwa n'ubuyobozi.\n\nNimero y'ubusabe: ${context.reference}\n\nTuzakumenyesha nibumara gusuzumwa.${close}`,
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_APPROVED:
      return {
        title: "Ubusabe bwo kubikuza bwemewe",
        body: `Ubusabe bwawe bwo kubikuza ${frw(context.amount)} bwemewe.`,
        sms: `${associationName}: Ubusabe bwawe bwo kubikuza ${frw(context.amount)} bwemewe. Amafaranga azakugeraho vuba. Nimero: ${context.reference}.`,
        emailSubject: "Ubusabe bwawe bwo kubikuza bwemewe",
        emailText: `${dear}\n\nUbusabe bwawe bwo kubikuza ${frw(context.amount)} bwemewe. Amafaranga azakugeraho mu gihe gito.\n\nNimero y'ubusabe: ${context.reference}${close}`,
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_REJECTED:
      return {
        title: "Ubusabe bwo kubikuza ntibwemewe",
        body: context.reason ?? "Ubusabe bwawe bwo kubikuza ntibwemewe.",
        sms: `${associationName}: Ubusabe bwawe bwo kubikuza (${context.reference}) ntibwemewe. Ku bindi bisobanuro, vugana n'ubuyobozi.`,
        emailSubject: "Ubusabe bwawe bwo kubikuza ntibwemewe",
        emailText: `${dear}\n\nTubabajwe no kukumenyesha ko ubusabe bwawe bwo kubikuza (${context.reference}) butemewe.\n\nImpamvu: ${context.reason ?? NOT_STATED}\n\nKu bindi bisobanuro, ${contact}.${close}`,
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_PAID:
      return {
        title: "Wahawe amafaranga wabikuje",
        body: `Wahawe amafaranga ${frw(context.amount)} wasabye kubikuza.`,
        sms: `${associationName}: Wahawe amafaranga ${frw(context.amount)} wasabye kubikuza. Nimero: ${context.reference}.`,
        emailSubject: "Wahawe amafaranga wabikuje",
        emailText: `${dear}\n\nWahawe amafaranga ${frw(context.amount)} wasabye kubikuza.\n\nNimero y'ubusabe: ${context.reference}\nUbwizigame bwawe ubu ni: ${frw(context.balance)}${close}`,
      };

    case NOTIFICATION_EVENTS.LOAN_SUBMITTED:
      return {
        title: "Ubusabe bw'inguzanyo bwakiriwe",
        body: `Ubusabe bwawe bw'inguzanyo ya ${frw(context.amount)} bwakiriwe, buri gusuzumwa.`,
        sms: `${associationName}: Ubusabe bwawe bw'inguzanyo ya ${frw(context.amount)} bwakiriwe, buri gusuzumwa. Nimero: ${context.reference}.`,
        emailSubject: "Ubusabe bwawe bw'inguzanyo bwakiriwe",
        emailText: `${dear}\n\nTwakiriye ubusabe bwawe bw'inguzanyo ya ${frw(context.amount)}.\n\nNimero y'ubusabe: ${context.reference}\n\nTuzakumenyesha nibumara gusuzumwa.${close}`,
      };

    case NOTIFICATION_EVENTS.LOAN_APPROVED:
      return {
        title: "Inguzanyo yawe yemewe",
        body: `Inguzanyo yawe ya ${frw(context.amount)} yemewe.`,
        sms: `${associationName}: Inguzanyo yawe ya ${frw(context.amount)} yemewe. Nimero: ${context.reference}.`,
        emailSubject: "Inguzanyo yawe yemewe",
        emailText: `${dear}\n\nTunejejwe no kukumenyesha ko ubusabe bwawe bw'inguzanyo bwemewe.\n\nNimero y'inguzanyo: ${context.reference}\nAmafaranga yemewe: ${frw(context.amount)}\n\nTuzakumenyesha igihe amafaranga azaba yakugezeho.${close}`,
      };

    case NOTIFICATION_EVENTS.LOAN_REJECTED:
      return {
        title: "Ubusabe bw'inguzanyo ntibwemewe",
        body: context.reason ?? "Ubusabe bwawe bw'inguzanyo ntibwemewe.",
        sms: `${associationName}: Ubusabe bwawe bw'inguzanyo (${context.reference}) ntibwemewe. Ku bindi bisobanuro, vugana n'ubuyobozi.`,
        emailSubject: "Ubusabe bwawe bw'inguzanyo ntibwemewe",
        emailText: `${dear}\n\nTubabajwe no kukumenyesha ko ubusabe bwawe bw'inguzanyo (${context.reference}) butemewe.\n\nImpamvu: ${context.reason ?? NOT_STATED}\n\nNiba wifuza kubiganiraho, ${contact}.${close}`,
      };

    case NOTIFICATION_EVENTS.LOAN_INFO_REQUESTED:
      return {
        title: "Hakenewe andi makuru",
        body: context.reason ?? "Hakenewe andi makuru ku busabe bwawe bw'inguzanyo.",
        sms: `${associationName}: Hakenewe andi makuru ku busabe bwawe bw'inguzanyo (${context.reference}). Injira muri konti yawe cyangwa uvugane n'ubuyobozi.`,
        emailSubject: "Hakenewe andi makuru ku busabe bwawe bw'inguzanyo",
        emailText: `${dear}\n\nKugira ngo ubusabe bwawe bw'inguzanyo (${context.reference}) bukomeze gusuzumwa, turakeneye andi makuru.\n\n${context.reason ?? ""}\n\nInjira muri konti yawe cyangwa ${contact}.${close}`,
      };

    case NOTIFICATION_EVENTS.LOAN_DISBURSED:
      return {
        title: "Inguzanyo yawe yatanzwe",
        body: `Inguzanyo yawe ya ${frw(context.amount)} yatanzwe. Uzatangira kwishyura ku wa ${date(context.dueDate)}.`,
        sms: `${associationName}: Inguzanyo yawe ya ${frw(context.amount)} yatanzwe. Uzatangira kwishyura ku wa ${date(context.dueDate)}. Nimero: ${context.reference}.`,
        emailSubject: "Inguzanyo yawe yatanzwe",
        emailText: `${dear}\n\nInguzanyo yawe ya ${frw(context.amount)} yatanzwe.\n\nNimero y'inguzanyo: ${context.reference}\nItariki yo kwishyura bwa mbere: ${date(context.dueDate)}\n\nGahunda yose yo kwishyura uyisanga muri konti yawe.${close}`,
      };

    case NOTIFICATION_EVENTS.LOAN_REPAYMENT_RECEIVED:
      return {
        title: "Twakiriye ubwishyu bw'inguzanyo",
        body: `Twakiriye ${frw(context.amount)} wishyuye ku nguzanyo. Usigaje kwishyura ${frw(context.balance)}.`,
        sms: `${associationName}: Twakiriye ${frw(context.amount)} wishyuye ku nguzanyo. Usigaje kwishyura ${frw(context.balance)}.`,
        emailSubject: "Twakiriye ubwishyu bw'inguzanyo yawe",
        emailText: `${dear}\n\nTwakiriye ${frw(context.amount)} wishyuye ku nguzanyo yawe.\n\nAmafaranga usigaje kwishyura: ${frw(context.balance)}${close}`,
      };

    case NOTIFICATION_EVENTS.LOAN_REPAYMENT_REMINDER:
      return {
        title: "Itariki yo kwishyura iregereje",
        body: `Ugomba kwishyura ${frw(context.amount)} ku nguzanyo bitarenze ku wa ${date(context.dueDate)}.`,
        sms: `${associationName}: Turakwibutsa kwishyura ${frw(context.amount)} ku nguzanyo bitarenze ku wa ${date(context.dueDate)}. Nimero y'ubwishyu: ${context.paymentReference}.`,
        emailSubject: `Kwibutsa: kwishyura inguzanyo bitarenze ku wa ${date(context.dueDate)}`,
        emailText: `${dear}\n\nTurakwibutsa ko ugomba kwishyura ${frw(context.amount)} ku nguzanyo yawe bitarenze ku wa ${date(context.dueDate)}.\n\nMu gihe wishyura, koresha nimero yawe y'ubwishyu ${context.paymentReference}.${close}`,
      };

    case NOTIFICATION_EVENTS.LOAN_OVERDUE:
      return {
        title: "Ubwishyu bw'inguzanyo bwatinze",
        body: `Ubwishyu bwawe bw'inguzanyo bwa ${frw(context.amount)} bwatinze iminsi ${context.daysOverdue}. Ishyura vuba kugira ngo wirinde ihazabu.`,
        sms: `${associationName}: Ubwishyu bw'inguzanyo bwa ${frw(context.amount)} bwatinze iminsi ${context.daysOverdue}. Ishyura vuba wirinde ihazabu. Nimero y'ubwishyu: ${context.paymentReference}.`,
        emailSubject: "Ubwishyu bw'inguzanyo yawe bwatinze",
        emailText: `${dear}\n\nUbwishyu bw'inguzanyo yawe bwa ${frw(context.amount)} bumaze iminsi ${context.daysOverdue} butinze.\n\nIgihe cyose butarishyurwa, ushobora gucibwa ihazabu. Mu gihe wishyura, koresha nimero yawe y'ubwishyu ${context.paymentReference}.\n\nNiba ufite imbogamizi mu kwishyura, ${contact}.${close}`,
      };

    case NOTIFICATION_EVENTS.LOAN_COMPLETED:
      return {
        title: "Warangije kwishyura inguzanyo",
        body: `Warangije kwishyura inguzanyo yawe yose (${context.reference}). Murakoze.`,
        sms: `${associationName}: Warangije kwishyura inguzanyo yawe yose (${context.reference}). Turagushimira kubahiriza gahunda yo kwishyura.`,
        emailSubject: "Warangije kwishyura inguzanyo yawe",
        emailText: `${dear}\n\nTukumenyesha ko warangije kwishyura inguzanyo yawe yose (${context.reference}).\n\nTuragushimira kubahiriza gahunda yo kwishyura.${close}`,
      };

    case NOTIFICATION_EVENTS.GUARANTEE_REQUESTED:
      return {
        title: "Wasabwe kuba umwishingizi w'inguzanyo",
        body: `${context.counterpartyName} yaguhisemo nk'umwishingizi w'inguzanyo ku mafaranga ${frw(context.amount)} (ubusabe ${context.reference}). Nubyemera, ayo mafaranga azafatirwa ku bwizigame bwawe kugeza inguzanyo yishyuwe yose. Emera cyangwa wange ku rupapuro rwa konti yawe.`,
        sms: `${associationName}: ${context.counterpartyName} agusaba kumwishingira ku mafaranga ${frw(context.amount)} (${context.reference}). Emera cyangwa wange muri konti yawe.`,
        emailSubject: `${context.counterpartyName} agusaba kumubera umwishingizi w'inguzanyo`,
        emailText: `${dear}

${context.counterpartyName} yasabye inguzanyo, kandi yaguhisemo nk'umwishingizi we.

Amafaranga usabwa kwishingira: ${frw(context.amount)}
Nimero y'ubusabe: ${context.reference}

Nubyemera, amafaranga ${frw(context.amount)} ku bwizigame bwawe azafatirwa. Ntuzashobora kuyabikuza cyangwa kuyakoresha nk'ingwate y'indi nguzanyo kugeza iyi nguzanyo yishyuwe yose. Nyuma yaho azarekurwa, wongere uyakoreshe. Nubyanga, nta mafaranga yawe azafatirwa.

Injira muri konti yawe, ufungure urupapuro rwa konti, maze wemere cyangwa wange.${close}`,
      };

    case NOTIFICATION_EVENTS.GUARANTEE_ACCEPTED:
      return {
        title: "Umwishingizi yemeye",
        body: `${context.counterpartyName} yemeye kwishingira ${frw(context.amount)} ku busabe bwawe bw'inguzanyo (${context.reference}).`,
        sms: `${associationName}: ${context.counterpartyName} yemeye kwishingira ${frw(context.amount)} ku nguzanyo yawe (${context.reference}).`,
        emailSubject: "Umwishingizi yemeye kukwishingira",
        emailText: `${dear}

${context.counterpartyName} yemeye kwishingira ${frw(context.amount)} ku busabe bwawe bw'inguzanyo (${context.reference}).${close}`,
      };

    case NOTIFICATION_EVENTS.GUARANTEE_DECLINED:
      return {
        title: "Umwishingizi yanze",
        body: `${context.counterpartyName} yanze kwishingira ${frw(context.amount)} ku busabe bwawe bw'inguzanyo (${context.reference}).${context.reason ? ` Impamvu: ${context.reason}` : ""}`,
        sms: `${associationName}: ${context.counterpartyName} yanze kwishingira ${frw(context.amount)} ku nguzanyo yawe (${context.reference}).`,
        emailSubject: "Umwishingizi yanze kukwishingira",
        emailText: `${dear}

${context.counterpartyName} yanze kwishingira ${frw(context.amount)} ku busabe bwawe bw'inguzanyo (${context.reference}).

Impamvu: ${context.reason ?? NOT_STATED}

Komite ishobora kwemeza gusa igice cy'inguzanyo gifite abishingizi. Niba wifuza gushaka undi mwishingizi, ${contact}.${close}`,
      };

    case NOTIFICATION_EVENTS.GUARANTEE_RELEASED:
      return {
        title: "Ubwishingizi bwawe bwarangiye",
        body: `Amafaranga ${frw(context.amount)} wari warishingiye ${context.counterpartyName} (${context.reference}) ntakifatiriwe. Ushobora kongera kuyakoresha.`,
        sms: `${associationName}: Amafaranga ${frw(context.amount)} wari warishingiye ${context.counterpartyName} yarekuwe. Ushobora kongera kuyakoresha.`,
        emailSubject: "Ubwishingizi bwawe bwarangiye",
        emailText: `${dear}

Amafaranga ${frw(context.amount)} wari warishingiye ${context.counterpartyName} (${context.reference}) ntakifatiriwe ku bwizigame bwawe.

Ushobora kongera kuyakoresha uko ubishaka.${close}`,
      };

    case NOTIFICATION_EVENTS.PASSWORD_CHANGED:
      return {
        title: "Ijambo ry'ibanga ryahinduwe",
        body: "Ijambo ry'ibanga rya konti yawe ryahinduwe. Niba atari wowe wabikoze, menyesha ubuyobozi bw'ishyirahamwe ako kanya.",
        emailSubject: "Ijambo ry'ibanga rya konti yawe ryahinduwe",
        emailText: `${dear}\n\nIjambo ry'ibanga rya konti yawe ya ${associationName} ryahinduwe.\n\nNiba atari wowe wabikoze, menyesha ubuyobozi bw'ishyirahamwe ako kanya, kuko konti yawe ishobora kuba yinjiwemo n'undi muntu.${close}`,
      };

    case NOTIFICATION_EVENTS.PASSWORD_RESET_REQUESTED:
      return {
        title: "Gusaba guhindura ijambo ry'ibanga",
        body: "Twakoherereje umurongo wo gushyiraho ijambo ry'ibanga rishya. Uzamara iminota 30 gusa.",
        emailSubject: "Shyiraho ijambo ry'ibanga rishya",
        emailText: `${dear}\n\nTwakiriye ubusabe bwo guhindura ijambo ry'ibanga rya konti yawe. Kanda ku murongo uri hasi kugira ngo ushyireho ijambo ry'ibanga rishya. Uyu murongo uzamara iminota 30 gusa.\n\n${context.actionUrl}\n\nNiba atari wowe wabisabye, wirengagize ubu butumwa. Ijambo ryawe ry'ibanga ntiryahindutse.${close}`,
      };

    case NOTIFICATION_EVENTS.PAYMENT_UNMATCHED:
      return {
        title: "Ubwishyu bukeneye gusuzumwa",
        body: `Twakiriye ubwishyu bwa ${frw(context.amount)}, ariko ntitwabashije kumenya umunyamuryango bwishyuriwe.`,
        emailSubject: "Ubwishyu butazwi nyirabwo bukeneye gusuzumwa",
        emailText: `${dear}\n\nTwakiriye ubwishyu bwa ${frw(context.amount)}, ariko ntitwabashije kumenya umunyamuryango bwishyuriwe.\n\nNimero y'igikorwa: ${context.reference}\n\nMusabwe kubusuzuma ku rutonde rw'ubwishyu butahujwe n'abanyamuryango.${close}`,
      };

    case NOTIFICATION_EVENTS.SAVINGS_BALANCE_UPDATED:
      return {
        title: "Ubwizigame bwawe bwahindutse",
        body: `Ubwizigame bwawe ubu ni ${frw(context.balance)}.`,
        emailSubject: "Ubwizigame bwawe bwahindutse",
        emailText: `${dear}\n\nUbwizigame bwawe ubu ni: ${frw(context.balance)}${close}`,
      };

    case NOTIFICATION_EVENTS.MEMBER_SUSPENDED:
      return {
        title: "Ubunyamuryango bwawe bwahagaritswe",
        body: context.reason ?? "Ubunyamuryango bwawe bwahagaritswe by'agateganyo.",
        emailSubject: "Ubunyamuryango bwawe bwahagaritswe by'agateganyo",
        emailText: `${dear}\n\nTukumenyesha ko ubunyamuryango bwawe bwahagaritswe by'agateganyo.\n\nImpamvu: ${context.reason ?? NOT_STATED}\n\nKu bindi bisobanuro, ${contact}.${close}`,
      };

    case NOTIFICATION_EVENTS.NEW_LOGIN:
      return {
        title: "Konti yawe yinjiwemo ku gikoresho gishya",
        body: "Konti yawe yinjiwemo hakoreshejwe igikoresho gishya (telefone cyangwa mudasobwa).",
        emailSubject: "Konti yawe yinjiwemo ku gikoresho gishya",
        emailText: `${dear}\n\nKonti yawe yinjiwemo hakoreshejwe igikoresho gishya (telefone cyangwa mudasobwa).\n\nNiba ari wowe, nta cyo ugomba gukora. Niba atari wowe, hindura ijambo ry'ibanga ako kanya.${close}`,
      };

    case NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT:
    default:
      return {
        title: "Ubutumwa bw'ishyirahamwe",
        body: context.reason ?? "",
        sms: context.reason?.slice(0, 155),
        emailSubject: `Ubutumwa buturutse kuri ${associationName}`,
        emailText: `${dear}\n\n${context.reason ?? ""}\n\n${associationName}`,
      };
  }
}
