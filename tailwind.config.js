/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        // KNCHS Red and Gold color tokens
        crimson: {
          DEFAULT: '#9C1218',
          dark: '#6E0B10',
          deep: '#55080C',
          light: '#C62828',
          hover: '#831015',
        },
        gold: {
          DEFAULT: '#E8B923',
          light: '#FBE9A0',
          pale: '#FFF6D6',
          dark: '#B88E14',
        },
        cream: {
          DEFAULT: '#FFF8E7',
          light: '#FFFDF9',
          dark: '#F7EED3',
        },
        flame: '#E8541E',
        laurel: {
          DEFAULT: '#3F7D20',
          light: '#539E2E',
          dark: '#2E5C17',
          soft: '#EDF6E8',
        },
        ink: '#2B1B1B',
        // System primary palette mapped to crimson & gold
        primary: {
          50: '#FFF8E7',   // warm cream
          100: '#FFF6D6',  // pale gold
          200: '#FBE9A0',  // light gold
          300: '#E8B923',  // gold
          400: '#C62828',  // light crimson
          500: '#9C1218',  // crimson red
          600: '#831015',  // crimson hover
          700: '#6E0B10',  // dark crimson
          800: '#55080C',  // deep crimson
          900: '#3D0508',  // very dark crimson
        },
        // Deep crimson for sidebar and navbar
        navy: {
          DEFAULT: '#6E0B10',
          dark: '#55080C',
          light: '#9C1218',
        }
      },
      fontFamily: {
        sans: ['Roboto', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        'xl': '12px',
      }
    },
  },
  plugins: [],
};
