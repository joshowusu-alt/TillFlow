import { describe, expect, it } from 'vitest';
import {
  RELIABILITY_PREVIEW_QA_TAG,
  resolveRegisterQaTag,
} from './preview-qa-tag';

describe('resolveRegisterQaTag', () => {
  it('applies the reliability QA tag on Preview only', () => {
    expect(
      resolveRegisterQaTag({
        vercelEnv: 'preview',
        requestedTag: RELIABILITY_PREVIEW_QA_TAG,
      }),
    ).toBe(RELIABILITY_PREVIEW_QA_TAG);
  });

  it('rejects Production even when a QA tag is requested', () => {
    expect(
      resolveRegisterQaTag({
        vercelEnv: 'production',
        requestedTag: RELIABILITY_PREVIEW_QA_TAG,
      }),
    ).toBeUndefined();
  });

  it('ignores unknown tags and missing Preview identity', () => {
    expect(resolveRegisterQaTag({ vercelEnv: 'preview', requestedTag: 'OTHER' })).toBeUndefined();
    expect(resolveRegisterQaTag({ vercelEnv: null, requestedTag: RELIABILITY_PREVIEW_QA_TAG })).toBeUndefined();
  });
});
