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

const LANGUAGES = ['tr', 'en', 'es', 'pt', 'de', 'fr'] as const;

type Sign = (typeof SIGNS)[number];
type Language = (typeof LANGUAGES)[number];
type Element = 'fire' | 'earth' | 'air' | 'water';
type Modality = 'cardinal' | 'fixed' | 'mutable';
type LocalizedPair = Record<Language, readonly [string, string]>;
type LocalizedList = Record<Language, readonly string[]>;

type SignProfile = {
  element: Element;
  modality: Modality;
  planet: Record<Language, string>;
  strengths: LocalizedPair;
  weaknesses: LocalizedPair;
  careerFit: LocalizedPair;
  idealPartners: readonly [Sign, Sign];
  color: Record<Language, string>;
  stone: Record<Language, string>;
  focus: Record<Language, string>;
};

export type ContentSeedUpload = {
  key: string;
  payload: object;
};

export type ContentSeedOptions = {
  seedDate?: string;
  dailyDays?: number;
  skipStaticContent?: boolean;
  language?: Language;
};

type ContentSeedMetadata = {
  content_version: 'seed-v2';
  generated_at: string;
  calculation_version: 'deterministic-profile-v1';
  editorial_status: 'generated_quality_checked';
  source_signals: string[];
};

const SIGN_LABELS: Record<Language, Record<Sign, string>> = {
  tr: {
    aries: 'Koç',
    taurus: 'Boğa',
    gemini: 'İkizler',
    cancer: 'Yengeç',
    leo: 'Aslan',
    virgo: 'Başak',
    libra: 'Terazi',
    scorpio: 'Akrep',
    sagittarius: 'Yay',
    capricorn: 'Oğlak',
    aquarius: 'Kova',
    pisces: 'Balık'
  },
  en: {
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
  },
  es: {
    aries: 'Aries',
    taurus: 'Tauro',
    gemini: 'Géminis',
    cancer: 'Cáncer',
    leo: 'Leo',
    virgo: 'Virgo',
    libra: 'Libra',
    scorpio: 'Escorpio',
    sagittarius: 'Sagitario',
    capricorn: 'Capricornio',
    aquarius: 'Acuario',
    pisces: 'Piscis'
  },
  pt: {
    aries: 'Áries',
    taurus: 'Touro',
    gemini: 'Gêmeos',
    cancer: 'Câncer',
    leo: 'Leão',
    virgo: 'Virgem',
    libra: 'Libra',
    scorpio: 'Escorpião',
    sagittarius: 'Sagitário',
    capricorn: 'Capricórnio',
    aquarius: 'Aquário',
    pisces: 'Peixes'
  },
  de: {
    aries: 'Widder',
    taurus: 'Stier',
    gemini: 'Zwillinge',
    cancer: 'Krebs',
    leo: 'Löwe',
    virgo: 'Jungfrau',
    libra: 'Waage',
    scorpio: 'Skorpion',
    sagittarius: 'Schütze',
    capricorn: 'Steinbock',
    aquarius: 'Wassermann',
    pisces: 'Fische'
  },
  fr: {
    aries: 'Bélier',
    taurus: 'Taureau',
    gemini: 'Gémeaux',
    cancer: 'Cancer',
    leo: 'Lion',
    virgo: 'Vierge',
    libra: 'Balance',
    scorpio: 'Scorpion',
    sagittarius: 'Sagittaire',
    capricorn: 'Capricorne',
    aquarius: 'Verseau',
    pisces: 'Poissons'
  }
};

