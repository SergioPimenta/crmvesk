export type CountryDialCode = {
  iso2: string;
  name: string;
  dial: string;
};

export const DEFAULT_DIAL_COUNTRY = 'BR';

export function countryFlag(iso2: string): string {
  const code = iso2.toUpperCase();
  if (code.length !== 2) return '';
  return String.fromCodePoint(
    ...[...code].map((char) => 0x1f1e6 - 65 + char.charCodeAt(0))
  );
}

const RAW_COUNTRIES: CountryDialCode[] = [
  { iso2: 'AF', name: 'Afeganistão', dial: '93' },
  { iso2: 'ZA', name: 'África do Sul', dial: '27' },
  { iso2: 'AL', name: 'Albânia', dial: '355' },
  { iso2: 'DE', name: 'Alemanha', dial: '49' },
  { iso2: 'AD', name: 'Andorra', dial: '376' },
  { iso2: 'AO', name: 'Angola', dial: '244' },
  { iso2: 'AI', name: 'Anguilla', dial: '1264' },
  { iso2: 'AG', name: 'Antígua e Barbuda', dial: '1268' },
  { iso2: 'SA', name: 'Arábia Saudita', dial: '966' },
  { iso2: 'DZ', name: 'Argélia', dial: '213' },
  { iso2: 'AR', name: 'Argentina', dial: '54' },
  { iso2: 'AM', name: 'Armênia', dial: '374' },
  { iso2: 'AW', name: 'Aruba', dial: '297' },
  { iso2: 'AU', name: 'Austrália', dial: '61' },
  { iso2: 'AT', name: 'Áustria', dial: '43' },
  { iso2: 'AZ', name: 'Azerbaijão', dial: '994' },
  { iso2: 'BS', name: 'Bahamas', dial: '1242' },
  { iso2: 'BH', name: 'Bahrein', dial: '973' },
  { iso2: 'BD', name: 'Bangladesh', dial: '880' },
  { iso2: 'BB', name: 'Barbados', dial: '1246' },
  { iso2: 'BE', name: 'Bélgica', dial: '32' },
  { iso2: 'BZ', name: 'Belize', dial: '501' },
  { iso2: 'BJ', name: 'Benin', dial: '229' },
  { iso2: 'BM', name: 'Bermudas', dial: '1441' },
  { iso2: 'BY', name: 'Bielorrússia', dial: '375' },
  { iso2: 'BO', name: 'Bolívia', dial: '591' },
  { iso2: 'BA', name: 'Bósnia e Herzegovina', dial: '387' },
  { iso2: 'BW', name: 'Botsuana', dial: '267' },
  { iso2: 'BR', name: 'Brasil', dial: '55' },
  { iso2: 'BN', name: 'Brunei', dial: '673' },
  { iso2: 'BG', name: 'Bulgária', dial: '359' },
  { iso2: 'BF', name: 'Burkina Faso', dial: '226' },
  { iso2: 'BI', name: 'Burundi', dial: '257' },
  { iso2: 'BT', name: 'Butão', dial: '975' },
  { iso2: 'CV', name: 'Cabo Verde', dial: '238' },
  { iso2: 'CM', name: 'Camarões', dial: '237' },
  { iso2: 'KH', name: 'Camboja', dial: '855' },
  { iso2: 'CA', name: 'Canadá', dial: '1' },
  { iso2: 'QA', name: 'Catar', dial: '974' },
  { iso2: 'KZ', name: 'Cazaquistão', dial: '7' },
  { iso2: 'TD', name: 'Chade', dial: '235' },
  { iso2: 'CL', name: 'Chile', dial: '56' },
  { iso2: 'CN', name: 'China', dial: '86' },
  { iso2: 'CY', name: 'Chipre', dial: '357' },
  { iso2: 'CO', name: 'Colômbia', dial: '57' },
  { iso2: 'KM', name: 'Comores', dial: '269' },
  { iso2: 'CG', name: 'Congo', dial: '242' },
  { iso2: 'CD', name: 'Congo (RDC)', dial: '243' },
  { iso2: 'KP', name: 'Coreia do Norte', dial: '850' },
  { iso2: 'KR', name: 'Coreia do Sul', dial: '82' },
  { iso2: 'CI', name: 'Costa do Marfim', dial: '225' },
  { iso2: 'CR', name: 'Costa Rica', dial: '506' },
  { iso2: 'HR', name: 'Croácia', dial: '385' },
  { iso2: 'CU', name: 'Cuba', dial: '53' },
  { iso2: 'CW', name: 'Curaçao', dial: '599' },
  { iso2: 'DK', name: 'Dinamarca', dial: '45' },
  { iso2: 'DJ', name: 'Djibuti', dial: '253' },
  { iso2: 'DM', name: 'Dominica', dial: '1767' },
  { iso2: 'EG', name: 'Egito', dial: '20' },
  { iso2: 'SV', name: 'El Salvador', dial: '503' },
  { iso2: 'AE', name: 'Emirados Árabes Unidos', dial: '971' },
  { iso2: 'EC', name: 'Equador', dial: '593' },
  { iso2: 'ER', name: 'Eritreia', dial: '291' },
  { iso2: 'SK', name: 'Eslováquia', dial: '421' },
  { iso2: 'SI', name: 'Eslovênia', dial: '386' },
  { iso2: 'ES', name: 'Espanha', dial: '34' },
  { iso2: 'US', name: 'Estados Unidos', dial: '1' },
  { iso2: 'EE', name: 'Estônia', dial: '372' },
  { iso2: 'SZ', name: 'Eswatini', dial: '268' },
  { iso2: 'ET', name: 'Etiópia', dial: '251' },
  { iso2: 'FJ', name: 'Fiji', dial: '679' },
  { iso2: 'PH', name: 'Filipinas', dial: '63' },
  { iso2: 'FI', name: 'Finlândia', dial: '358' },
  { iso2: 'FR', name: 'França', dial: '33' },
  { iso2: 'GA', name: 'Gabão', dial: '241' },
  { iso2: 'GM', name: 'Gâmbia', dial: '220' },
  { iso2: 'GH', name: 'Gana', dial: '233' },
  { iso2: 'GE', name: 'Geórgia', dial: '995' },
  { iso2: 'GI', name: 'Gibraltar', dial: '350' },
  { iso2: 'GD', name: 'Granada', dial: '1473' },
  { iso2: 'GR', name: 'Grécia', dial: '30' },
  { iso2: 'GL', name: 'Groenlândia', dial: '299' },
  { iso2: 'GP', name: 'Guadalupe', dial: '590' },
  { iso2: 'GU', name: 'Guam', dial: '1671' },
  { iso2: 'GT', name: 'Guatemala', dial: '502' },
  { iso2: 'GG', name: 'Guernsey', dial: '44' },
  { iso2: 'GY', name: 'Guiana', dial: '592' },
  { iso2: 'GF', name: 'Guiana Francesa', dial: '594' },
  { iso2: 'GN', name: 'Guiné', dial: '224' },
  { iso2: 'GQ', name: 'Guiné Equatorial', dial: '240' },
  { iso2: 'GW', name: 'Guiné-Bissau', dial: '245' },
  { iso2: 'HT', name: 'Haiti', dial: '509' },
  { iso2: 'HN', name: 'Honduras', dial: '504' },
  { iso2: 'HK', name: 'Hong Kong', dial: '852' },
  { iso2: 'HU', name: 'Hungria', dial: '36' },
  { iso2: 'YE', name: 'Iêmen', dial: '967' },
  { iso2: 'IN', name: 'Índia', dial: '91' },
  { iso2: 'ID', name: 'Indonésia', dial: '62' },
  { iso2: 'IQ', name: 'Iraque', dial: '964' },
  { iso2: 'IR', name: 'Irã', dial: '98' },
  { iso2: 'IE', name: 'Irlanda', dial: '353' },
  { iso2: 'IS', name: 'Islândia', dial: '354' },
  { iso2: 'IL', name: 'Israel', dial: '972' },
  { iso2: 'IT', name: 'Itália', dial: '39' },
  { iso2: 'JM', name: 'Jamaica', dial: '1876' },
  { iso2: 'JP', name: 'Japão', dial: '81' },
  { iso2: 'JE', name: 'Jersey', dial: '44' },
  { iso2: 'JO', name: 'Jordânia', dial: '962' },
  { iso2: 'KW', name: 'Kuwait', dial: '965' },
  { iso2: 'LA', name: 'Laos', dial: '856' },
  { iso2: 'LS', name: 'Lesoto', dial: '266' },
  { iso2: 'LV', name: 'Letônia', dial: '371' },
  { iso2: 'LB', name: 'Líbano', dial: '961' },
  { iso2: 'LR', name: 'Libéria', dial: '231' },
  { iso2: 'LY', name: 'Líbia', dial: '218' },
  { iso2: 'LI', name: 'Liechtenstein', dial: '423' },
  { iso2: 'LT', name: 'Lituânia', dial: '370' },
  { iso2: 'LU', name: 'Luxemburgo', dial: '352' },
  { iso2: 'MO', name: 'Macau', dial: '853' },
  { iso2: 'MK', name: 'Macedônia do Norte', dial: '389' },
  { iso2: 'MG', name: 'Madagascar', dial: '261' },
  { iso2: 'MY', name: 'Malásia', dial: '60' },
  { iso2: 'MW', name: 'Malawi', dial: '265' },
  { iso2: 'MV', name: 'Maldivas', dial: '960' },
  { iso2: 'ML', name: 'Mali', dial: '223' },
  { iso2: 'MT', name: 'Malta', dial: '356' },
  { iso2: 'MA', name: 'Marrocos', dial: '212' },
  { iso2: 'MQ', name: 'Martinica', dial: '596' },
  { iso2: 'MU', name: 'Maurício', dial: '230' },
  { iso2: 'MR', name: 'Mauritânia', dial: '222' },
  { iso2: 'MX', name: 'México', dial: '52' },
  { iso2: 'MM', name: 'Mianmar', dial: '95' },
  { iso2: 'FM', name: 'Micronésia', dial: '691' },
  { iso2: 'MZ', name: 'Moçambique', dial: '258' },
  { iso2: 'MD', name: 'Moldávia', dial: '373' },
  { iso2: 'MC', name: 'Mônaco', dial: '377' },
  { iso2: 'MN', name: 'Mongólia', dial: '976' },
  { iso2: 'ME', name: 'Montenegro', dial: '382' },
  { iso2: 'MS', name: 'Montserrat', dial: '1664' },
  { iso2: 'NA', name: 'Namíbia', dial: '264' },
  { iso2: 'NR', name: 'Nauru', dial: '674' },
  { iso2: 'NP', name: 'Nepal', dial: '977' },
  { iso2: 'NI', name: 'Nicarágua', dial: '505' },
  { iso2: 'NE', name: 'Níger', dial: '227' },
  { iso2: 'NG', name: 'Nigéria', dial: '234' },
  { iso2: 'NO', name: 'Noruega', dial: '47' },
  { iso2: 'NC', name: 'Nova Caledônia', dial: '687' },
  { iso2: 'NZ', name: 'Nova Zelândia', dial: '64' },
  { iso2: 'OM', name: 'Omã', dial: '968' },
  { iso2: 'NL', name: 'Países Baixos', dial: '31' },
  { iso2: 'PW', name: 'Palau', dial: '680' },
  { iso2: 'PS', name: 'Palestina', dial: '970' },
  { iso2: 'PA', name: 'Panamá', dial: '507' },
  { iso2: 'PG', name: 'Papua-Nova Guiné', dial: '675' },
  { iso2: 'PK', name: 'Paquistão', dial: '92' },
  { iso2: 'PY', name: 'Paraguai', dial: '595' },
  { iso2: 'PE', name: 'Peru', dial: '51' },
  { iso2: 'PF', name: 'Polinésia Francesa', dial: '689' },
  { iso2: 'PL', name: 'Polônia', dial: '48' },
  { iso2: 'PR', name: 'Porto Rico', dial: '1' },
  { iso2: 'PT', name: 'Portugal', dial: '351' },
  { iso2: 'KE', name: 'Quênia', dial: '254' },
  { iso2: 'KG', name: 'Quirguistão', dial: '996' },
  { iso2: 'GB', name: 'Reino Unido', dial: '44' },
  { iso2: 'CF', name: 'República Centro-Africana', dial: '236' },
  { iso2: 'DO', name: 'República Dominicana', dial: '1' },
  { iso2: 'CZ', name: 'República Tcheca', dial: '420' },
  { iso2: 'RE', name: 'Reunião', dial: '262' },
  { iso2: 'RO', name: 'Romênia', dial: '40' },
  { iso2: 'RW', name: 'Ruanda', dial: '250' },
  { iso2: 'RU', name: 'Rússia', dial: '7' },
  { iso2: 'EH', name: 'Saara Ocidental', dial: '212' },
  { iso2: 'WS', name: 'Samoa', dial: '685' },
  { iso2: 'SM', name: 'San Marino', dial: '378' },
  { iso2: 'LC', name: 'Santa Lúcia', dial: '1758' },
  { iso2: 'ST', name: 'São Tomé e Príncipe', dial: '239' },
  { iso2: 'SN', name: 'Senegal', dial: '221' },
  { iso2: 'SL', name: 'Serra Leoa', dial: '232' },
  { iso2: 'RS', name: 'Sérvia', dial: '381' },
  { iso2: 'SC', name: 'Seychelles', dial: '248' },
  { iso2: 'SG', name: 'Singapura', dial: '65' },
  { iso2: 'SY', name: 'Síria', dial: '963' },
  { iso2: 'SO', name: 'Somália', dial: '252' },
  { iso2: 'LK', name: 'Sri Lanka', dial: '94' },
  { iso2: 'SD', name: 'Sudão', dial: '249' },
  { iso2: 'SS', name: 'Sudão do Sul', dial: '211' },
  { iso2: 'SE', name: 'Suécia', dial: '46' },
  { iso2: 'CH', name: 'Suíça', dial: '41' },
  { iso2: 'SR', name: 'Suriname', dial: '597' },
  { iso2: 'TH', name: 'Tailândia', dial: '66' },
  { iso2: 'TW', name: 'Taiwan', dial: '886' },
  { iso2: 'TJ', name: 'Tajiquistão', dial: '992' },
  { iso2: 'TZ', name: 'Tanzânia', dial: '255' },
  { iso2: 'TL', name: 'Timor-Leste', dial: '670' },
  { iso2: 'TG', name: 'Togo', dial: '228' },
  { iso2: 'TO', name: 'Tonga', dial: '676' },
  { iso2: 'TT', name: 'Trinidad e Tobago', dial: '1868' },
  { iso2: 'TN', name: 'Tunísia', dial: '216' },
  { iso2: 'TM', name: 'Turcomenistão', dial: '993' },
  { iso2: 'TR', name: 'Turquia', dial: '90' },
  { iso2: 'TV', name: 'Tuvalu', dial: '688' },
  { iso2: 'UA', name: 'Ucrânia', dial: '380' },
  { iso2: 'UG', name: 'Uganda', dial: '256' },
  { iso2: 'UY', name: 'Uruguai', dial: '598' },
  { iso2: 'UZ', name: 'Uzbequistão', dial: '998' },
  { iso2: 'VU', name: 'Vanuatu', dial: '678' },
  { iso2: 'VA', name: 'Vaticano', dial: '39' },
  { iso2: 'VE', name: 'Venezuela', dial: '58' },
  { iso2: 'VN', name: 'Vietnã', dial: '84' },
  { iso2: 'ZM', name: 'Zâmbia', dial: '260' },
  { iso2: 'ZW', name: 'Zimbábue', dial: '263' },
];

