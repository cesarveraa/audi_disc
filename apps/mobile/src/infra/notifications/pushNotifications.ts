import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:8000';

type PushAction = {
  type?: string;
  productId?: string;
  route?: string;
};

export async function registerOperationalPushToken(idToken: string | null) {
  if (!idToken) {
    return;
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('audi-disc-operaciones', {
      name: 'Audi Disc Operaciones',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 180, 120, 180],
      lightColor: '#E4002B',
    });
  }

  const currentPermissions = await Notifications.getPermissionsAsync();
  const permissions = currentPermissions.granted
    ? currentPermissions
    : await Notifications.requestPermissionsAsync();
  if (!permissions.granted) {
    return;
  }

  const deviceToken = await Notifications.getDevicePushTokenAsync();
  await fetch(`${API_BASE_URL}/notifications/register-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      token: deviceToken.data,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    }),
  }).catch(() => undefined);
}

export function subscribeToPushActions(onAction: (action: PushAction) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data as PushAction;
    onAction(data);
  });
  return () => subscription.remove();
}