const SIGN_PROFILES: Record<Sign, SignProfile> = {
  aries: {
    element: 'fire',
    modality: 'cardinal',
    planet: { tr: 'Mars', en: 'Mars', es: 'Marte', pt: 'Marte', de: 'Mars', fr: 'Mars' },
    strengths: {
      tr: ['Cesaret', 'İnisiyatif'],
      en: ['Courage', 'Initiative'],
      es: ['Coraje', 'Iniciativa'],
      pt: ['Coragem', 'Iniciativa'],
      de: ['Mut', 'Initiative'],
      fr: ['Courage', 'Initiative']
    },
    weaknesses: {
      tr: ['Sabırsızlık', 'Acelecilik'],
      en: ['Impatience', 'Rushing'],
      es: ['Impaciencia', 'Precipitación'],
      pt: ['Impaciência', 'Precipitação'],
      de: ['Ungeduld', 'Überstürztheit'],
      fr: ['Impatience', 'Précipitation']
    },
    careerFit: {
      tr: ['Girişimcilik', 'Saha liderliği'],
      en: ['Entrepreneurship', 'Field leadership'],
      es: ['Emprendimiento', 'Liderazgo de campo'],
      pt: ['Empreendedorismo', 'Liderança de campo'],
      de: ['Unternehmertum', 'Führung vor Ort'],
      fr: ['Entrepreneuriat', 'Encadrement de terrain']
    },
    idealPartners: ['leo', 'sagittarius'],
    color: { tr: 'Kırmızı', en: 'Red', es: 'Rojo', pt: 'Vermelho', de: 'Rot', fr: 'Rouge' },
    stone: { tr: 'Yakut', en: 'Ruby', es: 'Rubí', pt: 'Rubi', de: 'Rubin', fr: 'Rubis' },
    focus: {
      tr: 'cesur ama ölçülü bir başlangıç',
      en: 'a bold but measured beginning',
      es: 'un comienzo audaz pero medido',
      pt: 'um começo corajoso, mas medido',
      de: 'ein mutiger, aber maßvoller Anfang',
      fr: 'un début audacieux mais mesuré'
    }
  },
  taurus: {
    element: 'earth',
    modality: 'fixed',
    planet: { tr: 'Venüs', en: 'Venus', es: 'Venus', pt: 'Vênus', de: 'Venus', fr: 'Vénus' },
    strengths: {
      tr: ['İstikrar', 'Güvenilirlik'],
      en: ['Stability', 'Reliability'],
      es: ['Estabilidad', 'Fiabilidad'],
      pt: ['Estabilidade', 'Confiabilidade'],
      de: ['Beständigkeit', 'Zuverlässigkeit'],
      fr: ['Stabilité', 'Fiabilité']
    },
    weaknesses: {
      tr: ['İnatçılık', 'Değişime direnç'],
      en: ['Stubbornness', 'Resistance to change'],
      es: ['Terquedad', 'Resistencia al cambio'],
      pt: ['Teimosia', 'Resistência à mudança'],
      de: ['Sturheit', 'Widerstand gegen Veränderung'],
      fr: ['Entêtement', 'Résistance au changement']
    },
    careerFit: {
      tr: ['Finans', 'Tasarım'],
      en: ['Finance', 'Design'],
      es: ['Finanzas', 'Diseño'],
      pt: ['Finanças', 'Design'],
      de: ['Finanzwesen', 'Design'],
      fr: ['Finance', 'Design']
    },
    idealPartners: ['virgo', 'capricorn'],
    color: { tr: 'Zümrüt yeşili', en: 'Emerald green', es: 'Verde esmeralda', pt: 'Verde-esmeralda', de: 'Smaragdgrün', fr: 'Vert émeraude' },
    stone: { tr: 'Zümrüt', en: 'Emerald', es: 'Esmeralda', pt: 'Esmeralda', de: 'Smaragd', fr: 'Émeraude' },
    focus: {
      tr: 'kalıcı ve somut ilerleme',
      en: 'steady, tangible progress',
      es: 'un progreso constante y tangible',
      pt: 'um progresso constante e tangível',
      de: 'ein stetiger, greifbarer Fortschritt',
      fr: 'une progression stable et concrète'
    }
  },
  gemini: {
    element: 'air',
    modality: 'mutable',
    planet: { tr: 'Merkür', en: 'Mercury', es: 'Mercurio', pt: 'Mercúrio', de: 'Merkur', fr: 'Mercure' },
    strengths: {
      tr: ['Merak', 'Uyum sağlama'],
      en: ['Curiosity', 'Adaptability'],
      es: ['Curiosidad', 'Adaptabilidad'],
      pt: ['Curiosidade', 'Adaptabilidade'],
      de: ['Neugier', 'Anpassungsfähigkeit'],
      fr: ['Curiosité', 'Adaptabilité']
    },
    weaknesses: {
      tr: ['Dağınıklık', 'Kararsızlık'],
      en: ['Scattered focus', 'Indecision'],
      es: ['Falta de enfoque', 'Indecisión'],
      pt: ['Falta de foco', 'Indecisão'],
      de: ['Zerstreutheit', 'Unentschlossenheit'],
      fr: ['Dispersion', 'Indécision']
    },
    careerFit: {
      tr: ['İletişim', 'Ürün geliştirme'],
      en: ['Communication', 'Product development'],
      es: ['Comunicación', 'Desarrollo de producto'],
      pt: ['Comunicação', 'Desenvolvimento de produto'],
      de: ['Kommunikation', 'Produktentwicklung'],
      fr: ['Communication', 'Développement de produit']
    },
    idealPartners: ['libra', 'aquarius'],
    color: { tr: 'Sarı', en: 'Yellow', es: 'Amarillo', pt: 'Amarelo', de: 'Gelb', fr: 'Jaune' },
    stone: { tr: 'Akik', en: 'Agate', es: 'Ágata', pt: 'Ágata', de: 'Achat', fr: 'Agate' },
    focus: {
      tr: 'netleştirilmiş fikir alışverişi',
      en: 'clear, lively exchange of ideas',
      es: 'un intercambio de ideas claro y animado',
      pt: 'uma troca de ideias clara e animada',
      de: 'ein klarer, lebendiger Ideenaustausch',
      fr: 'un échange d\'idées clair et vivant'
    }
  },
  cancer: {
    element: 'water',
    modality: 'cardinal',
    planet: { tr: 'Ay', en: 'Moon', es: 'Luna', pt: 'Lua', de: 'Mond', fr: 'Lune' },
    strengths: {
      tr: ['Sezgi', 'Koruyuculuk'],
      en: ['Intuition', 'Nurturing'],
      es: ['Intuición', 'Cuidado'],
      pt: ['Intuição', 'Acolhimento'],
      de: ['Intuition', 'Fürsorglichkeit'],
      fr: ['Intuition', 'Bienveillance']
    },
    weaknesses: {
      tr: ['Alınganlık', 'İçe kapanma'],
      en: ['Sensitivity', 'Withdrawal'],
      es: ['Susceptibilidad', 'Retraimiento'],
      pt: ['Suscetibilidade', 'Retraimento'],
      de: ['Empfindlichkeit', 'Rückzug'],
      fr: ['Susceptibilité', 'Repli sur soi']
    },
    careerFit: {
      tr: ['Danışmanlık', 'Konaklama'],
      en: ['Counseling', 'Hospitality'],
      es: ['Asesoría', 'Hostelería'],
      pt: ['Aconselhamento', 'Hotelaria'],
      de: ['Beratung', 'Gastgewerbe'],
      fr: ['Accompagnement', 'Hôtellerie']
    },
    idealPartners: ['scorpio', 'pisces'],
    color: { tr: 'Gümüş', en: 'Silver', es: 'Plateado', pt: 'Prateado', de: 'Silber', fr: 'Argenté' },
    stone: { tr: 'Ay taşı', en: 'Moonstone', es: 'Piedra lunar', pt: 'Pedra da lua', de: 'Mondstein', fr: 'Pierre de lune' },
    focus: {
      tr: 'duygusal güven ve sağlıklı sınırlar',
      en: 'emotional safety and healthy boundaries',
      es: 'seguridad emocional y límites saludables',
      pt: 'segurança emocional e limites saudáveis',
      de: 'emotionale Sicherheit und gesunde Grenzen',
      fr: 'la sécurité émotionnelle et des limites saines'
    }
  },
  leo: {
    element: 'fire',
    modality: 'fixed',
    planet: { tr: 'Güneş', en: 'Sun', es: 'Sol', pt: 'Sol', de: 'Sonne', fr: 'Soleil' },
    strengths: {
      tr: ['Yaratıcılık', 'Özgüven'],
      en: ['Creativity', 'Confidence'],
      es: ['Creatividad', 'Confianza'],
      pt: ['Criatividade', 'Autoconfiança'],
      de: ['Kreativität', 'Selbstvertrauen'],
      fr: ['Créativité', 'Confiance en soi']
    },
    weaknesses: {
      tr: ['Gurur', 'Onay ihtiyacı'],
      en: ['Pride', 'Need for approval'],
      es: ['Orgullo', 'Necesidad de aprobación'],
      pt: ['Orgulho', 'Necessidade de aprovação'],
      de: ['Stolz', 'Bedürfnis nach Anerkennung'],
      fr: ['Orgueil', 'Besoin d\'approbation']
    },
    careerFit: {
      tr: ['Sahne sanatları', 'Yönetim'],
      en: ['Performing arts', 'Management'],
      es: ['Artes escénicas', 'Gestión'],
      pt: ['Artes cênicas', 'Gestão'],
      de: ['Darstellende Kunst', 'Führung'],
      fr: ['Arts de la scène', 'Direction d\'équipe']
    },
    idealPartners: ['aries', 'sagittarius'],
    color: { tr: 'Altın', en: 'Gold', es: 'Dorado', pt: 'Dourado', de: 'Gold', fr: 'Doré' },
    stone: { tr: 'Sitrin', en: 'Citrine', es: 'Citrino', pt: 'Citrino', de: 'Citrin', fr: 'Citrine' },
    focus: {
      tr: 'görünür ama cömert liderlik',
      en: 'visible, generous leadership',
      es: 'un liderazgo visible pero generoso',
      pt: 'uma liderança visível, mas generosa',
      de: 'eine sichtbare, aber großzügige Führungsrolle',
      fr: 'un leadership visible mais généreux'
    }
  },
  virgo: {
    element: 'earth',
    modality: 'mutable',
    planet: { tr: 'Merkür', en: 'Mercury', es: 'Mercurio', pt: 'Mercúrio', de: 'Merkur', fr: 'Mercure' },
    strengths: {
      tr: ['Analiz', 'Titizlik'],
      en: ['Analysis', 'Precision'],
      es: ['Análisis', 'Precisión'],
      pt: ['Análise', 'Precisão'],
      de: ['Analyse', 'Sorgfalt'],
      fr: ['Analyse', 'Rigueur']
    },
    weaknesses: {
      tr: ['Aşırı eleştiri', 'Mükemmeliyetçilik'],
      en: ['Overcriticism', 'Perfectionism'],
      es: ['Exceso de crítica', 'Perfeccionismo'],
      pt: ['Excesso de crítica', 'Perfeccionismo'],
      de: ['Überkritik', 'Perfektionismus'],
      fr: ['Excès de critique', 'Perfectionnisme']
    },
    careerFit: {
      tr: ['Veri analizi', 'Sağlık hizmetleri'],
      en: ['Data analysis', 'Healthcare'],
      es: ['Análisis de datos', 'Sanidad'],
      pt: ['Análise de dados', 'Área da saúde'],
      de: ['Datenanalyse', 'Gesundheitswesen'],
      fr: ['Analyse de données', 'Secteur de la santé']
    },
    idealPartners: ['taurus', 'capricorn'],
    color: { tr: 'Zeytin yeşili', en: 'Olive green', es: 'Verde oliva', pt: 'Verde-oliva', de: 'Olivgrün', fr: 'Vert olive' },
    stone: { tr: 'Safir', en: 'Sapphire', es: 'Zafiro', pt: 'Safira', de: 'Saphir', fr: 'Saphir' },
    focus: {
      tr: 'küçük ayrıntılarla büyük iyileşme',
      en: 'meaningful improvement through small details',
      es: 'una mejora significativa a través de pequeños detalles',
      pt: 'uma melhora significativa por meio de pequenos detalhes',
      de: 'spürbare Verbesserung durch kleine Details',
      fr: 'une amélioration réelle grâce à de petits détails'
    }
  },
  libra: {
    element: 'air',
    modality: 'cardinal',
    planet: { tr: 'Venüs', en: 'Venus', es: 'Venus', pt: 'Vênus', de: 'Venus', fr: 'Vénus' },
    strengths: {
      tr: ['Diplomasi', 'Adalet duygusu'],
      en: ['Diplomacy', 'Sense of fairness'],
      es: ['Diplomacia', 'Sentido de la justicia'],
      pt: ['Diplomacia', 'Senso de justiça'],
      de: ['Diplomatie', 'Gerechtigkeitssinn'],
      fr: ['Diplomatie', 'Sens de la justice']
    },
    weaknesses: {
      tr: ['Karar erteleme', 'Çatışmadan kaçınma'],
      en: ['Delayed decisions', 'Conflict avoidance'],
      es: ['Decisiones postergadas', 'Evitar el conflicto'],
      pt: ['Decisões adiadas', 'Fuga do conflito'],
      de: ['Entscheidungsaufschub', 'Konfliktvermeidung'],
      fr: ['Décisions retardées', 'Évitement des conflits']
    },
    careerFit: {
      tr: ['Hukuk', 'Marka yönetimi'],
      en: ['Law', 'Brand management'],
      es: ['Derecho', 'Gestión de marca'],
      pt: ['Direito', 'Gestão de marca'],
      de: ['Recht', 'Markenmanagement'],
      fr: ['Droit', 'Gestion de marque']
    },
    idealPartners: ['gemini', 'aquarius'],
    color: { tr: 'Pudra pembe', en: 'Soft pink', es: 'Rosa empolvado', pt: 'Rosa suave', de: 'Puderrosa', fr: 'Rose poudré' },
    stone: { tr: 'Pembe kuvars', en: 'Rose quartz', es: 'Cuarzo rosa', pt: 'Quartzo rosa', de: 'Rosenquarz', fr: 'Quartz rose' },
    focus: {
      tr: 'adil bir denge ve açık uzlaşma',
      en: 'fair balance and open compromise',
      es: 'un equilibrio justo y un acuerdo abierto',
      pt: 'um equilíbrio justo e um acordo aberto',
      de: 'ein faires Gleichgewicht und ein offener Kompromiss',
      fr: 'un équilibre juste et un compromis ouvert'
    }
  },
  scorpio: {
    element: 'water',
    modality: 'fixed',
    planet: { tr: 'Plüton', en: 'Pluto', es: 'Plutón', pt: 'Plutão', de: 'Pluto', fr: 'Pluton' },
    strengths: {
      tr: ['Derinlik', 'Kararlılık'],
      en: ['Depth', 'Determination'],
      es: ['Profundidad', 'Determinación'],
      pt: ['Profundidade', 'Determinação'],
      de: ['Tiefgang', 'Entschlossenheit'],
      fr: ['Profondeur', 'Détermination']
    },
    weaknesses: {
      tr: ['Kontrol ihtiyacı', 'Kuşku'],
      en: ['Need for control', 'Suspicion'],
      es: ['Necesidad de control', 'Desconfianza'],
      pt: ['Necessidade de controle', 'Desconfiança'],
      de: ['Kontrollbedürfnis', 'Misstrauen'],
      fr: ['Besoin de contrôle', 'Méfiance']
    },
    careerFit: {
      tr: ['Araştırma', 'Psikoloji'],
      en: ['Research', 'Psychology'],
      es: ['Investigación', 'Psicología'],
      pt: ['Pesquisa', 'Psicologia'],
      de: ['Forschung', 'Psychologie'],
      fr: ['Recherche', 'Psychologie']
    },
    idealPartners: ['cancer', 'pisces'],
    color: { tr: 'Bordo', en: 'Burgundy', es: 'Burdeos', pt: 'Vinho', de: 'Bordeauxrot', fr: 'Bordeaux' },
    stone: { tr: 'Obsidyen', en: 'Obsidian', es: 'Obsidiana', pt: 'Obsidiana', de: 'Obsidian', fr: 'Obsidienne' },
    focus: {
      tr: 'dürüst dönüşüm ve duygusal derinlik',
      en: 'honest transformation and emotional depth',
      es: 'una transformación honesta y profundidad emocional',
      pt: 'uma transformação honesta e profundidade emocional',
      de: 'eine ehrliche Wandlung und emotionale Tiefe',
      fr: 'une transformation sincère et une profondeur émotionnelle'
    }
  },
  sagittarius: {
    element: 'fire',
    modality: 'mutable',
    planet: { tr: 'Jüpiter', en: 'Jupiter', es: 'Júpiter', pt: 'Júpiter', de: 'Jupiter', fr: 'Jupiter' },
    strengths: {
      tr: ['İyimserlik', 'Keşif ruhu'],
      en: ['Optimism', 'Adventurous spirit'],
      es: ['Optimismo', 'Espíritu aventurero'],
      pt: ['Otimismo', 'Espírito aventureiro'],
      de: ['Optimismus', 'Entdeckergeist'],
      fr: ['Optimisme', 'Esprit d\'aventure']
    },
    weaknesses: {
      tr: ['Aşırı söz verme', 'Sabırsız özgürlük arayışı'],
      en: ['Overpromising', 'Restless freedom seeking'],
      es: ['Prometer de más', 'Búsqueda inquieta de libertad'],
      pt: ['Prometer demais', 'Busca inquieta por liberdade'],
      de: ['Zu viel versprechen', 'Ruhelose Freiheitssuche'],
      fr: ['Promesses excessives', 'Quête agitée de liberté']
    },
    careerFit: {
      tr: ['Eğitim', 'Uluslararası işler'],
      en: ['Education', 'International business'],
      es: ['Educación', 'Negocios internacionales'],
      pt: ['Educação', 'Negócios internacionais'],
      de: ['Bildung', 'Internationales Geschäft'],
      fr: ['Éducation', 'Commerce international']
    },
    idealPartners: ['aries', 'leo'],
    color: { tr: 'Mor', en: 'Purple', es: 'Morado', pt: 'Roxo', de: 'Violett', fr: 'Violet' },
    stone: { tr: 'Turkuaz', en: 'Turquoise', es: 'Turquesa', pt: 'Turquesa', de: 'Türkis', fr: 'Turquoise' },
    focus: {
      tr: 'ufku genişleten gerçekçi bir adım',
      en: 'a realistic step that widens your horizon',
      es: 'un paso realista que amplía tu horizonte',
      pt: 'um passo realista que amplia seu horizonte',
      de: 'ein realistischer Schritt, der den Horizont erweitert',
      fr: 'un pas réaliste qui élargit votre horizon'
    }
  },
  capricorn: {
    element: 'earth',
    modality: 'cardinal',
    planet: { tr: 'Satürn', en: 'Saturn', es: 'Saturno', pt: 'Saturno', de: 'Saturn', fr: 'Saturne' },
    strengths: {
      tr: ['Disiplin', 'Strateji'],
      en: ['Discipline', 'Strategy'],
      es: ['Disciplina', 'Estrategia'],
      pt: ['Disciplina', 'Estratégia'],
      de: ['Disziplin', 'Strategie'],
      fr: ['Discipline', 'Stratégie']
    },
    weaknesses: {
      tr: ['Katılık', 'Aşırı sorumluluk'],
      en: ['Rigidity', 'Over-responsibility'],
      es: ['Rigidez', 'Exceso de responsabilidad'],
      pt: ['Rigidez', 'Excesso de responsabilidade'],
      de: ['Starrheit', 'Übermäßige Verantwortung'],
      fr: ['Rigidité', 'Excès de responsabilité']
    },
    careerFit: {
      tr: ['Operasyon', 'Kurumsal liderlik'],
      en: ['Operations', 'Executive leadership'],
      es: ['Operaciones', 'Liderazgo ejecutivo'],
      pt: ['Operações', 'Liderança executiva'],
      de: ['Betriebsführung', 'Unternehmensführung'],
      fr: ['Opérations', 'Direction générale']
    },
    idealPartners: ['taurus', 'virgo'],
    color: { tr: 'Lacivert', en: 'Navy', es: 'Azul marino', pt: 'Azul-marinho', de: 'Marineblau', fr: 'Bleu marine' },
    stone: { tr: 'Oniks', en: 'Onyx', es: 'Ónix', pt: 'Ônix', de: 'Onyx', fr: 'Onyx' },
    focus: {
      tr: 'uzun vadeli ve ölçülebilir bir hedef',
      en: 'a measurable long-term objective',
      es: 'un objetivo medible a largo plazo',
      pt: 'um objetivo mensurável de longo prazo',
      de: 'ein messbares, langfristiges Ziel',
      fr: 'un objectif mesurable à long terme'
    }
  },
  aquarius: {
    element: 'air',
    modality: 'fixed',
    planet: { tr: 'Uranüs', en: 'Uranus', es: 'Urano', pt: 'Urano', de: 'Uranus', fr: 'Uranus' },
    strengths: {
      tr: ['Özgünlük', 'Toplumsal bakış'],
      en: ['Originality', 'Community vision'],
      es: ['Originalidad', 'Visión comunitaria'],
      pt: ['Originalidade', 'Visão coletiva'],
      de: ['Originalität', 'Gemeinschaftssinn'],
      fr: ['Originalité', 'Vision collective']
    },
    weaknesses: {
      tr: ['Mesafe', 'İnatçı bağımsızlık'],
      en: ['Detachment', 'Rigid independence'],
      es: ['Distanciamiento', 'Independencia rígida'],
      pt: ['Distanciamento', 'Independência rígida'],
      de: ['Distanziertheit', 'Sture Unabhängigkeit'],
      fr: ['Détachement', 'Indépendance rigide']
    },
    careerFit: {
      tr: ['Teknoloji', 'Sosyal inovasyon'],
      en: ['Technology', 'Social innovation'],
      es: ['Tecnología', 'Innovación social'],
      pt: ['Tecnologia', 'Inovação social'],
      de: ['Technologie', 'Soziale Innovation'],
      fr: ['Technologie', 'Innovation sociale']
    },
    idealPartners: ['gemini', 'libra'],
    color: { tr: 'Elektrik mavisi', en: 'Electric blue', es: 'Azul eléctrico', pt: 'Azul elétrico', de: 'Elektrisches Blau', fr: 'Bleu électrique' },
    stone: { tr: 'Ametist', en: 'Amethyst', es: 'Amatista', pt: 'Ametista', de: 'Amethyst', fr: 'Améthyste' },
    focus: {
      tr: 'özgün bir çözümü toplulukla paylaşma',
      en: 'sharing an original solution with others',
      es: 'compartir una solución original con los demás',
      pt: 'compartilhar uma solução original com os outros',
      de: 'eine originelle Lösung mit anderen teilen',
      fr: 'partager une solution originale avec les autres'
    }
  },
  pisces: {
    element: 'water',
    modality: 'mutable',
    planet: { tr: 'Neptün', en: 'Neptune', es: 'Neptuno', pt: 'Netuno', de: 'Neptun', fr: 'Neptune' },
    strengths: {
      tr: ['Empati', 'Hayal gücü'],
      en: ['Empathy', 'Imagination'],
      es: ['Empatía', 'Imaginación'],
      pt: ['Empatia', 'Imaginação'],
      de: ['Empathie', 'Vorstellungskraft'],
      fr: ['Empathie', 'Imagination']
    },
    weaknesses: {
      tr: ['Sınır koyamama', 'Kaçış eğilimi'],
      en: ['Weak boundaries', 'Escapism'],
      es: ['Límites débiles', 'Tendencia al escapismo'],
      pt: ['Limites frágeis', 'Tendência à fuga da realidade'],
      de: ['Schwache Grenzen', 'Fluchttendenz'],
      fr: ['Limites floues', 'Tendance à la fuite']
    },
    careerFit: {
      tr: ['Yaratıcı sanatlar', 'Sosyal hizmet'],
      en: ['Creative arts', 'Social care'],
      es: ['Artes creativas', 'Trabajo social'],
      pt: ['Artes criativas', 'Assistência social'],
      de: ['Kreative Künste', 'Sozialarbeit'],
      fr: ['Arts créatifs', 'Travail social']
    },
    idealPartners: ['cancer', 'scorpio'],
    color: { tr: 'Deniz yeşili', en: 'Sea green', es: 'Verde mar', pt: 'Verde-mar', de: 'Meergrün', fr: 'Vert d\'eau' },
    stone: { tr: 'Akuamarin', en: 'Aquamarine', es: 'Aguamarina', pt: 'Água-marinha', de: 'Aquamarin', fr: 'Aigue-marine' },
    focus: {
      tr: 'sezgiyi somut bir adıma dönüştürme',
      en: 'turning intuition into a concrete step',
      es: 'convertir la intuición en un paso concreto',
      pt: 'transformar a intuição em um passo concreto',
      de: 'Intuition in einen konkreten Schritt verwandeln',
      fr: 'transformer son intuition en un pas concret'
    }
  }
};

