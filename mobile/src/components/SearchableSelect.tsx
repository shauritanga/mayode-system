import React, { useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet, Pressable,
} from 'react-native';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { ArrowDown01Icon, Search01Icon, Cancel01Icon, Tick02Icon } from '@hugeicons/core-free-icons';
import { useI18n } from '../i18n';

interface Props {
  label: string;
  value?: string | null;
  placeholder?: string;
  options: string[];
  onSelect: (value: string) => void;
  disabled?: boolean;
  disabledHint?: string;
  /** Show the search box. Defaults to true when there are more than 8 options. */
  searchable?: boolean;
  /** Render an option/value with a friendlier label (raw value is still stored). */
  formatLabel?: (value: string) => string;
}

/** A form field that opens a (optionally searchable) bottom-sheet list of options. */
export function SearchableSelect({
  label, value, placeholder, options, onSelect, disabled, disabledHint,
  searchable, formatLabel,
}: Props) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const showSearch = searchable ?? options.length > 8;
  const fmt = formatLabel ?? ((v: string) => v);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.toLowerCase().includes(q) || fmt(o).toLowerCase().includes(q)) : options;
  }, [query, options, fmt]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        style={[styles.control, disabled && styles.controlDisabled]}
        activeOpacity={0.7}
        onPress={() => !disabled && setOpen(true)}
      >
        <Text style={[styles.value, !value && styles.placeholder]} numberOfLines={1}>
          {value ? fmt(value) : (disabled ? disabledHint || placeholder : placeholder) || t('select')}
        </Text>
        <HugeiconsIcon icon={ArrowDown01Icon} size={18} color={disabled ? '#D1D5DB' : '#6B7280'} strokeWidth={2} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <Pressable style={styles.backdrop} onPress={close} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{t('selectLabel', { label })}</Text>
            <TouchableOpacity onPress={close} hitSlop={10}>
              <HugeiconsIcon icon={Cancel01Icon} size={22} color="#6B7280" strokeWidth={2} />
            </TouchableOpacity>
          </View>

          {showSearch && (
            <View style={styles.searchBox}>
              <HugeiconsIcon icon={Search01Icon} size={18} color="#9CA3AF" strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder={t('searchLabel', { label: label.toLowerCase() })}
                placeholderTextColor="#9CA3AF"
                value={query}
                onChangeText={setQuery}
                autoFocus
                autoCorrect={false}
              />
            </View>
          )}

          <FlatList
            data={filtered}
            keyExtractor={(item) => item}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            initialNumToRender={20}
            ListEmptyComponent={<Text style={styles.empty}>{t('noMatches')}</Text>}
            renderItem={({ item }) => {
              const selected = item === value;
              return (
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => { onSelect(item); close(); }}
                >
                  <Text style={[styles.rowText, selected && styles.rowTextSelected]}>{fmt(item)}</Text>
                  {selected && <HugeiconsIcon icon={Tick02Icon} size={18} color="#10B981" strokeWidth={2} />}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  control: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#F9FAFB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    borderWidth: 1, borderColor: '#E5E7EB',
  },
  controlDisabled: { backgroundColor: '#F3F4F6', borderColor: '#F3F4F6' },
  value: { fontSize: 15, color: '#111827', flex: 1, marginRight: 8 },
  placeholder: { color: '#9CA3AF' },

  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '75%',
    backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', marginBottom: 12 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#111827' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#F3F4F6',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  searchInput: { flex: 1, fontSize: 15, color: '#111827', padding: 0 },
  list: { flexGrow: 0 },
  row: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  rowText: { fontSize: 15, color: '#374151' },
  rowTextSelected: { color: '#10B981', fontWeight: '700' },
  empty: { textAlign: 'center', color: '#9CA3AF', paddingVertical: 24, fontSize: 14 },
});
