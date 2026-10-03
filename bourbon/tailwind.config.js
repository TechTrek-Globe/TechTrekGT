/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bourbon: {
          50:  '#fdf8f0',
          100: '#f9ecce',
          200: '#f2d59a',
          300: '#e8b85c',
          400: '#e0963a',
          500: '#c97320',
          600: '#a85a18',
          700: '#854317',
          800: '#5a2d0f',
          900: '#3a1b09',
          950: '#1e0d04',
        },
        smoke: {
          50:  '#f5f4f2',
          100: '#e8e5df',
          200: '#ccc7bb',
          300: '#ada494',
          400: '#8f8371',
          500: '#736758',
          600: '#5a5044',
          700: '#433c32',
          800: '#2c2822',
          900: '#1a1712',
          950: '#0d0c09',
        },
      },
      fontFamily: {
        display: ['Playfair Display', 'Georgia', 'serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      animation: {
        'shimmer': 'shimmer 2s linear infinite',
        'pulse-soft': 'pulse-soft 3s ease-in-out infinite',
        'slide-up': 'slide-up 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fade-in 0.3s ease-out',
      },
      keyframes: {
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.7' },
        },
        'slide-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
