import type { CatalogProductsPage } from '@audidisc/shared';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, PackageSearch, Search, SlidersHorizontal, X } from 'lucide-react';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { fetchCatalogProducts } from '../api/catalogClient';
import type { CatalogPageProps, LoadState } from '../app/App';
import { ProductCard } from '../components/ProductCard';
import { SiteFooter } from '../components/SiteFooter';
import { SiteNav } from '../components/SiteNav';
import { SEOHandler } from '../seo/SEOHandler';
import { heroImage } from '../utils/catalog';

const PAGE_LIMIT = 10;

const reveal = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

function uniqueSorted(values: Array<string | null>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value?.trim())))).sort((left, right) =>
    left.localeCompare(right, 'es'),
  );
}

function mergeOptions(current: string[], values: Array<string | null>) {
  return uniqueSorted([...current, ...values]);
}

function readPage(searchParams: URLSearchParams) {
  const rawPage = Number(searchParams.get('page') ?? '1');
  return Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
}

function SkeletonGrid() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: PAGE_LIMIT }).map((_, index) => (
        <div key={index} className="h-[430px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.045]">
          <div className="h-48 rounded-t-2xl bg-white/10" />
          <div className="space-y-4 p-5">
            <div className="h-3 w-24 rounded bg-white/10" />
            <div className="h-5 w-4/5 rounded bg-white/10" />
            <div className="h-5 w-3/5 rounded bg-white/10" />
            <div className="h-12 rounded-2xl bg-white/10" />
          </div>
        </div>
      ))}
    </div>
  );
}

function visiblePageNumbers(currentPage: number, totalPages: number) {
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1]);
  return Array.from(pages)
    .filter(page => page >= 1 && page <= totalPages)
    .sort((left, right) => left - right);
}