const br = RAW_COUNTRIES.find((c) => c.iso2 === DEFAULT_DIAL_COUNTRY)!;
const others = RAW_COUNTRIES.filter((c) => c.iso2 !== DEFAULT_DIAL_COUNTRY).sort((a, b) =>
  a.name.localeCompare(b.name, 'pt-BR')
);

export const COUNTRY_DIAL_CODES: CountryDialCode[] = [br, ...others];

const byIso = new Map(COUNTRY_DIAL_CODES.map((c) => [c.iso2, c]));

export function getCountryByIso(iso2: string): CountryDialCode | undefined {
  return byIso.get(iso2);
}

/** Extrai DDD+número para contatos do CRM (sempre Brasil, sem confundir DDD com DDI). */
export function nationalDigitsFromContactPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55') && digits.length >= 12) {
    return digits.slice(2);
  }
  return digits;
}

export function splitPhoneDigits(fullDigits: string): { iso2: string; national: string } {
  const digits = fullDigits.replace(/\D/g, '');
  if (!digits) return { iso2: DEFAULT_DIAL_COUNTRY, national: '' };

  // Brasil com DDI explícito: 55 + DDD + número (12–13 dígitos)
  if (digits.startsWith('55') && digits.length >= 12 && digits.length <= 13) {
    return { iso2: DEFAULT_DIAL_COUNTRY, national: digits.slice(2) };
  }

  // Número nacional BR (DDD + número) — priorizar antes de detectar outros DDIs
  if (digits.length >= 10 && digits.length <= 11) {
    return { iso2: DEFAULT_DIAL_COUNTRY, national: digits };
  }

  const byDialLength = [...COUNTRY_DIAL_CODES]
    .filter((c) => c.iso2 !== DEFAULT_DIAL_COUNTRY)
    .sort((a, b) => b.dial.length - a.dial.length);

  for (const country of byDialLength) {
    if (digits.startsWith(country.dial) && digits.length > country.dial.length + 7) {
      return { iso2: country.iso2, national: digits.slice(country.dial.length) };
    }
  }

  return { iso2: DEFAULT_DIAL_COUNTRY, national: digits };
}

export function buildFullPhone(iso2: string, nationalDigits: string): string {
  const country = getCountryByIso(iso2) ?? getCountryByIso(DEFAULT_DIAL_COUNTRY)!;
  const national = nationalDigits.replace(/\D/g, '');
  return `${country.dial}${national}`;
}
