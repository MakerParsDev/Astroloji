const SUPPORT_EMAIL = 'info@parsfilo.com';
const LAST_UPDATED = '5 August 2026';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function pageShell(title: string, description: string, content: string): string {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);

  return `<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="${safeDescription}">
  <title>${safeTitle}</title>
  <style>
    :root { color-scheme: light dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #f7f5fb; color: #211a2b; line-height: 1.65; }
    main { width: min(900px, calc(100% - 32px)); margin: 40px auto; padding: 40px; background: #fff;
      border: 1px solid #e7e1ef; border-radius: 20px; box-shadow: 0 16px 48px rgba(39, 22, 58, .08); }
    h1, h2, h3 { line-height: 1.25; color: #2b1740; }
    h1 { margin-top: 0; font-size: clamp(2rem, 6vw, 3.25rem); }
    h2 { margin-top: 2.25rem; padding-top: 1rem; border-top: 1px solid #ece7f2; }
    h3 { margin-top: 1.5rem; }
    a { color: #6f35a5; }
    .meta { color: #665d70; }
    .notice { padding: 16px 18px; background: #f4eef9; border-left: 4px solid #7e45ad; border-radius: 8px; }
    ul { padding-left: 1.3rem; }
    footer { margin-top: 3rem; padding-top: 1.25rem; border-top: 1px solid #ece7f2; color: #665d70; }
    @media (prefers-color-scheme: dark) {
      body { background: #17121d; color: #eee8f4; }
      main { background: #221a2b; border-color: #3b2f47; box-shadow: none; }
      h1, h2, h3 { color: #fbf7ff; }
      h2, footer { border-color: #3b2f47; }
      a { color: #d4a8fa; }
      .meta, footer { color: #c9bfd1; }
      .notice { background: #30223c; border-left-color: #c28fe9; }
    }
  </style>
</head>
<body>
  <main>
    ${content}
    <footer>Astroloji · ParsFilo · <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a></footer>
  </main>
</body>
</html>`;
}

