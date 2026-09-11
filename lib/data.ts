import {
  Users,
  MapPin,
  Phone,
  Mail,
  Briefcase,
  GraduationCap,
  Handshake,
  TrendingUp,
  Landmark,
  Megaphone,
  Globe2,
} from "lucide-react";
import {
  FacebookIcon,
  InstagramIcon,
  XIcon,
  LinkedinIcon,
} from "@/components/icons/SocialIcons";
import type {
  NavLink,
  StatItem,
  ServiceItem,
  PartnerLogo,
  NewsItem,
  EventItem,
  GalleryItem,
  Testimonial,
  FooterLinkGroup,
  ContactDetail,
  SocialLink,
} from "@/types";

// Replace with the live URL printed by scripts/google-form/create-membership-form.gs
// after you run it (Logger.log "Form URL"), e.g. https://forms.gle/xxxxxxxx
export const MEMBERSHIP_FORM_URL =
  "https://docs.google.com/forms/d/e/1FAIpQLSc_mlPlX9p_-fY4sdnphv8r3kOPRQZWEKgJeAmj1ZUBFObBEQ/viewform";

export const CONTACT_DETAILS: ContactDetail[] = [
  {
    icon: MapPin,
    label: { en: "Our Office", rw: "Ibiro Byacu" },
    value: "Kicukiro District, Gatenga Sector",
    href: "https://www.google.com/maps?q=Gatenga,+Kicukiro+District,+Kigali,+Rwanda",
  },
  {
    icon: Phone,
    label: { en: "Call Us", rw: "Duhamagare" },
    value: "0788562837",
    href: "tel:+250788562837",
  },
  {
    icon: Mail,
    label: { en: "Email Us", rw: "Dutumire Imeri" },
    value: "info.rta24@gmail.com",
    href: "mailto:info.rta24@gmail.com",
  },
];

export const SOCIAL_LINKS: SocialLink[] = [
  { icon: FacebookIcon, label: "Facebook", href: "#" },
  { icon: InstagramIcon, label: "Instagram", href: "#" },
  { icon: XIcon, label: "Twitter / X", href: "#" },
  { icon: LinkedinIcon, label: "LinkedIn", href: "#" },
];

export const NAV_LINKS: NavLink[] = [
  { label: { en: "Home", rw: "Ahabanza" }, href: "/#home" },
  { label: { en: "About", rw: "Abo Turi Bo" }, href: "/#about" },
  { label: { en: "Services", rw: "Serivisi" }, href: "/#services" },
  { label: { en: "Membership", rw: "Ubunyamuryango" }, href: "/#why-join" },
  { label: { en: "Events", rw: "Ibikorwa" }, href: "/#events" },
  { label: { en: "News", rw: "Amakuru" }, href: "/news" },
  { label: { en: "Gallery", rw: "Amafoto" }, href: "/#gallery" },
  { label: { en: "Contact", rw: "Twandikire" }, href: "/#contact" },
];

export const STATS: StatItem[] = [
  {
    icon: Users,
    value: "2,500+",
    label: { en: "Registered Tailors", rw: "Abadozi Biyandikishije" },
  },
  { icon: MapPin, value: "30", label: { en: "Districts", rw: "Uturere" } },
  { icon: Briefcase, value: "500+", label: { en: "Businesses", rw: "Ubucuruzi" } },
  {
    icon: GraduationCap,
    value: "100+",
    label: { en: "Training Programs", rw: "Amahugurwa" },
  },
  { icon: Handshake, value: "20+", label: { en: "Partners", rw: "Abafatanyabikorwa" } },
];

export const PARTNERS: PartnerLogo[] = [
  { name: "Private Sector Federation", short: "PSF", logo: "/images/partner-psf.png" },
  { name: "Made in Rwanda", short: "Made in Rwanda", logo: "/images/partner-made-in-rwanda.jpg" },
  { name: "Rwanda Development Board", short: "RDB", logo: "/images/partner-rdb.png" },
  { name: "Rwanda TVET Board", short: "TVET Rwanda", logo: "/images/partner-rtb.jpg" },
  { name: "Ministry of Trade and Industry", short: "MINICOM", logo: "/images/partner-minicom.png" },
  { name: "Ese Niba", short: "Ese Niba", logo: "/images/partner-eseniba.svg" },
];

