import type { CatalogProduct } from '@audidisc/shared';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';

import { fetchCatalogProducts } from '../api/catalogClient';
import { FloatingWhatsAppButton } from '../components/WhatsAppButton';
import { productSlug } from '../utils/catalog';

const Home = lazy(() => import('../pages/Home'));
const Catalog = lazy(() => import('../pages/Catalog'));
const ProductDetail = lazy(() => import('../pages/ProductDetail'));

export type LoadState = 'idle' | 'loading' | 'ready' | 'error';

export type CatalogPageProps = {
  products: CatalogProduct[];
  loadState: LoadState;
  errorMessage: string | null;
};

function RouteFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-catalog-bg text-catalog-muted">
      <Loader2 className="mr-2 h-5 w-5 animate-spin text-audi-red" />
      Cargando Audi Disc
    </div>
  );
}

function LegacyProductRedirect() {
  const { slug } = useParams();
  return <Navigate to={slug ? `/productos/${slug}` : '/productos'} replace />;
}

function CatalogRoutes() {
  const location = useLocation();
  const routeState = location.state as { product?: CatalogProduct } | null;
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoadState('loading');
    fetchCatalogProducts({ page: 1, limit: 10 })
      .then(page => {
        if (!active) {
          return;
        }
        setProducts(page.items);
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

  const pageProps: CatalogPageProps = {
    products,
    loadState,
    errorMessage,
  };
  const activeProductSlug = location.pathname.startsWith('/productos/')
    ? decodeURIComponent(location.pathname.replace('/productos/', '').replace(/\/+$/, ''))
    : null;
  const activeProduct =
    routeState?.product ??
    (activeProductSlug ? products.find(product => productSlug(product) === activeProductSlug) : undefined);

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.24, ease: 'easeOut' }}
          >
            <Routes location={location}>
              <Route path="/" element={<Home {...pageProps} />} />
              <Route path="/productos" element={<Catalog {...pageProps} />} />
              <Route path="/productos/:slug" element={<ProductDetail {...pageProps} />} />
              <Route path="/producto/:slug" element={<LegacyProductRedirect />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </Suspense>
      <FloatingWhatsAppButton product={activeProduct} />
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <CatalogRoutes />
    </BrowserRouter>
  );
}
