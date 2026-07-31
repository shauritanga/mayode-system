export function calculateFinancialRatios(input: { assets: number; liabilities: number; income: number; netProfit: number }) {
  return { liquidity: input.liabilities > 0 ? input.assets / input.liabilities : null, profitability: input.income > 0 ? input.netProfit / input.income : null, solvency: input.assets > 0 ? (input.assets - input.liabilities) / input.assets : null };
}
