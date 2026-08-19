export type AllocationSource = { farmerId: string; weightKg: number };
export type SaleAllocation = {
  farmerId: string;
  inventoryWeightKg: number;
  weightShare: number;
  quantityKg: number;
  grossAmount: number;
  fairtradePremium: number;
};
export function apportionSale(
  sources: AllocationSource[],
  quantityKg: number,
  grossAmount: number,
  fairtradePremium = 0,
): SaleAllocation[] {
  const grouped = new Map<string, number>();
  for (const source of sources)
    grouped.set(
      source.farmerId,
      (grouped.get(source.farmerId) ?? 0) + source.weightKg,
    );
  const totalWeight = [...grouped.values()].reduce(
    (sum, weight) => sum + weight,
    0,
  );
  if (totalWeight <= 0)
    throw new Error('Lot source weight must be greater than zero');
  return [...grouped.entries()].map(([farmerId, inventoryWeightKg]) => {
    const weightShare = inventoryWeightKg / totalWeight;
    return {
      farmerId,
      inventoryWeightKg,
      weightShare,
      quantityKg: quantityKg * weightShare,
      grossAmount: grossAmount * weightShare,
      fairtradePremium: fairtradePremium * weightShare,
    };
  });
}
