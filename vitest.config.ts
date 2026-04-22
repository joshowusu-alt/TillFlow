import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        include: ['**/*.test.{ts,tsx}'],
        exclude: ['**/node_modules/**', '.next', 'tishgroup-control/**'],
        pool: 'threads',
        fileParallelism: false,
        maxWorkers: 1,
        isolate: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'text-summary', 'json-summary'],
            include: ['lib/**/*.ts', 'app/actions/**/*.ts', 'hooks/**/*.ts'],
            exclude: ['**/*.test.ts', '**/*.test.tsx', '**/node_modules/**'],
            thresholds: {
                statements: 60,
                branches: 55,
                functions: 55,
                lines: 60,
            },
        }
    },
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './')
        }
    }
});
