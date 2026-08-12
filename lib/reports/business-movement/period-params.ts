/**
 * Resolve Business Movement period pair input from URL / export query params.
 * Default: last full calendar month vs prior month.
 */

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

export type BusinessMovementPeriodQuery = {
  preset?: string | null;
  currentFrom?: string | null;
  currentTo?: string | null;
  asOf?: Date;
};

export type BusinessMovementPeriodInput =
  | { preset: 'last_full_calendar_month'; asOf?: Date }
  | { preset: 'equal_length_custom'; currentFromKey: string; currentToKey: string };

export function resolveBusinessMovementPeriodInput(
  query: BusinessMovementPeriodQuery,
): BusinessMovementPeriodInput {
  const preset = (query.preset ?? 'last_full_calendar_month').trim();
  const from = (query.currentFrom ?? '').trim();
  const to = (query.currentTo ?? '').trim();

  if (
    preset === 'equal_length_custom' &&
    DATE_KEY.test(from) &&
    DATE_KEY.test(to) &&
    from <= to
  ) {
    return {
      preset: 'equal_length_custom',
      currentFromKey: from,
      currentToKey: to,
    };
  }

  return {
    preset: 'last_full_calendar_month',
    asOf: query.asOf,
  };
}
