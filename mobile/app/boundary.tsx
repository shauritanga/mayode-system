import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { HugeiconsIcon } from '@hugeicons/react-native';
import {
  Add01Icon, Delete02Icon, CheckmarkCircle02Icon, Cancel01Icon,
  PlayIcon, PauseIcon, Layers01Icon,
} from '@hugeicons/core-free-icons';
import { farmsApi, plotsApi } from '../src/lib/data';
import { ensureLocationPermission, getCurrentPoint } from '../src/services/location.service';
import { boundaryMapHtml } from '../src/lib/leaflet-boundary-html';
import { useI18n } from '../src/i18n';

type Mode = 'walk' | 'draw';
type Metrics = { pointCount: number; areaHa: number; areaAcres: number; perimeterM: number };

export default function BoundaryScreen() {
  const router = useRouter();
  const { t } = useI18n();
  const insets = useSafeAreaInsets();
  const { id, plotId, label } = useLocalSearchParams<{ id?: string; plotId?: string; label?: string }>();
  const target = plotId ? t('plot') : t('farm');

  const webRef = useRef<WebView>(null);
  const watchRef = useRef<Location.LocationSubscription | null>(null);
  const pausedRef = useRef(false);
  const loadedRef = useRef(false);
  const center = useRef<{ lat: number; lng: number } | null>(null);
  const existing = useRef<any>(null);

  const [mode, setMode] = useState<Mode>('walk');
  const [layer, setLayer] = useState<'satellite' | 'street'>('satellite');
  const [walking, setWalking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [metrics, setMetrics] = useState<Metrics>({ pointCount: 0, areaHa: 0, areaAcres: 0, perimeterM: 0 });
  const [saving, setSaving] = useState(false);

  const send = useCallback((msg: object) => {
    webRef.current?.injectJavaScript(`window.onRNMessage(${JSON.stringify(JSON.stringify(msg))}); true;`);
  }, []);
  const sendInit = useCallback(() => {
    send({ cmd: 'init', center: center.current, existing: existing.current, mode: 'walk' });
  }, [send]);

  useEffect(() => {
    (async () => {
      try {
        const res = plotId ? await plotsApi.getOne(plotId) : id ? await farmsApi.getOne(id) : null;
        const d: any = res?.data;
        if (d?.centerLatitude) center.current = { lat: d.centerLatitude, lng: d.centerLongitude };
        if (d?.boundaryCoordinates) existing.current = d.boundaryCoordinates;
      } catch {}
      if (!center.current) {
        try { const p = await getCurrentPoint(); center.current = { lat: p.latitude, lng: p.longitude }; } catch {}
      }
      if (loadedRef.current) sendInit();
    })();
    return () => { watchRef.current?.remove(); };
  }, [id, plotId, sendInit]);

  const onMessage = (e: { nativeEvent: { data: string } }) => {
    let m: any;
    try { m = JSON.parse(e.nativeEvent.data); } catch { return; }
    if (m.type === 'loaded') { loadedRef.current = true; sendInit(); }
    else if (m.type === 'metrics') setMetrics(m);
    else if (m.type === 'mode') setMode(m.mode);
    else if (m.type === 'result') handleResult(m);
  };

  // ---- Walk ----
  const startWalk = async () => {
    if (!(await ensureLocationPermission())) { Alert.alert(t('locationNeeded'), t('enableLocationBoundary')); return; }
    setWalking(true); setPaused(false); pausedRef.current = false;
    watchRef.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 2000 },
      (loc) => {
        setAccuracy(loc.coords.accuracy ?? null);
        if (!pausedRef.current) send({ cmd: 'addPoint', lat: loc.coords.latitude, lng: loc.coords.longitude, acc: loc.coords.accuracy });
      },
    );
  };
  const stopWalk = () => { watchRef.current?.remove(); watchRef.current = null; setWalking(false); };
  const togglePause = () => { const p = !pausedRef.current; pausedRef.current = p; setPaused(p); };
  const addManual = async () => {
    try { const p = await getCurrentPoint(); send({ cmd: 'addPoint', lat: p.latitude, lng: p.longitude }); }
    catch { Alert.alert(t('gpsError'), t('couldNotReadGps')); }
  };
  const undo = () => send({ cmd: 'undo' });
  const clearAll = () => Alert.alert(t('clearBoundary'), t('clearBoundaryQuestion'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('clear'), style: 'destructive', onPress: () => send({ cmd: 'clear' }) },
  ]);

  const switchMode = (m: Mode) => { setMode(m); if (m === 'draw') stopWalk(); send({ cmd: 'setMode', mode: m }); };
  const switchLayer = () => { const next = layer === 'satellite' ? 'street' : 'satellite'; setLayer(next); send({ cmd: 'setLayer', layer: next }); };
  const close = () => { stopWalk(); router.back(); };

  // ---- Save ----
  const save = () => { setSaving(true); send({ cmd: 'getResult' }); };
  const handleResult = async (d: any) => {
    if (!d.ok) { setSaving(false); Alert.alert(t('notEnoughPoints'), t('notEnoughPointsMessage')); return; }
    try {
      const payload = { boundaryCoordinates: d.geometry, centerLat: d.centerLat, centerLng: d.centerLng };
      if (plotId) { await plotsApi.updateBoundary(plotId, payload); await plotsApi.update(plotId, { sizeAcres: d.areaAcres }); }
      else if (id) { await farmsApi.updateBoundary(id, payload); await farmsApi.update(id, { actualAcres: d.areaAcres }); }
      stopWalk();
      Alert.alert(t('boundarySaved'), t('boundarySavedMessage', { areaHa: d.areaHa, areaAcres: d.areaAcres, perimeterM: d.perimeterM }), [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    } catch (e: any) {
      Alert.alert(t('boundarySaveFailed'), e?.response?.data?.message || e?.message || t('couldNotSaveBoundary'));
    } finally { setSaving(false); }
  };

  const acc = accuracy == null ? null : accuracy <= 10 ? { t: t('gpsHigh'), c: '#10B981' } : accuracy <= 30 ? { t: t('gpsMedium'), c: '#F59E0B' } : { t: t('gpsLow'), c: '#EF4444' };

  return (
    <View style={styles.container}>
      {/* Sheet header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <View style={styles.grabber} />
        <View style={styles.headerRow}>
          <Text style={styles.title}>{label || t('targetBoundary', { target })}</Text>
          <TouchableOpacity style={styles.closeBtn} onPress={close}>
            <HugeiconsIcon icon={Cancel01Icon} size={22} color="#fff" strokeWidth={2} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mapWrap}>
        <WebView
          ref={webRef}
          originWhitelist={['*']}
          source={{ html: boundaryMapHtml() }}
          onMessage={onMessage}
          javaScriptEnabled
          domStorageEnabled
          style={styles.map}
          {...(Platform.OS === 'android' ? { androidLayerType: 'hardware' as const } : {})}
        />

        {/* Map overlays */}
        <View style={styles.topBar} pointerEvents="box-none">
          <View style={styles.segment}>
            {(['walk', 'draw'] as Mode[]).map((m) => (
              <TouchableOpacity key={m} style={[styles.segBtn, mode === m && styles.segBtnActive]} onPress={() => switchMode(m)}>
                <Text style={[styles.segText, mode === m && styles.segTextActive]}>{m === 'walk' ? t('walk') : t('draw')}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.topRight}>
            {acc && (
              <View style={styles.accChip}>
                <View style={[styles.accDot, { backgroundColor: acc.c }]} />
                <Text style={styles.accText}>{acc.t}</Text>
              </View>
            )}
            <TouchableOpacity style={styles.layerBtn} onPress={switchLayer}>
              <HugeiconsIcon icon={Layers01Icon} size={20} color="#111827" strokeWidth={2} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Bottom panel */}
      <View style={[styles.panel, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.metricsRow}>
          <Metric label={t('area')} value={`${metrics.areaHa} ha`} sub={`${metrics.areaAcres} ac`} />
          <View style={styles.metricDivider} />
          <Metric label={t('perimeter')} value={`${metrics.perimeterM} m`} sub={`${metrics.pointCount} ${t('points')}`} />
        </View>

        {mode === 'walk' ? (
          !walking ? (
            <TouchableOpacity style={styles.primaryBtn} onPress={startWalk}>
              <HugeiconsIcon icon={PlayIcon} size={18} color="#fff" strokeWidth={2} />
              <Text style={styles.primaryText}>{t('startWalking')}</Text>
            </TouchableOpacity>
          ) : (
            <>
              <View style={styles.walkRow}>
                <SmallBtn icon={paused ? PlayIcon : PauseIcon} label={paused ? t('resume') : t('pause')} onPress={togglePause} />
                <SmallBtn icon={Add01Icon} label={t('addPoint')} onPress={addManual} />
                <SmallBtn icon={Delete02Icon} label={t('undo')} onPress={undo} tint="#EF4444" />
              </View>
              <TouchableOpacity style={styles.primaryBtn} onPress={save} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : (<><HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} color="#fff" strokeWidth={2} /><Text style={styles.primaryText}>{t('saveBoundary')}</Text></>)}
              </TouchableOpacity>
            </>
          )
        ) : (
          <>
            <Text style={styles.drawHint}>{t('drawBoundaryHint')}</Text>
            <View style={styles.walkRow}>
              <SmallBtn icon={Delete02Icon} label={t('clear')} onPress={clearAll} tint="#EF4444" />
            </View>
            <TouchableOpacity style={styles.primaryBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : (<><HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} color="#fff" strokeWidth={2} /><Text style={styles.primaryText}>{t('saveBoundary')}</Text></>)}
            </TouchableOpacity>
          </>
        )}
      </View>
    </View>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      <Text style={styles.metricSub}>{sub}</Text>
    </View>
  );
}
function SmallBtn({ icon, label, onPress, tint }: { icon: any; label: string; onPress: () => void; tint?: string }) {
  return (
    <TouchableOpacity style={styles.smallBtn} onPress={onPress}>
      <HugeiconsIcon icon={icon} size={18} color={tint || '#065F46'} strokeWidth={2} />
      <Text style={[styles.smallBtnText, tint ? { color: tint } : null]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0b1f17' },
  header: { backgroundColor: '#065F46', paddingHorizontal: 16, paddingBottom: 12 },
  grabber: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)', marginBottom: 10 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#fff', fontSize: 18, fontWeight: '800' },
  closeBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  mapWrap: { flex: 1 },
  map: { flex: 1 },
  topBar: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  segment: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 4, elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6 },
  segBtn: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 9 },
  segBtnActive: { backgroundColor: '#065F46' },
  segText: { fontWeight: '700', color: '#6B7280', fontSize: 14 },
  segTextActive: { color: '#fff' },
  topRight: { alignItems: 'flex-end', gap: 8 },
  accChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 6, paddingHorizontal: 10, elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6 },
  accDot: { width: 8, height: 8, borderRadius: 4 },
  accText: { fontSize: 12, fontWeight: '700', color: '#111827' },
  layerBtn: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6 },
  panel: { backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 10 },
  metricsRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  metric: { flex: 1, alignItems: 'center' },
  metricDivider: { width: 1, height: 36, backgroundColor: '#E5E7EB' },
  metricLabel: { fontSize: 12, color: '#6B7280' },
  metricValue: { fontSize: 22, fontWeight: '800', color: '#111827' },
  metricSub: { fontSize: 12, color: '#9CA3AF' },
  walkRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 12 },
  smallBtn: { alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12 },
  smallBtnText: { fontSize: 12, fontWeight: '700', color: '#065F46' },
  drawHint: { fontSize: 13, color: '#6B7280', textAlign: 'center', marginBottom: 12, lineHeight: 19 },
  primaryBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#10B981', paddingVertical: 15, borderRadius: 14 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
