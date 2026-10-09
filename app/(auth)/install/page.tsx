import type { Metadata } from "next";
import { getDashboardCopy } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { d } = await getDashboardCopy();
  return {
    title: `${d.auth.install.title} | RTA Savings & Loans`,
    description: d.auth.install.subtitle,
    robots: { index: false, follow: false },
  };
}

export default async function InstallPage() {
  const { d, locale } = await getDashboardCopy();
  const copy = d.auth.install;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary-50 via-white to-primary-100 px-4 py-12" dir={locale === "rw" ? "ltr" : "ltr"}>
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl p-8 sm:p-10 border border-primary-100">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary-100 text-primary-600 mb-6">
              <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-ink">{copy.title}</h1>
            <p className="mt-3 text-ink-muted leading-relaxed">{copy.subtitle}</p>
          </div>

          <div className="space-y-6">
            <div className="bg-primary-50 rounded-xl p-5 border border-primary-100">
              <h2 className="font-semibold text-ink mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {copy.iosTitle}
              </h2>
              <ol className="space-y-2 text-sm text-ink-muted" role="list">
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-600 text-xs font-semibold flex items-center justify-center">1</span>
                  <span>{copy.iosStep1}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-600 text-xs font-semibold flex items-center justify-center">2</span>
                  <span>{copy.iosStep2}</span>
                </li>
                <li className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary-100 text-primary-600 text-xs font-semibold flex items-center justify-center">3</span>
                  <span>{copy.iosStep3}</span>
                </li>
              </ol>
              <p className="mt-3 text-xs text-primary-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {copy.iosSafariOnly}
              </p>
            </div>

            <div className="bg-amber-50 rounded-xl p-5 border border-amber-100">
              <h2 className="font-semibold text-ink mb-3 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {copy.manualTitle}
              </h2>
              <p className="text-sm text-ink-muted">{copy.manualBody}</p>
            </div>

            <div className="pt-4 border-t border-primary-100">
              <p className="text-center text-sm text-ink-muted">
                {copy.continueInBrowser}
              </p>
            </div>
          </div>

          <div className="mt-8 text-center">
            <p className="text-xs text-ink-muted">
              {copy.supported}
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-ink-muted">
          {copy.notSupported}
        </p>
      </div>
    </div>
  );
}