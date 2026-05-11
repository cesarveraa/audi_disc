import { X } from 'lucide-react';
import type { PaymentMethod } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { AppButton } from '@core/ui/AppButton';
import { calculateChange } from '@features/sales/utils/cart';

type Props = {
  open: boolean;
  totalCentavos: number;
  recibidoCentavos: number;
  metodo: PaymentMethod;
  isProcessing: boolean;
  error: string | null;
  onRecibidoChange: (value: number) => void;
  onMetodoChange: (method: PaymentMethod) => void;
  onClose: () => void;
  onConfirm: () => void;
};

const methods: PaymentMethod[] = ['Efectivo', 'Qr', 'Transferencia'];

export function PaymentModal({
  open,
  totalCentavos,
  recibidoCentavos,
  metodo,
  isProcessing,
  error,
  onRecibidoChange,
  onMetodoChange,
  onClose,
  onConfirm,
}: Props) {
  if (!open) {
    return null;
  }

  const cambioCentavos = calculateChange(recibidoCentavos, totalCentavos);
  const canConfirm = recibidoCentavos >= totalCentavos && totalCentavos > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4 py-8 backdrop-blur-sm">
      <section
        className="w-full max-w-xl overflow-hidden rounded-[28px] border border-white/70 bg-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Confirmar pago"
      >
        <header className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">
              Cobro
            </p>
            <h2 className="mt-1 text-2xl font-semibold text-gray-950">Confirmar venta</h2>
          </div>
          <button
            className="grid h-10 w-10 place-items-center rounded-2xl bg-gray-100 text-gray-500 transition hover:bg-gray-200 active:scale-95"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="grid gap-5 px-6 py-5">
          <div className="rounded-panel bg-gray-950 p-5 text-white">
            <span className="text-sm font-semibold text-white/70">Total a pagar</span>
            <strong className="mt-2 block text-4xl font-semibold tracking-tight">
              {formatBsFromCentavos(totalCentavos)}
            </strong>
            <span className="mt-2 block text-sm font-medium text-white/70">
              {totalCentavos} centavos
            </span>
          </div>

          <label className="grid gap-2">
            <span className="text-sm font-semibold text-gray-700">Efectivo recibido</span>
            <input
              type="number"
              min={0}
              step={1}
              value={recibidoCentavos}
              onChange={event => onRecibidoChange(Number(event.target.value || 0))}
              className="h-14 rounded-2xl border border-gray-200 bg-white px-4 text-xl font-semibold text-gray-950 outline-none transition focus:border-gray-400 focus:shadow-card"
            />
            <span className="text-xs font-medium text-gray-500">
              Ingresa el monto en centavos para mantener precision exacta.
            </span>
          </label>

          <div>
            <span className="mb-2 block text-sm font-semibold text-gray-700">Metodo</span>
            <div className="grid grid-cols-3 gap-2">
              {methods.map(method => (
                <button
                  key={method}
                  className={[
                    'h-11 rounded-2xl border text-sm font-semibold transition active:scale-[0.98]',
                    metodo === method
                      ? 'border-audi-red bg-audi-red text-white'
                      : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50',
                  ].join(' ')}
                  onClick={() => onMetodoChange(method)}
                >
                  {method}
                </button>
              ))}
            </div>
          </div>

          <div className={cambioCentavos >= 0 ? 'rounded-panel bg-audi-red p-5 text-white' : 'rounded-panel bg-gray-100 p-5 text-gray-950'}>
            <span className={cambioCentavos >= 0 ? 'text-sm font-semibold text-white/80' : 'text-sm font-semibold text-gray-500'}>
              Cambio / Vuelto
            </span>
            <strong className="mt-2 block text-4xl font-semibold tracking-tight">
              {formatBsFromCentavos(Math.max(cambioCentavos, 0))}
            </strong>
          </div>

          {error && (
            <div className="rounded-2xl bg-audi-red px-4 py-3 text-sm font-semibold text-white">
              {error}
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-3 border-t border-gray-100 px-6 py-5 sm:flex-row sm:justify-end">
          <AppButton variant="neutral" onClick={onClose}>
            Cancelar
          </AppButton>
          <AppButton
            variant="primary"
            className="h-14 px-6 text-base"
            isLoading={isProcessing}
            disabled={!canConfirm}
            onClick={onConfirm}
          >
            Finalizar Compra
          </AppButton>
        </footer>
      </section>
    </div>
  );
}
