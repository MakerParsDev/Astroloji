import type { Language } from '@/types';

import type { DeepReadingChartSummary } from './deepReadingGenerator';
import type { LlmGenerateRequest, LlmMessage, LlmProvider } from './provider';
import { routeLlmGenerate } from './router';

/** Bump when the system prompt below changes. */
export const CHAT_CONSULTATION_PROMPT_VERSION = 'chat-consultation-v1';

export const MAX_CHAT_HISTORY_TURNS = 12;
const MAX_CHAT_OUTPUT_TOKENS = 500;

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatConsultationInput {
  chart: DeepReadingChartSummary;
  language: Language;
  /** Prior turns, oldest first. Only the most recent MAX_CHAT_HISTORY_TURNS are sent to the model. */
  history: ChatTurn[];
  message: string;
}

const DISCLAIMER: Record<Language, string> = {
  tr: 'Bu sohbet eğlence ve öz-yansıma amaçlıdır; tıbbi, hukuki veya finansal tavsiye vermezsin. Böyle bir konu açılırsa nazikçe bir uzmana yönlendir.',
  en: 'This chat is for entertainment and self-reflection; you never give medical, legal, or financial advice. If such a topic comes up, gently redirect the user to a qualified professional.',
  es: 'Esta conversación es para entretenimiento y autorreflexión; nunca das consejos médicos, legales o financieros. Si surge un tema así, redirige con amabilidad a un profesional calificado.'
};

const PERSONA: Record<Language, string> = {
  tr: 'Sen deneyimli, sıcak ve gerçekçi bir astroloji danışmanısın. Kısa, samimi ve somut cevaplar ver (en fazla birkaç paragraf).',
  en: 'You are an experienced, warm, and grounded astrology consultant. Keep answers short, personal, and concrete (a few paragraphs at most).',
  es: 'Eres un consultor de astrología experimentado, cálido y realista. Da respuestas breves, cercanas y concretas (unos pocos párrafos como máximo).'
};

const UNKNOWN_ASCENDANT: Record<Language, string> = {
  tr: 'bilinmiyor',
  en: 'unknown',
  es: 'desconocido'
};

function chartLineFor(
  language: Language,
  chart: DeepReadingChartSummary,
  ascendant: string
): string {
  const sun = chart.sunDegree.toFixed(1);
  const moon = chart.moonDegree.toFixed(1);
  const venus = chart.venusDegree.toFixed(1);
  const mars = chart.marsDegree.toFixed(1);
  const lines: Record<Language, string> = {
    tr: `Kullanıcının doğum haritası: Güneş ${chart.sunSign} ${sun}°, Ay ${chart.moonSign} ${moon}°, Yükselen ${ascendant}, Venüs ${chart.venusSign} ${venus}°, Mars ${chart.marsSign} ${mars}°.`,
    en: `The user's birth chart: Sun ${chart.sunSign} ${sun}°, Moon ${chart.moonSign} ${moon}°, Rising ${ascendant}, Venus ${chart.venusSign} ${venus}°, Mars ${chart.marsSign} ${mars}°.`,
    es: `Carta natal del usuario: Sol en ${chart.sunSign} ${sun}°, Luna en ${chart.moonSign} ${moon}°, Ascendente ${ascendant}, Venus en ${chart.venusSign} ${venus}°, Marte en ${chart.marsSign} ${mars}°.`
  };
  return lines[language];
}

function buildSystemPrompt(chart: DeepReadingChartSummary, language: Language): string {
  const ascendant =
    chart.ascendantSign && chart.ascendantDegree !== null
      ? `${chart.ascendantSign} ${chart.ascendantDegree.toFixed(1)}°`
      : UNKNOWN_ASCENDANT[language];

  const chartLine = chartLineFor(language, chart, ascendant);

  return [PERSONA[language], chartLine, DISCLAIMER[language]].join(' ');
}

export function buildChatConsultationPrompt(input: ChatConsultationInput): LlmGenerateRequest {
  const recentHistory = input.history.slice(-MAX_CHAT_HISTORY_TURNS);
  const messages: LlmMessage[] = [
    { role: 'system', content: buildSystemPrompt(input.chart, input.language) },
    ...recentHistory.map((turn) => ({ role: turn.role, content: turn.content })),
    { role: 'user', content: input.message }
  ];

  return {
    taskType: 'chat_consultation',
    messages,
    maxOutputTokens: MAX_CHAT_OUTPUT_TOKENS
  };
}

export interface ChatConsultationAttempt {
  providerId: string;
  error: string;
}

export interface ChatConsultationResult {
  /** Null when the provider chain was exhausted. */
  reply: string | null;
  attempts: ChatConsultationAttempt[];
}

export async function generateChatReply(
  providers: readonly LlmProvider[],
  input: ChatConsultationInput
): Promise<ChatConsultationResult> {
  const routed = await routeLlmGenerate(providers, buildChatConsultationPrompt(input));
  if (!routed.result) {
    return { reply: null, attempts: routed.attempts };
  }

  const reply = routed.result.text.trim();
  if (reply.length === 0) {
    return {
      reply: null,
      attempts: [...routed.attempts, { providerId: routed.result.providerId, error: 'Model response was empty.' }]
    };
  }

  return { reply, attempts: routed.attempts };
}
