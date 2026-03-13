import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

vi.mock('react', async () => {
    const actual = await vi.importActual<typeof import('react')>('react');
    return {
        ...actual,
        cache: <T extends (...args: any[]) => any>(fn: T) => fn,
    };
});

// Mock navigator.onLine
Object.defineProperty(navigator, 'onLine', {
    writable: true,
    value: true
});

// Mock indexedDB for tests
const mockIDB = {
    open: () => Promise.resolve({
        transaction: () => ({
            objectStore: () => ({
                put: () => Promise.resolve(),
                get: () => Promise.resolve(null),
                getAll: () => Promise.resolve([]),
                clear: () => Promise.resolve(),
                delete: () => Promise.resolve()
            }),
            done: Promise.resolve()
        }),
        objectStoreNames: { contains: () => false },
        createObjectStore: () => ({
            createIndex: () => { }
        }),
        put: () => Promise.resolve(),
        get: () => Promise.resolve(null),
        getAll: () => Promise.resolve([])
    })
};

// @ts-ignore
global.indexedDB = mockIDB;
