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
        // Aternos-inspired technical dark palette
        atern: {
          bg: '#0B0D10',           // Near-black main background
          surface: '#151A21',      // Charcoal secondary surfaces/cards
          hover: '#1C232D',        // Subtle elevation on hover
          active: '#242D38',       // Active surface state
          border: '#202833',       // Muted blue-grey borders & dividers
          'border-focus': '#1677D2', // Focused border
          blue: '#1677D2',         // Primary technical blue accent
          'blue-hover': '#1E88E5', // Hover accent blue
          'blue-dark': '#0D47A1',  // Deep blue tone
          text: '#DCE4ED',         // Cool off-white primary text
          muted: '#8593A3',        // Muted grey-blue secondary text
        },
        neuro: {
          950: '#0B0D10',
          900: '#151A21',
          850: '#1C232D',
          800: '#202833',
          750: '#283240',
          700: '#323E4F',
          600: '#4A5B73',
          500: '#1677D2',
          400: '#1E88E5',
          300: '#64B5F6',
          200: '#90CAF9',
          100: '#DCE4ED',
        },
        // Standard BraTS 2021 segmentation colours - distinct and clinical
        brats: {
          wt: '#D97706', // Amber / Gold
          tc: '#DC2626', // Red / Crimson
          et: '#0284C7', // Technical Blue / Cyan
          ed: '#10B981', // Emerald
          ncr: '#EA580C', // Orange / Dark Red
        }
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', '"Liberation Mono"', '"Courier New"', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
