const SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces'
] as const;

const LANGUAGES = ['tr', 'en'] as const;

type Sign = (typeof SIGNS)[number];
type Language = (typeof LANGUAGES)[number];
type Element = 'fire' | 'earth' | 'air' | 'water';
type Modality = 'cardinal' | 'fixed' | 'mutable';
type LocalizedPair = Record<Language, readonly [string, string]>;
type LocalizedList = Record<Language, readonly string[]>;

type SignProfile = {
  element: Element;
  modality: Modality;
  planet: Record<Language, string>;
  strengths: LocalizedPair;
  weaknesses: LocalizedPair;
  careerFit: LocalizedPair;
  idealPartners: readonly [Sign, Sign];
  color: Record<Language, string>;
  stone: Record<Language, string>;
  focus: Record<Language, string>;
};

export type ContentSeedUpload = {
  key: string;
  payload: object;
};

export type ContentSeedOptions = {
  seedDate?: string;
  dailyDays?: number;
  skipStaticContent?: boolean;
};

type ContentSeedMetadata = {
  content_version: 'seed-v2';
  generated_at: string;
  calculation_version: 'deterministic-profile-v1';
  editorial_status: 'generated_quality_checked';
  source_signals: string[];
};

const SIGN_LABELS: Record<Language, Record<Sign, string>> = {
  tr: {
    aries: 'Koç',
    taurus: 'Boğa',
    gemini: 'İkizler',
    cancer: 'Yengeç',
    leo: 'Aslan',
    virgo: 'Başak',
    libra: 'Terazi',
    scorpio: 'Akrep',
    sagittarius: 'Yay',
    capricorn: 'Oğlak',
    aquarius: 'Kova',
    pisces: 'Balık'
  },
  en: {
    aries: 'Aries',
    taurus: 'Taurus',
    gemini: 'Gemini',
    cancer: 'Cancer',
    leo: 'Leo',
    virgo: 'Virgo',
    libra: 'Libra',
    scorpio: 'Scorpio',
    sagittarius: 'Sagittarius',
    capricorn: 'Capricorn',
    aquarius: 'Aquarius',
    pisces: 'Pisces'
  }
};