export default function Catalog({ products }: CatalogPageProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = readPage(searchParams);
  const [query, setQuery] = useState('');
  const [brand, setBrand] = useState('Todas');
  const [category, setCategory] = useState('Todas');
  const [pageData, setPageData] = useState<CatalogProductsPage>({
    items: products,
    total_count: products.length,
    has_more: false,
  });
  const [pageLoadState, setPageLoadState] = useState<LoadState>('idle');
  const [pageError, setPageError] = useState<string | null>(null);
  const [knownBrands, setKnownBrands] = useState<string[]>(() => uniqueSorted(products.map(product => product.marca)));
  const [knownCategories, setKnownCategories] = useState<string[]>(() =>
    uniqueSorted(products.map(product => product.categoria)),
  );

  useEffect(() => {
    if (!products.length) {
      return;
    }
    setKnownBrands(current => mergeOptions(current, products.map(product => product.marca)));
    setKnownCategories(current => mergeOptions(current, products.map(product => product.categoria)));
  }, [products]);

  useEffect(() => {
    let active = true;
    setPageLoadState('loading');
    setPageError(null);

    fetchCatalogProducts({
      page: currentPage,
      limit: PAGE_LIMIT,
      q: query,
      marca: brand === 'Todas' ? undefined : brand,
      categoria: category === 'Todas' ? undefined : category,
    })
      .then(nextPage => {
        if (!active) {
          return;
        }
        setPageData(nextPage);
        setKnownBrands(current => mergeOptions(current, nextPage.items.map(product => product.marca)));
        setKnownCategories(current => mergeOptions(current, nextPage.items.map(product => product.categoria)));
        setPageLoadState('ready');
      })
      .catch(error => {
        if (!active) {
          return;
        }
        setPageError(error instanceof Error ? error.message : 'No se pudo cargar el catalogo.');
        setPageLoadState('error');
      });

    return () => {
      active = false;
    };
  }, [brand, category, currentPage, query]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  const brands = useMemo(() => ['Todas', ...knownBrands], [knownBrands]);
  const categories = useMemo(() => ['Todas', ...knownCategories], [knownCategories]);
  const hasFilters = query || brand !== 'Todas' || category !== 'Todas';
  const canonical = currentPage > 1 ? `/productos?page=${currentPage}` : '/productos';
  const totalPages = Math.max(1, Math.ceil(pageData.total_count / PAGE_LIMIT));
  const pageNumbers = useMemo(() => visiblePageNumbers(currentPage, totalPages), [currentPage, totalPages]);
  const totalLabel = pageData.total_count === 1 ? '1 producto' : `${pageData.total_count} productos`;

  function setCatalogPage(nextPage: number, replace = false) {
    const nextParams = new URLSearchParams(searchParams);
    if (nextPage <= 1) {
      nextParams.delete('page');
    } else {
      nextParams.set('page', String(nextPage));
    }
    setSearchParams(nextParams, { replace });
  }

  function resetToFirstPage() {
    if (currentPage !== 1) {
      setCatalogPage(1, true);
    }
  }

  function clearFilters() {
    setQuery('');
    setBrand('Todas');
    setCategory('Todas');
    setCatalogPage(1, true);
  }

  return (
    <div className="min-h-screen bg-catalog-bg text-white">
      <SEOHandler
        title="Catalogo premium de tecnologia en Sucre | Audi Disc"
        description="Busca productos Sony, JBL, Ewtto y accesorios originales en Audi Disc Sucre con filtros por marca, categoria y consulta directa por WhatsApp."
        image={heroImage}
        canonical={canonical}
      />

      <SiteNav />

      <main className="mx-auto max-w-7xl px-4 pb-20 pt-8 sm:px-6 lg:px-8 lg:pb-28">
        <motion.section
          className="mb-8 rounded-3xl border border-white/10 bg-white/[0.045] p-5 shadow-card backdrop-blur-xl sm:p-7 lg:p-9"
          initial="hidden"
          animate="visible"
          variants={reveal}
          transition={{ duration: 0.45 }}
        >
          <p className="text-sm font-semibold uppercase tracking-wide text-audi-red">Catalogo de lujo</p>
          <div className="mt-3 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold leading-tight text-white sm:text-5xl">
                Tecnologia original lista para comprar en Sucre.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70 sm:text-base">
                Filtra por marca, categoria o nombre. Consulta disponibilidad por WhatsApp sin revelar stock exacto ni
                datos internos del sistema administrativo.
              </p>
            </div>
            <span className="inline-flex h-11 w-fit items-center gap-2 rounded-full border border-white/10 bg-black/30 px-4 text-sm font-semibold text-white/70">
              <PackageSearch className="h-4 w-4 text-audi-red" />
              {totalLabel}
            </span>
          </div>
        </motion.section>

        <motion.section
          className="sticky top-20 z-20 mb-8 rounded-3xl border border-white/10 bg-catalog-glass p-3 shadow-card backdrop-blur-2xl sm:p-4"
          initial="hidden"
          animate="visible"
          variants={reveal}
          transition={{ duration: 0.45, delay: 0.06 }}
          aria-label="Filtros del catalogo"
        >
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_220px_220px_auto] lg:items-center">
            <label className="flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 focus-within:border-audi-red">
              <Search className="h-5 w-5 shrink-0 text-white/50" />
              <input
                value={query}
                onChange={event => {
                  setQuery(event.target.value);
                  resetToFirstPage();
                }}
                placeholder="Buscar producto, marca o categoria"
                className="min-w-0 flex-1 border-0 bg-transparent text-sm font-medium text-white outline-none placeholder:text-white/40"
              />
            </label>

            <label className="flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-audi-red" />
              <select
                value={brand}
                onChange={event => {
                  setBrand(event.target.value);
                  resetToFirstPage();
                }}
                className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-white outline-none"
              >
                {brands.map(item => (
                  <option key={item} value={item} className="bg-catalog-card text-white">
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-black/30 px-4">
              <SlidersHorizontal className="h-4 w-4 shrink-0 text-audi-red" />
              <select
                value={category}
                onChange={event => {
                  setCategory(event.target.value);
                  resetToFirstPage();
                }}
                className="min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold text-white outline-none"
              >
                {categories.map(item => (
                  <option key={item} value={item} className="bg-catalog-card text-white">
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <button
              type="button"
              onClick={clearFilters}
              disabled={!hasFilters || pageLoadState === 'loading'}
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 px-4 text-sm font-semibold text-white/70 transition hover:border-audi-red hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              <X className="h-4 w-4" />
              Limpiar
            </button>
          </div>
        </motion.section>

        {pageLoadState === 'loading' && <SkeletonGrid />}

        {pageLoadState === 'error' && (
          <div className="rounded-2xl border border-audi-red/40 bg-audi-red/10 p-5 text-sm font-semibold text-white">
            {pageError}
          </div>
        )}

        {pageLoadState === 'ready' && (
          <>
            <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-label="Productos">
              {pageData.items.map(product => (
                <ProductCard key={product.id} product={product} />
              ))}
            </section>

            {!pageData.items.length && (
              <div className="rounded-3xl border border-dashed border-white/20 bg-white/[0.04] p-8 text-center text-white/70">
                No hay productos disponibles con esos filtros.
              </div>
            )}
          </>
        )}

        <nav
          className="mt-10 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between"
          aria-label="Paginacion del catalogo"
        >
          <span className="text-sm font-semibold text-white/60">
            Pagina {currentPage} de {totalPages} - {totalLabel}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setCatalogPage(Math.max(1, currentPage - 1))}
              disabled={currentPage <= 1 || pageLoadState === 'loading'}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 px-4 text-sm font-semibold text-white transition hover:border-audi-red hover:bg-audi-red disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ArrowLeft className="h-4 w-4" />
              Anterior
            </button>

            {pageNumbers.map((page, index) => {
              const previous = pageNumbers[index - 1];
              const showGap = previous && page - previous > 1;
              return (
                <Fragment key={page}>
                  {showGap && <span className="px-1 text-sm font-semibold text-white/40">...</span>}
                  <button
                    type="button"
                    onClick={() => setCatalogPage(page)}
                    disabled={pageLoadState === 'loading'}
                    aria-current={page === currentPage ? 'page' : undefined}
                    className={[
                      'inline-flex h-11 min-w-11 items-center justify-center rounded-full border px-4 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40',
                      page === currentPage
                        ? 'border-audi-red bg-audi-red text-white shadow-red'
                        : 'border-white/10 text-white/75 hover:border-audi-red hover:text-white',
                    ].join(' ')}
                  >
                    {page}
                  </button>
                </Fragment>
              );
            })}

            <button
              type="button"
              onClick={() => setCatalogPage(currentPage + 1)}
              disabled={!pageData.has_more || pageLoadState === 'loading'}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-white transition hover:border-audi-red hover:bg-audi-red disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/40 disabled:shadow-none"
            >
              Siguiente
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </nav>
      </main>

      <SiteFooter />
    </div>
  );
}
