export const RUHI_BOOKS = [
  { value: 'ruhi_1', sectionsPerUnit: 12 },
  { value: 'ruhi_2', sectionsPerUnit: 12 },
  { value: 'ruhi_3', sectionsPerUnit: 12 },
  { value: 'ruhi_4', sectionsPerUnit: 12 },
  { value: 'ruhi_5', sectionsPerUnit: 12 },
  { value: 'ruhi_6', sectionsPerUnit: 12 },
  { value: 'ruhi_7', sectionsPerUnit: 12 },
  { value: 'ruhi_8', sectionsPerUnit: 18 },
  { value: 'ruhi_9', sectionsPerUnit: 18 },
  { value: 'ruhi_10', sectionsPerUnit: 18 },
] as const;

export function getSectionsPerUnit(bookValue: string): number {
  return RUHI_BOOKS.find(b => b.value === bookValue)?.sectionsPerUnit ?? 12;
}
