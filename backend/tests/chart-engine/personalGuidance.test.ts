import { describe, expect, it } from 'vitest';

import { createPersonalGuidance } from '@/chart-engine/personalGuidance';

const FORBIDDEN_DETERMINISTIC_LANGUAGE =
  /\b(will definitely|guaranteed|you will|kesinlikle|garanti|başına gelecek)\b/i;
const FORBIDDEN_ADVICE_LANGUAGE =
  /\b(diagnose|medication|investment advice|buy this stock|teşhis|ilaç kullan|yatırım tavsiyesi)\b/i;

describe('personal guidance v1', () => {
  it('returns three ranked, traceable, non-deterministic English signals', () => {
    const guidance = createPersonalGuidance({
      natalTimestamp: '1990-01-15T12:00:00.000Z',
      natalTimeCertainty: 'exact',
      targetTimestamp: '2026-08-05T00:00:00.000Z',
      language: 'en'
    });

    expect(guidance.version).toBe('personal-guidance-v1');
    expect(guidance.signals).toHaveLength(3);
    expect(guidance.signals.map((signal) => signal.priority)).toEqual(
      [...guidance.signals.map((signal) => signal.priority)].sort((first, second) => second - first)
    );
    expect(new Set(guidance.signals.map((signal) => signal.id)).size).toBe(3);
    for (const signal of guidance.signals) {
      expect(signal.evidence.orb).toBeGreaterThanOrEqual(0);
      expect(signal.evidence.orb).toBeLessThanOrEqual(signal.evidence.maximumOrb);
      expect(signal.title).not.toMatch(FORBIDDEN_DETERMINISTIC_LANGUAGE);
      expect(signal.summary).not.toMatch(FORBIDDEN_DETERMINISTIC_LANGUAGE);
      expect(signal.actionPrompt).not.toMatch(FORBIDDEN_ADVICE_LANGUAGE);
    }
    expect(guidance.disclaimer).toMatch(/reflection and entertainment/i);
  });

  it('produces natural Turkish guidance without deterministic promises', () => {
    const guidance = createPersonalGuidance({
      natalTimestamp: '1990-01-15T12:00:00.000Z',
      natalTimeCertainty: 'exact',
      targetTimestamp: '2026-08-05T00:00:00.000Z',
      language: 'tr'
    });

    expect(guidance.signals).toHaveLength(3);
    expect(guidance.signals.every((signal) => /[çğıöşü]/i.test(`${signal.summary} ${signal.actionPrompt}`))).toBe(true);
    expect(guidance.signals.map((signal) => signal.summary).join(' ')).not.toMatch(
      FORBIDDEN_DETERMINISTIC_LANGUAGE
    );
    expect(guidance.disclaimer).toMatch(/eğlence ve öz değerlendirme/i);
  });

  it('produces natural Spanish guidance without deterministic promises', () => {
    const guidance = createPersonalGuidance({
      natalTimestamp: '1990-01-15T12:00:00.000Z',
      natalTimeCertainty: 'exact',
      targetTimestamp: '2026-08-05T00:00:00.000Z',
      language: 'es'
    });

    expect(guidance.signals).toHaveLength(3);
    expect(guidance.signals.every((signal) => /[áéíóúñ]/i.test(`${signal.summary} ${signal.actionPrompt}`))).toBe(
      true
    );
    expect(guidance.signals.map((signal) => signal.summary).join(' ')).not.toMatch(
      FORBIDDEN_DETERMINISTIC_LANGUAGE
    );
    expect(guidance.disclaimer).toMatch(/reflexión y entretenimiento/i);
  });

  it('produces natural Portuguese guidance without deterministic promises', () => {
    const guidance = createPersonalGuidance({
      natalTimestamp: '1990-01-15T12:00:00.000Z',
      natalTimeCertainty: 'exact',
      targetTimestamp: '2026-08-05T00:00:00.000Z',
      language: 'pt'
    });

    expect(guidance.signals).toHaveLength(3);
    expect(guidance.signals.every((signal) => /[ãõçáéíóú]/i.test(`${signal.summary} ${signal.actionPrompt}`))).toBe(
      true
    );
    expect(guidance.signals.map((signal) => signal.summary).join(' ')).not.toMatch(
      FORBIDDEN_DETERMINISTIC_LANGUAGE
    );
    expect(guidance.disclaimer).toMatch(/reflexão e entretenimento/i);
  });

  it('produces natural German guidance without deterministic promises', () => {
    const guidance = createPersonalGuidance({
      natalTimestamp: '1990-01-15T12:00:00.000Z',
      natalTimeCertainty: 'exact',
      targetTimestamp: '2026-08-05T00:00:00.000Z',
      language: 'de'
    });

    expect(guidance.signals).toHaveLength(3);
    expect(guidance.signals.every((signal) => /[äöüß]/i.test(`${signal.summary} ${signal.actionPrompt}`))).toBe(
      true
    );
    expect(guidance.signals.map((signal) => signal.summary).join(' ')).not.toMatch(
      FORBIDDEN_DETERMINISTIC_LANGUAGE
    );
    expect(guidance.disclaimer).toMatch(/Reflexion und Unterhaltung/i);
  });

  it('removes natal Moon claims when the birth time is unknown', () => {
    const guidance = createPersonalGuidance({
      natalTimestamp: '1990-01-15T12:00:00.000Z',
      natalTimeCertainty: 'unknown',
      targetTimestamp: '2026-08-05T00:00:00.000Z',
      language: 'en'
    });

    expect(guidance.limitations).toContain('moon_position_time_sensitive');
    expect(guidance.signals.every((signal) => signal.evidence.natalBody !== 'moon')).toBe(true);
  });

  it('rejects unsupported languages', () => {
    expect(() =>
      createPersonalGuidance({
        natalTimestamp: '1990-01-15T12:00:00.000Z',
        natalTimeCertainty: 'exact',
        targetTimestamp: '2026-08-05T00:00:00.000Z',
        language: 'fr' as 'en'
      })
    ).toThrow(/language/i);
  });
});
