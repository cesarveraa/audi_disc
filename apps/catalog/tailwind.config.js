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
        catalog: {
          ink: '#111318',
          coal: '#1C1F26',
          paper: '#F6F5F2',
          line: '#DDD8CF',
          olive: '#67725E',
          gold: '#B8862B',
        },
      },
      boxShadow: {
        panel: '0 18px 46px rgba(17, 19, 24, 0.12)',
        soft: '0 10px 24px rgba(17, 19, 24, 0.10)',
      },
    },
  },
  plugins: [],
};
