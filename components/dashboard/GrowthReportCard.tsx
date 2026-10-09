"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  HandCoins,
  MapPinned,
  Scissors,
  TrendingDown,
  TrendingUp,
  Users,
} from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { fill } from "@/lib/i18n/fill";
import { formatLongDate } from "@/lib/i18n/dates";
import { formatMoney, isNegative, subtract } from "@/lib/money";
import { provinceShortLabel } from "@/lib/rwanda";
import type { GrowthReport } from "@/lib/services/growth-report";

/**
 * The growth summary card: the report the association shares after a meeting.
 *
 * A fixed 960px sheet rather than a responsive panel — it is a picture as much
 * as a page, sized for a slide, a WhatsApp forward or a printed handout, and
 * the "download image" button beside the district report's PDF captures this
 * very node. Every figure comes from the ledger through the growth report
 * service; nothing here is typed by hand.
 *
 * Colours are written as hex rather than theme tokens on purpose: the PNG is
 * rendered by re-serialising computed styles, and literal hex values survive
 * that round trip unchanged.
 */

/** The DOM node the download button captures. */
export const GROWTH_REPORT_NODE_ID = "growth-report-card";

const NAVY_FROM = "#0b1b33";
const NAVY_TO = "#14406e";
const GREEN = "#5aa73a";
const GREEN_DARK = "#3f8a26";
const GREEN_LIGHT = "#8fd14f";
const GREEN_PALE = "#f4f8ef";
const RED = "#d9483b";
const RED_DARK = "#b33127";

const RANK_COLOURS = ["#e6b84f", "#b9c2cc", "#c98a5a"];

