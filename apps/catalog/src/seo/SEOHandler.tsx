import { useEffect } from 'react';
import { Helmet } from 'react-helmet-async';

import { absoluteUrl } from '../config/business';

type Props = {
  title: string;
  description: string;
  image: string;
  canonical: string;
  type?: 'website' | 'product';
  jsonLd?: object | object[];
};

export function SEOHandler({
  title,
  description,
  image,
  canonical,
  type = 'website',
  jsonLd,
}: Props) {
  const canonicalUrl = absoluteUrl(canonical);
  const imageUrl = absoluteUrl(image);
  const structuredData = Array.isArray(jsonLd) ? jsonLd : jsonLd ? [jsonLd] : [];

  useEffect(() => {
    const links = Array.from(document.head.querySelectorAll<HTMLLinkElement>('link[rel="canonical"]'));
    const canonicalLink = links[0] ?? document.createElement('link');
    canonicalLink.setAttribute('rel', 'canonical');
    canonicalLink.setAttribute('href', canonicalUrl);
    if (!canonicalLink.parentElement) {
      document.head.appendChild(canonicalLink);
    }
    links.slice(1).forEach(link => link.remove());
  }, [canonicalUrl]);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonicalUrl} />

      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonicalUrl} />
      <meta property="og:image" content={imageUrl} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:locale" content="es_BO" />
      <meta property="og:site_name" content="Audi Disc Sucre" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={imageUrl} />

      {structuredData.map((item, index) => (
        <script key={index} type="application/ld+json">
          {JSON.stringify(item)}
        </script>
      ))}
    </Helmet>
  );
}
