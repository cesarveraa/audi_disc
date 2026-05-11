import { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BarcodeScanningResult, CameraView, useCameraPermissions } from 'expo-camera';
import type { Customer, PaymentMethod, ProductPublic } from '@audidisc/shared';
import { filterProducts, formatBsFromCentavos } from '@audidisc/shared';

import { useMobileAuth } from '@app/providers/MobileAuthProvider';
import { colors } from '@core/theme/colors';
import { fetchMobileCustomers } from '@features/customers/services/mobileCustomersService';
import {
  buildMobileSalePayload,
  cartTotal,
  registerMobileSale,
  type MobileCartItem,
} from '@features/sales/services/mobileSalesService';

type Props = {
  products: ProductPublic[];
  initialProduct?: ProductPublic | null;
  initialCustomer?: Customer | null;
  onBack: () => void;
  onSaleCompleted: () => void;
};

const quickAmounts = [2000, 5000, 10000, 20000, 50000];
const barcodeTypes = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] as const;

function addToCart(items: MobileCartItem[], product: ProductPublic): MobileCartItem[] {
  const current = items.find(item => item.product.id === product.id);
  if (!current) {
    return [...items, { product, quantity: 1 }];
  }
  if (current.quantity >= product.cantidad) {
    return items;
  }
  return items.map(item =>
    item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item,
  );
}

