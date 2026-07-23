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

export type ContentSeedUpload = {
  key: string;
  payload: object;
};

export type ContentSeedOptions = {
  seedDate?: string;
  dailyDays?: number;
  skipStaticContent?: boolean;
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
  const labels: Record<Language, Record<Sign, string>> = {
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

  return labels[language][sign];
}

function dailyEntry(sign: Sign, language: Language, index: number) {
  const base = language === 'tr' ? `${signName(sign, language)} burcu` : `${signName(sign, language)}`;

  return {
    short:
      language === 'tr'
        ? `${base} için bugün enerji ve motivasyon yüksek.`
        : `${base} feels energized and focused today.`,
    full:
      language === 'tr'
        ? `${base} için premium günlük analiz. İlişkiler, kariyer ve duygusal denge konusunda detaylı yorumlar.`
        : `${base} premium daily analysis with deeper guidance on relationships, work, and emotional balance.`,
    love:
      language === 'tr'
        ? 'Aşk hayatında açık iletişim kazançtır.'
        : 'Open communication improves your love life today.',
    career:
      language === 'tr'
        ? 'Kariyerde net kararlar almak için uygun bir gün.'
        : 'A strong day to make clear career decisions.',
    money:
      language === 'tr'
        ? 'Bütçeyi korurken yeni fırsatları gözden geçir.'
        : 'Review new money opportunities without ignoring your budget.',
    health:
      language === 'tr'
        ? 'Dinlenme ve su tüketimi sana iyi gelecek.'
        : 'Rest and hydration will help you stay balanced.',
    lucky_number: (index % 9) + 1,
    lucky_color: language === 'tr' ? 'Kırmızı' : 'Red',
    energy: 72 + (index % 20),
    love_score: 60 + (index % 30),
    career_score: 65 + (index % 25),
    money_score: 58 + (index % 28),
    health_score: 62 + (index % 24),
    daily_tip:
      language === 'tr'
        ? 'Gün içinde tek bir hedefe odaklan ve onu tamamla.'
        : 'Pick one meaningful goal and finish it before the day ends.'
  };
}

function weeklyEntry(sign: Sign, language: Language) {
  const name = signName(sign, language);

  return {
    summary:
      language === 'tr'
        ? `${name} için bu hafta denge kurma ve kararlılık haftası.`
        : `${name} enters a week of balance and steady momentum.`,
    love:
      language === 'tr'
        ? 'İlişkilerde sabırlı kalmak daha iyi sonuçlar verir.'
        : 'Patience improves your relationships this week.',
    career:
      language === 'tr'
        ? 'Kariyer tarafında dikkat çeken gelişmeler olabilir.'
        : 'Career momentum builds with visible progress.',
    money:
      language === 'tr'
        ? 'Harcamalarda planlı olmak rahatlık sağlar.'
        : 'Planned spending brings financial comfort.',
    best_day: language === 'tr' ? 'Çarşamba' : 'Wednesday',
    warning:
      language === 'tr'
        ? 'Yorucu tempoda duygusal tepkileri büyütmemeye çalış.'
        : 'Avoid amplifying emotional reactions during busy stretches.'
  };
}

function monthlyEntry(sign: Sign, language: Language) {
  const name = signName(sign, language);

  return {
    summary:
      language === 'tr'
        ? `${name} için bu ay büyüme ve netleşme teması önde.`
        : `${name} moves through a month focused on growth and clarity.`,
    love:
      language === 'tr'
        ? 'Aşkta daha derin ve sakin bir bağ kurma fırsatı var.'
        : 'Love favors deeper, calmer connections this month.',
    career:
      language === 'tr'
        ? 'Uzun vadeli planlar için verimli bir dönem.'
        : 'A productive stretch for long-term career planning.',
    money:
      language === 'tr'
        ? 'Gelir-gider dengesini iyileştirecek kararlar alınabilir.'
        : 'You can make decisions that improve income and expense balance.',
    best_day: language === 'tr' ? 'Cuma' : 'Friday',
    warning:
      language === 'tr'
        ? 'Sabırsızlık ilerlemeyi zorlaştırabilir.'
        : 'Impatience can slow your progress if left unchecked.'
  };
}

function compatibilityEntry(sign1: Sign, sign2: Sign, language: Language) {
  const pairLabel =
    language === 'tr'
      ? `${signName(sign1, language)} ve ${signName(sign2, language)}`
      : `${signName(sign1, language)} and ${signName(sign2, language)}`;

  return {
    sign1,
    sign2,
    language,
    overall_score: 70,
    love_score: 74,
    friendship_score: 68,
    work_score: 66,
    summary:
      language === 'tr'
        ? `${pairLabel} birlikte olduğunda dikkat çekici bir uyum yakalayabilir.`
        : `${pairLabel} can build a striking connection together.`,
    strengths:
      language === 'tr'
        ? ['Enerjik iletişim', 'Birbirini motive etme']
        : ['Energetic communication', 'Mutual motivation'],
    challenges:
      language === 'tr'
        ? ['İnatlaşma riski', 'Beklentileri dengeleme']
        : ['Risk of stubborn clashes', 'Balancing expectations'],
    advice:
      language === 'tr'
        ? 'Bu eşleşmede net sınırlar ve açık iletişim uzun vadeli uyumu güçlendirir.'
        : 'Clear boundaries and direct communication strengthen the long-term match.',
    famous_couples:
      language === 'tr'
        ? ['İlham verici çift 1', 'İlham verici çift 2']
        : ['Inspirational couple 1', 'Inspirational couple 2']
  };
}

function personalityEntry(sign: Sign, language: Language) {
  const name = signName(sign, language);

  return {
    sign,
    language,
    title:
      language === 'tr'
        ? `${name} Burcu Kişilik Analizi`
        : `${name} Personality Analysis`,
    summary:
      language === 'tr'
        ? `${name} için kısa ve ücretsiz kişilik özeti.`
        : `A short free personality summary for ${name}.`,
    deep_analysis:
      language === 'tr'
        ? `${name} için premium derin psikolojik analiz ve davranış desenleri.`
        : `Premium long-form psychological analysis and behavior patterns for ${name}.`,
    strengths:
      language === 'tr' ? ['Cesaret', 'Liderlik'] : ['Courage', 'Leadership'],
    weaknesses:
      language === 'tr' ? ['Sabırsızlık', 'Aşırı tepki'] : ['Impatience', 'Overreaction'],
    ideal_partners: ['leo', 'sagittarius'],
    career_fit:
      language === 'tr' ? ['Girişimcilik', 'Satış'] : ['Entrepreneurship', 'Sales'],
    element: language === 'tr' ? 'ateş' : 'fire',
    planet: 'Mars',
    color: language === 'tr' ? 'Kırmızı' : 'Red',
    stone: language === 'tr' ? 'Yakut' : 'Ruby'
  };
}

function buildDailyDates(baseDate: Date, dailyDays: number): Date[] {
  if (dailyDays > 0) {
    return Array.from({ length: dailyDays }, (_, index) => addDays(baseDate, index));
  }

  return [-1, 0, 1].map((offset) => addDays(baseDate, offset));
}

export function buildDocumentsForSeed(options: ContentSeedOptions = {}): ContentSeedUpload[] {
  const uploads: ContentSeedUpload[] = [];
  const baseDate = parseSeedDate(options.seedDate);
  const dailyDays = parseDailyDays(options.dailyDays);
  const skipStaticContent = options.skipStaticContent ?? false;
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
        SIGNS.map((sign, index) => [sign, dailyEntry(sign, language, index + date.getUTCDate())])
      );

      uploads.push({
        key: `content/daily/${language}/${isoDate}.json`,
        payload: {
          date: isoDate,
          language,
          signs: dailySigns
        }
      });
    }

    for (const weekInfo of weeklyInfos.values()) {
      const weeklySigns = Object.fromEntries(SIGNS.map((sign) => [sign, weeklyEntry(sign, language)]));
      uploads.push({
        key: `content/weekly/${language}/${weekInfo.weekId}.json`,
        payload: {
          week: weekInfo.weekId,
          week_start: weekInfo.weekStart,
          week_end: weekInfo.weekEnd,
          language,
          signs: weeklySigns
        }
      });
    }

    for (const monthInfo of monthlyInfos.values()) {
      const monthlySigns = Object.fromEntries(SIGNS.map((sign) => [sign, monthlyEntry(sign, language)]));
      uploads.push({
        key: `content/monthly/${language}/${monthInfo.month}.json`,
        payload: {
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
          payload: personalityEntry(sign, language)
        });
      }

      for (const sign1 of SIGNS) {
        for (const sign2 of SIGNS) {
          uploads.push({
            key: `content/compat/${language}/${sign1}-${sign2}.json`,
            payload: compatibilityEntry(sign1, sign2, language)
          });
        }
      }
    }
  }

  return uploads;
}
