import { ImageResponse } from 'next/og';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** Bold cream "M" on the brand's deep green: stays readable at 16px, unlike the thin line logo. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0b2417', borderRadius: 0 }}>
        <svg width="140" height="140" viewBox="0 0 100 100">
          <polygon fill="#f4eedd" points="8,82 8,18 28,18 50,50 72,18 92,18 92,82 76,82 76,42 52,74 48,74 24,42 24,82" />
        </svg>
      </div>
    ),
    size,
  );
}
