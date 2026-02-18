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
        ink: '#111827',       // gray-900  (was #141414)
        paper: '#F8FAFC',     // slate-50  (was warm #f8f7f4)
        accent: '#1E40AF',    // blue-800  (was teal; now enterprise primary)
        accentSoft: '#EFF6FF',// blue-50   (was teal-tint)
        amber: '#D97706',     // amber-600 (was bright #f4b400; now proper warning)
        rose: '#DC2626',      // red-600   (was dark #b13b3b)
        // Additional semantic tokens
        success: '#059669',   // emerald-600 — profit / synced / positive
        successSoft: '#D1FAE5',// emerald-100
        muted: '#6B7280',     // gray-500  — secondary text
        surface: '#FFFFFF',   // pure white for cards
        border: '#E5E7EB',    // gray-200  — default border
      },
      boxShadow: {
        soft: '0 4px 6px -1px rgba(30, 64, 175, 0.05), 0 10px 30px rgba(30, 64, 175, 0.08)',
        card: '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 12px rgba(0, 0, 0, 0.04)',
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
