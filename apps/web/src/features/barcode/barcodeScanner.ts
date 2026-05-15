import { Capacitor } from '@capacitor/core';
import type { Product } from '@audidisc/shared';

const BARCODE_FORMATS = [
  'Ean13',
  'Ean8',
  'UpcA',
  'UpcE',
  'Code128',
  'Code39',
  'Code93',
  'Codabar',
  'Itf',
  'QrCode',
] as const;

function normalizeBarcode(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function normalizeSku(value: string | null | undefined) {
  return normalizeBarcode(value).replace(/[\s-]+/g, '');
}

function delay(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

export function findProductByBarcode(products: Product[], rawValue: string): Product | null {
  const normalized = normalizeBarcode(rawValue);
  const compact = normalizeSku(rawValue);
  if (!normalized) {
    return null;
  }

  return products.find(product => {
    const sku = normalizeSku(product.sku);
    const id = normalizeBarcode(product.id);
    const name = normalizeBarcode(product.nombre);
    return sku === compact || id === normalized || name === normalized || Boolean(sku && sku.includes(compact));
  }) ?? null;
}

export async function scanBarcodeValue(): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('El escaneo con camara esta disponible en la app Android de Audi Disc.');
  }

  const { BarcodeFormat, BarcodeScanner } = await import('@capacitor-mlkit/barcode-scanning');
  const supported = await BarcodeScanner.isSupported();
  if (!supported.supported) {
    throw new Error('Este dispositivo no soporta escaneo de codigos de barras.');
  }

  let permissions = await BarcodeScanner.checkPermissions();
  if (permissions.camera !== 'granted' && permissions.camera !== 'limited') {
    permissions = await BarcodeScanner.requestPermissions();
  }
  if (permissions.camera === 'denied') {
    throw new Error('Permiso de camara denegado. Activalo en Ajustes para escanear productos.');
  }
  if (permissions.camera !== 'granted' && permissions.camera !== 'limited') {
    throw new Error('Audi Disc necesita permiso de camara para escanear codigos.');
  }

  if (Capacitor.getPlatform() === 'android') {
    const moduleStatus = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
    if (!moduleStatus.available) {
      await BarcodeScanner.installGoogleBarcodeScannerModule();
      for (let attempt = 0; attempt < 12; attempt += 1) {
        await delay(500);
        const nextStatus = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
        if (nextStatus.available) {
          break;
        }
      }
      const readyStatus = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable();
      if (!readyStatus.available) {
        throw new Error('El modulo de escaneo de Google se esta instalando. Espera unos segundos y vuelve a intentar.');
      }
    }
  }

  const { barcodes } = await BarcodeScanner.scan({
    autoZoom: true,
    formats: BARCODE_FORMATS.map(format => BarcodeFormat[format]),
  });
  const value = barcodes[0]?.rawValue || barcodes[0]?.displayValue;
  if (!value) {
    throw new Error('No se detecto ningun codigo. Intenta acercar la camara al producto.');
  }
  return value;
}
