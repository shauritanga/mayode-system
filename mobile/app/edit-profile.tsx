import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator,
  Alert, KeyboardAvoidingView, Keyboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Location01Icon, Add01Icon, File01Icon, Delete02Icon } from '@hugeicons/core-free-icons';
import { farmersApi, uploadsApi } from '../src/lib/data';
import { useAuthStore } from '../src/store/auth.store';
import { getCurrentPoint } from '../src/services/location.service';
import { SearchableSelect } from '../src/components/SearchableSelect';
import { getRegions, getDistricts, getWards } from '../src/local/locations';
import { prettyEnum, useI18n } from '../src/i18n';

const GENDERS = ['MALE', 'FEMALE'];
const EDUCATION = ['NONE', 'PRIMARY', 'SECONDARY', 'VOCATIONAL', 'TERTIARY'];
const DOC_TYPES = ['NATIONAL_ID', 'PHOTO', 'CERTIFICATE', 'OTHER'];

export default function EditProfile() {
  const router = useRouter();
  const { farmerId } = useAuthStore();
  const { t } = useI18n();
  const scrollRef = useRef<ScrollView>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [capturingGps, setCapturingGps] = useState(false);

  const [form, setForm] = useState<any>({
    firstName: '', lastName: '', gender: '', dateOfBirth: '', educationLevel: '',
    farmingExperienceYears: '', village: '', ward: '', district: '', region: '',
    householdSize: '', dependents: '', residenceLatitude: null, residenceLongitude: null,
  });
  const [documents, setDocuments] = useState<any[]>([]);
  const [docType, setDocType] = useState('PHOTO');

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  // Cascading location selects — choosing a higher level clears the lower ones.
  const selectRegion = (v: string) => setForm((f: any) => ({ ...f, region: v, district: '', ward: '' }));
  const selectDistrict = (v: string) => setForm((f: any) => ({ ...f, district: v, ward: '' }));

  const load = useCallback(async () => {
    if (!farmerId) { setLoading(false); return; }
    try {
      const res = await farmersApi.getOne(farmerId);
      const f = res.data;
      setForm({
        firstName: f.firstName ?? '', lastName: f.lastName ?? '', gender: f.gender ?? '',
        dateOfBirth: f.dateOfBirth ? String(f.dateOfBirth).slice(0, 10) : '',
        educationLevel: f.educationLevel ?? '',
        farmingExperienceYears: f.farmingExperienceYears != null ? String(f.farmingExperienceYears) : '',
        village: f.village ?? '', ward: f.ward ?? '', district: f.district ?? '', region: f.region ?? '',
        householdSize: f.household?.householdSize != null ? String(f.household.householdSize) : '',
        dependents: f.household?.dependents != null ? String(f.household.dependents) : '',
        residenceLatitude: f.residenceLatitude ?? null, residenceLongitude: f.residenceLongitude ?? null,
      });
      setDocuments(f.documents ?? []);
    } finally {
      setLoading(false);
    }
  }, [farmerId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => scrollRef.current?.scrollToEnd({ animated: true }));
    return () => sub.remove();
  }, []);

  const captureGps = async () => {
    setCapturingGps(true);
    try {
      const p = await getCurrentPoint();
      set('residenceLatitude', p.latitude);
      set('residenceLongitude', p.longitude);
    } catch (e: any) {
      Alert.alert(t('locationError'), t('couldNotReadGps'));
    } finally {
      setCapturingGps(false);
    }
  };

  const addDocument = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert(t('permissionNeeded'), t('allowPhotoAccess'));
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.6 });
    if (result.canceled || !result.assets?.length || !farmerId) return;
    const asset = result.assets[0];
    try {
      const up = await uploadsApi.uploadFile({
        uri: asset.uri,
        name: asset.fileName || `document-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      });
      await farmersApi.addDocument(farmerId, {
        type: docType,
        fileUrl: up.data.url,
        fileName: up.data.fileName,
        mimeType: up.data.mimeType,
      });
      await load();
    } catch (e: any) {
      Alert.alert(t('uploadFailed'), e?.response?.data?.message || e?.message || t('couldNotAttachDocument'));
    }
  };

  const removeDocument = (id: string) => {
    Alert.alert(t('removeDocument'), t('deleteDocumentQuestion'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'), style: 'destructive',
        onPress: async () => { await farmersApi.removeDocument(id); await load(); },
      },
    ]);
  };

  const save = async () => {
    if (!farmerId) return;
    setSaving(true);
    try {
      await farmersApi.update(farmerId, {
        firstName: form.firstName || undefined,
        lastName: form.lastName || undefined,
        gender: form.gender || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        educationLevel: form.educationLevel || undefined,
        farmingExperienceYears: form.farmingExperienceYears ? Number(form.farmingExperienceYears) : undefined,
        village: form.village || undefined,
        ward: form.ward || undefined,
        district: form.district || undefined,
        region: form.region || undefined,
        residenceLatitude: form.residenceLatitude ?? undefined,
        residenceLongitude: form.residenceLongitude ?? undefined,
      });
      if (form.householdSize || form.dependents) {
        await farmersApi.upsertHousehold(farmerId, {
          householdSize: form.householdSize ? Number(form.householdSize) : undefined,
          dependents: form.dependents ? Number(form.dependents) : undefined,
        });
      }
      Alert.alert(t('saved'), t('profileUpdated'), [{ text: t('ok'), onPress: () => router.back() }]);
    } catch (e: any) {
      Alert.alert(t('saveFailed'), e?.response?.data?.message || e?.message || t('couldNotSaveProfile'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <SafeAreaView style={styles.center}><ActivityIndicator color="#10B981" size="large" /></SafeAreaView>;
  }

  const gpsSet = form.residenceLatitude != null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ headerShown: true, title: t('editProfile') }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Section title={t('personal')}>
            <Row><Field label={t('firstNameForm')} value={form.firstName} onChangeText={(v) => set('firstName', v)} /></Row>
            <Row><Field label={t('lastNameForm')} value={form.lastName} onChangeText={(v) => set('lastName', v)} /></Row>
            <SearchableSelect
              label={t('gender')}
              value={form.gender}
              placeholder={t('selectGender')}
              options={GENDERS}
              onSelect={(v) => set('gender', v)}
              searchable={false}
              formatLabel={prettyEnum}
            />
            <Field label={t('dateOfBirth')} value={form.dateOfBirth} onChangeText={(v) => set('dateOfBirth', v)} placeholder="1990-05-12" />
            <SearchableSelect
              label={t('educationLevel')}
              value={form.educationLevel}
              placeholder={t('selectEducationLevel')}
              options={EDUCATION}
              onSelect={(v) => set('educationLevel', v)}
              searchable={false}
              formatLabel={prettyEnum}
            />
            <Field label={t('farmingExperienceYears')} value={form.farmingExperienceYears} onChangeText={(v) => set('farmingExperienceYears', v)} keyboardType="number-pad" />
          </Section>

          <Section title={t('location')}>
            <SearchableSelect
              label={t('region')}
              value={form.region}
              placeholder={t('selectRegion')}
              options={getRegions()}
              onSelect={selectRegion}
            />
            <SearchableSelect
              label={t('district')}
              value={form.district}
              placeholder={t('selectDistrict')}
              options={getDistricts(form.region)}
              onSelect={selectDistrict}
              disabled={!form.region}
              disabledHint={t('selectRegionFirst')}
            />
            <SearchableSelect
              label={t('ward')}
              value={form.ward}
              placeholder={t('selectWard')}
              options={getWards(form.region, form.district)}
              onSelect={(v) => set('ward', v)}
              disabled={!form.district}
              disabledHint={t('selectDistrictFirst')}
            />
            <Field label={t('village')} value={form.village} onChangeText={(v) => set('village', v)} placeholder={t('typeVillageName')} />
            <TouchableOpacity style={[styles.gpsBtn, gpsSet && styles.gpsBtnDone]} onPress={captureGps} disabled={capturingGps}>
              {capturingGps ? <ActivityIndicator color="#fff" /> : (
                <>
                  <HugeiconsIcon icon={Location01Icon} size={18} color="#fff" strokeWidth={2} />
                  <Text style={styles.gpsBtnText}>
                    {gpsSet ? t('residenceGps', { lat: form.residenceLatitude.toFixed(5), lng: form.residenceLongitude.toFixed(5) }) : t('captureResidenceGps')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </Section>

          <Section title={t('household')}>
            <Field label={t('householdSize')} value={form.householdSize} onChangeText={(v) => set('householdSize', v)} keyboardType="number-pad" />
            <Field label={t('dependents')} value={form.dependents} onChangeText={(v) => set('dependents', v)} keyboardType="number-pad" />
          </Section>

          <Section title={`${t('documents')} (${documents.length})`}>
            <SearchableSelect
              label={t('newDocumentType')}
              value={docType}
              options={DOC_TYPES}
              onSelect={setDocType}
              searchable={false}
              formatLabel={prettyEnum}
            />
            <TouchableOpacity style={styles.addDocBtn} onPress={addDocument}>
              <HugeiconsIcon icon={Add01Icon} size={18} color="#10B981" strokeWidth={2} />
              <Text style={styles.addDocText}>{t('addPhotoDocument')}</Text>
            </TouchableOpacity>
            {documents.map((d) => (
              <View key={d.id} style={styles.docRow}>
                <HugeiconsIcon icon={File01Icon} size={20} color="#3B82F6" strokeWidth={1.8} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.docName} numberOfLines={1}>{d.fileName || t('document')}</Text>
                  <Text style={styles.docType}>{d.type}</Text>
                </View>
                <TouchableOpacity onPress={() => removeDocument(d.id)} hitSlop={8}>
                  <HugeiconsIcon icon={Delete02Icon} size={18} color="#EF4444" strokeWidth={2} />
                </TouchableOpacity>
              </View>
            ))}
          </Section>

          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveDisabled]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('saveProfile')}</Text>}
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
function Row({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
function Field({ label, ...rest }: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor="#9CA3AF" {...rest} />
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
  section: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, borderWidth: 1, borderColor: '#E5E7EB' },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', marginBottom: 12 },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 13, fontSize: 15, borderWidth: 1, borderColor: '#E5E7EB', color: '#111827' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  chipActive: { backgroundColor: 'rgba(16,185,129,0.12)', borderColor: '#10B981' },
  chipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  chipTextActive: { color: '#10B981' },
  gpsBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#065F46', paddingVertical: 13, borderRadius: 12, marginTop: 4 },
  gpsBtnDone: { backgroundColor: '#10B981' },
  gpsBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  addDocBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: 'rgba(16,185,129,0.1)', paddingVertical: 13, borderRadius: 12, marginBottom: 12 },
  addDocText: { color: '#10B981', fontWeight: '700', fontSize: 14 },
  docRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F3F4F6' },
  docName: { fontSize: 14, fontWeight: '600', color: '#111827' },
  docType: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  saveBtn: { backgroundColor: '#10B981', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginBottom: 24 },
  saveDisabled: { backgroundColor: '#9CA3AF' },
  saveText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
