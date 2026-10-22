import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { loadToken } from './src/api';
import { colors } from './src/theme';
import LoginScreen from './src/screens/LoginScreen';
import RootNavigator from './src/navigation';

export default function App() {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await loadToken();
      setSignedIn(!!t);
      setReady(true);
    })();
  }, []);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <NavigationContainer>
        {signedIn ? (
          <RootNavigator onSignedOut={() => setSignedIn(false)} />
        ) : (
          <LoginScreen onSignedIn={() => setSignedIn(true)} />
        )}
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
