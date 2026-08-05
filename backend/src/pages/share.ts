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

export type ShareSign = (typeof SIGNS)[number];

const SIGN_LABELS: Record<ShareSign, string> = {
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
};

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.parsfilo.astrology';

export function parseShareSign(value: string | undefined): ShareSign | null {
  const normalized = value?.trim().toLowerCase();
  return SIGNS.find((sign) => sign === normalized) ?? null;
}

function pageShell(input: {
  title: string;
  description: string;
  primaryUrl?: string;
  primaryLabel?: string;
}): string {
  const primaryAction =
    input.primaryUrl && input.primaryLabel
      ? `<a class="primary" href="${input.primaryUrl}">${input.primaryLabel}</a>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${input.title}</title>
  <meta name="description" content="${input.description}">
  <style>
    :root { color-scheme: dark; font-family: system-ui, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #100d1d; color: #f7f2ff; }
    main { width: min(92vw, 34rem); padding: 2rem; border: 1px solid #51466f; border-radius: 1.5rem; background: #1a1530; }
    h1 { margin-top: 0; line-height: 1.15; }
    p { color: #d6ccea; line-height: 1.6; }
    .actions { display: grid; gap: .75rem; margin-top: 1.5rem; }
    a { display: block; padding: .9rem 1rem; border-radius: 999px; text-align: center; text-decoration: none; font-weight: 700; }
    .primary { background: #bba2ff; color: #160d2c; }
    .secondary { border: 1px solid #8c7bae; color: #f7f2ff; }
    small { display: block; margin-top: 1.25rem; color: #a99fbd; }
  </style>
</head>
<body>
  <main>
    <h1>${input.title}</h1>
    <p>${input.description}</p>
    <div class="actions">
      ${primaryAction}
      <a class="secondary" href="${PLAY_STORE_URL}">Get Astrology on Google Play</a>
    </div>
    <small>No account, user identifier, score history, or tracking parameter is included in this link.</small>
  </main>
</body>
</html>`;
}

export function renderDailyShare(sign: ShareSign): string {
  const label = SIGN_LABELS[sign];
  return pageShell({
    title: `${label} daily astrology`,
    description: `Open today's ${label} reflection in the Astrology app.`,
    primaryUrl: `astrology://daily/${sign}`,
    primaryLabel: 'Open in the app'
  });
}

export function renderCompatibilityShare(first: ShareSign, second: ShareSign): string {
  return pageShell({
    title: `${SIGN_LABELS[first]} + ${SIGN_LABELS[second]}`,
    description:
      'Explore a transparent compatibility reading based on the selected zodiac pair. Shared links do not expose a mutable score or personal profile.'
  });
}
