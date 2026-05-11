import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { DimensionValue } from 'react-native';
import type { ReportsDashboard, WeeklyRevenuePoint } from '@audidisc/shared';
import { formatBsFromCentavos } from '@audidisc/shared';

import { useMobileAuth } from '@app/providers/MobileAuthProvider';
import { colors } from '@core/theme/colors';
import { fetchMobileReportsDashboard } from '@features/reports/services/mobileReportsService';

export default function MobileReportsScreen() {
  const { idToken, isAdmin, user } = useMobileAuth();
  const [dashboard, setDashboard] = useState<ReportsDashboard | null>(null);
  const [isRefreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    if (!isAdmin) {
      return;
    }
    setRefreshing(true);
    setError(null);
    try {
      setDashboard(await fetchMobileReportsDashboard(idToken));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar reportes');
    } finally {
      setRefreshing(false);
    }
  }, [idToken, isAdmin]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const maxTotal = useMemo(
    () => Math.max(1, ...(dashboard?.ingresosSemanales.map(point => point.totalCentavos) ?? [0])),
    [dashboard],
  );

  if (!isAdmin) {
    return (
      <View style={styles.screen}>
        <View style={styles.lockCard}>
          <Text style={styles.eyebrow}>RBAC activo</Text>
          <Text style={styles.title}>Reportes protegidos</Text>
          <Text style={styles.body}>
            {user?.role ?? 'Vendedor'} puede vender y consultar inventario. Las utilidades y cierres son solo para Administrador.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <FlatList
      data={dashboard?.ingresosSemanales ?? []}
      keyExtractor={item => item.fechaLocal}
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          tintColor={colors.audiRed}
          onRefresh={() => void loadReports()}
        />
      }
      ListHeaderComponent={
        <View>
          <View style={styles.hero}>
            <Text style={styles.eyebrow}>Reportes</Text>
            <Text style={styles.title}>Ventas y utilidad</Text>
            <Text style={styles.body}>Resumen movil para cierre rapido de caja.</Text>
          </View>

          {isRefreshing && !dashboard ? <ActivityIndicator style={styles.loader} color={colors.audiRed} /> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {dashboard ? (
            <View style={styles.kpiGrid}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Ventas hoy</Text>
                <Text style={styles.kpiValue}>{formatBsFromCentavos(dashboard.ventasHoy.totalCentavos)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Utilidad</Text>
                <Text style={styles.kpiValue}>{formatBsFromCentavos(dashboard.ventasHoy.utilidadCentavos ?? 0)}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Tickets</Text>
                <Text style={styles.kpiValue}>{dashboard.ventasHoy.cantidadVentas}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Alertas</Text>
                <Text style={styles.kpiValue}>{dashboard.stockBajo.length}</Text>
              </View>
            </View>
          ) : null}

          <Text style={styles.sectionTitle}>Semana comercial</Text>
        </View>
      }
      renderItem={({ item }: { item: WeeklyRevenuePoint }) => {
        const widthPercent: DimensionValue = `${Math.max(8, Math.round((item.totalCentavos / maxTotal) * 100))}%`;
        return (
          <View style={styles.weekRow}>
            <Text style={styles.weekDay}>{item.fechaLocal.slice(5)}</Text>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: widthPercent }]} />
            </View>
            <Text style={styles.weekTotal}>{formatBsFromCentavos(item.totalCentavos)}</Text>
          </View>
        );
      }}
      ListFooterComponent={
        <Pressable style={styles.refreshButton} onPress={() => void loadReports()}>
          <Text style={styles.refreshText}>Actualizar reportes</Text>
        </Pressable>
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
    borderRadius: 30,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 22,
  },
  lockCard: {
    margin: 16,
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
    fontSize: 34,
    fontWeight: '900',
  },
  body: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.60)',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 21,
  },
  loader: {
    marginTop: 18,
  },
  error: {
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: colors.audiRed,
    color: colors.surface,
    padding: 12,
    fontWeight: '900',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  kpiCard: {
    width: '48%',
    minHeight: 94,
    borderRadius: 24,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 16,
    justifyContent: 'center',
  },
  kpiLabel: {
    color: 'rgba(255,255,255,0.54)',
    fontWeight: '800',
  },
  kpiValue: {
    marginTop: 8,
    color: colors.surface,
    fontSize: 20,
    fontWeight: '900',
  },
  sectionTitle: {
    marginTop: 20,
    marginBottom: 10,
    color: colors.surface,
    fontSize: 17,
    fontWeight: '900',
  },
  weekRow: {
    minHeight: 64,
    borderRadius: 20,
    backgroundColor: colors.nightPanel,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  weekDay: {
    width: 46,
    color: 'rgba(255,255,255,0.58)',
    fontWeight: '900',
  },
  barTrack: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    overflow: 'hidden',
    backgroundColor: colors.nightSoft,
  },
  barFill: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.audiRed,
  },
  weekTotal: {
    minWidth: 82,
    textAlign: 'right',
    color: colors.surface,
    fontWeight: '900',
  },
  refreshButton: {
    height: 56,
    borderRadius: 20,
    backgroundColor: colors.audiRed,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  refreshText: {
    color: colors.surface,
    fontWeight: '900',
  },
});
