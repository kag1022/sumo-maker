/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // === 背景系（藍色ベース） ===
        bg: {
          DEFAULT: "#0a0e1a",   // メイン背景
          panel: "#111b2e",     // パネル内側
          hover: "#1a2844",     // ホバー/アクティブ
          light: "#1e3050",     // 明るめパネル
        },
        // === テキスト系 ===
        text: {
          DEFAULT: "#e8e0d0",   // メインテキスト
          dim: "#8a8472",       // サブテキスト
          bright: "#ffffff",    // 強調
        },
        // === アクセント: ゴールド（RPG風） ===
        gold: {
          DEFAULT: "#D4A017",
          dim: "#8B6914",
          bright: "#FFD700",
          muted: "#6B5010",
        },
        // === アクセント: 朱色 ===
        crimson: {
          DEFAULT: "#C84040",
          dim: "#8B2020",
          bright: "#FF5555",
        },
        // === ステータスカラー ===
        hp: "#44AA44",
        mp: "#4488DD",
        // === 旧名互換エイリアス（段階的に除去） ===
        washi: {
          DEFAULT: "#0a0e1a",
          dark: "#060a12",
          light: "#111b2e",
        },
        sumi: {
          DEFAULT: "#e8e0d0",
          light: "#8a8472",
          dark: "#ffffff",
        },
        kiniro: {
          DEFAULT: "#D4A017",
          light: "#FFD700",
          dark: "#8B6914",
          muted: "#6B5010",
        },
        shuiro: {
          DEFAULT: "#C84040",
          light: "#FF5555",
          dark: "#8B2020",
        },
        matcha: {
          DEFAULT: "#44AA44",
          light: "#55CC55",
        },
        kassairo: {
          DEFAULT: "#0a0e1a",
          light: "#111b2e",
        },
        kuroboshi: "#0a0a0a",
      },
      fontFamily: {
        pixel: ['"DotGothic16"', 'monospace'],
        sans: ['"Noto Sans JP"', '"Hiragino Kaku Gothic ProN"', '"Yu Gothic"', 'sans-serif'],
        // serif はピクセルフォントに置き換え
        serif: ['"DotGothic16"', 'monospace'],
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
        'rpg': 'inset 0 0 0 1px rgba(212,160,23,0.3), 0 4px 16px rgba(0,0,0,0.6)',
        'rpg-glow': '0 0 12px rgba(212,160,23,0.3), 0 0 24px rgba(212,160,23,0.1)',
        'rpg-red': '0 0 12px rgba(200,64,64,0.4), 0 0 24px rgba(200,64,64,0.15)',
        'inner-rpg': 'inset 0 2px 8px rgba(0,0,0,0.4)',
      },
      animation: {
        'blink': 'blink 1s step-end infinite',
        'flash': 'flash 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'text-reveal': 'textReveal 0.6s ease-out forwards',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
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
          '0%': { opacity: 0, transform: 'translateY(10px)' },
          '100%': { opacity: 1, transform: 'translateY(0)' },
        },
        textReveal: {
          '0%': { opacity: 0, transform: 'translateY(6px)' },
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
