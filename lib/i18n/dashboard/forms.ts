import type { Locale } from "@/types";

/**
 * Every form that records a person: public membership registration, and the
 * enrolment and editing an administrator does at the desk.
 *
 * These are the screens most likely to be filled in by someone who speaks only
 * Kinyarwanda, which is why the field hints and the validation messages are
 * translated too and not just the labels. A form that asks its question in
 * Kinyarwanda and then rejects the answer in English is worse than one that
 * never pretended.
 *
 * Place names are not translated. Rwanda's provinces and districts have one
 * official spelling each — see lib/rwanda.ts — and translating them would
 * defeat the point of choosing them from a fixed list.
 */
export interface FormsCopy {
  /// Shared field labels and hints.
  field: {
    firstName: string;
    lastName: string;
    memberTitle: string;
    email: string;
    phone: string;
    nationalId: string;
    dateOfBirth: string;
    gender: string;
    occupation: string;
    businessName: string;
    address: string;
    city: string;
    province: string;
    district: string;
    mobileMoneyNumber: string;
    bankAccountNumber: string;
    password: string;
    confirmPassword: string;
    note: string;
  };
  /// The words on the photograph control, shared by the public form and the
  /// desk form.
  photo: {
    choose: string;
    replace: string;
    remove: string;
    working: string;
    failed: string;
    preview: string;
  };
  placeholder: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    nationalId: string;
    occupation: string;
    city: string;
    password: string;
    confirmPassword: string;
    relation: string;
  };
  hint: {
    phoneRegister: string;
    phoneAdmin: string;
    nationalIdRegister: string;
    nationalIdAdmin: string;
    memberTitle: string;
    emailOptional: string;
    /// The applicant's own wording. Theirs is the one that has to say why
    /// leaving it blank is safe — a required-looking field with no explanation
    /// is a field people invent an address for.
    emailOptionalRegister: string;
    mobileMoney: string;
    districtRegister: string;
  };
  gender: {
    male: string;
    female: string;
    other: string;
    undisclosed: string;
  };
  location: {
    selectProvince: string;
    selectDistrict: string;
  };
  /// Public membership registration.
  register: {
    legend: string;
    showPassword: string;
    hidePassword: string;
    terms: string;
    submit: string;
    submitting: string;
    failed: string;
    alreadyMember: string;
    signIn: string;
    successTitle: string;
    /// What happens next after the application lands. The API answers in
    /// English only, so the applicant is told here instead — this is the last
    /// thing they read before leaving the page.
    successBody: string;
    membershipNumber: string;
    paymentReference: string;
    copyReference: string;
    keepReferenceTitle: string;
    keepReferenceBody: string;
    goToSignIn: string;
    backHome: string;
    error: {
      firstName: string;
      lastName: string;
      email: string;
      phone: string;
      nationalId: string;
      /// Only reached once a successor has been named. Naming one is optional;
      /// naming one without their ID is not.
      successorNationalId: string;
      password: string;
      confirmPassword: string;
      terms: string;
    };
  };
  /// Administrator enrolment and editing of a member's file.
  member: {
    identity: string;
    identityHint: string;
    livelihood: string;
    livelihoodHint: string;
    address: string;
    paymentIdentifiers: string;
    paymentIdentifiersHint: string;
    nextOfKin: string;
    nextOfKinName: string;
    nextOfKinPhone: string;
    nextOfKinRelation: string;
    enrolment: string;
    enrolmentHint: string;
    recordChange: string;
    recordChangeHint: string;
    membershipStatus: string;
    statusActive: string;
    statusPending: string;
    noteLabel: string;
    noteHintEnrol: string;
    noteHintEdit: string;
    enrol: string;
    enrolling: string;
    saveChanges: string;
    savingChanges: string;
    enrolFailed: string;
    saveFailed: string;
    matchingWarning: string;
    /// On the edit form the photograph fields start empty even when the member
    /// already has one: the bytes are not loaded back into the form, so a
    /// blank field has to mean "leave it alone" rather than "delete it".
    photoKeepsExisting: string;
    enrolledTitle: string;
    enrolledBody: string;
    giveToMember: string;
    memberNumber: string;
    paymentReference: string;
    paymentReferenceHint: string;
    temporaryPassword: string;
    temporaryPasswordHint: string;
    copyDetails: string;
    openMemberFile: string;
    enrolAnother: string;
    passwordWarning: string;
  };
  /// The association's own application questions — shares, interns and a
  /// successor — asked on the public form and at the desk alike. The
  /// `…Question` and `…Register` strings address the applicant; the rest are
  /// neutral, for the admin form and the member file.
  application: {
    section: string;
    sectionHint: string;
    shares: string;
    sharesHintRegister: string;
    sharesHintAdmin: string;
    sharesError: string;
    /// The one figure an applicant is asked to agree to: the daily saving and
    /// the service fee already added together. The split is the association's
    /// bookkeeping, not the applicant's decision.
    sharesTotal: string;
    sharesOption: string;
    choose: string;
    hasCompany: string;
    hasCompanyQuestion: string;
    hasCompanyError: string;
    /// Icyemezo cy'umwuga. Asked of every applicant, company or not — it is
    /// about the trade, not the business.
    certificate: string;
    certificateQuestion: string;
    certificateHint: string;
    certificateError: string;
    acceptsInterns: string;
    acceptsInternsQuestion: string;
    acceptsInternsError: string;
    internCapacity: string;
    internCapacityQuestion: string;
    internCapacityError: string;
    successor: string;
    successorHintRegister: string;
    successorHintAdmin: string;
    successorName: string;
    successorPhone: string;
    successorRelation: string;
    successorNationalId: string;
    /// The two faces on a member's file: their own, which is also what prints
    /// on the membership card, and the successor's, which is what the
    /// warehouse counter checks when somebody collects in their place.
    photo: string;
    photoHintRegister: string;
    photoHintAdmin: string;
    successorPhoto: string;
    successorPhotoHint: string;
    /// The links that reveal the photograph fields on the public form, which
    /// are hidden until asked for so nobody mistakes them for a requirement.
    photoReveal: string;
    successorPhotoReveal: string;
  };
}

