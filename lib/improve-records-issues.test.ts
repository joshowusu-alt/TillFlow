import { describe, expect, it } from 'vitest';
import {
  IMPROVE_RECORDS_ISSUE,
  IMPROVE_RECORDS_ISSUE_DEFS,
  parseImproveRecordsIssue,
  resolveProductsIssueParam,
} from '@/lib/improve-records-issues';

describe('improve-records-issues', () => {
  it('parses known issue keys case-insensitively', () => {
    expect(parseImproveRecordsIssue('missing_supplier')).toBe('MISSING_SUPPLIER');
    expect(parseImproveRecordsIssue('UNUSED_CATALOGUE')).toBe('UNUSED_CATALOGUE');
    expect(parseImproveRecordsIssue('bogus')).toBeNull();
  });

  it('maps legacy missingCost=1 to MISSING_COST', () => {
    expect(resolveProductsIssueParam({ missingCost: '1' })).toBe('MISSING_COST');
    expect(resolveProductsIssueParam({ issue: 'UNUSED_CATALOGUE', missingCost: '1' })).toBe(
      'UNUSED_CATALOGUE'
    );
  });

  it('every issue definition has a precise filtered destination', () => {
    expect(IMPROVE_RECORDS_ISSUE_DEFS.MISSING_SUPPLIER.href).toContain('issue=MISSING_SUPPLIER');
    expect(IMPROVE_RECORDS_ISSUE_DEFS.UNUSED_CATALOGUE.href).toContain('issue=UNUSED_CATALOGUE');
    expect(IMPROVE_RECORDS_ISSUE_DEFS.MISSING_COST.href).toContain('issue=MISSING_COST');
    expect(IMPROVE_RECORDS_ISSUE_DEFS.STOCK_SETUP_GAP.href).toContain('issue=STOCK_SETUP_GAP');
    expect(Object.keys(IMPROVE_RECORDS_ISSUE)).toHaveLength(4);
  });
});
