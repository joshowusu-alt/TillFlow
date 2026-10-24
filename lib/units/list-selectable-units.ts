import { prisma } from '@/lib/prisma';
import { coalesceInFlightRead } from '@/lib/reliability/in-flight-read';
import {
  SHARED_PIECE_UNIT_ID,
  isExactStandardUnitName,
  selectUnitsForBusiness,
  standardUnitNameLookupValues,
} from '@/lib/units/selectable-units';

export type ListedSelectableUnit = {
  id: string;
  name: string;
  pluralName: string;
};

/**
 * Dropdown units for one business. Reads shared rows; does not insert,
 * update, or delete them.
 */
export async function listSelectableUnits(businessId: string): Promise<ListedSelectableUnit[]> {
  return coalesceInFlightRead(`selectable-units:${businessId}`, () => readSelectableUnits(businessId));
}

async function readSelectableUnits(businessId: string): Promise<ListedSelectableUnit[]> {
  const [standardCandidates, businessUnits] = await Promise.all([
    prisma.unit.findMany({
      where: { OR: [
        { name: { in: standardUnitNameLookupValues() } },
        { id: SHARED_PIECE_UNIT_ID },
      ] },
      select: { id: true, name: true, pluralName: true },
    }),
    prisma.unit.findMany({
      where: { productUnits: { some: { product: { businessId } } } },
      select: { id: true, name: true, pluralName: true },
    }),
  ]);

  const standards = standardCandidates.filter(unit => isExactStandardUnitName(unit.name));

  return selectUnitsForBusiness({
    standardCandidates: standards,
    businessUnits,
    preferredPieceId: SHARED_PIECE_UNIT_ID,
  }).map((unit) => ({
    id: unit.id,
    name: unit.name,
    pluralName: unit.pluralName?.trim() || unit.name,
  }));
}