const SIGN_PROFILES: Record<Sign, SignProfile> = {
  aries: {
    element: 'fire',
    modality: 'cardinal',
    planet: { tr: 'Mars', en: 'Mars' },
    strengths: { tr: ['Cesaret', 'İnisiyatif'], en: ['Courage', 'Initiative'] },
    weaknesses: { tr: ['Sabırsızlık', 'Acelecilik'], en: ['Impatience', 'Rushing'] },
    careerFit: { tr: ['Girişimcilik', 'Saha liderliği'], en: ['Entrepreneurship', 'Field leadership'] },
    idealPartners: ['leo', 'sagittarius'],
    color: { tr: 'Kırmızı', en: 'Red' },
    stone: { tr: 'Yakut', en: 'Ruby' },
    focus: { tr: 'cesur ama ölçülü bir başlangıç', en: 'a bold but measured beginning' }
  },
  taurus: {
    element: 'earth',
    modality: 'fixed',
    planet: { tr: 'Venüs', en: 'Venus' },
    strengths: { tr: ['İstikrar', 'Güvenilirlik'], en: ['Stability', 'Reliability'] },
    weaknesses: { tr: ['İnatçılık', 'Değişime direnç'], en: ['Stubbornness', 'Resistance to change'] },
    careerFit: { tr: ['Finans', 'Tasarım'], en: ['Finance', 'Design'] },
    idealPartners: ['virgo', 'capricorn'],
    color: { tr: 'Zümrüt yeşili', en: 'Emerald green' },
    stone: { tr: 'Zümrüt', en: 'Emerald' },
    focus: { tr: 'kalıcı ve somut ilerleme', en: 'steady, tangible progress' }
  },
  gemini: {
    element: 'air',
    modality: 'mutable',
    planet: { tr: 'Merkür', en: 'Mercury' },
    strengths: { tr: ['Merak', 'Uyum sağlama'], en: ['Curiosity', 'Adaptability'] },
    weaknesses: { tr: ['Dağınıklık', 'Kararsızlık'], en: ['Scattered focus', 'Indecision'] },
    careerFit: { tr: ['İletişim', 'Ürün geliştirme'], en: ['Communication', 'Product development'] },
    idealPartners: ['libra', 'aquarius'],
    color: { tr: 'Sarı', en: 'Yellow' },
    stone: { tr: 'Akik', en: 'Agate' },
    focus: { tr: 'netleştirilmiş fikir alışverişi', en: 'clear, lively exchange of ideas' }
  },
  cancer: {
    element: 'water',
    modality: 'cardinal',
    planet: { tr: 'Ay', en: 'Moon' },
    strengths: { tr: ['Sezgi', 'Koruyuculuk'], en: ['Intuition', 'Nurturing'] },
    weaknesses: { tr: ['Alınganlık', 'İçe kapanma'], en: ['Sensitivity', 'Withdrawal'] },
    careerFit: { tr: ['Danışmanlık', 'Konaklama'], en: ['Counseling', 'Hospitality'] },
    idealPartners: ['scorpio', 'pisces'],
    color: { tr: 'Gümüş', en: 'Silver' },
    stone: { tr: 'Ay taşı', en: 'Moonstone' },
    focus: { tr: 'duygusal güven ve sağlıklı sınırlar', en: 'emotional safety and healthy boundaries' }
  },
  leo: {
    element: 'fire',
    modality: 'fixed',
    planet: { tr: 'Güneş', en: 'Sun' },
    strengths: { tr: ['Yaratıcılık', 'Özgüven'], en: ['Creativity', 'Confidence'] },
    weaknesses: { tr: ['Gurur', 'Onay ihtiyacı'], en: ['Pride', 'Need for approval'] },
    careerFit: { tr: ['Sahne sanatları', 'Yönetim'], en: ['Performing arts', 'Management'] },
    idealPartners: ['aries', 'sagittarius'],
    color: { tr: 'Altın', en: 'Gold' },
    stone: { tr: 'Sitrin', en: 'Citrine' },
    focus: { tr: 'görünür ama cömert liderlik', en: 'visible, generous leadership' }
  },
  virgo: {
    element: 'earth',
    modality: 'mutable',
    planet: { tr: 'Merkür', en: 'Mercury' },
    strengths: { tr: ['Analiz', 'Titizlik'], en: ['Analysis', 'Precision'] },
    weaknesses: { tr: ['Aşırı eleştiri', 'Mükemmeliyetçilik'], en: ['Overcriticism', 'Perfectionism'] },
    careerFit: { tr: ['Veri analizi', 'Sağlık hizmetleri'], en: ['Data analysis', 'Healthcare'] },
    idealPartners: ['taurus', 'capricorn'],
    color: { tr: 'Zeytin yeşili', en: 'Olive green' },
    stone: { tr: 'Safir', en: 'Sapphire' },
    focus: { tr: 'küçük ayrıntılarla büyük iyileşme', en: 'meaningful improvement through small details' }
  },
  libra: {
    element: 'air',
    modality: 'cardinal',
    planet: { tr: 'Venüs', en: 'Venus' },
    strengths: { tr: ['Diplomasi', 'Adalet duygusu'], en: ['Diplomacy', 'Sense of fairness'] },
    weaknesses: { tr: ['Karar erteleme', 'Çatışmadan kaçınma'], en: ['Delayed decisions', 'Conflict avoidance'] },
    careerFit: { tr: ['Hukuk', 'Marka yönetimi'], en: ['Law', 'Brand management'] },
    idealPartners: ['gemini', 'aquarius'],
    color: { tr: 'Pudra pembe', en: 'Soft pink' },
    stone: { tr: 'Pembe kuvars', en: 'Rose quartz' },
    focus: { tr: 'adil bir denge ve açık uzlaşma', en: 'fair balance and open compromise' }
  },
  scorpio: {
    element: 'water',
    modality: 'fixed',
    planet: { tr: 'Plüton', en: 'Pluto' },
    strengths: { tr: ['Derinlik', 'Kararlılık'], en: ['Depth', 'Determination'] },
    weaknesses: { tr: ['Kontrol ihtiyacı', 'Kuşku'], en: ['Need for control', 'Suspicion'] },
    careerFit: { tr: ['Araştırma', 'Psikoloji'], en: ['Research', 'Psychology'] },
    idealPartners: ['cancer', 'pisces'],
    color: { tr: 'Bordo', en: 'Burgundy' },
    stone: { tr: 'Obsidyen', en: 'Obsidian' },
    focus: { tr: 'dürüst dönüşüm ve duygusal derinlik', en: 'honest transformation and emotional depth' }
  },
  sagittarius: {
    element: 'fire',
    modality: 'mutable',
    planet: { tr: 'Jüpiter', en: 'Jupiter' },
    strengths: { tr: ['İyimserlik', 'Keşif ruhu'], en: ['Optimism', 'Adventurous spirit'] },
    weaknesses: { tr: ['Aşırı söz verme', 'Sabırsız özgürlük arayışı'], en: ['Overpromising', 'Restless freedom seeking'] },
    careerFit: { tr: ['Eğitim', 'Uluslararası işler'], en: ['Education', 'International business'] },
    idealPartners: ['aries', 'leo'],
    color: { tr: 'Mor', en: 'Purple' },
    stone: { tr: 'Turkuaz', en: 'Turquoise' },
    focus: { tr: 'ufku genişleten gerçekçi bir adım', en: 'a realistic step that widens your horizon' }
  },
  capricorn: {
    element: 'earth',
    modality: 'cardinal',
    planet: { tr: 'Satürn', en: 'Saturn' },
    strengths: { tr: ['Disiplin', 'Strateji'], en: ['Discipline', 'Strategy'] },
    weaknesses: { tr: ['Katılık', 'Aşırı sorumluluk'], en: ['Rigidity', 'Over-responsibility'] },
    careerFit: { tr: ['Operasyon', 'Kurumsal liderlik'], en: ['Operations', 'Executive leadership'] },
    idealPartners: ['taurus', 'virgo'],
    color: { tr: 'Lacivert', en: 'Navy' },
    stone: { tr: 'Oniks', en: 'Onyx' },
    focus: { tr: 'uzun vadeli ve ölçülebilir bir hedef', en: 'a measurable long-term objective' }
  },
  aquarius: {
    element: 'air',
    modality: 'fixed',
    planet: { tr: 'Uranüs', en: 'Uranus' },
    strengths: { tr: ['Özgünlük', 'Toplumsal bakış'], en: ['Originality', 'Community vision'] },
    weaknesses: { tr: ['Mesafe', 'İnatçı bağımsızlık'], en: ['Detachment', 'Rigid independence'] },
    careerFit: { tr: ['Teknoloji', 'Sosyal inovasyon'], en: ['Technology', 'Social innovation'] },
    idealPartners: ['gemini', 'libra'],
    color: { tr: 'Elektrik mavisi', en: 'Electric blue' },
    stone: { tr: 'Ametist', en: 'Amethyst' },
    focus: { tr: 'özgün bir çözümü toplulukla paylaşma', en: 'sharing an original solution with others' }
  },
  pisces: {
    element: 'water',
    modality: 'mutable',
    planet: { tr: 'Neptün', en: 'Neptune' },
    strengths: { tr: ['Empati', 'Hayal gücü'], en: ['Empathy', 'Imagination'] },
    weaknesses: { tr: ['Sınır koyamama', 'Kaçış eğilimi'], en: ['Weak boundaries', 'Escapism'] },
    careerFit: { tr: ['Yaratıcı sanatlar', 'Sosyal hizmet'], en: ['Creative arts', 'Social care'] },
    idealPartners: ['cancer', 'scorpio'],
    color: { tr: 'Deniz yeşili', en: 'Sea green' },
    stone: { tr: 'Akuamarin', en: 'Aquamarine' },
    focus: { tr: 'sezgiyi somut bir adıma dönüştürme', en: 'turning intuition into a concrete step' }
  }
};