export const SERVICES: ServiceItem[] = [
  {
    icon: TrendingUp,
    title: { en: "Business Development", rw: "Iterambere ry'Ubucuruzi" },
    description: {
      en: "Support for business planning, branding, marketing and sustainable growth.",
      rw: "Ubufasha mu gutegura gahunda z'ubucuruzi, kwamamaza ikirango, isoko no gukura mu buryo burambye.",
    },
  },
  {
    icon: GraduationCap,
    title: { en: "Capacity Building", rw: "Kongera Ubushobozi" },
    description: {
      en: "Training, workshops and skills development to build skilled tailors.",
      rw: "Amahugurwa, inama mpuzabikorwa n'iterambere ry'ubumenyi kugira ngo habeho abadozi b'inzobere.",
    },
  },
  {
    icon: Users,
    title: { en: "Networking", rw: "Guhuza Abadozi" },
    description: {
      en: "Connecting tailors, suppliers, designers and businesses across Rwanda.",
      rw: "Guhuza abadozi, abaguzi b'ibikoresho, abanyabuhanga mu miterere n'ubucuruzi mu Rwanda hose.",
    },
  },
  {
    icon: Landmark,
    title: { en: "Access to Finance", rw: "Kubona Inguzanyo" },
    description: {
      en: "Linking members to loans, grants and investment opportunities.",
      rw: "Guhuza abanyamuryango n'inguzanyo, imfashanyo n'amahirwe yo gushora imari.",
    },
  },
  {
    icon: Megaphone,
    title: { en: "Marketing Support", rw: "Ubufasha mu Kwamamaza" },
    description: {
      en: "Helping members promote their products and reach new markets.",
      rw: "Gufasha abanyamuryango kwamamaza ibicuruzwa byabo no kugera ku masoko mashya.",
    },
  },
  {
    icon: Globe2,
    title: { en: "Market Access", rw: "Kwinjira ku Isoko" },
    description: {
      en: "Connecting members to local and international market opportunities.",
      rw: "Guhuza abanyamuryango n'amahirwe y'amasoko yo mu gihugu no mu mahanga.",
    },
  },
];

export const WHY_JOIN: Record<"en" | "rw", string[]> = {
  en: [
    "National recognition and certification",
    "Access to business support services",
    "Training and capacity building",
    "Networking and partnerships",
    "Representation and advocacy",
    "Access to markets and opportunities",
  ],
  rw: [
    "Kwemerwa n'igihugu no guhabwa impamyabushobozi",
    "Kubona serivisi zo gufasha mu bucuruzi",
    "Amahugurwa no kongera ubushobozi",
    "Guhuza abantu no gufatanya",
    "Kuhagararirwa no kuvugirwa",
    "Kubona amasoko n'amahirwe",
  ],
};

