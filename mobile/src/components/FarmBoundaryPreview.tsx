import React, { useMemo } from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { WebView } from 'react-native-webview';
import { asPolygonGeometry } from '../lib/farm-geo';
import { boundaryPreviewHtml } from '../lib/leaflet-preview-html';

type Props = {
  boundaryCoordinates: any;
  height?: number;
  style?: ViewStyle;
};

/** Non-interactive satellite preview of a saved farm boundary. */
export function FarmBoundaryPreview({ boundaryCoordinates, height = 140, style }: Props) {
  const html = useMemo(() => {
    const poly = asPolygonGeometry(boundaryCoordinates);
    return boundaryPreviewHtml(poly ?? boundaryCoordinates);
  }, [boundaryCoordinates]);

  return (
    <View style={[styles.wrap, { height }, style]} pointerEvents="none">
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        javaScriptEnabled
        scrollEnabled={false}
        style={styles.map}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#0b1f17',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  map: { flex: 1, backgroundColor: 'transparent' },
});
