import { useState } from 'react';
import {
  BarChart3,
  Box,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Sparkles,
  UserRound,
} from 'lucide-react';

import { useRequiredAuth } from '@app/providers/AuthProvider';
import { AppButton } from '@core/ui/AppButton';
import { CommandPalette } from '@features/inventory/components/CommandPalette';
import { DashboardSummary } from '@features/inventory/components/DashboardSummary';
import { InventoryCard } from '@features/inventory/components/InventoryCard';
import { SearchBar } from '@features/inventory/components/SearchBar';
import { useInventory } from '@features/inventory/hooks/useInventory';

export default function InventoryScreen() {
  const { isAdmin, logout, user } = useRequiredAuth();
  const [isCreating, setIsCreating] = useState(false);
  const {
    dashboard,
    filteredProducts,
    query,
    setQuery,
    isLoading,
    error,
    refresh,
  } = useInventory();

  function handleNewProduct() {
    setIsCreating(true);
    window.setTimeout(() => setIsCreating(false), 850);
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(228,0,43,0.08),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f7f8fa_46%,#eef0f4_100%)] text-gray-950">
      <div className="mx-auto grid min-h-screen max-w-[1680px] grid-cols-1 gap-0 lg:grid-cols-[292px_minmax(0,1fr)]">
        <aside className="z-20 border-b border-white/60 bg-white/55 px-4 py-4 shadow-sm backdrop-blur-2xl lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r lg:px-5 lg:py-6">
          <div className="flex items-center justify-between gap-3 rounded-panel border border-white/70 bg-white/55 p-3 shadow-sm backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              <div className="relative">
                <img
                  src="/audidisc.jpg"
                  alt="Audi Disc"
                  className="h-12 w-12 rounded-2xl object-cover shadow-card"
                />
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-audi-red ring-2 ring-white" />
              </div>
              <div className="min-w-0">
                <strong className="block truncate text-base font-semibold text-gray-950">
                  Audi Disc
                </strong>
                <span className="block truncate text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
                  {user.role}
                </span>
              </div>
            </div>
            <Sparkles className="h-5 w-5 text-audi-red" />
          </div>

          <nav className="mt-5 flex gap-2 overflow-x-auto lg:grid lg:overflow-visible" aria-label="Principal">
            <a
              className="group flex min-w-max items-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-950 shadow-sm transition hover:shadow-card active:scale-[0.99]"
              href="/inventario"
            >
              <span className="h-2 w-2 rounded-full bg-audi-red" />
              <Box className="h-4 w-4 text-gray-500" />
              Inventario
            </a>
            <a
              className="flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70 hover:text-gray-950 active:scale-[0.99]"
              href="/ventas"
            >
              <CreditCard className="h-4 w-4" />
              Ventas
            </a>
            {isAdmin && (
              <a
                className="flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70 hover:text-gray-950 active:scale-[0.99]"
                href="/reportes"
              >
                <BarChart3 className="h-4 w-4" />
                Reportes
              </a>
            )}
            <a
              className="flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70 hover:text-gray-950 active:scale-[0.99]"
              href="/clientes"
            >
              <UserRound className="h-4 w-4" />
              Clientes
            </a>
            <button
              className="flex min-w-max items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-gray-600 transition hover:bg-white/70 hover:text-gray-950 active:scale-[0.99]"
              onClick={() => void logout()}
            >
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </nav>

          <div className="mt-6 hidden rounded-panel border border-white/70 bg-white/60 p-4 shadow-sm backdrop-blur-xl lg:block">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-950">
              <LayoutDashboard className="h-4 w-4 text-audi-red" />
              Premium Sales
            </div>
            <p className="text-sm leading-6 text-gray-500">
              Inventario, ventas y alertas en una experiencia rapida, moderna y segura.
            </p>
          </div>
        </aside>

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">
                Audi Disc
              </p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
                Premium Sales Experience
              </h1>
              <p className="mt-4 text-base leading-7 text-gray-500">
                Inventario visual, busqueda instantanea, alertas criticas y operaciones listas para caja.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <CommandPalette isAdmin={isAdmin} onQueryChange={setQuery} onNewProduct={handleNewProduct} />
              <AppButton
                variant="neutral"
                onClick={() => void refresh()}
                isLoading={isLoading}
                icon={<RefreshCw className="h-4 w-4" />}
              >
                Actualizar
              </AppButton>
              {isAdmin && (
                <AppButton
                  variant="primary"
                  onClick={handleNewProduct}
                  isLoading={isCreating}
                  icon={<Plus className="h-4 w-4" />}
                >
                  Nuevo producto
                </AppButton>
              )}
            </div>
          </header>

          <DashboardSummary dashboard={dashboard} />

          <section className="mt-8 rounded-panel border border-white/70 bg-white/70 p-4 shadow-card backdrop-blur-xl sm:p-5">
            <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                  Catalogo activo
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-gray-950">Inventario</h2>
              </div>
              <SearchBar
                query={query}
                onQueryChange={setQuery}
                resultCount={filteredProducts.length}
              />
            </div>

            {error && (
              <div className="mb-4 rounded-2xl bg-audi-red px-4 py-3 text-sm font-semibold text-white">
                {error}
              </div>
            )}
            {isLoading && (
              <div className="mb-4 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-500">
                Cargando inventario...
              </div>
            )}

            <section className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3" aria-label="Productos de inventario">
              {filteredProducts.map(product => (
                <InventoryCard key={product.id} product={product} isAdmin={isAdmin} />
              ))}
            </section>
          </section>
        </section>
      </div>
    </main>
  );
}
