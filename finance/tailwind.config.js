/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
      colors: {
        brand: {
          50: 'var(--brand-50, #f0f7ff)',
          100: 'var(--brand-100, #e0effe)',
          500: 'var(--brand-500, #3b82f6)',
          600: 'var(--brand-600, #2563eb)',
          700: 'var(--brand-700, #1d4ed8)',
          900: 'var(--brand-900, #1e3a8a)',
        },
        primary: {
          DEFAULT: 'var(--color-primary, #3b82f6)',
          hover: 'var(--color-primary-hover, #2563eb)',
          active: 'var(--color-primary-active, #1d4ed8)',
          foreground: 'var(--color-primary-foreground, #ffffff)',
        },
        secondary: {
          DEFAULT: 'var(--color-secondary, #64748b)',
          hover: 'var(--color-secondary-hover, #475569)',
          foreground: 'var(--color-secondary-foreground, #f8fafc)',
        },
        success: {
          DEFAULT: 'var(--color-success, #10b981)',
          hover: 'var(--color-success-hover, #059669)',
          foreground: 'var(--color-success-foreground, #ffffff)',
        },
        warning: {
          DEFAULT: 'var(--color-warning, #f59e0b)',
          hover: 'var(--color-warning-hover, #d97706)',
          foreground: 'var(--color-warning-foreground, #ffffff)',
        },
        danger: {
          DEFAULT: 'var(--color-danger, #ef4444)',
          hover: 'var(--color-danger-hover, #dc2626)',
          foreground: 'var(--color-danger-foreground, #ffffff)',
        },
        accent: {
          DEFAULT: 'var(--color-accent, #f59e0b)',
          hover: 'var(--color-accent-hover, #d97706)',
          foreground: 'var(--color-accent-foreground, #ffffff)',
        },
        surface: {
          base: 'var(--color-bg-base, #050811)',
          DEFAULT: 'var(--color-bg-surface, #0f172a)',
          subtle: 'var(--color-bg-subtle, #1e293b)',
          elevated: 'var(--color-bg-elevated, #1e293b)',
        },
        'theme-text': {
          DEFAULT: 'var(--color-text-primary, #f8fafc)',
          secondary: 'var(--color-text-secondary, #94a3b8)',
          muted: 'var(--color-text-muted, #64748b)',
          inverted: 'var(--color-text-inverted, #0f172a)',
        },
        'theme-border': {
          DEFAULT: 'var(--color-border, #1e293b)',
          subtle: 'var(--color-border-subtle, rgba(255, 255, 255, 0.08))',
          focus: 'var(--color-border-focus, #3b82f6)',
        },
      },
    },
  },
  plugins: [],
};
