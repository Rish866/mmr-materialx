import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { colors, sizes } from './theme';

import HomeFeedScreen from './screens/HomeFeedScreen';
import AddListingScreen from './screens/AddListingScreen';
import ListingScreen from './screens/ListingScreen';
import MeScreen from './screens/MeScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Oversized center "Sell" FAB that raises above the tab bar.
function SellButton({ onPress }) {
  return (
    <TouchableOpacity style={styles.fabWrap} activeOpacity={0.9} onPress={onPress}>
      <View style={styles.fab}>
        <Text style={styles.fabPlus}>＋</Text>
        <Text style={styles.fabLabel}>Sell</Text>
      </View>
    </TouchableOpacity>
  );
}

function Tabs({ onSignedOut }) {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 12 },
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
      }}
    >
      <Tab.Screen name="Feed" component={HomeFeedScreen}
        options={{ tabBarIcon: () => <Text style={{ fontSize: 22 }}>🏠</Text> }} />
      <Tab.Screen name="Sell" component={AddListingScreen}
        options={{
          tabBarButton: (props) => <SellButton {...props} />,
        }} />
      <Tab.Screen name="Me"
        options={{ tabBarIcon: () => <Text style={{ fontSize: 22 }}>👤</Text> }}>
        {() => <MeScreen onSignedOut={onSignedOut} />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}

export default function RootNavigator({ onSignedOut }) {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs">{() => <Tabs onSignedOut={onSignedOut} />}</Stack.Screen>
      <Stack.Screen name="Listing" component={ListingScreen} />
      <Stack.Screen name="AddListing" component={AddListingScreen} />
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  fabWrap: { top: -18, justifyContent: 'center', alignItems: 'center' },
  fab: {
    width: sizes.fabSize, height: sizes.fabSize, borderRadius: sizes.fabSize / 2,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 6,
  },
  fabPlus: { color: colors.white, fontSize: 26, fontWeight: '900', marginTop: -2 },
  fabLabel: { color: colors.white, fontSize: 11, fontWeight: '800', marginTop: -2 },
});
