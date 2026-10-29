import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, StyleSheet, TouchableOpacity,
  Dimensions, Modal, TextInput, Linking, Alert, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api';
import { colors, font, radius, spacing } from '../theme';
import { BigButton, UrgentTag } from '../components/ui';
import { formatPrice, formatQty, formatDistance, hoursLeft } from '../format';

const { width } = Dimensions.get('window');

export default function ListingScreen({ route, navigation }) {
  const { id } = route.params;
  const [item, setItem] = useState(null);
  const [offerOpen, setOfferOpen] = useState(false);
  const [offer, setOffer] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      try { setItem(await api.listing(id)); }
      catch (e) { Alert.alert('Error', e.message); navigation.goBack(); }
    })();
  }, [id]);

  async function openWhatsApp(offerPrice) {
    setBusy(true);
    try {
      const { whatsapp_url } = await api.interest(id, offerPrice ?? null);
      // wa.me is a standard https link: WhatsApp (if installed) or the browser
      // both handle it, so no Android package-visibility query is needed.
      try {
        await Linking.openURL(whatsapp_url);
      } catch {
        Alert.alert(
          'WhatsApp not available',
          'Could not open WhatsApp. Make sure WhatsApp is installed, or copy the seller\'s number from the listing.'
        );
      }
    } catch (e) {
      Alert.alert('Could not reach the seller', e.message);
    } finally {
      setBusy(false);
      setOfferOpen(false);
    }
  }

  function sendOffer() {
    const n = parseFloat(offer);
    if (!n) return Alert.alert('Enter an amount', 'Please type your offer price.');
    openWhatsApp(n);
  }

  if (!item) {
    return (
      <SafeAreaView style={styles.safe}>
        <ActivityIndicator style={{ marginTop: 80 }} color={colors.primary} size="large" />
      </SafeAreaView>
    );
  }

  const hrs = hoursLeft(item.expires_at);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.backTxt}>←</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={{ paddingBottom: 110 }}>
        {/* Photo carousel */}
        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {(item.photos?.length ? item.photos : ['https://picsum.photos/600']).map((uri, i) => (
            <Image key={i} source={{ uri }} style={styles.hero} />
          ))}
        </ScrollView>

        <View style={styles.body}>
          {item.is_urgent ? (
            <UrgentTag label={hrs != null ? `🔴 URGENT · Clears in ${hrs} h` : '🔴 URGENT'} />
          ) : null}
          <Text style={styles.title}>{item.title}</Text>
          <Text style={styles.price}>{formatPrice(item)}</Text>
          <Text style={styles.meta}>{formatQty(item)}</Text>
          <Text style={styles.meta}>📍 {item.hub_name} · {formatDistance(item.distance_km)}</Text>
          <Text style={styles.meta}>Category: {item.category_name}</Text>

          <View style={styles.divider} />
          <Text style={styles.sellerLabel}>Seller</Text>
          <Text style={styles.seller}>{item.seller_business || item.seller_name || 'Verified seller'}</Text>
        </View>
      </ScrollView>

      {/* Action bar */}
      <View style={styles.actionBar}>
        <BigButton title="💰 Make Offer" color={colors.surface} textColor={colors.primaryDark}
          style={{ flex: 1 }} onPress={() => setOfferOpen(true)} />
        <View style={{ width: spacing.md }} />
        <BigButton title="💬 WhatsApp" color={colors.whatsapp} style={{ flex: 1 }}
          loading={busy} onPress={() => openWhatsApp(null)} />
      </View>

      {/* Offer bottom sheet */}
      <Modal transparent visible={offerOpen} animationType="slide" onRequestClose={() => setOfferOpen(false)}>
        <TouchableOpacity style={styles.sheetBg} activeOpacity={1} onPress={() => setOfferOpen(false)}>
          <View style={styles.sheet}>
            <Text style={styles.sheetTitle}>Your offer for {item.title}</Text>
            <TextInput style={styles.sheetInput} keyboardType="numeric" value={offer}
              onChangeText={setOffer} placeholder="₹ 0" placeholderTextColor={colors.textMuted} autoFocus />
            <BigButton title="Send on WhatsApp" color={colors.whatsapp} loading={busy} onPress={sendOffer} />
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  backBtn: { position: 'absolute', top: 48, left: spacing.lg, zIndex: 10, backgroundColor: 'rgba(255,255,255,0.9)', width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 24, color: colors.text },
  hero: { width, height: width * 0.8, backgroundColor: colors.surface },
  body: { padding: spacing.lg },
  title: { ...font.h1, marginTop: spacing.sm },
  price: { ...font.price, fontSize: 26, marginTop: spacing.xs },
  meta: { ...font.muted, fontSize: 15, marginTop: 4 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.lg },
  sellerLabel: { ...font.muted },
  seller: { ...font.title, marginTop: 2 },
  actionBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row',
    padding: spacing.lg, backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.border,
  },
  sheetBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.white, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: spacing.xl },
  sheetTitle: { ...font.title, marginBottom: spacing.md },
  sheetInput: { height: 60, borderWidth: 2, borderColor: colors.border, borderRadius: radius.md, fontSize: 24, fontWeight: '800', textAlign: 'center', color: colors.text, marginBottom: spacing.lg },
});
