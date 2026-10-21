const forbiddenClaims = [
  ['free trial', /free trial|ücretsiz deneme/i],
  ['annual or yearly plan', /annual|yearly|yıllık/i],
  ['guaranteed outcome', /guaranteed|garantili/i],
  ['medical or diagnosis claim', /medical|diagnos|tıbbi (?:tanı|teşhis)|teşhis/i],
  ['financial advice', /financial advice|finansal (?:tavsiye|danışmanlık)/i],
  ['legal advice', /legal advice|hukuki (?:tavsiye|danışmanlık)|yasal (?:tavsiye|danışmanlık)/i],
  ['100% accurate claim', /100% accurate|%100 doğru|yüzde yüz doğru/i],
  ['psychic claim', /psychic|medyum/i],
];

// Only these complete, explicitly non-medical notices are exempt from claim screening.
// A new claim elsewhere in the listing is still rejected, even when a notice exists.
const nonMedicalNotices = {
  "tr-TR": "İsteğe bağlı ruh hâli kayıtları yalnızca astrolojik eğilim içgörüleri için kullanılır; sağlık takibi veya terapi hizmeti sunulmaz. Bu uygulama tıbbi bir cihaz değildir; herhangi bir sağlık sorununu teşhis, tedavi, iyileştirme veya önleme amacı taşımaz. Tıbbi tavsiye, tanı veya tedavi için nitelikli bir sağlık uzmanına danışın.",
  "en-US": "Optional mood check-ins support astrology-based pattern insights, not health monitoring or therapy. This app is not a medical device and does not diagnose, treat, cure, or prevent any medical condition. Consult a qualified healthcare professional for medical advice, diagnosis, or treatment.",
  "de-DE": "Optionale Stimmungseinträge dienen ausschließlich astrologischen Einblicken und nicht der medizinischen Überwachung oder Behandlung. Diese App ist kein Medizinprodukt und dient nicht der Diagnose, Behandlung, Heilung oder Vorbeugung von Krankheiten. Wenden Sie sich für medizinischen Rat, Diagnosen oder Behandlungen an qualifiziertes medizinisches Fachpersonal.",
  "fr-FR": "Les bilans d’humeur facultatifs servent uniquement à présenter des tendances astrologiques, pas à surveiller ni à traiter la santé. Cette application n’est pas un dispositif médical et ne permet pas de diagnostiquer, traiter, guérir ou prévenir une maladie. Pour tout avis, diagnostic ou traitement médical, consultez un professionnel de santé qualifié.",
  "es-ES": "Los registros opcionales del estado de ánimo sirven para mostrar tendencias astrológicas, no para el seguimiento ni tratamiento de la salud. Esta aplicación no es un dispositivo médico y no diagnostica, trata, cura ni previene ninguna enfermedad. Para consejos, diagnósticos o tratamientos médicos, consulta a un profesional sanitario cualificado.",
  "pt-BR": "Os registros opcionais de humor servem para mostrar tendências astrológicas, não para monitoramento ou tratamento de saúde. Este aplicativo não é um dispositivo médico e não diagnostica, trata, cura ou previne qualquer condição médica. Para orientações, diagnósticos ou tratamentos médicos, consulte um profissional de saúde qualificado."
};

function withoutApprovedMedicalNotice(locale, fullDescription) {
  const notice = nonMedicalNotices[locale];
  if (!notice || !fullDescription.trimEnd().endsWith(notice)) return fullDescription;
  return fullDescription.trimEnd().slice(0, -notice.length).trimEnd();
}

function normalize(value) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function turkishUnicodeRatio(value) {
  const letters = value.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const turkishSpecific = value.match(/[çğıöşüÇĞİÖŞÜ]/g) ?? [];
  return turkishSpecific.length / letters.length;
}

export function validateListingCopy({
  locale,
  title,
  shortDescription,
  fullDescription,
  englishFullDescription,
}) {
  const errors = [];
  const combined = [title, shortDescription, fullDescription].join('\n');

  for (const [label, pattern] of forbiddenClaims) {
    const screenedCopy =
      label === 'medical or diagnosis claim'
        ? [title, shortDescription, withoutApprovedMedicalNotice(locale, fullDescription)].join('\n')
        : combined;
    if (pattern.test(screenedCopy)) {
      errors.push(`${locale} contains forbidden claim: ${label}`);
    }
  }

  if (
    locale !== 'en-US' &&
    englishFullDescription &&
    normalize(fullDescription) === normalize(englishFullDescription)
  ) {
    errors.push(`${locale} full description duplicates en-US copy`);
  }

  if (locale === 'tr-TR' && turkishUnicodeRatio(combined) < 0.01) {
    errors.push('tr-TR Turkish Unicode ratio is below 1%');
  }

  return errors;
}
