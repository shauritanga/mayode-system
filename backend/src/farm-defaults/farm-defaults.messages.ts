/** What a farmer is told at each step of the overdue-debt process, in their own language (sw default, or en). */
export type Lang = 'sw' | 'en';
export const toLang = (language?: string | null): Lang => (language === 'en' ? 'en' : 'sw');

const tzs = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;
const when = (d: Date) => d.toLocaleString('en-GB', { timeZone: 'Africa/Dar_es_Salaam', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });

export interface Msg { title: string; body: string }

/** The debt passed its due date: farms blocked and under AMCOS administration, with the grace period to pay. */
export const blockedMessage = (lang: Lang, p: { farms: number; debt: number; days: number; endsOn: Date }): Msg =>
  lang === 'en'
    ? { title: 'Your farm is under AMCOS administration', body: `MAYODE: Your debt to the AMCOS (${tzs(p.debt)}) is overdue. Your ${p.farms} farm(s) can no longer be leased and are now under AMCOS administration. You have until ${when(p.endsOn)} (${p.days} days) to pay and keep them. Another farmer may pay the debt and farm them this season. After that the farms are given to MAYODE M-LAX, you receive nothing from their lease, and getting them back through M-LAX costs more than paying your debt now.` }
    : { title: 'Shamba lako liko chini ya usimamizi wa AMCOS', body: `MAYODE: Deni lako kwa AMCOS (${tzs(p.debt)}) limepita muda. Shamba lako (${p.farms}) haliwezi tena kukodishwa na sasa liko chini ya usimamizi wa AMCOS. Una hadi ${when(p.endsOn)} (siku ${p.days}) kulipa ili uyabaki nayo. Mkulima mwingine anaweza kulipa deni na kulima msimu huu. Baada ya hapo mashamba yatapewa MAYODE M-LAX, hutapata chochote kutoka kwa ukodishaji, na kuyarudisha kupitia M-LAX ni gharama kuliko kulipa deni sasa.` };

/** Two days before the grace period ends. */
export const noticeMessage = (lang: Lang, p: { debt: number; endsOn: Date }): Msg =>
  lang === 'en'
    ? { title: 'Two days left before your farm goes to M-LAX', body: `MAYODE: Your grace period ends ${when(p.endsOn)}. Pay your debt of ${tzs(p.debt)} at the AMCOS before then. Otherwise your farm is given to MAYODE M-LAX, a penalty is added, you get nothing from its lease, and paying the debt will no longer bring it back: you would have to lease it through M-LAX like anyone else.` }
    : { title: 'Siku mbili kabla shamba lako kupelekwa M-LAX', body: `MAYODE: Muda wako wa nyongeza unaisha ${when(p.endsOn)}. Lipa deni lako la ${tzs(p.debt)} AMCOS kabla ya hapo. Vinginevyo shamba lako litapewa MAYODE M-LAX, faini itaongezwa, hutapata chochote kutoka kwa ukodishaji wake, na kulipa deni hakutalirudisha: utalazimika kulikodi kupitia M-LAX kama mtu mwingine yeyote.` };

/** The grace period is over and the farm is on M-LAX. */
export const onMlaxMessage = (lang: Lang, p: { penalty: number }): Msg =>
  lang === 'en'
    ? { title: 'Your farm is now on M-LAX', body: `MAYODE: The grace period is over. Your farm is now on MAYODE M-LAX and open to the public for leasing. A penalty of ${tzs(p.penalty)} was added to your debt. You receive nothing from its lease. To get it back you must lease it through M-LAX.` }
    : { title: 'Shamba lako sasa liko M-LAX', body: `MAYODE: Muda wa nyongeza umeisha. Shamba lako sasa liko MAYODE M-LAX na liko wazi kwa umma kukodishwa. Faini ya ${tzs(p.penalty)} imeongezwa kwenye deni lako. Hutapata chochote kutoka kwa ukodishaji wake. Ili kulirudisha lazima ulikodi kupitia M-LAX.` };

export const reclaimedMessage = (lang: Lang): Msg =>
  lang === 'en'
    ? { title: 'Your farm is back to normal', body: 'MAYODE: Thank you, your debt is cleared. Your farm is back to normal and you can lease it again.' }
    : { title: 'Shamba lako limerudi kama kawaida', body: 'MAYODE: Asante, deni lako limelipwa. Shamba lako limerudi kama kawaida na unaweza kulikodisha tena.' };

export const takenOverMessage = (lang: Lang, p: { payer: string }): Msg =>
  lang === 'en'
    ? { title: 'Your debt was paid by another farmer', body: `MAYODE: ${p.payer} paid your debt to the AMCOS and will farm your farm this season. It returns to you next season.` }
    : { title: 'Deni lako limelipwa na mkulima mwingine', body: `MAYODE: ${p.payer} amelipa deni lako kwa AMCOS na atalima shamba lako msimu huu. Litarudi kwako msimu ujao.` };

/** Text for every farmer of the AMCOS when a farm becomes available on M-LAX. */
export const farmAvailableMessage = 'MAYODE M-LAX: Shamba linapatikana kwa kukodi kupitia M-LAX. Ingia M-LAX kuliona na kulikodi. / A farm is available to lease on M-LAX.';