const DAILY_OPENINGS: LocalizedList = {
  tr: [
    'Bugün odağını sadeleştirdiğinde ilerleme hızlanıyor.',
    'Günün ritmi, acele etmek yerine doğru anı seçmeni destekliyor.',
    'Küçük ama net bir karar günün geri kalanını toparlayabilir.',
    'Enerjini tek bir öncelikte toplamak belirgin sonuç getiriyor.',
    'Bugün merakını eyleme dönüştürmek için uygun bir alan açılıyor.',
    'Eski bir konuyu farklı bir açıdan ele almak rahatlama sağlayabilir.'
  ],
  en: [
    'Progress accelerates when you simplify your focus today.',
    'The day rewards timing and intention more than speed.',
    'One clear decision can organize the rest of your day.',
    'Concentrating your energy on one priority brings visible results.',
    'A useful opening appears when curiosity turns into action.',
    'A familiar issue feels lighter when viewed from a new angle.'
  ]
};

const LOVE_GUIDANCE: LocalizedList = {
  tr: [
    'Varsayım yapmak yerine açık bir soru sormak yakınlığı güçlendirir.',
    'Duyguyu adlandırmak, gereksiz gerilimin önüne geçebilir.',
    'Karşı tarafı düzeltmeden dinlemek ilişkinin tonunu yumuşatır.',
    'İhtiyacını kısa ve doğrudan anlatmak bugün daha iyi karşılık bulur.'
  ],
  en: [
    'Ask a direct question instead of relying on assumptions.',
    'Naming the feeling can prevent unnecessary tension.',
    'Listening without trying to fix everything softens the connection.',
    'A concise, honest request is more likely to be understood today.'
  ]
};

