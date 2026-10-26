const SUPPORT_EMAIL = 'info@parsfilo.com';
const LAST_UPDATED = '5 August 2026';
const PRIVACY_UPDATED = '26 October 2026';

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
<p class="meta"><strong>Son güncelleme / Last updated:</strong> ${PRIVACY_UPDATED}</p>
<p class="notice">Bu politika, ParsFilo tarafından sunulan <strong>Astroloji: Günlük Burç Yorumu</strong>
Android uygulamasının kişisel veri işleme uygulamalarını açıklar. Gizlilik soruları ve hak talepleri için
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> adresine ulaşabilirsiniz.</p>

<h2>1. Topladığımız ve işlediğimiz veriler</h2>
<ul>
  <li><strong>Hesap ve oturum bilgileri:</strong> Firebase kullanıcı kimliği, uygulama içi kullanıcı kimliği
    ve oturum belirteçleri.</li>
  <li><strong>Tercihler:</strong> seçilen burç, uygulama dili, saat dilimi farkı, bildirim tercihi ve saati.</li>
  <li><strong>Bildirim verileri:</strong> Firebase installation ID, platform bilgisi ve geçiş süresince eski uygulama sürümlerinden gelebilen FCM registration token.</li>
  <li><strong>Kullanım, yapılandırılmış geri bildirim ve analiz verileri:</strong> açılan ekranlar, içerik
    etkileşimleri, paylaşım düğmesi tıklamaları, reklam gösterimi, abonelik akışı ve günlük yorum için seçilen
    <em>uydu / kısmen / bugün değil</em> kategorisi gibi uygulama içi olaylar ile bunlara ilişkin sınırlı metadata.
    Serbest günlük metni veya kişisel not toplanmaz.</li>
  <li><strong>İsteğe bağlı ruh hâli kayıtları:</strong> Kullanıcı ruh hâlini (örneğin iyi, düşük
    veya stresli) işaretlerse seçilen kategori, tarih ve varsa yaşam alanı uygulama API'si
    üzerinden hesapla ilişkilendirilerek veritabanında saklanır. Bu kayıtlar kişiselleştirilmiş
    ruh hâli eğilimi/içgörüsü oluşturmak için kullanılabilir. Google Play'de dağıtılmış eski uygulama
    sürümleri <em>mood_logged</em> analitik olayında seçilen ruh hâli kategorisini Firebase Analytics'e
    ve uygulama API'sine gönderebilir. Yeni uygulama kodunda bu kategori analitik olaydan çıkarılmıştır;
    eski istemcilerden sunucuya gelen olayların kategori metadata'sı da kayıttan önce temizlenir.
    Hesap silindiğinde uygulama veritabanındaki hesapla ilişkili ruh hâli kayıtları silinir.
    Ruh hâli geçmişinin hesaba dokunmadan silinmesi, bu özelliği sunan yeni uygulama
    sürümlerinde Ayarlar ekranından ayrıca başlatılabilir; işlem uygulamanın
    veritabanındaki kayıtları ve bu hesaba ait <em>mood_logged</em> olaylarını siler.
    Eski Play sürümlerinde bu seçenek bulunmayabilir. Firebase Analytics'e geçmişte
    gönderilmiş olayların saklanması ayrı hizmet koşullarına tabidir.</li>
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
  <li><strong>Kaydedilen doğum profili (isteğe bağlı):</strong> Doğum haritası ve danışmanlık özellikleri
için kullanıcı ayrıca tarihini, doğum saatini (biliniyorsa) ve doğum şehrini girebilir. Bu bilgiler
uygulamanın API hizmetine iletilir. Tarih/saat ve şehirden hesaplanan koordinat ve zaman bilgileri
kullanıcı hesabına bağlı olarak sunucu veritabanında şifreli biçimde saklanabilir. Hesap silindiğinde
bu kayıt da silinir. Hesabı koruyarak yalnızca kaydedilmiş doğum profilini silme seçeneği bu özelliği
içeren yeni uygulama sürümlerinin Ayarlar ekranında sunulur; Google Play'de dağıtılmış eski
sürümlerde bu seçenek bulunmayabilir. Bu durumda belirli verilerin silinmesini talep etmek için
<a href="mailto:${SUPPORT_EMAIL}?subject=Astroloji%20veri%20silme%20talebi">${SUPPORT_EMAIL}</a>
adresine başvurabilirsiniz. Bu saklama, yalnızca Kişisel Rehber Beta'da istek sırasında yapılan
geçici işlemeden ayrı bir akıştır.</li>
  <li><strong>İsteğe bağlı AI sohbet mesajları:</strong> Kullanıcı sohbet özelliğinde bir mesaj gönderdiğinde,