export const NEWS: NewsItem[] = [
  {
    slug: "isaac-manufacturing-center-gisagara",
    image: "/images/isaac.png",
    category: { en: "MEMBER SPOTLIGHT", rw: "UMUNYAMURYANGO" },
    date: { en: "July 15, 2024", rw: "15 Nyakanga 2024" },
    title: {
      en: "Member Spotlight: Isaac and Isaac Manufacturing Center in Gisagara",
      rw: "Umunyamuryango Wagaragaye: Isaac na Isaac Manufacturing Center i Gisagara",
    },
    excerpt: {
      en: "RTA member Isaac has grown Isaac Manufacturing Center into one of Gisagara District's leading garment workshops.",
      rw: "Umunyamuryango wa RTA, Isaac, yateje imbere Isaac Manufacturing Center kugeza kuba kimwe mu bubiko bw'imyenda bukomeye mu Karere ka Gisagara.",
    },
    body: {
      en: [
        "Isaac is a proud RTA member and the founder of Isaac Manufacturing Center, a garment production workshop based in Gisagara District, Southern Province, producing tailored clothing and uniforms for clients across the region.",
        "Since joining RTA, Isaac has drawn on the association's training programs and business support services to modernise his workshop's equipment, formalise his pricing and operations, and take on larger production orders.",
        "Today, Isaac Manufacturing Center employs a growing team of local tailors and is a source of pride in Gisagara, showing what steady investment in skills and quality can build for a tailoring business in Rwanda.",
      ],
      rw: [
        "Isaac ni umunyamuryango w'ishema wa RTA kandi ni umushinze wa Isaac Manufacturing Center, ubukorikori bw'imyenda buherereye mu Karere ka Gisagara, Intara y'Amajyepfo, bukora imyenda n'imyambaro y'amashuri n'ibigo ku bakiriya bo muri iyo karere.",
        "Kuva yinjira muri RTA, Isaac yakoresheje amahugurwa n'ubufasha mu bucuruzi bitangwa n'ishyirahamwe kugira ngo avugurure ibikoresho by'ubukorikori bwe, ashyireho uburyo bwiza bwo gushyiraho ibiciro n'imikorere, akaba yatangiye kwakira amabwiriza manini y'imyenda.",
        "Muri iki gihe, Isaac Manufacturing Center ifite itsinda rikura ry'abadozi bo mu karere, kandi iri shusho ry'ishema muri Gisagara, igaragaza ibyo gushora mu bumenyi n'ubuziranenge byazana ku bucuruzi bw'ubudozi mu Rwanda.",
      ],
    },
  },
  {
    slug: "rta-tvet-schools-partnership",
    image: "/images/news-tvet-graduation.jpg",
    category: { en: "NEWS", rw: "AMAKURU" },
    date: { en: "May 15, 2024", rw: "15 Gicurasi 2024" },
    title: {
      en: "RTA partners with TVET Schools to promote Tailoring Skills",
      rw: "RTA Ifatanyije n'Amashuri ya TVET Guteza Imbere Ubumenyi bw'Ubudozi",
    },
    excerpt: {
      en: "A new partnership with TVET schools across Rwanda brings certified tailoring curricula to hundreds of aspiring tailors.",
      rw: "Ubufatanye bushya n'amashuri ya TVET mu Rwanda hose buzana porogaramu y'ubudozi yemejwe ku bantu ibarirwa mu magana bifuza kuba abadozi.",
    },
    body: {
      en: [
        "Rwanda Tailors Association has signed a partnership with TVET schools across the country to promote tailoring as a certified, skills-based career path. The program embeds RTA's industry standards directly into the TVET curriculum.",
        "Graduates of the program receive a nationally recognised certificate and are automatically eligible for RTA membership, giving them immediate access to the association's network, business support services, and market linkages.",
        "The first cohort of graduates was celebrated at a ceremony attended by RTA leadership, TVET school administrators, and representatives from MINICOM and RDB, marking a major step toward formalising tailoring as a respected trade in Rwanda.",
      ],
      rw: [
        "Ishyirahamwe ry'Abadozi b'u Rwanda ryashyize umukono ku masezerano y'ubufatanye n'amashuri ya TVET mu gihugu hose kugira ngo ubudozi buzamurwe bube umwuga wemejwe kandi ushingiye ku bumenyi. Iyi gahunda ishyira ubuziranenge bwa RTA muri porogaramu y'inyigisho za TVET.",
        "Abarangije iyi porogaramu bahabwa impamyabushobozi yemewe n'igihugu, kandi bahabwa uburenganzira bwo kuba abanyamuryango ba RTA batinze, bikabaha uburyo bwo kwinjira mu muryango w'ishyirahamwe, serivisi zo gufasha mu bucuruzi, no guhuza n'amasoko.",
        "Itsinda rya mbere ry'abarangije ryizihijwe mu muhango witabiriwe n'abayobozi ba RTA, abayobozi b'amashuri ya TVET, n'intumwa za MINICOM na RDB, bigaragaza intambwe ikomeye yo gutuma ubudozi buba umwuga wubahwa mu Rwanda.",
      ],
    },
  },
  {
    slug: "national-tailors-exhibition-2024",
    image: "/images/gallery-model-outfit.jpg",
    category: { en: "EVENT", rw: "IGIKORWA" },
    date: { en: "June 20, 2024", rw: "20 Kamena 2024" },
    title: {
      en: "National Tailors Exhibition & Fashion Show 2024",
      rw: "Imurikagurisha ry'Igihugu ry'Abadozi n'Iserukiramyenda 2024",
    },
    excerpt: {
      en: "Members from all 30 districts showcased original designs at the annual National Tailors Exhibition & Fashion Show.",
      rw: "Abanyamuryango baturutse mu turere 30 bagaragaje imyenda bahimbye mu Murikagurisha ry'Igihugu ry'Abadozi n'Iserukiramyenda rikorwa buri mwaka.",
    },
    body: {
      en: [
        "The National Tailors Exhibition & Fashion Show brought together RTA members from all 30 districts to showcase original designs blending traditional Rwandan craftsmanship with contemporary fashion.",
        "Attendees browsed a marketplace of member-made garments and accessories, from tailored suits to hand-finished accessories, while a runway segment highlighted standout collections from the year's most innovative members.",
        "The event also served as a networking hub, connecting tailors with retailers, buyers, and fellow designers looking to collaborate on future collections.",
      ],
      rw: [
        "Imurikagurisha ry'Igihugu ry'Abadozi n'Iserukiramyenda ryahuje abanyamuryango ba RTA baturutse mu turere 30 twose kugira ngo bagaragaze imyenda bahimbye ihuza ubuhanzi gakondo bw'u Rwanda n'imideli igezweho.",
        "Abitabiriye iyi nama basuye isoko ry'imyenda n'ibikoresho byakozwe n'abanyamuryango, kuva ku makositimu kugeza ku bikoresho byambarwa byakozwe n'intoki, mu gihe iserukiramyenda ryagaragaje imyenda idasanzwe y'abanyamuryango banoze mu mwaka.",
        "Iki gikorwa cyanabaye ahantu ho guhuza abadozi n'abacuruzi, abaguzi, n'abandi banyabuhanga mu miterere bifuza gufatanya mu bikorwa bizaza.",
      ],
    },
  },
  {
    slug: "modern-tailoring-techniques-training",
    image: "/images/news-training-selfie.jpg",
    category: { en: "TRAINING", rw: "AMAHUGURWA" },
    date: { en: "April 28, 2024", rw: "28 Mata 2024" },
    title: {
      en: "New Training Program for Modern Tailoring Techniques",
      rw: "Porogaramu Nshya y'Amahugurwa ku Buhanga Bugezweho bw'Ubudozi",
    },
    excerpt: {
      en: "A fresh cohort of members completed hands-on training in modern tailoring techniques and business fundamentals.",
      rw: "Itsinda rishya ry'abanyamuryango ryarangije amahugurwa ku buhanga bugezweho bw'ubudozi n'ibanze by'ubucuruzi.",
    },
    body: {
      en: [
        "RTA's latest training program equipped members with modern tailoring techniques, covering pattern digitisation, industrial machine maintenance, and finishing methods used in export-quality garment production.",
        "Beyond technical skills, the program included modules on pricing, customer service, and basic bookkeeping to help members run more sustainable businesses.",
        "Participants who complete the program join a growing group of RTA-certified trainers who go on to mentor new members in their home districts.",
      ],
      rw: [
        "Porogaramu nshya y'amahugurwa ya RTA yahaye abanyamuryango ubumenyi bw'uburyo bugezweho bw'ubudozi, harimo guhindura ibipimo mu buryo bwa mudasobwa, kubungabunga imashini z'inganda, n'uburyo bwo kurangiza imyenda mu buziranenge bwo kohereza hanze.",
        "Uretse ubumenyi bw'ikoranabuhanga, iyi porogaramu yarimo n'ibice byigisha gushyiraho ibiciro, gufasha abakiriya, no kubika amakuru y'ibaruramari mu buryo bworoshye kugira ngo abanyamuryango bacunge neza ubucuruzi bwabo.",
        "Abitabiriye barangije iyi porogaramu binjira mu itsinda rikura ry'abarimu bemejwe na RTA bagakomeza kuyobora abanyamuryango bashya mu turere basanzwemo.",
      ],
    },
  },
];

