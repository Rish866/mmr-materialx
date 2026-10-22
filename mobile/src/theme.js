// Central design tokens. High-contrast, big-touch, industrial look.
export const colors = {
  primary: '#1565C0',      // industrial blue (actions)
  primaryDark: '#0D47A1',
  danger: '#E53935',       // urgent / liquidation
  bg: '#FFFFFF',
  surface: '#F4F6F8',
  border: '#E0E4E8',
  text: '#121417',         // near-black, high contrast
  textMuted: '#5B6670',
  white: '#FFFFFF',
  success: '#2E7D32',
  whatsapp: '#25D366',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

// Big touch targets for factory-floor usability.
export const sizes = {
  buttonHeight: 56,          // >= 56dp per UX spec
  fabSize: 68,
  chipHeight: 44,
};

export const font = {
  h1: { fontSize: 24, fontWeight: '800', color: colors.text },
  h2: { fontSize: 20, fontWeight: '700', color: colors.text },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, fontWeight: '500', color: colors.text },
  muted: { fontSize: 14, fontWeight: '500', color: colors.textMuted },
  price: { fontSize: 20, fontWeight: '800', color: colors.primaryDark },
};