const DAILY_OPENINGS: LocalizedList = {
  tr: [
    'Bugün odağını sadeleştirdiğinde ilerleme hızlanıyor.',
    'Günün ritmi, acele etmek yerine doğru anı seçmeni destekliyor.',
    'Küçük ama net bir karar günün geri kalanını toparlayabilir.',
    'Enerjini tek bir öncelikte toplamak belirgin sonuç getiriyor.',
    'Bugün merakını eyleme dönüştürmek için uygun bir alan açılıyor.',
    'Eski bir konuyu farklı bir açıdan ele almak rahatlama sağlayabilir.'
  ],
  en: [
    'Progress accelerates when you simplify your focus today.',
    'The day rewards timing and intention more than speed.',
    'One clear decision can organize the rest of your day.',
    'Concentrating your energy on one priority brings visible results.',
    'A useful opening appears when curiosity turns into action.',
    'A familiar issue feels lighter when viewed from a new angle.'
  ],
  es: [
    'El progreso se acelera cuando simplificas tu enfoque hoy.',
    'El día premia la intención y el momento oportuno más que la velocidad.',
    'Una decisión clara puede ordenar el resto de tu día.',
    'Concentrar tu energía en una prioridad trae resultados visibles.',
    'Se abre una oportunidad útil cuando la curiosidad se convierte en acción.',
    'Un asunto conocido se siente más ligero visto desde un nuevo ángulo.'
  ],
  pt: [
    'O progresso acelera quando você simplifica o foco hoje.',
    'O dia recompensa mais a intenção e o momento certo do que a velocidade.',
    'Uma decisão clara pode organizar o restante do seu dia.',
    'Concentrar sua energia em uma prioridade traz resultados visíveis.',
    'Uma abertura útil aparece quando a curiosidade se transforma em ação.',
    'Uma questão conhecida parece mais leve quando vista de um novo ângulo.'
  ],
  de: [
    'Der Fortschritt beschleunigt sich, wenn Sie Ihren Fokus heute vereinfachen.',
    'Der Tag belohnt eher die richtige Absicht und den richtigen Moment als reine Geschwindigkeit.',
    'Eine klare Entscheidung kann den Rest Ihres Tages ordnen.',
    'Wenn Sie Ihre Energie auf eine Priorität bündeln, entstehen sichtbare Ergebnisse.',
    'Eine nützliche Gelegenheit öffnet sich, wenn aus Neugier Handeln wird.',
    'Ein vertrautes Thema fühlt sich leichter an, wenn Sie es aus einem neuen Blickwinkel betrachten.'
  ],
  fr: [
    'Les progrès s\'accélèrent lorsque vous simplifiez votre priorité aujourd\'hui.',
    'La journée récompense le bon moment et l\'intention plutôt que la vitesse.',
    'Une décision claire peut organiser le reste de votre journée.',
    'Concentrer votre énergie sur une seule priorité apporte des résultats visibles.',
    'Une ouverture utile apparaît lorsque la curiosité se transforme en action.',
    'Un sujet familier semble plus léger lorsqu\'il est abordé sous un nouvel angle.'
  ]
};

