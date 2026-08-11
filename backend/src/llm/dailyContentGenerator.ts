import { z } from 'zod';

import type { DailySignContent, Language, Sign } from '@/types';

import type { LlmGenerateRequest, LlmProvider } from './provider';
import { routeLlmGenerate } from './router';

/**
 * Bump this whenever the prompt below changes — it is part of the LLM cache
 * key (see llm/cache.ts), so a version bump invalidates stale cached content
 * automatically instead of requiring manual cache eviction.
 */
export const DAILY_CONTENT_PROMPT_VERSION = 'daily-content-v1';

const dailySignContentSchema = z.object({
  short: z.string().min(1).max(280),
  full: z.string().min(1).max(1200),
  love: z.string().min(1).max(400),
  career: z.string().min(1).max(400),
  money: z.string().min(1).max(400),
  health: z.string().min(1).max(400),
  lucky_number: z.number().int().min(1).max(99),
  lucky_color: z.string().min(1).max(40),
  energy: z.number().int().min(0).max(100),
  love_score: z.number().int().min(0).max(100),
  career_score: z.number().int().min(0).max(100),
  money_score: z.number().int().min(0).max(100),
  health_score: z.number().int().min(0).max(100),
  daily_tip: z.string().min(1).max(280)
});

// Compile-time check that the schema's inferred output matches DailySignContent exactly,
// so a future field added to one but not the other fails the build instead of silently drifting.
type SchemaOutput = z.infer<typeof dailySignContentSchema>;
const _typeCheck: SchemaOutput extends DailySignContent
  ? DailySignContent extends SchemaOutput
    ? true
    : never
  : never = true;
void _typeCheck;

export interface DailyContentGeneratorInput {
  sign: Sign;
  language: Language;
  /** ISO date (YYYY-MM-DD) the content is generated for. */
  date: string;
}

const RESPONSE_INSTRUCTIONS: Record<Language, string> = {
  tr: 'Yalnızca aşağıdaki alanları içeren geçerli bir JSON nesnesi döndür, başka metin ekleme: short, full, love, career, money, health, lucky_number (1-99 arası tam sayı), lucky_color, energy (0-100 tam sayı), love_score (0-100 tam sayı), career_score (0-100 tam sayı), money_score (0-100 tam sayı), health_score (0-100 tam sayı), daily_tip.',
  en: 'Return only a valid JSON object with exactly these fields, no other text: short, full, love, career, money, health, lucky_number (integer 1-99), lucky_color, energy (integer 0-100), love_score (integer 0-100), career_score (integer 0-100), money_score (integer 0-100), health_score (integer 0-100), daily_tip.',
  es: 'Devuelve únicamente un objeto JSON válido con exactamente estos campos, sin ningún otro texto: short, full, love, career, money, health, lucky_number (entero 1-99), lucky_color, energy (entero 0-100), love_score (entero 0-100), career_score (entero 0-100), money_score (entero 0-100), health_score (entero 0-100), daily_tip.',
  pt: 'Retorne apenas um objeto JSON válido com exatamente estes campos, sem nenhum outro texto: short, full, love, career, money, health, lucky_number (número inteiro de 1 a 99), lucky_color, energy (número inteiro de 0 a 100), love_score (número inteiro de 0 a 100), career_score (número inteiro de 0 a 100), money_score (número inteiro de 0 a 100), health_score (número inteiro de 0 a 100), daily_tip.',
  de: 'Geben Sie ausschließlich ein gültiges JSON-Objekt mit genau diesen Feldern zurück, ohne weiteren Text: short, full, love, career, money, health, lucky_number (ganze Zahl 1-99), lucky_color, energy (ganze Zahl 0-100), love_score (ganze Zahl 0-100), career_score (ganze Zahl 0-100), money_score (ganze Zahl 0-100), health_score (ganze Zahl 0-100), daily_tip.'
};

