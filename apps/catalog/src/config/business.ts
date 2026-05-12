function cleanUrl(value: string) {
  return value.trim().replace(/\/+$/, '');
}

function cleanPhone(value: string) {
  return value.replace(/[^\d+]/g, '');
}

export const siteUrl = cleanUrl(import.meta.env.VITE_SITE_URL ?? 'https://audidisc.com');

export const business = {
  name: 'Audi Disc',
  city: 'Sucre',
  region: import.meta.env.VITE_BUSINESS_REGION ?? 'Chuquisaca',
  country: import.meta.env.VITE_BUSINESS_COUNTRY ?? 'BO',
  postalCode: import.meta.env.VITE_BUSINESS_POSTAL_CODE ?? '0000',
  streetAddress: import.meta.env.VITE_BUSINESS_STREET_ADDRESS ?? 'Calle Junin, Zona Central',
  latitude: Number(import.meta.env.VITE_BUSINESS_LATITUDE ?? '-19.043'),
  longitude: Number(import.meta.env.VITE_BUSINESS_LONGITUDE ?? '-65.259'),
  phone: cleanPhone(import.meta.env.VITE_WHATSAPP_PHONE ?? '+59170000000'),
  openingHours: import.meta.env.VITE_BUSINESS_OPENING_HOURS ?? 'Mo-Sa 09:00-19:00',
  facebookUrl: import.meta.env.VITE_BUSINESS_FACEBOOK_URL ?? 'https://facebook.com/audidisc',
  instagramUrl: import.meta.env.VITE_BUSINESS_INSTAGRAM_URL ?? 'https://instagram.com/audidisc',
} as const;

export function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${siteUrl}${path.startsWith('/') ? path : `/${path}`}`;
}
