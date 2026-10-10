/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#EAF2FB',
          100: '#d0e6f7',
          200: '#a3cdef',
          300: '#75b3e7',
          400: '#4899de',
          500: '#1565C0',
          600: '#1254a0',
          700: '#0e4380',
          800: '#0D3B7A',
          900: '#092d61',
        },
        navy: {
          DEFAULT: '#0D3B7A',
          dark: '#092d61',
          light: '#1254a0',
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