const CAREER_GUIDANCE: LocalizedList = {
  tr: [
    'En önemli işi ilk enerji diliminde tamamlamaya çalış.',
    'Bir kararın ölçütlerini yazmak seçenekleri netleştirir.',
    'Görünür ilerleme için küçük bir teslim noktası belirle.',
    'Geri bildirim istemek, kör noktayı hızlıca azaltabilir.'
  ],
  en: [
    'Use your first high-energy window for the most important task.',
    'Writing down decision criteria makes the options clearer.',
    'Define one small deliverable that creates visible progress.',
    'Requesting feedback can quickly reduce a blind spot.'
  ]
};

const MONEY_GUIDANCE: LocalizedList = {
  tr: [
    'İstek ile ihtiyaç arasındaki farkı netleştirmek bütçeyi korur.',
    'Tekrarlayan küçük bir harcamayı gözden geçirmek fayda sağlayabilir.',
    'Yeni fırsatı değerlendirirken toplam maliyeti hesaba kat.',
    'Bugün hızlı kazanç yerine sürdürülebilir değere odaklan.'
  ],
  en: [
    'Clarifying wants versus needs protects your budget.',
    'Reviewing one recurring expense may reveal an easy improvement.',
    'Consider the total cost before committing to a new opportunity.',
    'Favor sustainable value over the promise of a quick gain.'
  ]
};

const HEALTH_GUIDANCE: LocalizedList = {
  tr: [
    'Kısa yürüyüşler ve düzenli su molaları ritmini dengeler.',
    'Ekran arası vermek zihinsel yorgunluğu azaltabilir.',
    'Uyku saatini korumak günün dalgalı enerjisini dengeler.',
    'Bedendeki gerginliği fark edip tempoyu kısa süreli düşür.'
  ],
  en: [
    'Short walks and regular water breaks help regulate your pace.',
    'A screen break may reduce mental fatigue.',
    'Protecting your sleep window steadies uneven energy.',
    'Notice physical tension and briefly lower the pace.'
  ]
};

function parseSeedDate(seedDate?: string): Date {
  if (!seedDate) {
    return new Date();
  }

  const parsed = new Date(`${seedDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid SEED_DATE: ${seedDate}`);
  }

  return parsed;
}

function parseDailyDays(dailyDays?: number): number {
  if (dailyDays === undefined) {
    return 0;
  }

  if (!Number.isInteger(dailyDays) || dailyDays < 1) {
    throw new Error('SEED_DAILY_DAYS must be a positive integer');
  }

  return dailyDays;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function formatMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

  return {
    start: formatIsoDate(start),
    end: formatIsoDate(end)
  };
}

