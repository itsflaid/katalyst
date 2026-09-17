/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,js,svelte,ts}'],
  theme: {
    extend: {
      // Token dari design.md ("Executive Precision") — bukan Tailwind
      // default palette. Nama key sengaja niru penamaan di design.md biar
      // gampang di-cross-reference pas nambah komponen baru.
      colors: {
        canvas: '#F7F3EA',
        surface: {
          DEFAULT: '#FFFFFF',
          dim: '#dddad1'
        },
        ink: {
          DEFAULT: '#0F172A', // heading / high-density label
          navy: '#172554' // primary ink & key actions
        },
        muted: '#64748B',
        border: {
          warm: '#E6E0D4', // border di atas canvas krem
          cool: '#E2E8F0', // border di dalam card putih
          input: '#CBD5E1'
        },
        placeholder: '#94A3B8',
        status: {
          positive: '#16A34A',
          'positive-bg': '#DCFCE7',
          'positive-border': '#86EFAC',
          warning: '#B45309',
          'warning-bg': '#FEF3C7',
          'warning-border': '#FCD34D',
          negative: '#DC2626',
          'negative-bg': '#FEE2E2',
          'negative-border': '#FCA5A5',
          neutral: '#475569',
          'neutral-bg': '#F1F5F9',
          'neutral-border': '#E2E8F0'
        },
        'table-header': '#F8FAFC',
        'table-row-hover': '#F8FAFC',
        'table-divider': '#F1F5F9'
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif']
      },
      fontSize: {
        'headline-xl': ['32px', { lineHeight: '40px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'headline-lg': ['24px', { lineHeight: '32px', letterSpacing: '-0.015em', fontWeight: '700' }],
        'headline-md': ['20px', { lineHeight: '28px', letterSpacing: '-0.01em', fontWeight: '600' }],
        'headline-sm': ['16px', { lineHeight: '24px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px' }],
        'body-md': ['14px', { lineHeight: '20px' }],
        'body-sm': ['12px', { lineHeight: '16px' }],
        'label-lg': ['14px', { lineHeight: '20px', letterSpacing: '0.01em', fontWeight: '600' }],
        'label-md': ['12px', { lineHeight: '16px', letterSpacing: '0.02em', fontWeight: '600' }],
        'label-sm': ['11px', { lineHeight: '14px', letterSpacing: '0.04em', fontWeight: '600' }],
        'num-display': ['28px', { lineHeight: '32px', letterSpacing: '-0.02em', fontWeight: '700' }],
        'num-cell': ['13px', { lineHeight: '18px', fontWeight: '600' }]
      },
      borderRadius: {
        DEFAULT: '4px', // dipakai input, table cell, badge, button
        panel: '6px' // maksimum, khusus card/dialog/panel
      },
      boxShadow: {
        level1: '0 1px 2px 0 rgba(15, 23, 42, 0.05)',
        level2: '0 4px 6px -1px rgba(15, 23, 42, 0.08), 0 2px 4px -2px rgba(15, 23, 42, 0.04)',
        level3: '0 10px 15px -3px rgba(15, 23, 42, 0.12)'
      }
    }
  },
  plugins: []
};
