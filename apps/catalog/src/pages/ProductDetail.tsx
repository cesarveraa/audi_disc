import type { CatalogProduct } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';
import { motion } from 'framer-motion';
import { ArrowLeft, BadgeCheck, CheckCircle2, Loader2, MapPin, ShieldCheck } from 'lucide-react';
import { Link, useLocation, useParams } from 'react-router-dom';

import type { CatalogPageProps } from '../app/App';
import { ProductImage } from '../components/ProductImage';
import { SiteNav } from '../components/SiteNav';
import { ProductWhatsAppButton } from '../components/WhatsAppButton';
import { business } from '../config/business';
import { SEOHandler } from '../seo/SEOHandler';
import { productJsonLd } from '../seo/structuredData';
import { imageForProduct, productDescription, productDisplayName, productPath, productSeoTitle, productSlug } from '../utils/catalog';

const reveal = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

function LoadingProduct() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center bg-catalog-bg text-catalog-muted">
      <Loader2 className="mr-2 h-5 w-5 animate-spin text-audi-red" />
      Cargando producto
    </div>
  );
}

function ProductNotFound() {
  return (
    <div className="min-h-screen bg-catalog-bg text-catalog-text">
      <SEOHandler
        title="Producto no encontrado | Audi Disc Sucre"
        description="El producto solicitado no está disponible en el catálogo público de Audi Disc Sucre."
        image="/audidisc.jpg"
        canonical="/productos"
      />
      <SiteNav />
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <div className="rounded-lg border border-white/10 bg-catalog-card p-8 shadow-card">
          <h1 className="text-3xl font-semibold text-white">Producto no encontrado</h1>
          <p className="mt-3 text-catalog-muted">Puede que el producto ya no esté disponible en el catálogo.</p>
          <Link
            to="/productos"
            className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-audi-red px-4 text-sm font-semibold text-white transition hover:bg-audi-redDark"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al catálogo
          </Link>
        </div>
      </main>
    </div>
  );
}

export default function ProductDetail({ products, loadState, errorMessage }: CatalogPageProps) {
  const { slug } = useParams();
  const location = useLocation();
  const routeState = location.state as { product?: CatalogProduct } | null;
  const product = routeState?.product ?? products.find(item => productSlug(item) === slug);

  if (loadState === 'loading' && !product) {
    return (
      <div className="min-h-screen bg-catalog-bg">
        <SiteNav />
        <LoadingProduct />
      </div>
    );
  }

  if (!product) {
    return <ProductNotFound />;
  }

  const image = imageForProduct(product);
  const title = productSeoTitle(product);
  const description = productDescription(product);

  return (
    <div className="min-h-screen bg-catalog-bg pb-24 text-catalog-text">
      <SEOHandler
        title={title}
        description={description}
        image={image}
        canonical={productPath(product)}
        type="product"
        jsonLd={productJsonLd(product)}
      />

      <SiteNav />

      <main className="mx-auto grid max-w-7xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,1.04fr)_minmax(340px,0.96fr)] lg:px-8 lg:py-14">
        <motion.section
          className="overflow-hidden rounded-lg border border-white/10 bg-catalog-card shadow-card"
          initial="hidden"
          animate="visible"
          variants={reveal}
          transition={{ duration: 0.5 }}
        >
          <div className="aspect-[4/3] bg-black">
            <ProductImage
              product={product}
              className="h-full w-full object-cover"
              loading="eager"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </div>
        </motion.section>

        <motion.section
          className="self-start"
          initial="hidden"
          animate="visible"
          variants={reveal}
          transition={{ duration: 0.5, delay: 0.08 }}
        >
          <Link
            to="/productos"
            className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-catalog-muted transition hover:text-audi-red"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al catálogo
          </Link>

          <p className="text-sm font-semibold uppercase text-audi-red">
            {[product.marca, product.categoria].filter(Boolean).join(' / ') || 'Audi Disc Sucre'}
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-white sm:text-5xl">
            {productDisplayName(product)}
          </h1>
          <p className="mt-5 text-base leading-7 text-catalog-muted">{description}</p>

          <div className="mt-7 rounded-lg border border-white/10 bg-catalog-card p-5 shadow-card">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="block text-sm font-medium text-catalog-muted">Precio en Sucre</span>
                <strong className="mt-1 block text-3xl font-semibold text-white">
                  {formatBsFromCentavos(product.precioVentaCentavos)}
                </strong>
              </div>
              <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/20 px-3 py-2 text-sm font-semibold text-emerald-200 ring-1 ring-emerald-400/25">
                <CheckCircle2 className="h-4 w-4" />
                Disponible
              </span>
            </div>

            <ProductWhatsAppButton product={product} className="mt-5 w-full" />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-white/10 bg-catalog-card p-4">
              <BadgeCheck className="h-5 w-5 text-audi-red" />
              <strong className="mt-3 block text-sm text-white">Garantía Audi Disc</strong>
            </div>
            <div className="rounded-lg border border-white/10 bg-catalog-card p-4">
              <ShieldCheck className="h-5 w-5 text-audi-red" />
              <strong className="mt-3 block text-sm text-white">Originalidad 100%</strong>
            </div>
            <div className="rounded-lg border border-white/10 bg-catalog-card p-4">
              <MapPin className="h-5 w-5 text-audi-red" />
              <strong className="mt-3 block text-sm text-white">{business.city}</strong>
            </div>
          </div>

          {loadState === 'error' && (
            <p className="mt-5 rounded-lg border border-audi-red/40 bg-audi-red/10 p-4 text-sm font-semibold text-white">
              {errorMessage}
            </p>
          )}
        </motion.section>
      </main>
    </div>
  );
}
