import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, setToken } from '../api';
import { colors, font, radius, spacing } from '../theme';
import { BigButton } from '../components/ui';

export default function LoginScreen({ onSignedIn }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState('phone'); // phone | otp
  const [busy, setBusy] = useState(false);

  async function send() {
    if (phone.replace(/\D/g, '').length < 10) return Alert.alert('Enter a valid mobile number');
    setBusy(true);
    try { await api.sendOtp(phone); setStage('otp'); }
    catch (e) { Alert.alert('Could not send OTP', e.message); }
    finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true);
    try {
      const { token } = await api.verifyOtp(phone, code);
      await setToken(token);
      onSignedIn();
    } catch (e) { Alert.alert('Invalid OTP', e.message); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.wrap}>
        <Text style={styles.brand}>MMR MaterialX</Text>
        <Text style={styles.tag}>Buy & sell surplus raw material locally, in 24 hours.</Text>

        {stage === 'phone' ? (
          <>
            <Text style={styles.label}>Mobile number / मोबाइल नंबर</Text>
            <TextInput style={styles.input} keyboardType="phone-pad" value={phone}
              onChangeText={setPhone} placeholder="10-digit number" placeholderTextColor={colors.textMuted} maxLength={13} />
            <BigButton title="Send OTP" onPress={send} loading={busy} />
          </>
        ) : (
          <>
            <Text style={styles.label}>Enter OTP sent to +91 {phone}</Text>
            <TextInput style={[styles.input, styles.otp]} keyboardType="number-pad" value={code}
              onChangeText={setCode} placeholder="● ● ● ● ● ●" placeholderTextColor={colors.textMuted} maxLength={6} />
            <BigButton title="Verify & Continue" onPress={verify} loading={busy} />
            <Text style={styles.resend} onPress={send}>Resend OTP</Text>
          </>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  wrap: { flex: 1, padding: spacing.xl, justifyContent: 'center' },
  brand: { fontSize: 32, fontWeight: '900', color: colors.primaryDark, textAlign: 'center' },
  tag: { ...font.muted, textAlign: 'center', marginTop: spacing.sm, marginBottom: spacing.xxl, lineHeight: 22 },
  label: { ...font.title, fontSize: 15, marginBottom: spacing.sm },
  input: { height: 56, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 18, color: colors.text, marginBottom: spacing.lg },
  otp: { textAlign: 'center', letterSpacing: 6, fontWeight: '800' },
  resend: { ...font.muted, color: colors.primary, textAlign: 'center', marginTop: spacing.lg, fontWeight: '700' },
});
