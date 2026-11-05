/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Palette à fort contraste pour une utilisation en extérieur.
        vert: {
          50: '#f3f9f1',
          100: '#e1f0dc',
          200: '#c2e0b9',
          500: '#2f8f3c',
          600: '#237a31',
          700: '#1b6428',
          800: '#17501f',
          900: '#14532d',
        },
      },
      minHeight: { tactile: '3.5rem' },
      fontSize: { base: ['1.0625rem', '1.6rem'] },
    },
  },
  plugins: [],
};