mesaj ve ilgili konuşma bağlamı ile doğum profilinden hesaplanan harita özeti (Güneş, Ay, Venüs
ve Mars burçları/dereceleri ve hesaplanabiliyorsa yükselen burç/derece) yanıt oluşturulması
amacıyla uygulama API'sine ve metin üretim hizmet sağlayıcılarına iletilir. Sohbet içeriği uygulama backend'inin kullanıcı veritabanında
konuşma geçmişi olarak saklanmaz; hizmet sağlayıcıların işleme koşulları ayrıca uygulanabilir.</li>
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
  <li>İsteğe bağlı ruh hâli kayıtlarıyla kullanıcıya özel eğilim/içgörü üretmek ve
    sınırlı kategorik kullanım olaylarını analiz etmek.</li>
  <li>Bildirim tercihlerini uygulamak ve istenen bildirimleri göndermek.</li>
  <li>Premium abonelikleri doğrulamak, geri yüklemek ve kötüye kullanımı önlemek.</li>
  <li>Uygulama kararlılığını, güvenliğini, performansını ve kullanıcı deneyimini geliştirmek.</li>
  <li>Kullanıcının seçtiği doğum bilgileriyle doğum haritası ve isteğe bağlı AI danışmanlığı sunmak.</li>
  <li>Onay tercihleri doğrultusunda reklam sunmak ve reklam sıklığını yönetmek.</li>
  <li>Yasal yükümlülükleri yerine getirmek ve hak taleplerini yanıtlamak.</li>
</ul>

<h2>3. Hizmet sağlayıcılar ve veri aktarımı</h2>
<p>Uygulamanın çalışması için aşağıdaki hizmet kategorilerinden yararlanırız:</p>
<ul>
  <li><strong>Google Firebase:</strong> Authentication, Analytics, Cloud Messaging, Crashlytics ve Remote Config.</li>
  <li><strong>Google Play:</strong> uygulama dağıtımı ve abonelik/faturalandırma işlemleri.</li>
  <li><strong>Google Mobile Ads ve User Messaging Platform:</strong> reklam sunumu ve onay yönetimi.</li>
  <li><strong>Metin üretim hizmet sağlayıcıları:</strong> Kullanıcı açıkça AI sohbet veya danışmanlık
istediğinde içerik üretimi için gerekli mesaj ve sınırlı bağlamı işleyebilir.</li>
  <li><strong>Cloudflare:</strong> API barındırma, veritabanı, nesne depolama, önbellek ve güvenlik hizmetleri.</li>
</ul>
<p>Bu sağlayıcılar verileri kendi altyapılarında ve hizmet koşulları kapsamında işleyebilir. Uluslararası veri
aktarımı, kullanılan hizmetlerin altyapısı ve uygulanabilir veri koruma kuralları çerçevesinde gerçekleşebilir.</p>

