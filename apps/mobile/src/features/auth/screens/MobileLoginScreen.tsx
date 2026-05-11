import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useMobileAuth } from '@app/providers/MobileAuthProvider';
import { colors } from '@core/theme/colors';

export default function MobileLoginScreen() {
  const { authEnabled, clearError, error, isLoading, login } = useMobileAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  async function handleLogin() {
    clearError();
    await login(email, password);
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.screen}
    >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Audi Red Premium</Text>
        <Text style={styles.title}>Acceso Movil</Text>
        <Text style={styles.subtitle}>
          Sesion persistente con Firebase Auth y AsyncStorage.
        </Text>

        {!authEnabled && (
          <View style={styles.configBox}>
            <Text style={styles.configText}>Firebase Auth no esta configurado.</Text>
          </View>
        )}

        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="correo"
          placeholderTextColor="rgba(255,255,255,0.42)"
          autoCapitalize="none"
          keyboardType="email-address"
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={setPassword}
          placeholder="password"
          placeholderTextColor="rgba(255,255,255,0.42)"
          secureTextEntry
          style={styles.input}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [
            styles.loginButton,
            pressed && styles.pressed,
            (!authEnabled || !email || !password || isLoading) && styles.disabled,
          ]}
          disabled={!authEnabled || !email || !password || isLoading}
          onPress={() => void handleLogin()}
        >
          <Text style={styles.loginText}>{isLoading ? 'Validando...' : 'Entrar'}</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: colors.night,
    padding: 20,
  },
  card: {
    borderRadius: 30,
    backgroundColor: colors.nightPanel,
    padding: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  eyebrow: {
    color: colors.audiRed,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 10,
    color: colors.surface,
    fontSize: 34,
    fontWeight: '900',
  },
  subtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.62)',
    fontSize: 15,
    lineHeight: 22,
  },
  configBox: {
    marginTop: 18,
    borderRadius: 18,
    backgroundColor: colors.surface,
    padding: 12,
  },
  configText: {
    color: colors.ink,
    fontWeight: '800',
  },
  input: {
    marginTop: 14,
    height: 56,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    color: colors.surface,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '700',
  },
  error: {
    marginTop: 12,
    borderRadius: 16,
    backgroundColor: colors.audiRed,
    color: colors.surface,
    padding: 12,
    fontWeight: '800',
  },
  loginButton: {
    marginTop: 18,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.audiRed,
  },
  loginText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '900',
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  disabled: {
    opacity: 0.55,
  },
});
