/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#0d1117',
        secondary: '#161b22',
        terminal: '#060a10',
        amber: { DEFAULT: '#f59e0b' },
        accent: {
          cyan: '#00d4ff',
          purple: '#a855f7'
        },
        text: {
          primary: '#e6edf3',
          secondary: '#8b949e'
        },
        success: '#3fb950',
        error: '#f85149'
      },
      fontFamily: {
        orbitron: ['Orbitron', 'monospace'],
        inter: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace']
      },
      animation: {
        'glow': 'glow 2s ease-in-out infinite alternate',
        'slide-in': 'slideIn 0.3s ease-out',
        'slide-out': 'slideOut 0.3s ease-in',
        'progress': 'progress-indeterminate 1.5s ease-in-out infinite'
      },
      keyframes: {
        glow: {
          '0%': { textShadow: '0 0 20px #00d4ff, 0 0 40px #00d4ff' },
          '100%': { textShadow: '0 0 30px #a855f7, 0 0 60px #a855f7' }
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' }
        },
        slideOut: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-100%)' }
        },
        'progress-indeterminate': {
          '0%': { width: '0%', marginLeft: '0%' },
          '50%': { width: '40%' },
          '100%': { width: '0%', marginLeft: '100%' }
        }
      }
    },
  },
  plugins: [],
}
