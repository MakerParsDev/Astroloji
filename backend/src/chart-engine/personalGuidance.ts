import type { MajorAspectType } from '@/chart-engine/natalChart';
import type { ChartBody } from '@/chart-engine/planetaryPositions';
import {
  createTransitSnapshot,
  type TransitAspect,
  type TransitSnapshotV1
} from '@/chart-engine/transitSnapshot';

export type GuidanceLanguage = 'tr' | 'en';

export type GuidanceDomain =
  | 'identity'
  | 'emotions'
  | 'communication'
  | 'relationships'
  | 'action'
  | 'growth'
  | 'responsibility'
  | 'change'
  | 'imagination'
  | 'transformation';

export type PersonalGuidanceSignal = {
  id: string;
  priority: number;
  domain: GuidanceDomain;
  title: string;
  summary: string;
  actionPrompt: string;
  evidence: {
    transitBody: ChartBody;
    natalBody: ChartBody;
    aspect: MajorAspectType;
    orb: number;
    maximumOrb: number;
  };
};

export type PersonalGuidanceV1 = {
  version: 'personal-guidance-v1';
  calculationVersion: 'guidance-rules-v1';
  generatedAt: string;
  targetTimestamp: string;
  language: GuidanceLanguage;
  signals: PersonalGuidanceSignal[];
  limitations: TransitSnapshotV1['limitations'];
  disclaimer: string;
};

const BODY_LABELS: Record<GuidanceLanguage, Record<ChartBody, string>> = {
  tr: {
    sun: 'Güneş',
    moon: 'Ay',
    mercury: 'Merkür',
    venus: 'Venüs',
    mars: 'Mars',
    jupiter: 'Jüpiter',
    saturn: 'Satürn',
    uranus: 'Uranüs',
    neptune: 'Neptün',
    pluto: 'Plüton'
  },
  en: {
    sun: 'Sun',
    moon: 'Moon',
    mercury: 'Mercury',
    venus: 'Venus',
    mars: 'Mars',
    jupiter: 'Jupiter',
    saturn: 'Saturn',
    uranus: 'Uranus',
    neptune: 'Neptune',
    pluto: 'Pluto'
  }
};

const ASPECT_LABELS: Record<GuidanceLanguage, Record<MajorAspectType, string>> = {
  tr: {
    conjunction: 'kavuşum',
    sextile: 'sekstil',
    square: 'kare',
    trine: 'üçgen',
    opposition: 'karşıt'
  },
  en: {
    conjunction: 'conjunction',
    sextile: 'sextile',
    square: 'square',
    trine: 'trine',
    opposition: 'opposition'
  }
};

const BODY_DOMAINS: Record<ChartBody, GuidanceDomain> = {
  sun: 'identity',
  moon: 'emotions',
  mercury: 'communication',
  venus: 'relationships',
  mars: 'action',
  jupiter: 'growth',
  saturn: 'responsibility',
  uranus: 'change',
  neptune: 'imagination',
  pluto: 'transformation'
};

const DOMAIN_LABELS: Record<GuidanceLanguage, Record<GuidanceDomain, string>> = {
  tr: {
    identity: 'öz ifade',
    emotions: 'duygusal ihtiyaçlar',
    communication: 'iletişim ve düşünce',
    relationships: 'ilişkiler ve değerler',
    action: 'eylem ve sınırlar',
    growth: 'gelişim ve anlam',
    responsibility: 'sorumluluk ve yapı',
    change: 'değişim ve özgürleşme',
    imagination: 'sezgi ve hayal gücü',
    transformation: 'derin dönüşüm'
  },
  en: {
    identity: 'self-expression',
    emotions: 'emotional needs',
    communication: 'communication and thinking',
    relationships: 'relationships and values',
    action: 'action and boundaries',
    growth: 'growth and meaning',
    responsibility: 'responsibility and structure',
    change: 'change and freedom',
    imagination: 'intuition and imagination',
    transformation: 'deep transformation'
  }
};

const TRANSIT_BODY_WEIGHT: Record<ChartBody, number> = {
  sun: 42,
  moon: 28,
  mercury: 38,
  venus: 42,
  mars: 48,
  jupiter: 54,
  saturn: 60,
  uranus: 64,
  neptune: 64,
  pluto: 68
};

const ASPECT_WEIGHT: Record<MajorAspectType, number> = {
  conjunction: 18,
  sextile: 10,
  square: 16,
  trine: 13,
  opposition: 17
};

function signalPriority(aspect: TransitAspect): number {
  const tightness = 1 - aspect.orb / aspect.maximumOrb;
  return Math.min(
    100,
    Math.round(TRANSIT_BODY_WEIGHT[aspect.transitBody] + ASPECT_WEIGHT[aspect.type] + tightness * 20)
  );
}

