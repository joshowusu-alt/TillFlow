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
        dashboard: '0 18px 50px rgba(13, 27, 30, 0.08)',
      },
      borderRadius: {
        panel: '1.5rem',
      },
    },
  },
  plugins: [],
};

export default config;