import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        control: {
          night: '#0d1b1e',
          ink: '#15272b',
          teal: '#1f8a82',
          moss: '#2f6f56',
          sand: '#f2ebe2',
          ember: '#b35c2e',
          gold: '#e2a83d',
          cloud: '#f7f4ef',
        },
      },
      boxShadow: {
        dashboard: '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.05)',
      },
      borderRadius: {
        panel: '0.75rem',
      },
    },
  },
  plugins: [],
};

export default config;