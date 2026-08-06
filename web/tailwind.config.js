/** @type {import('tailwindcss').Config} */

// The accent flips with the theme: black on white, white on black. Every
// `brand-*` / `violet-*` / `sky-*` shade points at the same variable, so the
// whole interface stays monochrome without touching each component.
const accent = 'rgb(var(--accent) / <alpha-value>)';
const accentScale = Object.fromEntries(
  [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950].map((s) => [s, accent])
);

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        // Neutral scale — black, silver, white. Light and dark variants in the
        // markup (`text-ink-900 dark:text-ink-100`) already flip correctly.
        ink: {
          50: '#ffffff',
          100: '#f5f5f7',
          200: '#e6e6ea',
          300: '#d0d0d6',
          400: '#9c9ca6', // silver — muted text and icons, both themes
          500: '#75757f', // silver — secondary text
          600: '#4a4a52',
          700: '#2e2e34', // hairline borders on black
          800: '#17171a', // raised surface on black (list rows, tab track)
          900: '#000000', // primary text on white
          950: '#000000', // page background in dark mode
        },
        brand: { ...accentScale, DEFAULT: accent },
        violet: accentScale,
        sky: accentScale,
        // Only approve / pending / reject keep real colour — a monochrome
        // approval queue would be genuinely harder to read.
        emerald: {
          300: '#6ee7b7', 400: '#34d399', 500: '#10b981',
          600: '#059669', 700: '#047857',
        },
        amber: {
          300: '#fcd34d', 400: '#fbbf24', 500: '#f59e0b',
          600: '#d97706', 700: '#b45309',
        },
        rose: {
          300: '#fda4af', 400: '#fb7185', 500: '#f43f5e',
          600: '#e11d48', 700: '#be123c',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px -16px rgba(0,0,0,.12)',
        lift: '0 6px 24px -10px rgba(0,0,0,.35)',
        glow: '0 0 0 1px rgba(255,255,255,.07), 0 20px 50px -24px rgba(0,0,0,.9)',
      },
      letterSpacing: {
        tightest: '-0.035em',
      },
      // Tailwind's default opacity scale jumps 10 → 20, which is too coarse for
      // hairline borders and tinted surfaces. These also make the values usable
      // inside `@apply`, where off-scale modifiers are not resolved.
      opacity: { 8: '0.08', 12: '0.12', 15: '0.15', 18: '0.18' },
      keyframes: {
        'fade-up': { '0%': { opacity: 0, transform: 'translateY(8px)' }, '100%': { opacity: 1, transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
      animation: {
        'fade-up': 'fade-up .35s cubic-bezier(.2,.8,.2,1) both',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
