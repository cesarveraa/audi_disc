import type { CatalogProduct } from '@audidisc/shared';
import { createCatalogProductSlug } from '@audidisc/shared';

import { business } from '../config/business';

export const heroImage =
  'https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&w=1800&q=88&fm=webp';

export const storeImage =
  'https://images.unsplash.com/photo-1556740738-b6a63e27c4df?auto=format&fit=crop&w=1400&q=86&fm=webp';

const fallbackImages = {
  audio: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=86&fm=webp',
  cables: 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=1200&q=86&fm=webp',
  memoria: 'https://images.unsplash.com/photo-1601737487795-dab272f52420?auto=format&fit=crop&w=1200&q=86&fm=webp',
  fotografia: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=86&fm=webp',
  general: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1200&q=86&fm=webp',
} as const;

export function normalize(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function ensureWebpUrl(url: string) {
  if (url.includes('images.unsplash.com')) {
    const separator = url.includes('?') ? '&' : '?';
    return url.includes('fm=webp') ? url : `${url}${separator}fm=webp`;
  }
  return url;
}

export function imageForProduct(product: CatalogProduct) {
  if (product.imagenUrl) {
    return ensureWebpUrl(product.imagenUrl);
  }

  const key = normalize(`${product.nombre} ${product.categoria ?? ''}`);
  if (key.includes('cable') || key.includes('usb') || key.includes('adaptador')) {
    return fallbackImages.cables;
  }
  if (key.includes('memoria') || key.includes('flash') || key.includes('sd')) {
    return fallbackImages.memoria;
  }
  if (key.includes('camara') || key.includes('papel') || key.includes('foto')) {
    return fallbackImages.fotografia;
  }
  if (key.includes('audio') || key.includes('audifono') || key.includes('parlante')) {
    return fallbackImages.audio;
  }
  return fallbackImages.general;
}

export function productSlug(product: CatalogProduct) {
  return createCatalogProductSlug(product, business.city);
}

export function productPath(product: CatalogProduct) {
  return `/productos/${productSlug(product)}`;
}

export function productDisplayName(product: CatalogProduct) {
  const name = product.nombre.trim();
  const brand = product.marca?.trim();
  const nameHasBrand = brand ? normalize(name).includes(normalize(brand)) : true;
  return [name, nameHasBrand ? null : brand].filter(Boolean).join(' ');
}

export function productSeoTitle(product: CatalogProduct) {
  return `${productDisplayName(product)} en ${business.city} | Audi Disc`;
}

export function productDescription(product: CatalogProduct) {
  const parts = [
    product.nombre,
    product.marca ? `marca ${product.marca}` : null,
    product.categoria ? `categoría ${product.categoria}` : null,
  ].filter(Boolean);
  return `${parts.join(', ')} disponible para consulta local en Audi Disc ${business.city}, ${business.region}. Pregunta por WhatsApp por disponibilidad, garantía y entrega inmediata.`;
}
