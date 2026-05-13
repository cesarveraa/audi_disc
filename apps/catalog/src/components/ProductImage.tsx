import type { CatalogProduct } from '@audidisc/shared';

import { imageForProduct } from '../utils/catalog';

type Props = {
  product: CatalogProduct;
  className?: string;
  loading?: 'eager' | 'lazy';
  sizes?: string;
};

export function ProductImage({
  product,
  className = '',
  loading = 'lazy',
  sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw',
}: Props) {
  const image = imageForProduct(product);

  return (
    <picture className="block h-full w-full">
      <source srcSet={image} type="image/webp" sizes={sizes} />
      <img
        src={image}
        alt={`${product.nombre} ${product.marca ?? ''} en Audi Disc Sucre`}
        className={`block ${className}`}
        loading={loading}
        decoding="async"
      />
    </picture>
  );
}
