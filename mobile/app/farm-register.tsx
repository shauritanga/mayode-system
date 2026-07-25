import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, Switch,
  Alert, ActivityIndicator, KeyboardAvoidingView, Keyboard, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import { farmsApi, mamcosApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { SearchableSelect } from '../src/components/SearchableSelect';
import { useI18n } from '../src/i18n';

type FarmGrade = 'A' | 'B' | 'C';
type FarmOwnership = 'OWNED' | 'RENTED';
interface MamcosOption { id: string; name: string; }

export default function RegisterFarmScreen() {
  const router = useRouter();
  const { farmerId } = useAuthStore();
  const { t } = useI18n();
  const scrollRef = useRef<ScrollView>(null);

  const [mamcosList, setMamcosList] = useState<MamcosOption[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const [farmName, setFarmName] = useState('');
  const [plotNumber, setPlotNumber] = useState('');
  const [blockNumber, setBlockNumber] = useState('');
  const [section, setSection] = useState('');
  const [village, setVillage] = useState('');
  const [ward, setWard] = useState('');
  const [district, setDistrict] = useState('Mbarali');
  const [region, setRegion] = useState('Mbeya');
  const [mamcosId, setMamcosId] = useState('');
  const [soilCondition, setSoilCondition] = useState('');
  const [ownershipType, setOwnershipType] = useState<FarmOwnership>('OWNED');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [socialHectares, setSocialHectares] = useState('');
  const [actualAcres, setActualAcres] = useState('');
  const [grade, setGrade] = useState<FarmGrade>('B');
  const [vichuguuCount, setVichuguuCount] = useState(0);
  const [hasIrrigation, setHasIrrigation] = useState(false);
  const [nearRoad, setNearRoad] = useState(false);

  useEffect(() => {
    mamcosApi.getAll().then((res) => setMamcosList(res.data?.data || res.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  const selectedMamcosName = mamcosList.find((m) => m.id === mamcosId)?.name || '';
  const generatedFarmName = [
    plotNumber ? t('plotNumberNamePart', { value: plotNumber }) : '',
    blockNumber ? t('blockNumberNamePart', { value: blockNumber }) : '',
    section,
    village,
    ward,
    district,
    region,
    selectedMamcosName,
  ].filter(Boolean).join(', ');

  const submit = async () => {
    const structuredName = (farmName.trim() || generatedFarmName).trim();
    if (!structuredName) {
      Alert.alert(t('farmNameRequired'), t('structuredFarmNameRequired'));
      return;
    }
    if (ownershipType === 'RENTED' && (!ownerName.trim() || !ownerPhone.trim())) {
      Alert.alert(t('ownerDetailsRequired'), t('ownerDetailsRequiredMessage'));
      return;
    }
    if (!socialHectares || isNaN(parseFloat(socialHectares)) || parseFloat(socialHectares) <= 0) {
      Alert.alert(t('farmSizeRequired'), t('validFarmSizeRequired'));
      return;
    }
    if (!farmerId) {
      Alert.alert(t('profileNotReady'), t('profileNotReadyMessage'));
      return;
    }
    setSubmitting(true);
    try {
      const res = await farmsApi.create({
        farmerId,
        name: structuredName,
        plotNumber: plotNumber || undefined,
        blockNumber: blockNumber || undefined,
        section: section || undefined,
        village: village || undefined,
        ward: ward || undefined,
        district: district || undefined,
        region: region || undefined,
        mamcosId: mamcosId || undefined,
        ownershipType,
        ownerName: ownershipType === 'RENTED' ? ownerName.trim() : undefined,
        ownerPhone: ownershipType === 'RENTED' ? ownerPhone.trim() : undefined,
        socialHectares: parseFloat(socialHectares),
        actualAcres: actualAcres ? parseFloat(actualAcres) : undefined,
        grade,
        vichuguuCount,
        irrigationStatus: hasIrrigation,
        nearRoadStatus: nearRoad,
        soilCondition: soilCondition || undefined,
      });
      const farm = res.data;
      Alert.alert(t('farmRegistered'), t('farmCreated', { code: farm.farmCode }), [
        {
          text: t('walkGpsBoundary'),
          onPress: () => router.replace({ pathname: '/boundary', params: { id: farm.id, label: t('farmContext', { code: farm.farmCode }) } }),
        },
        { text: t('done'), style: 'cancel', onPress: () => router.replace('/(tabs)/farms') },
      ]);
    } catch (e: any) {
      const msg = e?.response?.data?.message || t('farmRegisterFailed');
      Alert.alert(t('error'), Array.isArray(msg) ? msg.join('\n') : msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('registerFarm') }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Section title={t('farmDetails')}>
            <Field label={t('farmNameOptional')} value={farmName} onChangeText={setFarmName} placeholder={t('farmNamePlaceholder')} />
            <View style={styles.previewBox}>
              <Text style={styles.previewLabel}>{t('structuredNamePreview')}</Text>
              <Text style={styles.previewText}>{farmName.trim() || generatedFarmName || t('structuredNamePreviewEmpty')}</Text>
            </View>
            <View style={styles.twoCol}>
              <View style={styles.col}><Field label={t('plotNumber')} value={plotNumber} onChangeText={setPlotNumber} placeholder="02" /></View>
              <View style={styles.col}><Field label={t('blockNumber')} value={blockNumber} onChangeText={setBlockNumber} placeholder="5" /></View>
            </View>
            <SearchableSelect
              label={t('sectionDirection')}
              value={section}
              placeholder={t('selectSection')}
              options={[t('northEast'), t('northWest'), t('southEast'), t('southWest')]}
              onSelect={setSection}
              searchable={false}
            />
            <Field label={t('village')} value={village} onChangeText={setVillage} placeholder={t('villagePlaceholder')} />
            <Field label={t('ward')} value={ward} onChangeText={setWard} placeholder={t('wardPlaceholder')} />
            <View style={styles.twoCol}>
              <View style={styles.col}><Field label={t('district')} value={district} onChangeText={setDistrict} placeholder="Mbarali" /></View>
              <View style={styles.col}><Field label={t('region')} value={region} onChangeText={setRegion} placeholder="Mbeya" /></View>
            </View>
            {mamcosList.length > 0 && (
              <SearchableSelect
                label={t('cooperativeMamcos')}
                value={selectedMamcosName}
                placeholder={t('selectCooperativeOptional')}
                options={mamcosList.map((m) => m.name)}
                onSelect={(name) => setMamcosId(mamcosList.find((m) => m.name === name)?.id || '')}
                searchable={mamcosList.length > 8}
              />
            )}
            <Field
              label={t('soilConditionOptional')}
              value={soilCondition}
              onChangeText={setSoilCondition}
              placeholder={t('describeSoil')}
              multiline
            />
          </Section>

          <Section title={t('ownershipAndRental')}>
            <SearchableSelect
              label={t('registeringAs')}
              value={ownershipType === 'OWNED' ? t('farmOwner') : t('renterTenant')}
              options={[t('farmOwner'), t('renterTenant')]}
              onSelect={(value) => setOwnershipType(value === t('farmOwner') ? 'OWNED' : 'RENTED')}
              searchable={false}
            />
            {ownershipType === 'RENTED' && (
              <>
                <Text style={styles.infoText}>{t('renterOwnerInfoHint')}</Text>
                <Field label={t('ownerName')} value={ownerName} onChangeText={setOwnerName} placeholder={t('ownerNamePlaceholder')} />
                <Field label={t('ownerPhone')} value={ownerPhone} onChangeText={setOwnerPhone} placeholder="+255..." keyboardType="phone-pad" />
              </>
            )}
          </Section>

          <Section title={t('sizeAndGrade')}>
            <Field
              label={t('farmSizeHectares')}
              value={socialHectares}
              onChangeText={setSocialHectares}
              placeholder="e.g. 1.5"
              keyboardType="decimal-pad"
            />
            <Field
              label={t('actualAcresOptional')}
              value={actualAcres}
              onChangeText={setActualAcres}
              placeholder={t('leaveBlankBoundary')}
              keyboardType="decimal-pad"
            />
            <SearchableSelect
              label={t('landGrade')}
              value={grade}
              options={['A', 'B', 'C']}
              onSelect={(g) => setGrade(g as FarmGrade)}
              searchable={false}
              formatLabel={(g) => t('gradeValue', { grade: g })}
            />
            <Text style={styles.gradeHint}>{grade === 'A' ? t('gradeA') : grade === 'B' ? t('gradeB') : t('gradeC')}</Text>

            <Text style={styles.label}>{t('vichuguu')}</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity style={styles.counterBtn} onPress={() => setVichuguuCount((v) => Math.max(0, v - 1))}>
                <Text style={styles.counterBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>{vichuguuCount}</Text>
              <TouchableOpacity style={styles.counterBtn} onPress={() => setVichuguuCount((v) => v + 1)}>
                <Text style={styles.counterBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </Section>

          <Section title={t('features')}>
            <ToggleRow label={t('hasIrrigation')} hint={t('irrigationHint')} value={hasIrrigation} onValueChange={setHasIrrigation} />
            <ToggleRow label={t('nearRoadAccess')} hint={t('roadHint')} value={nearRoad} onValueChange={setNearRoad} />
          </Section>

          <TouchableOpacity style={[styles.submit, submitting && styles.submitDisabled]} onPress={submit} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>{t('registerFarm')}</Text>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}
function Field({ label, multiline, ...rest }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { height: 80, textAlignVertical: 'top' }]}
        placeholderTextColor="#9CA3AF"
        multiline={multiline}
        {...rest}
      />
    </View>
  );
}
function ToggleRow({ label, hint, value, onValueChange }: { label: string; hint: string; value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.hint}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onValueChange} trackColor={{ false: '#E5E7EB', true: '#A7F3D0' }} thumbColor={value ? '#10B981' : '#9CA3AF'} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 12 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  hint: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 13, fontSize: 15, borderWidth: 1, borderColor: '#E5E7EB', color: '#111827' },
  twoCol: { flexDirection: 'row', gap: 12 },
  col: { flex: 1 },
  previewBox: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 14 },
  previewLabel: { color: '#047857', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  previewText: { color: '#064E3B', fontSize: 13, fontWeight: '600', lineHeight: 18 },
  infoText: { color: '#6B7280', fontSize: 12, lineHeight: 18, marginBottom: 12 },
  gradeHint: { fontSize: 12, color: '#6B7280', marginTop: -6, marginBottom: 14 },
  counterRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  counterBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB' },
  counterBtnText: { fontSize: 24, fontWeight: '700', color: '#374151' },
  counterValue: { fontSize: 20, fontWeight: '800', color: '#111827', minWidth: 40, textAlign: 'center' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  submit: { backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 4, marginBottom: 24 },
  submitDisabled: { backgroundColor: '#9CA3AF' },
  submitText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