export function renderPrivacyPolicy(): string {
  return pageShell(
    'Astroloji Privacy Policy / Gizlilik Politikası',
    'Astroloji mobile application privacy policy and personal data notice.',
    `<h1>Gizlilik Politikası</h1>
<p class="meta"><strong>Son güncelleme / Last updated:</strong> ${LAST_UPDATED}</p>
<p class="notice">Bu politika, ParsFilo tarafından sunulan <strong>Astroloji: Günlük Burç Yorumu</strong>
Android uygulamasının kişisel veri işleme uygulamalarını açıklar. Gizlilik soruları ve hak talepleri için
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> adresine ulaşabilirsiniz.</p>

<h2>1. Topladığımız ve işlediğimiz veriler</h2>
<ul>
  <li><strong>Hesap ve oturum bilgileri:</strong> Firebase kullanıcı kimliği, uygulama içi kullanıcı kimliği
    ve oturum belirteçleri.</li>
  <li><strong>Tercihler:</strong> seçilen burç, uygulama dili, saat dilimi farkı, bildirim tercihi ve saati.</li>
  <li><strong>Bildirim verileri:</strong> Firebase Cloud Messaging cihaz belirteci ve platform bilgisi.</li>
  <li><strong>Kullanım, yapılandırılmış geri bildirim ve analiz verileri:</strong> açılan ekranlar, içerik
    etkileşimleri, paylaşım düğmesi tıklamaları, reklam gösterimi, abonelik akışı ve günlük yorum için seçilen
    <em>uydu / kısmen / bugün değil</em> kategorisi gibi uygulama içi olaylar ile bunlara ilişkin sınırlı metadata.
    Serbest günlük metni veya kişisel not toplanmaz.</li>
  <li><strong>Satın alma ve abonelik verileri:</strong> ürün kimliği, Google Play satın alma belirteci,
    abonelik durumu ve geçerlilik tarihleri. Ödeme kartı bilgilerini ParsFilo toplamaz; ödeme Google Play
    tarafından işlenir.</li>
  <li><strong>Tanılama, cihaz ve reklam verileri:</strong> çökme kayıtları, performans bilgileri, uygulama
    ve cihaz tanımlayıcıları, reklam etkileşimleri ve reklam onay durumu; kullanılan Google/Firebase SDK'ları
    tarafından işlenebilir.</li>
  <li><strong>İsteğe bağlı doğum tarihi:</strong> Kişisel Rehber Beta özelliğinde, kullanıcı açıkça hesaplama
    istediğinde doğum tarihi cihazdan API'ye gönderilir. Bu veri yalnızca ilgili gerçek zamanlı hesaplamayı
    tamamlamak için geçici (ephemeral) olarak bellekte işlenir; bu özellik tarafından D1, R2, analitik, log veya
    Android tercihleri gibi kalıcı depolamaya yazılmaz. Doğum saati ve doğum yeri bu beta sürümünde toplanmaz.</li>
  <li><strong>Anonim paylaşım bağlantıları:</strong> günlük burç veya burç çifti içeren herkese açık bağlantılar
    oluşturulabilir. Bu bağlantılar hesap kimliği, kullanıcı kimliği, skor geçmişi, alıcı kimliği veya reklam
    takip parametresi içermez.</li>
</ul>
<p>Normal profil ve onboarding akışında sunucuya seçilen veya hesaplanan burç gönderilir. Doğum tarihi yalnızca
kullanıcının Kişisel Rehber hesaplamasını ayrı olarak başlatması halinde yukarıdaki geçici işlem için gönderilir.</p>

<h2>2. Verileri hangi amaçlarla kullanıyoruz?</h2>
<ul>
  <li>Uygulamayı çalıştırmak, oturum oluşturmak ve kişiselleştirilmiş burç içeriği sunmak.</li>
  <li>Kullanıcının isteği üzerine doğum tarihi tabanlı, sürümlü ve sınırlamaları açık bir kişisel rehber
    hesaplamak; doğum tarihini bu gerçek zamanlı istek sonrasında kalıcı olarak saklamamak.</li>
  <li>Yapılandırılmış günlük geri bildirim ve paylaşım tıklamalarını içerik kalitesi ile ürün deneyimini
    geliştirmek amacıyla ölçmek.</li>
  <li>Bildirim tercihlerini uygulamak ve istenen bildirimleri göndermek.</li>
  <li>Premium abonelikleri doğrulamak, geri yüklemek ve kötüye kullanımı önlemek.</li>
  <li>Uygulama kararlılığını, güvenliğini, performansını ve kullanıcı deneyimini geliştirmek.</li>
  <li>Onay tercihleri doğrultusunda reklam sunmak ve reklam sıklığını yönetmek.</li>
  <li>Yasal yükümlülükleri yerine getirmek ve hak taleplerini yanıtlamak.</li>
</ul>

<h2>3. Hizmet sağlayıcılar ve veri aktarımı</h2>
<p>Uygulamanın çalışması için aşağıdaki hizmet kategorilerinden yararlanırız:</p>
<ul>
  <li><strong>Google Firebase:</strong> Authentication, Analytics, Cloud Messaging, Crashlytics ve Remote Config.</li>
  <li><strong>Google Play:</strong> uygulama dağıtımı ve abonelik/faturalandırma işlemleri.</li>
  <li><strong>Google Mobile Ads ve User Messaging Platform:</strong> reklam sunumu ve onay yönetimi.</li>
  <li><strong>Cloudflare:</strong> API barındırma, veritabanı, nesne depolama, önbellek ve güvenlik hizmetleri.</li>
</ul>
<p>Bu sağlayıcılar verileri kendi altyapılarında ve hizmet koşulları kapsamında işleyebilir. Uluslararası veri
aktarımı, kullanılan hizmetlerin altyapısı ve uygulanabilir veri koruma kuralları çerçevesinde gerçekleşebilir.</p>

<h2>4. Saklama, güvenlik ve silme</h2>
<p>Verileri hizmeti sunmak, güvenliği sağlamak, abonelikleri doğrulamak ve yasal yükümlülükleri yerine getirmek
için gerekli olduğu sürece saklarız. Kişisel Rehber doğum tarihi yalnızca gerçek zamanlı istek belleğinde tutulur
ve bu özellik tarafından kalıcı depolamaya yazılmaz. Son yapılandırılmış günlük geri bildirim tarihi ve kategorisi,
aynı sorunun tekrar gösterilmemesi için cihazda tutulur; uygulama verileri temizlendiğinde veya uygulama
kaldırıldığında silinir. Diğer cihaz tercihleri ve önbellek de aynı şekilde yerel veri temizliğiyle silinebilir. Sunucu tarafındaki hesap ve ilişkili verileri uygulamadaki Ayarlar ekranından silebilir veya
<a href="/delete-account">hesap ve veri silme sayfasındaki</a> adımları izleyebilirsiniz. Uygulamaya erişemiyorsanız
<a href="mailto:${SUPPORT_EMAIL}?subject=Astroloji%20veri%20silme%20talebi">${SUPPORT_EMAIL}</a> adresine yazabilirsiniz. Kimliğinizi ve hesabın size ait olduğunu doğrulamak için
sınırlı ek bilgi isteyebiliriz.</p>
<p>Aktarım sırasında HTTPS kullanırız ve erişimi sınırlandırmak için kimlik doğrulama, yetkilendirme ve servis
sağlayıcı güvenlik kontrollerinden yararlanırız. Hiçbir elektronik sistem mutlak güvenlik garantisi vermez.</p>

<h2>5. Seçimleriniz ve haklarınız</h2>
<ul>
  <li>Bildirim iznini ve bildirim tercihlerini cihaz veya uygulama ayarlarından değiştirebilirsiniz.</li>
  <li>Uygulamadaki gizlilik seçeneklerinden reklam onay tercihlerinizi yönetebilirsiniz.</li>
  <li>Kişisel Rehber özelliğini kullanmama, seçili doğum tarihini ve sonucu ekrandaki temizleme düğmesiyle anında
    kaldırma seçeneğiniz vardır.</li>
  <li>Verilerinize erişim, düzeltme, silme, işleme itirazı veya diğer uygulanabilir haklarınız için bize yazabilirsiniz.</li>
</ul>

<h2>6. Çocukların gizliliği</h2>
<p>Uygulama özellikle çocuklara yönelik değildir. Bir çocuğa ait verinin uygun yetki olmadan işlendiğini
öğrenirsek, inceleme ve gerekli silme işlemleri için bizimle iletişime geçilmesini isteriz.</p>

<h2>7. Değişiklikler</h2>
<p>Bu politikayı ürün, hizmet sağlayıcı veya mevzuat değişikliklerine göre güncelleyebiliriz. Güncel sürüm bu
sayfada yayımlanır ve üst bölümdeki tarih değiştirilir.</p>

<h2>English summary</h2>
<p>ParsFilo operates the Astroloji Android app. We process account/session identifiers, zodiac and language
preferences, time-zone and notification settings, FCM tokens, bounded app-interaction analytics, structured
daily feedback categories, subscription records, and diagnostic/device/ad data needed to operate, secure,
improve and monetize the app. When a user explicitly requests Personal Guidance, the date of birth is transmitted
to the backend and processed ephemerally in memory for that real-time calculation; this feature does not write it
to persistent storage, analytics or logs. Anonymous share links contain a zodiac sign or canonical sign pair, not
an account ID or recipient identity. Google/Firebase, Google Play, Google Mobile Ads/UMP and Cloudflare may
process data as service providers. Payment card details are handled by Google Play, not by ParsFilo. Contact
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> for privacy questions, access/correction requests or
deletion of your server-side account data.`
  );
}

