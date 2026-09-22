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
    subhead: string;
    saveTitle: string;
    saveBody: string;
    borrowTitle: string;
    borrowBody: string;
    accountedTitle: string;
    accountedBody: string;
    backToWebsite: string;
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
  /// The strength meter. Keyed by score, and by the codes the assessment emits.
  password: {
    strengthLabel: string;
    strength: [string, string, string, string, string];
    issue: Record<PasswordIssue, string>;
  };
}

export const auth: Record<Locale, AuthCopy> = {
  en: {
    layout: {
      headline: "Savings and loans for every RTA member.",
      subhead:
        "Track your contributions, apply for loans and follow your repayments — all in one place.",
      saveTitle: "Save with confidence",
      saveBody:
        "Every contribution is recorded, receipted and visible in your statement.",
      borrowTitle: "Borrow against your savings",
      borrowBody:
        "Apply for a loan, track approval and follow your repayment schedule.",
      accountedTitle: "Your money, accounted for",
      accountedBody:
        "Every transaction carries a reference and a running balance you can verify.",
      backToWebsite: "Back to website",
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
      newPasswordPlaceholder: "At least 10 characters",
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
      newPasswordPlaceholder: "At least 10 characters",
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
    password: {
      strengthLabel: "Password strength: {label}",
      strength: ["Very weak", "Weak", "Fair", "Strong", "Very strong"],
      issue: {
        length: "Use at least 10 characters",
        lowercase: "Add a lowercase letter",
        uppercase: "Add an uppercase letter",
        number: "Add a number",
        symbol: "Add a symbol",
        repeated: "Avoid repeated characters",
        common: "Avoid common words and predictable patterns",
      },
    },
  },

  rw: {
    layout: {
      headline: "Kuzigama no kuguza ku banyamuryango bose ba RTA.",
      subhead:
        "Kurikirana imisanzu yawe, saba inguzanyo kandi ukurikirane ubwishyu bwawe — byose ahantu hamwe.",
      saveTitle: "Zigama utekanye",
      saveBody:
        "Buri musanzu wandikwa, uhabwa inyemezabwishyu kandi ugaragara ku nyandiko ya konti yawe.",
      borrowTitle: "Guza ushingiye ku buzigame bwawe",
      borrowBody:
        "Saba inguzanyo, ukurikirane uko yemezwa kandi ukurikize gahunda y'ubwishyu.",
      accountedTitle: "Amafaranga yawe, abitswe neza",
      accountedBody:
        "Buri gikorwa gifite nimero yacyo n'amafaranga asigaye ushobora kugenzura.",
      backToWebsite: "Subira ku rubuga",
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
      newPasswordPlaceholder: "Byibuze inyuguti 10",
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
      newPasswordPlaceholder: "Byibuze inyuguti 10",
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
    password: {
      strengthLabel: "Imbaraga z'ijambobanga: {label}",
      strength: [
        "Rifite intege nke cyane",
        "Rifite intege nke",
        "Rirambaye",
        "Rikomeye",
        "Rikomeye cyane",
      ],
      issue: {
        length: "Koresha byibuze inyuguti 10",
        lowercase: "Ongeraho inyuguti nto",
        uppercase: "Ongeraho inyuguti nkuru",
        number: "Ongeraho umubare",
        symbol: "Ongeraho ikimenyetso",
        repeated: "Irinde inyuguti zisubiranamo",
        common: "Irinde amagambo azwi n'imikorere yoroshye kumenya",
      },
    },
  },
};
