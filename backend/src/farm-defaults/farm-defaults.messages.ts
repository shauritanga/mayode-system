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
export const noticeMessage = (lang: Lang, p: { debt: number; penalty: number; endsOn: Date }): Msg =>
  lang === 'en'
    ? { title: 'Two days left before your farm goes to M-LAX', body: `MAYODE: Your grace period ends ${when(p.endsOn)}. A penalty of ${tzs(p.penalty)} has been added to your debt, which is now ${tzs(p.debt)}. Pay it at the AMCOS before then. Otherwise your farm is given to MAYODE M-LAX, you get nothing from its lease, and paying the debt will no longer bring it back: you would have to lease it through M-LAX like anyone else.` }
    : { title: 'Siku mbili kabla shamba lako kupelekwa M-LAX', body: `MAYODE: Muda wako wa nyongeza unaisha ${when(p.endsOn)}. Faini ya ${tzs(p.penalty)} imeongezwa kwenye deni lako, ambalo sasa ni ${tzs(p.debt)}. Lipa AMCOS kabla ya hapo. Vinginevyo shamba lako litapewa MAYODE M-LAX, hutapata chochote kutoka kwa ukodishaji wake, na kulipa deni hakutalirudisha: utalazimika kulikodi kupitia M-LAX kama mtu mwingine yeyote.` };

/** The grace period is over and the farm is on M-LAX. */
export const onMlaxMessage = (lang: Lang, p: { penalty: number }): Msg =>
  lang === 'en'
    ? { title: 'Your farm is now on M-LAX', body: `MAYODE: The grace period is over. Your farm is now on MAYODE M-LAX and open to the public for leasing. Your debt includes a penalty of ${tzs(p.penalty)}. You receive nothing from its lease. To get it back you must lease it through M-LAX.` }
    : { title: 'Shamba lako sasa liko M-LAX', body: `MAYODE: Muda wa nyongeza umeisha. Shamba lako sasa liko MAYODE M-LAX na liko wazi kwa umma kukodishwa. Deni lako linajumuisha faini ya ${tzs(p.penalty)}. Hutapata chochote kutoka kwa ukodishaji wake. Ili kulirudisha lazima ulikodi kupitia M-LAX.` };

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

// ───────── what the farmer's block and canal leaders are told ─────────

const who = (p: { farmer: string; member?: string | null }) => `${p.farmer}${p.member ? ` (${p.member})` : ''}`;
const where = (blocks: string[]) => (blocks.length ? blocks.join(', ') : '');

/** Due-date reminder for the farmer. */
export const dueTodayMessage = (lang: Lang, p: { total: number; what: string }): Msg =>
  lang === 'en'
    ? { title: 'A payment is due today', body: `MAYODE: Your payment of ${tzs(p.total)} to the AMCOS (${p.what}) is due today. Pay on time to avoid a penalty and keep your farm.` }
    : { title: 'Malipo yanatakiwa leo', body: `MAYODE: Malipo yako ya ${tzs(p.total)} kwa AMCOS (${p.what}) yanatakiwa leo. Lipa kwa wakati ili kuepuka faini na kubaki na shamba lako.` };

/** One text a day to a leader, listing the members of their block or canal whose payment is due today. */
export const leaderDueDigest = (lang: Lang, p: { names: string[]; blocks: string[] }): Msg => {
  const shown = p.names.slice(0, 5).join(', ') + (p.names.length > 5 ? ` +${p.names.length - 5}` : '');
  return lang === 'en'
    ? { title: 'Members with a payment due today', body: `MAYODE: ${p.names.length} member(s) in ${where(p.blocks)} have a payment due today: ${shown}. Please remind them.` }
    : { title: 'Wanachama wenye malipo leo', body: `MAYODE: Wanachama ${p.names.length} katika ${where(p.blocks)} wana malipo yanayotakiwa leo: ${shown}. Tafadhali wakumbushe.` };
};

/** A member's debt went overdue and their farms are now under AMCOS administration. */
export const leaderBlockedMessage = (lang: Lang, p: { farmer: string; member?: string | null; debt: number; endsOn: Date; blocks: string[] }): Msg =>
  lang === 'en'
    ? { title: 'A member in your area is in default', body: `MAYODE: ${who(p)} in ${where(p.blocks)} is overdue (${tzs(p.debt)}). Their farms are under AMCOS administration until ${when(p.endsOn)}, then go to M-LAX unless paid.` }
    : { title: 'Mwanachama wako ana deni lililopita muda', body: `MAYODE: ${who(p)} katika ${where(p.blocks)} ana deni lililopita muda (${tzs(p.debt)}). Mashamba yake yako chini ya usimamizi wa AMCOS hadi ${when(p.endsOn)}, kisha yataenda M-LAX kama hajalipa.` };

/** The farms went to M-LAX. */
export const leaderMlaxMessage = (lang: Lang, p: { farmer: string; member?: string | null; blocks: string[] }): Msg =>
  lang === 'en'
    ? { title: 'Farms in your area are now on M-LAX', body: `MAYODE: The farms of ${who(p)} in ${where(p.blocks)} are now on M-LAX under AMCOS administration. Interested farmers can lease them through the MAYODE app, website or the AMCOS office.` }
    : { title: 'Mashamba katika eneo lako yako M-LAX', body: `MAYODE: Mashamba ya ${who(p)} katika ${where(p.blocks)} sasa yako M-LAX chini ya usimamizi wa AMCOS. Wakulima wanaweza kuyakodi kupitia app ya MAYODE, tovuti au ofisi ya AMCOS.` };