function getWeekInfo(date: Date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const weekId = `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  const weekStart = addDays(target, -3);
  const weekEnd = addDays(weekStart, 6);

  return {
    weekId,
    weekStart: formatIsoDate(weekStart),
    weekEnd: formatIsoDate(weekEnd)
  };
}

function signName(sign: Sign, language: Language): string {
  return SIGN_LABELS[language][sign];
}

function contentMetadata(generatedAt: string, sourceSignals: string[]): ContentSeedMetadata {
  return {
    content_version: 'seed-v2',
    generated_at: generatedAt,
    calculation_version: 'deterministic-profile-v1',
    editorial_status: 'generated_quality_checked',
    source_signals: sourceSignals
  };
}

function localizedLower(value: string, language: Language): string {
  return value.toLocaleLowerCase(language === 'tr' ? 'tr-TR' : 'en-US');
}

function elementName(element: Element, language: Language): string {
  const labels: Record<Language, Record<Element, string>> = {
    tr: { fire: 'ateş', earth: 'toprak', air: 'hava', water: 'su' },
    en: { fire: 'fire', earth: 'earth', air: 'air', water: 'water' }
  };
  return labels[language][element];
}

function modalityName(modality: Modality, language: Language): string {
  const labels: Record<Language, Record<Modality, string>> = {
    tr: { cardinal: 'öncü', fixed: 'sabit', mutable: 'değişken' },
    en: { cardinal: 'cardinal', fixed: 'fixed', mutable: 'mutable' }
  };
  return labels[language][modality];
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function select<T>(items: readonly T[], seed: number, offset = 0): T {
  return items[(seed + offset) % items.length];
}

function score(seed: number, minimum: number, span: number): number {
  return minimum + (seed % span);
}

function clampScore(value: number): number {
  return Math.max(42, Math.min(94, value));
}

function dailyEntry(sign: Sign, language: Language, isoDate: string) {
  const profile = SIGN_PROFILES[sign];
  const name = signName(sign, language);
  const seed = stableHash(`${isoDate}:${sign}`);
  const opening = select(DAILY_OPENINGS[language], seed);
  const focus = profile.focus[language];

  return {
    short:
      language === 'tr'
        ? `${name}: ${opening} Ana tema: ${focus}.`
        : `${name}: ${opening} Focus: ${focus}.`,
    full:
      language === 'tr'
        ? `${name} için günün ana teması ${focus}. Önceliğini görünür hale getir, gereksiz yükü azalt ve gün sonunda neyin gerçekten ilerlediğini kısa bir notla değerlendir.`
        : `For ${name}, the central theme is ${focus}. Make the priority visible, reduce unnecessary load, and note what genuinely moved forward by the end of the day.`,
    love: select(LOVE_GUIDANCE[language], seed, 1),
    career: select(CAREER_GUIDANCE[language], seed, 2),
    money: select(MONEY_GUIDANCE[language], seed, 3),
    health: select(HEALTH_GUIDANCE[language], seed, 4),
    lucky_number: score(seed >>> 3, 1, 9),
    lucky_color: profile.color[language],
    energy: score(seed >>> 5, 58, 35),
    love_score: score(seed >>> 7, 54, 39),
    career_score: score(seed >>> 9, 56, 37),
    money_score: score(seed >>> 11, 52, 38),
    health_score: score(seed >>> 13, 55, 36),
    daily_tip:
      language === 'tr'
        ? `Bugün ${focus} için on beş dakikalık tek bir somut adım belirle.`
        : `Choose one concrete fifteen-minute action for ${focus} today.`
  };
}

function weeklyEntry(sign: Sign, language: Language, weekId: string) {
  const name = signName(sign, language);
  const focus = SIGN_PROFILES[sign].focus[language];
  const seed = stableHash(`${weekId}:${sign}`);
  const bestDays = language === 'tr'
    ? ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return {
    summary:
      language === 'tr'
        ? `${name} için bu haftanın odağı ${focus}. Haftanın başında yön belirlemek, ikinci yarıda daha rahat hareket etmeni sağlayabilir.`
        : `${name}'s weekly focus is ${focus}. Setting direction early can create more freedom later in the week.`,
    love: select(LOVE_GUIDANCE[language], seed, 1),
    career: select(CAREER_GUIDANCE[language], seed, 2),
    money: select(MONEY_GUIDANCE[language], seed, 3),
    best_day: select(bestDays, seed, 4),
    warning:
      language === 'tr'
        ? `${localizedLower(SIGN_PROFILES[sign].weaknesses.tr[0], 'tr')} eğilimi yükseldiğinde karar vermeden önce kısa bir ara ver.`
        : `Pause briefly before deciding when ${localizedLower(SIGN_PROFILES[sign].weaknesses.en[0], 'en')} becomes noticeable.`
  };
}

