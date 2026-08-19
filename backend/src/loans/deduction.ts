export type DeductibleLoan = {
  id: string;
  amountOwed: number;
  autoDeductPercent: number | null;
};
export function calculateLoanDeductions(
  paymentAmount: number,
  loans: DeductibleLoan[],
) {
  let remaining = paymentAmount;
  const deductions = loans
    .map((loan) => {
      const amount = Math.min(
        paymentAmount * ((loan.autoDeductPercent ?? 0) / 100),
        loan.amountOwed,
        remaining,
      );
      remaining -= amount;
      return { loanId: loan.id, amount };
    })
    .filter((item) => item.amount > 0);
  return {
    deductions,
    totalDeduction: paymentAmount - remaining,
    netAmount: remaining,
  };
}
