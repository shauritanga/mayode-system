/**
 * Standard financial ratios, computed from the existing ledger-derived
 * balance sheet and P&L. `equity` here is total owners' equity (contributed
 * equity + retained earnings) — i.e. assets - liabilities — not just the
 * `3000 Cooperative equity` account balance, since retained earnings are
 * never posted to that account directly.
 */
export function calculateFinancialRatios(input: {
  assets: number;
  liabilities: number;
  cash: number;
  income: number;
  netProfit: number;
}) {
  const equity = input.assets - input.liabilities;
  return {
    liquidity: {
      currentRatio:
        input.liabilities > 0 ? input.assets / input.liabilities : null,
      quickRatio:
        input.liabilities > 0 ? input.cash / input.liabilities : null,
    },
    profitability: {
      netProfitMargin: input.income > 0 ? input.netProfit / input.income : null,
      returnOnAssets: input.assets > 0 ? input.netProfit / input.assets : null,
    },
    solvency: {
      debtToEquityRatio: equity > 0 ? input.liabilities / equity : null,
    },
  };
}