function monthlyEntry(sign: Sign, language: Language, month: string) {
  const name = signName(sign, language);
  const profile = SIGN_PROFILES[sign];
  const seed = stableHash(`${month}:${sign}`);
  const bestDays = language === 'tr'
    ? ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Pazar']
    : ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Sunday'];

  return {
    summary:
      language === 'tr'
        ? `${name} bu ay ${profile.focus.tr} temasını öne çıkarıyor. Kalıcı ilerleme, büyük bir sıçramadan çok düzenli seçimlerle gelecek.`
        : `${name} emphasizes ${profile.focus.en} this month. Durable progress comes from consistent choices rather than one dramatic leap.`,
    love: select(LOVE_GUIDANCE[language], seed, 2),
    career:
      language === 'tr'
        ? `${profile.careerFit.tr[0]} ve ${profile.careerFit.tr[1]} becerilerini kullandığın alanlarda görünür ilerleme mümkün.`
        : `Visible progress is possible where you use strengths related to ${profile.careerFit.en[0].toLowerCase()} and ${profile.careerFit.en[1].toLowerCase()}.`,
    money: select(MONEY_GUIDANCE[language], seed, 3),
    best_day: select(bestDays, seed, 4),
    warning:
      language === 'tr'
        ? `${localizedLower(profile.weaknesses.tr[1], 'tr')} kararlarını gereğinden fazla etkilerse hedefi daha küçük parçalara böl.`
        : `Break the goal into smaller parts if ${localizedLower(profile.weaknesses.en[1], 'en')} starts shaping decisions too strongly.`
  };
}

function elementAffinity(first: Element, second: Element): number {
  if (first === second) return 8;
  const pair = [first, second].sort().join(':');
  if (pair === 'air:fire' || pair === 'earth:water') return 10;
  if (pair === 'fire:water') return -4;
  if (pair === 'air:earth') return -3;
  return 2;
}

function compatibilityScores(sign1: Sign, sign2: Sign) {
  const [first, second] = [sign1, sign2].sort() as [Sign, Sign];
  const profile1 = SIGN_PROFILES[first];
  const profile2 = SIGN_PROFILES[second];
  const affinity = elementAffinity(profile1.element, profile2.element);
  const modality = profile1.modality === profile2.modality ? -2 : 3;
  const sameSign = first === second ? 5 : 0;
  const base = 65 + affinity + modality + sameSign;
  const pairKey = `${first}:${second}`;
  const love = clampScore(base + (stableHash(`${pairKey}:love`) % 15) - 7);
  const friendship = clampScore(base + (stableHash(`${pairKey}:friendship`) % 17) - 8);
  const work = clampScore(base + (stableHash(`${pairKey}:work`) % 19) - 9);
  const overall = Math.round((love + friendship + work) / 3);

  return { overall, love, friendship, work };
}

function compatibilityEntry(sign1: Sign, sign2: Sign, language: Language) {
  const profile1 = SIGN_PROFILES[sign1];
  const profile2 = SIGN_PROFILES[sign2];
  const pairLabel = language === 'tr'
    ? `${signName(sign1, language)} ve ${signName(sign2, language)}`
    : `${signName(sign1, language)} and ${signName(sign2, language)}`;
  const scores = compatibilityScores(sign1, sign2);
  const sharedElement = profile1.element === profile2.element;
  const sharedModality = profile1.modality === profile2.modality;

  const strengths = language === 'tr'
    ? [
        sharedElement ? 'Benzer motivasyon dili' : 'Farklı bakış açılarını birleştirme',
        sharedModality ? 'Ortak tempo ve kararlılık' : 'Birbirini tamamlayan hareket biçimi'
      ]
    : [
        sharedElement ? 'A familiar motivational language' : 'Combining different perspectives',
        sharedModality ? 'Shared pace and determination' : 'Complementary ways of taking action'
      ];
  const challenges = language === 'tr'
    ? [
        `${localizedLower(profile1.weaknesses.tr[0], 'tr')} ile ${localizedLower(profile2.weaknesses.tr[0], 'tr')} arasında gerilim`,
        sharedModality ? 'İki tarafın da aynı anda yön vermek istemesi' : 'Karar hızını eşitleme ihtiyacı'
      ]
    : [
        `Tension between ${localizedLower(profile1.weaknesses.en[0], 'en')} and ${localizedLower(profile2.weaknesses.en[0], 'en')}`,
        sharedModality ? 'Both partners trying to set direction at once' : 'Aligning different decision speeds'
      ];

  return {
    sign1,
    sign2,
    language,
    overall_score: scores.overall,
    love_score: scores.love,
    friendship_score: scores.friendship,
    work_score: scores.work,
    summary:
      language === 'tr'
        ? `${pairLabel}, güçlü yanlarını bilinçli kullandığında dengeli bir bağ kurabilir. Uyumun kalitesi, farklı ihtiyaçları açıkça konuşabilmelerine bağlı.`
        : `${pairLabel} can build a balanced connection when both use their strengths intentionally. The quality of the match depends on discussing different needs openly.`,
    strengths,
    challenges,
    advice:
      language === 'tr'
        ? `Haftada bir kez beklentileri, sınırları ve ortak önceliği açıkça konuşmak ${pairLabel} arasındaki güveni güçlendirir.`
        : `A weekly conversation about expectations, boundaries, and one shared priority can strengthen trust between ${pairLabel}.`,
    famous_couples: []
  };
}

