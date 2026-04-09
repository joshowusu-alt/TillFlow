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
        card: '0 1px 3px rgba(13,27,30,0.06), 0 4px 16px rgba(13,27,30,0.08)',
        raised: '0 4px 8px rgba(13,27,30,0.08), 0 12px 32px rgba(13,27,30,0.10)',
        soft: '0 4px 12px -2px rgba(31,138,130,0.10), 0 12px 32px rgba(31,138,130,0.12)',
        glow: '0 0 24px rgba(31,138,130,0.22)',
      },
      borderRadius: {
        panel: '0.75rem',
      },
      transitionTimingFunction: {
        executive: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
      },
      fontFamily: {
        display: ['var(--font-display)', 'Space Grotesk', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;