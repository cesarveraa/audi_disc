import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Boxes, X } from 'lucide-react';
import type { InventoryUpdateInput, InventoryMovementType, Product } from '@audidisc/shared';

import { AppButton } from '@core/ui/AppButton';

type Props = {
  product: Product | null;
  isSaving: boolean;
  apiError: string | null;
  onClose: () => void;
  onSubmit: (payload: InventoryUpdateInput) => Promise<void>;
};

export function StockUpdateModal({
  product,
  isSaving,
  apiError,
  onClose,
  onSubmit,
}: Props) {
  const [tipo, setTipo] = useState<InventoryMovementType>('entrada');
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');
  const [referencia, setReferencia] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) {
      return;
    }
    setTipo('entrada');
    setCantidad('1');
    setMotivo('');
    setReferencia('');
    setLocalError(null);
  }, [product]);

  const delta = useMemo(() => {
    if (!product) {
      return 0;
    }
    const parsed = Number(cantidad);
    if (!Number.isInteger(parsed)) {
      return 0;
    }
    return tipo === 'entrada' ? parsed : parsed - product.cantidad;
  }, [cantidad, product, tipo]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!product) {
      return;
    }
    setLocalError(null);
    const parsed = Number(cantidad);
    if (!Number.isInteger(parsed) || parsed < 0) {
      setLocalError('Ingresa una cantidad entera valida.');
      return;
    }
    if (delta === 0) {
      setLocalError('El ajuste no cambia el stock actual.');
      return;
    }
    if (product.cantidad + delta < 0) {
      setLocalError('El ajuste deja el stock en negativo.');
      return;
    }

    await onSubmit({
      productoId: product.id,
      tipo,
      cantidadDelta: delta,
      motivo: motivo.trim() || null,
      referencia: referencia.trim() || null,
    });
  }

  if (!product) {
    return null;
  }

  const nextStock = product.cantidad + delta;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4 py-8 backdrop-blur-sm">
      <section className="w-full max-w-xl overflow-hidden rounded-panel border border-white/70 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gray-950 text-white">
              <Boxes className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">
                Stock
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-gray-950">{product.nombre}</h2>
            </div>
          </div>
          <button
            className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-gray-500 transition hover:bg-gray-200 active:scale-95"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <form className="grid gap-5 px-6 py-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-100 p-1">
            {(['entrada', 'ajuste'] as InventoryMovementType[]).map(nextTipo => (
              <button
                key={nextTipo}
                type="button"
                className={[
                  'h-11 rounded-xl text-sm font-semibold capitalize transition active:scale-[0.98]',
                  tipo === nextTipo ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-950',
                ].join(' ')}
                onClick={() => setTipo(nextTipo)}
              >
                {nextTipo}
              </button>
            ))}
          </div>

          <label className="grid gap-2 text-sm font-semibold text-gray-700">
            {tipo === 'entrada' ? 'Unidades que ingresan' : 'Stock final'}
            <input
              type="number"
              min={0}
              step={1}
              value={cantidad}
              onChange={event => setCantidad(event.target.value)}
              className="h-14 rounded-2xl border border-gray-200 px-4 text-xl font-semibold outline-none transition focus:border-audi-red"
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-gray-50 p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Actual</span>
              <strong className="mt-1 block text-2xl font-semibold">{product.cantidad}</strong>
            </div>
            <div className="rounded-2xl bg-gray-50 p-4">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Delta</span>
              <strong className={delta < 0 ? 'mt-1 block text-2xl font-semibold text-audi-red' : 'mt-1 block text-2xl font-semibold text-gray-950'}>
                {delta > 0 ? `+${delta}` : delta}
              </strong>
            </div>
            <div className={nextStock < 5 ? 'rounded-2xl bg-audi-red p-4 text-white' : 'rounded-2xl bg-gray-950 p-4 text-white'}>
              <span className="text-xs font-semibold uppercase tracking-wide text-white/75">Nuevo</span>
              <strong className="mt-1 block text-2xl font-semibold">{nextStock}</strong>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-gray-700">
              Motivo
              <input
                value={motivo}
                onChange={event => setMotivo(event.target.value)}
                className="h-12 rounded-2xl border border-gray-200 px-4 outline-none transition focus:border-audi-red"
                placeholder="Reposicion, conteo, merma"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-gray-700">
              Referencia
              <input
                value={referencia}
                onChange={event => setReferencia(event.target.value)}
                className="h-12 rounded-2xl border border-gray-200 px-4 outline-none transition focus:border-audi-red"
                placeholder="Factura o nota"
              />
            </label>
          </div>

          {(localError || apiError) && (
            <div className="rounded-2xl bg-audi-red px-4 py-3 text-sm font-semibold text-white">
              {localError || apiError}
            </div>
          )}

          <footer className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
            <AppButton type="button" variant="neutral" onClick={onClose}>
              Cancelar
            </AppButton>
            <AppButton type="submit" variant="primary" isLoading={isSaving}>
              Aplicar stock
            </AppButton>
          </footer>
        </form>
      </section>
    </div>
  );
}
