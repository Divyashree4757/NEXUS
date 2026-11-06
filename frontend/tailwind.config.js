/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0e17',          // app background, midnight navy
        panel: '#111724',       // cards
        raised: '#172033',      // hover / nested surfaces
        line: '#222c3f',        // thin borders
        line2: '#2d3950',
        fg: '#e6eaf2',
        sub: '#97a3b8',
        faint: '#64708a',
        primary: { DEFAULT: '#3b82f6', soft: '#1d3a6b', fg: '#93c5fd' },   // electric blue: actions
        memory: { DEFAULT: '#8b5cf6', soft: '#2e2357', fg: '#c4b5fd' },    // violet: anything that came from Hindsight
        ok: { DEFAULT: '#22c55e', soft: '#123524', fg: '#86efac' },
        warn: { DEFAULT: '#f59e0b', soft: '#3a2a0d', fg: '#fcd34d' },
        crit: { DEFAULT: '#ef4444', soft: '#3d1416', fg: '#fca5a5' },
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: { '2xs': ['11px', '16px'] },
      boxShadow: { card: '0 1px 0 0 rgba(255,255,255,0.03) inset, 0 8px 24px -12px rgba(0,0,0,0.6)' },
    },
  },
  plugins: [],
}
