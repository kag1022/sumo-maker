/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        washi: {
          DEFAULT: "#f5f0e6",
          dark: "#e6dfd1",
        },
        sumi: {
          DEFAULT: "#2b2b2b",
          light: "#4a4a4a",
        },
        shuiro: {
          DEFAULT: "#b84c39",
          light: "#d26653",
        },
        kuroboshi: "#1a1a1a",
        matcha: "#5c6e46",
        kassairo: "#203744",
      },
      fontFamily: {
        sans: [
          '"Shippori Mincho"',
          '"Hiragino Mincho ProN"',
          '"Yu Mincho"',
          "serif",
        ],
        serif: [
          '"Shippori Mincho"',
          '"Hiragino Mincho ProN"',
          '"Yu Mincho"',
          "serif",
        ],
      },
    },
  },
  plugins: [],
};
