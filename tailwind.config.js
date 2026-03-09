/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // === 背景系（和紙ベース） ===
        bg: {
          DEFAULT: "#efe7db",
          panel: "#f8f2e8",
          hover: "#f1e6d8",
          light: "#fcfaf5",
        },
        text: {
          DEFAULT: "#241b16",
          dim: "#6f6257",
          bright: "#17120e",
        },
        gold: {
          DEFAULT: "#9f7a34",
          dim: "#8f6a22",
          bright: "#b88a33",
          muted: "#cdbfa8",
        },
        crimson: {
          DEFAULT: "#9a4335",
          dim: "#7d2f26",
          bright: "#b25748",
        },
        hp: "#486d44",
        mp: "#4f6f84",
        washi: {
          DEFAULT: "#efe7db",
          dark: "#2a211c",
          light: "#f8f2e8",
        },
        sumi: {
          DEFAULT: "#241b16",
          light: "#6f6257",
          dark: "#17120e",
        },
        kiniro: {
          DEFAULT: "#9f7a34",
          light: "#b88a33",
          dark: "#8f6a22",
          muted: "#cdbfa8",
        },
        shuiro: {
          DEFAULT: "#9a4335",
          light: "#b25748",
          dark: "#7d2f26",
        },
        matcha: {
          DEFAULT: "#486d44",
          light: "#678864",
        },
        kassairo: {
          DEFAULT: "#efe7db",
          light: "#f8f2e8",
        },
        kuroboshi: "#17120e",
      },
      fontFamily: {
        pixel: ['"DotGothic16"', '"IBM Plex Sans JP"', '"Yu Gothic"', 'sans-serif'],
        sans: ['"DotGothic16"', '"IBM Plex Sans JP"', '"Hiragino Kaku Gothic ProN"', '"Yu Gothic"', 'sans-serif'],
        serif: ['"DotGothic16"', '"Shippori Mincho"', '"Hiragino Mincho ProN"', 'serif'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1rem' }],
        'sm': ['0.875rem', { lineHeight: '1.25rem' }],
        'base': ['1rem', { lineHeight: '1.5rem' }],
        'lg': ['1.125rem', { lineHeight: '1.75rem' }],
        'xl': ['1.25rem', { lineHeight: '1.75rem' }],
        '2xl': ['1.5rem', { lineHeight: '2rem' }],
        '3xl': ['1.875rem', { lineHeight: '2.25rem' }],
        '4xl': ['2.25rem', { lineHeight: '2.5rem' }],
        '5xl': ['3rem', { lineHeight: '1' }],
      },
      boxShadow: {
        'rpg': '0 18px 40px rgba(68,50,35,0.08), inset 0 1px 0 rgba(255,255,255,0.6)',
        'rpg-glow': '0 18px 40px rgba(159,122,52,0.12)',
        'rpg-red': '0 18px 40px rgba(154,67,53,0.14)',
        'inner-rpg': 'inset 0 1px 0 rgba(255,255,255,0.6)',
      },
      animation: {
        'blink': 'blink 1s step-end infinite',
        'flash': 'flash 0.3s steps(3, end)',
        'slide-up': 'slideUp 0.3s steps(4, end)',
        'text-reveal': 'textReveal 0.6s steps(5, end) forwards',
        'pulse-soft': 'pulseSoft 2s steps(4, end) infinite',
      },
      keyframes: {
        blink: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0 },
        },
        flash: {
          '0%': { backgroundColor: 'rgba(255,215,0,0.4)' },
          '100%': { backgroundColor: 'transparent' },
        },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(12px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        textReveal: {
          '0%': { opacity: 0, transform: 'translateY(8px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: 1 },
          '50%': { opacity: 0.7 },
        },
      },
    },
  },
  plugins: [],
};
