import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import ClassificationDisclosure from './ClassificationDisclosure';

afterEach(() => window.history.replaceState(null, '', '/'));

it('keeps hierarchy controls available through an expandable overview', () => {
  const { container } = render(<ClassificationDisclosure><label>Division<select><option>Christian living</option></select></label></ClassificationDisclosure>);
  const disclosure = container.querySelector('details')!;
  expect(disclosure.open).toBe(false);
  fireEvent.click(screen.getByText(/Classification performance —/));
  expect(disclosure.open).toBe(true);
  expect(screen.getByLabelText('Division')).toBeVisible();
});

it('opens the hierarchy for a direct classification link', () => {
  window.history.replaceState(null, '', '/reports/analytics#classification-performance');
  const { container } = render(<ClassificationDisclosure><div id="classification-performance">Group figures</div></ClassificationDisclosure>);
  expect(container.querySelector('details')!.open).toBe(true);
});
