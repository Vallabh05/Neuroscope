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
        neuro: {
          950: '#070b14',
          900: '#0c1222',
          850: '#111a30',
          800: '#162340',
          700: '#1e3258',
          600: '#284474',
          500: '#3863a3',
          400: '#5c8ad1',
          300: '#8bb3f0',
          200: '#c0d6f9',
          100: '#e5effd',
        },
        // Standard BraTS 2021 segmentation colours
        // WT: Whole Tumour (NCR + ED + ET) - Yellowish/Gold
        // TC: Tumour Core (NCR + ET) - Crimson/Orange
        // ET: Enhancing Tumour - Vibrant Cyan/Electric Blue
        // ED: Peritumoral Edema - Emerald Green
        // NCR: Necrotic / Non-enhancing core - Crimson/Red
        brats: {
          wt: '#eab308', // Amber / Gold
          tc: '#ef4444', // Red / Crimson
          et: '#06b6d4', // Cyan
          ed: '#10b981', // Emerald
          ncr: '#f97316', // Orange
        }
      },
      fontFamily: {
        mono: ['Consolas', 'monospace'],
        sans: ['system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
