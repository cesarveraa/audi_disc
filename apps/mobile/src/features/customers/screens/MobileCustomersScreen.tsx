import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import type { Customer, CustomerSalesHistory } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { useMobileAuth } from '@app/providers/MobileAuthProvider';
import { colors } from '@core/theme/colors';
import {
  createMobileCustomer,
  fetchMobileCustomers,
  fetchMobileCustomerSales,
} from '@features/customers/services/mobileCustomersService';

type Props = {
  onSelectForSale?: (customer: Customer) => void;
};

export default function MobileCustomersScreen({ onSelectForSale }: Props) {
  const { idToken } = useMobileAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [history, setHistory] = useState<CustomerSalesHistory | null>(null);
  const [query, setQuery] = useState('');
  const [nombre, setNombre] = useState('');
  const [telefono, setTelefono] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCustomers = useCallback(async () => {
    setError(null);
    try {
      setCustomers(await fetchMobileCustomers(idToken, query));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar clientes');
    }
  }, [idToken, query]);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    if (!selectedCustomer) {
      setHistory(null);
      return;
    }
    let mounted = true;
    fetchMobileCustomerSales({ idToken, customerId: selectedCustomer.id })
      .then(nextHistory => {
        if (mounted) {
          setHistory(nextHistory);
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [idToken, selectedCustomer]);

  const totalCrm = useMemo(
    () => customers.reduce((sum, customer) => sum + customer.totalCompradoCentavos, 0),
    [customers],
  );

  async function handleCreate() {
    if (!nombre.trim() || !telefono.trim()) {
      setError('Nombre y telefono son requeridos.');
      return;
    }
    try {
      const customer = await createMobileCustomer({
        idToken,
        payload: { nombre: nombre.trim(), telefono: telefono.trim() },
      });
      setCustomers(current => [customer, ...current]);
      setSelectedCustomer(customer);
      setNombre('');
      setTelefono('');
      setMessage('Cliente registrado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar cliente');
    }
  }

  return (
    <FlatList
      data={customers}
      keyExtractor={item => item.id}
      style={styles.screen}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>CRM Premium</Text>
            <Text style={styles.title}>Clientes</Text>
            <Text style={styles.subtitle}>{customers.length} activos / {formatBsFromCentavos(totalCrm)}</Text>
          </View>

          {message && <Text style={styles.success}>{message}</Text>}
          {error && <Text style={styles.error}>{error}</Text>}

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Buscar nombre o telefono"
            placeholderTextColor="rgba(255,255,255,0.38)"
            style={styles.input}
          />

          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Registro rapido</Text>
            <TextInput value={nombre} onChangeText={setNombre} placeholder="Nombre" placeholderTextColor="rgba(255,255,255,0.38)" style={styles.formInput} />
            <TextInput value={telefono} onChangeText={setTelefono} placeholder="Telefono" placeholderTextColor="rgba(255,255,255,0.38)" keyboardType="phone-pad" style={styles.formInput} />
            <Pressable style={styles.createButton} onPress={() => void handleCreate()}>
              <Text style={styles.createText}>Guardar cliente</Text>
            </Pressable>
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.card, selectedCustomer?.id === item.id && styles.cardActive, pressed && styles.pressed]}
          onPress={() => setSelectedCustomer(item)}
        >
          <View style={styles.cardTop}>
            <View style={styles.customerText}>
              <Text numberOfLines={1} style={styles.customerName}>{item.nombre}</Text>
              <Text style={styles.customerPhone}>{item.telefono}</Text>
            </View>
            <Text style={styles.badge}>{item.comprasCount}</Text>
          </View>
          <View style={styles.cardBottom}>
            <Text style={styles.muted}>Total</Text>
            <Text style={styles.total}>{formatBsFromCentavos(item.totalCompradoCentavos)}</Text>
          </View>
          {selectedCustomer?.id === item.id && (
            <View style={styles.historyBox}>
              <Text style={styles.historyTitle}>Historial reciente</Text>
              {(history?.ventas ?? []).slice(0, 3).map(sale => (
                <Text key={sale.id} numberOfLines={1} style={styles.historyLine}>
                  {sale.fechaLocal} / {formatBsFromCentavos(sale.totalCentavos)}
                </Text>
              ))}
              {onSelectForSale && (
                <Pressable style={styles.assignButton} onPress={() => onSelectForSale(item)}>
                  <Text style={styles.assignText}>Asignar a venta</Text>
                </Pressable>
              )}
            </View>
          )}
        </Pressable>
      )}
      ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
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
    borderRadius: 30,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 22,
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
    fontWeight: '800',
  },
  input: {
    marginTop: 14,
    height: 58,
    borderRadius: 20,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 16,
    color: colors.surface,
    fontWeight: '800',
  },
  formCard: {
    marginTop: 14,
    borderRadius: 24,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 14,
    gap: 10,
  },
  formTitle: {
    color: colors.surface,
    fontWeight: '900',
  },
  formInput: {
    height: 50,
    borderRadius: 18,
    backgroundColor: colors.nightSoft,
    paddingHorizontal: 14,
    color: colors.surface,
    fontWeight: '800',
  },
  createButton: {
    height: 52,
    borderRadius: 18,
    backgroundColor: colors.audiRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createText: {
    color: colors.surface,
    fontWeight: '900',
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
  card: {
    borderRadius: 24,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
  },
  cardActive: {
    borderColor: colors.audiRed,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  customerText: {
    flex: 1,
  },
  customerName: {
    color: colors.surface,
    fontSize: 17,
    fontWeight: '900',
  },
  customerPhone: {
    marginTop: 5,
    color: 'rgba(255,255,255,0.52)',
    fontWeight: '800',
  },
  badge: {
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: colors.audiRed,
    color: colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontWeight: '900',
  },
  cardBottom: {
    marginTop: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  muted: {
    color: 'rgba(255,255,255,0.52)',
    fontWeight: '800',
  },
  total: {
    color: colors.surface,
    fontWeight: '900',
  },
  historyBox: {
    marginTop: 14,
    borderRadius: 20,
    backgroundColor: colors.nightSoft,
    padding: 12,
  },
  historyTitle: {
    color: colors.surface,
    fontWeight: '900',
  },
  historyLine: {
    marginTop: 6,
    color: 'rgba(255,255,255,0.58)',
    fontWeight: '800',
  },
  assignButton: {
    marginTop: 10,
    height: 46,
    borderRadius: 16,
    backgroundColor: colors.audiRed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  assignText: {
    color: colors.surface,
    fontWeight: '900',
  },
});
