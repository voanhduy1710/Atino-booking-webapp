/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#E3B2E2',
        'primary-foreground': '#000000',
        background: '#FFFFFF',
        border: '#E0E0E0',
        muted: '#888888',
        error: '#CC0000',
        surface: '#F5F5F5',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '8px',
      },
    },
  },
  plugins: [],
}
