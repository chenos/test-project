// Database drivers may return timezone-less UTC datetime strings.
export function serializeDates<
  T extends { createdAt?: string; updatedAt?: string },
>(row: T): T {
  const iso = (value: string | undefined) =>
    value === undefined
      ? undefined
      : new Date(
          /[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`,
        ).toISOString();
  return {
    ...row,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
