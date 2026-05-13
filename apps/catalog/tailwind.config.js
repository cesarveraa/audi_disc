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
          bg: '#0A0A0A',
          panel: '#121212',
          card: '#1A1A1A',
          text: '#E8E8E8',
          muted: '#9A9A9A',
          line: '#2A2A2A',
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
        whatsapp: '0 18px 38px rgba(37, 211, 102, 0.32)',
      },
    },
  },
  plugins: [],
};
