export interface CityRecord {
  id: string;
  name: string;
  country: string;
  /** Degrees north of the equator; negative is south. */
  latitude: number;
  /** Degrees east of Greenwich; negative is west. */
  longitude: number;
  /** IANA time zone identifier — resolved to a UTC offset via Intl.DateTimeFormat, not stored as a fixed offset. */
  tzid: string;
}

/**
 * MVP seed set: major capitals and largest metros, each with coordinates and
 * an IANA time zone identifier the author is highly confident in — not a
 * comprehensive gazetteer. Covers the product's current (TR, EN) and planned
 * (ES, PT, DE, FR, HI) markets well enough for onboarding and testing, but
 * production launch needs a proper GeoNames-derived import (see
 * scripts/seed-content.ts for the existing pattern of a data-loading script)
 * before this can serve users outside these ~90 metro areas well.
 */
export const MAJOR_CITIES: readonly CityRecord[] = [
  // Türkiye
  { id: 'istanbul-tr', name: 'Istanbul', country: 'Turkey', latitude: 41.01, longitude: 28.98, tzid: 'Europe/Istanbul' },
  { id: 'ankara-tr', name: 'Ankara', country: 'Turkey', latitude: 39.93, longitude: 32.86, tzid: 'Europe/Istanbul' },
  { id: 'izmir-tr', name: 'Izmir', country: 'Turkey', latitude: 38.42, longitude: 27.14, tzid: 'Europe/Istanbul' },
  { id: 'bursa-tr', name: 'Bursa', country: 'Turkey', latitude: 40.18, longitude: 29.06, tzid: 'Europe/Istanbul' },
  { id: 'antalya-tr', name: 'Antalya', country: 'Turkey', latitude: 36.9, longitude: 30.71, tzid: 'Europe/Istanbul' },
  { id: 'adana-tr', name: 'Adana', country: 'Turkey', latitude: 37.0, longitude: 35.32, tzid: 'Europe/Istanbul' },

  // United States
  { id: 'new-york-us', name: 'New York', country: 'United States', latitude: 40.71, longitude: -74.01, tzid: 'America/New_York' },
  { id: 'los-angeles-us', name: 'Los Angeles', country: 'United States', latitude: 34.05, longitude: -118.24, tzid: 'America/Los_Angeles' },
  { id: 'chicago-us', name: 'Chicago', country: 'United States', latitude: 41.88, longitude: -87.63, tzid: 'America/Chicago' },
  { id: 'houston-us', name: 'Houston', country: 'United States', latitude: 29.76, longitude: -95.37, tzid: 'America/Chicago' },
  { id: 'miami-us', name: 'Miami', country: 'United States', latitude: 25.76, longitude: -80.19, tzid: 'America/New_York' },
  { id: 'san-francisco-us', name: 'San Francisco', country: 'United States', latitude: 37.77, longitude: -122.42, tzid: 'America/Los_Angeles' },
  { id: 'seattle-us', name: 'Seattle', country: 'United States', latitude: 47.61, longitude: -122.33, tzid: 'America/Los_Angeles' },
  { id: 'denver-us', name: 'Denver', country: 'United States', latitude: 39.74, longitude: -104.99, tzid: 'America/Denver' },
  { id: 'boston-us', name: 'Boston', country: 'United States', latitude: 42.36, longitude: -71.06, tzid: 'America/New_York' },
  { id: 'washington-dc-us', name: 'Washington, D.C.', country: 'United States', latitude: 38.91, longitude: -77.04, tzid: 'America/New_York' },
  { id: 'atlanta-us', name: 'Atlanta', country: 'United States', latitude: 33.75, longitude: -84.39, tzid: 'America/New_York' },
  { id: 'dallas-us', name: 'Dallas', country: 'United States', latitude: 32.78, longitude: -96.8, tzid: 'America/Chicago' },
  { id: 'phoenix-us', name: 'Phoenix', country: 'United States', latitude: 33.45, longitude: -112.07, tzid: 'America/Phoenix' },
  { id: 'honolulu-us', name: 'Honolulu', country: 'United States', latitude: 21.31, longitude: -157.86, tzid: 'Pacific/Honolulu' },

  // United Kingdom & Ireland
  { id: 'london-gb', name: 'London', country: 'United Kingdom', latitude: 51.51, longitude: -0.13, tzid: 'Europe/London' },
  { id: 'manchester-gb', name: 'Manchester', country: 'United Kingdom', latitude: 53.48, longitude: -2.24, tzid: 'Europe/London' },
  { id: 'edinburgh-gb', name: 'Edinburgh', country: 'United Kingdom', latitude: 55.95, longitude: -3.19, tzid: 'Europe/London' },
  { id: 'dublin-ie', name: 'Dublin', country: 'Ireland', latitude: 53.35, longitude: -6.26, tzid: 'Europe/Dublin' },

  // Spain & Portugal
  { id: 'madrid-es', name: 'Madrid', country: 'Spain', latitude: 40.42, longitude: -3.7, tzid: 'Europe/Madrid' },
  { id: 'barcelona-es', name: 'Barcelona', country: 'Spain', latitude: 41.39, longitude: 2.17, tzid: 'Europe/Madrid' },
  { id: 'valencia-es', name: 'Valencia', country: 'Spain', latitude: 39.47, longitude: -0.38, tzid: 'Europe/Madrid' },
  { id: 'seville-es', name: 'Seville', country: 'Spain', latitude: 37.39, longitude: -5.99, tzid: 'Europe/Madrid' },
  { id: 'lisbon-pt', name: 'Lisbon', country: 'Portugal', latitude: 38.72, longitude: -9.14, tzid: 'Europe/Lisbon' },
  { id: 'porto-pt', name: 'Porto', country: 'Portugal', latitude: 41.15, longitude: -8.61, tzid: 'Europe/Lisbon' },

  // Brazil & Latin America
  { id: 'sao-paulo-br', name: 'São Paulo', country: 'Brazil', latitude: -23.55, longitude: -46.63, tzid: 'America/Sao_Paulo' },
  { id: 'rio-de-janeiro-br', name: 'Rio de Janeiro', country: 'Brazil', latitude: -22.91, longitude: -43.17, tzid: 'America/Sao_Paulo' },
  { id: 'brasilia-br', name: 'Brasília', country: 'Brazil', latitude: -15.79, longitude: -47.88, tzid: 'America/Sao_Paulo' },
  { id: 'mexico-city-mx', name: 'Mexico City', country: 'Mexico', latitude: 19.43, longitude: -99.13, tzid: 'America/Mexico_City' },
  { id: 'buenos-aires-ar', name: 'Buenos Aires', country: 'Argentina', latitude: -34.6, longitude: -58.38, tzid: 'America/Argentina/Buenos_Aires' },
  { id: 'bogota-co', name: 'Bogotá', country: 'Colombia', latitude: 4.71, longitude: -74.07, tzid: 'America/Bogota' },
  { id: 'santiago-cl', name: 'Santiago', country: 'Chile', latitude: -33.45, longitude: -70.67, tzid: 'America/Santiago' },
  { id: 'lima-pe', name: 'Lima', country: 'Peru', latitude: -12.05, longitude: -77.04, tzid: 'America/Lima' },

  // Germany, France, Italy, Benelux
  { id: 'berlin-de', name: 'Berlin', country: 'Germany', latitude: 52.52, longitude: 13.4, tzid: 'Europe/Berlin' },
  { id: 'munich-de', name: 'Munich', country: 'Germany', latitude: 48.14, longitude: 11.58, tzid: 'Europe/Berlin' },
  { id: 'hamburg-de', name: 'Hamburg', country: 'Germany', latitude: 53.55, longitude: 9.99, tzid: 'Europe/Berlin' },
  { id: 'frankfurt-de', name: 'Frankfurt', country: 'Germany', latitude: 50.11, longitude: 8.68, tzid: 'Europe/Berlin' },
  { id: 'cologne-de', name: 'Cologne', country: 'Germany', latitude: 50.94, longitude: 6.96, tzid: 'Europe/Berlin' },
  { id: 'paris-fr', name: 'Paris', country: 'France', latitude: 48.86, longitude: 2.35, tzid: 'Europe/Paris' },
  { id: 'marseille-fr', name: 'Marseille', country: 'France', latitude: 43.3, longitude: 5.37, tzid: 'Europe/Paris' },
  { id: 'lyon-fr', name: 'Lyon', country: 'France', latitude: 45.76, longitude: 4.84, tzid: 'Europe/Paris' },
  { id: 'rome-it', name: 'Rome', country: 'Italy', latitude: 41.9, longitude: 12.5, tzid: 'Europe/Rome' },
  { id: 'milan-it', name: 'Milan', country: 'Italy', latitude: 45.46, longitude: 9.19, tzid: 'Europe/Rome' },
  { id: 'amsterdam-nl', name: 'Amsterdam', country: 'Netherlands', latitude: 52.37, longitude: 4.9, tzid: 'Europe/Amsterdam' },
  { id: 'brussels-be', name: 'Brussels', country: 'Belgium', latitude: 50.85, longitude: 4.35, tzid: 'Europe/Brussels' },
  { id: 'zurich-ch', name: 'Zurich', country: 'Switzerland', latitude: 47.37, longitude: 8.54, tzid: 'Europe/Zurich' },
  { id: 'vienna-at', name: 'Vienna', country: 'Austria', latitude: 48.21, longitude: 16.37, tzid: 'Europe/Vienna' },

  // Northern & Eastern Europe
  { id: 'warsaw-pl', name: 'Warsaw', country: 'Poland', latitude: 52.23, longitude: 21.01, tzid: 'Europe/Warsaw' },
  { id: 'stockholm-se', name: 'Stockholm', country: 'Sweden', latitude: 59.33, longitude: 18.07, tzid: 'Europe/Stockholm' },
  { id: 'athens-gr', name: 'Athens', country: 'Greece', latitude: 37.98, longitude: 23.73, tzid: 'Europe/Athens' },
  { id: 'moscow-ru', name: 'Moscow', country: 'Russia', latitude: 55.76, longitude: 37.62, tzid: 'Europe/Moscow' },
  { id: 'saint-petersburg-ru', name: 'Saint Petersburg', country: 'Russia', latitude: 59.93, longitude: 30.34, tzid: 'Europe/Moscow' },

  // India
  { id: 'mumbai-in', name: 'Mumbai', country: 'India', latitude: 19.08, longitude: 72.88, tzid: 'Asia/Kolkata' },
  { id: 'delhi-in', name: 'Delhi', country: 'India', latitude: 28.61, longitude: 77.21, tzid: 'Asia/Kolkata' },
  { id: 'bangalore-in', name: 'Bangalore', country: 'India', latitude: 12.97, longitude: 77.59, tzid: 'Asia/Kolkata' },
  { id: 'kolkata-in', name: 'Kolkata', country: 'India', latitude: 22.57, longitude: 88.36, tzid: 'Asia/Kolkata' },
  { id: 'chennai-in', name: 'Chennai', country: 'India', latitude: 13.08, longitude: 80.27, tzid: 'Asia/Kolkata' },
  { id: 'hyderabad-in', name: 'Hyderabad', country: 'India', latitude: 17.39, longitude: 78.49, tzid: 'Asia/Kolkata' },

  // East & Southeast Asia
  { id: 'beijing-cn', name: 'Beijing', country: 'China', latitude: 39.9, longitude: 116.41, tzid: 'Asia/Shanghai' },
  { id: 'shanghai-cn', name: 'Shanghai', country: 'China', latitude: 31.23, longitude: 121.47, tzid: 'Asia/Shanghai' },
  { id: 'guangzhou-cn', name: 'Guangzhou', country: 'China', latitude: 23.13, longitude: 113.26, tzid: 'Asia/Shanghai' },
  { id: 'tokyo-jp', name: 'Tokyo', country: 'Japan', latitude: 35.68, longitude: 139.65, tzid: 'Asia/Tokyo' },
  { id: 'osaka-jp', name: 'Osaka', country: 'Japan', latitude: 34.69, longitude: 135.5, tzid: 'Asia/Tokyo' },
  { id: 'seoul-kr', name: 'Seoul', country: 'South Korea', latitude: 37.57, longitude: 126.98, tzid: 'Asia/Seoul' },
  { id: 'bangkok-th', name: 'Bangkok', country: 'Thailand', latitude: 13.76, longitude: 100.5, tzid: 'Asia/Bangkok' },
  { id: 'jakarta-id', name: 'Jakarta', country: 'Indonesia', latitude: -6.21, longitude: 106.85, tzid: 'Asia/Jakarta' },
  { id: 'manila-ph', name: 'Manila', country: 'Philippines', latitude: 14.6, longitude: 120.98, tzid: 'Asia/Manila' },
  { id: 'singapore-sg', name: 'Singapore', country: 'Singapore', latitude: 1.35, longitude: 103.82, tzid: 'Asia/Singapore' },
  { id: 'kuala-lumpur-my', name: 'Kuala Lumpur', country: 'Malaysia', latitude: 3.14, longitude: 101.69, tzid: 'Asia/Kuala_Lumpur' },
  { id: 'ho-chi-minh-city-vn', name: 'Ho Chi Minh City', country: 'Vietnam', latitude: 10.82, longitude: 106.63, tzid: 'Asia/Ho_Chi_Minh' },

  // Middle East
  { id: 'dubai-ae', name: 'Dubai', country: 'United Arab Emirates', latitude: 25.2, longitude: 55.27, tzid: 'Asia/Dubai' },
  { id: 'riyadh-sa', name: 'Riyadh', country: 'Saudi Arabia', latitude: 24.71, longitude: 46.68, tzid: 'Asia/Riyadh' },
  { id: 'tehran-ir', name: 'Tehran', country: 'Iran', latitude: 35.69, longitude: 51.39, tzid: 'Asia/Tehran' },
  { id: 'tel-aviv-il', name: 'Tel Aviv', country: 'Israel', latitude: 32.08, longitude: 34.78, tzid: 'Asia/Jerusalem' },
  { id: 'baghdad-iq', name: 'Baghdad', country: 'Iraq', latitude: 33.31, longitude: 44.36, tzid: 'Asia/Baghdad' },

  // Africa
  { id: 'cairo-eg', name: 'Cairo', country: 'Egypt', latitude: 30.04, longitude: 31.24, tzid: 'Africa/Cairo' },
  { id: 'lagos-ng', name: 'Lagos', country: 'Nigeria', latitude: 6.52, longitude: 3.38, tzid: 'Africa/Lagos' },
  { id: 'nairobi-ke', name: 'Nairobi', country: 'Kenya', latitude: -1.29, longitude: 36.82, tzid: 'Africa/Nairobi' },
  { id: 'johannesburg-za', name: 'Johannesburg', country: 'South Africa', latitude: -26.2, longitude: 28.05, tzid: 'Africa/Johannesburg' },
  { id: 'casablanca-ma', name: 'Casablanca', country: 'Morocco', latitude: 33.57, longitude: -7.59, tzid: 'Africa/Casablanca' },
  { id: 'addis-ababa-et', name: 'Addis Ababa', country: 'Ethiopia', latitude: 9.03, longitude: 38.74, tzid: 'Africa/Addis_Ababa' },

  // Oceania & Canada
  { id: 'sydney-au', name: 'Sydney', country: 'Australia', latitude: -33.87, longitude: 151.21, tzid: 'Australia/Sydney' },
  { id: 'melbourne-au', name: 'Melbourne', country: 'Australia', latitude: -37.81, longitude: 144.96, tzid: 'Australia/Melbourne' },
  { id: 'perth-au', name: 'Perth', country: 'Australia', latitude: -31.95, longitude: 115.86, tzid: 'Australia/Perth' },
  { id: 'auckland-nz', name: 'Auckland', country: 'New Zealand', latitude: -36.85, longitude: 174.76, tzid: 'Pacific/Auckland' },
  { id: 'toronto-ca', name: 'Toronto', country: 'Canada', latitude: 43.65, longitude: -79.38, tzid: 'America/Toronto' },
  { id: 'vancouver-ca', name: 'Vancouver', country: 'Canada', latitude: 49.28, longitude: -123.12, tzid: 'America/Vancouver' },
  { id: 'montreal-ca', name: 'Montreal', country: 'Canada', latitude: 45.5, longitude: -73.57, tzid: 'America/Toronto' }
] as const;