const LOVE_GUIDANCE: LocalizedList = {
  tr: [
    'Varsayım yapmak yerine açık bir soru sormak yakınlığı güçlendirir.',
    'Duyguyu adlandırmak, gereksiz gerilimin önüne geçebilir.',
    'Karşı tarafı düzeltmeden dinlemek ilişkinin tonunu yumuşatır.',
    'İhtiyacını kısa ve doğrudan anlatmak bugün daha iyi karşılık bulur.'
  ],
  en: [
    'Ask a direct question instead of relying on assumptions.',
    'Naming the feeling can prevent unnecessary tension.',
    'Listening without trying to fix everything softens the connection.',
    'A concise, honest request is more likely to be understood today.'
  ],
  es: [
    'Haz una pregunta directa en vez de apoyarte en suposiciones.',
    'Nombrar el sentimiento puede evitar tensiones innecesarias.',
    'Escuchar sin intentar solucionarlo enseguida suaviza la conexión.',
    'Un pedido breve y honesto tiene más probabilidad de ser entendido hoy.'
  ],
  pt: [
    'Faça uma pergunta direta em vez de se apoiar em suposições.',
    'Nomear o sentimento pode evitar tensões desnecessárias.',
    'Ouvir sem tentar resolver na hora suaviza a conexão.',
    'Um pedido breve e honesto tem mais chance de ser compreendido hoje.'
  ],
  de: [
    'Eine direkte Frage stärkt die Nähe mehr als eine stille Vermutung.',
    'Ein Gefühl beim Namen zu nennen kann unnötige Spannungen vermeiden.',
    'Zuzuhören, ohne sofort alles lösen zu wollen, macht die Verbindung weicher.',
    'Eine kurze, ehrliche Bitte findet heute eher Gehör.'
  ],
  fr: [
    'Poser une question directe au lieu de s\'appuyer sur des suppositions renforce la proximité.',
    'Nommer le sentiment peut éviter des tensions inutiles.',
    'Écouter sans chercher à tout résoudre adoucit la relation.',
    'Une demande brève et honnête a plus de chances d\'être entendue aujourd\'hui.'
  ]
};

const CAREER_GUIDANCE: LocalizedList = {
  tr: [
    'En önemli işi ilk enerji diliminde tamamlamaya çalış.',
    'Bir kararın ölçütlerini yazmak seçenekleri netleştirir.',
    'Görünür ilerleme için küçük bir teslim noktası belirle.',
    'Geri bildirim istemek, kör noktayı hızlıca azaltabilir.'
  ],
  en: [
    'Use your first high-energy window for the most important task.',
    'Writing down decision criteria makes the options clearer.',
    'Define one small deliverable that creates visible progress.',
    'Requesting feedback can quickly reduce a blind spot.'
  ],
  es: [
    'Usa tu primer momento de más energía para la tarea más importante.',
    'Escribir los criterios de una decisión aclara las opciones.',
    'Define un pequeño entregable que genere avance visible.',
    'Pedir retroalimentación puede reducir rápido un punto ciego.'
  ],
  pt: [
    'Use seu primeiro momento de mais energia para a tarefa mais importante.',
    'Anotar os critérios de uma decisão deixa as opções mais claras.',
    'Defina uma pequena entrega que gere progresso visível.',
    'Pedir feedback pode reduzir rapidamente um ponto cego.'
  ],
  de: [
    'Nutzen Sie Ihre erste Phase hoher Energie für die wichtigste Aufgabe.',
    'Die Kriterien einer Entscheidung aufzuschreiben macht die Optionen klarer.',
    'Legen Sie ein kleines, greifbares Ergebnis fest, das sichtbaren Fortschritt schafft.',
    'Um Feedback zu bitten kann einen blinden Fleck schnell verkleinern.'
  ],
  fr: [
    'Réservez votre premier pic d\'énergie à la tâche la plus importante.',
    'Écrire les critères d\'une décision clarifie les options.',
    'Définissez un petit livrable qui crée un progrès visible.',
    'Demander un retour peut rapidement réduire un angle mort.'
  ]
};

const MONEY_GUIDANCE: LocalizedList = {
  tr: [
    'İstek ile ihtiyaç arasındaki farkı netleştirmek bütçeyi korur.',
    'Tekrarlayan küçük bir harcamayı gözden geçirmek fayda sağlayabilir.',
    'Yeni fırsatı değerlendirirken toplam maliyeti hesaba kat.',
    'Bugün hızlı kazanç yerine sürdürülebilir değere odaklan.'
  ],
  en: [
    'Clarifying wants versus needs protects your budget.',
    'Reviewing one recurring expense may reveal an easy improvement.',
    'Consider the total cost before committing to a new opportunity.',
    'Favor sustainable value over the promise of a quick gain.'
  ],
  es: [
    'Distinguir entre deseo y necesidad protege tu presupuesto.',
    'Revisar un gasto recurrente puede revelar una mejora sencilla.',
    'Considera el costo total antes de comprometerte con una nueva oportunidad.',
    'Prefiere el valor sostenible sobre la promesa de una ganancia rápida.'
  ],
  pt: [
    'Diferenciar desejo e necessidade protege seu orçamento.',
    'Revisar um gasto recorrente pode revelar uma melhoria simples.',
    'Considere o custo total antes de se comprometer com uma nova oportunidade.',
    'Prefira o valor sustentável à promessa de um ganho rápido.'
  ],
  de: [
    'Wunsch und Notwendigkeit klar zu unterscheiden schützt Ihr Budget.',
    'Eine wiederkehrende kleine Ausgabe zu überprüfen kann eine einfache Verbesserung offenbaren.',
    'Berücksichtigen Sie die Gesamtkosten, bevor Sie sich auf eine neue Gelegenheit einlassen.',
    'Bevorzugen Sie heute nachhaltigen Wert statt des Versprechens eines schnellen Gewinns.'
  ],
  fr: [
    'Distinguer clairement l\'envie du besoin protège votre budget.',
    'Revoir une petite dépense récurrente peut révéler une amélioration facile.',
    'Tenez compte du coût total avant de vous engager dans une nouvelle opportunité.',
    'Privilégiez aujourd\'hui la valeur durable plutôt que la promesse d\'un gain rapide.'
  ]
};

