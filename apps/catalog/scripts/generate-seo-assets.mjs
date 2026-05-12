import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const catalogRoot = path.resolve(scriptRoot, '..');
const publicDir = path.resolve(catalogRoot, 'public');
const distDir = path.resolve(catalogRoot, 'dist');

loadDotEnv(path.resolve(catalogRoot, '.env'));
loadDotEnv(path.resolve(catalogRoot, '.env.local'));

const args = new Set(process.argv.slice(2));
const siteUrl = normalizeUrl(process.env.VITE_SITE_URL || 'https://audidisc.com');
const apiBaseUrl = process.env.VITE_API_BASE_URL ? normalizeUrl(process.env.VITE_API_BASE_URL) : '';
const business = {
  name: 'Audi Disc',
  city: 'Sucre',
  region: process.env.VITE_BUSINESS_REGION || 'Chuquisaca',
  country: process.env.VITE_BUSINESS_COUNTRY || 'BO',
  streetAddress: process.env.VITE_BUSINESS_STREET_ADDRESS || 'Calle Junin, Zona Central',
  postalCode: process.env.VITE_BUSINESS_POSTAL_CODE || '0000',
  phone: normalizePhone(process.env.VITE_WHATSAPP_PHONE || '+59170000000'),
  latitude: Number(process.env.VITE_BUSINESS_LATITUDE || '-19.043'),
  longitude: Number(process.env.VITE_BUSINESS_LONGITUDE || '-65.259'),
  openingHours: process.env.VITE_BUSINESS_OPENING_HOURS || 'Mo-Sa 09:00-19:00',
  facebookUrl: process.env.VITE_BUSINESS_FACEBOOK_URL || 'https://facebook.com/audidisc',
  instagramUrl: process.env.VITE_BUSINESS_INSTAGRAM_URL || 'https://instagram.com/audidisc',
};

const products = await fetchProducts();

if (args.has('--public')) {
  await writePublicSeoAssets(products);
}

if (args.has('--dist')) {
  await writeDistHtml(products);
}

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) {
    return;
  }
  const content = requireText(filePath);
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }
    const index = trimmed.indexOf('=');
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function requireText(filePath) {
  return readFileSync(filePath, 'utf8');
}

function slugify(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function createCatalogProductSlug(product, city = 'Sucre') {
  const name = slugify(product.nombre);
  const brand = product.marca ? slugify(product.marca) : '';
  const citySlug = slugify(city);
  const nameHasBrand = Boolean(brand && name.includes(brand));
  return [name, nameHasBrand ? '' : brand, citySlug].filter(Boolean).join('-');
}

function normalizeUrl(value) {
  return value.trim().replace(/\/+$/, '');
}

function normalizePhone(value) {
  return value.replace(/[^\d+]/g, '');
}

function absoluteUrl(value) {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }
  return `${siteUrl}${value.startsWith('/') ? value : `/${value}`}`;
}

async function fetchProducts() {
  if (!apiBaseUrl) {
    console.warn('[AudiDisc Catalog SEO] VITE_API_BASE_URL no configurado; sitemap solo incluira home.');
    return [];
  }

  try {
    const response = await fetch(`${apiBaseUrl}/public/products`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    return Array.isArray(payload) ? payload : [];
  } catch (error) {
    console.warn(`[AudiDisc Catalog SEO] No se pudo obtener productos publicos: ${error.message}`);
    return [];
  }
}

async function writePublicSeoAssets(items) {
  await mkdir(publicDir, { recursive: true });
  const routes = Array.from(new Set(['/', ...items.map(product => productPath(product))]));
  const now = new Date().toISOString();
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...routes.map(route => [
      '  <url>',
      `    <loc>${escapeXml(absoluteUrl(route))}</loc>`,
      `    <lastmod>${now}</lastmod>`,
      '    <changefreq>daily</changefreq>',
      route === '/' ? '    <priority>1.0</priority>' : '    <priority>0.8</priority>',
      '  </url>',
    ].join('\n')),
    '</urlset>',
    '',
  ].join('\n');

  const robots = [
    'User-agent: *',
    'Allow: /',
    '',
    `Sitemap: ${absoluteUrl('/sitemap.xml')}`,
    '',
  ].join('\n');

  await writeFile(path.resolve(publicDir, 'sitemap.xml'), sitemap, 'utf8');
  await writeFile(path.resolve(publicDir, 'robots.txt'), robots, 'utf8');
}

async function writeDistHtml(items) {
  const indexPath = path.resolve(distDir, 'index.html');
  if (!existsSync(indexPath)) {
    console.warn('[AudiDisc Catalog SEO] dist/index.html no existe; se omite HTML SEO estatico.');
    return;
  }

  const indexHtml = await readFile(indexPath, 'utf8');
  await writeFile(
    indexPath,
    injectSeoHead(indexHtml, {
      title: 'Audi Disc Sucre - Catalogo de electronica, audio y accesorios',
      description:
        'Catalogo publico de Audi Disc Sucre con parlantes, audifonos, accesorios y consumibles disponibles para consulta local por WhatsApp.',
      image: absoluteUrl('/audidisc.jpg'),
      canonical: absoluteUrl('/'),
      type: 'website',
      jsonLd: localBusinessJsonLd(),
    }),
    'utf8',
  );

  if (!items.length) {
    return;
  }

  await Promise.all(items.map(product => writeSingleProductHtml(indexHtml, product)));
}