function localizedSummary(
  language: GuidanceLanguage,
  aspect: MajorAspectType,
  domainLabel: string
): string {
  if (language === 'tr') {
    const summaries: Record<MajorAspectType, string> = {
      conjunction: `Yoğunlaşan bir vurgu, ${domainLabel} temasını daha görünür hâle getirebilir.`,
      sextile: `Uyumlu bir fırsat, ${domainLabel} alanını nazikçe destekleyebilir.`,
      square: `Beliren sürtünme, ${domainLabel} konusunda bilinçli bir ayarlama isteyebilir.`,
      trine: `Akışkan bir destek, ${domainLabel} becerilerini daha rahat kullanmana yardımcı olabilir.`,
      opposition: `İki kutup arasında denge kurmak, ${domainLabel} alanında daha çok netlik sağlayabilir.`
    };
    return summaries[aspect];
  }

  const summaries: Record<MajorAspectType, string> = {
    conjunction: `A concentrated emphasis may make themes of ${domainLabel} more visible.`,
    sextile: `A supportive opening may gently strengthen ${domainLabel}.`,
    square: `Constructive friction may invite a conscious adjustment around ${domainLabel}.`,
    trine: `A smoother flow may help you use skills connected with ${domainLabel}.`,
    opposition: `Balancing two poles may create more clarity around ${domainLabel}.`
  };
  return summaries[aspect];
}

function localizedActionPrompt(language: GuidanceLanguage, domain: GuidanceDomain): string {
  const prompts: Record<GuidanceLanguage, Record<GuidanceDomain, string>> = {
    tr: {
      identity: 'Bugün kendini ifade etmek istediğin tek bir noktayı kısa ve dürüst biçimde yaz.',
      emotions: 'Duygunu değiştirmeye çalışmadan önce onu adlandırıp kısa bir nefes arası ver.',
      communication: 'Önemli konuşmadan önce niyetini tek cümlede netleştir.',
      relationships: 'Bir beklentiyi varsaymak yerine karşılıklı ve açık bir soru sor.',
      action: 'Enerjini dağıtmak yerine tamamlanabilir tek bir adım seç.',
      growth: 'Merak ettiğin konuda küçük, ölçülebilir bir öğrenme hedefi belirle.',
      responsibility: 'Taşıdığın yüklerden hangisinin gerçekten sana ait olduğunu gözden geçir.',
      change: 'Alışılmış yöntemin yerine güvenli ve küçük bir alternatif dene.',
      imagination: 'Sezgini bir not, çizim veya kısa yaratıcı çalışmayla somutlaştır.',
      transformation: 'Bırakmaya hazır olduğun bir alışkanlığı ve yerine koyacağın davranışı yaz.'
    },
    en: {
      identity: 'Write one honest sentence about what you want to express today.',
      emotions: 'Name the feeling and pause before trying to change it.',
      communication: 'Clarify your intention in one sentence before an important conversation.',
      relationships: 'Replace one assumption with a mutual, open question.',
      action: 'Choose one finishable step instead of spreading your energy widely.',
      growth: 'Set one small and measurable learning goal.',
      responsibility: 'Review which responsibility genuinely belongs to you.',
      change: 'Try one safe, small alternative to the usual method.',
      imagination: 'Turn intuition into a note, sketch, or brief creative exercise.',
      transformation: 'Write down one habit to release and the behavior that can replace it.'
    }
  };
  return prompts[language][domain];
}

function toSignal(aspect: TransitAspect, language: GuidanceLanguage): PersonalGuidanceSignal {
  const domain = BODY_DOMAINS[aspect.natalBody];
  const transitLabel = BODY_LABELS[language][aspect.transitBody];
  const natalLabel = BODY_LABELS[language][aspect.natalBody];
  const aspectLabel = ASPECT_LABELS[language][aspect.type];
  const title =
    language === 'tr'
      ? `${transitLabel}, natal ${natalLabel} ile ${aspectLabel}`
      : `${transitLabel} ${aspectLabel} natal ${natalLabel}`;

  return {
    id: `${aspect.transitBody}_${aspect.type}_${aspect.natalBody}`,
    priority: signalPriority(aspect),
    domain,
    title,
    summary: localizedSummary(language, aspect.type, DOMAIN_LABELS[language][domain]),
    actionPrompt: localizedActionPrompt(language, domain),
    evidence: {
      transitBody: aspect.transitBody,
      natalBody: aspect.natalBody,
      aspect: aspect.type,
      orb: aspect.orb,
      maximumOrb: aspect.maximumOrb
    }
  };
}

export function createPersonalGuidance(input: {
  natalTimestamp: string;
  natalTimeCertainty: 'exact' | 'approximate' | 'unknown';
  targetTimestamp: string;
  language: GuidanceLanguage;
}): PersonalGuidanceV1 {
  if (input.language !== 'tr' && input.language !== 'en') {
    throw new Error('language must be tr or en.');
  }

  const snapshot = createTransitSnapshot({
    natalTimestamp: input.natalTimestamp,
    natalTimeCertainty: input.natalTimeCertainty,
    targetTimestamp: input.targetTimestamp
  });
  const eligibleAspects = snapshot.aspects.filter(
    (aspect) => input.natalTimeCertainty === 'exact' || aspect.natalBody !== 'moon'
  );
  const signals = eligibleAspects
    .map((aspect) => toSignal(aspect, input.language))
    .sort((first, second) => second.priority - first.priority || first.evidence.orb - second.evidence.orb)
    .slice(0, 3);

  return {
    version: 'personal-guidance-v1',
    calculationVersion: 'guidance-rules-v1',
    generatedAt: new Date().toISOString(),
    targetTimestamp: snapshot.targetTimestamp,
    language: input.language,
    signals,
    limitations: snapshot.limitations,
    disclaimer:
      input.language === 'tr'
        ? 'Bu içerik eğlence ve öz değerlendirme içindir; tıbbi, hukuki veya finansal tavsiye değildir.'
        : 'This content is for reflection and entertainment, not medical, legal, or financial advice.'
  };
}
