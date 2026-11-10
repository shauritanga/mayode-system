/** Texts for the harvest gate: passes, arrivals. In each person's own language (sw default, or en). */
export type Lang = 'sw' | 'en';
export const toLang = (language?: string | null): Lang => (language === 'en' ? 'en' : 'sw');
export interface Msg { title: string; body: string }
const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;

export const passForFarmer = (lang: Lang, p: { plot: string; code: string }): Msg =>
  lang === 'en'
    ? { title: 'Harvest pass', body: `MAYODE: Your harvest fee for ${p.plot} is paid. Harvest pass code: ${p.code}. Give this code to the combine operator before they harvest.` }
    : { title: 'Kibali cha kuvuna', body: `MAYODE: Ada yako ya kuvuna ya ${p.plot} imelipwa. Namba ya kibali cha kuvuna: ${p.code}. Mpe opereta wa kombaini namba hii kabla ya kuvuna.` };

/** One text for the chairman or operator listing the plots cleared (at most six shown). */
export const passesForWatcher = (lang: Lang, p: { block: string; items: { plot: string; code: string }[] }): Msg => {
  const shown = p.items.slice(0, 6).map((i) => `${i.plot}=${i.code}`).join(', ') + (p.items.length > 6 ? ` +${p.items.length - 6}` : '');
  return lang === 'en'
    ? { title: `Plots cleared in block ${p.block}`, body: `MAYODE: ${p.items.length} plot(s) cleared to harvest in block ${p.block}: ${shown}.` }
    : { title: `Mashamba yaliyoruhusiwa block ${p.block}`, body: `MAYODE: Mashamba ${p.items.length} yameruhusiwa kuvunwa block ${p.block}: ${shown}.` };
};

export const arrivalForLeader = (lang: Lang, p: { block: string; operator: string; machine?: string | null; cleared: number; locked: number }): Msg =>
  lang === 'en'
    ? { title: `Combine harvester in block ${p.block}`, body: `MAYODE: ${p.operator}${p.machine ? ` (${p.machine})` : ''} has arrived in block ${p.block}. ${p.cleared} plot(s) are cleared, ${p.locked} are locked. Do not allow harvesting on locked plots.` }
    : { title: `Kombaini imefika block ${p.block}`, body: `MAYODE: ${p.operator}${p.machine ? ` (${p.machine})` : ''} amefika block ${p.block}. Mashamba ${p.cleared} yameruhusiwa, ${p.locked} yamefungwa. Usiruhusu kuvuna kwenye mashamba yaliyofungwa.` };

export const arrivalForOperator = (lang: Lang, p: { block: string; rate: number | null; cleared: number; locked: number }): Msg =>
  lang === 'en'
    ? { title: `Block ${p.block}: harvest rules`, body: `MAYODE: Block ${p.block}. Harvest fee ${p.rate == null ? 'not set yet' : `${tzs(p.rate)} per hectare`}. ${p.cleared} plot(s) cleared, ${p.locked} locked. Harvest only plots with a pass code or the chairman's sign-off.` }
    : { title: `Block ${p.block}: masharti ya kuvuna`, body: `MAYODE: Block ${p.block}. Ada ya kuvuna ${p.rate == null ? 'bado haijawekwa' : `${tzs(p.rate)} kwa hekta`}. Mashamba ${p.cleared} yameruhusiwa, ${p.locked} yamefungwa. Vuna shamba lenye namba ya kibali au idhini ya mwenyekiti tu.` };

export const incidentForCanalLeader = (lang: Lang, p: { block: string; plot: string; text: string }): Msg =>
  lang === 'en'
    ? { title: `Harvest gate: ${p.plot}`, body: `MAYODE: Harvest stopped at ${p.plot} (block ${p.block}): ${p.text}. Open the Harvest page to resolve it.` }
    : { title: `Lango la kuvuna: ${p.plot}`, body: `MAYODE: Uvunaji umezuiwa ${p.plot} (block ${p.block}): ${p.text}. Fungua ukurasa wa Uvunaji kuutatua.` };
