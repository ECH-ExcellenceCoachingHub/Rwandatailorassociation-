import type { Locale } from "@/types";

/** Chrome around every page: header, user menu, shared controls. */
export interface ShellCopy {
  dashboard: string;
  notifications: string;
  notificationsUnread: string;
  signOut: string;
  signingOut: string;
  openMenu: string;
  closeMenu: string;
  breadcrumb: string;
  changeLanguage: string;
  language: string;
  myProfile: string;
  accountStatus: string;
  myQrCode: string;
  securityPassword: string;
  member: string;
  admin: string;
  superAdmin: string;
  /// Shown by the dashboard's error boundary. Worded for the failure people
  /// actually meet — a dropped connection — rather than as a crash, because a
  /// second try is usually all it takes.
  errorTitle: string;
  errorBody: string;
  errorRetry: string;
}

export const shell: Record<Locale, ShellCopy> = {
  en: {
    dashboard: "Dashboard",
    notifications: "Notifications",
    notificationsUnread: "unread",
    signOut: "Sign out",
    signingOut: "Signing out…",
    openMenu: "Open menu",
    closeMenu: "Close menu",
    breadcrumb: "Breadcrumb",
    changeLanguage: "Change language",
    language: "Language",
    myProfile: "My profile",
    accountStatus: "Account status",
    myQrCode: "My sign-in QR code",
    securityPassword: "Security & password",
    member: "Member",
    admin: "Administrator",
    superAdmin: "Super administrator",
    errorTitle: "This page could not be loaded",
    errorBody:
      "The connection to the server dropped while the page was loading. Nothing you entered has been lost — try again in a moment.",
    errorRetry: "Try again",
  },

  rw: {
    dashboard: "Imbonerahamwe",
    notifications: "Ubutumwa",
    notificationsUnread: "butarasomwa",
    signOut: "Gusohoka",
    signingOut: "Turasohoka…",
    openMenu: "Fungura menu",
    closeMenu: "Funga menu",
    breadcrumb: "Inzira",
    changeLanguage: "Hindura ururimi",
    language: "Ururimi",
    myProfile: "Umwirondoro wanjye",
    accountStatus: "Uko konti ihagaze",
    myQrCode: "Kode yanjye ya QR",
    securityPassword: "Umutekano n'ijambobanga",
    member: "Umunyamuryango",
    admin: "Umuyobozi",
    superAdmin: "Umuyobozi mukuru",
    errorTitle: "Iyi paji ntiyashoboye gufunguka",
    errorBody:
      "Ihuzanzira na seriveri ryacitse mu gihe paji yafunguka. Nta kintu wanditse cyatakaye — ongera ugerageze mu kanya gato.",
    errorRetry: "Ongera ugerageze",
  },
};
