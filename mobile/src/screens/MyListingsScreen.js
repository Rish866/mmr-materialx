import React, { useCallback, useState } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { api } from '../api';
import { colors, font, radius, spacing } from '../theme';
import { BigButton, UrgentTag } from '../components/ui';
import { formatPrice, formatQty, formatDate, thumbUrl, statusMeta } from '../format';

// Status pill using shared STATUS_META (active | sold | expired | withdrawn).
function StatusBadge({ status }) {
  const m = statusMeta(status);
  return (
    <View style={[styles.badge, { backgroundColor: m.bg }]}>
      <Text style={[styles.badgeText, { color: m.fg }]}>{m.label} · {m.labelHi}</Text>
    </View>
  );
}

export default function MyListingsScreen({ navigation }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const data = await api.myListings();
      setItems(data);
    } catch (e) {
      setError(e.message || 'Could not load your listings.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // reload every time the screen gains focus (e.g. after editing)
  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function changeStatus(item, status, confirmTitle, confirmMsg) {
    Alert.alert(confirmTitle, confirmMsg, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Yes',
        style: status === 'withdrawn' ? 'destructive' : 'default',
        onPress: async () => {
          try {
            await api.setStatus(item.id, status);
            load();
          } catch (e) {
            Alert.alert('Could not update', e.message);
          }
        },
      },
    ]);
  }

  const renderItem = ({ item }) => {
    const negotiable = item.price == null || Number(item.price) === 0;
    return (
      <View style={styles.card}>
        <View style={styles.cardTop}>
          <Image
            source={{ uri: thumbUrl(item.photos?.[0], 200) || 'https://picsum.photos/200' }}
            style={styles.thumb}
          />
          <View style={styles.info}>
            <View style={styles.rowBetween}>
              <StatusBadge status={item.status} />
              {item.is_urgent && item.status === 'active' ? <UrgentTag /> : null}
            </View>
            <Text numberOfLines={2} style={styles.title}>{item.title}</Text>
            <Text style={styles.price}>{negotiable ? 'Negotiable / मोल-भाव' : formatPrice(item)}</Text>
            <Text style={styles.meta}>{formatQty(item)}</Text>
            <Text style={styles.metaSmall}>Posted {formatDate(item.created_at)}</Text>
          </View>
        </View>

        {/* Actions — only for listings that are still live */}
        {item.status === 'active' ? (
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.editBtn]}
              onPress={() => navigation.navigate('EditListing', { listing: item })}
            >
              <Text style={styles.editText}>✏️  Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.soldBtn]}
              onPress={() => changeStatus(item, 'sold', 'Mark as Sold?', `"${item.title}" will be marked sold and removed from the buyer feed.`)}
            >
              <Text style={styles.soldText}>✅  Sold</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionBtn, styles.withdrawBtn]}
              onPress={() => changeStatus(item, 'withdrawn', 'Withdraw listing?', `"${item.title}" will be taken off the market. You can re-post it later.`)}
            >
              <Text style={styles.withdrawText}>🚫  Withdraw</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // Sold / expired / withdrawn: allow re-activating
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.editBtn]}
              onPress={() => changeStatus(item, 'active', 'Re-activate listing?', `"${item.title}" will be shown to buyers again.`)}
            >
              <Text style={styles.editText}>♻️  Re-activate</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  // ----- loading state -----
  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header navigation={navigation} />
        <ActivityIndicator style={{ marginTop: spacing.xxl }} size="large" color={colors.primary} />
      </SafeAreaView>
    );
  }

  // ----- error state with retry -----
  if (error) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <Header navigation={navigation} />
        <View style={styles.centerBox}>
          <Text style={styles.errorTitle}>⚠️  Something went wrong</Text>
          <Text style={styles.errorMsg}>{error}</Text>
          <BigButton title="Try again" onPress={() => load()} style={{ marginTop: spacing.lg, minWidth: 180 }} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Header navigation={navigation} />
      <FlatList
        data={items}
        keyExtractor={(i) => String(i.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
        ListEmptyComponent={
          <View style={styles.centerBox}>
            <Text style={styles.emptyTitle}>No listings yet</Text>
            <Text style={styles.emptyMsg}>Post your first surplus material to start selling locally.</Text>
            <BigButton title="➕  Post a material" onPress={() => navigation.navigate('Sell')} style={{ marginTop: spacing.lg, minWidth: 220 }} />
          </View>
        }
      />
    </SafeAreaView>
  );
}

function Header({ navigation }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={styles.back}>←</Text>
      </TouchableOpacity>
      <Text style={font.h2}>My Listings</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderColor: colors.border,
  },
  back: { fontSize: 28, color: colors.text },
  list: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  card: {
    backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1,
    borderColor: colors.border, overflow: 'hidden',
  },
  cardTop: { flexDirection: 'row', padding: spacing.md },
  thumb: { width: 92, height: 92, borderRadius: radius.sm, backgroundColor: colors.surface },
  info: { flex: 1, marginLeft: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  title: { ...font.title, fontSize: 16, marginTop: 4 },
  price: { ...font.price, fontSize: 18, marginTop: 2 },
  meta: { ...font.muted, marginTop: 2 },
  metaSmall: { ...font.muted, fontSize: 12, marginTop: 2 },
  badge: { borderRadius: radius.sm, paddingHorizontal: spacing.sm, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontWeight: '800', fontSize: 11 },
  actions: {
    flexDirection: 'row', borderTopWidth: 1, borderColor: colors.border,
  },
  actionBtn: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center' },
  editBtn: { borderRightWidth: 1, borderColor: colors.border },
  soldBtn: { borderRightWidth: 1, borderColor: colors.border },
  withdrawBtn: {},
  editText: { fontWeight: '800', color: colors.primaryDark, fontSize: 15 },
  soldText: { fontWeight: '800', color: colors.success, fontSize: 15 },
  withdrawText: { fontWeight: '800', color: colors.danger, fontSize: 15 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, marginTop: spacing.xxl },
  emptyTitle: { ...font.h2, textAlign: 'center' },
  emptyMsg: { ...font.muted, textAlign: 'center', marginTop: spacing.sm, lineHeight: 22 },
  errorTitle: { ...font.title, color: colors.danger, textAlign: 'center' },
  errorMsg: { ...font.muted, textAlign: 'center', marginTop: spacing.sm },
});