export function renderAccountDeletion(): string {
  return pageShell(
    'Astroloji Account and Data Deletion / Hesap ve Veri Silme',
    'Instructions for deleting an Astroloji account and associated personal data.',
    `<h1>Hesap ve Veri Silme</h1>
<p class="meta"><strong>Son güncelleme / Last updated:</strong> ${LAST_UPDATED}</p>
<p class="notice">Astroloji hesabınızı ve hesabınıza bağlı kişisel verileri uygulama içinden kalıcı olarak
silebilirsiniz. Yardım veya uygulamaya erişemediğiniz durumlar için
<a href="mailto:${SUPPORT_EMAIL}?subject=Astroloji%20hesap%20silme">${SUPPORT_EMAIL}</a> adresine yazabilirsiniz.</p>

<h2>Uygulama içinden silme adımları</h2>
<ol>
  <li>Astroloji uygulamasını açın.</li>
  <li><strong>Profil / Ayarlar</strong> ekranına gidin.</li>
  <li><strong>Hesap ve veriler</strong> bölümünde <strong>Hesabı ve verileri sil</strong> seçeneğine dokunun.</li>
  <li>Kalıcı silme uyarısını okuyup işlemi onaylayın.</li>
</ol>
<p>İşlem tamamlandığında uygulama oturumunuz kapatılır ve onboarding ekranına dönersiniz. Silme işlemi geri
alınamaz.</p>

<h2>Silinen veriler</h2>
<ul>
  <li>Firebase kimlik doğrulama hesabı ve uygulama içi kullanıcı kimliği.</li>
  <li>Burç, dil, saat dilimi ve bildirim tercihleri.</li>
  <li>FCM bildirim belirteçleri ve cihazla ilişkilendirilmiş bildirim ayarları.</li>
  <li>Satın alma belirteciyle ilişkilendirilmiş uygulama abonelik kayıtları ve abonelik olayları.</li>
  <li>Hesaba bağlı uygulama kullanım olayları ve ödül hakediş kayıtları.</li>
  <li>Cihazdaki yerel profil, favoriler, son günlük geri bildirim kategorisi, bekleyen olaylar, oturum ve
    onboarding tercihleri.</li>
</ul>

<h2>Google Play aboneliği</h2>
<p><strong>Hesabın silinmesi Google Play aboneliğinizi otomatik olarak iptal etmez.</strong> Aktif bir
aboneliğiniz varsa, gelecekte ücret alınmaması için Google Play Store hesabınızdaki Abonelikler bölümünden
ayrıca yönetmeniz veya iptal etmeniz gerekir. Google Play'in yasal ve finansal kayıtları kendi saklama
kurallarına tabidir.</p>

<h2>E-posta ile talep</h2>
<p>Uygulamaya erişemiyorsanız ${SUPPORT_EMAIL} adresine "Astroloji hesap silme" konusuyla yazın. Hesabın size
ait olduğunu doğrulamak için sınırlı bilgi isteyebiliriz. Parola, ödeme kartı bilgisi veya servis hesabı anahtarı
göndermeyin.</p>

<h2>Saklanabilecek sınırlı kayıtlar</h2>
<p>Hesabınıza bağlı operasyonel veriler silinir. Yasal yükümlülük, dolandırıcılık önleme veya muhasebe amacıyla
saklanması zorunlu olan Google Play işlem kayıtları ilgili hizmet sağlayıcının ve yürürlükteki mevzuatın
saklama sürelerine tabi olabilir. Kullanıcıyla ilişkilendirilemeyen toplulaştırılmış veya anonim hale getirilmiş
istatistikler kişisel hesap verisi olarak tutulmaz.</p>

<h2>Account and Data Deletion</h2>
<p>Open Astroloji, go to <strong>Profile / Settings</strong>, choose <strong>Account and data</strong>, then
confirm <strong>Delete account and data</strong>. This permanently removes the Firebase identity, application
profile, notification token, user-linked subscription records, events, reward records, last local daily feedback
category, and other local app data. Personal Guidance birth dates are not retained by the chart feature.
Deleting the Astroloji account does not automatically cancel an active Google Play subscription; manage it
separately in Google Play. If you cannot access the app, contact
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>.</p>`
  );
}

