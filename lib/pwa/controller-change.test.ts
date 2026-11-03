import { describe, expect, it, vi } from 'vitest';
import { createControllerChangeHandler } from './controller-change';

describe('service worker activation', () => {
  it('keeps first-load HTML and reloads once only when that controller is replaced', () => {
    let controller: object | null = null;
    const reload = vi.fn();
    const changed = createControllerChangeHandler(() => controller, reload);
    controller = {};
    changed();
    changed();
    expect(reload).not.toHaveBeenCalled();
    controller = {};
    changed();
    changed();
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('updates an already-controlled tab while ignoring duplicate notifications', () => {
    let controller: object | null = {};
    const replace = vi.fn();
    const changed = createControllerChangeHandler(() => controller, replace);
    changed();
    expect(replace).not.toHaveBeenCalled();
    controller = {};
    changed();
    expect(replace).toHaveBeenCalledTimes(1);
  });
});
