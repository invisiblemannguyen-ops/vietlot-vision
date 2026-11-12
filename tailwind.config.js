/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        ink: {
          950: '#070a13',
          900: '#0b1020',
          850: '#0d1424',
          800: '#111a30',
          700: '#1a2542',
        },
      },
    },
  },
  plugins: [],
};
