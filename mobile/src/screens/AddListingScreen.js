import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, Image,
  StyleSheet, Switch, Alert, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { api } from '../api';
import { compress, uploadAll } from '../upload';
import { colors, font, radius, spacing } from '../theme';
import { BigButton } from '../components/ui';

const HUBS = ['Rabale', 'Taloja MIDC', 'Bhiwandi', 'Ulwe', 'Vasai', 'Navi Mumbai'];
const UNITS = ['kg', 'litres', 'pcs', 'drum', 'lot', 'ton'];

export default function AddListingScreen({ navigation }) {
  const [photos, setPhotos] = useState([]);           // local uris, max 4
  const [title, setTitle] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(null);
  const [quantity, setQuantity] = useState('1');
  const [unit, setUnit] = useState('kg');
  const [price, setPrice] = useState('');
  const [priceType, setPriceType] = useState('per_unit'); // per_unit | total
  const [isUrgent, setIsUrgent] = useState(false);
  const [coords, setCoords] = useState(null);
  const [hub, setHub] = useState('Rabale');
  const [locationDenied, setLocationDenied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const cats = await api.categories();
        setCategories(cats);
        if (cats[0]) setCategoryId(cats[0].id);
      } catch {}
      detectLocation();
    })();
  }, []);

  async function detectLocation() {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({});
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationDenied(false);
      } else {
        // Permission denied — fall back to manual hub selection (below).
        setLocationDenied(true);
      }
    } catch {
      setLocationDenied(true);
    }
  }

  async function addPhoto() {
    if (photos.length >= 4) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (res.canceled) return;
    // client-side compression — factory 4G is slow
    try {
      const compressed = await compress(res.assets[0].uri);
      setPhotos((p) => [...p, compressed]);
    } catch (e) {
      Alert.alert('Could not add photo', e.message);
    }
  }

  function removePhoto(i) {
    setPhotos((p) => p.filter((_, idx) => idx !== i));
  }

  function bump(delta) {
    setQuantity((q) => String(Math.max(1, (parseInt(q, 10) || 0) + delta)));
  }

  async function submit() {
    if (!title.trim()) return Alert.alert('Title needed', 'Please enter a title.');
    if (!categoryId) return Alert.alert('Category needed', 'Please pick a category.');
    if (!price) return Alert.alert('Price needed', 'Please enter a price.');

    // Location: GPS or hub fallback. Hub centroids keep the feed usable.
    const hubCentroids = {
      Rabale: { lat: 19.136, lng: 73.022 }, 'Taloja MIDC': { lat: 19.082, lng: 73.1 },
      Bhiwandi: { lat: 19.28, lng: 72.86 }, Ulwe: { lat: 18.99, lng: 73.026 },
      Vasai: { lat: 19.391, lng: 72.826 }, 'Navi Mumbai': { lat: 19.033, lng: 73.03 },
    };
    const loc = coords || hubCentroids[hub];

    setSubmitting(true);
    try {
      // 1) Upload photos directly to storage (signed by backend); get public URLs.
      let photoUrls = [];
      if (photos.length) {
        setUploadMsg(`Uploading photos… 0/${photos.length}`);
        photoUrls = await uploadAll(photos, (done, total) =>
          setUploadMsg(`Uploading photos… ${done}/${total}`)
        );
      }

      // 2) Create the listing with the resulting URLs.
      setUploadMsg('Posting listing…');
      const payload = {
        title: title.trim(),
        category_id: categoryId,
        quantity: parseFloat(quantity) || null,
        unit,
        price: parseFloat(price),
        price_type: priceType,
        is_urgent: isUrgent,
        latitude: loc.lat,
        longitude: loc.lng,
        hub_name: hub,
        photos: photoUrls,
      };
      await api.createListing(payload);
      Alert.alert('Posted!', 'Your material is now live.', [
        { text: 'OK', onPress: () => navigation.navigate('Feed') },
      ]);
    } catch (e) {
      Alert.alert('Could not post', e.message || 'Upload or posting failed.');
    } finally {
      setSubmitting(false);
      setUploadMsg('');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>←</Text></TouchableOpacity>
        <Text style={font.h2}>Post Your Material</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Photos */}
        <Label text="Photos / फ़ोटो (max 4)" />
        <View style={styles.photoRow}>
          {photos.map((uri, i) => (
            <TouchableOpacity key={i} onPress={() => removePhoto(i)} style={styles.photoBox}>
              <Image source={{ uri }} style={styles.photo} />
              <View style={styles.removeBadge}><Text style={styles.removeX}>✕</Text></View>
            </TouchableOpacity>
          ))}
          {photos.length < 4 && (
            <TouchableOpacity style={[styles.photoBox, styles.addPhoto]} onPress={addPhoto}>
              <Text style={styles.addPhotoText}>📷{'\n'}+</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Title */}
        <Label text="Title / नाम" />
        <TextInput style={styles.input} value={title} onChangeText={setTitle}
          placeholder="e.g. Leftover Epoxy Primer 20L" placeholderTextColor={colors.textMuted} />

        {/* Category */}
        <Label text="Category / श्रेणी" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.sm }}>
          {categories.map((c) => (
            <TouchableOpacity key={c.id} onPress={() => setCategoryId(c.id)}
              style={[styles.pick, categoryId === c.id && styles.pickActive]}>
              <Text style={[styles.pickText, categoryId === c.id && styles.pickTextActive]}>
                {c.icon} {c.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Quantity + unit */}
        <Label text="Quantity / मात्रा" />
        <View style={styles.qtyRow}>
          <TouchableOpacity style={styles.stepBtn} onPress={() => bump(-1)}><Text style={styles.stepTxt}>−</Text></TouchableOpacity>
          <TextInput style={styles.qtyInput} keyboardType="numeric" value={quantity} onChangeText={setQuantity} />
          <TouchableOpacity style={styles.stepBtn} onPress={() => bump(1)}><Text style={styles.stepTxt}>+</Text></TouchableOpacity>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginLeft: spacing.sm }}>
            {UNITS.map((u) => (
              <TouchableOpacity key={u} onPress={() => setUnit(u)}
                style={[styles.unitChip, unit === u && styles.pickActive]}>
                <Text style={[styles.pickText, unit === u && styles.pickTextActive]}>{u}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Price + toggle */}
        <Label text="Price (₹) / दाम" />
        <TextInput style={styles.input} keyboardType="numeric" value={price} onChangeText={setPrice}
          placeholder="e.g. 12000" placeholderTextColor={colors.textMuted} />
        <View style={styles.toggleRow}>
          <TouchableOpacity onPress={() => setPriceType('per_unit')}
            style={[styles.segBtn, priceType === 'per_unit' && styles.pickActive]}>
            <Text style={[styles.pickText, priceType === 'per_unit' && styles.pickTextActive]}>Per unit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setPriceType('total')}
            style={[styles.segBtn, priceType === 'total' && styles.pickActive]}>
            <Text style={[styles.pickText, priceType === 'total' && styles.pickTextActive]}>Total lot</Text>
          </TouchableOpacity>
        </View>

        {/* Urgent toggle */}
        <View style={styles.urgentRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.urgentTitle}>🔴 Mark as Urgent Liquidation</Text>
            <Text style={font.muted}>Auto-expires in 24 hours</Text>
          </View>
          <Switch value={isUrgent} onValueChange={setIsUrgent}
            trackColor={{ true: colors.danger }} />
        </View>

        {/* Location */}
        <Label text="Location / जगह" />
        <TouchableOpacity style={styles.gpsBtn} onPress={detectLocation}>
          <Text style={styles.gpsText}>
            {coords ? `📍 GPS locked (${coords.lat.toFixed(3)}, ${coords.lng.toFixed(3)})` : '📍 Use my location'}
          </Text>
        </TouchableOpacity>
        {locationDenied && !coords ? (
          <Text style={styles.locHint}>
            Location is off — pick your hub below / नीचे अपना हब चुनें
          </Text>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: spacing.sm }}>
          {HUBS.map((h) => (
            <TouchableOpacity key={h} onPress={() => setHub(h)}
              style={[styles.pick, hub === h && styles.pickActive]}>
              <Text style={[styles.pickText, hub === h && styles.pickTextActive]}>{h}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <View style={{ height: spacing.xl }} />
        {submitting && uploadMsg ? (
          <Text style={styles.uploadMsg}>{uploadMsg}</Text>
        ) : null}
        <BigButton title="POST LISTING" onPress={submit} loading={submitting} />
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Label({ text }) {
  return <Text style={styles.label}>{text}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  back: { fontSize: 28, color: colors.text },
  body: { padding: spacing.lg },
  label: { ...font.title, fontSize: 15, marginBottom: spacing.sm, marginTop: spacing.md },
  input: {
    height: 52, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, fontSize: 16, color: colors.text, backgroundColor: colors.white,
  },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  photoBox: { width: 84, height: 84, borderRadius: radius.md, overflow: 'hidden' },
  photo: { width: '100%', height: '100%' },
  removeBadge: { position: 'absolute', top: 2, right: 2, backgroundColor: colors.danger, borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  removeX: { color: colors.white, fontSize: 12, fontWeight: '800' },
  addPhoto: { borderWidth: 2, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  addPhotoText: { color: colors.primary, fontWeight: '800', textAlign: 'center' },
  pick: {
    paddingHorizontal: spacing.lg, height: 44, borderRadius: radius.pill, borderWidth: 1.5,
    borderColor: colors.border, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white,
  },
  pickActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  pickText: { fontWeight: '700', color: colors.text },
  pickTextActive: { color: colors.white },
  qtyRow: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 48, height: 52, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  stepTxt: { fontSize: 26, fontWeight: '800', color: colors.primaryDark },
  qtyInput: { width: 70, height: 52, textAlign: 'center', fontSize: 18, fontWeight: '700', borderBottomWidth: 2, borderColor: colors.border, marginHorizontal: spacing.sm, color: colors.text },
  unitChip: { paddingHorizontal: spacing.md, height: 44, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, marginRight: spacing.sm, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  toggleRow: { flexDirection: 'row', marginTop: spacing.sm, gap: spacing.sm },
  segBtn: { flex: 1, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.white },
  urgentRow: { flexDirection: 'row', alignItems: 'center', marginTop: spacing.xl, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.lg },
  urgentTitle: { ...font.title, fontSize: 15, color: colors.danger },
  gpsBtn: { height: 52, borderRadius: radius.md, borderWidth: 1.5, borderColor: colors.primary, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface },
  gpsText: { color: colors.primaryDark, fontWeight: '700', fontSize: 15 },
  locHint: { ...font.muted, color: colors.danger, marginTop: spacing.sm, fontWeight: '600' },
  uploadMsg: { ...font.muted, textAlign: 'center', marginBottom: spacing.md, color: colors.primaryDark, fontWeight: '700' },
});