async function writeSingleProductHtml(indexHtml, product) {
  const route = productPath(product);
  const productDir = path.resolve(distDir, route.replace(/^\//, ''));
  const title = productSeoTitle(product);
  const description = productDescription(product);
  const image = absoluteUrl(imageForProduct(product));
  const canonical = absoluteUrl(route);
  const html = injectSeoHead(indexHtml, {
    title,
    description,
    image,
    canonical,
    type: 'product',
    jsonLd: productJsonLd(product),
  });
  await mkdir(productDir, { recursive: true });
  await writeFile(path.resolve(productDir, 'index.html'), html, 'utf8');
}

function injectSeoHead(html, seo) {
  const clean = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+name=["']description["'][^>]*>/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>/gi, '')
    .replace(/<script\s+type=["']application\/ld\+json["'][\s\S]*?<\/script>/gi, '');
  const head = [
    `<title>${escapeHtml(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}">`,
    `<link rel="canonical" href="${escapeHtml(seo.canonical)}">`,
    `<meta property="og:title" content="${escapeHtml(seo.title)}">`,
    `<meta property="og:description" content="${escapeHtml(seo.description)}">`,
    `<meta property="og:type" content="${seo.type}">`,
    `<meta property="og:url" content="${escapeHtml(seo.canonical)}">`,
    `<meta property="og:image" content="${escapeHtml(seo.image)}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta property="og:locale" content="es_BO">',
    '<meta property="og:site_name" content="Audi Disc Sucre">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(seo.description)}">`,
    `<meta name="twitter:image" content="${escapeHtml(seo.image)}">`,
    `<script type="application/ld+json">${JSON.stringify(seo.jsonLd)}</script>`,
  ].join('\n    ');
  return clean.replace(/<head>/i, `<head>\n    ${head}`);
}

function productPath(product) {
  return `/producto/${createCatalogProductSlug(product, business.city)}`;
}

function productSeoTitle(product) {
  const name = String(product.nombre || '').trim();
  const brand = product.marca ? String(product.marca).trim() : '';
  const productName = brand && !slugify(name).includes(slugify(brand)) ? `${name} ${brand}` : name;
  return `${productName} - Stock en ${business.city}, Bolivia`;
}

function productDescription(product) {
  const parts = [
    product.nombre,
    product.marca ? `marca ${product.marca}` : null,
    product.categoria ? `categoria ${product.categoria}` : null,
  ].filter(Boolean);
  return `${parts.join(', ')} disponible para consulta local en Audi Disc ${business.city}, ${business.region}. Pregunta por WhatsApp por disponibilidad, garantia y entrega inmediata.`;
}

function imageForProduct(product) {
  if (product.imagenUrl) {
    return ensureWebpUrl(product.imagenUrl);
  }
  const key = slugify(`${product.nombre || ''} ${product.categoria || ''}`);
  if (key.includes('cable') || key.includes('usb') || key.includes('adaptador')) {
    return 'https://images.unsplash.com/photo-1618384887929-16ec33fab9ef?auto=format&fit=crop&w=1200&q=86&fm=webp';
  }
  if (key.includes('memoria') || key.includes('flash') || key.includes('sd')) {
    return 'https://images.unsplash.com/photo-1601737487795-dab272f52420?auto=format&fit=crop&w=1200&q=86&fm=webp';
  }
  if (key.includes('camara') || key.includes('papel') || key.includes('foto')) {
    return 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=86&fm=webp';
  }
  if (key.includes('audio') || key.includes('audifono') || key.includes('parlante')) {
    return 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=1200&q=86&fm=webp';
  }
  return 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1200&q=86&fm=webp';
}

function ensureWebpUrl(url) {
  if (url.includes('images.unsplash.com')) {
    const separator = url.includes('?') ? '&' : '?';
    return url.includes('fm=webp') ? url : `${url}${separator}fm=webp`;
  }
  return url;
}

function productJsonLd(product) {
  const route = productPath(product);
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productSeoTitle(product).replace(` - Stock en ${business.city}, Bolivia`, ''),
    image: [absoluteUrl(imageForProduct(product))],
    description: productDescription(product),
    brand: product.marca ? { '@type': 'Brand', name: product.marca } : undefined,
    category: product.categoria || 'Electronica',
    url: absoluteUrl(route),
    offers: {
      '@type': 'Offer',
      url: absoluteUrl(route),
      priceCurrency: 'BOB',
      price: (Number(product.precioVentaCentavos || 0) / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'ElectronicsStore',
        name: business.name,
        telephone: business.phone,
        address: {
          '@type': 'PostalAddress',
          streetAddress: business.streetAddress,
          addressLocality: business.city,
          addressRegion: business.region,
          postalCode: business.postalCode,
          addressCountry: business.country,
        },
      },
    },
  };
}

function localBusinessJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'ElectronicsStore',
    '@id': siteUrl,
    name: business.name,
    image: absoluteUrl('/audidisc.jpg'),
    url: siteUrl,
    telephone: business.phone,
    priceRange: '$$',
    address: {
      '@type': 'PostalAddress',
      streetAddress: business.streetAddress,
      addressLocality: business.city,
      addressRegion: business.region,
      postalCode: business.postalCode,
      addressCountry: business.country,
    },
    geo: {
      '@type': 'GeoCoordinates',
      latitude: business.latitude,
      longitude: business.longitude,
    },
    openingHours: business.openingHours,
    openingHoursSpecification: [
      {
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
        opens: '09:00',
        closes: '19:00',
      },
    ],
    sameAs: [business.facebookUrl, business.instagramUrl],
  };
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtml(value) {
  return escapeXml(value).replace(/'/g, '&#39;');
}