<h2>4. Saklama, güvenlik ve silme</h2>
<p>Verileri hizmeti sunmak, güvenliği sağlamak, abonelikleri doğrulamak ve yasal yükümlülükleri yerine getirmek
için gerekli olduğu sürece saklarız. Kişisel Rehber doğum tarihi yalnızca gerçek zamanlı istek belleğinde tutulur
ve bu özellik tarafından kalıcı depolamaya yazılmaz. Son yapılandırılmış günlük geri bildirim tarihi ve kategorisi,
aynı sorunun tekrar gösterilmemesi için cihazda tutulur; uygulama verileri temizlendiğinde veya uygulama
kaldırıldığında silinir. Kaydedilmiş doğum profili ise kullanıcı tarafından silinene veya hesap
silme talebi tamamlanana kadar sunucu veritabanında şifreli olarak saklanır. AI sohbet mesajları,
isteğe bağlı danışmanlık isteğinin işlenmesi için harici hizmet sağlayıcılarına iletilebilir.
İsteğe bağlı ruh hâli kayıtları, sunucu tarafında hesapla ilişkilendirilerek
hesap silinene veya uyumlu yeni uygulama sürümündeki ruh hâli geçmişi silme işlemi
tamamlanana kadar tutulabilir; bu kayıtları cihazdaki günlük geri bildirim
tercihleriyle karıştırmamak gerekir.
Diğer cihaz tercihleri ve önbellek de aynı şekilde yerel veri temizliğiyle silinebilir. Sunucu tarafındaki hesap ve ilişkili verileri uygulamadaki Ayarlar ekranından silebilir veya
<a href="/delete-account">hesap ve veri silme sayfasındaki</a> adımları izleyebilirsiniz. Uygulamaya erişemiyorsanız
<a href="mailto:${SUPPORT_EMAIL}?subject=Astroloji%20veri%20silme%20talebi">${SUPPORT_EMAIL}</a> adresine yazabilirsiniz. Kimliğinizi ve hesabın size ait olduğunu doğrulamak için
sınırlı ek bilgi isteyebiliriz.</p>
<p>Aktarım sırasında HTTPS kullanırız ve erişimi sınırlandırmak için kimlik doğrulama, yetkilendirme ve servis
sağlayıcı güvenlik kontrollerinden yararlanırız. Hiçbir elektronik sistem mutlak güvenlik garantisi vermez.</p>

<h2>5. Seçimleriniz ve haklarınız</h2>
<ul>
  <li>Bildirim iznini ve bildirim tercihlerini cihaz veya uygulama ayarlarından değiştirebilirsiniz.</li>
  <li>Uygulamadaki gizlilik seçeneklerinden reklam onay tercihlerinizi yönetebilirsiniz.</li>
  <li>Bu seçenekleri sunan yeni uygulama sürümlerinde kaydedilmiş doğum profilini
ve ruh hâli geçmişini hesabınızı silmeden ayrı ayrı kaldırabilirsiniz.
Eski sürümlerde veya başka veriler için belirli verilerin silinmesi
talebinizi ${SUPPORT_EMAIL} adresine iletebilirsiniz; talebin kapsamı kimlik doğrulaması
ve geçerli saklama yükümlülükleri çerçevesinde değerlendirilir.</li>
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
preferences, time-zone and notification settings, Firebase installation IDs, transitional legacy FCM tokens, bounded app-interaction analytics, structured
daily feedback categories, subscription records, and diagnostic/device/ad data needed to operate, secure,
improve and monetize the app. Optional mood check-ins (for example, good, low or stressed) are
associated with the account and stored with the date and optional life domain in the backend
until account deletion or account-preserving mood-history deletion in compatible newer
versions, for mood-pattern insights. Older distributed app versions may send the
selected mood category with the <code>mood_logged</code> event to Firebase Analytics and the app API.
In newer client code that event no longer includes the category, and the backend removes metadata
from legacy mood events before storage. Account deletion removes account-linked mood records from
our application database; earlier Firebase Analytics events are subject to the service's separate
retention terms. Compatible newer app versions can remove account-linked mood check-ins
and app-owned mood events without deleting the account; older distributed versions may lack
the option. This does not delete historical Firebase Analytics events.
Optional birth-profile details (date, time and birth city) are stored encrypted
for natal-chart and consultation features. Account deletion also removes this stored profile.
Account-preserving deletion of only the saved birth profile is available in app versions offering
that option; older distributed versions may lack the control. Users can contact our support
address to request assessment of deletion of specific data without deleting the account.
This is distinct from the transient Personal Guidance Beta calculation. For AI consultations, user-initiated chat messages, conversation context and
a computed birth-chart summary (Sun, Moon, Venus and Mars signs/degrees, plus ascendant
sign/degree when available) are transmitted to our API and text-generation providers to
generate replies. When a user explicitly requests Personal Guidance, the date of birth is transmitted
to the backend and processed ephemerally in memory for that real-time calculation; this feature does not write it
to persistent storage, analytics or logs. Anonymous share links contain a zodiac sign or canonical sign pair, not
an account ID or recipient identity. Google/Firebase, Google Play, Google Mobile Ads/UMP and Cloudflare may
process data as service providers. Payment card details are handled by Google Play, not by ParsFilo. Contact
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a> for privacy questions, access/correction requests or
deletion of your server-side account data, including saved encrypted birth-profile records.`
  );
}

export function renderAccountDeletion(): string {
  return pageShell(
    'Astroloji Account and Data Deletion / Hesap ve Veri Silme',
    'Instructions for deleting an Astroloji account and associated personal data.',
    `<h1>Hesap ve Veri Silme</h1>
