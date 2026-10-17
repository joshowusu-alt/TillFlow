import { prisma } from '@/lib/prisma';
import {
  SHARED_PIECE_UNIT_ID,
  isExactStandardUnitName,
  selectUnitsForBusiness,
  standardUnitNameLookupValues,
  type SelectableUnit,
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
  const [standardCandidates, businessUnits, preferredPiece] = await Promise.all([
    prisma.unit.findMany({
      where: { name: { in: standardUnitNameLookupValues() } },
      select: { id: true, name: true, pluralName: true },
    }),
    prisma.unit.findMany({
      where: { productUnits: { some: { product: { businessId } } } },
      select: { id: true, name: true, pluralName: true },
    }),
    prisma.unit.findUnique({
      where: { id: SHARED_PIECE_UNIT_ID },
      select: { id: true, name: true, pluralName: true },
    }),
  ]);

  const standards = [...standardCandidates];
  if (
    preferredPiece &&
    isExactStandardUnitName(preferredPiece.name) &&
    !standards.some((unit) => unit.id === preferredPiece.id)
  ) {
    standards.push(preferredPiece);
  }

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
