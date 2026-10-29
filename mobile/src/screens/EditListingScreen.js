import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity, Image,
  StyleSheet, Switch, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { api } from '../api';
import { compress, uploadAll } from '../upload';
import { colors, font, radius, spacing } from '../theme';
import { BigButton } from '../components/ui';

const UNITS = ['kg', 'litres', 'pcs', 'drum', 'lot', 'ton'];

// Edit screen mirrors AddListing's form conventions but pre-fills from an
// existing listing and PATCHes it. Location is preserved as posted (editing
// commercial details is the common case); photos can be replaced/added.
export default function EditListingScreen({ route, navigation }) {
  const original = route.params.listing;

  const [photos, setPhotos] = useState(original.photos || []); // mix of URLs + new local URIs
  const [title, setTitle] = useState(original.title || '');
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState(original.category_id);
  const [quantity, setQuantity] = useState(original.quantity != null ? String(original.quantity) : '1');
  const [unit, setUnit] = useState(original.unit || 'kg');
  const [price, setPrice] = useState(original.price != null ? String(original.price) : '');
  const [priceType, setPriceType] = useState(original.price_type || 'per_unit');
  const [isUrgent, setIsUrgent] = useState(!!original.is_urgent);
  const [submitting, setSubmitting] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const cats = await api.categories();
        setCategories(cats);
      } catch {}
    })();
  }, []);

  async function addPhoto() {
    if (photos.length >= 4) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 1,
    });
    if (res.canceled) return;
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

  // Treat strings starting with http(s) as already-uploaded URLs; everything
  // else is a new local URI that must be uploaded.
  function isRemote(uri) {
    return typeof uri === 'string' && /^https?:\/\//.test(uri);
  }

  async function save() {
    if (!title.trim()) return Alert.alert('Title needed', 'Please enter a title.');
    if (!categoryId) return Alert.alert('Category needed', 'Please pick a category.');
    if (!price) return Alert.alert('Price needed', 'Please enter a price.');

    setSubmitting(true);
    try {
      // Upload only the newly-added local photos; keep existing URLs intact.
      const existingUrls = photos.filter(isRemote);
      const newLocal = photos.filter((p) => !isRemote(p));
      let uploadedUrls = [];
      if (newLocal.length) {
        setUploadMsg(`Uploading photos… 0/${newLocal.length}`);
        uploadedUrls = await uploadAll(newLocal, (done, total) =>
          setUploadMsg(`Uploading photos… ${done}/${total}`)
        );
      }
      const finalPhotos = [...existingUrls, ...uploadedUrls];

      setUploadMsg('Saving changes…');
      await api.updateListing(original.id, {
        title: title.trim(),
        category_id: categoryId,
        quantity: parseFloat(quantity) || null,
        unit,
        price: parseFloat(price),
        price_type: priceType,
        is_urgent: isUrgent,
        photos: finalPhotos,
      });
      Alert.alert('Saved', 'Your listing has been updated.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Update failed.');
    } finally {
      setSubmitting(false);
      setUploadMsg('');
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => navigation.goBack()}><Text style={styles.back}>←</Text></TouchableOpacity>
        <Text style={font.h2}>Edit Listing</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {/* Photos */}
        <Label text="Photos / फ़ोटो (max 4)" />
        <View style={styles.photoRow}>
          {photos.map((uri, i) => (
            <TouchableOpacity key={`${uri}-${i}`} onPress={() => removePhoto(i)} style={styles.photoBox}>
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
            <Text style={font.muted}>Resets the 24-hour timer when turned on</Text>
          </View>
          <Switch value={isUrgent} onValueChange={setIsUrgent} trackColor={{ true: colors.danger }} />
        </View>

        <View style={{ height: spacing.xl }} />
        {submitting && uploadMsg ? <Text style={styles.uploadMsg}>{uploadMsg}</Text> : null}
        <BigButton title="SAVE CHANGES" onPress={save} loading={submitting} />
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
  uploadMsg: { ...font.muted, textAlign: 'center', marginBottom: spacing.md, color: colors.primaryDark, fontWeight: '700' },
});
