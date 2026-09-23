import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect } from 'expo-router';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  Wallet01Icon,
  CoinsDollarIcon,
} from '@hugeicons/core-free-icons';
import { paymentsApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

interface PaymentItem {
  id: string;
  amount: number;
  currency: string;
  type: string;
  status: string;
  paymentMethod?: string;
  reference?: string;
  notes?: string;
  createdAt: string;
}

interface PaymentSummary {
  totalReceived: number;
  totalPaid: number;
  netBalance: number;
  count: number;
}

export default function PaymentsScreen() {
  const { t } = useI18n();
  const [transactions, setTransactions] = useState<PaymentItem[]>([]);
  const [summary, setSummary] = useState<PaymentSummary>({
    totalReceived: 0,
    totalPaid: 0,
    netBalance: 0,
    count: 0,
  });
  const [filter, setFilter] = useState<'all' | 'incoming' | 'outgoing'>('all');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await paymentsApi.mine();
      if (res?.data) {
        setTransactions(res.data.transactions || []);
        if (res.data.summary) {
          setSummary(res.data.summary);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const isIncoming = (item: PaymentItem) => {
    return (
      item.type === 'CROP_REVENUE' ||
      item.type === 'ESCROW_PAYOUT' ||
      item.type === 'INPUT_CREDIT'
    );
  };

  const filtered = transactions.filter((item) => {
    if (filter === 'incoming') return isIncoming(item);
    if (filter === 'outgoing') return !isIncoming(item);
    return true;
  });

  const formatTzs = (val: number) => {
    return 'TZS ' + Math.abs(val).toLocaleString('en-US');
  };

  const getStatusBadge = (status: string) => {
    const isCompleted = status === 'COMPLETED';
    const isPending = status === 'PENDING';
    const isFailed = status === 'FAILED' || status === 'CANCELLED';

    let bg = '#F3F4F6';
    let text = '#4B5563';

    if (isCompleted) {
      bg = '#D1FAE5';
      text = '#065F46';
    } else if (isPending) {
      bg = '#FEF3C7';
      text = '#92400E';
    } else if (isFailed) {
      bg = '#FEE2E2';
      text = '#991B1B';
    }

    return (
      <View style={[styles.badge, { backgroundColor: bg }]}>
        <Text style={[styles.badgeText, { color: text }]}>{status}</Text>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: t('paymentsHistory'),
          headerStyle: { backgroundColor: '#065F46' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '800' },
        }}
      />

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={load}
            tintColor="#10B981"
          />
        }
      >
        {/* Net Summary Card */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>{t('netTotal')}</Text>
          <Text
            style={[
              styles.summaryNet,
              summary.netBalance >= 0 ? styles.positiveText : styles.negativeText,
            ]}
          >
            {summary.netBalance >= 0 ? '+' : '-'}
            {formatTzs(summary.netBalance)}
          </Text>

          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>{t('incomingPayments')}</Text>
              <Text style={[styles.summaryVal, styles.positiveText]}>
                +{formatTzs(summary.totalReceived)}
              </Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={styles.summaryLabel}>{t('outgoingPayments')}</Text>
              <Text style={[styles.summaryVal, styles.negativeText]}>
                -{formatTzs(summary.totalPaid)}
              </Text>
            </View>
          </View>
        </View>

        {/* Filter chips */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.chip, filter === 'all' && styles.chipActive]}
            onPress={() => setFilter('all')}
          >
            <Text
              style={[
                styles.chipText,
                filter === 'all' && styles.chipTextActive,
              ]}
            >
              {t('allPayments')} ({transactions.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, filter === 'incoming' && styles.chipActive]}
            onPress={() => setFilter('incoming')}
          >
            <Text
              style={[
                styles.chipText,
                filter === 'incoming' && styles.chipTextActive,
              ]}
            >
              {t('incomingPayments')}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.chip, filter === 'outgoing' && styles.chipActive]}
            onPress={() => setFilter('outgoing')}
          >
            <Text
              style={[
                styles.chipText,
                filter === 'outgoing' && styles.chipTextActive,
              ]}
            >
              {t('outgoingPayments')}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Transaction list */}
        {loading && transactions.length === 0 ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#10B981" />
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <HugeiconsIcon icon={Wallet01Icon} size={40} color="#9CA3AF" />
            <Text style={styles.emptyTitle}>{t('noPaymentsYet')}</Text>
            <Text style={styles.emptySubtitle}>{t('paymentsSubtitle')}</Text>
          </View>
        ) : (
          filtered.map((item) => {
            const incoming = isIncoming(item);
            return (
              <View key={item.id} style={styles.txCard}>
                <View style={styles.txTopRow}>
                  <View style={styles.txHeaderLeft}>
                    <View
                      style={[
                        styles.iconCircle,
                        {
                          backgroundColor: incoming
                            ? 'rgba(16, 185, 129, 0.12)'
                            : 'rgba(239, 68, 68, 0.12)',
                        },
                      ]}
                    >
                      <HugeiconsIcon
                        icon={incoming ? CoinsDollarIcon : Wallet01Icon}
                        size={18}
                        color={incoming ? '#059669' : '#DC2626'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.txTitle}>
                        {item.type.replace(/_/g, ' ')}
                      </Text>
                      <Text style={styles.txDate}>
                        {new Date(item.createdAt).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric',
                        })}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.txHeaderRight}>
                    <Text
                      style={[
                        styles.txAmount,
                        incoming ? styles.positiveText : styles.negativeText,
                      ]}
                    >
                      {incoming ? '+' : '-'}
                      {formatTzs(item.amount)}
                    </Text>
                    {getStatusBadge(item.status)}
                  </View>
                </View>

                {(item.reference || item.paymentMethod || item.notes) && (
                  <View style={styles.txDetailsRow}>
                    {item.reference ? (
                      <Text style={styles.txSubtext}>
                        {t('paymentReference')}: {item.reference}
                      </Text>
                    ) : null}
                    {item.paymentMethod ? (
                      <Text style={styles.txSubtext}>
                        {item.paymentMethod.replace(/_/g, ' ')}
                      </Text>
                    ) : null}
                    {item.notes ? (
                      <Text style={styles.txNotes} numberOfLines={2}>
                        {item.notes}
                      </Text>
                    ) : null}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  center: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryCard: {
    backgroundColor: '#065F46',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
  },
  summaryTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#A7F3D0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  summaryNet: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    paddingTop: 12,
  },
  summaryCol: {
    flex: 1,
  },
  summaryDivider: {
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginHorizontal: 12,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#D1FAE5',
    marginBottom: 2,
  },
  summaryVal: {
    fontSize: 15,
    fontWeight: '700',
  },
  positiveText: {
    color: '#34D399',
  },
  negativeText: {
    color: '#FCA5A5',
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#E5E7EB',
  },
  chipActive: {
    backgroundColor: '#065F46',
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4B5563',
  },
  chipTextActive: {
    color: '#FFFFFF',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 12,
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 13,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 18,
  },
  txCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  txTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  txHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconCircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  txTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  txDate: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  txHeaderRight: {
    alignItems: 'flex-end',
    gap: 4,
  },
  txAmount: {
    fontSize: 15,
    fontWeight: '800',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  txDetailsRow: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  txSubtext: {
    fontSize: 11,
    color: '#6B7280',
    fontFamily: 'monospace',
  },
  txNotes: {
    fontSize: 12,
    color: '#4B5563',
    width: '100%',
    marginTop: 2,
  },
});
