import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)'],
        display: ['var(--font-display)']
      },
      colors: {
        ink: '#141414',
        paper: '#f8f7f4',
        accent: '#0b6b5d',
        accentSoft: '#e2f3ef',
        amber: '#f4b400',
        rose: '#b13b3b'
      },
      boxShadow: {
        soft: '0 10px 30px rgba(10, 10, 10, 0.08)',
        card: '0 8px 18px rgba(20, 20, 20, 0.08)'
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 0.5s ease-out',
      }
    }
  },
  plugins: []
};

export default config;
