/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        wf: {
          navy:      '#0f1b2d',
          'navy-mid':'#1a2e47',
          'navy-lt': '#243d5c',
          blue:      '#2d6a9f',
          'blue-lt': '#5a9fd4',
          evergreen: '#1e5c3a',
          amber:     '#d4821a',
          'amber-lt':'#e8a84c',
          cream:     '#f4ede0',
          cranberry: '#9b2335',
          text:      '#e8dfd0',
          muted:     '#8a9bb0',
          subtle:    '#4a6080',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      animation: {
        'fade-in':    'fadeIn 0.6s ease both',
        'slide-up':   'slideUp 0.5s cubic-bezier(0.16,1,0.3,1) both',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:  { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp: { from: { opacity: 0, transform: 'translateY(20px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