const HEALTH_GUIDANCE: LocalizedList = {
  tr: [
    'Kısa yürüyüşler ve düzenli su molaları ritmini dengeler.',
    'Ekran arası vermek zihinsel yorgunluğu azaltabilir.',
    'Uyku saatini korumak günün dalgalı enerjisini dengeler.',
    'Bedendeki gerginliği fark edip tempoyu kısa süreli düşür.'
  ],
  en: [
    'Short walks and regular water breaks help regulate your pace.',
    'A screen break may reduce mental fatigue.',
    'Protecting your sleep window steadies uneven energy.',
    'Notice physical tension and briefly lower the pace.'
  ],
  es: [
    'Caminatas cortas y pausas regulares de agua equilibran tu ritmo.',
    'Una pausa de pantalla puede reducir la fatiga mental.',
    'Proteger tu horario de sueño estabiliza la energía irregular.',
    'Nota la tensión física y baja el ritmo brevemente.'
  ],
  pt: [
    'Caminhadas curtas e pausas regulares para beber água ajudam a regular seu ritmo.',
    'Uma pausa das telas pode reduzir a fadiga mental.',
    'Proteger seu horário de sono estabiliza a energia irregular.',
    'Perceba a tensão física e reduza o ritmo por um momento.'
  ],
  de: [
    'Kurze Spaziergänge und regelmäßige Trinkpausen helfen, Ihren Rhythmus auszugleichen.',
    'Eine Bildschirmpause kann geistige Erschöpfung verringern.',
    'Feste Schlafzeiten stabilisieren eine schwankende Energie.',
    'Nehmen Sie körperliche Anspannung wahr und drosseln Sie das Tempo kurz.'
  ],
  fr: [
    'De courtes marches et des pauses d\'hydratation régulières équilibrent votre rythme.',
    'Une pause d\'écran peut réduire la fatigue mentale.',
    'Préserver vos heures de sommeil stabilise une énergie irrégulière.',
    'Remarquez la tension physique et ralentissez brièvement le rythme.'
  ]
};

function parseSeedDate(seedDate?: string): Date {
  if (!seedDate) {
    return new Date();
  }

  const parsed = new Date(`${seedDate}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid SEED_DATE: ${seedDate}`);
  }

  return parsed;
}

function parseDailyDays(dailyDays?: number): number {
  if (dailyDays === undefined) {
    return 0;
  }

  if (!Number.isInteger(dailyDays) || dailyDays < 1) {
    throw new Error('SEED_DAILY_DAYS must be a positive integer');
  }

  return dailyDays;
}

function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function formatMonth(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthRange(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));

  return {
    start: formatIsoDate(start),
    end: formatIsoDate(end)
  };
}

function getWeekInfo(date: Date) {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  const weekId = `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
  const weekStart = addDays(target, -3);
  const weekEnd = addDays(weekStart, 6);

  return {
    weekId,
    weekStart: formatIsoDate(weekStart),
    weekEnd: formatIsoDate(weekEnd)
  };
}

function signName(sign: Sign, language: Language): string {
  return SIGN_LABELS[language][sign];
}

function contentMetadata(generatedAt: string, sourceSignals: string[]): ContentSeedMetadata {
  return {
    content_version: 'seed-v2',
    generated_at: generatedAt,
    calculation_version: 'deterministic-profile-v1',
    editorial_status: 'generated_quality_checked',
    source_signals: sourceSignals
  };
}

const LOCALE_TAGS: Record<Language, string> = {
  tr: 'tr-TR',
  en: 'en-US',
  es: 'es-ES',
  pt: 'pt-BR',
  de: 'de-DE',
  fr: 'fr-FR'
};

/**
 * German capitalizes all common nouns, in any sentence position, so the
 * lowercase-mid-sentence trick used for the other languages (which don't
 * capitalize common nouns) would read as a grammar mistake in German.
 * Keep German trait words capitalized as supplied instead of lowercasing them.
 */
function localizedLower(value: string, language: Language): string {
  if (language === 'de') {
    return value;
  }
  return value.toLocaleLowerCase(LOCALE_TAGS[language]);
}

/**
 * French elides "de" to "d'" before a vowel sound (e.g. "d'un début", not
 * "de un début"), unlike "de la"/"de partager" before a consonant. The
 * per-sign focus strings this feeds start with a mix of both, so this
 * cannot be a fixed template string.
 */
function frenchDePrefix(followingWord: string): string {
  return /^[aeiouàâéèêëîïôùûü]/i.test(followingWord) ? "d'" : 'de ';
}

function elementName(element: Element, language: Language): string {
  const labels: Record<Language, Record<Element, string>> = {
    tr: { fire: 'ateş', earth: 'toprak', air: 'hava', water: 'su' },
    en: { fire: 'fire', earth: 'earth', air: 'air', water: 'water' },
    es: { fire: 'fuego', earth: 'tierra', air: 'aire', water: 'agua' },
    pt: { fire: 'fogo', earth: 'terra', air: 'ar', water: 'água' },
    de: { fire: 'Feuer', earth: 'Erde', air: 'Luft', water: 'Wasser' },
    fr: { fire: 'feu', earth: 'terre', air: 'air', water: 'eau' }
  };
  return labels[language][element];
}

function modalityName(modality: Modality, language: Language): string {
  const labels: Record<Language, Record<Modality, string>> = {
    tr: { cardinal: 'öncü', fixed: 'sabit', mutable: 'değişken' },
    en: { cardinal: 'cardinal', fixed: 'fixed', mutable: 'mutable' },
    es: { cardinal: 'cardinal', fixed: 'fijo', mutable: 'mutable' },
    pt: { cardinal: 'cardinal', fixed: 'fixo', mutable: 'mutável' },
    de: { cardinal: 'kardinal', fixed: 'fix', mutable: 'veränderlich' },
    fr: { cardinal: 'cardinal', fixed: 'fixe', mutable: 'mutable' }
  };
  return labels[language][modality];
}

function stableHash(input: string): number {
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function select<T>(items: readonly T[], seed: number, offset = 0): T {
  return items[(seed + offset) % items.length];
}

function score(seed: number, minimum: number, span: number): number {
  return minimum + (seed % span);
}

function clampScore(value: number): number {
  return Math.max(42, Math.min(94, value));
}

const DAILY_SHORT_FORMAT: Record<Language, (name: string, opening: string, focus: string) => string> = {
  tr: (name, opening, focus) => `${name}: ${opening} Ana tema: ${focus}.`,
  en: (name, opening, focus) => `${name}: ${opening} Focus: ${focus}.`,
  es: (name, opening, focus) => `${name}: ${opening} Tema principal: ${focus}.`,
  pt: (name, opening, focus) => `${name}: ${opening} Tema principal: ${focus}.`,
  de: (name, opening, focus) => `${name}: ${opening} Hauptthema: ${focus}.`,
  fr: (name, opening, focus) => `${name} : ${opening} Thème principal : ${focus}.`
};

const DAILY_FULL_FORMAT: Record<Language, (name: string, focus: string) => string> = {
  tr: (name, focus) =>
    `${name} için günün ana teması ${focus}. Önceliğini görünür hale getir, gereksiz yükü azalt ve gün sonunda neyin gerçekten ilerlediğini kısa bir notla değerlendir.`,
  en: (name, focus) =>
    `For ${name}, the central theme is ${focus}. Make the priority visible, reduce unnecessary load, and note what genuinely moved forward by the end of the day.`,
  es: (name, focus) =>
    `Para ${name}, el tema central es ${focus}. Haz visible tu prioridad, reduce la carga innecesaria y anota al final del día qué avanzó realmente.`,
  pt: (name, focus) =>
    `Para ${name}, o tema central é ${focus}. Torne sua prioridade visível, reduza a carga desnecessária e anote no fim do dia o que realmente avançou.`,
  de: (name, focus) =>
    `Für ${name} lautet das zentrale Thema des Tages ${focus}. Machen Sie Ihre Priorität sichtbar, reduzieren Sie unnötigen Ballast und halten Sie am Ende des Tages kurz fest, was wirklich vorangekommen ist.`,
  fr: (name, focus) =>
    `Pour ${name}, le thème central de la journée est ${focus}. Rendez votre priorité visible, allégez la charge inutile et notez en fin de journée ce qui a réellement avancé.`
};

const DAILY_TIP_FORMAT: Record<Language, (focus: string) => string> = {
  tr: (focus) => `Bugün ${focus} için on beş dakikalık tek bir somut adım belirle.`,
  en: (focus) => `Choose one concrete fifteen-minute action for ${focus} today.`,
  es: (focus) => `Elige hoy una sola acción concreta de quince minutos para ${focus}.`,
  pt: (focus) => `Escolha hoje uma única ação concreta de quinze minutos para ${focus}.`,
  de: (focus) => `Wählen Sie heute einen einzigen konkreten Fünfzehn-Minuten-Schritt für ${focus}.`,
  fr: (focus) => `Choisissez aujourd'hui une seule action concrète de quinze minutes pour ${focus}.`
};

