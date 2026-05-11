import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { ProductPublic } from '@audidisc/shared';
import { filterProducts, formatBsFromCentavos, getStockStatus } from '@audidisc/shared';

import { useMobileAuth } from '@app/providers/MobileAuthProvider';
import { colors } from '@core/theme/colors';
import { fetchMobileInventory } from '@features/inventory/services/mobileInventoryService';

type Props = {
  onOpenPOS: () => void;
  onQuickSell: (product: ProductPublic) => void;
  onInventoryLoaded?: (products: ProductPublic[]) => void;
};

export default function MobileInventoryScreen({ onInventoryLoaded, onOpenPOS, onQuickSell }: Props) {
  const { idToken, logout, user } = useMobileAuth();
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [query, setQuery] = useState('');
  const [isRefreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadInventory = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const nextProducts = await fetchMobileInventory(idToken);
      setProducts(nextProducts);
      onInventoryLoaded?.(nextProducts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo actualizar stock');
    } finally {
      setRefreshing(false);
    }
  }, [idToken, onInventoryLoaded]);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const filteredProducts = useMemo(() => filterProducts(products, query), [products, query]);
  const criticalCount = products.filter(product => getStockStatus(product) !== 'healthy').length;

  const renderProduct = useCallback(
    ({ item }: { item: ProductPublic }) => {
      const status = getStockStatus(item);
      const isAlert = status === 'critical' || status === 'low';
      return (
        <Pressable
          style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
          onPress={() => onQuickSell(item)}
        >
          <View style={styles.cardTop}>
            <View style={styles.productText}>
              <Text numberOfLines={1} style={styles.productName}>{item.nombre}</Text>
              <Text numberOfLines={1} style={styles.productMeta}>
                {item.marca ?? 'Sin marca'} / {item.sku ?? item.categoria ?? 'Sin SKU'}
              </Text>
            </View>
            <View style={[styles.badge, isAlert ? styles.badgeRed : styles.badgeNeutral]}>
              <Text style={styles.badgeText}>{isAlert ? 'ALERTA' : 'OK'}</Text>
            </View>
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.stock}>Stock {item.cantidad}</Text>
            <Text style={styles.price}>{formatBsFromCentavos(item.precioVentaCentavos)}</Text>
          </View>
        </Pressable>
      );
    },
    [onQuickSell],
  );

  return (
    <FlatList
      data={filteredProducts}
      keyExtractor={item => item.id}
      renderItem={renderProduct}
      style={styles.screen}
      contentContainerStyle={styles.content}
      initialNumToRender={14}
      maxToRenderPerBatch={18}
      windowSize={9}
      removeClippedSubviews
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          tintColor={colors.audiRed}
          onRefresh={() => void loadInventory()}
        />
      }
      ListHeaderComponent={
        <View>
          <View style={styles.hero}>
            <View>
              <Text style={styles.eyebrow}>Audi Red Edition</Text>
              <Text style={styles.title}>Inventario</Text>
              <Text style={styles.subtitle}>
                {user?.role ?? 'Vendedor'} / stock sincronizado
              </Text>
            </View>
            <Pressable style={styles.logoutButton} onPress={() => void logout()}>
              <Text style={styles.logoutText}>Salir</Text>
            </Pressable>
          </View>

          <View style={styles.actionsRow}>
            <Pressable style={styles.posButton} onPress={onOpenPOS}>
              <Text style={styles.posText}>Abrir POS</Text>
            </Pressable>
            <View style={styles.alertCard}>
              <Text style={styles.alertLabel}>Alertas</Text>
              <Text style={styles.alertValue}>{criticalCount}</Text>
            </View>
          </View>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Escanear o buscar nombre, marca, SKU"
            placeholderTextColor="rgba(255,255,255,0.38)"
            style={styles.searchInput}
            autoCapitalize="none"
          />

          {error && <Text style={styles.error}>{error}</Text>}
          <Text style={styles.count}>{filteredProducts.length} productos</Text>
        </View>
      }
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Sin productos para mostrar.</Text>
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.night,
  },
  content: {
    padding: 16,
    paddingBottom: 112,
  },
  hero: {
    minHeight: 148,
    borderRadius: 30,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 22,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    color: colors.audiRed,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 8,
    color: colors.surface,
    fontSize: 38,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.58)',
    fontSize: 14,
    fontWeight: '700',
  },
  logoutButton: {
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  logoutText: {
    color: colors.surface,
    fontWeight: '900',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  posButton: {
    flex: 1.7,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.audiRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  posText: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '900',
  },
  alertCard: {
    flex: 1,
    height: 64,
    borderRadius: 22,
    backgroundColor: colors.nightPanel,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  alertLabel: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 12,
    fontWeight: '800',
  },
  alertValue: {
    marginTop: 2,
    color: colors.surface,
    fontSize: 24,
    fontWeight: '900',
  },
  searchInput: {
    marginTop: 14,
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
  error: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.audiRed,
    color: colors.surface,
    padding: 12,
    fontWeight: '900',
  },
  count: {
    marginTop: 16,
    marginBottom: 10,
    color: 'rgba(255,255,255,0.50)',
    fontWeight: '800',
  },
  separator: {
    height: 10,
  },
  card: {
    borderRadius: 24,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  cardPressed: {
    transform: [{ scale: 0.99 }],
    borderColor: colors.audiRed,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  productText: {
    flex: 1,
    minWidth: 0,
  },
  productName: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '900',
  },
  productMeta: {
    marginTop: 5,
    color: 'rgba(255,255,255,0.50)',
    fontSize: 13,
    fontWeight: '700',
  },
  badge: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeRed: {
    backgroundColor: colors.audiRed,
  },
  badgeNeutral: {
    backgroundColor: colors.nightSoft,
  },
  badgeText: {
    color: colors.surface,
    fontSize: 11,
    fontWeight: '900',
  },
  cardBottom: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  stock: {
    color: 'rgba(255,255,255,0.58)',
    fontSize: 14,
    fontWeight: '800',
  },
  price: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '900',
  },
  empty: {
    padding: 32,
  },
  emptyText: {
    textAlign: 'center',
    color: 'rgba(255,255,255,0.52)',
    fontWeight: '800',
  },
});