const SYSTEM_PROMPT: Record<Language, string> = {
  tr: 'Sen deneyimli, sıcak ve gerçekçi bir astroloji yazarısın. İçerik eğlence ve öz-yansıma amaçlıdır; tıbbi, hukuki veya finansal tavsiye vermezsin.',
  en: 'You are an experienced, warm, and grounded astrology writer. Content is for entertainment and self-reflection; you never give medical, legal, or financial advice.',
  es: 'Eres un escritor de astrología experimentado, cálido y realista. El contenido es para entretenimiento y autorreflexión; nunca das consejos médicos, legales o financieros.',
  pt: 'Você é um redator de astrologia experiente, caloroso e realista. O conteúdo é para entretenimento e autorreflexão; você nunca dá conselhos médicos, jurídicos ou financeiros.',
  de: 'Sie sind eine erfahrene, warmherzige und bodenständige Astrologie-Autorin. Der Inhalt dient der Unterhaltung und Selbstreflexion; Sie geben niemals medizinischen, rechtlichen oder finanziellen Rat.'
};

const USER_PROMPT: Record<Language, (input: DailyContentGeneratorInput) => string> = {
  tr: (input) => `${input.sign} burcu için ${input.date} tarihli günlük yorumu yaz. ${RESPONSE_INSTRUCTIONS.tr}`,
  en: (input) => `Write the daily horoscope for ${input.sign} for ${input.date}. ${RESPONSE_INSTRUCTIONS.en}`,
  es: (input) =>
    `Escribe el horóscopo diario para ${input.sign} para el ${input.date}. ${RESPONSE_INSTRUCTIONS.es}`,
  pt: (input) =>
    `Escreva o horóscopo diário para ${input.sign} para ${input.date}. ${RESPONSE_INSTRUCTIONS.pt}`,
  de: (input) =>
    `Schreiben Sie das Tageshoroskop für ${input.sign} für den ${input.date}. ${RESPONSE_INSTRUCTIONS.de}`
};

export function buildDailyContentPrompt(input: DailyContentGeneratorInput): LlmGenerateRequest {
  const user = USER_PROMPT[input.language](input);

  return {
    taskType: 'daily_content',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT[input.language] },
      { role: 'user', content: user }
    ],
    maxOutputTokens: 600
  };
}

/** Models sometimes wrap JSON in prose or a ```json fence despite instructions; extract the outermost object. */
function extractJsonObject(text: string): string {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    return text;
  }
  return text.slice(start, end + 1);
}

export interface DailyContentGenerationAttempt {
  providerId: string;
  error: string;
}

export interface DailyContentGenerationResult {
  /** Null when the provider chain was exhausted or the model output failed validation — caller falls back to deterministic content. */
  content: DailySignContent | null;
  attempts: DailyContentGenerationAttempt[];
}

export async function generateDailySignContent(
  providers: readonly LlmProvider[],
  input: DailyContentGeneratorInput
): Promise<DailyContentGenerationResult> {
  const routed = await routeLlmGenerate(providers, buildDailyContentPrompt(input));

  if (!routed.result) {
    return { content: null, attempts: routed.attempts };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(extractJsonObject(routed.result.text));
  } catch {
    return {
      content: null,
      attempts: [
        ...routed.attempts,
        { providerId: routed.result.providerId, error: 'Model response was not valid JSON.' }
      ]
    };
  }

  const parsed = dailySignContentSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return {
      content: null,
      attempts: [
        ...routed.attempts,
        {
          providerId: routed.result.providerId,
          error: `Model response did not match the expected schema: ${parsed.error.message}`
        }
      ]
    };
  }

  return { content: parsed.data, attempts: routed.attempts };
}

/**
 * Convenience wrapper for callers that already have the deterministic
 * contentSeed.ts output on hand (the seed/backfill flow does) and just want
 * "LLM if it works, otherwise what we already had".
 */
export async function generateDailySignContentOrFallback(
  providers: readonly LlmProvider[],
  input: DailyContentGeneratorInput,
  deterministicFallback: DailySignContent
): Promise<DailySignContent> {
  const { content } = await generateDailySignContent(providers, input);
  return content ?? deterministicFallback;
}
