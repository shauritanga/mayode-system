/** What invited people are told about a meeting, in their own language (sw default, or en). */
export type Lang = 'sw' | 'en';
export const toLang = (language?: string | null): Lang => (language === 'en' ? 'en' : 'sw');
export interface Msg { title: string; body: string }

const when = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const cut = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
type M = { kind: 'BOARD' | 'AGM'; title: string; agenda: string; venue: string; at: Date };

const label = (kind: 'BOARD' | 'AGM', lang: Lang) => (kind === 'AGM' ? (lang === 'en' ? 'General Meeting' : 'Mkutano Mkuu') : lang === 'en' ? 'Board meeting' : 'Mkutano wa Bodi');

export const invitationMessage = (lang: Lang, m: M): Msg => {
  const k = label(m.kind, lang);
  return lang === 'en'
    ? { title: `${k}: ${m.title}`, body: `MAYODE: ${k} "${m.title}" on ${when(m.at)} at ${m.venue}. Agenda: ${cut(m.agenda)}. Open the MAYODE app to check in when you arrive.` }
    : { title: `${k}: ${m.title}`, body: `MAYODE: ${k} "${m.title}" tarehe ${when(m.at)} katika ${m.venue}. Ajenda: ${cut(m.agenda)}. Fungua app ya MAYODE kujisajili ukifika.` };
};

export const updateMessage = (lang: Lang, m: M): Msg => {
  const k = label(m.kind, lang);
  return lang === 'en'
    ? { title: `${k} changed: ${m.title}`, body: `MAYODE: ${k} "${m.title}" has changed. Now: ${when(m.at)} at ${m.venue}. Agenda: ${cut(m.agenda)}.` }
    : { title: `${k} limebadilishwa: ${m.title}`, body: `MAYODE: ${k} "${m.title}" limebadilishwa. Sasa: ${when(m.at)} katika ${m.venue}. Ajenda: ${cut(m.agenda)}.` };
};

export const cancelMessage = (lang: Lang, m: M & { reason: string }): Msg => {
  const k = label(m.kind, lang);
  return lang === 'en'
    ? { title: `${k} cancelled: ${m.title}`, body: `MAYODE: ${k} "${m.title}" planned for ${when(m.at)} is cancelled. Reason: ${cut(m.reason, 100)}.` }
    : { title: `${k} limeahirishwa: ${m.title}`, body: `MAYODE: ${k} "${m.title}" la ${when(m.at)} limeghairiwa. Sababu: ${cut(m.reason, 100)}.` };
};

export const reminderMessage = (lang: Lang, m: M): Msg => {
  const k = label(m.kind, lang);
  return lang === 'en'
    ? { title: `Reminder: ${m.title}`, body: `MAYODE reminder: ${k} "${m.title}" is on ${when(m.at)} at ${m.venue}.` }
    : { title: `Kumbusho: ${m.title}`, body: `MAYODE kumbusho: ${k} "${m.title}" ni ${when(m.at)} katika ${m.venue}.` };
};
