export type TrendRange = 'weekly' | 'monthly' | 'yearly';

export interface CashEvent {
  date: string | Date;
  amount: number;
}

export interface TrendPoint {
  value: number;
  label: string;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function sumInRange(events: CashEvent[], from: Date, to: Date) {
  let total = 0;
  for (const event of events) {
    const when = new Date(event.date);
    if (Number.isNaN(when.getTime())) continue;
    if (when >= from && when < to) total += Number(event.amount) || 0;
  }
  return Math.round(total);
}

export function buildFinanceTrend(
  income: CashEvent[],
  expenses: CashEvent[],
  range: TrendRange,
  now = new Date(),
): { income: TrendPoint[]; expenses: TrendPoint[] } {
  const today = startOfDay(now);
  const incomePts: TrendPoint[] = [];
  const expensePts: TrendPoint[] = [];

  if (range === 'weekly') {
    for (let i = 6; i >= 0; i -= 1) {
      const from = addDays(today, -i);
      const to = addDays(from, 1);
      incomePts.push({
        value: sumInRange(income, from, to),
        label: from.toLocaleDateString(undefined, { weekday: 'short' }),
      });
      expensePts.push({
        value: sumInRange(expenses, from, to),
        label: from.toLocaleDateString(undefined, { weekday: 'short' }),
      });
    }
    return { income: incomePts, expenses: expensePts };
  }

  if (range === 'monthly') {
    for (let i = 3; i >= 0; i -= 1) {
      const from = addDays(today, -(i + 1) * 7);
      const to = i === 0 ? addDays(today, 1) : addDays(today, -i * 7);
      incomePts.push({
        value: sumInRange(income, from, to),
        label: `W${4 - i}`,
      });
      expensePts.push({
        value: sumInRange(expenses, from, to),
        label: `W${4 - i}`,
      });
    }
    return { income: incomePts, expenses: expensePts };
  }

  for (let i = 11; i >= 0; i -= 1) {
    const from = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const to = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    incomePts.push({
      value: sumInRange(income, from, to),
      label: from.toLocaleDateString(undefined, { month: 'short' }),
    });
    expensePts.push({
      value: sumInRange(expenses, from, to),
      label: from.toLocaleDateString(undefined, { month: 'short' }),
    });
  }
  return { income: incomePts, expenses: expensePts };
}
