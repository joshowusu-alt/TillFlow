import { describe, expect, it } from 'vitest';
import { formatCatalogueUnitLabel } from '@/lib/units';
import {
  SHARED_PIECE_UNIT_ID,
  defaultBaseUnitId,
  selectUnitsForBusiness,
} from '@/lib/units/selectable-units';

const sharedPiece = { id: SHARED_PIECE_UNIT_ID, name: 'piece', pluralName: 'pieces' };
const otherPiece = { id: 'piece-other', name: 'piece', pluralName: 'pieces' };
const carton = { id: 'carton-1', name: 'carton', pluralName: 'cartons' };
const junk = { id: 'junk-1', name: 'Piece-554150', pluralName: 'Pieces' };
const walkthrough = { id: 'walk-1', name: 'Walkthrough unit', pluralName: 'Walkthrough units' };
const ownCustom = { id: 'own-1', name: 'Tray', pluralName: 'Trays' };

describe('selectUnitsForBusiness', () => {
  const standards = [otherPiece, sharedPiece, carton, junk, walkthrough];

  it('gives a new business one standard row per name, defaulting to the shared piece', () => {
    const units = selectUnitsForBusiness({
      standardCandidates: standards,
      businessUnits: [],
    });

    expect(units.map((unit) => unit.name)).toEqual(['piece', 'carton']);
    expect(units.map((unit) => unit.id)).toEqual([SHARED_PIECE_UNIT_ID, 'carton-1']);
    expect(defaultBaseUnitId(units)).toBe(SHARED_PIECE_UNIT_ID);
    expect(units.map((unit) => unit.name)).not.toContain('Piece-554150');
    expect(units.map((unit) => unit.name)).not.toContain('Walkthrough unit');
  });

  it('keeps a tenant on the shared piece it already references and its own custom units', () => {
    const units = selectUnitsForBusiness({
      standardCandidates: standards,
      businessUnits: [sharedPiece, ownCustom, junk],
    });

    expect(units.map((unit) => unit.id)).toContain(SHARED_PIECE_UNIT_ID);
    expect(units.map((unit) => unit.id)).not.toContain('piece-other');
    expect(units.map((unit) => unit.id)).toContain('own-1');
    expect(units.map((unit) => unit.id)).toContain('junk-1');
    expect(defaultBaseUnitId(units)).toBe(SHARED_PIECE_UNIT_ID);
  });

  it('does not replace a business that already sells with a different exact piece row', () => {
    const units = selectUnitsForBusiness({
      standardCandidates: [sharedPiece, otherPiece, carton],
      businessUnits: [otherPiece],
    });

    expect(units.map((unit) => unit.id)).toContain('piece-other');
    expect(units.map((unit) => unit.id)).not.toContain(SHARED_PIECE_UNIT_ID);
  });
});

describe('formatCatalogueUnitLabel', () => {
  it('shows the base unit name instead of a sample quantity', () => {
    expect(formatCatalogueUnitLabel({ baseName: 'piece', basePlural: 'pieces' })).toBe('piece');
    expect(
      formatCatalogueUnitLabel({
        baseName: 'piece',
        basePlural: 'pieces',
        packagingName: 'carton',
        packagingConversion: 24,
      }),
    ).toBe('piece · 1 carton = 24 pieces');
  });
});
