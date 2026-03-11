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
        // Enterprise palette — deep indigo/blue for trust
        ink: '#111827',       // gray-900
        paper: '#F8FAFC',     // slate-50
        accent: '#1E40AF',    // blue-800 — enterprise primary
        accentSoft: '#EFF6FF',// blue-50
        // Additional semantic tokens
        success: '#059669',   // emerald-600 — profit / synced / positive
        successSoft: '#D1FAE5',// emerald-100
        muted: '#6B7280',     // gray-500  — secondary text
        surface: '#FFFFFF',   // pure white for cards
        border: '#E5E7EB',    // gray-200  — default border
        // amber & rose as full scales with DEFAULT key so both
        // bare (bg-amber) AND numbered (bg-amber-600) forms generate CSS.
        amber: {
          DEFAULT: '#D97706',
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        rose: {
          DEFAULT: '#DC2626',
          50:  '#FFF1F2',
          100: '#FFE4E6',
          200: '#FECDD3',
          300: '#FDA4AF',
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
          700: '#BE123C',
          800: '#9F1239',
          900: '#881337',
        },
        gold: {
          DEFAULT: '#F59E0B',
          50:  '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
      },
      boxShadow: {
        soft:   '0 4px 12px -2px rgba(30, 64, 175, 0.08), 0 12px 32px rgba(30, 64, 175, 0.10)',
        card:   '0 1px 3px rgba(15, 23, 42, 0.05), 0 4px 16px rgba(15, 23, 42, 0.06)',
        raised: '0 4px 8px rgba(15, 23, 42, 0.06), 0 12px 32px rgba(15, 23, 42, 0.08)',
        glow:   '0 0 24px rgba(30, 64, 175, 0.20)',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
        },
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'checkmark': {
          '0%': { strokeDashoffset: '100' },
          '100%': { strokeDashoffset: '0' },
        },
      },
      animation: {
        shimmer: 'shimmer 2s ease-in-out infinite',
        'fade-in-up': 'fade-in-up 0.3s ease-out',
        'slide-in-right': 'slideInRight 0.25s ease-out',
        'scale-in': 'scale-in 0.2s ease-out',
      }
    }
  },
  plugins: []
};

export default config;
