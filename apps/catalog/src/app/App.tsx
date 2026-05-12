import { MouseEvent, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MapPin,
  MessageCircle,
  Search,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';
import type { CatalogProduct } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { fetchCatalogProducts } from '../api/catalogClient';
import { business } from '../config/business';
import { SEOHandler } from '../seo/SEOHandler';
import { localBusinessJsonLd, productJsonLd } from '../seo/structuredData';
import {
  heroImage,
  imageForProduct,
  normalize,
  productDescription,
  productPath,
  productSeoTitle,
  productSlug,
} from '../utils/catalog';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';

function whatsappHref(product?: CatalogProduct) {
  const phone = business.phone.replace(/\D/g, '');
  const message = product
    ? `Hola Audi Disc Sucre, vi el ${product.nombre} en su catalogo web y quisiera consultar disponibilidad, garantia y entrega.`
    : 'Hola Audi Disc Sucre, vi su catalogo web y quisiera consultar disponibilidad de productos.';
  const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
  return `${base}?text=${encodeURIComponent(message)}`;
}

function FloatingWhatsAppButton({ product }: { product?: CatalogProduct }) {
  return (
    <a
      href={whatsappHref(product)}
      target="_blank"
      rel="noreferrer"
      aria-label={product ? `Consultar ${product.nombre} por WhatsApp` : 'Consultar por WhatsApp'}
      className="fixed bottom-5 right-5 z-40 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#25D366] px-5 text-sm font-semibold text-catalog-ink shadow-panel transition hover:bg-[#1ebe5d] focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2 sm:bottom-7 sm:right-7"
    >
      <MessageCircle className="h-5 w-5" />
      <span className="hidden sm:inline">Consultar</span>
    </a>
  );
}

function ProductImage({
  product,
  className,
  loading = 'lazy',
}: {
  product: CatalogProduct;
  className: string;
  loading?: 'eager' | 'lazy';
}) {
  const image = imageForProduct(product);
  return (
    <picture>
      <source srcSet={image} type="image/webp" />
      <img
        src={image}
        alt={`${product.nombre} ${product.marca ?? ''} disponible en Audi Disc Sucre`}
        className={className}
        loading={loading}
      />
    </picture>
  );
}

function ProductCard({
  product,
  onNavigate,
}: {
  product: CatalogProduct;
  onNavigate: (path: string) => void;
}) {
  const path = productPath(product);

  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }
    event.preventDefault();
    onNavigate(path);
  }

  return (
    <article className="group overflow-hidden rounded-lg border border-catalog-line bg-white shadow-soft transition duration-300 hover:-translate-y-1 hover:shadow-panel">
      <a href={path} onClick={handleClick} className="block" aria-label={`Ver ${product.nombre}`}>
        <div className="relative aspect-[4/3] overflow-hidden bg-catalog-coal">
          <ProductImage
            product={product}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-catalog-ink/68 to-transparent" />
          <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-catalog-ink shadow-soft">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
            Disponible
          </span>
        </div>

        <div className="p-4">
          <div className="mb-4 min-h-[72px]">
            <p className="text-sm font-semibold text-audi-red">
              {[product.marca, product.categoria].filter(Boolean).join(' / ') || 'Audi Disc'}
            </p>
            <h2 className="mt-1 line-clamp-2 text-lg font-semibold leading-snug text-catalog-ink">
              {product.nombre}
            </h2>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-catalog-line pt-4">
            <strong className="text-lg font-semibold text-catalog-ink">
              {formatBsFromCentavos(product.precioVentaCentavos)}
            </strong>
            <span className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-catalog-ink px-3 text-sm font-semibold text-white transition group-hover:bg-audi-red">
              Ver producto
              <ArrowRight className="h-4 w-4" />
            </span>
          </div>
        </div>
      </a>
    </article>
  );
}

