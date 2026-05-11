import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ProductPublic } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { useMobileAuth } from '@app/providers/MobileAuthProvider';
import { colors } from '@core/theme/colors';
import { updateMobileProduct } from '@features/inventory/services/mobileInventoryService';

type Props = {
  product: ProductPublic | null;
  onBack: () => void;
  onSaved: () => void;
};

export default function MobileProductEditScreen({ onBack, onSaved, product }: Props) {
  const { idToken, isAdmin } = useMobileAuth();
  const [cantidad, setCantidad] = useState(String(product?.cantidad ?? 0));
  const [stockMinimo, setStockMinimo] = useState(String(product?.stockMinimo ?? 0));
  const [precioVenta, setPrecioVenta] = useState(String(((product?.precioVentaCentavos ?? 0) / 100).toFixed(2)));
  const [isSaving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!product) {
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateMobileProduct({
        idToken,
        productId: product.id,
        payload: {
          cantidad: Math.max(0, Number.parseInt(cantidad || '0', 10)),
          stockMinimo: Math.max(0, Number.parseInt(stockMinimo || '0', 10)),
          precioVentaCentavos: Math.max(1, Math.round(Number(precioVenta || 0) * 100)),
        },
      });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar');
    } finally {
      setSaving(false);
    }
  }

  if (!product) {
    return (
      <View style={styles.screen}>
        <Text style={styles.title}>Producto no encontrado</Text>
        <Pressable style={styles.secondaryButton} onPress={onBack}>
          <Text style={styles.secondaryText}>Volver</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Stock bajo</Text>
        <Text style={styles.title}>Editar producto</Text>
        <Text style={styles.subtitle}>{product.nombre}</Text>
        <Text style={styles.price}>{formatBsFromCentavos(product.precioVentaCentavos)}</Text>

        {!isAdmin && (
          <Text style={styles.error}>Solo Administradores pueden editar inventario y precios.</Text>
        )}
        {error && <Text style={styles.error}>{error}</Text>}

        <Text style={styles.label}>Cantidad</Text>
        <TextInput value={cantidad} onChangeText={setCantidad} keyboardType="number-pad" editable={isAdmin} style={styles.input} />
        <Text style={styles.label}>Stock minimo</Text>
        <TextInput value={stockMinimo} onChangeText={setStockMinimo} keyboardType="number-pad" editable={isAdmin} style={styles.input} />
        <Text style={styles.label}>Precio venta</Text>
        <TextInput value={precioVenta} onChangeText={setPrecioVenta} keyboardType="decimal-pad" editable={isAdmin} style={styles.input} />

        <View style={styles.actions}>
          <Pressable style={styles.secondaryButton} onPress={onBack} disabled={isSaving}>
            <Text style={styles.secondaryText}>Volver</Text>
          </Pressable>
          <Pressable style={[styles.primaryButton, (!isAdmin || isSaving) && styles.disabled]} onPress={() => void save()} disabled={!isAdmin || isSaving}>
            <Text style={styles.primaryText}>{isSaving ? 'Guardando...' : 'Guardar'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.night,
    padding: 16,
    paddingBottom: 112,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 30,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 20,
  },
  eyebrow: {
    color: colors.audiRed,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 8,
    color: colors.surface,
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.62)',
    fontWeight: '800',
  },
  price: {
    marginTop: 10,
    color: colors.surface,
    fontSize: 22,
    fontWeight: '900',
  },
  label: {
    marginTop: 14,
    marginBottom: 6,
    color: 'rgba(255,255,255,0.58)',
    fontWeight: '900',
  },
  input: {
    height: 54,
    borderRadius: 18,
    backgroundColor: colors.nightSoft,
    color: colors.surface,
    paddingHorizontal: 14,
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
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  secondaryButton: {
    flex: 1,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.nightSoft,
  },
  secondaryText: {
    color: colors.surface,
    fontWeight: '900',
  },
  primaryButton: {
    flex: 1.3,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.audiRed,
  },
  primaryText: {
    color: colors.surface,
    fontWeight: '900',
  },
  disabled: {
    opacity: 0.5,
  },
});
