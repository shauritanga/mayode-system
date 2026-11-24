import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Alert, ActivityIndicator, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { farmSalesApi, plotTransfersApi } from '../src/lib/data';
import { useI18n } from '../src/i18n';

type Listing = {
  id: string; status: string; askingPrice: number; description?: string | null; feePaidBy: 'SELLER' | 'BUYER'; feeAmount: number;
  mine: boolean; farmId: string; areaHectares: number; village?: string | null; detailsLocked: boolean;
  block?: string; canal?: string; seller?: { name: string; phone?: string | null; memberNumber: string };
};
type Held = { hectare: { id: string; code: string; area: number } };

const apiMessage = (e: any) => {
  const msg = e?.response?.data?.message;
  return Array.isArray(msg) ? msg.join('\n') : msg || String(e?.message ?? e);
};
const money = (n: number) => Math.round(n).toLocaleString('en-US');

/** Farms the members of the AMCOS have put up for sale, and the member's own listings. */
export default function FarmsForSale() {
  const { t } = useI18n();
  const router = useRouter();
  const [tab, setTab] = useState<'all' | 'mine'>('all');
  const [items, setItems] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Listing[]>([]);
  const [held, setHeld] = useState<Held[]>([]);
  const [fee, setFee] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selling, setSelling] = useState(false);
  const [hectareId, setHectareId] = useState('');
  const [price, setPrice] = useState('');
  const [note, setNote] = useState('');
  const [feeBy, setFeeBy] = useState<'SELLER' | 'BUYER'>('SELLER');

  const load = useCallback(async (pull = false) => {
    pull ? setRefreshing(true) : setLoading(true);
    try {
      const [all, my, plots, f] = await Promise.all([farmSalesApi.list(), farmSalesApi.mine(), plotTransfersApi.myPlots(), farmSalesApi.fee()]);
      setItems(all.data ?? []); setHeld(plots.data?.held ?? []); setFee(f.data?.amount ?? 0);
      // a fee paid on the phone is picked up here (the server re-checks it with the payment provider)
      const pending: Listing[] = (my.data ?? []).filter((l: Listing) => l.status === 'PENDING_FEE');
      if (pending.length) {
        await Promise.all(pending.map((l) => farmSalesApi.reconcile(l.id).catch(() => undefined)));
        setMine((await farmSalesApi.mine()).data ?? []);
      } else setMine(my.data ?? []);
    } catch (e: any) {
      Alert.alert(t('farmsForSale'), apiMessage(e));
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [t]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const buy = (l: Listing) => {
    const feeNote = l.feePaidBy === 'BUYER' ? `\n\n${t('farmSaleBuyerPays', { amount: money(l.feeAmount) })}` : '';
    Alert.alert(t('farmsForSale'), t('farmSaleBuyConfirm', { farm: l.farmId }) + feeNote, [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('farmSaleBuy'),
        onPress: async () => {
          setBusyId(l.id);
          try {
            const res = await farmSalesApi.buy(l.id);
            Alert.alert(t('farmsForSale'), res.data?.payment ? t('farmSalePayStarted') : t('farmSaleRequested'));
          } catch (e: any) { Alert.alert(t('farmsForSale'), apiMessage(e)); } finally { setBusyId(null); await load(); }
        },
      },
    ]);
  };

  const submit = async () => {
    const asking = Number(price.replace(/[^\d.]/g, ''));
    if (!hectareId || !asking) { Alert.alert(t('farmsForSale'), t('farmSaleChoose')); return; }
    setBusyId('new');
    try {
      const res = await farmSalesApi.create({ hectareId, askingPrice: asking, description: note.trim() || undefined, feePaidBy: feeBy });
      setSelling(false); setHectareId(''); setPrice(''); setNote(''); setTab('mine');
      Alert.alert(t('farmsForSale'), res.data?.payment ? t('farmSalePayStarted') : t('farmSaleListed'));
    } catch (e: any) { Alert.alert(t('farmsForSale'), apiMessage(e)); } finally { setBusyId(null); await load(); }
  };

  const payFee = async (l: Listing) => {
    setBusyId(l.id);
    try { await farmSalesApi.payFee(l.id); Alert.alert(t('farmsForSale'), t('farmSalePayStarted')); }
    catch (e: any) { Alert.alert(t('farmsForSale'), apiMessage(e)); } finally { setBusyId(null); }
  };
  const withdraw = async (l: Listing) => {
    setBusyId(l.id);
    try { await farmSalesApi.withdraw(l.id); } catch (e: any) { Alert.alert(t('farmsForSale'), apiMessage(e)); } finally { setBusyId(null); await load(); }
  };

  const card = (l: Listing, own: boolean) => (
    <View key={l.id} style={styles.card}>
      <View style={styles.rowBetween}>
        <Text style={styles.code}>{l.farmId}</Text>
        <Text style={styles.price}>TZS {money(l.askingPrice)}</Text>
      </View>
      <Text style={styles.line}>{t('farmSaleSize', { area: l.areaHectares, village: l.village ?? '—' })}</Text>
      {!!l.description && <Text style={styles.line}>{l.description}</Text>}
      {l.detailsLocked ? (
        <View style={styles.locked}>
          <Text style={styles.lockedText}>{t('farmSaleLocked')}</Text>
          <TouchableOpacity onPress={() => router.push('/membership')}><Text style={styles.link}>{t('farmSaleGoPremium')}</Text></TouchableOpacity>
        </View>
      ) : (
        !!l.seller && !own && (
          <>
            <Text style={styles.line}>{t('farmSaleSeller', { name: l.seller.name, phone: l.seller.phone ?? '—' })}</Text>
            <Text style={styles.line}>{l.canal} · {l.block}</Text>
          </>
        )
      )}
      {own ? (
        <>
          {l.status === 'PENDING_FEE' && <Text style={styles.warn}>{t('farmSalePendingFee')} · TZS {money(l.feeAmount)}</Text>}
          <View style={styles.row}>
            {l.status === 'PENDING_FEE' && (
              <TouchableOpacity style={[styles.btn, styles.btnPrimary]} disabled={busyId === l.id} onPress={() => payFee(l)}>
                <Text style={styles.btnText}>{busyId === l.id ? '…' : t('farmSalePayFee')}</Text>
              </TouchableOpacity>
            )}
            {(l.status === 'PENDING_FEE' || l.status === 'OPEN') && (
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} disabled={busyId === l.id} onPress={() => withdraw(l)}>
                <Text style={styles.btnGhostText}>{t('farmSaleWithdraw')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </>
      ) : (
        <TouchableOpacity style={[styles.btn, styles.btnPrimary, { marginTop: 14 }, busyId === l.id && { opacity: 0.6 }]} disabled={busyId === l.id} onPress={() => buy(l)}>
          <Text style={styles.btnText}>{busyId === l.id ? '…' : t('farmSaleBuy')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('farmsForSale') }} />
      <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}>
        <Text style={styles.intro}>{t('farmSaleIntro')}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={[styles.tab, tab === 'all' && styles.tabOn]} onPress={() => setTab('all')}><Text style={[styles.tabText, tab === 'all' && styles.tabTextOn]}>{t('farmsForSale')}</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.tab, tab === 'mine' && styles.tabOn]} onPress={() => setTab('mine')}><Text style={[styles.tabText, tab === 'mine' && styles.tabTextOn]}>{t('farmSaleMine')}</Text></TouchableOpacity>
        </View>

        {tab === 'mine' && !selling && held.length > 0 && (
          <TouchableOpacity style={[styles.btn, styles.btnPrimary, { marginTop: 14 }]} onPress={() => setSelling(true)}><Text style={styles.btnText}>{t('farmSaleSell')}</Text></TouchableOpacity>
        )}
        {tab === 'mine' && selling && (
          <View style={styles.card}>
            <Text style={styles.label}>{t('farmSaleChoose')}</Text>
            <View style={styles.chips}>
              {held.map((h) => (
                <TouchableOpacity key={h.hectare.id} style={[styles.chip, hectareId === h.hectare.id && styles.chipOn]} onPress={() => setHectareId(h.hectare.id)}>
                  <Text style={[styles.chipText, hectareId === h.hectare.id && styles.chipTextOn]}>{h.hectare.code}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>{t('farmSalePrice')}</Text>
            <TextInput style={styles.input} value={price} onChangeText={setPrice} keyboardType="numeric" placeholderTextColor="#9CA3AF" />
            <Text style={styles.label}>{t('farmSaleNote')}</Text>
            <TextInput style={[styles.input, { minHeight: 70, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} multiline placeholderTextColor="#9CA3AF" />
            <Text style={styles.label}>{t('farmSaleFeeWho', { amount: money(fee) })}</Text>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.tab, feeBy === 'SELLER' && styles.tabOn]} onPress={() => setFeeBy('SELLER')}><Text style={[styles.tabText, feeBy === 'SELLER' && styles.tabTextOn]}>{t('farmSaleFeeSeller')}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.tab, feeBy === 'BUYER' && styles.tabOn]} onPress={() => setFeeBy('BUYER')}><Text style={[styles.tabText, feeBy === 'BUYER' && styles.tabTextOn]}>{t('farmSaleFeeBuyerOpt')}</Text></TouchableOpacity>
            </View>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => setSelling(false)}><Text style={styles.btnGhostText}>{t('cancel')}</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnPrimary, busyId === 'new' && { opacity: 0.6 }]} disabled={busyId === 'new'} onPress={submit}><Text style={styles.btnText}>{busyId === 'new' ? '…' : t('farmSaleList')}</Text></TouchableOpacity>
            </View>
          </View>
        )}

        {loading ? <ActivityIndicator color="#10B981" style={{ marginTop: 30 }} />
          : (tab === 'all' ? items : mine).length === 0 ? <Text style={styles.empty}>{t('farmSaleNone')}</Text>
          : (tab === 'all' ? items.filter((l) => !l.mine) : mine).map((l) => card(l, tab === 'mine'))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  intro: { fontSize: 13, color: '#6B7280', marginBottom: 14 },
  empty: { textAlign: 'center', color: '#6B7280', marginTop: 40, fontSize: 14 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginTop: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  code: { fontSize: 18, fontWeight: '900', color: '#10B981' },
  price: { fontSize: 15, fontWeight: '800', color: '#065F46' },
  line: { fontSize: 13, color: '#374151', marginTop: 4 },
  warn: { fontSize: 13, color: '#B45309', fontWeight: '700', marginTop: 8 },
  locked: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 12, marginTop: 10, borderWidth: 1, borderColor: '#E5E7EB' },
  lockedText: { fontSize: 13, color: '#6B7280' },
  link: { color: '#065F46', fontWeight: '800', marginTop: 8, fontSize: 14 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 14, marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827' },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  tab: { flex: 1, paddingVertical: 11, borderRadius: 12, alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB' },
  tabOn: { backgroundColor: '#065F46', borderColor: '#065F46' },
  tabText: { fontWeight: '700', color: '#374151', fontSize: 13 },
  tabTextOn: { color: '#fff' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 999, backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  chipOn: { backgroundColor: '#065F46', borderColor: '#065F46' },
  chipText: { fontWeight: '700', color: '#374151' },
  chipTextOn: { color: '#fff' },
  btn: { flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center' },
  btnPrimary: { backgroundColor: '#065F46' },
  btnGhost: { backgroundColor: '#F9FAFB', borderWidth: 1, borderColor: '#E5E7EB' },
  btnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  btnGhostText: { color: '#374151', fontWeight: '700', fontSize: 14 },
});
