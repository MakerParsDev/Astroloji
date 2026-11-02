import { PLAY_STORE_URL } from '@/pages/share';

const APP_URL = 'https://astrology.parsfilo.com/';

export function renderAppHomepage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Read your daily horoscope, explore weekly and monthly astrology guidance, zodiac compatibility and sign profiles in the Astroloji Android app.">
  <meta name="theme-color" content="#110d1e">
  <link rel="canonical" href="${APP_URL}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Astroloji">
  <meta property="og:title" content="Astroloji · Daily Horoscope & Zodiac Compatibility">
  <meta property="og:description" content="Daily horoscopes, weekly and monthly guidance, and zodiac compatibility on Android.">
  <meta property="og:url" content="${APP_URL}">
  <title>Astroloji: Daily Horoscope, Zodiac Signs & Compatibility</title>
  <style>
    :root { color-scheme: dark; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; background: #100c1b; color: #f8f4ff; line-height: 1.65; }
    body::before { content: ""; position: fixed; inset: 0; z-index: -1; pointer-events: none;
      background: radial-gradient(ellipse at 75% 8%, #4a285a 0, transparent 46%),
        radial-gradient(ellipse at 0% 75%, #222448 0, transparent 45%); }
    .wrap { width: min(1080px, calc(100% - 40px)); margin: 0 auto; }
    header { padding: 32px 0; display: flex; justify-content: space-between; align-items: center; gap: 16px; }
    .brand { font-weight: 800; letter-spacing: .04em; font-size: 1.1rem; }
    header a { color: #ded2f4; text-decoration: none; }
    header a:focus-visible, a:focus-visible { outline: 3px solid #d6a9ff; outline-offset: 4px; }
    .hero { padding: clamp(50px, 10vw, 124px) 0 72px; max-width: 790px; }
    .eyebrow { color: #cdb3f4; letter-spacing: .16em; text-transform: uppercase; font-size: .8rem; font-weight: 750; }
    h1 { font-size: clamp(2.9rem, 8vw, 5.6rem); line-height: 1.07; letter-spacing: -.055em; margin: 18px 0 22px; }
    .lead { font-size: clamp(1.08rem, 2.2vw, 1.32rem); color: #ddd4eb; max-width: 660px; }
    .actions { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; margin-top: 34px; }
    .primary { display: inline-flex; align-items: center; justify-content: center;
      background: #d7b5ff; color: #1e102c; border-radius: 14px; padding: 14px 22px;
      font-weight: 800; text-decoration: none; min-height: 50px; }
    .secondary { display: inline-flex; color: #e3d5f3; padding: 12px 0; }
    h2 { font-size: clamp(1.45rem, 3vw, 2rem); line-height: 1.3; margin: 0 0 23px; }
    .features { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; padding-bottom: 64px; }
    article { border: 1px solid #4a385a; border-radius: 18px; background: #201a2e;
      padding: clamp(20px, 4vw, 28px); }
    h3 { margin: 0 0 10px; font-size: 1.1rem; }
    article p { margin: 0; color: #cfc2de; }
    .tr { border-top: 1px solid #43364f; padding: 36px 0 55px; }
    .tr p { color: #ddd4eb; max-width: 710px; }
    footer { border-top: 1px solid #43364f; padding: 28px 0 46px; display: flex;
      justify-content: space-between; flex-wrap: wrap; gap: 14px; color: #c1b4d3; }
    footer nav { display: flex; flex-wrap: wrap; gap: 18px; }
    footer a { color: #e0c5ff; }
    @media (max-width: 620px) { header { padding-top: 24px; } .features { grid-template-columns: 1fr; }
      .hero { padding-top: 52px; padding-bottom: 44px; } }
  </style>
</head>
<body>
  <div class="wrap">
    <header>
      <span class="brand">✦ ASTROLOJİ</span>
      <a href="#features">Explore the app</a>
    </header>
    <main>
      <section class="hero" aria-labelledby="hero-title">
        <p class="eyebrow">Your daily moment with the stars</p>
        <h1 id="hero-title">Astrology for every day.</h1>
        <p class="lead">Read your daily horoscope, explore weekly and monthly guidance,
          compare zodiac compatibility and discover the traits of your sign.
          One Android app, with content in six supported languages.</p>
        <div class="actions">
          <a class="primary" href="${PLAY_STORE_URL}">View on Google Play</a>
          <a class="secondary" href="#features">See what’s inside</a>
        </div>
      </section>
      <section aria-labelledby="features-title" id="features">
        <h2 id="features-title">Made for your daily routine</h2>
        <div class="features">
          <article><h3>Daily horoscope</h3><p>Follow a short reflection for your zodiac sign each day.</p></article>
          <article><h3>Weekly and monthly outlooks</h3><p>Find a broader view of the days and weeks ahead.</p></article>
          <article><h3>Zodiac compatibility</h3><p>Explore sign combinations for love, friendship and work.</p></article>
          <article><h3>Sign insights and Premium</h3><p>Learn about zodiac traits and explore additional in-app content. Optional paid subscriptions are managed through Google Play.</p></article>
        </div>
      </section>
      <section class="tr" lang="tr" aria-labelledby="tr-title">
        <h2 id="tr-title">Günlük burç yorumunuz, bir adım yakınınızda.</h2>
        <p>Astroloji uygulamasında günlük burç yorumlarını okuyabilir, haftalık ve
          aylık rehberleri inceleyebilir, aşk ve arkadaşlık uyumunu keşfedebilirsiniz.
          İçerikler eğlence ve kişisel farkındalık amaçlıdır; kesin tahmin sunmaz.</p>
        <a class="primary" href="${PLAY_STORE_URL}">Google Play’de görüntüle</a>
      </section>
    </main>
    <footer>
      <span>© ParsFilo · Astroloji</span>
      <nav aria-label="Legal and contact">
        <a href="/privacy">Privacy / Gizlilik</a>
        <a href="/terms">Terms / Koşullar</a>
        <a href="/delete-account">Delete account / Hesap silme</a>
        <a href="mailto:info@parsfilo.com">Contact</a>
      </nav>
    </footer>
  </div>
</body>
</html>`;
}
