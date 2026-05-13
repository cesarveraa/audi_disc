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

const faqEntries = [
  {
    question: 'Tienen garantia?',
    answer:
      'Si. Los productos originales vendidos por Audi Disc cuentan con respaldo local y atencion directa en Sucre.',
  },
  {
    question: 'Hacen entregas a domicilio en Sucre?',
    answer:
      'Si. Puedes consultar por WhatsApp la zona de entrega, horarios disponibles y coordinacion para recibir tu producto.',
  },
  {
    question: 'Que marcas manejan?',
    answer:
      'Trabajamos con marcas como JBL, Sony, Ewtto, Casio y otras lineas de audio, electronica y accesorios.',
  },
];

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

  const items = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= 200) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${apiBaseUrl}/public/products?page=${page}&limit=50`, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      const pageItems = Array.isArray(payload) ? payload : Array.isArray(payload.items) ? payload.items : [];
      items.push(...pageItems);
      hasMore = Array.isArray(payload) ? false : Boolean(payload.has_more);
      page += 1;
    } catch (error) {
      console.warn(`[AudiDisc Catalog SEO] No se pudo obtener productos publicos: ${error.message}`);
      return items;
    } finally {
      clearTimeout(timeout);
    }
  }

  return items;
}

async function writePublicSeoAssets(items) {
  await mkdir(publicDir, { recursive: true });
  const routes = Array.from(new Set(['/', '/productos', ...items.map(product => productPath(product))]));
  const now = new Date().toISOString();
  const sitemap = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...routes.map(route => [
      '  <url>',
      `    <loc>${escapeXml(absoluteUrl(route))}</loc>`,
      `    <lastmod>${now}</lastmod>`,
      '    <changefreq>daily</changefreq>',
      route === '/'
        ? '    <priority>1.0</priority>'
        : route === '/productos'
          ? '    <priority>0.9</priority>'
          : '    <priority>0.8</priority>',
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
      title: 'Audi Disc Sucre | Sonido original con garantia real',
      description:
        'Audi Disc Sucre ofrece audio, electronica y accesorios originales con garantia local en Chuquisaca y consulta directa por WhatsApp.',
      image: absoluteUrl('/audidisc.jpg'),
      canonical: absoluteUrl('/'),
      type: 'website',
      jsonLd: [localBusinessJsonLd(), faqJsonLd()],
    }),
    'utf8',
  );

  await writeCatalogHtml(indexHtml);
  if (!items.length) {
    return;
  }

  await Promise.all(items.map(product => writeSingleProductHtml(indexHtml, product)));
}

async function writeCatalogHtml(indexHtml) {
  const catalogDir = path.resolve(distDir, 'productos');
  const html = injectSeoHead(indexHtml, {
    title: 'Catalogo tecnico en Sucre | Audi Disc',
    description:
      'Busca productos de audio, electronica y accesorios originales en Audi Disc Sucre con filtros por marca y categoria.',
    image: absoluteUrl('/audidisc.jpg'),
    canonical: absoluteUrl('/productos'),
    type: 'website',
    jsonLd: localBusinessJsonLd(),
  });
  await mkdir(catalogDir, { recursive: true });
  await writeFile(path.resolve(catalogDir, 'index.html'), html, 'utf8');
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
    `<title data-rh="true">${escapeHtml(seo.title)}</title>`,
    `<meta data-rh="true" name="description" content="${escapeHtml(seo.description)}">`,
    `<link data-rh="true" rel="canonical" href="${escapeHtml(seo.canonical)}">`,
    `<meta data-rh="true" property="og:title" content="${escapeHtml(seo.title)}">`,
    `<meta data-rh="true" property="og:description" content="${escapeHtml(seo.description)}">`,
    `<meta data-rh="true" property="og:type" content="${seo.type}">`,
    `<meta data-rh="true" property="og:url" content="${escapeHtml(seo.canonical)}">`,
    `<meta data-rh="true" property="og:image" content="${escapeHtml(seo.image)}">`,
    '<meta data-rh="true" property="og:image:width" content="1200">',
    '<meta data-rh="true" property="og:image:height" content="630">',
    '<meta data-rh="true" property="og:locale" content="es_BO">',
    '<meta data-rh="true" property="og:site_name" content="Audi Disc Sucre">',
    '<meta data-rh="true" name="twitter:card" content="summary_large_image">',
    `<meta data-rh="true" name="twitter:title" content="${escapeHtml(seo.title)}">`,
    `<meta data-rh="true" name="twitter:description" content="${escapeHtml(seo.description)}">`,
    `<meta data-rh="true" name="twitter:image" content="${escapeHtml(seo.image)}">`,
    ...asJsonLdArray(seo.jsonLd).map(item => `<script data-rh="true" type="application/ld+json">${JSON.stringify(item)}</script>`),
  ].join('\n    ');
  return clean.replace(/<head>/i, () => `<head>\n    ${head}`);
}

function asJsonLdArray(jsonLd) {
  return Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];
}

function productPath(product) {
  return `/productos/${createCatalogProductSlug(product, business.city)}`;
}

function productDisplayName(product) {
  const name = String(product.nombre || '').trim();
  const brand = product.marca ? String(product.marca).trim() : '';
  return brand && !slugify(name).includes(slugify(brand)) ? `${name} ${brand}` : name;
}

function productSeoTitle(product) {
  return `${productDisplayName(product)} en ${business.city} | Audi Disc`;
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
    name: productDisplayName(product),
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
    '@type': ['LocalBusiness', 'ElectronicsStore'],
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

function faqJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqEntries.map(entry => ({
      '@type': 'Question',
      name: entry.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: entry.answer,
      },
    })),
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
