import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { timeAgo, useI18n } from '../i18n';

export type ActivityFeedItemData = {
  id: string;
  title?: string | null;
  subtitle?: string | null;
  icon?: string | null;
  type?: string | null;
  createdAt?: string | null;
};

type Tone = { well: string; accent: string; label: string };

function toneFor(type?: string | null): Tone {
  const t = (type || '').toLowerCase();
  if (t.includes('harvest')) return { well: '#FFF7ED', accent: '#EA580C', label: '#C2410C' };
  if (t.includes('start') || t.includes('plant')) return { well: '#ECFDF5', accent: '#059669', label: '#047857' };
  if (t.includes('activity') || t.includes('weed') || t.includes('irrig')) {
    return { well: '#F0FDFA', accent: '#0D9488', label: '#0F766E' };
  }
  if (t.includes('sale') || t.includes('revenue')) return { well: '#EEF2FF', accent: '#4F46E5', label: '#4338CA' };
  return { well: '#F3F4F6', accent: '#6B7280', label: '#4B5563' };
}

function typeLabel(type?: string | null): string | null {
  if (!type) return null;
  const last = type.split('.').pop() || type;
  return last.replace(/_/g, ' ');
}

type Props = {
  item: ActivityFeedItemData;
  /** Draw the timeline connector under this row (home list / feed). */
  showRail?: boolean;
  isLast?: boolean;
  onPress?: () => void;
};

/** Professional activity feed row — timeline icon + title/meta + relative time. */
export function ActivityFeedItem({ item, showRail = true, isLast = false, onPress }: Props) {
  const { t } = useI18n();
  const tone = toneFor(item.type);
  const tag = typeLabel(item.type);

  const content = (
    <>
      <View style={styles.railCol}>
        <View style={[styles.iconWell, { backgroundColor: tone.well, borderColor: tone.accent + '33' }]}>
          <Text style={styles.iconEmoji}>{item.icon || '•'}</Text>
        </View>
        {showRail && !isLast ? <View style={[styles.rail, { backgroundColor: tone.accent + '28' }]} /> : null}
      </View>

      <View style={[styles.body, isLast && styles.bodyLast]}>
        <View style={styles.topLine}>
          <Text style={styles.title} numberOfLines={2}>{item.title || '—'}</Text>
          {!!item.createdAt && (
            <Text style={styles.time}>{timeAgo(item.createdAt, t)}</Text>
          )}
        </View>

        {(!!item.subtitle || !!tag) && (
          <View style={styles.metaRow}>
            {!!tag && (
              <View style={[styles.tag, { backgroundColor: tone.well }]}>
                <Text style={[styles.tagText, { color: tone.label }]}>{tag}</Text>
              </View>
            )}
            {!!item.subtitle && (
              <Text style={styles.subtitle} numberOfLines={1}>{item.subtitle}</Text>
            )}
          </View>
        )}
      </View>
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.72}>
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={styles.row}>{content}</View>;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    minHeight: 64,
  },
  railCol: {
    width: 44,
    alignItems: 'center',
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: 10,
  },
  iconEmoji: { fontSize: 16 },
  rail: {
    flex: 1,
    width: 2,
    marginTop: 6,
    marginBottom: 2,
    borderRadius: 1,
  },
  body: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 10,
    paddingRight: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EEF1F4',
  },
  bodyLast: {
    borderBottomWidth: 0,
  },
  topLine: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.2,
    lineHeight: 20,
  },
  time: {
    fontSize: 11,
    fontWeight: '500',
    color: '#9CA3AF',
    marginTop: 2,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  tagText: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  subtitle: {
    flex: 1,
    fontSize: 12,
    color: '#6B7280',
    lineHeight: 16,
  },
});
