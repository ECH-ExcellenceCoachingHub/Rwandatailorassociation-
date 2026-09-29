import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/i18n/dates";
import { NOTIFICATION_EVENTS, type NotificationEvent } from "@/lib/notifications/types";
import type { TemplateContext } from "@/lib/notifications/templates";

/**
 * The Kinyarwanda half of every message. Members receive both languages —
 * Kinyarwanda first — so this file mirrors templates.ts event for event, and
 * uses the same words as the dashboard's Kinyarwanda copy (ubuzigame,
 * ihazabu, inguzanyo, nimero y'ubwishyu) so a message and the screen it points
 * to read alike.
 *
 * The same SMS rule applies as in English: plain ASCII only, so a message is
 * never pushed into UCS-2 and billed at 70 characters a segment.
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

const date = (value?: Date): string => (value ? formatDate(value, "rw") : "");

const smsMoney = (amount?: string): string =>
  formatMoney(amount ?? "0").replace(/ /g, " ");

const NOT_STATED = "Ntiyatanzwe";

export function renderKinyarwanda(
  event: NotificationEvent,
  context: TemplateContext
): LocalisedCopy {
  const { firstName, associationName } = context;
  const dear = `Muraho ${firstName},`;

  switch (event) {
    case NOTIFICATION_EVENTS.MEMBER_REGISTERED:
      return {
        title: "Ubusabe bwakiriwe",
        body: `Ubusabe bwawe bwo kuba umunyamuryango bwakiriwe kandi burategereje kwemezwa. Nimero yawe y'ubwishyu ni ${context.paymentReference}.`,
        sms: `${associationName}: ubusabe bwawe bwakiriwe. Nimero yawe y'ubwishyu ni ${context.paymentReference}. Yibike neza, uyikoreshe kuri buri bwishyu.`,
        emailSubject: `Ubusabe bwawe bwo kuba umunyamuryango wa ${associationName}`,
        emailText: `${dear}\n\nTwakiriye ubusabe bwawe bwo kuba umunyamuryango.\n\nNimero yawe y'ubwishyu ni ${context.paymentReference}. Uyikoreshe kuri buri bwishyu wohereza ku ihuriro - ni yo ituma umusanzu wawe ushyirwa kuri konti yawe y'ubwizigame.\n\nUzamenyeshwa igihe umuyobozi amaze gusuzuma ubusabe bwawe.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.MEMBER_APPROVED:
      return {
        title: "Ubunyamuryango bwemejwe",
        body: `Murakaza neza muri ${associationName}. Konti yawe irakora, ushobora gutangira kuzigama.`,
        sms: `${associationName}: ubunyamuryango bwawe bwemejwe. Nimero y'ubwishyu ${context.paymentReference}. Uyikoreshe kuri buri bwishyu.`,
        emailSubject: `Murakaza neza muri ${associationName}`,
        emailText: `${dear}\n\nUbunyamuryango bwawe bwemejwe kandi konti yawe irakora.\n\nNimero yawe y'ubwishyu ni ${context.paymentReference}. Uyikoreshe kuri buri musanzu.\n\nUbu ushobora kwinjira ukareba ubuzigame bwawe, ugasaba inguzanyo kandi ukabona inyandiko za konti yawe.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.MEMBER_REJECTED:
      return {
        title: "Ubusabe bwo kuba umunyamuryango ntibwemewe",
        body: context.reason ?? "Ubusabe bwawe bwo kuba umunyamuryango ntibwemewe.",
        emailSubject: `Ubusabe bwawe bwo kuba umunyamuryango wa ${associationName}`,
        emailText: `${dear}\n\nUbusabe bwawe bwo kuba umunyamuryango ntibwemewe.\n\nImpamvu: ${context.reason ?? NOT_STATED}\n\nNiba wifuza kubiganiraho, vugana n'ihuriro.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.PAYMENT_RECEIVED:
      return {
        title: "Ubwishyu bwakiriwe",
        body: `Twakiriye ${formatMoney(context.amount)}. Ubuzigame bwawe ubu ni ${formatMoney(context.balance)}.`,
        sms: `${associationName}: twakiriye ${smsMoney(context.amount)}. Ubuzigame ubu ${smsMoney(context.balance)}. Ref ${context.reference}.`,
        emailSubject: `Ubwishyu bwakiriwe - ${formatMoney(context.amount)}`,
        emailText: `${dear}\n\nTwakiriye umusanzu wawe wa ${formatMoney(context.amount)}.\n\nNimero y'igikorwa: ${context.reference}\nUbuzigame bwawe ubu ni ${formatMoney(context.balance)}.\n\nMurakoze.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.CONTRIBUTION_DUE_WARNING:
      return {
        title:
          context.daysUntilFine === 0
            ? "Kuzigama kwawe kugomba kwishyurwa uyu munsi"
            : `Ufite iminsi ${context.daysBehind} utazigamye`,
        body: `Ufite iminsi ${context.daysBehind} utazigamye. Ishyura ${formatMoney(context.clearingAmount)} ${
          context.daysUntilFine === 0
            ? "uyu munsi"
            : `mu minsi ${context.daysUntilFine}`
        } kugira ngo wirinde ihazabu ya ${formatMoney(context.fineAmount)}.`,
        sms: `${associationName}: ufite iminsi ${context.daysBehind} utazigamye. Ishyura ${smsMoney(context.clearingAmount)} mu minsi ${context.daysUntilFine} wirinde ihazabu ya ${smsMoney(context.fineAmount)}. Ref ${context.paymentReference}.`,
        emailSubject: `Bisaba igikorwa: ufite iminsi ${context.daysBehind} utazigamye`,
        emailText: `${dear}\n\nUfite iminsi ${context.daysBehind} utazigamye ku kuzigama kwa buri munsi.\n\nKugira ngo ube uri ku gihe, ishyura ${formatMoney(context.clearingAmount)} ukoresheje nimero yawe y'ubwishyu ${context.paymentReference}.\n\nNiba mu minsi ${context.daysUntilFine} ukiri inyuma, ihazabu ya ${formatMoney(context.fineAmount)} izongerwaho mu buryo bwikora. Kwishyura mbere y'icyo gihe birayikurinda burundu.\n\nNiba udashobora kwishyura ubu, vugana n'ihuriro - mushobora kumvikana ku kiruhuko aho guhabwa ihazabu.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.CONTRIBUTION_FINE_CHARGED:
      return {
        title: "Wahawe ihazabu",
        body: `Wari ufite iminsi ${context.daysBehind} utazigamye, bityo wahawe ihazabu ya ${formatMoney(context.amount)}. Ishyura ${formatMoney(context.clearingAmount)} kugira ngo urangize byose.`,
        sms: `${associationName}: ihazabu ya ${smsMoney(context.amount)} nyuma y'iminsi ${context.daysBehind} utazigamye. Ayo kwishyura yose ${smsMoney(context.clearingAmount)}. Ref ${context.paymentReference}.`,
        emailSubject: `Wahawe ihazabu ya ${formatMoney(context.amount)}`,
        emailText: `${dear}\n\nWamaze iminsi ${context.daysBehind} utazigamye ku kuzigama kwa buri munsi, kandi hakurikijwe amabwiriza y'ihuriro, ihazabu ya ${formatMoney(context.finePerShare)} kuri buri mugabane ufite irakureba.\n\nIhazabu: ${formatMoney(context.amount)} (imigabane ${context.fineShares} x ${formatMoney(context.finePerShare)})\nNimero: ${context.reference}\n\nKugira ngo wishyure ibirarane n'iyi hazabu icyarimwe, ishyura ${formatMoney(context.clearingAmount)} ukoresheje ${context.paymentReference}.\n\nUshobora gusoma itegeko ryakurikijwe n'uko uhagaze byose ku rupapuro rw'amabwiriza kuri konti yawe. Niba ubona ko ari amakosa, cyangwa ukeneye ikiruhuko cyo kwishyura, vugana n'ihuriro - umuyobozi ashobora gukuraho ihazabu yanditse impamvu.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.CONTRIBUTION_BACK_ON_TRACK:
      return {
        title: "Uri ku gihe",
        body: `Kuzigama kwawe kwa buri munsi kuri ku gihe. Ubuzigame bwawe ni ${formatMoney(context.balance)}.`,
        emailSubject: "Kuzigama kwawe kuri ku gihe",
        emailText: `${dear}\n\nKuzigama kwawe kwa buri munsi kuri ku gihe - nta kirarane kandi nta hazabu ikureba.\n\nUbuzigame bwawe ni ${formatMoney(context.balance)}.\n\nMurakoze.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.INTEREST_SHARE_CREDITED:
      return {
        title: "Igice cyawe cy'inyungu y'inguzanyo",
        body: `${formatMoney(context.amount)} by'inyungu wishyuye byasubijwe mu buzigame bwawe. Ubuzigame bwawe ubu ni ${formatMoney(context.balance)}.`,
        emailSubject: `${formatMoney(context.amount)} by'inyungu byashyizwe mu buzigame bwawe`,
        emailText: `${dear}\n\nHakurikijwe itegeko ry'ihuriro ryo kugabana inyungu, kimwe cya kabiri cy'inyungu wishyura ku nguzanyo kigusubira.\n\nByashyizwe mu buzigame bwawe: ${formatMoney(context.amount)}\nNimero y'inguzanyo: ${context.reference}\nUbuzigame bwawe ubu ni ${formatMoney(context.balance)}.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.RULE_CHANGED:
      return {
        title: "Itegeko ryahinduwe",
        body: `${context.ruleTitle} ryahinduwe. ${context.reason ?? ""}`.trim(),
        emailSubject: `${associationName}: itegeko ryahinduwe`,
        emailText: `${dear}\n\nIhuriro ryahinduye rimwe mu mategeko yaryo.\n\nItegeko: ${context.ruleTitle}\nImpamvu yatanzwe: ${context.reason ?? NOT_STATED}\n\nUshobora gusoma itegeko ryose n'amateka yaryo ku rupapuro rw'amabwiriza kuri konti yawe.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_SUBMITTED:
      return {
        title: "Ubusabe bwo kubikuza bwoherejwe",
        body: `Ubusabe bwawe bwo kubikuza ${formatMoney(context.amount)} bwoherejwe kugira ngo bwemezwe.`,
        sms: `${associationName}: ubusabe bwo kubikuza ${smsMoney(context.amount)} bwoherejwe. Ref ${context.reference}.`,
        emailSubject: "Ubusabe bwo kubikuza bwakiriwe",
        emailText: `${dear}\n\nUbusabe bwawe bwo kubikuza ${formatMoney(context.amount)} bwakiriwe kandi burategereje kwemezwa.\n\nNimero: ${context.reference}\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_APPROVED:
      return {
        title: "Kubikuza byemejwe",
        body: `Kubikuza ${formatMoney(context.amount)} byemejwe.`,
        sms: `${associationName}: kubikuza ${smsMoney(context.amount)} byemejwe. Ref ${context.reference}.`,
        emailSubject: "Kubikuza byemejwe",
        emailText: `${dear}\n\nKubikuza ${formatMoney(context.amount)} byemejwe kandi uzahabwa amafaranga vuba.\n\nNimero: ${context.reference}\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_REJECTED:
      return {
        title: "Kubikuza ntibyemewe",
        body: context.reason ?? "Ubusabe bwawe bwo kubikuza ntibwemewe.",
        sms: `${associationName}: ubusabe bwo kubikuza ${context.reference} ntibwemewe. Vugana n'ibiro.`,
        emailSubject: "Ubusabe bwo kubikuza ntibwemewe",
        emailText: `${dear}\n\nUbusabe bwawe bwo kubikuza (${context.reference}) ntibwemewe.\n\nImpamvu: ${context.reason ?? NOT_STATED}\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.WITHDRAWAL_PAID:
      return {
        title: "Wahawe amafaranga wabikuje",
        body: `Wahawe ${formatMoney(context.amount)}.`,
        sms: `${associationName}: wahawe ${smsMoney(context.amount)}. Ref ${context.reference}.`,
        emailSubject: "Wahawe amafaranga wabikuje",
        emailText: `${dear}\n\nWahawe ${formatMoney(context.amount)}.\n\nNimero: ${context.reference}\nUbuzigame bwawe ubu ni ${formatMoney(context.balance)}.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.LOAN_SUBMITTED:
      return {
        title: "Ubusabe bw'inguzanyo bwoherejwe",
        body: `Ubusabe bwawe bw'inguzanyo ya ${formatMoney(context.amount)} bwoherejwe kugira ngo busuzumwe.`,
        sms: `${associationName}: ubusabe bw'inguzanyo ${context.reference} bwa ${smsMoney(context.amount)} bwoherejwe.`,
        emailSubject: "Ubusabe bw'inguzanyo bwakiriwe",
        emailText: `${dear}\n\nUbusabe bwawe bw'inguzanyo ya ${formatMoney(context.amount)} bwakiriwe.\n\nNimero: ${context.reference}\n\nUzamenyeshwa igihe bumaze gusuzumwa.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.LOAN_APPROVED:
      return {
        title: "Inguzanyo yemejwe",
        body: `Inguzanyo yawe ya ${formatMoney(context.amount)} yemejwe.`,
        sms: `${associationName}: inguzanyo ${context.reference} ya ${smsMoney(context.amount)} yemejwe.`,
        emailSubject: "Inguzanyo yawe yemejwe",
        emailText: `${dear}\n\nUbusabe bwawe bw'inguzanyo bwemejwe.\n\nNimero: ${context.reference}\nAmafaranga yemejwe: ${formatMoney(context.amount)}\n\nUzamenyeshwa igihe amafaranga amaze gutangwa.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.LOAN_REJECTED:
      return {
        title: "Ubusabe bw'inguzanyo ntibwemewe",
        body: context.reason ?? "Ubusabe bwawe bw'inguzanyo ntibwemewe.",
        sms: `${associationName}: ubusabe bw'inguzanyo ${context.reference} ntibwemewe. Vugana n'ibiro.`,
        emailSubject: "Ubusabe bw'inguzanyo ntibwemewe",
        emailText: `${dear}\n\nUbusabe bwawe bw'inguzanyo (${context.reference}) ntibwemewe.\n\nImpamvu: ${context.reason ?? NOT_STATED}\n\nMurisanga kubiganiraho n'ihuriro.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.LOAN_INFO_REQUESTED:
      return {
        title: "Hakenewe andi makuru",
        body: context.reason ?? "Ihuriro rikeneye andi makuru ku busabe bwawe bw'inguzanyo.",
        sms: `${associationName}: hakenewe andi makuru ku nguzanyo ${context.reference}. Injira cyangwa uvugane n'ibiro.`,
        emailSubject: "Hakenewe andi makuru ku busabe bwawe bw'inguzanyo",
        emailText: `${dear}\n\nDukeneye andi makuru mbere yo gukomeza ubusabe bwawe bw'inguzanyo (${context.reference}).\n\n${context.reason ?? ""}\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.LOAN_DISBURSED:
      return {
        title: "Inguzanyo yatanzwe",
        body: `${formatMoney(context.amount)} byatanzwe. Kwishyura bwa mbere ni ku wa ${date(context.dueDate)}.`,
        sms: `${associationName}: inguzanyo ${context.reference} yatanzwe, ${smsMoney(context.amount)}. Kwishyura bwa mbere ${date(context.dueDate)}.`,
        emailSubject: "Inguzanyo yawe yatanzwe",
        emailText: `${dear}\n\n${formatMoney(context.amount)} byatanzwe ku nguzanyo ${context.reference}.\n\nKwishyura bwa mbere ni ku wa ${date(context.dueDate)}. Gahunda yose yo kwishyura uyibona iyo winjiye.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.LOAN_REPAYMENT_RECEIVED:
      return {
        title: "Ubwishyu bw'inguzanyo bwakiriwe",
        body: `Ubwishyu bwawe bwa ${formatMoney(context.amount)} bwakiriwe. Ayo usigaje kwishyura: ${formatMoney(context.balance)}.`,
        sms: `${associationName}: ubwishyu bwa ${smsMoney(context.amount)} bwakiriwe. Usigaje ${smsMoney(context.balance)}.`,
        emailSubject: "Ubwishyu bw'inguzanyo bwakiriwe",
        emailText: `${dear}\n\nTwakiriye ubwishyu bwawe bwa ${formatMoney(context.amount)}.\n\nAyo usigaje kwishyura: ${formatMoney(context.balance)}\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.LOAN_REPAYMENT_REMINDER:
      return {
        title: "Igihe cyo kwishyura kiregereje",
        body: `Ubwishyu bwawe bwa ${formatMoney(context.amount)} bugomba kwishyurwa ku wa ${date(context.dueDate)}.`,
        sms: `${associationName}: kwibutsa, ${smsMoney(context.amount)} bigomba kwishyurwa ku wa ${date(context.dueDate)}. Ref ${context.paymentReference}.`,
        emailSubject: `Kwishyura ku wa ${date(context.dueDate)}`,
        emailText: `${dear}\n\nTukwibutsa ko ubwishyu bw'inguzanyo bwa ${formatMoney(context.amount)} bugomba kwishyurwa ku wa ${date(context.dueDate)}.\n\nUkoreshe nimero yawe y'ubwishyu ${context.paymentReference} wishyura.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.LOAN_OVERDUE:
      return {
        title: "Kwishyura byararengeje igihe",
        body: `Ubwishyu bwawe bwa ${formatMoney(context.amount)} bumaze iminsi ${context.daysOverdue} burengeje igihe. Hashobora kwiyongeraho ihazabu.`,
        sms: `${associationName}: ${smsMoney(context.amount)} bimaze iminsi ${context.daysOverdue} birengeje igihe. Ishyura wirinde ihazabu. Ref ${context.paymentReference}.`,
        emailSubject: "Ubwishyu bw'inguzanyo yawe bwararengeje igihe",
        emailText: `${dear}\n\nUbwishyu bw'inguzanyo yawe bwa ${formatMoney(context.amount)} bumaze iminsi ${context.daysOverdue} burengeje igihe.\n\nIhazabu ishobora kwiyongeraho kugeza bwishyuwe. Ukoreshe nimero y'ubwishyu ${context.paymentReference} wishyura.\n\nNiba ufite ingorane, vugana n'ihuriro.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.LOAN_COMPLETED:
      return {
        title: "Inguzanyo yishyuwe yose",
        body: `Inguzanyo ${context.reference} yishyuwe yose. Murakoze.`,
        sms: `${associationName}: inguzanyo ${context.reference} yishyuwe yose. Murakoze.`,
        emailSubject: "Inguzanyo yawe yishyuwe yose",
        emailText: `${dear}\n\nInguzanyo ${context.reference} yishyuwe yose.\n\nMurakoze kubahiriza gahunda yo kwishyura.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.GUARANTEE_REQUESTED:
      return {
        title: "Wasabwe kwishingira inguzanyo",
        body: `${context.counterpartyName} yagushyize nk'umwishingizi wa ${formatMoney(context.amount)} ku busabe bw'inguzanyo ${context.reference}. Nubyemera, ayo mafaranga azafatirwa ku buzigame bwawe kugeza inguzanyo yishyuwe. Emera cyangwa wange ku rupapuro rwa konti yawe.`,
        sms: `${associationName}: ${context.counterpartyName} agusaba kwishingira ${smsMoney(context.amount)} (${context.reference}). Emera cyangwa wange ku rupapuro rwa konti yawe.`,
        emailSubject: `${context.counterpartyName} agusaba kwishingira inguzanyo`,
        emailText: `${dear}

${context.counterpartyName} yasabye inguzanyo kandi yagushyize nk'umwishingizi.

Amafaranga usabwa kwishingira: ${formatMoney(context.amount)}
Nimero y'ubusabe: ${context.reference}

Nubyemera, ${formatMoney(context.amount)} ku buzigame bwawe bizafatirwa, ntibizashobora kubikuzwa cyangwa gukoreshwa nk'ingwate kugeza inguzanyo yishyuwe yose. Nyuma bizagusubizwa. Nubyanga, nta kizafatirwa.

Injira ufungure urupapuro rwa konti yawe kugira ngo wemere cyangwa wange.

${associationName}`,
      };

    case NOTIFICATION_EVENTS.GUARANTEE_ACCEPTED:
      return {
        title: "Umwishingizi yabyemeye",
        body: `${context.counterpartyName} yemeye kwishingira ${formatMoney(context.amount)} by'ubusabe bwawe bw'inguzanyo ${context.reference}.`,
        sms: `${associationName}: ${context.counterpartyName} yemeye kwishingira ${smsMoney(context.amount)} bya ${context.reference}.`,
        emailSubject: "Umwishingizi yabyemeye",
        emailText: `${dear}

${context.counterpartyName} yemeye kwishingira ${formatMoney(context.amount)} by'ubusabe bwawe bw'inguzanyo ${context.reference}.

${associationName}`,
      };

    case NOTIFICATION_EVENTS.GUARANTEE_DECLINED:
      return {
        title: "Umwishingizi yabyanze",
        body: `${context.counterpartyName} yanze kwishingira ${formatMoney(context.amount)} by'ubusabe bwawe bw'inguzanyo ${context.reference}.${context.reason ? ` Impamvu: ${context.reason}` : ""}`,
        sms: `${associationName}: ${context.counterpartyName} yanze kwishingira ${smsMoney(context.amount)} bya ${context.reference}.`,
        emailSubject: "Umwishingizi yabyanze",
        emailText: `${dear}

${context.counterpartyName} yanze kwishingira ${formatMoney(context.amount)} by'ubusabe bwawe bw'inguzanyo ${context.reference}.

Impamvu: ${context.reason ?? NOT_STATED}

Komite ishobora kwemeza gusa igice cy'inguzanyo cyishingiwe. Vugana n'ihuriro niba ushaka gushyiraho undi.

${associationName}`,
      };

    case NOTIFICATION_EVENTS.GUARANTEE_RELEASED:
      return {
        title: "Ubwishingizi bwawe bwarangiye",
        body: `${formatMoney(context.amount)} wishingiye ${context.counterpartyName} (${context.reference}) ntibigifatiwe. Wongeye kubibona.`,
        sms: `${associationName}: ${smsMoney(context.amount)} wishingiye ${context.counterpartyName} byarekuwe, wongeye kubibona.`,
        emailSubject: "Ubwishingizi bwawe bwarangiye",
        emailText: `${dear}

${formatMoney(context.amount)} wishingiye nk'umwishingizi wa ${context.counterpartyName} (${context.reference}) ntibigifatiwe.

Byongeye kuba mu mafaranga ushobora gukoresha.

${associationName}`,
      };

    case NOTIFICATION_EVENTS.PASSWORD_CHANGED:
      return {
        title: "Ijambo ry'ibanga ryahinduwe",
        body: "Ijambo ryawe ry'ibanga ryahinduwe. Niba atari wowe, vugana n'ihuriro ako kanya.",
        emailSubject: "Ijambo ryawe ry'ibanga ryahinduwe",
        emailText: `${dear}\n\nIjambo ry'ibanga rya konti yawe ya ${associationName} ryahinduwe.\n\nNiba atari wowe wabikoze, vugana n'ihuriro ako kanya - konti yawe ishobora kuba yinjiriwe.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.PASSWORD_RESET_REQUESTED:
      return {
        title: "Gusaba guhindura ijambo ry'ibanga",
        body: "Twakoherereje umurongo wo guhindura ijambo ry'ibanga. Uzarangira mu minota 30.",
        emailSubject: "Hindura ijambo ryawe ry'ibanga",
        emailText: `${dear}\n\nKoresha umurongo uri hepfo ushyireho ijambo ry'ibanga rishya. Uzarangira mu minota 30.\n\n${context.actionUrl}\n\nNiba atari wowe wabisabye, ntugire icyo ukora - ijambo ryawe ry'ibanga ntiryahindutse.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.PAYMENT_UNMATCHED:
      return {
        title: "Ubwishyu bukeneye kwitabwaho",
        body: `Ubwishyu bwa ${formatMoney(context.amount)} ntibwabashije guhuzwa n'umunyamuryango.`,
        emailSubject: "Ubwishyu butahujwe bukeneye gusuzumwa",
        emailText: `Ubwishyu bwa ${formatMoney(context.amount)} bwakiriwe ariko ntibwabashije guhuzwa n'umunyamuryango.\n\nNimero: ${context.reference}\n\nMubusuzume ku rutonde rw'ubwishyu butahujwe.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.SAVINGS_BALANCE_UPDATED:
      return {
        title: "Ubuzigame bwahindutse",
        body: `Ubuzigame bwawe ubu ni ${formatMoney(context.balance)}.`,
        emailSubject: "Ubuzigame bwahindutse",
        emailText: `${dear}\n\nUbuzigame bwawe ubu ni ${formatMoney(context.balance)}.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.MEMBER_SUSPENDED:
      return {
        title: "Konti yahagaritswe",
        body: context.reason ?? "Ubunyamuryango bwawe bwahagaritswe.",
        emailSubject: "Ubunyamuryango bwawe bwahagaritswe",
        emailText: `${dear}\n\nUbunyamuryango bwawe bwahagaritswe.\n\nImpamvu: ${context.reason ?? NOT_STATED}\n\nVugana n'ihuriro.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.NEW_LOGIN:
      return {
        title: "Kwinjira gushya",
        body: "Hari uwinjiye kuri konti yawe akoresheje igikoresho gishya.",
        emailSubject: "Kwinjira gushya kuri konti yawe",
        emailText: `${dear}\n\nHari uwinjiye kuri konti yawe akoresheje igikoresho gishya.\n\nNiba atari wowe, hindura ijambo ry'ibanga ako kanya.\n\n${associationName}`,
      };

    case NOTIFICATION_EVENTS.ADMIN_ANNOUNCEMENT:
    default:
      return {
        title: "Ubutumwa buvuye ku ihuriro",
        body: context.reason ?? "",
        sms: context.reason?.slice(0, 155),
        emailSubject: `Ubutumwa buvuye kuri ${associationName}`,
        emailText: `${dear}\n\n${context.reason ?? ""}\n\n${associationName}`,
      };
  }
}
