import type { PasswordIssue } from "@/lib/auth/password.shared";
import type { Locale } from "@/types";

/**
 * Signing in, and everything around it: the brand panel, forgotten passwords,
 * password resets, and the wait for approval.
 *
 * The first screen anyone sees. A member who cannot read the sign-in page has
 * no way to reach the Kinyarwanda dashboard behind it, so the language switch
 * lives on this page too and the copy here is translated in full — including
 * the password advice, which is the one place a form tells someone their answer
 * is not good enough.
 */
export interface AuthCopy {
  /// The two-panel shell around every auth page.
  layout: {
    headline: string;
    homeLabel: string;
    /// The brand this side of the sign-in belongs to. The public website is
    /// the association; everything behind this door is STGT, its savings
    /// programme, and a member arriving at a sign-in link has to be told which
    /// of the two they are looking at.
    brandTagline: string;
    brandProgramme: string;
  };
  login: {
    title: string;
    subtitle: string;
    identifier: string;
    identifierHint: string;
    identifierPlaceholder: string;
    /// Phone is the default way in; email is offered behind a link for the
    /// few who prefer it.
    phone: string;
    phonePlaceholder: string;
    email: string;
    emailPlaceholder: string;
    useEmail: string;
    usePhone: string;
    password: string;
    passwordPlaceholder: string;
    showPassword: string;
    hidePassword: string;
    forgotPassword: string;
    submit: string;
    submitting: string;
    failed: string;
    /// Shown when a guard signed them out — idle timeout, or a session ended
    /// from elsewhere — so the login screen is not a mystery.
    sessionExpired: string;
    /// Above the password box after scanning a sign-in QR card, so the holder
    /// can see whose card it is.
    qrSignInAs: string;
    /// Heading and badges on the scanned-card screen, around the holder's name.
    qrWelcome: string;
    qrCardVerified: string;
    qrSecure: string;
    notAMember: string;
    applyToJoin: string;
  };
  forgot: {
    title: string;
    subtitle: string;
    identifier: string;
    submit: string;
    submitting: string;
    tooManyRequests: string;
    sentTitle: string;
    sentBody: string;
    notReceived: string;
    tryAnother: string;
    backToSignIn: string;
  };
  reset: {
    title: string;
    subtitle: string;
    newPassword: string;
    newPasswordPlaceholder: string;
    confirmPassword: string;
    confirmPasswordPlaceholder: string;
    mismatch: string;
    submit: string;
    submitting: string;
    failed: string;
    invalidTitle: string;
    invalidBody: string;
    invalidLinkText: string;
    doneTitle: string;
    doneBody: string;
    backToSignIn: string;
  };
  changePassword: {
    title: string;
    currentPassword: string;
    newPassword: string;
    newPasswordPlaceholder: string;
    confirmPassword: string;
    mismatch: string;
    showPasswords: string;
    hidePasswords: string;
    submit: string;
    submitting: string;
    failed: string;
    done: string;
  };
  pendingApproval: {
    title: string;
    body: string;
    membershipNumber: string;
    paymentReference: string;
    keepReference: string;
    backToWebsite: string;
  };
  /// The shareable /install page that puts the app on a member's phone.
  install: {
    title: string;
    subtitle: string;
    installButton: string;
    installing: string;
    installed: string;
    openApp: string;
    iosTitle: string;
    iosStep1: string;
    iosStep2: string;
    iosStep3: string;
    iosSafariOnly: string;
    inAppTitle: string;
    inAppBody: string;
    openInBrowser: string;
    copyLink: string;
    copied: string;
    manualTitle: string;
    manualBody: string;
    continueInBrowser: string;
    supported: string;
    notSupported: string;
    /// The bar along the bottom of every other page.
    bannerTitle: string;
    bannerBody: string;
    bannerInstall: string;
    bannerDismiss: string;
  };
  /// The password requirements checklist, keyed by the codes the assessment
  /// emits, and the line that sums up what is still missing.
  password: {
    requirementsTitle: string;
    requirement: Record<PasswordIssue, string>;
    met: string;
    missing: string;
    /// "Your password is missing: {items}" — the error under the field.
    missingList: string;
  };
}