function CatalogHome({
  products,
  loadState,
  errorMessage,
  onNavigate,
}: {
  products: CatalogProduct[];
  loadState: LoadState;
  errorMessage: string | null;
  onNavigate: (path: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('Todas');

  const brands = useMemo(() => {
    const values = products
      .map(product => product.marca)
      .filter((value): value is string => Boolean(value?.trim()));
    return ['Todas', ...Array.from(new Set(values)).sort((left, right) => left.localeCompare(right, 'es'))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = normalize(query);
    const normalizedBrand = normalize(brand);

    return products.filter(product => {
      const matchesBrand = brand === 'Todas' || normalize(product.marca) === normalizedBrand;
      const matchesQuery =
        !normalizedQuery ||
        [product.nombre, product.marca, product.categoria].some(value =>
          normalize(value).includes(normalizedQuery),
        );
      return matchesBrand && matchesQuery;
    });
  }, [brand, products, query]);

  return (
    <div className="min-h-screen bg-catalog-paper text-catalog-ink">
      <SEOHandler
        title="Audi Disc Sucre - Catalogo de electronica, audio y accesorios"
        description="Catalogo publico de Audi Disc Sucre con parlantes, audifonos, accesorios y consumibles disponibles para consulta local por WhatsApp."
        image={heroImage}
        canonical="/"
        jsonLd={localBusinessJsonLd()}
      />

      <header className="relative isolate overflow-hidden bg-catalog-ink text-white">
        <img
          src={heroImage}
          alt="Equipos de audio en tienda Audi Disc Sucre"
          className="absolute inset-0 -z-20 h-full w-full object-cover"
          loading="eager"
          fetchPriority="high"
        />
        <div className="absolute inset-0 -z-10 bg-catalog-ink/72" />
        <div className="absolute inset-x-0 bottom-0 -z-10 h-40 bg-gradient-to-t from-catalog-ink to-transparent" />

        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" className="flex items-center gap-3 font-semibold">
            <img src="/audidisc.jpg" alt="Audi Disc Sucre" className="h-10 w-10 rounded-lg object-cover" loading="eager" />
            <span>Audi Disc</span>
          </a>
          <a
            href="#catalogo"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-white/28 px-3 text-sm font-semibold text-white transition hover:border-white hover:bg-white/10"
          >
            Ver catalogo
            <ArrowRight className="h-4 w-4" />
          </a>
        </nav>

        <section id="inicio" className="mx-auto flex min-h-[66vh] max-w-7xl items-end px-5 pb-12 pt-20 sm:px-8 lg:pb-16">
          <div className="max-w-3xl">
            <p className="mb-4 inline-flex rounded-lg bg-audi-red px-3 py-1 text-sm font-semibold text-white">
              Audi Red Edition
            </p>
            <h1 className="text-4xl font-semibold leading-tight sm:text-6xl">
              Audi Disc
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-white/80">
              Catalogo publico de equipos, accesorios y consumibles listos para consulta directa en Sucre.
            </p>
            <p className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white/78">
              <MapPin className="h-4 w-4 text-audi-red" />
              {business.streetAddress}, {business.city}, {business.region}
            </p>
          </div>
        </section>
      </header>

      <main id="catalogo" className="relative -mt-6 bg-catalog-paper px-5 pb-24 pt-10 sm:px-8">
        <section className="mx-auto max-w-7xl">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-audi-red">Catalogo</p>
              <h2 className="mt-2 text-3xl font-semibold text-catalog-ink sm:text-4xl">
                Productos disponibles
              </h2>
            </div>

            <div className="flex w-full flex-col gap-3 lg:max-w-2xl">
              <label className="flex h-12 items-center gap-3 rounded-lg border border-catalog-line bg-white px-4 shadow-soft focus-within:border-audi-red">
                <Search className="h-5 w-5 text-catalog-olive" />
                <input
                  value={query}
                  onChange={event => setQuery(event.target.value)}
                  placeholder="Buscar por nombre, marca o categoria"
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-catalog-ink outline-none placeholder:text-catalog-olive"
                />
              </label>
            </div>
          </div>

          <div className="mb-8 flex items-center gap-3 overflow-x-auto pb-2">
            <span className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border border-catalog-line bg-white px-3 text-sm font-semibold text-catalog-coal">
              <SlidersHorizontal className="h-4 w-4 text-audi-red" />
              Marca
            </span>
            {brands.map(item => (
              <button
                key={item}
                type="button"
                onClick={() => setBrand(item)}
                className={[
                  'h-10 shrink-0 rounded-lg border px-4 text-sm font-semibold transition',
                  brand === item
                    ? 'border-audi-red bg-audi-red text-white shadow-soft'
                    : 'border-catalog-line bg-white text-catalog-coal hover:border-audi-red',
                ].join(' ')}
              >
                {item}
              </button>
            ))}
          </div>

          {loadState === 'loading' && (
            <div className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-catalog-line bg-white text-catalog-coal">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-audi-red" />
              Cargando catalogo
            </div>
          )}

          {loadState === 'error' && (
            <div className="rounded-lg border border-audi-red/30 bg-white p-5 text-sm font-medium text-catalog-coal shadow-soft">
              {errorMessage}
            </div>
          )}

          {loadState === 'ready' && (
            <>
              <div className="mb-5 flex items-center justify-between text-sm font-semibold text-catalog-olive">
                <span>{filteredProducts.length} productos</span>
                <span>Consulta directa</span>
              </div>

              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProducts.map(product => (
                  <ProductCard key={product.id} product={product} onNavigate={onNavigate} />
                ))}
              </div>

              {!filteredProducts.length && (
                <div className="rounded-lg border border-dashed border-catalog-line bg-white p-8 text-center text-catalog-coal">
                  No hay productos disponibles para esa busqueda.
                </div>
              )}
            </>
          )}
        </section>
      </main>
      <FloatingWhatsAppButton />
    </div>
  );
}

function ProductDetail({
  product,
  onNavigate,
}: {
  product: CatalogProduct;
  onNavigate: (path: string) => void;
}) {
  const image = imageForProduct(product);
  const title = productSeoTitle(product);
  const description = productDescription(product);

  function goHome(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    onNavigate('/');
  }

  return (
    <div className="min-h-screen bg-catalog-paper pb-24 text-catalog-ink">
      <SEOHandler
        title={title}
        description={description}
        image={image}
        canonical={productPath(product)}
        type="product"
        jsonLd={productJsonLd(product)}
      />

      <header className="border-b border-catalog-line bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
          <a href="/" onClick={goHome} className="flex items-center gap-3 font-semibold">
            <img src="/audidisc.jpg" alt="Audi Disc Sucre" className="h-10 w-10 rounded-lg object-cover" loading="eager" />
            <span>Audi Disc</span>
          </a>
          <a
            href={whatsappHref(product)}
            target="_blank"
            rel="noreferrer"
            className="hidden h-10 items-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-catalog-ink transition hover:bg-[#1ebe5d] sm:inline-flex"
          >
            <MessageCircle className="h-4 w-4" />
            WhatsApp
          </a>
        </nav>
      </header>

      <main className="mx-auto grid max-w-7xl gap-8 px-5 py-8 sm:px-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(340px,0.92fr)] lg:py-12">
        <section className="overflow-hidden rounded-lg border border-catalog-line bg-white shadow-soft">
          <div className="aspect-[4/3] bg-catalog-coal">
            <ProductImage product={product} className="h-full w-full object-cover" loading="eager" />
          </div>
        </section>

        <section className="self-start">
          <a href="/" onClick={goHome} className="mb-6 inline-flex items-center gap-2 text-sm font-semibold text-catalog-olive hover:text-audi-red">
            <ArrowLeft className="h-4 w-4" />
            Volver al catalogo
          </a>

          <p className="text-sm font-semibold text-audi-red">
            {[product.marca, product.categoria].filter(Boolean).join(' / ') || 'Audi Disc Sucre'}
          </p>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-catalog-ink sm:text-5xl">
            {title.replace(` - Stock en ${business.city}, Bolivia`, '')}
          </h1>
          <p className="mt-5 text-base leading-7 text-catalog-olive">
            {description}
          </p>

          <div className="mt-7 rounded-lg border border-catalog-line bg-white p-5 shadow-soft">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span className="block text-sm font-semibold text-catalog-olive">Precio de venta</span>
                <strong className="mt-1 block text-3xl font-semibold text-catalog-ink">
                  {formatBsFromCentavos(product.precioVentaCentavos)}
                </strong>
              </div>
              <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Disponible
              </span>
            </div>

            <a
              href={whatsappHref(product)}
              target="_blank"
              rel="noreferrer"
              className="mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#25D366] px-4 text-sm font-semibold text-catalog-ink transition hover:bg-[#1ebe5d] focus:outline-none focus:ring-2 focus:ring-[#25D366] focus:ring-offset-2"
            >
              <MessageCircle className="h-5 w-5" />
              Consultar disponibilidad por WhatsApp
            </a>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-catalog-line bg-white p-4">
              <ShieldCheck className="h-5 w-5 text-audi-red" />
              <strong className="mt-2 block text-sm text-catalog-ink">Compra local</strong>
              <span className="mt-1 block text-sm text-catalog-olive">Atencion directa en {business.city}, {business.region}.</span>
            </div>
            <div className="rounded-lg border border-catalog-line bg-white p-4">
              <MapPin className="h-5 w-5 text-audi-red" />
              <strong className="mt-2 block text-sm text-catalog-ink">Audi Disc Sucre</strong>
              <span className="mt-1 block text-sm text-catalog-olive">{business.streetAddress}</span>
            </div>
          </div>
        </section>
      </main>
      <FloatingWhatsAppButton product={product} />
    </div>
  );
}

function NotFound({ onNavigate }: { onNavigate: (path: string) => void }) {
  function goHome(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    onNavigate('/');
  }

  return (
    <div className="min-h-screen bg-catalog-paper px-5 py-12 text-catalog-ink sm:px-8">
      <SEOHandler
        title="Producto no encontrado - Audi Disc Sucre"
        description="El producto solicitado no esta disponible en el catalogo publico de Audi Disc Sucre."
        image="/audidisc.jpg"
        canonical="/"
      />
      <div className="mx-auto max-w-xl rounded-lg border border-catalog-line bg-white p-8 shadow-soft">
        <h1 className="text-3xl font-semibold">Producto no encontrado</h1>
        <p className="mt-3 text-catalog-olive">Puede que el producto ya no este disponible en el catalogo publico.</p>
        <a href="/" onClick={goHome} className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-audi-red px-4 text-sm font-semibold text-white">
          <ArrowLeft className="h-4 w-4" />
          Volver al catalogo
        </a>
      </div>
    </div>
  );
}

function currentPathname() {
  if (typeof window === 'undefined') {
    return '/';
  }
  return `${window.location.pathname}${window.location.hash}`;
}

export function App() {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [path, setPath] = useState(currentPathname);

  useEffect(() => {
    const handlePopState = () => setPath(currentPathname());
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    fetchCatalogProducts()
      .then(items => {
        if (!active) {
          return;
        }
        setProducts(items);
        setLoadState('ready');
      })
      .catch(error => {
        if (!active) {
          return;
        }
        setErrorMessage(error instanceof Error ? error.message : 'No se pudo cargar el catalogo.');
        setLoadState('error');
      });

    return () => {
      active = false;
    };
  }, []);

  function navigate(pathname: string) {
    window.history.pushState({}, '', pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setPath(currentPathname());
  }

  const pathname = path.split('#')[0] || '/';
  const productSlugFromPath = pathname.startsWith('/producto/')
    ? decodeURIComponent(pathname.replace('/producto/', '').replace(/\/+$/, ''))
    : null;
  const selectedProduct = productSlugFromPath
    ? products.find(product => productSlug(product) === productSlugFromPath)
    : null;

  if (productSlugFromPath && loadState === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-catalog-paper text-catalog-coal">
        <Loader2 className="mr-2 h-5 w-5 animate-spin text-audi-red" />
        Cargando producto
      </div>
    );
  }

  if (productSlugFromPath && selectedProduct) {
    return <ProductDetail product={selectedProduct} onNavigate={navigate} />;
  }

  if (productSlugFromPath && loadState === 'ready') {
    return <NotFound onNavigate={navigate} />;
  }

  return (
    <CatalogHome
      products={products}
      loadState={loadState}
      errorMessage={errorMessage}
      onNavigate={navigate}
    />
  );
}
