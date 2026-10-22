import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TextInput, FlatList, Image, TouchableOpacity,
  StyleSheet, ScrollView, RefreshControl, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Location from 'expo-location';
import { api } from '../api';
import { colors, font, radius, spacing } from '../theme';
import { Chip, UrgentTag } from '../components/ui';
import { formatPrice, formatDistance } from '../format';

const RADII = [10, 25, 50];
const DEFAULT_LOC = { lat: 19.136, lng: 73.022, hub: 'Rabale' }; // fallback: Rabale

export default function HomeFeedScreen({ navigation }) {
  const [loc, setLoc] = useState(DEFAULT_LOC);
  const [radiusKm, setRadiusKm] = useState(25);     // default 25km per spec
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [categories, setCategories] = useState([{ slug: 'all', name: 'All', icon: '📂' }]);
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const cats = await api.categories();
        setCategories([{ slug: 'all', name: 'All', icon: '📂' }, ...cats]);
      } catch {}
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const pos = await Location.getCurrentPositionAsync({});
          setLoc((l) => ({ ...l, lat: pos.coords.latitude, lng: pos.coords.longitude, hub: 'My location' }));
        }
      } catch {}
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.feed({ lat: loc.lat, lng: loc.lng, radius_km: radiusKm, category, q: query });
      setListings(data);
    } catch (e) {
      setListings([]);
    } finally {
      setLoading(false);
    }
  }, [loc, radiusKm, category, query]);

  useEffect(() => { load(); }, [load]);

  const renderCard = ({ item }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.9}
      onPress={() => navigation.navigate('Listing', { id: item.id })}
    >
      <Image source={{ uri: item.photos?.[0] || 'https://picsum.photos/400' }} style={styles.cardImg} />
      {item.is_urgent ? <UrgentTag style={styles.cardUrgent} /> : null}
      <View style={styles.cardBody}>
        <Text numberOfLines={1} style={styles.cardTitle}>{item.title}</Text>
        <Text style={styles.cardPrice}>{formatPrice(item)}</Text>
        <Text style={styles.cardMeta}>📍 {formatDistance(item.distance_km)}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.brand}>MMR MaterialX</Text>
        <View style={styles.locPill}>
          <Text style={styles.locPillText}>📍 {loc.hub}</Text>
        </View>
      </View>

      {/* Search */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.search}
          placeholder="Search materials… / सामग्री खोजें"
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={load}
          returnKeyType="search"
        />
      </View>

      {/* Radius chips */}
      <View style={styles.radiusRow}>
        <Text style={styles.radiusLabel}>Radius:</Text>
        {RADII.map((r) => (
          <Chip key={r} label={`${r} km`} active={radiusKm === r} onPress={() => setRadiusKm(r)} />
        ))}
      </View>

      {/* Category scroll */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.catRow}>
        {categories.map((c) => (
          <Chip
            key={c.slug}
            label={`${c.icon || ''} ${c.name}`.trim()}
            active={category === c.slug}
            onPress={() => setCategory(c.slug)}
          />
        ))}
      </ScrollView>

      {/* Grid */}
      {loading && listings.length === 0 ? (
        <ActivityIndicator style={{ marginTop: spacing.xxl }} color={colors.primary} size="large" />
      ) : (
        <FlatList
          data={listings}
          keyExtractor={(i) => String(i.id)}
          renderItem={renderCard}
          numColumns={2}
          columnWrapperStyle={{ gap: spacing.md }}
          contentContainerStyle={styles.grid}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={
            <Text style={styles.empty}>No materials within {radiusKm} km yet.{'\n'}Be the first to post!</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  brand: { ...font.h2, color: colors.primaryDark },
  locPill: {
    backgroundColor: colors.surface, borderRadius: radius.pill,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  locPillText: { fontWeight: '700', color: colors.text },
  searchWrap: { paddingHorizontal: spacing.lg },
  search: {
    height: 50, backgroundColor: colors.surface, borderRadius: radius.md,
    paddingHorizontal: spacing.lg, fontSize: 16, color: colors.text,
  },
  radiusRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  radiusLabel: { ...font.muted, marginRight: spacing.sm },
  catRow: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  grid: { paddingHorizontal: spacing.lg, paddingBottom: 120, gap: spacing.md },
  card: {
    flex: 1, backgroundColor: colors.white, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
  },
  cardImg: { width: '100%', height: 130, backgroundColor: colors.surface },
  cardUrgent: { position: 'absolute', top: spacing.sm, left: spacing.sm },
  cardBody: { padding: spacing.md },
  cardTitle: { ...font.title, fontSize: 15 },
  cardPrice: { ...font.price, fontSize: 18, marginTop: 2 },
  cardMeta: { ...font.muted, marginTop: 2 },
  empty: { textAlign: 'center', marginTop: spacing.xxl, ...font.muted, lineHeight: 22 },
});
