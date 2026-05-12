import type { CatalogProduct } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { absoluteUrl, business, siteUrl } from '../config/business';
import { imageForProduct, productDescription, productPath, productSeoTitle } from '../utils/catalog';

export function localBusinessJsonLd() {
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

export function productJsonLd(product: CatalogProduct) {
  const url = absoluteUrl(productPath(product));
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: productSeoTitle(product).replace(` - Stock en ${business.city}, Bolivia`, ''),
    image: [absoluteUrl(imageForProduct(product))],
    description: productDescription(product),
    brand: product.marca
      ? {
          '@type': 'Brand',
          name: product.marca,
        }
      : undefined,
    category: product.categoria ?? 'Electronica',
    url,
    offers: {
      '@type': 'Offer',
      url,
      priceCurrency: 'BOB',
      price: (product.precioVentaCentavos / 100).toFixed(2),
      availability: 'https://schema.org/InStock',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'ElectronicsStore',
        name: business.name,
        telephone: business.phone,
        address: {
          '@type': 'PostalAddress',
          addressLocality: business.city,
          addressRegion: business.region,
          addressCountry: business.country,
        },
      },
    },
    additionalProperty: [
      {
        '@type': 'PropertyValue',
        name: 'Consulta local',
        value: `Disponible para consulta en Audi Disc ${business.city}`,
      },
      {
        '@type': 'PropertyValue',
        name: 'Precio local',
        value: formatBsFromCentavos(product.precioVentaCentavos),
      },
    ],
  };
}