export function GrowthReportCard({ report }: { report: GrowthReport }) {
  const { locale, d } = useLanguage();
  const copy = d.admin.reports.growth;

  const savings = report.totals.savings;
  const previousSavings = report.previousSavings;
  const uplift = subtract(savings, previousSavings);
  // A day with no movement at all is not a fall — the arrow only points down
  // for money that actually went backwards.
  const upliftPositive = !isNegative(uplift);
  const UpliftArrow = upliftPositive ? ArrowUpRight : ArrowDownRight;
  const UpliftTrend = upliftPositive ? TrendingUp : TrendingDown;

  const asOf = formatLongDate(report.asOf, locale);
  // The ledger window opens at midnight today, so the balance it derives is
  // yesterday's — that is the date the sentence names.
  const comparedFrom = new Date(report.since);
  comparedFrom.setDate(comparedFrom.getDate() - 1);
  const since = formatLongDate(comparedFrom, locale);
  const associationName = report.association?.name ?? d.admin.reports.districtAllAssociations;

  return (
    <div
      id={GROWTH_REPORT_NODE_ID}
      className="w-[960px] shrink-0 overflow-hidden rounded-3xl bg-white shadow-card"
    >
      <div className="h-2" style={{ backgroundColor: GREEN }} />

      <header className="flex items-center gap-6 px-9 pb-6 pt-7">
        {/* eslint-disable-next-line @next/next/no-img-element -- the export captures the resolved src, not the optimiser's set */}
        <img
          src="/images/rtalogo.jpg"
          alt=""
          width={80}
          height={80}
          className="size-20 shrink-0 rounded-full object-cover ring-1 ring-black/5"
        />
        <div>
          <p className="font-heading text-[30px] font-extrabold uppercase leading-[1.05] tracking-tight text-[#0b1b33]">
            {associationName}
          </p>
          <p className="mt-2.5 font-heading text-[12px] font-bold uppercase tracking-[0.22em] text-[#1f4a88]">
            {copy.taglineLead}{" "}
            <span className="text-[#4f9c2f]">{copy.taglineTail}</span>
          </p>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/hero-workshop.jpg"
          alt=""
          width={210}
          height={92}
          className="ml-auto h-[92px] w-[210px] shrink-0 rounded-2xl object-cover ring-1 ring-black/5"
        />
      </header>

      <div
        className="flex items-center gap-3 px-9 py-3.5"
        style={{ backgroundImage: `linear-gradient(90deg, ${NAVY_FROM}, ${NAVY_TO})` }}
      >
        <span className="h-6 w-1.5 rounded-full" style={{ backgroundColor: GREEN_LIGHT }} />
        <h3 className="font-heading text-[21px] font-extrabold text-white">{copy.title}</h3>
      </div>

      <div className="px-9 py-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-[#8a94a3]">
          {copy.introLabel}
        </p>
        <p className="mt-1 text-[13px] leading-relaxed text-[#5b6472]">
          {fill(copy.intro, { date: asOf, since })}
        </p>
      </div>

      <div className="flex gap-4 px-9">
        <div className="flex flex-1 gap-3">
          <StatTile
            icon={Users}
            iconColor="#1f4a88"
            iconBg="#eef3fa"
            value={String(report.totals.members)}
            label={copy.statMembers}
          />
          <StatTile
            icon={MapPinned}
            iconColor="#3f8a26"
            iconBg="#eaf5e2"
            value={String(report.totals.districts)}
            label={copy.statDistricts}
          />
          <StatTile
            icon={HandCoins}
            iconColor="#b8860b"
            iconBg="#fdf4e0"
            value={formatMoney(savings)}
            label={copy.statSavings}
          />
        </div>

        <div className="flex w-[300px] shrink-0 flex-col gap-3">
          <div
            className="flex items-center gap-3 rounded-xl p-3 text-white"
            style={{ backgroundImage: `linear-gradient(90deg, ${GREEN}, ${GREEN_DARK})` }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white">
              <UpliftTrend className="size-4" style={{ color: GREEN_DARK }} aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <p className="font-heading text-[15px] font-bold">
                {fill(copy.membersPaid, { count: report.totals.savers })}
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-white/80">
                {fill(copy.membersUnpaidHint, {
                  districts: report.totals.districts,
                  unpaid: report.totals.nonSavers,
                })}
              </p>
            </div>
          </div>

          <div
            className="flex items-center gap-3 rounded-xl p-3 text-white"
            style={{ backgroundImage: `linear-gradient(90deg, ${GREEN}, ${GREEN_DARK})` }}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white">
              <HandCoins className="size-4" style={{ color: GREEN_DARK }} aria-hidden="true" />
            </span>
            <div className="leading-tight">
              <p className="text-[11px] uppercase tracking-wide text-white/80">
                {copy.savingsTotal}
              </p>
              <p className="mt-0.5 font-heading text-[15px] font-bold tabular-nums">
                {formatMoney(savings)}
              </p>
            </div>
          </div>

          <div
            className="rounded-xl p-3.5 text-white"
            style={{ backgroundImage: `linear-gradient(90deg, ${RED}, ${RED_DARK})` }}
          >
            <p className="font-heading text-[13px] font-bold uppercase tracking-wide">
              {copy.upliftTitle}
            </p>
            <p className="mt-0.5 text-[11px] tabular-nums text-white/85">
              {fill(copy.upliftRange, {
                previous: formatMoney(previousSavings),
                current: formatMoney(savings),
              })}
            </p>
            <div className="mt-1.5 flex items-center gap-1.5">
              <UpliftArrow className="size-6 shrink-0" aria-hidden="true" />
              <span className="font-heading text-[22px] font-extrabold tabular-nums">
                {formatMoney(uplift, { signed: true })}
              </span>
            </div>
            <p className="mt-1 text-[10.5px] leading-snug text-white/85">
              {fill(copy.upliftNote, {
                previous: formatMoney(previousSavings),
                current: formatMoney(savings),
              })}
            </p>
          </div>
        </div>
      </div>

      <div className="mx-9 mt-5 overflow-hidden rounded-xl border border-[#e5e7eb]">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr
              className="text-[11px] uppercase tracking-wide text-white"
              style={{ backgroundImage: `linear-gradient(90deg, ${NAVY_FROM}, ${NAVY_TO})` }}
            >
              <th className="w-12 px-3 py-2.5 align-bottom font-heading font-semibold">
                {copy.colNumber}
              </th>
              <th className="px-3 py-2.5 align-bottom font-heading font-semibold">
                {copy.colDistrict}
              </th>
              <th className="px-3 py-2.5 align-bottom font-heading font-semibold">
                {copy.colProvince}
              </th>
              <th className="px-3 py-2.5 text-right align-bottom font-heading font-semibold leading-snug">
                {copy.colMembersPaid}
              </th>
              <th className="px-3 py-2.5 text-right align-bottom font-heading font-semibold leading-snug">
                {copy.colMembersUnpaid}
              </th>
              <th className="px-3 py-2.5 text-right align-bottom font-heading font-semibold">
                {copy.colSavings}
              </th>
            </tr>
          </thead>
          <tbody className="text-[13px]">
            {report.rows.map((row, index) => (
              <tr
                key={row.district ?? "none"}
                style={{ backgroundColor: index % 2 === 1 ? GREEN_PALE : "#ffffff" }}
              >
                <td className="px-3 py-2">
                  {index < RANK_COLOURS.length ? (
                    <span
                      className="flex size-6 items-center justify-center rounded-full font-heading text-[12px] font-bold text-white"
                      style={{ backgroundColor: RANK_COLOURS[index] }}
                    >
                      {index + 1}
                    </span>
                  ) : (
                    <span className="pl-1.5 font-medium tabular-nums text-[#9aa3af]">
                      {index + 1}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 font-semibold text-[#0b1b33]">
                  {row.district ?? <span className="text-[#9aa3af]">—</span>}
                </td>
                <td className="px-3 py-2 text-[#5b6472]">
                  {row.district ? provinceShortLabel(row.province, locale) || "—" : "—"}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#0b1b33]">
                  {row.savers}
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-[#8a94a3]">
                  {row.nonSavers}
                </td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums text-[#0b1b33]">
                  {formatMoney(row.savings)}
                </td>
              </tr>
            ))}
            <tr
              className="font-heading text-[13px] font-bold text-[#0b1b33]"
              style={{ backgroundColor: "#eef3fa" }}
            >
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5">{d.common.total}</td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5 text-right tabular-nums">
                {report.totals.savers}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-[#8a94a3]">
                {report.totals.nonSavers}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {formatMoney(report.totals.savings)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <footer
        className="relative mt-6 overflow-hidden px-9 py-6"
        style={{ backgroundImage: `linear-gradient(90deg, ${NAVY_TO}, ${NAVY_FROM})` }}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 960 80"
          preserveAspectRatio="none"
          className="absolute inset-x-0 bottom-0 h-20 w-full"
        >
          <g fill="#061224" opacity="0.55">
            <rect x="0" y="52" width="54" height="28" />
            <rect x="60" y="38" width="40" height="42" />
            <rect x="106" y="46" width="34" height="34" />
            <rect x="146" y="26" width="46" height="54" />
            <rect x="198" y="44" width="36" height="36" />
            <rect x="240" y="18" width="52" height="62" />
            <rect x="298" y="40" width="38" height="40" />
            <rect x="342" y="30" width="44" height="50" />
            <rect x="392" y="48" width="34" height="32" />
            <rect x="432" y="22" width="50" height="58" />
            <rect x="488" y="42" width="36" height="38" />
            <rect x="530" y="34" width="46" height="46" />
            <rect x="582" y="50" width="32" height="30" />
            <rect x="620" y="28" width="48" height="52" />
            <rect x="674" y="44" width="36" height="36" />
            <rect x="716" y="36" width="42" height="44" />
            <rect x="764" y="46" width="34" height="34" />
            <rect x="804" y="24" width="50" height="56" />
            <rect x="860" y="40" width="40" height="40" />
            <rect x="906" y="50" width="54" height="30" />
          </g>
        </svg>
        <div className="relative flex items-center gap-3">
          <Scissors className="size-7 shrink-0" style={{ color: GREEN_LIGHT }} aria-hidden="true" />
          <p className="font-heading text-[17px] font-bold text-white">{copy.footer}</p>
          <span className="ml-auto text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
            RTA · STGT
          </span>
        </div>
      </footer>
    </div>
  );
}

function StatTile({
  icon: Icon,
  iconColor,
  iconBg,
  value,
  label,
}: {
  icon: typeof Users;
  iconColor: string;
  iconBg: string;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-1 items-center gap-3 rounded-xl border border-[#e5e7eb] p-3">
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: iconBg }}
      >
        <Icon className="size-[18px]" style={{ color: iconColor }} aria-hidden="true" />
      </span>
      <div className="leading-tight">
        <p className="font-heading text-[19px] font-extrabold tabular-nums text-[#0b1b33]">
          {value}
        </p>
        <p className="mt-0.5 text-[10.5px] uppercase tracking-wide text-[#5b6472]">{label}</p>
      </div>
    </div>
  );
}
