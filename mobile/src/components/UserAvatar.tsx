import React from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { HugeiconsIcon } from '@hugeicons/react-native';
import { Camera01Icon } from '@hugeicons/core-free-icons';
import { resolveMediaUrl } from '../lib/data';

type Props = {
  size?: number;
  photoUrl?: string | null;
  name?: string | null;
  onPress?: () => void;
  uploading?: boolean;
  editable?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  fallbackColor?: string;
  borderColor?: string;
};

export function UserAvatar({
  size = 48,
  photoUrl,
  name,
  onPress,
  uploading = false,
  editable = false,
  style,
  textStyle,
  fallbackColor = '#047857',
  borderColor = 'rgba(255,255,255,0.35)',
}: Props) {
  const initial = (name?.trim()?.[0] || 'U').toUpperCase();
  const uri = photoUrl ? resolveMediaUrl(photoUrl) : null;
  const radius = size / 2;

  const avatar = (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderColor,
        },
        style,
      ]}
    >
      {uploading ? (
        <View style={[styles.fallback, { backgroundColor: fallbackColor, borderRadius: radius }]}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      ) : uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: radius }} />
      ) : (
        <View style={[styles.fallback, { backgroundColor: fallbackColor, borderRadius: radius }]}>
          <Text style={[styles.initial, { fontSize: Math.round(size * 0.38) }, textStyle]}>{initial}</Text>
        </View>
      )}
      {editable && !uploading ? (
        <View style={[styles.editBadge, { right: -2, bottom: -2 }]}>
          <HugeiconsIcon icon={Camera01Icon} size={12} color="#065F46" strokeWidth={2} />
        </View>
      ) : null}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85} disabled={uploading}>
        {avatar}
      </TouchableOpacity>
    );
  }

  return avatar;
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 2,
    overflow: 'visible',
  },
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initial: {
    color: '#fff',
    fontWeight: '800',
  },
  editBadge: {
    position: 'absolute',
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
