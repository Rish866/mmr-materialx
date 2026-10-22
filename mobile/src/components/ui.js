import React from 'react';
import { Text, TouchableOpacity, View, StyleSheet, ActivityIndicator } from 'react-native';
import { colors, radius, sizes, spacing } from '../theme';

// Big primary button — 56dp min height, high contrast.
export function BigButton({ title, onPress, color = colors.primary, textColor = colors.white, loading, disabled, style }) {
  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled || loading}
      style={[styles.btn, { backgroundColor: disabled ? colors.border : color }, style]}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <Text style={[styles.btnText, { color: textColor }]}>{title}</Text>
      )}
    </TouchableOpacity>
  );
}

// Urgent / liquidation flag.
export function UrgentTag({ label = '🔴 URGENT', style }) {
  return (
    <View style={[styles.urgent, style]}>
      <Text style={styles.urgentText}>{label}</Text>
    </View>
  );
}

// Selectable chip (radius / category).
export function Chip({ label, active, onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: sizes.buttonHeight,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  btnText: { fontSize: 18, fontWeight: '800' },
  urgent: {
    backgroundColor: colors.danger,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  urgentText: { color: colors.white, fontWeight: '800', fontSize: 11 },
  chip: {
    height: sizes.chipHeight,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 15, fontWeight: '700', color: colors.text },
  chipTextActive: { color: colors.white },
});
