/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0b0b0f",
          panel: "#14161b",
          hover: "#1a1f27",
          light: "#202630",
        },
        text: {
          DEFAULT: "#f3e9d2",
          dim: "#9da7b3",
          bright: "#ffffff",
        },
        gold: {
          DEFAULT: "#d6a23d",
          dim: "#b68424",
          bright: "#f0c96a",
          muted: "#4c4b4e",
        },
        crimson: {
          DEFAULT: "#c73a2c",
          dim: "#991f16",
          bright: "#ef7568",
        },
        hp: "#6ea66d",
        mp: "#5b7aa5",
        washi: {
          DEFAULT: "#14161b",
          dark: "#0b0b0f",
          light: "#202630",
        },
        sumi: {
          DEFAULT: "#14161b",
          light: "#9da7b3",
          dark: "#0b0b0f",
        },
        kiniro: {
          DEFAULT: "#d6a23d",
          light: "#f0c96a",
          dark: "#b68424",
          muted: "#4c4b4e",
        },
        shuiro: {
          DEFAULT: "#c73a2c",
          light: "#ef7568",
          dark: "#991f16",
        },
        matcha: {
          DEFAULT: "#6ea66d",
          light: "#8cc58b",
        },
        kassairo: {
          DEFAULT: "#14161b",
          light: "#202630",
        },
        kuroboshi: "#0b0b0f",
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
        'rpg': '0 18px 40px rgba(0,0,0,0.24), inset 0 1px 0 rgba(255,255,255,0.08)',
        'rpg-glow': '0 18px 40px rgba(214,162,61,0.12)',
        'rpg-red': '0 18px 40px rgba(199,58,44,0.18)',
        'inner-rpg': 'inset 0 1px 0 rgba(255,255,255,0.08)',
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
