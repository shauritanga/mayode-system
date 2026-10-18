'use client';
import { useEffect, useState } from 'react';
import { weatherApi } from '@/lib/api';
import { apiErrorMessage } from '@/lib/api-error';
import { EmptyState, InsightPanel } from '@/components/role-dashboards/DashboardPrimitives';
import ForecastStrip from '@/components/weather/ForecastStrip';
import { SEVERITY_BADGE, typeLabel, type WxAlert, type WxDay } from '@/lib/weather';

interface Advice {
  language: 'sw' | 'en';
  place: string | null;
  forecast: { days: WxDay[]; summary: { totalMm: number; maxDryRun: number }; fetchedAt: string } | null;
  crops: { id: string; season: string; variety: string | null; stage: string | null; farm: string; advice: { en: string[]; sw: string[] } }[];
}

export default function FarmerWeatherPage() {
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [alerts, setAlerts] = useState<WxAlert[]>([]);
  const [whatsapp, setWhatsapp] = useState(false);
  const [error, setError] = useState('');
  const [lang, setLang] = useState<'sw' | 'en'>('sw');

  useEffect(() => {
    weatherApi.advice().then((r) => { setAdvice(r.data); setLang(r.data.language); }).catch((e) => setError(apiErrorMessage(e, 'Could not load your weather.')));
    weatherApi.alerts().then((r) => setAlerts(r.data ?? [])).catch(() => undefined);
    weatherApi.preferences().then((r) => setWhatsapp(!!r.data?.whatsappOptIn)).catch(() => undefined);
  }, []);

  const toggle = async (value: boolean) => {
    setWhatsapp(value);
    try { await weatherApi.setWhatsapp(value); } catch (e) { setWhatsapp(!value); setError(apiErrorMessage(e, 'Could not save your choice.')); }
  };
  const t = (en: string, sw: string) => (lang === 'sw' ? sw : en);

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {error && <div className="alert-box alert-danger">{error}</div>}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div className="seg-control" aria-label="Language">
          {(['sw', 'en'] as const).map((l) => <button key={l} className={`seg-btn ${lang === l ? 'active' : ''}`} onClick={() => setLang(l)}>{l === 'sw' ? 'Kiswahili' : 'English'}</button>)}
        </div>
      </div>

      <InsightPanel title={t('Warnings for your area', 'Tahadhari kwa eneo lako')} subtitle={t('Sent by your cooperative and Mayode.', 'Zimetumwa na ushirika wako na Mayode.')}>
        <div className="role-list">
          {alerts.map((a) => (
            <div className="role-list-item" key={a.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <div><span className={`badge ${SEVERITY_BADGE[a.severity]}`}>{a.severity.toLowerCase()}</span> <span className="badge badge-gray">{typeLabel(a.alertType)}</span></div>
              <strong>{lang === 'sw' ? a.titleSw ?? a.title : a.title}</strong>
              <p>{lang === 'sw' ? a.messageSw ?? a.message : a.message}</p>
            </div>
          ))}
          {!alerts.length && <EmptyState>{t('No warnings right now.', 'Hakuna tahadhari kwa sasa.')}</EmptyState>}
        </div>
      </InsightPanel>

      <InsightPanel title={t(`This week${advice?.place ? ` in ${advice.place}` : ''}`, `Wiki hii${advice?.place ? ` ${advice.place}` : ''}`)} subtitle={t('Seven-day forecast: temperature and rain.', 'Utabiri wa siku saba: joto na mvua.')}>
        {advice?.forecast ? (
          <>
            <ForecastStrip days={advice.forecast.days} />
            <p style={{ fontSize: 12, color: 'var(--neutral-500)', marginTop: 8 }}>{advice.forecast.summary.totalMm} mm {t('expected this week', 'inatarajiwa wiki hii')}</p>
          </>
        ) : <EmptyState>{t('No forecast yet. Add your village or a farm location so we can find your weather.', 'Hakuna utabiri bado. Weka kijiji chako au eneo la shamba ili tupate hali ya hewa yako.')}</EmptyState>}
      </InsightPanel>

      <InsightPanel title={t('What to do on your crops', 'Cha kufanya kwenye mazao yako')} subtitle={t('Advice for the stage your rice is at, using this week’s forecast.', 'Ushauri kulingana na hatua ya mpunga wako na utabiri wa wiki hii.')}>
        <div className="role-list">
          {(advice?.crops ?? []).map((c) => (
            <div className="role-list-item" key={c.id} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
              <strong>{c.farm} · {c.season}{c.variety ? ` · ${c.variety}` : ''}{c.stage ? ` · ${c.stage.replace(/_/g, ' ').toLowerCase()}` : ''}</strong>
              {(lang === 'sw' ? c.advice.sw : c.advice.en).map((line) => <p key={line} style={{ margin: 0 }}>• {line}</p>)}
              {!c.advice.en.length && <p style={{ margin: 0, color: 'var(--neutral-500)' }}>{t('Ask your field officer to update the crop stage to get advice.', 'Mwombe afisa ugani asasishe hatua ya zao ili upate ushauri.')}</p>}
            </div>
          ))}
          {!advice?.crops.length && <EmptyState>{t('No growing crop is recorded for you.', 'Hakuna zao linalokua lililorekodiwa.')}</EmptyState>}
        </div>
      </InsightPanel>

      <InsightPanel title={t('How you get warnings', 'Jinsi unavyopata tahadhari')} subtitle={t('SMS and the app are on for everyone. You can also dial the USSD menu and choose 5.', 'SMS na programu zinafanya kazi kwa kila mtu. Pia unaweza kupiga menyu ya USSD na kuchagua 5.')}>
        <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" checked={whatsapp} onChange={(e) => toggle(e.target.checked)} />
          {t('Also send warnings to my WhatsApp', 'Nitumie tahadhari pia kwenye WhatsApp yangu')}
        </label>
      </InsightPanel>
    </div>
  );
}
