import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

/** Local calendar-day key (YYYY-MM-DD), so entries and grid cells agree regardless of time zone. */
export function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface Props {
  /** Any date inside the month to show. */
  month: Date;
  /** Dot colours for each day that has something on it, keyed by `dayKey`. */
  markers: Record<string, string[]>;
  selected: Date;
  onSelect: (d: Date) => void;
}

// Weeks start on Monday. 2024-01-01 was a Monday, so these give locale-aware short names without extra i18n keys.
const WEEKDAYS = Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i));

/** A month laid out as weeks; days with entries carry up to three coloured dots, today is ringed, the chosen day is filled. */
export function MonthGrid({ month, markers, selected, onSelect }: Props) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: lead }, () => null),
    ...Array.from({ length: total }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
  const todayKey = dayKey(new Date());
  const selectedKey = dayKey(selected);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {WEEKDAYS.map((d) => (
          <Text key={d.getDay()} style={styles.weekday}>
            {d.toLocaleDateString(undefined, { weekday: 'narrow' })}
          </Text>
        ))}
      </View>
      {weeks.map((week, w) => (
        <View key={w} style={styles.row}>
          {week.map((d, i) => {
            if (!d) return <View key={i} style={styles.cell} />;
            const key = dayKey(d);
            const dots = [...new Set(markers[key] ?? [])].slice(0, 3);
            const isSelected = key === selectedKey;
            return (
              <TouchableOpacity key={i} style={styles.cell} activeOpacity={0.7} onPress={() => onSelect(d)}>
                <View style={[styles.day, key === todayKey && styles.today, isSelected && styles.selected]}>
                  <Text style={[styles.dayText, isSelected && styles.selectedText]}>{d.getDate()}</Text>
                </View>
                <View style={styles.dots}>
                  {dots.map((c) => <View key={c} style={[styles.dot, { backgroundColor: c }]} />)}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: '#fff', paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: '#9CA3AF', paddingVertical: 8, textTransform: 'uppercase' },
  cell: { flex: 1, alignItems: 'center', height: 48 },
  day: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: '#10B981' },
  selected: { backgroundColor: '#10B981', borderColor: '#10B981' },
  dayText: { fontSize: 14, fontWeight: '600', color: '#111827' },
  selectedText: { color: '#fff' },
  dots: { flexDirection: 'row', gap: 3, height: 6, marginTop: 2 },
  dot: { width: 5, height: 5, borderRadius: 3 },
});
