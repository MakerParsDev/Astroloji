import type { Language } from '@/types';

import type { LlmGenerateRequest, LlmProvider } from './provider';
import { routeLlmGenerate } from './router';

/** Bump when the prompt below changes — see DAILY_CONTENT_PROMPT_VERSION for why. */
export const DEEP_READING_PROMPT_VERSION = 'deep-reading-v1';

const MIN_DEEP_READING_LENGTH = 200;

export interface DeepReadingChartSummary {
  sunSign: string;
  sunDegree: number;
  moonSign: string;
  moonDegree: number;
  ascendantSign: string | null;
  ascendantDegree: number | null;
  venusSign: string;
  venusDegree: number;
  marsSign: string;
  marsDegree: number;
}

export interface DeepReadingGeneratorInput {
  chart: DeepReadingChartSummary;
  language: Language;
}

const SYSTEM_PROMPT: Record<Language, string> = {
  tr: 'Sen deneyimli, sıcak ve gerçekçi bir astroloji yazarısın. İçerik eğlence ve öz-yansıma amaçlıdır; tıbbi, hukuki veya finansal tavsiye vermezsin.',
  en: 'You are an experienced, warm, and grounded astrology writer. Content is for entertainment and self-reflection; you never give medical, legal, or financial advice.',
  es: 'Eres un escritor de astrología experimentado, cálido y realista. El contenido es para entretenimiento y autorreflexión; nunca das consejos médicos, legales o financieros.'
};

function formatDegree(sign: string, degree: number): string {
  return `${sign} ${degree.toFixed(1)}°`;
}

const ASCENDANT_LINE_LABELS: Record<Language, { known: string; unknown: string }> = {
  tr: { known: 'Yükselen', unknown: 'Yükselen: doğum saati bilinmediği için hesaplanamadı, bu bölümü atla.' },
  en: { known: 'Rising sign', unknown: 'Rising sign: not available because the birth time is unknown, skip this section.' },
  es: { known: 'Ascendente', unknown: 'Ascendente: no disponible porque se desconoce la hora de nacimiento, omite esta sección.' }
};

const CHART_BODY_LABELS: Record<Language, { sun: string; moon: string; venus: string; mars: string }> = {
  tr: { sun: 'Güneş', moon: 'Ay', venus: 'Venüs', mars: 'Mars' },
  en: { sun: 'Sun', moon: 'Moon', venus: 'Venus', mars: 'Mars' },
  es: { sun: 'Sol', moon: 'Luna', venus: 'Venus', mars: 'Marte' }
};

function buildChartDescription(chart: DeepReadingChartSummary, language: Language): string {
  const ascendantLabels = ASCENDANT_LINE_LABELS[language];
  const ascendantLine =
    chart.ascendantSign && chart.ascendantDegree !== null
      ? `${ascendantLabels.known}: ${formatDegree(chart.ascendantSign, chart.ascendantDegree)}.`
      : ascendantLabels.unknown;

  const bodyLabels = CHART_BODY_LABELS[language];
  return [
    `${bodyLabels.sun}: ${formatDegree(chart.sunSign, chart.sunDegree)}.`,
    `${bodyLabels.moon}: ${formatDegree(chart.moonSign, chart.moonDegree)}.`,
    ascendantLine,
    `${bodyLabels.venus}: ${formatDegree(chart.venusSign, chart.venusDegree)}.`,
    `${bodyLabels.mars}: ${formatDegree(chart.marsSign, chart.marsDegree)}.`
  ].join(' ');
}

const READING_INSTRUCTIONS: Record<Language, (chartDescription: string) => string> = {
  tr: (chartDescription) =>
    `Aşağıdaki doğum haritası verilerine dayanarak kişiye özel, uzun ve derin bir yorum yaz. Kimlik/öz ifade (Güneş), duygusal dünya (Ay), varsa dış görünüş ve yaşam yaklaşımı (Yükselen), ilişkiler ve değerler (Venüs), eylem ve motivasyon (Mars) bölümlerini kapsa. Sıcak, somut ve düşündürücü bir üslup kullan; genel geçer ifadelerden kaçın. Yaklaşık 500-700 kelime, düz metin olarak yaz, başlık veya madde işareti kullanma.\n\n${chartDescription}`,
  en: (chartDescription) =>
    `Using the birth chart data below, write a personalized, long-form, in-depth reading. Cover identity/self-expression (Sun), the emotional inner world (Moon), outward approach and first impressions (Rising, if available), relationships and values (Venus), and drive/motivation (Mars). Use a warm, specific, thought-provoking tone; avoid generic filler. Write roughly 500-700 words as plain prose, no headings or bullet points.\n\n${chartDescription}`,
  es: (chartDescription) =>
    `A partir de los datos de la carta natal a continuación, escribe una lectura personalizada, extensa y profunda. Cubre la identidad/autoexpresión (Sol), el mundo emocional interno (Luna), el enfoque externo y primeras impresiones (Ascendente, si está disponible), relaciones y valores (Venus), e impulso/motivación (Marte). Usa un tono cálido, específico y evocador; evita las generalidades. Escribe aproximadamente 500-700 palabras en prosa continua, sin títulos ni viñetas.\n\n${chartDescription}`
};

export function buildDeepReadingPrompt(input: DeepReadingGeneratorInput): LlmGenerateRequest {
  const chartDescription = buildChartDescription(input.chart, input.language);
  const instructions = READING_INSTRUCTIONS[input.language](chartDescription);

  return {
    taskType: 'deep_reading',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT[input.language] },
      { role: 'user', content: instructions }
    ],
    maxOutputTokens: 1400
  };
}

export interface DeepReadingGenerationAttempt {
  providerId: string;
  error: string;
}

export interface DeepReadingGenerationResult {
  /** Null when the provider chain was exhausted or the output failed the minimum-length sanity check. */
  text: string | null;
  attempts: DeepReadingGenerationAttempt[];
}

export async function generateDeepReading(
  providers: readonly LlmProvider[],
  input: DeepReadingGeneratorInput
): Promise<DeepReadingGenerationResult> {
  const routed = await routeLlmGenerate(providers, buildDeepReadingPrompt(input));
  if (!routed.result) {
    return { text: null, attempts: routed.attempts };
  }

  const text = routed.result.text.trim();
  if (text.length < MIN_DEEP_READING_LENGTH) {
    return {
      text: null,
      attempts: [...routed.attempts, { providerId: routed.result.providerId, error: 'Model response was too short.' }]
    };
  }

  return { text, attempts: routed.attempts };
}
