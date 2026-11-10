/** Texts for contractors, bidders and chairmen (sw default, or en). */
export type Lang = 'sw' | 'en';
export const toLang = (language?: string | null): Lang => (language === 'en' ? 'en' : 'sw');
export interface Msg { title: string; body: string }
const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;
const date = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
type T = { reference: string; title: string };

export const newTender = (lang: Lang, t: T & { ceiling: number; closesAt: Date; amcos: string }): Msg =>
  lang === 'en'
    ? { title: `New tender ${t.reference}`, body: `MAYODE tender ${t.reference} (${t.amcos}): ${t.title}. Budget ceiling ${tzs(t.ceiling)}. Bids close ${date(t.closesAt)}. Bid in the MAYODE contractor portal.` }
    : { title: `Zabuni mpya ${t.reference}`, body: `Zabuni ya MAYODE ${t.reference} (${t.amcos}): ${t.title}. Kikomo cha bajeti ${tzs(t.ceiling)}. Zabuni zinafungwa ${date(t.closesAt)}. Wasilisha zabuni yako kwenye tovuti ya wakandarasi ya MAYODE.` };

export const bidReceived = (lang: Lang, t: T & { code: string }): Msg =>
  lang === 'en'
    ? { title: `Bid received: ${t.reference}`, body: `MAYODE: Your bid for tender ${t.reference} was received (bid ${t.code}). Bids stay sealed until the closing time.` }
    : { title: `Zabuni imepokelewa: ${t.reference}`, body: `MAYODE: Zabuni yako ya ${t.reference} imepokelewa (namba ${t.code}). Zabuni hubaki zimefungwa hadi muda wa kufunga.` };

export const awarded = (lang: Lang, t: T & { price: number }): Msg =>
  lang === 'en'
    ? { title: `Tender awarded to you: ${t.reference}`, body: `MAYODE: Congratulations. Tender ${t.reference} (${t.title}) is awarded to you at ${tzs(t.price)}. Open the portal to see the milestones and start work.` }
    : { title: `Umepewa zabuni: ${t.reference}`, body: `MAYODE: Hongera. Zabuni ${t.reference} (${t.title}) umepewa kwa ${tzs(t.price)}. Fungua tovuti kuona hatua za kazi na kuanza.` };

export const notSelected = (lang: Lang, t: T): Msg =>
  lang === 'en'
    ? { title: `Tender ${t.reference} decided`, body: `MAYODE: Tender ${t.reference} (${t.title}) was awarded to another bidder. Thank you for bidding.` }
    : { title: `Zabuni ${t.reference} imeamuliwa`, body: `MAYODE: Zabuni ${t.reference} (${t.title}) imepewa mzabuni mwingine. Asante kwa kushiriki.` };

export const cancelled = (lang: Lang, t: T & { reason: string }): Msg =>
  lang === 'en'
    ? { title: `Tender ${t.reference} cancelled`, body: `MAYODE: Tender ${t.reference} (${t.title}) was cancelled. Reason: ${t.reason}` }
    : { title: `Zabuni ${t.reference} imeghairiwa`, body: `MAYODE: Zabuni ${t.reference} (${t.title}) imeghairiwa. Sababu: ${t.reason}` };

export const milestoneReady = (lang: Lang, t: T & { milestone: string; contractor: string }): Msg =>
  lang === 'en'
    ? { title: `Inspect: ${t.reference}`, body: `MAYODE: ${t.contractor} says milestone "${t.milestone}" of tender ${t.reference} (${t.title}) is done. Please inspect on site and sign off in the MAYODE portal.` }
    : { title: `Kagua: ${t.reference}`, body: `MAYODE: ${t.contractor} anasema hatua "${t.milestone}" ya zabuni ${t.reference} (${t.title}) imekamilika. Tafadhali kagua eneo la kazi na uidhinishe kwenye tovuti ya MAYODE.` };

export const reworkAsked = (lang: Lang, t: T & { milestone: string; note: string }): Msg =>
  lang === 'en'
    ? { title: `Rework needed: ${t.reference}`, body: `MAYODE: Milestone "${t.milestone}" of ${t.reference} was not signed off: ${t.note}. Fix it and submit again.` }
    : { title: `Marekebisho yanahitajika: ${t.reference}`, body: `MAYODE: Hatua "${t.milestone}" ya ${t.reference} haikuidhinishwa: ${t.note}. Rekebisha na uwasilishe tena.` };

export const paid = (lang: Lang, t: T & { milestone: string; amount: number; method: string; reference: string }): Msg =>
  lang === 'en'
    ? { title: `Payment sent: ${t.reference}`, body: `MAYODE: Payment of ${tzs(t.amount)} for milestone "${t.milestone}" of ${t.reference} was sent by ${t.method.replace('_', ' ').toLowerCase()} (ref ${t.reference}).` }
    : { title: `Malipo yametumwa: ${t.reference}`, body: `MAYODE: Malipo ya ${tzs(t.amount)} kwa hatua "${t.milestone}" ya ${t.reference} yametumwa kwa ${t.method.replace('_', ' ').toLowerCase()}.` };

export const vetted = (lang: Lang, p: { status: string; note?: string | null }): Msg =>
  lang === 'en'
    ? { title: 'Contractor registration', body: p.status === 'VETTED' ? 'MAYODE: Your contractor registration is approved. You can now bid for tenders.' : `MAYODE: Your contractor registration was ${p.status === 'SUSPENDED' ? 'suspended' : 'not approved'}.${p.note ? ` ${p.note}` : ''}` }
    : { title: 'Usajili wa mkandarasi', body: p.status === 'VETTED' ? 'MAYODE: Usajili wako wa mkandarasi umekubaliwa. Sasa unaweza kuomba zabuni.' : `MAYODE: Usajili wako wa mkandarasi ${p.status === 'SUSPENDED' ? 'umesimamishwa' : 'haukukubaliwa'}.${p.note ? ` ${p.note}` : ''}` };