<p class="meta"><strong>Son güncelleme / Last updated:</strong> ${PRIVACY_UPDATED}</p>
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
  <li>Hesaba bağlı şifreli kaydedilmiş doğum profili ve ruh hâli kayıtları.</li>
  <li>Cihazdaki yerel profil, favoriler, son günlük geri bildirim kategorisi, bekleyen olaylar, oturum ve
    onboarding tercihleri.</li>
</ul>

<h2>Google Play aboneliği</h2>
<p><strong>Hesabın silinmesi Google Play aboneliğinizi otomatik olarak iptal etmez.</strong> Aktif bir
aboneliğiniz varsa, gelecekte ücret alınmaması için Google Play Store hesabınızdaki Abonelikler bölümünden
ayrıca yönetmeniz veya iptal etmeniz gerekir. Google Play'in yasal ve finansal kayıtları kendi saklama
kurallarına tabidir.</p>

<h2>Hesabı koruyarak belirli verilerin silinmesi</h2>
<p>Hesabınızı koruyarak kaydedilmiş doğum profilinizi veya ruh hâli geçmişinizi ayrı
işlemlerle silme seçenekleri, bunları destekleyen yeni uygulama sürümlerinde
<strong>Profil / Ayarlar</strong> ekranında bulunur. Ruh hâli geçmişini silme, uygulama
veritabanındaki hesaba bağlı ruh hâli kayıtlarıyla uygulamaya ait <em>mood_logged</em>
analitik olaylarını kapsar; daha önce Firebase Analytics'e iletilmiş verileri silmez.
Eski sürümlerde bu seçenekler görünmeyebilir. Kayıtlı doğum profiliniz veya diğer belirli veri kategorileri hakkında
hesabınızı silmeden inceleme ve silme talebinde bulunmak için
<a href="mailto:${SUPPORT_EMAIL}?subject=Astroloji%20belirli%20veri%20silme%20talebi">${SUPPORT_EMAIL}</a>
adresine hangi verilerin söz konusu olduğunu belirterek yazabilirsiniz. Bu yol, uygulamanın tüm
veri kategorileri için ayrı bir otomatik silme düğmesi sunduğu anlamına gelmez. Talebin kapsamı
ve geçerli saklama yükümlülükleri doğrulama sonrasında değerlendirilir.</p>

<h2>E-posta ile hesap silme talebi</h2>
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
profile, notification token, encrypted saved birth profile, mood logs,
user-linked subscription records, events, reward records, last local daily feedback
category, and other local app data. Personal Guidance birth dates are not retained by the chart feature.
Deleting the Astroloji account does not automatically cancel an active Google Play subscription; manage it
separately in Google Play. Compatible newer app versions may offer a separate, account-preserving
deletion action for the saved birth profile under Profile / Settings. Older distributed versions
may not have this action. Compatible newer versions can also erase account-linked mood
check-ins and app-owned mood event history without deleting the account; previously delivered
Firebase Analytics events remain subject to separate retention terms. To request review
or deletion of specific data without deleting your account, describe the data concerned in an email to
<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>. Other data categories do not necessarily have
individual self-service deletion controls; requests are assessed subject to identity verification
and applicable retention obligations.</p>`
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