export function renderTermsOfUse(): string {
  return pageShell(
    'Astroloji Terms of Use / Kullanım Koşulları',
    'Astroloji mobile application terms of use.',
    `<h1>Kullanım Koşulları</h1>
<p class="meta"><strong>Son güncelleme / Last updated:</strong> ${LAST_UPDATED}</p>
<p class="notice">Astroloji uygulamasını indirerek veya kullanarak bu koşulları kabul etmiş olursunuz.
Koşulları kabul etmiyorsanız uygulamayı kullanmayın. Sorular için
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> adresine ulaşabilirsiniz.</p>

<h2>1. Hizmetin kapsamı</h2>
<p>Astroloji; günlük, haftalık ve aylık burç yorumları, kişilik ve uyumluluk içerikleri, bildirimler,
reklam destekli özellikler, doğum tarihi tabanlı kişisel rehber beta özelliği ve isteğe bağlı premium abonelikler
sunar. Kişisel rehber beta doğum saati veya konum toplamaz; yükselen ve ev hesaplaması içermez ve belirsiz saatten
etkilenen Ay sinyallerini dışarıda bırakır. Tüm içerikler eğlence ve genel bilgilendirme/öz değerlendirme amaçlıdır;
tıbbi, hukuki, finansal, psikolojik veya diğer profesyonel tavsiye değildir.</p>

<h2>2. Uygun kullanım</h2>
<p>Uygulamayı yürürlükteki kurallara uygun kullanmayı; hizmete, diğer kullanıcılara veya altyapıya zarar
verecek davranışlarda bulunmamayı kabul edersiniz. Yetkisiz erişim, tersine mühendislik yoluyla güvenlik
kontrollerini aşma, otomatik kötüye kullanım, sahte satın alma veya ödül manipülasyonu yasaktır.</p>

<h2>3. Hesap ve güvenlik</h2>
<p>Uygulama, hizmeti sunmak için anonim veya oluşturulmuş bir Firebase oturumu kullanabilir. Cihazınızın ve
hesabınızın güvenliğinden siz sorumlusunuz. Şüpheli kullanım tespit edilmesi halinde erişim geçici olarak
sınırlandırılabilir veya sonlandırılabilir.</p>

<h2>4. Premium abonelikler</h2>
<ul>
  <li>Satın alma, yenileme, iptal ve iade işlemleri Google Play hesabınız üzerinden yürütülür.</li>
  <li>Fiyat, dönem ve deneme bilgileri satın alma ekranında gösterilir.</li>
  <li>Abonelikler Google Play ayarlarından yönetilebilir veya iptal edilebilir.</li>
  <li>İptal, aksi Google Play tarafından belirtilmedikçe mevcut ücretli dönemin sonuna kadar erişimi durdurmaz.</li>
  <li>Premium durumunun doğrulanması için satın alma belirteci Google Play ile kontrol edilebilir.</li>
</ul>

<h2>5. Reklamlar ve üçüncü taraf hizmetleri</h2>
<p>Ücretsiz sürümde reklamlar gösterilebilir. Reklam ve analiz sağlayıcıları kendi koşul ve politikalarına tabi
olabilir. Uygulamadaki bağlantılar veya üçüncü taraf hizmetleri üzerinde ParsFilo'nun tam kontrolü yoktur.</p>

<h2>6. Fikri mülkiyet</h2>
<p>Uygulama, tasarım, yazılım, marka unsurları ve özgün içerikler; ParsFilo'nun veya ilgili lisans verenlerin
haklarına tabidir. Size yalnızca kişisel ve ticari olmayan kullanım için sınırlı, geri alınabilir ve devredilemez
bir kullanım hakkı verilir.</p>

<h2>7. Hizmet değişiklikleri ve kullanılabilirlik</h2>
<p>Özellikleri, içerikleri, fiyatlandırmayı veya hizmetin bir bölümünü değiştirebilir, geçici olarak durdurabilir
veya sona erdirebiliriz. Kesintisiz ya da hatasız çalışma garantisi verilmez; ancak makul ölçüde güvenli ve
çalışır bir hizmet sunmaya gayret ederiz.</p>

<h2>8. Sorumluluğun sınırı</h2>
<p>Uygulama ve astroloji içerikleri "olduğu gibi" sunulur. Yürürlükteki hukukun izin verdiği ölçüde,
uygulamadaki yorumlara dayanılarak alınan kişisel kararlardan veya öngörülemeyen dolaylı kayıplardan sorumlu
tutulamayız. Tüketicilere tanınan zorunlu yasal haklar saklıdır.</p>

<h2>9. Gizlilik ve sona erdirme</h2>
<p>Veri işleme uygulamalarımız <a href="/privacy">Gizlilik Politikası</a> içinde açıklanır. Bu koşulları ihlal
etmeniz veya güvenlik riski oluşturmanız halinde erişimi sınırlandırabiliriz. Uygulamayı kaldırarak kullanımı
sona erdirebilirsiniz; hesap ve verilerinizi silmek için <a href="/delete-account">silme adımlarını</a> kullanabilirsiniz.</p>

<h2>10. Koşullardaki değişiklikler</h2>
<p>Bu koşullar ürün veya mevzuat değişikliklerine göre güncellenebilir. Güncel sürüm bu sayfada yayımlanır.</p>

<h2>English summary</h2>
<p>Astroloji provides entertainment and general-information astrology content, a date-of-birth based Personal
Guidance beta, ad-supported features and optional Google Play subscriptions. The beta does not calculate houses
or an ascendant and explicitly carries birth-time limitations. It is not professional medical, legal, financial
or psychological advice.
Use must be lawful and must not compromise the service. Purchases, renewals, cancellations and refunds are
handled through Google Play. The app and content are provided subject to mandatory consumer rights and the
limitations permitted by applicable law. Contact <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
with questions.</p>`
  );
}