export const EVENTS: EventItem[] = [
  {
    day: "22",
    month: { en: "MAY", rw: "GIC" },
    title: { en: "Advanced Fashion Design Workshop", rw: "Inama y'Amahugurwa Yisumbuye mu Mideli" },
    location: { en: "Kigali, Nyarugenge", rw: "Kigali, Nyarugenge" },
  },
  {
    day: "18",
    month: { en: "JUN", rw: "KAM" },
    title: { en: "National Tailors Exhibition 2024", rw: "Imurikagurisha ry'Igihugu ry'Abadozi 2024" },
    location: { en: "Kigali Convention Centre", rw: "Kigali Convention Centre" },
  },
  {
    day: "09",
    month: { en: "JUL", rw: "NYA" },
    title: { en: "Business Management Training", rw: "Amahugurwa yo Gucunga Ubucuruzi" },
    location: { en: "Online Webinar", rw: "Ikiganiro kuri Interineti" },
  },
  {
    day: "25",
    month: { en: "AUG", rw: "KAN" },
    title: { en: "Traditional Clothing Competition", rw: "Amarushanwa y'Imyenda Gakondo" },
    location: { en: "Huye, Huye District", rw: "Huye, Akarere ka Huye" },
  },
];

export const GALLERY: GalleryItem[] = [
  {
    image: "/images/gallery-robe.jpg",
    alt: {
      en: "Handcrafted striped robe on a mannequin",
      rw: "Umwenda w'imirongo wakozwe n'intoki ku gishushanyo cy'umuntu",
    },
  },
  {
    image: "/images/gallery-dress.jpg",
    alt: {
      en: "Patterned dress with pockets on a mannequin",
      rw: "Ikanzu ifite ibishushanyo n'imifuka ku gishushanyo cy'umuntu",
    },
  },
  {
    image: "/images/gallery-kimono.jpg",
    alt: {
      en: "Block-print kimono jacket on a mannequin",
      rw: "Ikote rya kimono rifite ibishushanyo ku gishushanyo cy'umuntu",
    },
  },
  {
    image: "/images/gallery-vest.jpg",
    alt: { en: "Multi-pocket utility vest", rw: "Ijaketi ifite imifuka myinshi" },
  },
  {
    image: "/images/gallery-earrings.jpg",
    alt: {
      en: "Handmade fabric earrings",
      rw: "Impete z'amatwi zakozwe mu mwenda n'intoki",
    },
  },
  {
    image: "/images/gallery-headbands.jpg",
    alt: { en: "Colorful printed headbands", rw: "Imisipi y'umutwe ifite amabara menshi" },
  },
  {
    image: "/images/gallery-scrunchies.jpg",
    alt: {
      en: "Assorted fabric scrunchies",
      rw: "Uduce tw'umwenda two gucunga umusatsi tw'amoko atandukanye",
    },
  },
  {
    image: "/images/gallery-curtains.png",
    alt: {
      en: "Textured curtain panels with a sheer lace centre drape",
      rw: "Amarido y'umwenda w'ikawa afite umwenda woroshye w'amashashi hagati",
    },
  },
  {
    image: "/images/gallery-moses-basket.png",
    alt: {
      en: "Ruffled lace moses basket with a bow trim",
      rw: "Agatebo k'umwana gafite imigenurano n'akamenyetso k'umuhundo",
    },
  },
  {
    image: "/images/gallery-baby-bedding-pink.png",
    alt: {
      en: "Pink crib bedding set embroidered with butterflies",
      rw: "Imyenda y'igitanda cy'umwana y'ibara ry'ipinki idozwe uduhurabwenge",
    },
  },
  {
    image: "/images/gallery-baby-bedding-blue.png",
    alt: {
      en: "Blue crib bedding set with a sheer canopy drape",
      rw: "Imyenda y'igitanda cy'umwana y'ibara ry'ubururu ifite igitambaro cyoroshye hejuru",
    },
  },
  {
    image: "/images/gallery-bedding-teal.png",
    alt: {
      en: "Teal and white bedroom linen with a ruffled bed skirt",
      rw: "Imyenda y'igitanda y'ibara ry'ubururu n'umweru ifite umupfundikizo w'imigenurano",
    },
  },
  {
    image: "/images/gallery-bedding-white-ruffle.png",
    alt: {
      en: "White ruffled comforter set with pillow shams",
      rw: "Imyenda y'igitanda y'umweru ifite imigenurano n'imisego",
    },
  },
  {
    image: "/images/gallery-table-linen.png",
    alt: {
      en: "Embroidered table linen set with matching placemats",
      rw: "Imyenda y'ameza idozwe hamwe n'ibipfukisho by'ameza bihuye",
    },
  },
];

