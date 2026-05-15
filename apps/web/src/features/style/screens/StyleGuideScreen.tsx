import { CheckCircle2, LayoutGrid, Moon, Palette, SunMedium } from 'lucide-react';

import { AppSidebar } from '@app/navigation/AppSidebar';
import { useRequiredAuth } from '@app/providers/AuthProvider';
import { useTheme } from '@app/providers/ThemeProvider';
import { AppButton } from '@core/ui/AppButton';

const colors = [
  { name: 'Obsidiana', value: '#070707', className: 'bg-[#070707]' },
  { name: 'Panel', value: '#151515 / #FFFFFF', className: 'bg-gradient-to-br from-[#151515] to-white' },
  { name: 'Audi Red', value: '#E4002B', className: 'bg-audi-red' },
  { name: 'Linea', value: '#E5E7EB / 12%', className: 'bg-gray-200 dark:bg-white/10' },
];

const rules = [
  'Una sola navegacion: AppSidebar define zonas y permisos.',
  'Usar ad-page, ad-shell y ad-surface como base antes de crear vistas nuevas.',
  'Tarjetas con radio panel, borde suave y una sola accion primaria roja por bloque.',
  'Tablas siempre con overflow-x-auto para celular y columnas escaneables.',
  'Modo dia/noche debe respetar contraste antes de publicar una pantalla.',
];

export default function StyleGuideScreen() {
  const { logout, user } = useRequiredAuth();
  const { theme, toggleTheme } = useTheme();

  return (
    <main className="ad-page">
      <div className="ad-shell">
        <AppSidebar active="style" user={user} onLogout={logout} />

        <section className="min-w-0 px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
          <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Referente visual</p>
              <h1 className="mt-3 text-4xl font-semibold tracking-tight text-gray-950 dark:text-white sm:text-5xl">
                Audi Red Edition UI
              </h1>
              <p className="mt-4 max-w-3xl text-base leading-7 text-gray-500 dark:text-white/55">
                Esta guia deja una base comun para que Inventario, POS, Reportes, BI y futuras pantallas se sientan
                parte del mismo producto.
              </p>
            </div>
            <AppButton
              variant="primary"
              icon={theme === 'dark' ? <SunMedium className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              onClick={toggleTheme}
            >
              {theme === 'dark' ? 'Probar modo dia' : 'Probar modo noche'}
            </AppButton>
          </header>

          <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
            <article className="rounded-panel border border-white/70 bg-white/85 p-6 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <div className="flex items-center gap-3">
                <Palette className="h-6 w-6 text-audi-red" />
                <h2 className="text-2xl font-semibold text-gray-950 dark:text-white">Paleta y tono</h2>
              </div>
              <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {colors.map(color => (
                  <div key={color.name} className="overflow-hidden rounded-2xl border border-gray-100 bg-white dark:border-white/10 dark:bg-white/[0.04]">
                    <div className={`h-28 ${color.className}`} />
                    <div className="p-4">
                      <strong className="block text-gray-950 dark:text-white">{color.name}</strong>
                      <span className="mt-1 block text-sm text-gray-500 dark:text-white/50">{color.value}</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-6 rounded-2xl bg-audi-red p-5 text-white shadow-button">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/75">Uso del acento</p>
                <h3 className="mt-2 text-2xl font-semibold">Rojo solo para accion, alerta o marca.</h3>
                <p className="mt-2 text-sm leading-6 text-white/80">
                  Evita saturar toda una pantalla con rojo; debe guiar la vista, no competir con la informacion.
                </p>
              </div>
            </article>

            <aside className="rounded-panel border border-white/70 bg-white/85 p-6 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <div className="flex items-center gap-3">
                <LayoutGrid className="h-6 w-6 text-audi-red" />
                <h2 className="text-2xl font-semibold text-gray-950 dark:text-white">Reglas practicas</h2>
              </div>
              <div className="mt-5 grid gap-3">
                {rules.map(rule => (
                  <div key={rule} className="flex gap-3 rounded-2xl border border-gray-100 bg-gray-50 p-4 dark:border-white/10 dark:bg-white/[0.04]">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-audi-red" />
                    <p className="text-sm leading-6 text-gray-600 dark:text-white/60">{rule}</p>
                  </div>
                ))}
              </div>
            </aside>
          </section>

          <section className="mt-5 grid gap-5 lg:grid-cols-3">
            <article className="rounded-panel border border-white/70 bg-white/85 p-6 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Tipografia</p>
              <h2 className="mt-3 text-3xl font-semibold text-gray-950 dark:text-white">Inter / Sistema</h2>
              <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-white/55">
                Titulos con peso 600, textos de apoyo en gris y tracking amplio solo en etiquetas cortas.
              </p>
            </article>
            <article className="rounded-panel border border-white/70 bg-white/85 p-6 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Componentes</p>
              <div className="mt-4 flex flex-wrap gap-3">
                <AppButton variant="primary">Primario</AppButton>
                <AppButton variant="neutral">Neutral</AppButton>
              </div>
              <p className="mt-4 text-sm leading-6 text-gray-500 dark:text-white/55">
                Acciones destructivas o de caja deben confirmar cuando cambian datos sensibles.
              </p>
            </article>
            <article className="rounded-panel border border-white/70 bg-white/85 p-6 shadow-card backdrop-blur-xl dark:border-white/10 dark:bg-white/[0.06]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-audi-red">Responsive</p>
              <h2 className="mt-3 text-3xl font-semibold text-gray-950 dark:text-white">Mobile first</h2>
              <p className="mt-3 text-sm leading-6 text-gray-500 dark:text-white/55">
                En celular, navegacion horizontal, tablas con scroll y botones tactiles de al menos 44 px.
              </p>
            </article>
          </section>
        </section>
      </div>
    </main>
  );
}
