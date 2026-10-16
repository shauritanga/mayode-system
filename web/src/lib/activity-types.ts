/** Crop activities in the order they happen across a rice season. */
export const ACTIVITY_TYPES: { key: string; label: string }[] = [
  { key: 'LAND_PREPARATION', label: 'Land preparation' },
  { key: 'SEED_SELECTION', label: 'Seed selection' },
  { key: 'NURSERY_ESTABLISHMENT', label: 'Nursery establishment' },
  { key: 'PLANTING', label: 'Planting / transplanting' },
  { key: 'FERTILIZING', label: 'Fertilizer application' },
  { key: 'WEEDING', label: 'Weeding' },
  { key: 'IRRIGATION', label: 'Irrigation' },
  { key: 'PEST_CONTROL', label: 'Pest and disease management' },
  { key: 'FIELD_INSPECTION', label: 'Field inspection' },
  { key: 'HARVESTING', label: 'Harvesting' },
  { key: 'DRYING', label: 'Drying' },
  { key: 'STORAGE', label: 'Storage' },
  { key: 'TRANSPORT', label: 'Transport' },
];

export const activityLabel = (key?: string | null) =>
  ACTIVITY_TYPES.find((t) => t.key === key)?.label ?? (key ? key.replace(/_/g, ' ').toLowerCase() : '—');

export const INPUT_UNITS = ['kg', 'g', 'litres', 'ml', 'bags', 'tonnes', 'pieces', 'hours'];

/** Input name, quantity and unit for display, falling back to the older free-form inputsUsed JSON. */
export function activityInputs(a: any): { text: string; quantity: string } {
  if (a.inputName) {
    return { text: a.inputName, quantity: a.inputQuantity != null ? `${a.inputQuantity.toLocaleString()} ${a.inputUnit ?? ''}`.trim() : '' };
  }
  const items = a.inputsUsed?.items;
  if (Array.isArray(items) && items.length) {
    return {
      text: items.map((i: any) => i.name).join(', '),
      quantity: items.map((i: any) => `${i.quantity} ${i.unit}`).join(', '),
    };
  }
  const legacy = a.inputsUsed;
  if (legacy && typeof legacy === 'object' && !Array.isArray(legacy)) {
    const name = legacy.fertilizerType ?? legacy.name ?? legacy.seedVariety ?? legacy.chemical ?? '';
    const qty = legacy.quantityKg != null ? `${legacy.quantityKg} kg` : legacy.quantity != null ? `${legacy.quantity} ${legacy.unit ?? ''}`.trim() : '';
    if (name || qty) return { text: String(name), quantity: qty };
  }
  return { text: '', quantity: '' };
}