export default function MobilePOSScreen({ products, initialCustomer, initialProduct, onBack, onSaleCompleted }: Props) {
  const { idToken } = useMobileAuth();
  const [permission, requestPermission] = useCameraPermissions();
  const [query, setQuery] = useState(initialProduct?.sku ?? '');
  const [customerQuery, setCustomerQuery] = useState(initialCustomer?.nombre ?? '');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(initialCustomer ?? null);
  const [cart, setCart] = useState<MobileCartItem[]>(() => (initialProduct ? [{ product: initialProduct, quantity: 1 }] : []));
  const [receivedText, setReceivedText] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('Efectivo');
  const [isPaying, setPaying] = useState(false);
  const [isProcessing, setProcessing] = useState(false);
  const [isScannerOpen, setScannerOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredProducts = useMemo(() => filterProducts(products, query).slice(0, 30), [products, query]);
  const total = useMemo(() => cartTotal(cart), [cart]);
  const received = Math.max(0, Math.round(Number(receivedText || 0) * 100));
  const change = Math.max(0, received - total);

  useEffect(() => {
    let mounted = true;
    fetchMobileCustomers(idToken, customerQuery)
      .then(nextCustomers => {
        if (mounted) {
          setCustomers(nextCustomers.slice(0, 4));
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [customerQuery, idToken]);

  function increment(productId: string) {
    setCart(current =>
      current.map(item =>
        item.product.id === productId && item.quantity < item.product.cantidad
          ? { ...item, quantity: item.quantity + 1 }
          : item,
      ),
    );
  }

  function decrement(productId: string) {
    setCart(current =>
      current
        .map(item => (item.product.id === productId ? { ...item, quantity: item.quantity - 1 } : item))
        .filter(item => item.quantity > 0),
    );
  }

  async function openScanner() {
    setError(null);
    const nextPermission = permission?.granted ? permission : await requestPermission();
    if (!nextPermission?.granted) {
      setError('Permiso de camara requerido para escanear codigos.');
      return;
    }
    setScannerOpen(true);
  }

  function handleBarcodeScanned(result: BarcodeScanningResult) {
    const code = result.data.trim();
    const normalizedCode = code.toLocaleLowerCase();
    setScannerOpen(false);
    setQuery(code);
    const scannedProduct = products.find(product => {
      const values = [product.id, product.sku, product.nombre, product.marca].filter(Boolean);
      return values.some(value => String(value).trim().toLocaleLowerCase() === normalizedCode);
    });
    if (scannedProduct) {
      setCart(current => addToCart(current, scannedProduct));
      setMessage(`${scannedProduct.nombre} agregado por escaneo.`);
      return;
    }
    setMessage(`Codigo ${code} listo para busqueda.`);
  }

  async function confirmSale() {
    setProcessing(true);
    setError(null);
    try {
      const payload = buildMobileSalePayload(cart, received, method, selectedCustomer?.id);
      const sale = await registerMobileSale({
        idToken,
        payload,
      });
      setCart([]);
      setSelectedCustomer(null);
      setCustomerQuery('');
      setReceivedText('');
      setPaying(false);
      setMessage(`Venta ${sale.id} registrada. Vuelto ${formatBsFromCentavos(sale.cambioCentavos)}.`);
      onSaleCompleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar venta');
    } finally {
      setProcessing(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Pressable style={styles.backButton} onPress={onBack}>
          <Text style={styles.backText}>Inventario</Text>
        </Pressable>
        <Text style={styles.title}>POS Movil</Text>
        <Text style={styles.subtitle}>Busqueda rapida tipo escaneo</Text>
      </View>

      {message && <Text style={styles.success}>{message}</Text>}
      {error && !isPaying && <Text style={styles.error}>{error}</Text>}

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Escanear SKU o buscar producto"
          placeholderTextColor="rgba(255,255,255,0.38)"
          style={styles.searchInput}
          autoCapitalize="none"
        />
        <Pressable style={({ pressed }) => [styles.scanButton, pressed && styles.pressed]} onPress={() => void openScanner()}>
          <Text style={styles.scanText}>Scan</Text>
        </Pressable>
      </View>

      <View style={styles.customerBox}>
        <Text style={styles.panelLabel}>Cliente</Text>
        {selectedCustomer ? (
          <Pressable style={styles.customerSelected} onPress={() => setSelectedCustomer(null)}>
            <Text numberOfLines={1} style={styles.customerName}>{selectedCustomer.nombre}</Text>
            <Text style={styles.customerPhone}>{selectedCustomer.telefono}</Text>
          </Pressable>
        ) : (
          <>
            <TextInput
              value={customerQuery}
              onChangeText={setCustomerQuery}
              placeholder="Buscar cliente para asignar"
              placeholderTextColor="rgba(255,255,255,0.38)"
              style={styles.customerInput}
            />
            <View style={styles.customerPills}>
              {customers.map(customer => (
                <Pressable key={customer.id} style={styles.customerPill} onPress={() => setSelectedCustomer(customer)}>
                  <Text numberOfLines={1} style={styles.customerPillText}>{customer.nombre}</Text>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </View>

      <FlatList
        data={filteredProducts}
        keyExtractor={item => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.productStrip}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [styles.productPill, pressed && styles.pressed]}
            onPress={() => {
              setCart(current => addToCart(current, item));
              setMessage(`${item.nombre} agregado.`);
            }}
          >
            <Text numberOfLines={1} style={styles.pillName}>{item.nombre}</Text>
            <Text style={styles.pillPrice}>{formatBsFromCentavos(item.precioVentaCentavos)}</Text>
          </Pressable>
        )}
      />

      <View style={styles.cartPanel}>
        <Text style={styles.panelLabel}>Carrito tactil</Text>
        <FlatList
          data={cart}
          keyExtractor={item => item.product.id}
          contentContainerStyle={styles.cartList}
          renderItem={({ item }) => (
            <View style={styles.cartItem}>
              <View style={styles.cartText}>
                <Text numberOfLines={1} style={styles.cartName}>{item.product.nombre}</Text>
                <Text style={styles.cartMeta}>{formatBsFromCentavos(item.product.precioVentaCentavos)}</Text>
              </View>
              <View style={styles.qtyControls}>
                <Pressable style={styles.qtyButton} onPress={() => decrement(item.product.id)}>
                  <Text style={styles.qtySymbol}>-</Text>
                </Pressable>
                <Text style={styles.qtyValue}>{item.quantity}</Text>
                <Pressable style={styles.qtyButtonRed} onPress={() => increment(item.product.id)}>
                  <Text style={styles.qtySymbol}>+</Text>
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptyCart}>Agrega productos para cobrar.</Text>}
        />
      </View>

      <View style={styles.footer}>
        <View>
          <Text style={styles.totalLabel}>Total</Text>
          <Text style={styles.totalValue}>{formatBsFromCentavos(total)}</Text>
        </View>
        <Pressable
          style={[styles.payButton, !cart.length && styles.disabled]}
          disabled={!cart.length}
          onPress={() => {
            setReceivedText((total / 100).toFixed(2));
            setPaying(true);
          }}
        >
          <Text style={styles.payText}>Cobrar</Text>
        </Pressable>
      </View>

      <Modal visible={isPaying} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalEyebrow}>Cobro seguro</Text>
            <Text style={styles.modalTotal}>{formatBsFromCentavos(total)}</Text>

            <View style={styles.methodRow}>
              {(['Efectivo', 'QR', 'Transferencia'] as PaymentMethod[]).map(nextMethod => (
                <Pressable
                  key={nextMethod}
                  style={[styles.methodButton, method === nextMethod && styles.methodButtonActive]}
                  onPress={() => setMethod(nextMethod)}
                >
                  <Text style={[styles.methodText, method === nextMethod && styles.methodTextActive]}>
                    {nextMethod}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              value={receivedText}
              onChangeText={setReceivedText}
              placeholder="Efectivo recibido"
              placeholderTextColor="rgba(255,255,255,0.38)"
              keyboardType="decimal-pad"
              style={styles.receivedInput}
            />

            <View style={styles.quickRow}>
              {quickAmounts.map(amount => (
                <Pressable
                  key={amount}
                  style={styles.quickButton}
                  onPress={() => setReceivedText((amount / 100).toFixed(2))}
                >
                  <Text style={styles.quickText}>{formatBsFromCentavos(amount)}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.changeBox}>
              <Text style={styles.changeLabel}>Vuelto</Text>
              <Text style={styles.changeValue}>{formatBsFromCentavos(change)}</Text>
            </View>

            {error && <Text style={styles.error}>{error}</Text>}

            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={() => setPaying(false)} disabled={isProcessing}>
                <Text style={styles.cancelText}>Cancelar</Text>
              </Pressable>
              <Pressable
                style={[styles.confirmButton, (received < total || isProcessing) && styles.disabled]}
                disabled={received < total || isProcessing}
                onPress={() => void confirmSale()}
              >
                <Text style={styles.confirmText}>{isProcessing ? 'Procesando...' : 'Finalizar'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isScannerOpen} animationType="fade" transparent>
        <View style={styles.scannerBackdrop}>
          <View style={styles.scannerCard}>
            <View style={styles.scannerHeader}>
              <View>
                <Text style={styles.modalEyebrow}>Escaneo</Text>
                <Text style={styles.scannerTitle}>Codigo de barras</Text>
              </View>
              <Pressable style={styles.scannerClose} onPress={() => setScannerOpen(false)}>
                <Text style={styles.cancelText}>Cerrar</Text>
              </Pressable>
            </View>
            <CameraView
              style={styles.camera}
              barcodeScannerSettings={{ barcodeTypes: [...barcodeTypes] }}
              onBarcodeScanned={handleBarcodeScanned}
            >
              <View style={styles.scanFrame} />
            </CameraView>
            <Text style={styles.scannerHint}>Apunta al SKU/codigo y se agregara al carrito si coincide.</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.night,
    padding: 16,
    paddingBottom: 102,
  },
  header: {
    borderRadius: 28,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 18,
  },
  backButton: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backText: {
    color: colors.surface,
    fontWeight: '900',
  },
  title: {
    marginTop: 12,
    color: colors.surface,
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.56)',
    fontWeight: '700',
  },
  success: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.surface,
    color: colors.ink,
    padding: 12,
    fontWeight: '900',
  },
  error: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.audiRed,
    color: colors.surface,
    padding: 12,
    fontWeight: '900',
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 14,
  },
  searchInput: {
    flex: 1,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    color: colors.surface,
    fontSize: 15,
    fontWeight: '800',
  },
  scanButton: {
    width: 78,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.audiRed,
  },
  scanText: {
    color: colors.surface,
    fontWeight: '900',
  },
  productStrip: {
    flexGrow: 0,
    marginTop: 14,
    maxHeight: 92,
  },
  customerBox: {
    marginTop: 14,
    borderRadius: 22,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
  },
  customerInput: {
    height: 48,
    borderRadius: 16,
    backgroundColor: colors.nightSoft,
    paddingHorizontal: 14,
    color: colors.surface,
    fontWeight: '800',
  },
  customerPills: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  customerPill: {
    maxWidth: 160,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  customerPillText: {
    color: colors.surface,
    fontSize: 12,
    fontWeight: '900',
  },
  customerSelected: {
    borderRadius: 18,
    backgroundColor: colors.audiRed,
    padding: 12,
  },
  customerName: {
    color: colors.surface,
    fontWeight: '900',
  },
  customerPhone: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.76)',
    fontWeight: '800',
  },
  productPill: {
    width: 190,
    marginRight: 10,
    borderRadius: 22,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    justifyContent: 'center',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  pillName: {
    color: colors.surface,
    fontWeight: '900',
  },
  pillPrice: {
    marginTop: 6,
    color: colors.audiRed,
    fontWeight: '900',
  },
  cartPanel: {
    flex: 1,
    marginTop: 14,
    borderRadius: 28,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
  },
  panelLabel: {
    color: 'rgba(255,255,255,0.52)',
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 10,
  },
  cartList: {
    gap: 10,
  },
  cartItem: {
    minHeight: 74,
    borderRadius: 22,
    backgroundColor: colors.nightSoft,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  cartText: {
    flex: 1,
  },
  cartName: {
    color: colors.surface,
    fontWeight: '900',
    fontSize: 15,
  },
  cartMeta: {
    marginTop: 5,
    color: 'rgba(255,255,255,0.55)',
    fontWeight: '800',
  },
  qtyControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  qtyButton: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  qtyButtonRed: {
    width: 48,
    height: 48,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.audiRed,
  },
  qtySymbol: {
    color: colors.surface,
    fontSize: 24,
    fontWeight: '900',
  },
  qtyValue: {
    minWidth: 24,
    textAlign: 'center',
    color: colors.surface,
    fontSize: 18,
    fontWeight: '900',
  },
  emptyCart: {
    padding: 24,
    textAlign: 'center',
    color: 'rgba(255,255,255,0.52)',
    fontWeight: '800',
  },
  footer: {
    marginTop: 12,
    borderRadius: 26,
    backgroundColor: colors.surface,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  totalLabel: {
    color: colors.muted,
    fontWeight: '800',
  },
  totalValue: {
    color: colors.ink,
    fontSize: 25,
    fontWeight: '900',
  },
  payButton: {
    minWidth: 132,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.audiRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payText: {
    color: colors.surface,
    fontWeight: '900',
    fontSize: 17,
  },
  disabled: {
    opacity: 0.5,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.58)',
  },
  modalCard: {
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    backgroundColor: colors.nightPanel,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  modalEyebrow: {
    color: colors.audiRed,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  modalTotal: {
    marginTop: 8,
    color: colors.surface,
    fontSize: 38,
    fontWeight: '900',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  methodButton: {
    flex: 1,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.nightSoft,
  },
  methodButtonActive: {
    backgroundColor: colors.audiRed,
  },
  methodText: {
    color: 'rgba(255,255,255,0.70)',
    fontWeight: '900',
    fontSize: 12,
  },
  methodTextActive: {
    color: colors.surface,
  },
  receivedInput: {
    marginTop: 14,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.nightSoft,
    color: colors.surface,
    paddingHorizontal: 16,
    fontSize: 18,
    fontWeight: '900',
  },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  quickButton: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickText: {
    color: colors.surface,
    fontWeight: '900',
  },
  changeBox: {
    marginTop: 14,
    borderRadius: 22,
    backgroundColor: colors.surface,
    padding: 16,
  },
  changeLabel: {
    color: colors.muted,
    fontWeight: '900',
  },
  changeValue: {
    marginTop: 4,
    color: colors.ink,
    fontSize: 34,
    fontWeight: '900',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  cancelButton: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.nightSoft,
  },
  cancelText: {
    color: colors.surface,
    fontWeight: '900',
  },
  confirmButton: {
    flex: 1.5,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.audiRed,
  },
  confirmText: {
    color: colors.surface,
    fontWeight: '900',
  },
  scannerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center',
    padding: 18,
  },
  scannerCard: {
    borderRadius: 28,
    overflow: 'hidden',
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
  },
  scannerHeader: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  scannerTitle: {
    marginTop: 4,
    color: colors.surface,
    fontSize: 24,
    fontWeight: '900',
  },
  scannerClose: {
    borderRadius: 16,
    backgroundColor: colors.nightSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  camera: {
    height: 320,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: '76%',
    height: 140,
    borderRadius: 24,
    borderWidth: 3,
    borderColor: colors.audiRed,
    backgroundColor: 'rgba(228,0,43,0.08)',
  },
  scannerHint: {
    padding: 16,
    color: 'rgba(255,255,255,0.62)',
    fontWeight: '800',
    textAlign: 'center',
  },
});