function personalityEntry(sign: Sign, language: Language) {
  const name = signName(sign, language);
  const profile = SIGN_PROFILES[sign];

  return {
    sign,
    language,
    title: language === 'tr' ? `${name} Burcu Kişilik Analizi` : `${name} Personality Analysis`,
    summary:
      language === 'tr'
        ? `${name}; ${localizedLower(profile.strengths.tr[0], 'tr')} ve ${localizedLower(profile.strengths.tr[1], 'tr')} yönleriyle öne çıkar. Denge, ${localizedLower(profile.weaknesses.tr[0], 'tr')} eğilimini fark etmekle güçlenir.`
        : `${name} often stands out through ${localizedLower(profile.strengths.en[0], 'en')} and ${localizedLower(profile.strengths.en[1], 'en')}. Balance improves by noticing patterns of ${localizedLower(profile.weaknesses.en[0], 'en')}.`,
    deep_analysis:
      language === 'tr'
        ? `${profile.planet.tr} yönetimindeki ${name}, ${elementName(profile.element, 'tr')} elementinin doğasını ${modalityName(profile.modality, 'tr')} nitelikle ifade eder. En güçlü gelişim alanı, ${profile.focus.tr} temasını günlük kararlarla sürdürülebilir hale getirmektir.`
        : `Ruled by ${profile.planet.en}, ${name} expresses the ${elementName(profile.element, 'en')} element through a ${modalityName(profile.modality, 'en')} mode. The central growth task is making ${profile.focus.en} sustainable through everyday decisions.`,
    strengths: [...profile.strengths[language]],
    weaknesses: [...profile.weaknesses[language]],
    ideal_partners: [...profile.idealPartners],
    career_fit: [...profile.careerFit[language]],
    element: elementName(profile.element, language),
    planet: profile.planet[language],
    color: profile.color[language],
    stone: profile.stone[language]
  };
}

function buildDailyDates(baseDate: Date, dailyDays: number): Date[] {
  if (dailyDays > 0) {
    return Array.from({ length: dailyDays }, (_, index) => addDays(baseDate, index));
  }

  return [-1, 0, 1].map((offset) => addDays(baseDate, offset));
}


const PLACEHOLDER_PATTERNS = [
  /inspirational couple/i,
  /ilham verici çift/i,
  /premium daily analysis/i,
  /premium günlük analiz/i,
  /lorem ipsum/i,
  /\bTODO\b/i
] as const;

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
  }
  return [];
}

