/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Vercel-inspired monochrome black & gray palette
        vercel: {
          black: '#000000',
          dark: '#0A0A0A',
          card: '#0A0A0A',
          cardHover: '#141414',
          border: '#222222',
          borderHover: '#333333',
          borderLight: '#444444',
          text: '#EDEDED',
          muted: '#888888',
          subtle: '#555555',
          white: '#FFFFFF',
        },
        // Map neuro-* tokens to Vercel black & gray scale for clean global propagation
        neuro: {
          950: '#000000', // Pure Vercel black background
          900: '#0A0A0A', // Primary card/surface
          850: '#111111', // Elevated surface
          800: '#222222', // Subtle border
          750: '#2A2A2A', // Border hover
          700: '#333333', // Border light
          600: '#444444', // Divider
          500: '#666666', // Mid gray
          400: '#888888', // Muted text
          300: '#A1A1A1', // Secondary text
          200: '#D4D4D4', // Light text
          100: '#EDEDED', // Off-white primary text
        },
        // Standard BraTS 2021 segmentation colours - distinct clinical markers
        brats: {
          wt: '#eab308', // Amber / Gold
          tc: '#ef4444', // Red / Crimson
          et: '#06b6d4', // Cyan
          ed: '#10b981', // Emerald
          ncr: '#f97316', // Orange
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
        sans: ['Geist', 'Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
