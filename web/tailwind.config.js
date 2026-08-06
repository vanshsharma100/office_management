/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
        display: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          50: '#f6f7fb',
          100: '#eceef6',
          200: '#d5d9ea',
          300: '#b0b8d6',
          400: '#8590bd',
          500: '#6570a4',
          600: '#505889',
          700: '#42486f',
          800: '#2c3050',
          900: '#1a1c33',
          950: '#0e0f20',
        },
        brand: {
          50: '#eef4ff',
          100: '#dae6ff',
          200: '#bdd2ff',
          300: '#90b4ff',
          400: '#5b8bff',
          500: '#3563ff',
          600: '#1f42f5',
          700: '#1a33e1',
          800: '#1c2eb6',
          900: '#1d2e8f',
        },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 8px 24px -12px rgba(16,24,40,.14)',
        lift: '0 8px 30px -8px rgba(31,66,245,.28)',
        glow: '0 0 0 1px rgba(255,255,255,.06), 0 20px 50px -20px rgba(0,0,0,.6)',
      },
      backgroundImage: {
        mesh: 'radial-gradient(at 12% 8%, rgba(53,99,255,.28) 0px, transparent 55%), radial-gradient(at 88% 12%, rgba(168,85,247,.22) 0px, transparent 50%), radial-gradient(at 55% 95%, rgba(14,165,233,.18) 0px, transparent 55%)',
      },
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
