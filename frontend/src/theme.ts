import '@fontsource/public-sans/400.css'
import '@fontsource/public-sans/500.css'
import '@fontsource/public-sans/600.css'
import '@fontsource/public-sans/700.css'
import '@fontsource/space-grotesk/500.css'
import '@fontsource/space-grotesk/600.css'
import '@fontsource/space-grotesk/700.css'
import { createTheme, useTheme } from '@mui/material'
import { alpha } from '@mui/material/styles'
import type {} from '@mui/x-data-grid/themeAugmentation'

export type Mode = 'light' | 'dark'

/**
 * "Operations centre": a monitoring wall read in long sessions. A deep blue-black
 * ground, panels that catch a little light from above, big display figures in
 * Space Grotesk, and colour that means something: green, red and amber are status,
 * cyan marks selection and live data. Fleet Pulse's amber stays on the brand mark.
 * Night is the native theme; day carries the same rules on a cool light ground.
 */
const TOKENS = {
  dark: {
    bg: '#070a11',
    surface: '#0d1320',
    raised: '#141c2c',
    text: '#e9eef7',
    muted: '#8a97ad',
    rule: '#1b2538',
    ruleSoft: '#131b2b',
    control: '#2c3a55',
    /** Selection and live data. */
    accent: '#4cc9f0',
    accentHover: '#80dbf6',
    online: '#2fd6a1',
    offline: '#ff5a76',
    /** Below the RF threshold. */
    degraded: '#fbbf24',
    unknown: '#7d8aa1',
    amber: '#f2b33d',
    amberText: '#f2b33d',
  },
  light: {
    bg: '#f3f5f9',
    surface: '#ffffff',
    raised: '#edf0f6',
    text: '#0b1220',
    muted: '#566178',
    rule: '#dfe5ef',
    ruleSoft: '#edf0f6',
    control: '#c5cee0',
    accent: '#0a7aa8',
    accentHover: '#07607f',
    online: '#0d8f63',
    offline: '#d52b4a',
    degraded: '#9a5b06',
    unknown: '#64708a',
    amber: '#e39e1c',
    amberText: '#93650a',
  },
}

export type Tokens = (typeof TOKENS)['dark']

declare module '@mui/material/styles' {
  interface Palette {
    fp: Tokens
  }
  interface PaletteOptions {
    fp?: Tokens
  }
}

const FONT = '"Public Sans", Inter, system-ui, sans-serif'

/** Display face for titles and the big figures. Body text stays in Public Sans. */
export const HEADING = '"Space Grotesk", "Public Sans", system-ui, sans-serif'

/** Small labels over values: sentence case, 12px, the muted grey. No tracked capitals. */
export const LABEL = { fontSize: 12 } as const

