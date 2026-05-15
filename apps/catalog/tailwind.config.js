/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        audi: {
          red: '#E4002B',
          redDark: '#B80022',
        },
        whatsapp: {
          DEFAULT: '#25D366',
          dark: '#1EBE5D',
        },
        catalog: {
          bg: '#050505',
          panel: '#0B0B0B',
          card: '#111111',
          glass: 'rgba(17, 17, 17, 0.66)',
          text: '#FFFFFF',
          muted: '#B7B7B7',
          line: '#252525',
          ink: '#111318',
          coal: '#1C1F26',
          paper: '#F6F5F2',
          olive: '#67725E',
          gold: '#B8862B',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Montserrat', 'ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 18px 46px rgba(17, 19, 24, 0.12)',
        soft: '0 10px 24px rgba(17, 19, 24, 0.10)',
        card: '0 18px 48px rgba(0, 0, 0, 0.32)',
        red: '0 18px 38px rgba(228, 0, 43, 0.28)',
        redSoft: '0 18px 44px rgba(228, 0, 43, 0.18)',
        glow: '0 0 0 1px rgba(255,255,255,0.08), 0 24px 80px rgba(228, 0, 43, 0.18)',
        whatsapp: '0 18px 38px rgba(37, 211, 102, 0.32)',
      },
    },
  },
  plugins: [],
};
