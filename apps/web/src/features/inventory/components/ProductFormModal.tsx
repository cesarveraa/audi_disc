import { FormEvent, useEffect, useMemo, useState } from 'react';
import { PackagePlus, X } from 'lucide-react';
import type { Product, ProductCreateInput, ProductUpdateInput } from '@audidisc/shared';
import { hasAdminFinancials } from '@audidisc/shared';

import { AppButton } from '@core/ui/AppButton';

type Props = {
  open: boolean;
  product: Product | null;
  isSaving: boolean;
  apiError: string | null;
  onClose: () => void;
  onSubmit: (payload: ProductCreateInput | ProductUpdateInput) => Promise<void>;
};

function toCentavos(value: string): number {
  const parsed = Number(value.replace(',', '.'));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.round(parsed * 100);
}

function fromCentavos(value: number): string {
  return (value / 100).toFixed(2);
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function ProductFormModal({
  open,
  product,
  isSaving,
  apiError,
  onClose,
  onSubmit,
}: Props) {
  const isEditing = Boolean(product);
  const [nombre, setNombre] = useState('');
  const [marca, setMarca] = useState('');
  const [sku, setSku] = useState('');
  const [categoria, setCategoria] = useState('');
  const [cantidad, setCantidad] = useState('0');
  const [stockMinimo, setStockMinimo] = useState('3');
  const [precioCompra, setPrecioCompra] = useState('');
  const [precioVenta, setPrecioVenta] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setNombre(product?.nombre ?? '');
    setMarca(product?.marca ?? '');
    setSku(product?.sku ?? '');
    setCategoria(product?.categoria ?? '');
    setCantidad(String(product?.cantidad ?? 0));
    setStockMinimo(String(product?.stockMinimo ?? 3));
    setPrecioVenta(product ? fromCentavos(product.precioVentaCentavos) : '');
    setPrecioCompra(
      product && hasAdminFinancials(product)
        ? fromCentavos(product.precioCompraCentavos)
        : product
          ? fromCentavos(product.precioVentaCentavos)
          : '',
    );
    setLocalError(null);
  }, [open, product]);

  const marginPreview = useMemo(() => {
    const compra = toCentavos(precioCompra || precioVenta);
    const venta = toCentavos(precioVenta);
    if (venta <= 0 || compra <= 0 || venta < compra) {
      return 0;
    }
    return Math.round(((venta - compra) / venta) * 10000) / 100;
  }, [precioCompra, precioVenta]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalError(null);

    const ventaCentavos = toCentavos(precioVenta);
    const compraCentavos = toCentavos(precioCompra || precioVenta);
    const nextCantidad = Number(cantidad);
    const nextStockMinimo = Number(stockMinimo);

    if (!nombre.trim()) {
      setLocalError('El nombre es requerido.');
      return;
    }
    if (!Number.isInteger(nextCantidad) || nextCantidad < 0) {
      setLocalError('El stock debe ser un numero entero positivo.');
      return;
    }
    if (!Number.isInteger(nextStockMinimo) || nextStockMinimo < 0) {
      setLocalError('El minimo debe ser un numero entero positivo.');
      return;
    }
    if (ventaCentavos <= 0 || compraCentavos <= 0) {
      setLocalError('Los precios deben ser mayores a cero.');
      return;
    }
    if (ventaCentavos < compraCentavos) {
      setLocalError('El precio de venta no puede ser menor al costo.');
      return;
    }

    await onSubmit({
      nombre: nombre.trim(),
      marca: nullableText(marca),
      sku: nullableText(sku),
      categoria: nullableText(categoria),
      cantidad: nextCantidad,
      stockMinimo: nextStockMinimo,
      precioCompraCentavos: compraCentavos,
      precioVentaCentavos: ventaCentavos,
    });
  }

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/45 px-4 py-8 backdrop-blur-sm">
      <section className="w-full max-w-2xl overflow-hidden rounded-panel border border-white/70 bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-gray-100 px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-audi-red text-white">
              <PackagePlus className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-audi-red">
                Inventario
              </p>
              <h2 className="mt-1 text-2xl font-semibold text-gray-950">
                {isEditing ? 'Editar producto' : 'Nuevo producto'}
              </h2>
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
          <div className="grid gap-4 md:grid-cols-2">
            <label className="grid gap-2 text-sm font-semibold text-gray-700 md:col-span-2">
              Nombre
              <input
                value={nombre}
                onChange={event => setNombre(event.target.value)}
                className="h-12 rounded-2xl border border-gray-200 px-4 outline-none transition focus:border-audi-red"
                placeholder="Cable HDMI 2.0"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-gray-700">
              Marca
              <input
                value={marca}
                onChange={event => setMarca(event.target.value)}
                className="h-12 rounded-2xl border border-gray-200 px-4 outline-none transition focus:border-audi-red"
                placeholder="Audi Disc"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-gray-700">
              SKU
              <input
                value={sku}
                onChange={event => setSku(event.target.value)}
                className="h-12 rounded-2xl border border-gray-200 px-4 outline-none transition focus:border-audi-red"
                placeholder="CAB-HDMI-20"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-gray-700">
              Categoria
              <input
                value={categoria}
                onChange={event => setCategoria(event.target.value)}
                className="h-12 rounded-2xl border border-gray-200 px-4 outline-none transition focus:border-audi-red"
                placeholder="Cables"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-gray-700">
              Stock inicial
              <input
                type="number"
                min={0}
                step={1}
                value={cantidad}
                onChange={event => setCantidad(event.target.value)}
                className="h-12 rounded-2xl border border-gray-200 px-4 outline-none transition focus:border-audi-red"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-gray-700">
              Stock minimo
              <input
                type="number"
                min={0}
                step={1}
                value={stockMinimo}
                onChange={event => setStockMinimo(event.target.value)}
                className="h-12 rounded-2xl border border-gray-200 px-4 outline-none transition focus:border-audi-red"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-gray-700">
              Costo Bs
              <input
                inputMode="decimal"
                value={precioCompra}
                onChange={event => setPrecioCompra(event.target.value)}
                className="h-12 rounded-2xl border border-gray-200 px-4 outline-none transition focus:border-audi-red"
                placeholder="35.00"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold text-gray-700">
              Venta Bs
              <input
                inputMode="decimal"
                value={precioVenta}
                onChange={event => setPrecioVenta(event.target.value)}
                className="h-12 rounded-2xl border border-gray-200 px-4 outline-none transition focus:border-audi-red"
                placeholder="35.00"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 rounded-2xl bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-semibold text-gray-500">Margen estimado</span>
            <strong className="text-lg font-semibold text-gray-950">{marginPreview.toFixed(2)}%</strong>
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
              {isEditing ? 'Guardar cambios' : 'Crear producto'}
            </AppButton>
          </footer>
        </form>
      </section>
    </div>
  );
}
