/** @type {import('tailwindcss').Config} */
const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        app: withOpacity("--twc-app"),
        line: withOpacity("--twc-line"),
        brand: {
          DEFAULT: withOpacity("--twc-brand"),
          ink: withOpacity("--twc-brand-ink"),
          panel: withOpacity("--twc-brand-panel"),
          raised: withOpacity("--twc-brand-raised"),
          line: withOpacity("--twc-brand-line"),
          muted: withOpacity("--twc-brand-muted"),
        },
        surface: {
          DEFAULT: withOpacity("--twc-surface"),
          base: withOpacity("--twc-surface-base"),
          panel: withOpacity("--twc-surface-panel"),
          raised: withOpacity("--twc-surface-raised"),
          soft: withOpacity("--twc-surface-soft"),
        },
        action: {
          DEFAULT: withOpacity("--twc-action"),
          dim: withOpacity("--twc-action-dim"),
          bright: withOpacity("--twc-action-bright"),
        },
        state: {
          DEFAULT: withOpacity("--twc-state"),
          dim: withOpacity("--twc-state-dim"),
          bright: withOpacity("--twc-state-bright"),
        },
        warning: {
          DEFAULT: withOpacity("--twc-warning"),
          dim: withOpacity("--twc-warning-dim"),
          bright: withOpacity("--twc-warning-bright"),
        },
        danger: {
          DEFAULT: withOpacity("--twc-danger"),
          bright: withOpacity("--twc-danger-bright"),
        },
        award: {
          DEFAULT: withOpacity("--twc-award"),
          bright: withOpacity("--twc-award-bright"),
        },
        // === 背景系（藍色ベース） ===
        bg: {
          DEFAULT: withOpacity("--twc-bg"),
          panel: withOpacity("--twc-bg-panel"),
          hover: withOpacity("--twc-bg-hover"),
          light: withOpacity("--twc-bg-light"),
        },
        // === テキスト系 ===
        text: {
          DEFAULT: withOpacity("--twc-text"),
          dark: withOpacity("--twc-text-dark"),
          dim: withOpacity("--twc-text-dim"),
          faint: withOpacity("--twc-text-faint"),
          bright: withOpacity("--twc-text-bright"),
        },
        // === アクセント: ゴールド（RPG風） ===
        gold: {
          DEFAULT: withOpacity("--twc-gold"),
          dim: withOpacity("--twc-gold-dim"),
          bright: withOpacity("--twc-gold-bright"),
          muted: withOpacity("--twc-gold-muted"),
        },
        // === アクセント: 朱色 ===
        crimson: {
          DEFAULT: withOpacity("--twc-crimson"),
          dim: withOpacity("--twc-crimson-dim"),
          bright: withOpacity("--twc-crimson-bright"),
        },
        // === ステータスカラー ===
        hp: withOpacity("--twc-hp"),
        mp: withOpacity("--twc-mp"),
        // === 旧名互換エイリアス（段階的に除去） ===
        washi: {
          DEFAULT: withOpacity("--twc-washi"),
          dark: withOpacity("--twc-washi-dark"),
          light: withOpacity("--twc-washi-light"),
        },
        sumi: {
          DEFAULT: withOpacity("--twc-sumi"),
          light: withOpacity("--twc-sumi-light"),
          dark: withOpacity("--twc-sumi-dark"),
        },
        kiniro: {
          DEFAULT: withOpacity("--twc-kiniro"),
          light: withOpacity("--twc-kiniro-light"),
          dark: withOpacity("--twc-kiniro-dark"),
          muted: withOpacity("--twc-kiniro-muted"),
        },
        shuiro: {
          DEFAULT: withOpacity("--twc-shuiro"),
          light: withOpacity("--twc-shuiro-light"),
          dark: withOpacity("--twc-shuiro-dark"),
        },
        matcha: {
          DEFAULT: withOpacity("--twc-matcha"),
          light: withOpacity("--twc-matcha-light"),
        },
        kassairo: {
          DEFAULT: withOpacity("--twc-kassairo"),
          light: withOpacity("--twc-kassairo-light"),
        },
        kuroboshi: withOpacity("--twc-kuroboshi"),
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
