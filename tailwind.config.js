/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        washi: {
          DEFAULT: "#0f1923",
          dark: "#0a1018",
          light: "#1a2736",
        },
        sumi: {
          DEFAULT: "#e8dcc8",
          light: "#a09882",
          dark: "#c8bca8",
        },
        shuiro: {
          DEFAULT: "#c4513a",
          light: "#d96a55",
          dark: "#a43d28",
        },
        kuroboshi: "#1a1a1a",
        matcha: {
          DEFAULT: "#5c6e46",
          light: "#7a9460",
        },
        kassairo: {
          DEFAULT: "#0d1b2a",
          light: "#1b2d44",
        },
        kiniro: {
          DEFAULT: "#c5a44e",
          light: "#dbbe6a",
          dark: "#a08838",
          muted: "#8a7a42",
        },
      },
      fontFamily: {
        sans: [
          '"Noto Sans JP"',
          '"Hiragino Kaku Gothic ProN"',
          '"Yu Gothic"',
          "sans-serif",
        ],
        serif: [
          '"Shippori Mincho"',
          '"Hiragino Mincho ProN"',
          '"Yu Mincho"',
          "serif",
        ],
      },
      boxShadow: {
        'game': '0 0 15px rgba(197, 164, 78, 0.15)',
        'game-lg': '0 0 30px rgba(197, 164, 78, 0.2)',
        'glow-red': '0 0 12px rgba(196, 81, 58, 0.3)',
        'inner-game': 'inset 0 2px 8px rgba(0,0,0,0.3)',
      },
      animation: {
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        glow: {
          '0%': { boxShadow: '0 0 5px rgba(197, 164, 78, 0.2)' },
          '100%': { boxShadow: '0 0 20px rgba(197, 164, 78, 0.4)' },
        },
        slideUp: {
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
