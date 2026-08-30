export type PosTillOption = { id: string; name?: string };

export function resolvePosTillId(input: {
  requestedTillId?: string | null;
  savedTillId?: string | null;
  currentTillId?: string | null;
  tills: PosTillOption[];
  openShiftTillIds: string[];
}): string {
  const activeTillIds = new Set(input.tills.map((till) => till.id));
  const openTillIds = new Set(
    input.openShiftTillIds.filter((tillId) => activeTillIds.has(tillId)),
  );
  const isOpenTill = (tillId?: string | null): tillId is string =>
    Boolean(tillId && openTillIds.has(tillId));

  if (isOpenTill(input.requestedTillId)) return input.requestedTillId;
  if (isOpenTill(input.savedTillId)) return input.savedTillId;
  if (isOpenTill(input.currentTillId)) return input.currentTillId;
  return input.openShiftTillIds.find((tillId) => openTillIds.has(tillId)) ?? '';
}