function dailyEntry(sign: Sign, language: Language, isoDate: string) {
  const profile = SIGN_PROFILES[sign];
  const name = signName(sign, language);
  const seed = stableHash(`${isoDate}:${sign}`);
  const opening = select(DAILY_OPENINGS[language], seed);
  const focus = profile.focus[language];

  return {
    short: DAILY_SHORT_FORMAT[language](name, opening, focus),
    full: DAILY_FULL_FORMAT[language](name, focus),
    love: select(LOVE_GUIDANCE[language], seed, 1),
    career: select(CAREER_GUIDANCE[language], seed, 2),
    money: select(MONEY_GUIDANCE[language], seed, 3),
    health: select(HEALTH_GUIDANCE[language], seed, 4),
    lucky_number: score(seed >>> 3, 1, 9),
    lucky_color: profile.color[language],
    energy: score(seed >>> 5, 58, 35),
    love_score: score(seed >>> 7, 54, 39),
    career_score: score(seed >>> 9, 56, 37),
    money_score: score(seed >>> 11, 52, 38),
    health_score: score(seed >>> 13, 55, 36),
    daily_tip: DAILY_TIP_FORMAT[language](focus)
  };
}

const WEEKDAY_NAMES: Record<Language, readonly string[]> = {
  tr: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'],
  pt: ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'],
  de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
  fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi']
};

const WEEKLY_SUMMARY_FORMAT: Record<Language, (name: string, focus: string) => string> = {
  tr: (name, focus) =>
    `${name} için bu haftanın odağı ${focus}. Haftanın başında yön belirlemek, ikinci yarıda daha rahat hareket etmeni sağlayabilir.`,
  en: (name, focus) =>
    `${name}'s weekly focus is ${focus}. Setting direction early can create more freedom later in the week.`,
  es: (name, focus) =>
    `El enfoque semanal de ${name} es ${focus}. Definir dirección al inicio de la semana puede darte más libertad en la segunda mitad.`,
  pt: (name, focus) =>
    `O foco semanal de ${name} é ${focus}. Definir a direção no início da semana pode trazer mais liberdade na segunda metade.`,
  de: (name, focus) =>
    `Der wöchentliche Fokus von ${name} liegt auf ${focus}. Die Richtung früh in der Woche festzulegen, verschafft Ihnen in der zweiten Hälfte mehr Freiraum.`,
  fr: (name, focus) =>
    `Le thème de la semaine pour ${name} est ${focus}. Définir une direction en début de semaine peut vous laisser plus de liberté pendant la seconde moitié.`
};

const WEEKLY_WARNING_FORMAT: Record<Language, (weakness: string) => string> = {
  tr: (weakness) => `${weakness} eğilimi yükseldiğinde karar vermeden önce kısa bir ara ver.`,
  en: (weakness) => `Pause briefly before deciding when ${weakness} becomes noticeable.`,
  es: (weakness) => `Haz una pausa breve antes de decidir cuando note ${weakness}.`,
  pt: (weakness) => `Faça uma pausa breve antes de decidir quando notar ${weakness}.`,
  de: (weakness) => `Machen Sie eine kurze Pause, bevor Sie entscheiden, wenn sich ${weakness} bemerkbar macht.`,
  fr: (weakness) => `Faites une courte pause avant de décider lorsque ${weakness} devient perceptible.`
};

function weeklyEntry(sign: Sign, language: Language, weekId: string) {
  const name = signName(sign, language);
  const profile = SIGN_PROFILES[sign];
  const focus = profile.focus[language];
  const seed = stableHash(`${weekId}:${sign}`);
  const bestDays = WEEKDAY_NAMES[language];

  return {
    summary: WEEKLY_SUMMARY_FORMAT[language](name, focus),
    love: select(LOVE_GUIDANCE[language], seed, 1),
    career: select(CAREER_GUIDANCE[language], seed, 2),
    money: select(MONEY_GUIDANCE[language], seed, 3),
    best_day: select(bestDays, seed, 4),
    warning: WEEKLY_WARNING_FORMAT[language](localizedLower(profile.weaknesses[language][0], language))
  };
}

const MONTHLY_WEEKDAY_NAMES: Record<Language, readonly string[]> = {
  tr: ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Pazar'],
  en: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Sunday'],
  es: ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'domingo'],
  pt: ['segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'domingo'],
  de: ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Sonntag'],
  fr: ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'dimanche']
};

const MONTHLY_SUMMARY_FORMAT: Record<Language, (name: string, focus: string) => string> = {
  tr: (name, focus) =>
    `${name} bu ay ${focus} temasını öne çıkarıyor. Kalıcı ilerleme, büyük bir sıçramadan çok düzenli seçimlerle gelecek.`,
  en: (name, focus) =>
    `${name} emphasizes ${focus} this month. Durable progress comes from consistent choices rather than one dramatic leap.`,
  es: (name, focus) =>
    `${name} destaca el tema de ${focus} este mes. El progreso duradero llega con decisiones constantes, no con un solo salto.`,
  pt: (name, focus) =>
    `${name} destaca o tema de ${focus} neste mês. O progresso duradouro vem de escolhas constantes, não de um único salto.`,
  de: (name, focus) =>
    `${name} rückt diesen Monat das Thema ${focus} in den Vordergrund. Dauerhafter Fortschritt entsteht durch beständige Entscheidungen und nicht durch einen einzigen großen Sprung.`,
  fr: (name, focus) =>
    `${name} met en avant le thème ${frenchDePrefix(focus)}${focus} ce mois-ci. Les progrès durables viennent de choix constants plutôt que d'un seul grand bond.`
};

const MONTHLY_CAREER_FORMAT: Record<Language, (first: string, second: string) => string> = {
  tr: (first, second) => `${first} ve ${second} becerilerini kullandığın alanlarda görünür ilerleme mümkün.`,
  en: (first, second) =>
    `Visible progress is possible where you use strengths related to ${first.toLowerCase()} and ${second.toLowerCase()}.`,
  es: (first, second) =>
    `Es posible un progreso visible donde uses fortalezas relacionadas con ${first.toLowerCase()} y ${second.toLowerCase()}.`,
  pt: (first, second) =>
    `É possível um progresso visível onde você usar forças ligadas a ${first.toLowerCase()} e ${second.toLowerCase()}.`,
  de: (first, second) =>
    `Sichtbarer Fortschritt ist dort möglich, wo Sie Stärken im Bereich ${first} und ${second} einsetzen.`,
  fr: (first, second) =>
    `Des progrès visibles sont possibles là où vous mobilisez des forces liées à ${first.toLowerCase()} et ${second.toLowerCase()}.`
};

const MONTHLY_WARNING_FORMAT: Record<Language, (weakness: string) => string> = {
  tr: (weakness) => `${weakness} kararlarını gereğinden fazla etkilerse hedefi daha küçük parçalara böl.`,
  en: (weakness) => `Break the goal into smaller parts if ${weakness} starts shaping decisions too strongly.`,
  es: (weakness) => `Divide la meta en partes más pequeñas si ${weakness} empieza a influir demasiado en tus decisiones.`,
  pt: (weakness) => `Divida a meta em partes menores se ${weakness} começar a influenciar demais suas decisões.`,
  de: (weakness) => `Teilen Sie das Ziel in kleinere Schritte auf, wenn ${weakness} beginnt, Entscheidungen zu stark zu beeinflussen.`,
  fr: (weakness) => `Divisez l'objectif en étapes plus petites si ${weakness} commence à trop influencer vos décisions.`
};

function monthlyEntry(sign: Sign, language: Language, month: string) {
  const name = signName(sign, language);
  const profile = SIGN_PROFILES[sign];
  const seed = stableHash(`${month}:${sign}`);
  const bestDays = MONTHLY_WEEKDAY_NAMES[language];

  return {
    summary: MONTHLY_SUMMARY_FORMAT[language](name, profile.focus[language]),
    love: select(LOVE_GUIDANCE[language], seed, 2),
    career: MONTHLY_CAREER_FORMAT[language](profile.careerFit[language][0], profile.careerFit[language][1]),
    money: select(MONEY_GUIDANCE[language], seed, 3),
    best_day: select(bestDays, seed, 4),
    warning: MONTHLY_WARNING_FORMAT[language](localizedLower(profile.weaknesses[language][1], language))
  };
}

function elementAffinity(first: Element, second: Element): number {
  if (first === second) return 8;
  const pair = [first, second].sort().join(':');
  if (pair === 'air:fire' || pair === 'earth:water') return 10;
  if (pair === 'fire:water') return -4;
  if (pair === 'air:earth') return -3;
  return 2;
}

function compatibilityScores(sign1: Sign, sign2: Sign) {
  const [first, second] = [sign1, sign2].sort() as [Sign, Sign];
  const profile1 = SIGN_PROFILES[first];
  const profile2 = SIGN_PROFILES[second];
  const affinity = elementAffinity(profile1.element, profile2.element);
  const modality = profile1.modality === profile2.modality ? -2 : 3;
  const sameSign = first === second ? 5 : 0;
  const base = 65 + affinity + modality + sameSign;
  const pairKey = `${first}:${second}`;
  const love = clampScore(base + (stableHash(`${pairKey}:love`) % 15) - 7);
  const friendship = clampScore(base + (stableHash(`${pairKey}:friendship`) % 17) - 8);
  const work = clampScore(base + (stableHash(`${pairKey}:work`) % 19) - 9);
  const overall = Math.round((love + friendship + work) / 3);

  return { overall, love, friendship, work };
}

