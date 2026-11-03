import { expect, it } from 'vitest';
import { classificationSaveFailure } from './classification-save-failure';
it('preserves a redirected server action rejection instead of reporting a failed save', async () => {
  const redirect = Object.assign(new Error('NEXT_REDIRECT'), { digest: 'NEXT_REDIRECT;push;/products?tab=categories&setupAdd=division;307;' });
  await expect(Promise.reject(redirect).catch(classificationSaveFailure)).rejects.toBe(redirect);
});
it('returns useful feedback for an actual failed request', async () => {
  await expect(Promise.reject(new Error('Network unavailable')).catch(classificationSaveFailure)).resolves.toBe('Could not save. Please try again.');
});
