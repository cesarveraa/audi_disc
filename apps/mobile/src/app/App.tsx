import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Customer, ProductPublic } from '@audidisc/shared';

import { MobileAuthProvider, useMobileAuth } from '@app/providers/MobileAuthProvider';
import { colors } from '@core/theme/colors';
import { registerOperationalPushToken, subscribeToPushActions } from '@infra/notifications/pushNotifications';
import MobileLoginScreen from '@features/auth/screens/MobileLoginScreen';
import MobileCustomersScreen from '@features/customers/screens/MobileCustomersScreen';
import MobileProductEditScreen from '@features/inventory/screens/MobileProductEditScreen';
import MobileInventoryScreen from '@features/inventory/screens/MobileInventoryScreen';
import MobileReportsScreen from '@features/reports/screens/MobileReportsScreen';
import MobilePOSScreen from '@features/sales/screens/MobilePOSScreen';

type MobileView = 'inventory' | 'pos' | 'reports' | 'customers' | 'productEdit';

type TabItem = {
  key: MobileView;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const tabs: TabItem[] = [
  { key: 'inventory', label: 'Inventario', icon: 'package-variant-closed' },
  { key: 'pos', label: 'Ventas', icon: 'cart-outline' },
  { key: 'customers', label: 'Clientes', icon: 'account-group-outline' },
  { key: 'reports', label: 'Reportes', icon: 'chart-line' },
];

export default function App() {
  return (
    <MobileAuthProvider>
      <MobileAppContent />
    </MobileAuthProvider>
  );
}

function MobileAppContent() {
  const { idToken, isLoading, user } = useMobileAuth();
  const [view, setView] = useState<MobileView>('inventory');
  const [products, setProducts] = useState<ProductPublic[]>([]);
  const [initialPOSProduct, setInitialPOSProduct] = useState<ProductPublic | null>(null);
  const [initialPOSCustomer, setInitialPOSCustomer] = useState<Customer | null>(null);
  const [editProductId, setEditProductId] = useState<string | null>(null);

  useEffect(() => {
    if (!idToken || !user) {
      return undefined;
    }
    void registerOperationalPushToken(idToken);
    return subscribeToPushActions(action => {
      if (action.type === 'low_stock' && action.productId) {
        setEditProductId(action.productId);
        setView('productEdit');
      }
    });
  }, [idToken, user]);

  const content = useMemo(() => {
    if (view === 'productEdit') {
      const product = products.find(item => item.id === editProductId) ?? null;
      return (
        <MobileProductEditScreen
          product={product}
          onBack={() => setView('inventory')}
          onSaved={() => {
            setEditProductId(null);
            setView('inventory');
          }}
        />
      );
    }

    if (view === 'pos') {
      return (
        <MobilePOSScreen
          products={products}
          initialProduct={initialPOSProduct}
          initialCustomer={initialPOSCustomer}
          onBack={() => {
            setInitialPOSProduct(null);
            setInitialPOSCustomer(null);
            setView('inventory');
          }}
          onSaleCompleted={() => {
            setInitialPOSProduct(null);
            setInitialPOSCustomer(null);
            setView('inventory');
          }}
        />
      );
    }

    if (view === 'customers') {
      return (
        <MobileCustomersScreen
          onSelectForSale={customer => {
            setInitialPOSCustomer(customer);
            setView('pos');
          }}
        />
      );
    }

    if (view === 'reports') {
      return <MobileReportsScreen />;
    }

    return (
      <MobileInventoryScreen
        onInventoryLoaded={setProducts}
        onOpenPOS={() => {
          setInitialPOSProduct(null);
          setInitialPOSCustomer(null);
          setView('pos');
        }}
        onQuickSell={product => {
          setInitialPOSProduct(product);
          setView('pos');
        }}
      />
    );
  }, [editProductId, initialPOSCustomer, initialPOSProduct, products, view]);

  if (isLoading) {
    return (
      <SafeAreaView style={styles.loadingScreen}>
        <ActivityIndicator color={colors.audiRed} size="large" />
        <Text style={styles.loadingText}>Validando sesion...</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return <MobileLoginScreen />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>{content}</View>
      <View style={styles.tabShell}>
        <View style={styles.tabBar}>
          {tabs.map(tab => {
            const isActive = tab.key === view;
            return (
              <Pressable
                key={tab.key}
                style={({ pressed }) => [styles.tabButton, pressed && styles.tabPressed]}
                onPress={() => {
                  if (tab.key !== 'pos') {
                    setInitialPOSProduct(null);
                    setInitialPOSCustomer(null);
                  }
                  setView(tab.key);
                }}
              >
                <MaterialCommunityIcons
                  name={tab.icon}
                  size={24}
                  color={isActive ? colors.surface : 'rgba(255,255,255,0.48)'}
                />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
                {isActive ? <View style={styles.activeDot} /> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.night,
  },
  content: {
    flex: 1,
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.night,
  },
  loadingText: {
    marginTop: 14,
    color: colors.surface,
    fontWeight: '900',
  },
  tabShell: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 12,
  },
  tabBar: {
    minHeight: 76,
    borderRadius: 28,
    backgroundColor: 'rgba(20,26,36,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
  },
  tabButton: {
    flex: 1,
    minHeight: 60,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabPressed: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    transform: [{ scale: 0.98 }],
  },
  tabText: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 11,
    fontWeight: '900',
  },
  tabTextActive: {
    color: colors.surface,
  },
  activeDot: {
    position: 'absolute',
    top: 8,
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.audiRed,
  },
});
