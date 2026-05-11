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
        luxury: {
          ink: '#111827',
          muted: '#667085',
          line: '#E5E7EB',
          canvas: '#F7F8FA',
        },
      },
      borderRadius: {
        luxury: '20px',
        panel: '24px',
      },
      boxShadow: {
        luxury: '0 24px 70px rgba(17, 24, 39, 0.10)',
        card: '0 16px 48px rgba(17, 24, 39, 0.08)',
        button: '0 14px 28px rgba(228, 0, 43, 0.24)',
      },
    },
  },
  plugins: [],
};