export const TESTIMONIALS: Testimonial[] = [
  {
    name: "Nshimiyimana Daniel",
    role: { en: "Chairman, RTA", rw: "Umuyobozi w'Inama y'Ubutegetsi, RTA" },
    image: "/images/president-daniel.jpg",
    quote: {
      en: "RTA brings tailors together and gives us a strong, united voice to grow the industry across Rwanda.",
      rw: "RTA ihuza abadozi kandi ituma dufite ijwi rikomeye kandi rihuriweho mu iterambere ry'inganda mu Rwanda hose.",
    },
  },
  {
    name: "Munezero Seleman Clementine",
    role: { en: "Vice Chairman, RTA", rw: "Visi Perezida w'Inama y'Ubutegetsi, RTA" },
    image: "/images/vice-president-clementine.jpg",
    quote: {
      en: "RTA has helped my business grow through training, exposure and networking. I am proud to be a member.",
      rw: "RTA yafashije ubucuruzi bwanjye gukura binyuze mu mahugurwa, kumenyekana no guhuza n'abandi. Nishimira kuba umunyamuryango.",
    },
  },
];

export const FOOTER_LINKS: FooterLinkGroup[] = [
  {
    title: { en: "Quick Links", rw: "Amahuza Yihuse" },
    links: [
      { label: { en: "Home", rw: "Ahabanza" }, href: "/#home" },
      { label: { en: "About Us", rw: "Abo Turi Bo" }, href: "/#about" },
      { label: { en: "Services", rw: "Serivisi" }, href: "/#services" },
      { label: { en: "Membership", rw: "Ubunyamuryango" }, href: "/#why-join" },
      { label: { en: "News", rw: "Amakuru" }, href: "/news" },
      { label: { en: "Contact", rw: "Twandikire" }, href: "/#contact" },
    ],
  },
  {
    title: { en: "Services", rw: "Serivisi" },
    links: [
      { label: { en: "Business Development", rw: "Iterambere ry'Ubucuruzi" }, href: "/#services" },
      { label: { en: "Capacity Building", rw: "Kongera Ubushobozi" }, href: "/#services" },
      { label: { en: "Access to Finance", rw: "Kubona Inguzanyo" }, href: "/#services" },
      { label: { en: "Marketing Support", rw: "Ubufasha mu Kwamamaza" }, href: "/#services" },
      { label: { en: "Market Access", rw: "Kwinjira ku Isoko" }, href: "/#services" },
      { label: { en: "Networking", rw: "Guhuza Abadozi" }, href: "/#services" },
    ],
  },
  {
    title: { en: "Resources", rw: "Ibikoresho" },
    links: [
      { label: { en: "Training Programs", rw: "Amahugurwa" }, href: "/#services" },
      { label: { en: "Guidelines", rw: "Amabwiriza" }, href: "#" },
      { label: { en: "Forms & Documents", rw: "Impapuro n'Inyandiko" }, href: "#" },
      { label: { en: "Opportunities", rw: "Amahirwe" }, href: "#" },
      { label: { en: "Downloads", rw: "Gukuramo Inyandiko" }, href: "#" },
      { label: { en: "FAQ", rw: "Ibibazo Bikunze Kubazwa" }, href: "#" },
    ],
  },
];
