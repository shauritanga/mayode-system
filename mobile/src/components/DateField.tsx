import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Calendar01Icon, Cancel01Icon } from '@hugeicons/core-free-icons';
import { useI18n } from '../i18n';

type Props = {
  label: string;
  /** `YYYY-MM-DD`, or empty when no date is chosen. */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maximumDate?: Date;
  minimumDate?: Date;
  /** Where the calendar opens when nothing is chosen yet (e.g. around a typical birth year). */
  initialDate?: Date;
};

/** Local calendar parts, so a date picked in UTC+3 never slips to the previous day. */
export function toDateString(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function parseDate(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** A date chosen from the native calendar. The person cannot type, so the value is always a real date. */
export function DateField({ label, value, onChange, placeholder, maximumDate, minimumDate, initialDate }: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const current = parseDate(value);

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <TouchableOpacity style={styles.button} onPress={() => setOpen(true)} accessibilityRole="button">
          <HugeiconsIcon icon={Calendar01Icon} size={18} color="#10B981" strokeWidth={2} />
          <Text style={[styles.text, !current && styles.placeholder]}>{current ? value : (placeholder ?? '')}</Text>
        </TouchableOpacity>
        {current ? (
          <TouchableOpacity style={styles.clear} onPress={() => onChange('')} accessibilityRole="button" accessibilityLabel={t('clearDate')}>
            <HugeiconsIcon icon={Cancel01Icon} size={16} color="#6B7280" strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
      </View>
      {open && (
        <DateTimePicker
          value={current ?? initialDate ?? maximumDate ?? new Date()}
          mode="date"
          maximumDate={maximumDate}
          minimumDate={minimumDate}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, selected) => {
            setOpen(Platform.OS === 'ios');
            if (event.type === 'dismissed' || !selected) return;
            onChange(toDateString(selected));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  button: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 13, borderWidth: 1, borderColor: '#E5E7EB' },
  text: { fontSize: 15, color: '#111827' },
  placeholder: { color: '#9CA3AF' },
  clear: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F3F4F6' },
});
