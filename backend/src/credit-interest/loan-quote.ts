import { Terms, Rate, cents, interestOf, periodsFor, rateOn } from './interest-schedule';

const DEFAULT: Terms = { enabled: false, period: 'MONTHLY', graceDays: 0, paymentOrder: 'INTEREST_FIRST' };
const grouped = (n: number) => `TZS ${Math.round(n).toLocaleString('en-US')}`;
const pct = (n: number) => `${Number(n.toFixed(3))}%`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

type Db = { inputCreditTerms: { findUnique: (a: any) => Promise<any> }; inputInterestRate: { findMany: (a: any) => Promise<any[]> } };

/** The AMCOS's own interest terms and rates (nothing is built in: no rate set means no interest). */
export async function loadTerms(db: Db, mamcosId: string): Promise<{ terms: Terms; rates: Rate[] }> {
  const [t, r] = await Promise.all([
    db.inputCreditTerms.findUnique({ where: { mamcosId } }),
    db.inputInterestRate.findMany({ where: { mamcosId }, orderBy: { validFrom: 'asc' } }),
  ]);
  return {
    terms: t ? { enabled: t.enabled, period: t.period, graceDays: t.graceDays, paymentOrder: t.paymentOrder } : DEFAULT,
    rates: r.map((x: any) => ({ id: x.id, label: x.label, ratePercent: Number(x.ratePercent), validFrom: x.validFrom, validTo: x.validTo })),
  };
}

export interface LoanQuote {
  principal: number;
  interestEnabled: boolean;
  /** The rate that applies on the day given, per period (month or season); null when none is set. */
  ratePercent: number | null;
  period: 'MONTHLY' | 'SEASON';
  /** Interest for one period on the whole principal. */
  perPeriodInterest: number;
  /** Interest up to the due date, when there is one; null otherwise. */
  interestToDue: number | null;
  totalToDue: number | null;
  graceDays: number;
  paymentOrder: Terms['paymentOrder'];
  dueDate: Date | null;
}

/** What a credit will cost, worked out from the AMCOS's current terms. The same rules the daily interest run uses, so the figures agree. */
export function quoteLoan(terms: Terms, rates: Rate[], principal: number, issuedOn: Date, dueDate: Date | null): LoanQuote {
  const base: LoanQuote = { principal: cents(principal), interestEnabled: false, ratePercent: null, period: terms.period, perPeriodInterest: 0, interestToDue: null, totalToDue: null, graceDays: terms.graceDays, paymentOrder: terms.paymentOrder, dueDate };
  if (!terms.enabled) return { ...base, interestToDue: 0, totalToDue: cents(principal) };
  const horizon = new Date(Date.UTC(issuedOn.getUTCFullYear() + 1, issuedOn.getUTCMonth(), issuedOn.getUTCDate()));
  const all = periodsFor(terms, rates, issuedOn, horizon).filter((p) => p.ratePercent != null);
  const rate = all[0]?.ratePercent ?? rateOn(rates, issuedOn)?.ratePercent ?? [...rates].sort((a, b) => +a.validFrom - +b.validFrom).find((r) => !r.validTo || r.validTo >= issuedOn)?.ratePercent ?? null;
  const perPeriodInterest = rate == null ? 0 : interestOf(principal, rate);
  const upTo = dueDate ? periodsFor(terms, rates, issuedOn, dueDate).filter((p) => p.ratePercent != null) : null;
  const interestToDue = upTo ? cents(upTo.reduce((n, p) => n + interestOf(principal, p.ratePercent!), 0)) : null;
  return { ...base, interestEnabled: true, ratePercent: rate, perPeriodInterest, interestToDue, totalToDue: interestToDue == null ? null : cents(principal + interestToDue) };
}

/** The loan details the farmer is told when the fertiliser is approved or given: amount, interest, total and how repayment works. */
export function loanSummary(q: LoanQuote, language: string | null | undefined): string {
  const en = language === 'en';
  const loan = grouped(q.principal);
  if (!q.interestEnabled) {
    return en ? `Loan: ${loan}. Interest: none. Total to repay: ${loan}.${q.dueDate ? ` Pay by ${ymd(q.dueDate)}.` : ''}`
      : `Mkopo: ${loan}. Riba: hakuna. Jumla ya kulipa: ${loan}.${q.dueDate ? ` Lipa kabla ya ${ymd(q.dueDate)}.` : ''}`;
  }
  const per = q.period === 'MONTHLY' ? (en ? 'month' : 'mwezi') : (en ? 'season' : 'msimu');
  if (q.ratePercent == null) {
    return en ? `Loan: ${loan}. Interest: the AMCOS has not set the rate yet; you will be told before any is charged. Repay the loan by the due date.`
      : `Mkopo: ${loan}. Riba: AMCOS haijaweka kiwango bado; utajulishwa kabla ya kutozwa. Lipa mkopo kabla ya tarehe ya mwisho.`;
  }
  const head = en ? `Loan: ${loan}. Interest: ${pct(q.ratePercent)} per ${per} = ${grouped(q.perPeriodInterest)} per ${per}.` : `Mkopo: ${loan}. Riba: ${pct(q.ratePercent)} kwa ${per} = ${grouped(q.perPeriodInterest)} kwa ${per}.`;
  const total = q.interestToDue != null && q.totalToDue != null
    ? (en ? ` By ${ymd(q.dueDate!)}: interest ${grouped(q.interestToDue)}, total to repay ${grouped(q.totalToDue)}.` : ` Hadi ${ymd(q.dueDate!)}: riba ${grouped(q.interestToDue)}, jumla ya kulipa ${grouped(q.totalToDue)}.`)
    : (en ? ` Total to repay after one ${per}: ${grouped(q.principal + q.perPeriodInterest)} (loan + interest); it grows by ${grouped(q.perPeriodInterest)} each ${per} until repaid.` : ` Jumla ya kulipa baada ya ${per} 1: ${grouped(q.principal + q.perPeriodInterest)} (mkopo + riba); huongezeka kwa ${grouped(q.perPeriodInterest)} kila ${per} hadi ulipe.`);
  const grace = q.graceDays ? (en ? ` Interest starts ${q.graceDays} days after you receive the fertiliser.` : ` Riba huanza siku ${q.graceDays} baada ya kupokea mbolea.`) : '';
  const order = q.paymentOrder === 'INTEREST_FIRST' ? (en ? ' Payments clear interest first.' : ' Malipo hulipa riba kwanza.') : (en ? ' Payments clear the loan first.' : ' Malipo hulipa mkopo kwanza.');
  return head + total + grace + order;
}