export function assertSeedQuality(uploads: ContentSeedUpload[]): void {
  const compatibilitySignatures = new Set<string>();
  const personalitySignatures = new Set<string>();

  for (const upload of uploads) {
    const strings = collectStrings(upload.payload);
    const placeholder = strings.find((value) => PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value)));
    if (placeholder) {
      throw new Error(`Seed quality rejected placeholder copy in ${upload.key}`);
    }

    const payload = upload.payload as Record<string, unknown>;
    if (upload.key.startsWith('content/daily/')) {
      const signs = payload.signs as Record<string, { short?: unknown }> | undefined;
      const summaries = Object.values(signs ?? {})
        .map((entry) => entry.short)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      if (summaries.length < 8 || new Set(summaries).size < 8) {
        throw new Error(`Seed quality requires at least 8 unique daily summaries in ${upload.key}`);
      }
    }

    if (upload.key.startsWith('content/compat/')) {
      compatibilitySignatures.add(
        [payload.overall_score, payload.love_score, payload.friendship_score, payload.work_score].join(':')
      );
    }

    if (upload.key.startsWith('content/personality/')) {
      personalitySignatures.add(JSON.stringify(payload.strengths ?? []));
    }

    const hasMetadata =
      payload.content_version === 'seed-v2' &&
      typeof payload.generated_at === 'string' &&
      payload.calculation_version === 'deterministic-profile-v1' &&
      payload.editorial_status === 'generated_quality_checked' &&
      Array.isArray(payload.source_signals) &&
      payload.source_signals.length > 0;
    if (!hasMetadata) {
      throw new Error(`Seed quality requires traceable metadata in ${upload.key}`);
    }
  }

  const compatibilityCount = uploads.filter((item) => item.key.startsWith('content/compat/')).length;
  if (compatibilityCount >= SIGNS.length ** 2 && compatibilitySignatures.size < 20) {
    throw new Error('Seed quality requires at least 20 compatibility score signatures');
  }

  const personalityCount = uploads.filter((item) => item.key.startsWith('content/personality/')).length;
  if (personalityCount >= SIGNS.length && personalitySignatures.size < 10) {
    throw new Error('Seed quality requires at least 10 distinct personality profiles');
  }
}

export function buildDocumentsForSeed(options: ContentSeedOptions = {}): ContentSeedUpload[] {
  const uploads: ContentSeedUpload[] = [];
  const baseDate = parseSeedDate(options.seedDate);
  const dailyDays = parseDailyDays(options.dailyDays);
  const skipStaticContent = options.skipStaticContent ?? false;
  const generatedAt = new Date().toISOString();
  const dailyDates = buildDailyDates(baseDate, dailyDays);
  const weeklyInfos = new Map(dailyDates.map((date) => [getWeekInfo(date).weekId, getWeekInfo(date)]));
  const monthlyInfos = new Map(
    dailyDates.map((date) => {
      const month = formatMonth(date);
      return [month, { month, ...monthRange(date) }];
    })
  );

  for (const language of LANGUAGES) {
    for (const date of dailyDates) {
      const isoDate = formatIsoDate(date);
      const dailySigns = Object.fromEntries(
        SIGNS.map((sign) => [sign, dailyEntry(sign, language, isoDate)])
      );

      uploads.push({
        key: `content/daily/${language}/${isoDate}.json`,
        payload: {
          ...contentMetadata(generatedAt, ['sun_sign', 'calendar_date']),
          date: isoDate,
          language,
          signs: dailySigns
        }
      });
    }

    for (const weekInfo of weeklyInfos.values()) {
      const weeklySigns = Object.fromEntries(
        SIGNS.map((sign) => [sign, weeklyEntry(sign, language, weekInfo.weekId)])
      );
      uploads.push({
        key: `content/weekly/${language}/${weekInfo.weekId}.json`,
        payload: {
          ...contentMetadata(generatedAt, ['sun_sign', 'iso_week']),
          week: weekInfo.weekId,
          week_start: weekInfo.weekStart,
          week_end: weekInfo.weekEnd,
          language,
          signs: weeklySigns
        }
      });
    }

    for (const monthInfo of monthlyInfos.values()) {
      const monthlySigns = Object.fromEntries(
        SIGNS.map((sign) => [sign, monthlyEntry(sign, language, monthInfo.month)])
      );
      uploads.push({
        key: `content/monthly/${language}/${monthInfo.month}.json`,
        payload: {
          ...contentMetadata(generatedAt, ['sun_sign', 'calendar_month']),
          month: monthInfo.month,
          month_start: monthInfo.start,
          month_end: monthInfo.end,
          language,
          signs: monthlySigns
        }
      });
    }

    if (!skipStaticContent) {
      for (const sign of SIGNS) {
        uploads.push({
          key: `content/personality/${language}/${sign}.json`,
          payload: {
            ...contentMetadata(generatedAt, ['sun_sign', 'element', 'modality', 'ruling_planet']),
            ...personalityEntry(sign, language)
          }
        });
      }

      for (const sign1 of SIGNS) {
        for (const sign2 of SIGNS) {
          uploads.push({
            key: `content/compat/${language}/${sign1}-${sign2}.json`,
            payload: {
              ...contentMetadata(generatedAt, ['sun_sign_pair', 'element_affinity', 'modality_affinity']),
              ...compatibilityEntry(sign1, sign2, language)
            }
          });
        }
      }
    }
  }

  return uploads;
}