export function makeTheme(mode: Mode) {
  const t = TOKENS[mode]
  return createTheme({
    palette: {
      mode,
      fp: t,
      primary: { main: t.accent, dark: t.accentHover, contrastText: mode === 'dark' ? '#000000' : '#ffffff' },
      success: { main: t.online },
      error: { main: t.offline },
      warning: { main: t.degraded },
      background: { default: t.bg, paper: t.surface },
      divider: t.rule,
      text: { primary: t.text, secondary: t.muted },
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily: FONT,
      fontSize: 13,
      h5: { fontFamily: HEADING, fontWeight: 600, fontSize: '1.625rem', lineHeight: 1.2, letterSpacing: '-0.01em' },
      h6: { fontFamily: HEADING, fontWeight: 600, fontSize: '1rem', lineHeight: 1.3 },
      button: { textTransform: 'none', fontWeight: 500, fontSize: 13 },
    },
    components: {
      MuiCssBaseline: {
        styleOverrides: {
          body: {
            // A faint cool light from the top, so the page is not one flat slab.
            backgroundImage:
              mode === 'dark'
                ? `radial-gradient(1200px 500px at 70% -10%, ${alpha(t.accent, 0.07)}, transparent 60%)`
                : `radial-gradient(1200px 500px at 70% -10%, ${alpha(t.accent, 0.08)}, transparent 60%)`,
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 13,
            WebkitTapHighlightColor: alpha(t.accent, 0.2),
          },
          'a, button, [role="button"]': { touchAction: 'manipulation' },
          'h1, h2': { textWrap: 'balance' },
          a: { color: t.text },
          ':focus-visible': { outline: `1px solid ${t.accent}`, outlineOffset: 2 },
          '::selection': { background: alpha(t.accent, 0.3) },
          // The newest point of the top-bar pulse breathes; off for reduced motion.
          '@keyframes pulse-ring': { from: { r: 3, opacity: 0.6 }, to: { r: 9, opacity: 0 } },
          '.pulse-ring': { animation: 'pulse-ring 2s ease-out infinite' },
          // A page's blocks rise into place one after another when it opens. Never hides content for reduced motion.
          '@keyframes fp-rise': { from: { opacity: 0, transform: 'translateY(14px)' }, to: { opacity: 1, transform: 'none' } },
          'main > .MuiStack-root > *': { animation: 'fp-rise .55s cubic-bezier(.2,.7,.2,1) both' },
          ...Object.fromEntries(
            Array.from({ length: 8 }, (_, i) => [`main > .MuiStack-root > :nth-of-type(${i + 1})`, { animationDelay: `${i * 70}ms` }]),
          ),
          '@media (prefers-reduced-motion: reduce)': {
            '.pulse-ring': { animation: 'none', opacity: 0 },
            'main > .MuiStack-root > *': { animation: 'none' },
          },
        },
      },
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: {
        defaultProps: { variant: 'outlined' },
        styleOverrides: { root: { background: t.surface, borderColor: t.rule, borderRadius: 12 } },
      },
      // Controls are pills; the primary is inverted ink, the rest outlined.
      MuiButton: {
        defaultProps: { disableElevation: true },
        styleOverrides: {
          root: {
            borderRadius: 999,
            minHeight: 34,
            paddingInline: 16,
            variants: [
              {
                props: { variant: 'contained' },
                style: {
                  backgroundColor: t.accent,
                  color: mode === 'dark' ? '#04131a' : '#ffffff',
                  fontWeight: 600,
                  boxShadow: `0 0 0 1px ${alpha(t.accent, 0.5)}, 0 6px 20px ${alpha(t.accent, 0.25)}`,
                  '&:hover': { backgroundColor: t.accentHover },
                },
              },
              {
                props: { variant: 'outlined' },
                style: {
                  borderColor: t.control,
                  color: t.text,
                  '&:hover': { borderColor: t.muted, backgroundColor: 'transparent' },
                },
              },
              { props: { variant: 'text' }, style: { color: t.text, paddingInline: 4, minWidth: 0 } },
            ],
          },
        },
      },
      // A segmented control: a pill track, the selected option a raised chip with an accent edge.
      MuiToggleButtonGroup: {
        styleOverrides: {
          root: {
            gap: 2,
            padding: 3,
            borderRadius: 999,
            backgroundColor: t.raised,
            border: `1px solid ${t.rule}`,
          },
        },
      },
      MuiToggleButton: {
        styleOverrides: {
          root: {
            border: 0,
            borderRadius: '999px !important',
            padding: '3px 14px',
            minWidth: 0,
            fontSize: 13,
            fontWeight: 500,
            textTransform: 'none',
            color: t.muted,
            '&:hover': { backgroundColor: 'transparent', color: t.text },
            '&.Mui-selected, &.Mui-selected:hover': {
              backgroundColor: mode === 'dark' ? alpha(t.accent, 0.16) : '#ffffff',
              color: mode === 'dark' ? t.accent : t.text,
              boxShadow: `inset 0 0 0 1px ${alpha(t.accent, mode === 'dark' ? 0.55 : 0.35)}`,
            },
          },
        },
      },
      MuiOutlinedInput: {
        styleOverrides: {
          root: {
            // Form fields keep 8px corners (a pill squashes a floating label); buttons stay pills.
            borderRadius: 10,
            backgroundColor: alpha(t.text, 0.02),
            '& .MuiOutlinedInput-notchedOutline': { borderColor: t.control },
            '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: t.muted },
            '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: t.accent, borderWidth: 1 },
            '&.Mui-focused': { boxShadow: `0 0 0 3px ${alpha(t.accent, 0.18)}` },
          },
        },
      },
      MuiMenu: { styleOverrides: { paper: { border: `1px solid ${t.rule}`, backgroundColor: t.raised } } },
      MuiTooltip: {
        styleOverrides: {
          tooltip: { backgroundColor: t.raised, color: t.text, fontSize: 12, border: `1px solid ${t.rule}` },
        },
      },
      MuiAlert: {
        styleOverrides: { root: { border: `1px solid ${t.rule}`, backgroundColor: t.raised, color: t.text } },
      },
      MuiDataGrid: {
        defaultProps: { rowHeight: 42, columnHeaderHeight: 38 },
        styleOverrides: {
          root: {
            border: 0,
            fontSize: 13,
            // The grid resets inherited numerals; figures in columns must line up digit for digit.
            fontVariantNumeric: 'tabular-nums',
            '--DataGrid-containerBackground': 'transparent',
            '--DataGrid-rowBorderColor': t.ruleSoft,
            '& .MuiDataGrid-columnHeaders': { borderBottom: `1px solid ${t.rule}`, backgroundColor: alpha(t.text, 0.025) },
            '& .MuiDataGrid-columnHeaderTitle': { fontSize: 12, color: t.muted, fontWeight: 500 },
            // No ring on click; a visible one when the keyboard moves focus.
            '& .MuiDataGrid-cell:focus, & .MuiDataGrid-cell:focus-within, & .MuiDataGrid-columnHeader:focus': {
              outline: 'none',
            },
            '& .MuiDataGrid-cell:focus-visible, & .MuiDataGrid-columnHeader:focus-visible': {
              outline: `1px solid ${t.accent}`,
              outlineOffset: -1,
            },
            '& .MuiDataGrid-row:hover': { backgroundColor: alpha(t.accent, 0.06) },
            '& .MuiDataGrid-columnSeparator': { display: 'none' },
            // Text never meets the panel edge: the first and last columns take the panel's padding.
            '& .MuiDataGrid-cell:first-of-type, & .MuiDataGrid-columnHeader:first-of-type': { paddingLeft: 20 },
            '& .MuiDataGrid-cell:last-of-type, & .MuiDataGrid-columnHeader:last-of-type': { paddingRight: 20 },
            '& .MuiDataGrid-footerContainer': { borderTop: `1px solid ${t.ruleSoft}`, color: t.muted },
          },
        },
      },
    },
  })
}

export const useTokens = () => useTheme().palette.fp