const PAIR_LABEL_FORMAT: Record<Language, (first: string, second: string) => string> = {
  tr: (first, second) => `${first} ve ${second}`,
  en: (first, second) => `${first} and ${second}`,
  es: (first, second) => `${first} y ${second}`,
  pt: (first, second) => `${first} e ${second}`,
  de: (first, second) => `${first} und ${second}`,
  fr: (first, second) => `${first} et ${second}`
};

const COMPATIBILITY_STRENGTHS: Record<
  Language,
  (sharedElement: boolean, sharedModality: boolean) => [string, string]
> = {
  tr: (sharedElement, sharedModality) => [
    sharedElement ? 'Benzer motivasyon dili' : 'Farklı bakış açılarını birleştirme',
    sharedModality ? 'Ortak tempo ve kararlılık' : 'Birbirini tamamlayan hareket biçimi'
  ],
  en: (sharedElement, sharedModality) => [
    sharedElement ? 'A familiar motivational language' : 'Combining different perspectives',
    sharedModality ? 'Shared pace and determination' : 'Complementary ways of taking action'
  ],
  es: (sharedElement, sharedModality) => [
    sharedElement ? 'Un lenguaje motivacional afín' : 'Combinar perspectivas distintas',
    sharedModality ? 'Ritmo y determinación compartidos' : 'Formas de actuar que se complementan'
  ],
  pt: (sharedElement, sharedModality) => [
    sharedElement ? 'Uma linguagem motivacional em comum' : 'Combinar perspectivas diferentes',
    sharedModality ? 'Ritmo e determinação compartilhados' : 'Formas de agir que se complementam'
  ],
  de: (sharedElement, sharedModality) => [
    sharedElement ? 'Eine vertraute Sprache der Motivation' : 'Unterschiedliche Sichtweisen vereinen',
    sharedModality ? 'Gemeinsames Tempo und gemeinsame Entschlossenheit' : 'Sich ergänzende Handlungsweisen'
  ],
  fr: (sharedElement, sharedModality) => [
    sharedElement ? 'Un langage de motivation familier' : 'Combiner des perspectives différentes',
    sharedModality ? 'Un rythme et une détermination partagés' : 'Des façons d\'agir complémentaires'
  ]
};

const COMPATIBILITY_CHALLENGES: Record<
  Language,
  (weakness1: string, weakness2: string, sharedModality: boolean) => [string, string]
> = {
  tr: (weakness1, weakness2, sharedModality) => [
    `${weakness1} ile ${weakness2} arasında gerilim`,
    sharedModality ? 'İki tarafın da aynı anda yön vermek istemesi' : 'Karar hızını eşitleme ihtiyacı'
  ],
  en: (weakness1, weakness2, sharedModality) => [
    `Tension between ${weakness1} and ${weakness2}`,
    sharedModality ? 'Both partners trying to set direction at once' : 'Aligning different decision speeds'
  ],
  es: (weakness1, weakness2, sharedModality) => [
    `Tensión entre ${weakness1} y ${weakness2}`,
    sharedModality ? 'Ambos queriendo marcar el rumbo al mismo tiempo' : 'Necesidad de alinear ritmos de decisión distintos'
  ],
  pt: (weakness1, weakness2, sharedModality) => [
    `Tensão entre ${weakness1} e ${weakness2}`,
    sharedModality ? 'Os dois tentando marcar o rumo ao mesmo tempo' : 'Necessidade de alinhar ritmos de decisão diferentes'
  ],
  de: (weakness1, weakness2, sharedModality) => [
    `Spannung zwischen ${weakness1} und ${weakness2}`,
    sharedModality
      ? 'Beide Partner versuchen gleichzeitig, die Richtung vorzugeben'
      : 'Unterschiedliche Entscheidungstempi müssen angeglichen werden'
  ],
  fr: (weakness1, weakness2, sharedModality) => [
    `Une tension entre ${weakness1} et ${weakness2}`,
    sharedModality
      ? 'Les deux partenaires cherchent à imposer leur direction en même temps'
      : 'Un besoin d\'aligner des rythmes de décision différents'
  ]
};

const COMPATIBILITY_SUMMARY_FORMAT: Record<Language, (pairLabel: string) => string> = {
  tr: (pairLabel) =>
    `${pairLabel}, güçlü yanlarını bilinçli kullandığında dengeli bir bağ kurabilir. Uyumun kalitesi, farklı ihtiyaçları açıkça konuşabilmelerine bağlı.`,
  en: (pairLabel) =>
    `${pairLabel} can build a balanced connection when both use their strengths intentionally. The quality of the match depends on discussing different needs openly.`,
  es: (pairLabel) =>
    `${pairLabel} pueden construir una conexión equilibrada cuando ambos usan sus fortalezas con intención. La calidad del vínculo depende de hablar abiertamente sobre necesidades distintas.`,
  pt: (pairLabel) =>
    `${pairLabel} podem construir uma conexão equilibrada quando ambos usam seus pontos fortes com intenção. A qualidade do vínculo depende de falar abertamente sobre necessidades diferentes.`,
  de: (pairLabel) =>
    `${pairLabel} können eine ausgewogene Verbindung aufbauen, wenn beide ihre Stärken bewusst einsetzen. Die Qualität dieser Verbindung hängt davon ab, unterschiedliche Bedürfnisse offen anzusprechen.`,
  fr: (pairLabel) =>
    `${pairLabel} peuvent construire une relation équilibrée lorsque chacun utilise ses forces avec intention. La qualité de cette relation dépend de leur capacité à discuter ouvertement de besoins différents.`
};

const COMPATIBILITY_ADVICE_FORMAT: Record<Language, (pairLabel: string) => string> = {
  tr: (pairLabel) =>
    `Haftada bir kez beklentileri, sınırları ve ortak önceliği açıkça konuşmak ${pairLabel} arasındaki güveni güçlendirir.`,
  en: (pairLabel) =>
    `A weekly conversation about expectations, boundaries, and one shared priority can strengthen trust between ${pairLabel}.`,
  es: (pairLabel) =>
    `Una conversación semanal sobre expectativas, límites y una prioridad compartida puede fortalecer la confianza entre ${pairLabel}.`,
  pt: (pairLabel) =>
    `Uma conversa semanal sobre expectativas, limites e uma prioridade compartilhada pode fortalecer a confiança entre ${pairLabel}.`,
  de: (pairLabel) =>
    `Ein wöchentliches Gespräch über Erwartungen, Grenzen und eine gemeinsame Priorität kann das Vertrauen zwischen ${pairLabel} stärken.`,
  fr: (pairLabel) =>
    `Une conversation hebdomadaire sur les attentes, les limites et une priorité commune peut renforcer la confiance entre ${pairLabel}.`
};

function compatibilityEntry(sign1: Sign, sign2: Sign, language: Language) {
  const profile1 = SIGN_PROFILES[sign1];
  const profile2 = SIGN_PROFILES[sign2];
  const pairLabel = PAIR_LABEL_FORMAT[language](signName(sign1, language), signName(sign2, language));
  const scores = compatibilityScores(sign1, sign2);
  const sharedElement = profile1.element === profile2.element;
  const sharedModality = profile1.modality === profile2.modality;

  const strengths = COMPATIBILITY_STRENGTHS[language](sharedElement, sharedModality);
  const challenges = COMPATIBILITY_CHALLENGES[language](
    localizedLower(profile1.weaknesses[language][0], language),
    localizedLower(profile2.weaknesses[language][0], language),
    sharedModality
  );

  return {
    sign1,
    sign2,
    language,
    overall_score: scores.overall,
    love_score: scores.love,
    friendship_score: scores.friendship,
    work_score: scores.work,
    summary: COMPATIBILITY_SUMMARY_FORMAT[language](pairLabel),
    strengths,
    challenges,
    advice: COMPATIBILITY_ADVICE_FORMAT[language](pairLabel),
    famous_couples: []
  };
}

const PERSONALITY_TITLE_FORMAT: Record<Language, (name: string) => string> = {
  tr: (name) => `${name} Burcu Kişilik Analizi`,
  en: (name) => `${name} Personality Analysis`,
  es: (name) => `Análisis de Personalidad de ${name}`,
  pt: (name) => `Análise de Personalidade de ${name}`,
  de: (name) => `${name} Persönlichkeitsanalyse`,
  fr: (name) => `Analyse de personnalité de ${name}`
};

const PERSONALITY_SUMMARY_FORMAT: Record<
  Language,
  (name: string, strength1: string, strength2: string, weakness: string) => string
> = {
  tr: (name, strength1, strength2, weakness) =>
    `${name}; ${strength1} ve ${strength2} yönleriyle öne çıkar. Denge, ${weakness} eğilimini fark etmekle güçlenir.`,
  en: (name, strength1, strength2, weakness) =>
    `${name} often stands out through ${strength1} and ${strength2}. Balance improves by noticing patterns of ${weakness}.`,
  es: (name, strength1, strength2, weakness) =>
    `${name} suele destacar por ${strength1} y ${strength2}. El equilibrio mejora al notar patrones de ${weakness}.`,
  pt: (name, strength1, strength2, weakness) =>
    `${name} costuma se destacar por ${strength1} e ${strength2}. O equilíbrio melhora ao perceber padrões de ${weakness}.`,
  de: (name, strength1, strength2, weakness) =>
    `${name} zeichnet sich häufig durch ${strength1} und ${strength2} aus. Das Gleichgewicht verbessert sich, wenn Muster von ${weakness} erkannt werden.`,
  fr: (name, strength1, strength2, weakness) =>
    `${name} se distingue souvent par ${strength1} et ${strength2}. L'équilibre s'améliore en repérant les tendances liées à ${weakness}.`
};

