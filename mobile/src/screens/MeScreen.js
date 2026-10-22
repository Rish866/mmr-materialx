import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, setToken } from '../api';
import { colors, font, radius, spacing } from '../theme';
import { BigButton } from '../components/ui';

export default function MeScreen({ onSignedOut }) {
  const [me, setMe] = useState(null);
  const [name, setName] = useState('');
  const [business, setBusiness] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const u = await api.me();
        setMe(u); setName(u.name || ''); setBusiness(u.business_name || '');
      } catch {}
    })();
  }, []);

  async function save() {
    setBusy(true);
    try {
      await api.updateMe({ name, business_name: business });
      Alert.alert('Saved', 'Profile updated.');
    } catch (e) { Alert.alert('Error', e.message); }
    finally { setBusy(false); }
  }

  async function logout() {
    await setToken(null);
    onSignedOut();
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.body}>
        <Text style={font.h1}>My Profile</Text>
        <Text style={styles.phone}>+91 {me?.phone?.replace(/^91/, '') || ''}</Text>

        <Text style={styles.label}>Your name</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="e.g. Rajesh Sharma" placeholderTextColor={colors.textMuted} />

        <Text style={styles.label}>Business name</Text>
        <TextInput style={styles.input} value={business} onChangeText={setBusiness} placeholder="e.g. Sharma Industries" placeholderTextColor={colors.textMuted} />

        <BigButton title="Save" onPress={save} loading={busy} />
        <View style={{ height: spacing.md }} />
        <BigButton title="Log out" color={colors.surface} textColor={colors.danger} onPress={logout} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { padding: spacing.xl },
  phone: { ...font.muted, marginBottom: spacing.xl },
  label: { ...font.title, fontSize: 15, marginBottom: spacing.sm, marginTop: spacing.md },
  input: { height: 56, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.lg, fontSize: 16, color: colors.text, marginBottom: spacing.sm },
});
