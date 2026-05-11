import { useEffect, useMemo, useRef, useState } from 'react';
import { Command, PackageSearch, Plus, Search, X } from 'lucide-react';

type CommandAction = {
  id: string;
  label: string;
  hint: string;
  icon: 'search' | 'plus' | 'nav';
  run: () => void;
};

type Props = {
  isAdmin?: boolean;
  onQueryChange: (query: string) => void;
  onNewProduct?: () => void;
};

function commandIcon(icon: CommandAction['icon']) {
  if (icon === 'plus') {
    return <Plus className="h-4 w-4" />;
  }
  if (icon === 'search') {
    return <Search className="h-4 w-4" />;
  }
  return <PackageSearch className="h-4 w-4" />;
}

function navigateTo(path: string) {
  window.history.pushState(null, '', path);
  window.dispatchEvent(new Event('audidisc:navigate'));
}

export function CommandPalette({ isAdmin = false, onQueryChange, onNewProduct }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo<CommandAction[]>(
    () => {
      const base: CommandAction[] = [
        {
        id: 'inventory',
        label: 'Ir a Inventario',
        hint: 'Catalogo activo',
        icon: 'nav',
        run: () => navigateTo('/inventario'),
        },
        {
        id: 'sales',
        label: 'Ir a Ventas',
        hint: 'Cobro y cambio',
        icon: 'nav',
        run: () => navigateTo('/ventas'),
        },
        {
        id: 'critical',
        label: 'Mostrar stock critico',
        hint: 'Filtra alertas rojas',
        icon: 'search',
        run: () => onQueryChange('cable'),
        },
        {
        id: 'sony',
        label: 'Buscar Sony',
        hint: 'Marca premium',
        icon: 'search',
        run: () => onQueryChange('sony'),
        },
      ];

      if (!isAdmin) {
        return base;
      }

      return [
        ...base,
        {
          id: 'reports',
          label: 'Ir a Reportes',
          hint: 'Utilidad y margen',
          icon: 'nav',
          run: () => navigateTo('/reportes'),
        },
        {
          id: 'history',
          label: 'Ventas Pasadas',
          hint: 'Anulacion admin',
          icon: 'nav',
          run: () => navigateTo('/historial'),
        },
        {
          id: 'new-product',
          label: 'Nuevo producto',
          hint: 'CTA administrador',
          icon: 'plus',
          run: () => onNewProduct?.(),
        },
      ];
    },
    [isAdmin, onNewProduct, onQueryChange],
  );

  const filteredCommands = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return commands;
    }
    return commands.filter(command =>
      `${command.label} ${command.hint}`.toLowerCase().includes(normalized),
    );
  }, [commands, query]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen(true);
      }
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [open]);

  function runCommand(command: CommandAction) {
    command.run();
    setOpen(false);
    setQuery('');
  }

  return (
    <>
      <button
        className="hidden h-11 items-center gap-2 rounded-2xl border border-gray-200 bg-white/80 px-3 text-sm font-semibold text-gray-600 shadow-sm transition hover:bg-white active:scale-[0.98] md:inline-flex"
        onClick={() => setOpen(true)}
      >
        <Command className="h-4 w-4" />
        <span>Buscar</span>
        <kbd className="rounded-lg border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] text-gray-500">
          Ctrl K
        </kbd>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-gray-950/35 px-4 py-20 backdrop-blur-sm">
          <div
            className="w-full max-w-xl overflow-hidden rounded-[24px] border border-white/70 bg-white/95 shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-label="Command Palette"
          >
            <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
              <Search className="h-5 w-5 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="h-10 min-w-0 flex-1 border-0 bg-transparent text-base text-gray-950 outline-none placeholder:text-gray-400"
                placeholder="Buscar comando, vista o producto..."
              />
              <button
                className="rounded-xl p-2 text-gray-400 transition hover:bg-gray-100 hover:text-gray-700 active:scale-95"
                onClick={() => setOpen(false)}
                aria-label="Cerrar command palette"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="max-h-[360px] overflow-y-auto p-2">
              {filteredCommands.map(command => (
                <button
                  key={command.id}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-gray-50 active:scale-[0.99]"
                  onClick={() => runCommand(command)}
                >
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-gray-100 text-gray-700">
                    {commandIcon(command.icon)}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold text-gray-950">{command.label}</span>
                    <span className="block text-sm text-gray-500">{command.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