export const auth: Record<Locale, AuthCopy> = {
  en: {
    layout: {
      headline: "Your savings and loans, in one place.",
      homeLabel: "Rwanda Tailors Association — home",
      brandTagline: "Save today, grow tomorrow",
      brandProgramme: "The savings programme of the Rwanda Tailors Association",
    },
    login: {
      title: "Welcome back",
      subtitle: "Sign in to view your savings, loans and statements.",
      identifier: "Email or phone number",
      identifierHint:
        "Use the email or phone number registered with the association",
      identifierPlaceholder: "you@example.com or 0788123456",
      phone: "Phone number",
      phonePlaceholder: "0788123456",
      email: "Email",
      emailPlaceholder: "you@example.com",
      useEmail: "Use email instead",
      usePhone: "Use phone number instead",
      password: "Password",
      passwordPlaceholder: "Enter your password",
      showPassword: "Show password",
      hidePassword: "Hide password",
      forgotPassword: "Forgot your password?",
      submit: "Sign in",
      submitting: "Signing in…",
      failed: "Unable to sign in. Please try again.",
      sessionExpired:
        "Your session has ended. Sign in again to continue where you left off.",
      qrSignInAs: "Signing in as {name}. Enter your password to continue.",
      qrWelcome: "Welcome back",
      qrCardVerified: "Membership card recognised",
      qrSecure: "Your card alone opens nothing — your password is always required.",
      notAMember: "Not yet a member?",
      applyToJoin: "Apply to join",
    },
    forgot: {
      title: "Forgot your password?",
      subtitle:
        "Enter the email address or phone number registered with the association and we will send you a link to set a new password.",
      identifier: "Email or phone number",
      submit: "Send reset link",
      submitting: "Sending…",
      tooManyRequests: "Too many requests. Please wait.",
      sentTitle: "Check your messages",
      sentBody:
        "If an account matches those details, a password reset link has been sent. The link expires in 30 minutes.",
      notReceived: "Not received anything? Check your spam folder, or",
      tryAnother: "try a different email or phone number",
      backToSignIn: "Back to sign in",
    },
    reset: {
      title: "Set a new password",
      subtitle:
        "Choose a password you have not used elsewhere. Signing in on your other devices will be required again.",
      newPassword: "New password",
      newPasswordPlaceholder: "At least 6 characters, with a letter and a number",
      confirmPassword: "Confirm new password",
      confirmPasswordPlaceholder: "Re-enter your new password",
      mismatch: "Passwords do not match",
      submit: "Set new password",
      submitting: "Saving…",
      failed: "Could not reset your password.",
      invalidTitle: "This link is not valid",
      invalidBody: "The reset link is missing or incomplete. Request a new one from the",
      invalidLinkText: "forgot password",
      doneTitle: "Password changed",
      doneBody: "Taking you to sign in…",
      backToSignIn: "Back to sign in",
    },
    changePassword: {
      title: "Change your password",
      currentPassword: "Current password",
      newPassword: "New password",
      newPasswordPlaceholder: "At least 6 characters, with a letter and a number",
      confirmPassword: "Confirm new password",
      mismatch: "Passwords do not match",
      showPasswords: "Show passwords",
      hidePasswords: "Hide passwords",
      submit: "Change password",
      submitting: "Saving…",
      failed: "Could not change your password",
      done: "Your password has been changed and other devices have been signed out.",
    },
    pendingApproval: {
      title: "Your membership is being reviewed",
      body: "Thank you, {name}. An administrator is reviewing your application. You will be notified by SMS and email as soon as your account is active.",
      membershipNumber: "Membership number",
      paymentReference: "Your payment reference",
      keepReference:
        "Keep your payment reference safe. Once your membership is active, quote it on every contribution so it reaches your savings account.",
      backToWebsite: "Back to the website",
    },
    install: {
      title: "Install the STGT app",
      subtitle: "Add the app to your phone's home screen. It opens straight to sign-in, with no app store needed.",
      installButton: "Install app",
      installing: "Installing…",
      installed: "Installed. Look for the STGT icon on your home screen.",
      openApp: "Go to sign-in",
      iosTitle: "On iPhone or iPad",
      iosStep1: "Tap the Share button at the bottom of Safari (a square with an arrow).",
      iosStep2: "Scroll down and tap “Add to Home Screen”.",
      iosStep3: "Tap “Add”. The STGT icon appears on your home screen.",
      iosSafariOnly: "If you do not see “Add to Home Screen”, open this link in Safari.",
      inAppTitle: "Open this link in your browser",
      inAppBody: "Apps like WhatsApp, Facebook and Instagram cannot install apps. Open this page in Chrome (Android) or Safari (iPhone) to install.",
      openInBrowser: "Open in Chrome",
      copyLink: "Copy link",
      copied: "Link copied",
      manualTitle: "Install from the browser menu",
      manualBody: "Tap the browser menu (⋮) and choose “Install app” or “Add to Home screen”. If you only see “Open app”, it is already installed.",
      continueInBrowser: "Continue in the browser instead",
      supported: "Your phone can install this app",
      notSupported: "This browser cannot install apps. Use Chrome (Android) or Safari (iPhone).",
      bannerTitle: "Get the STGT app",
      bannerBody: "Quick access to your savings from your home screen",
      bannerInstall: "Install",
      bannerDismiss: "Close",
    },
    password: {
      requirementsTitle: "Your password needs:",
      requirement: {
        length: "At least 6 characters",
        letter: "At least one letter",
        number: "At least one number",
      },
      met: "done",
      missing: "missing",
      missingList: "Your password is missing: {items}",
    },
  },

  rw: {
    layout: {
      headline: "Ubuzigame n'inguzanyo byawe, ahantu hamwe.",
      homeLabel: "Ihuriro ry'Abadozi mu Rwanda — ahabanza",
      brandTagline: "Zigama uyu munsi, ukure ejo",
      brandProgramme: "Gahunda yo kuzigama y'Ihuriro ry'Abadozi mu Rwanda",
    },
    login: {
      title: "Murakaza neza",
      subtitle:
        "Injira urebe ubuzigame bwawe, inguzanyo n'inyandiko za konti.",
      identifier: "Imeyili cyangwa nimero ya telefone",
      identifierHint:
        "Koresha imeyili cyangwa nimero ya telefone wanditse mu ihuriro",
      identifierPlaceholder: "wowe@urugero.com cyangwa 0788123456",
      phone: "Nimero ya telefone",
      phonePlaceholder: "0788123456",
      email: "Imeyili",
      emailPlaceholder: "wowe@urugero.com",
      useEmail: "Koresha imeyili",
      usePhone: "Koresha nimero ya telefone",
      password: "Ijambobanga",
      passwordPlaceholder: "Andika ijambobanga ryawe",
      showPassword: "Erekana ijambobanga",
      hidePassword: "Hisha ijambobanga",
      forgotPassword: "Wibagiwe ijambobanga?",
      submit: "Injira",
      submitting: "Turinjira…",
      failed: "Ntibishoboye kwinjira. Ongera ugerageze.",
      sessionExpired:
        "Igihe cyawe cyo kwinjira cyarangiye. Ongera winjire ukomeze aho wari ugeze.",
      qrSignInAs: "Urinjira nka {name}. Andika ijambobanga ryawe ukomeze.",
      qrWelcome: "Murakaza neza",
      qrCardVerified: "Ikarita y'umunyamuryango yemejwe",
      qrSecure: "Ikarita yonyine ntifungura konti — ijambobanga rirakenerwa buri gihe.",
      notAMember: "Ntiwaba umunyamuryango?",
      applyToJoin: "Saba kwinjira",
    },
    forgot: {
      title: "Wibagiwe ijambobanga?",
      subtitle:
        "Andika imeyili cyangwa nimero ya telefone wanditse mu ihuriro, tuzakohereza umuhora wo kwishyiriraho ijambobanga rishya.",
      identifier: "Imeyili cyangwa nimero ya telefone",
      submit: "Ohereza umuhora",
      submitting: "Turohereza…",
      tooManyRequests: "Ubusabe bwinshi cyane. Tegereza gato.",
      sentTitle: "Reba ubutumwa bwawe",
      sentBody:
        "Niba hari konti ihuye n'ayo makuru, umuhora wo guhindura ijambobanga woherejwe. Umuhora urangira nyuma y'iminota 30.",
      notReceived:
        "Ntacyo wabonye? Reba mu bubiko bw'ubutumwa butifuzwa (spam), cyangwa",
      tryAnother: "gerageza indi imeyili cyangwa indi nimero ya telefone",
      backToSignIn: "Subira ku rupapuro rwo kwinjira",
    },
    reset: {
      title: "Shyiraho ijambobanga rishya",
      subtitle:
        "Hitamo ijambobanga utakoresheje ahandi. Uzasabwa kongera kwinjira ku bindi byuma byawe.",
      newPassword: "Ijambobanga rishya",
      newPasswordPlaceholder: "Nibura inyuguti 6, harimo inyuguti n'umubare",
      confirmPassword: "Emeza ijambobanga rishya",
      confirmPasswordPlaceholder: "Ongera wandike ijambobanga rishya",
      mismatch: "Amagambobanga ntaba amwe",
      submit: "Shyiraho ijambobanga rishya",
      submitting: "Turabika…",
      failed: "Ntitwashoboye guhindura ijambobanga ryawe.",
      invalidTitle: "Uyu muhora ntukora",
      invalidBody:
        "Umuhora wo guhindura ijambobanga urabura cyangwa ntuzuye. Saba undi ku rupapuro rwa",
      invalidLinkText: "wibagiwe ijambobanga",
      doneTitle: "Ijambobanga ryahinduwe",
      doneBody: "Turakujyana ku rupapuro rwo kwinjira…",
      backToSignIn: "Subira ku rupapuro rwo kwinjira",
    },
    changePassword: {
      title: "Hindura ijambobanga ryawe",
      currentPassword: "Ijambobanga rya none",
      newPassword: "Ijambobanga rishya",
      newPasswordPlaceholder: "Nibura inyuguti 6, harimo inyuguti n'umubare",
      confirmPassword: "Emeza ijambobanga rishya",
      mismatch: "Amagambobanga ntaba amwe",
      showPasswords: "Erekana amagambobanga",
      hidePasswords: "Hisha amagambobanga",
      submit: "Hindura ijambobanga",
      submitting: "Turabika…",
      failed: "Ntitwashoboye guhindura ijambobanga ryawe",
      done: "Ijambobanga ryawe ryahinduwe kandi ibindi byuma byasohowe.",
    },
    pendingApproval: {
      title: "Ubunyamuryango bwawe burasuzumwa",
      body: "Urakoze, {name}. Umuyobozi arasuzuma ubusabe bwawe. Uzamenyeshwa kuri telefone no kuri imeyili ako kanya konti yawe itangiye gukora.",
      membershipNumber: "Nimero y'umunyamuryango",
      paymentReference: "Nimero yawe y'ubwishyu",
      keepReference:
        "Bika neza nimero yawe y'ubwishyu. Ubunyamuryango bwawe bumaze gukora, uyandike kuri buri musanzu kugira ngo ugere kuri konti yawe y'ubuzigame.",
      backToWebsite: "Subira ku rubuga",
    },
    install: {
      title: "Shyira porogaramu ya STGT kuri telefone",
      subtitle: "Shyira porogaramu kuri telefone yawe. Ifungukira ahinjirirwa ako kanya, nta Play Store cyangwa App Store ikenewe.",
      installButton: "Shyiramo porogaramu",
      installing: "Birimo gushyirwamo…",
      installed: "Byarangiye. Shaka ikirango cya STGT kuri telefone yawe.",
      openApp: "Jya ahinjirirwa",
      iosTitle: "Kuri iPhone cyangwa iPad",
      iosStep1: "Kanda akabuto ko Gusangiza (Share) hasi muri Safari (kare irimo akambi).",
      iosStep2: "Manuka maze ukande “Add to Home Screen”.",
      iosStep3: "Kanda “Add”. Ikirango cya STGT kiragaragara kuri telefone yawe.",
      iosSafariOnly: "Niba utabona “Add to Home Screen”, fungura iyi link muri Safari.",
      inAppTitle: "Fungura iyi link muri mushakisha",
      inAppBody: "Porogaramu nka WhatsApp, Facebook na Instagram ntizishobora gushyiramo porogaramu. Fungura iyi paji muri Chrome (Android) cyangwa Safari (iPhone).",
      openInBrowser: "Fungura muri Chrome",
      copyLink: "Koporora link",
      copied: "Link yakoporowe",
      manualTitle: "Shyiramo ukoresheje menu ya mushakisha",
      manualBody: "Kanda menu ya mushakisha (⋮) maze uhitemo “Install app” cyangwa “Add to Home screen”. Niba ubona “Open app” gusa, isanzwe iri kuri telefone yawe.",
      continueInBrowser: "Komeza muri mushakisha",
      supported: "Telefone yawe ishobora gushyiramo iyi porogaramu",
      notSupported: "Iyi mushakisha ntishobora gushyiramo porogaramu. Koresha Chrome (Android) cyangwa Safari (iPhone).",
      bannerTitle: "Porogaramu ya STGT",
      bannerBody: "Gera ku buzigame bwawe vuba uhereye kuri telefone",
      bannerInstall: "Shyiramo",
      bannerDismiss: "Funga",
    },
    password: {
      requirementsTitle: "Ijambobanga rigomba kugira:",
      requirement: {
        length: "Nibura inyuguti 6",
        letter: "Nibura inyuguti imwe",
        number: "Nibura umubare umwe",
      },
      met: "byujujwe",
      missing: "birabura",
      missingList: "Ijambobanga ryawe ribura: {items}",
    },
  },
};