const PERSONALITY_DEEP_ANALYSIS_FORMAT: Record<
  Language,
  (name: string, planet: string, element: string, modality: string, focus: string) => string
> = {
  tr: (name, planet, element, modality, focus) =>
    `${planet} yönetimindeki ${name}, ${element} elementinin doğasını ${modality} nitelikle ifade eder. En güçlü gelişim alanı, ${focus} temasını günlük kararlarla sürdürülebilir hale getirmektir.`,
  en: (name, planet, element, modality, focus) =>
    `Ruled by ${planet}, ${name} expresses the ${element} element through a ${modality} mode. The central growth task is making ${focus} sustainable through everyday decisions.`,
  es: (name, planet, element, modality, focus) =>
    `Regido por ${planet}, ${name} expresa la naturaleza del elemento ${element} con un modo ${modality}. La tarea de crecimiento central es hacer sostenible ${focus} a través de decisiones cotidianas.`,
  pt: (name, planet, element, modality, focus) =>
    `Regido por ${planet}, ${name} expressa a natureza do elemento ${element} com um modo ${modality}. A tarefa de crescimento central é tornar sustentável ${focus} por meio de decisões do dia a dia.`,
  de: (name, planet, element, modality, focus) =>
    `${name} wird von ${planet} regiert und drückt die Natur des Elements ${element} auf ${modality} Weise aus. Die zentrale Wachstumsaufgabe besteht darin, ${focus} durch alltägliche Entscheidungen dauerhaft zu verankern.`,
  fr: (name, planet, element, modality, focus) =>
    `Gouverné par ${planet}, ${name} exprime la nature de l'élément ${element} sur un mode ${modality}. Le principal axe de croissance consiste à ancrer durablement ${focus} dans des décisions quotidiennes.`
};

function personalityEntry(sign: Sign, language: Language) {
  const name = signName(sign, language);
  const profile = SIGN_PROFILES[sign];

  return {
    sign,
    language,
    title: PERSONALITY_TITLE_FORMAT[language](name),
    summary: PERSONALITY_SUMMARY_FORMAT[language](
      name,
      localizedLower(profile.strengths[language][0], language),
      localizedLower(profile.strengths[language][1], language),
      localizedLower(profile.weaknesses[language][0], language)
    ),
    deep_analysis: PERSONALITY_DEEP_ANALYSIS_FORMAT[language](
      name,
      profile.planet[language],
      elementName(profile.element, language),
      modalityName(profile.modality, language),
      profile.focus[language]
    ),
    strengths: [...profile.strengths[language]],
    weaknesses: [...profile.weaknesses[language]],
    ideal_partners: [...profile.idealPartners],
    career_fit: [...profile.careerFit[language]],
    element: elementName(profile.element, language),
    planet: profile.planet[language],
    color: profile.color[language],
    stone: profile.stone[language]
  };
}

function buildDailyDates(baseDate: Date, dailyDays: number): Date[] {
  if (dailyDays > 0) {
    return Array.from({ length: dailyDays }, (_, index) => addDays(baseDate, index));
  }

  return [-1, 0, 1].map((offset) => addDays(baseDate, offset));
}


const PLACEHOLDER_PATTERNS = [
  /inspirational couple/i,
  /ilham verici çift/i,
  /premium daily analysis/i,
  /premium günlük analiz/i,
  /lorem ipsum/i,
  /\bTODO\b/i
] as const;

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value !== null && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).flatMap(collectStrings);
  }
  return [];
}

export function assertSeedQuality(uploads: ContentSeedUpload[]): void {
  const compatibilitySignatures = new Set<string>();
  const personalitySignatures = new Set<string>();

  for (const upload of uploads) {
    const strings = collectStrings(upload.payload);
    const placeholder = strings.find((value) => PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value)));
    if (placeholder) {
      throw new Error(`Seed quality rejected placeholder copy in ${upload.key}`);
    }

    const payload = upload.payload as Record<string, unknown>;
    if (upload.key.startsWith('content/daily/')) {
      const signs = payload.signs as Record<string, { short?: unknown }> | undefined;
      const summaries = Object.values(signs ?? {})
        .map((entry) => entry.short)
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
      if (summaries.length < 8 || new Set(summaries).size < 8) {
        throw new Error(`Seed quality requires at least 8 unique daily summaries in ${upload.key}`);
      }
    }

    if (upload.key.startsWith('content/compat/')) {
      compatibilitySignatures.add(
        [payload.overall_score, payload.love_score, payload.friendship_score, payload.work_score].join(':')
      );
    }

    if (upload.key.startsWith('content/personality/')) {
      personalitySignatures.add(JSON.stringify(payload.strengths ?? []));
    }

    const hasMetadata =
      payload.content_version === 'seed-v2' &&
      typeof payload.generated_at === 'string' &&
      payload.calculation_version === 'deterministic-profile-v1' &&
      payload.editorial_status === 'generated_quality_checked' &&
      Array.isArray(payload.source_signals) &&
      payload.source_signals.length > 0;
    if (!hasMetadata) {
      throw new Error(`Seed quality requires traceable metadata in ${upload.key}`);
    }
  }

  const compatibilityCount = uploads.filter((item) => item.key.startsWith('content/compat/')).length;
  if (compatibilityCount >= SIGNS.length ** 2 && compatibilitySignatures.size < 20) {
    throw new Error('Seed quality requires at least 20 compatibility score signatures');
  }

  const personalityCount = uploads.filter((item) => item.key.startsWith('content/personality/')).length;
  if (personalityCount >= SIGNS.length && personalitySignatures.size < 10) {
    throw new Error('Seed quality requires at least 10 distinct personality profiles');
  }
}

export function buildDocumentsForSeed(options: ContentSeedOptions = {}): ContentSeedUpload[] {
  const uploads: ContentSeedUpload[] = [];
  const baseDate = parseSeedDate(options.seedDate);
  const dailyDays = parseDailyDays(options.dailyDays);
  const skipStaticContent = options.skipStaticContent ?? false;
  const generatedAt = new Date().toISOString();
  const dailyDates = buildDailyDates(baseDate, dailyDays);
  const weeklyInfos = new Map(dailyDates.map((date) => [getWeekInfo(date).weekId, getWeekInfo(date)]));
  const monthlyInfos = new Map(
    dailyDates.map((date) => {
      const month = formatMonth(date);
      return [month, { month, ...monthRange(date) }];
    })
  );
  const languages = options.language ? [options.language] : LANGUAGES;

  for (const language of languages) {
    for (const date of dailyDates) {
      const isoDate = formatIsoDate(date);
      const dailySigns = Object.fromEntries(
        SIGNS.map((sign) => [sign, dailyEntry(sign, language, isoDate)])
      );

      uploads.push({
        key: `content/daily/${language}/${isoDate}.json`,
        payload: {
          ...contentMetadata(generatedAt, ['sun_sign', 'calendar_date']),
          date: isoDate,
          language,
          signs: dailySigns
        }
      });
    }

    for (const weekInfo of weeklyInfos.values()) {
      const weeklySigns = Object.fromEntries(
        SIGNS.map((sign) => [sign, weeklyEntry(sign, language, weekInfo.weekId)])
      );
      uploads.push({
        key: `content/weekly/${language}/${weekInfo.weekId}.json`,
        payload: {
          ...contentMetadata(generatedAt, ['sun_sign', 'iso_week']),
          week: weekInfo.weekId,
          week_start: weekInfo.weekStart,
          week_end: weekInfo.weekEnd,
          language,
          signs: weeklySigns
        }
      });
    }

    for (const monthInfo of monthlyInfos.values()) {
      const monthlySigns = Object.fromEntries(
        SIGNS.map((sign) => [sign, monthlyEntry(sign, language, monthInfo.month)])
      );
      uploads.push({
        key: `content/monthly/${language}/${monthInfo.month}.json`,
        payload: {
          ...contentMetadata(generatedAt, ['sun_sign', 'calendar_month']),
          month: monthInfo.month,
          month_start: monthInfo.start,
          month_end: monthInfo.end,
          language,
          signs: monthlySigns
        }
      });
    }

    if (!skipStaticContent) {
      for (const sign of SIGNS) {
        uploads.push({
          key: `content/personality/${language}/${sign}.json`,
          payload: {
            ...contentMetadata(generatedAt, ['sun_sign', 'element', 'modality', 'ruling_planet']),
            ...personalityEntry(sign, language)
          }
        });
      }

      for (const sign1 of SIGNS) {
        for (const sign2 of SIGNS) {
          uploads.push({
            key: `content/compat/${language}/${sign1}-${sign2}.json`,
            payload: {
              ...contentMetadata(generatedAt, ['sun_sign_pair', 'element_affinity', 'modality_affinity']),
              ...compatibilityEntry(sign1, sign2, language)
            }
          });
        }
      }
    }
  }

  return uploads;
}