export const forms: Record<Locale, FormsCopy> = {
  en: {
    field: {
      firstName: "First name",
      lastName: "Last name",
      email: "Email address",
      phone: "Mobile number",
      nationalId: "National ID",
      dateOfBirth: "Date of birth",
      gender: "Gender",
      memberTitle: "Office held",
      occupation: "Occupation or business",
      businessName: "Business name",
      address: "Address",
      city: "City or sector",
      province: "Province",
      district: "District",
      mobileMoneyNumber: "Mobile money number",
      bankAccountNumber: "Bank account number",
      password: "Password",
      confirmPassword: "Confirm password",
      note: "Note",
    },
    photo: {
      choose: "Add photograph",
      replace: "Replace photograph",
      remove: "Remove",
      working: "Preparing…",
      failed: "That photograph could not be read. Choose a PNG or JPEG image.",
      preview: "Photograph",
    },
    placeholder: {
      firstName: "Jean",
      lastName: "Uwimana",
      email: "you@example.com",
      phone: "0788123456",
      nationalId: "1199012345678901",
      occupation: "Tailor, fashion designer, textile trader…",
      city: "Kigali",
      password: "At least 10 characters",
      confirmPassword: "Re-enter your password",
      relation: "Spouse",
    },
    hint: {
      phoneRegister: "Used for payment matching and SMS alerts",
      phoneAdmin:
        "Used to reach them, and to match payments sent from this number.",
      nationalIdRegister: "16 digits — optional, speeds up verification",
      memberTitle:
        "Printed under their name on the membership card. Leave it empty for an ordinary member — the card then reads “Umunyamuryango”.",
      nationalIdAdmin:
        "16 digits. Recording it marks their identity check as pending.",
      emailOptional: "Optional. Leave blank if they do not have one.",
      emailOptionalRegister:
        "Optional. Your phone number signs you in, so leave this blank if you do not have an email address.",
      mobileMoney: "Leave blank if it is the same as their phone number.",
      districtRegister: "Where you live or run your workshop",
    },
    gender: {
      male: "Male",
      female: "Female",
      other: "Other",
      undisclosed: "Prefer not to say",
    },
    location: {
      selectProvince: "Select a province",
      selectDistrict: "Select a district",
    },
    register: {
      legend: "Your details",
      showPassword: "Show password",
      hidePassword: "Hide password",
      terms:
        "I confirm the details above are correct and I accept the Rwanda Tailors Association savings and loan rules.",
      submit: "Submit membership application",
      submitting: "Submitting application…",
      failed: "Could not submit your application.",
      alreadyMember: "Already a member?",
      signIn: "Sign in",
      successTitle: "Application received",
      successBody:
        "Your application has been received. You will be notified once an administrator approves your membership.",
      membershipNumber: "Membership number",
      paymentReference: "Your payment reference",
      copyReference: "Copy payment reference",
      keepReferenceTitle: "Keep your payment reference.",
      keepReferenceBody:
        "Quote {reference} on every payment you make to the association. It is how your contribution is matched to your savings account.",
      goToSignIn: "Go to sign in",
      backHome: "Back to homepage",
      error: {
        firstName: "Enter your first name",
        lastName: "Enter your last name",
        email: "Enter a valid email address",
        phone: "Enter a valid Rwandan mobile number, e.g. 0788123456",
        nationalId: "The national ID must be 16 digits",
        successorNationalId: "Enter the successor's national ID — 16 digits",
        password: "Choose a stronger password",
        confirmPassword: "Passwords do not match",
        terms: "You must accept the association rules to register",
      },
    },
    member: {
      identity: "Identity",
      identityHint: "The minimum needed to open an account.",
      livelihood: "Livelihood",
      livelihoodHint: "What the member does for a living.",
      address: "Address",
      paymentIdentifiers: "Payment identifiers",
      paymentIdentifiersHint:
        "Fallback keys used to attribute a payment that arrives without a reference.",
      nextOfKin: "Next of kin",
      nextOfKinName: "Full name",
      nextOfKinPhone: "Phone number",
      nextOfKinRelation: "Relationship",
      enrolment: "Enrolment",
      enrolmentHint:
        "Active members can transact immediately. This decision is recorded against your name.",
      recordChange: "Record the change",
      recordChangeHint:
        "Membership status is changed from the member's file, not here — approving, suspending and reactivating each need their own reason.",
      membershipStatus: "Membership status",
      statusActive: "Active — can save and borrow now",
      statusPending: "Pending approval — needs a second check",
      noteLabel: "Note for the audit log",
      noteHintEnrol: "Optional. e.g. where the paper application came from.",
      noteHintEdit:
        "Optional. Why the details changed — useful when a payment later lands unexpectedly.",
      enrol: "Enrol member",
      enrolling: "Enrolling…",
      saveChanges: "Save changes",
      savingChanges: "Saving…",
      enrolFailed: "The member could not be enrolled",
      saveFailed: "The changes could not be saved",
      matchingWarning:
        "Changing the phone, mobile money or bank account number changes which payments are attributed to this member in future. The old and new values are both written to the audit log.",
      photoKeepsExisting:
        "Leave this empty to keep the photograph already on file. Choosing one replaces it.",
      enrolledTitle: "Member enrolled",
      enrolledBody: "{name} has been enrolled as {number}.",
      giveToMember: "Give these to the member",
      memberNumber: "Member number",
      paymentReference: "Payment reference",
      paymentReferenceHint:
        "They must quote this on every deposit so it is credited automatically.",
      temporaryPassword: "Temporary password",
      temporaryPasswordHint:
        "Shown once and never again. They will be asked to change it when they first sign in.",
      copyDetails: "Copy details",
      openMemberFile: "Open member file",
      enrolAnother: "Enrol another",
      passwordWarning:
        "Write the temporary password down or copy it now. It is stored only as a hash, so nobody — including you — can look it up later. If it is lost the member has to reset their password instead.",
    },
    application: {
      section: "Shares, company and interns",
      sectionHint: "As given on the application.",
      shares: "Number of shares",
      sharesHintRegister:
        "Each share costs {price} every day. Choose 1 to {max}; for more than {max}, ask the association.",
      sharesHintAdmin:
        "Each share is {price} saved every day. The application allows 1 to {max}; record more only when the association has agreed it.",
      sharesError: "Choose between 1 and {max} shares",
      sharesTotal: "You pay {total} every day.",
      sharesOption: "{count} — {total} a day",
      choose: "Choose…",
      hasCompany: "Has a company",
      hasCompanyQuestion: "Do you have a company?",
      hasCompanyError: "Answer yes or no",
      certificate: "Professional certificate",
      certificateQuestion: "Do you have a professional certificate?",
      certificateHint:
        "A trade certificate in tailoring — from a TVET school, a recognised training centre or RTB. Answer no if you learned on the job; it does not affect your application.",
      certificateError: "Answer whether you have a professional certificate",
      acceptsInterns: "Takes on interns",
      acceptsInternsQuestion:
        "Would you take on interns (people learning the trade)?",
      acceptsInternsError: "Answer yes or no",
      internCapacity: "Interns they can take on",
      internCapacityQuestion: "How many interns can you take on?",
      internCapacityError: "Enter a number between 1 and {max}",
      successor: "Successor",
      successorHintRegister:
        "Someone who can act for you when you are not available — for example, collecting goods from the warehouse. Not the same as next of kin.",
      successorHintAdmin:
        "Who may act for the member when they are not available — for example, collecting goods from the warehouse. Not the same as next of kin.",
      successorName: "Successor's full name",
      successorPhone: "Successor's phone number",
      successorRelation: "Relationship to you",
      successorNationalId: "Successor's national ID",
      photo: "Passport photograph",
      photoHintRegister:
        "A clear photograph of your face, looking at the camera. This is the photograph printed on your membership card. You can also add it later from your account.",
      photoHintAdmin:
        "Printed on the membership card. A clear photograph of the member's face, looking at the camera.",
      successorPhoto: "Successor's passport photograph",
      successorPhotoHint:
        "Optional. So the association can recognise them when they collect goods in your place.",
      photoReveal: "Add a passport photograph (optional)",
      successorPhotoReveal: "Add the successor's photograph (optional)",
    },
  },

  rw: {
    field: {
      firstName: "Izina ribanza",
      lastName: "Izina ry'umuryango",
      email: "Aderesi ya imeyili",
      phone: "Nimero ya telefoni",
      nationalId: "Indangamuntu",
      dateOfBirth: "Itariki y'amavuko",
      gender: "Igitsina",
      memberTitle: "Inshingano afite mu ihuriro",
      occupation: "Umwuga cyangwa ibikorwa by'ubucuruzi",
      businessName: "Izina ry'ubucuruzi",
      address: "Aderesi",
      city: "Umujyi cyangwa umurenge",
      province: "Intara",
      district: "Akarere",
      mobileMoneyNumber: "Nimero ya mobile money",
      bankAccountNumber: "Nimero ya konti ya banki",
      password: "Ijambobanga",
      confirmPassword: "Emeza ijambobanga",
      note: "Icyitonderwa",
    },
    photo: {
      choose: "Shyiramo ifoto",
      replace: "Simbuza ifoto",
      remove: "Kuraho",
      working: "Turategura ifoto…",
      failed: "Iyi foto ntiyashobotse gusomwa. Hitamo ifoto ya PNG cyangwa JPEG.",
      preview: "Ifoto",
    },
    placeholder: {
      firstName: "Jean",
      lastName: "Uwimana",
      email: "wowe@urugero.com",
      phone: "0788123456",
      nationalId: "1199012345678901",
      occupation: "Umudozi, umushushanya myambaro, umucuruzi w'imyenda…",
      city: "Kigali",
      password: "Byibuze inyuguti 10",
      confirmPassword: "Ongera wandike ijambobanga",
      relation: "Umubano mufitanye",
    },
    hint: {
      phoneRegister: "Iyi nimero izifashishwa mu kwemeza ubwishyu no kukugezaho ubutumwa bugufi (SMS)",
      phoneAdmin:
        "Ikoreshwa mu kumugeraho, no guhuza ubwishyu bwoherejwe kuri iyi nimero.",
      nationalIdRegister:
        "Imibare 16 — ntibigomba, ariko byihutisha kugenzura umwirondoro",
      memberTitle:
        "Icapwa munsi y’izina rye ku ikarita y’ubunyamuryango. Usige ubusa ku munyamuryango usanzwe — ikarita yandika “Umunyamuryango”.",
      nationalIdAdmin:
        "Imibare 16. Kuyandika bituma igenzura ry'umwirondoro riba ritegereje.",
      emailOptional: "Si ngombwa. Siga aha hantu ubusa niba nta aderesi ya imeyili afite.",
      emailOptionalRegister:
        "Si ngombwa. Niba udafite aderesi ya imeyili, usige aha hantu ubusa. Uzajya winjira ukoresheje nimero ya telefone yawe.",
      mobileMoney: "Siga ubusa niba ari imwe na nimero ya telefone.",
      districtRegister: "Aho utuye cyangwa aho ukorera",
    },
    gender: {
      male: "Gabo",
      female: "Gore",
      other: "Ikindi",
      undisclosed: "Simbyifuza kuvuga",
    },
    location: {
      selectProvince: "Hitamo intara",
      selectDistrict: "Hitamo akarere",
    },
    register: {
      legend: "Umwirondoro wawe",
      showPassword: "Erekana ijambobanga",
      hidePassword: "Hisha ijambobanga",
      terms:
        "Nemeza ko amakuru yavuzwe haruguru ari ukuri, kandi nemera amabwiriza y'ihuriro ry'Abadozi mu Rwanda agenga kuzigama no kuguriza.",
      submit: "Ohereza ubusabe bwo kwinjira mu ihuriro",
      submitting: "Turohereza ubusabe…",
      failed: "Ntitwashoboye kohereza ubusabe bwawe.",
      alreadyMember: "Usanzwe uri umunyamuryango?",
      signIn: "Injira muri konti yawe",
      successTitle: "Ubusabe bwakiriwe",
      successBody:
        "Ubusabe bwawe bwakiriwe. Uzamenyeshwa igihe umuyobozi azaba yemeje ubunyamuryango bwawe.",
      membershipNumber: "Nimero y'umunyamuryango",
      paymentReference: "Nimero yawe y'ubwishyu",
      copyReference: "Koporora nimero y'ubwishyu",
      keepReferenceTitle: "Bika neza nimero yawe y'ubwishyu kugira ngo uzayikoreshe igihe cyose wohereza amafaranga mu ihuriro.",
      keepReferenceBody:
        "Andika {reference} kuri buri bwishyu bwose wohereza mu ihuriro. Ni yo ituma amafaranga yawe ajya kuri konti yawe y'ubuzigame.",
      goToSignIn: "Jya ku rupapuro rwo kwinjira",
      backHome: "Subira ku rupapuro rwa mbere",
      error: {
        firstName: "Andika izina ribanza",
        lastName: "Andika izina ry'umuryango",
        email: "Andika aderesi imeyili nyayo",
        phone: "Andika nimero ya telefone yo mu Rwanda, urugero 0788123456",
        nationalId: "Indangamuntu igomba kuba imibare 16",
        successorNationalId: "Andika indangamuntu y'umusimbura — imibare 16",
        password: "Hitamo ijambobanga rikomeye kurushaho",
        confirmPassword: "Amagambobanga ntaba amwe",
        terms: "Ugomba kwemera amabwiriza y'ihuriro mbere yo kwiyandikisha",
      },
    },
    member: {
      identity: "Umwirondoro",
      identityHint: "Ibyibuze bikenewe kugira konti ifungurwe.",
      livelihood: "Icyo akora",
      livelihoodHint: "Umurimo umunyamuryango abeshejweho.",
      address: "Aderesi",
      paymentIdentifiers: "Amakuru afasha kumenya ubwishyu",
      paymentIdentifiersHint:
        "Ibimenyetso bifashisha guhuza ubwishyu bwageze butagira nimero y'ubwishyu.",
      nextOfKin: "Umuntu wa hafi ushobora kuvugwa igihe bikenewe",
      nextOfKinName: "Amazina yose",
      nextOfKinPhone: "Nimero ya telefoni",
      nextOfKinRelation: "Isano mufitanye",
      enrolment: "Kwinjiza umunyamuryango",
      enrolmentHint:
        "Abanyamuryango bakora (ACTIVE) bashobora kubitsa cyangwa kuguza ako kanya. Iki cyemezo cyandikwa ku izina ryawe.",
      recordChange: "Bika impinduka zakozwe",
      recordChangeHint:
        "Imimerere y'ubunyamuryango ihindurwa mu dosiye y'umunyamuryango, atari hano — kwemeza, guhagarika no kongera gukora bisaba impamvu yihariye.",
      membershipStatus: "Imimerere y'ubunyamuryango",
      statusActive: "Arakora — ashobora kuzigama no kuguza nonaha",
      statusPending: "Ategereje kwemezwa n'ubuyobozi — bisaba igenzura rya kabiri",
      noteLabel: "Icyitonderwa cy'igitabo cy'ibyakozwe",
      noteHintEnrol: "Ntibigomba. Urugero: aho urupapuro rw'ubusabe ruturutse.",
      noteHintEdit:
        "Ntibigomba. Impamvu amakuru yahindutse — bifasha igihe ubwishyu buje mu buryo butunguranye.",
      enrol: "Injiza umunyamuryango",
      enrolling: "Turamwinjiza…",
      saveChanges: "Bika impinduka",
      savingChanges: "Turabika…",
      enrolFailed: "Umunyamuryango ntiyashoboye kwinjizwa",
      saveFailed: "Impinduka ntizashoboye kubikwa",
      matchingWarning:
        "Guhindura nimero ya telefone, ya mobile money cyangwa ya konti ya banki bihindura ubwishyu buzahuzwa n'uyu munyamuryango. Agaciro ka kera n'aka none byombi byandikwa mu gitabo cy'ibyakozwe.",
      photoKeepsExisting:
        "Siga ahantu harimo ubusa kugira ngo ifoto isanzwe iri kuri dosiye igume. Guhitamo indi irayisimbura.",
      enrolledTitle: "Umunyamuryango yinjijwe",
      enrolledBody: "{name} yinjijwe afite nimero {number}.",
      giveToMember: "Ibi bihe umunyamuryango",
      memberNumber: "Nimero y'umunyamuryango",
      paymentReference: "Nimero y'ubwishyu",
      paymentReferenceHint:
        "Agomba kuyandika kuri buri bwishyu kugira ngo yandikwe ku konti ye ako kanya.",
      temporaryPassword: "Ijambobanga ry'agateganyo",
      temporaryPasswordHint:
        "Rigaragara rimwe gusa. Azasabwa kurihindura ubwa mbere yinjira.",
      copyDetails: "Koporora amakuru",
      openMemberFile: "Fungura dosiye y'umunyamuryango",
      enrolAnother: "Injiza undi",
      passwordWarning:
        "Andika ijambobanga ry'agateganyo cyangwa urikoporore ubu. Ribikwa nk'ibanga ryahishwe, ku buryo nta muntu — nawe ubwawe — ushobora kongera kuribona. Nirikubura, umunyamuryango agomba gusaba ijambobanga rishya.",
    },
    application: {
      section: "Imigabane, sosiyete n'abimenyereza umwuga",
      sectionHint: "Nk'uko byanditswe ku busabe.",
      shares: "Umubare w'imigabane",
      sharesHintRegister:
        "Buri mugabane usaba kuzigama {price} buri munsi. Hitamo kuva kuri 1 kugeza kuri {max}; niba ushaka irenze {max}, baza ihuriro.",
      sharesHintAdmin:
        "Umugabane umwe ni {price} azigama buri munsi. Ubusabe bwemera kuva kuri 1 kugeza kuri {max}; andika irenzeho gusa iyo ihuriro ryabyemeje.",
      sharesError: "Hitamo imigabane iri hagati ya 1 na {max}",
      sharesTotal: "Uzajya wishyura {total} buri munsi.",
      sharesOption: "{count} — {total} ku munsi",
      choose: "Hitamo…",
      hasCompany: "Afite ikigo cy'ubucuruzi cyangwa sosiyete",
      hasCompanyQuestion: "Ese ufite ikigo cy'ubucuruzi cyangwa sosiyete?",
      certificate: "Icyemezo cy'umwuga",
      certificateQuestion: "Ese ufite icyemezo cy'umwuga?",
      certificateHint:
        "Icyemezo cy'umwuga wo kudoda — cyaba giturutse ku ishuri rya TVET, ikigo cyemewe cyigisha imyuga cyangwa RTB. Subiza oya niba warigiye ku kazi; ntibihindura ubusabe bwawe.",
      certificateError: "Emeza niba ufite icyemezo cy'umwuga",
      hasCompanyError: "Subiza yego cyangwa oya",
      acceptsInterns: "Yakira abimenyereza umwuga",
      acceptsInternsQuestion:
        "Ese wakwemera kwakira abimenyereza umwuga (abastajiyeri)?",
      acceptsInternsError: "Subiza yego cyangwa oya",
      internCapacity: "Abastajiyeri ashobora kwakira",
      internCapacityQuestion:
        "Ufite ubushobozi bwo kwakira abastajiyeri bangahe?",
      internCapacityError: "Andika umubare uri hagati ya 1 na {max}",
      successor: "Umusimbura",
      successorHintRegister:
        "Umuntu ushobora kuguhagararira igihe udahari — urugero, gufata ibikoresho mu bubiko. Si kimwe n'uwo mwegereye.",
      successorHintAdmin:
        "Umuntu ushobora guhagararira umunyamuryango igihe adahari — urugero, gufata ibikoresho mu bubiko. Si kimwe n'uwo begereye.",
      successorName: "Amazina y'umusimbura",
      successorPhone: "Telefone y'umusimbura",
      successorNationalId: "Indangamuntu y'umusimbura",
      photo: "Ifoto ya pasiporo",
      photoHintRegister:
        "Ifoto igaragara neza y'isura yawe, urebye kuri kamera. Ni yo foto izacapwa ku ikarita yawe y'ubunyamuryango. Ushobora no kuyishyiramo nyuma muri konti yawe.",
      photoHintAdmin:
        "Icapwa ku ikarita y'ubunyamuryango. Ifoto igaragara neza y'isura y'umunyamuryango, arebye kuri kamera.",
      successorPhoto: "Ifoto ya pasiporo y'umusimbura",
      successorPhotoHint:
        "Si ngombwa. Kugira ngo ihuriro rimumenye igihe aje gufata ibintu mu mwanya wawe.",
      photoReveal: "Shyiramo ifoto ya pasiporo (si ngombwa)",
      successorPhotoReveal: "Shyiramo ifoto y'umusimbura (si ngombwa)",
      successorRelation: "Isano mufitanye",
    },
  },
};
