export const MANAGER_PAGE_SIZES = [25, 50, 100] as const;
export type ManagerPageSize = (typeof MANAGER_PAGE_SIZES)[number];

export function isManagerPageSize(value: number): value is ManagerPageSize {
  return (MANAGER_PAGE_SIZES as readonly number[]).includes(value);
}

export function positiveInt(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
