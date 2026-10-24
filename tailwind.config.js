/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: '#17231f',
        paper: '#f3f0e7',
        signal: '#e15c43',
        moss: '#2d6a53',
        amber: '#d09a36',
      },
    },
  },
  plugins: [],
};
