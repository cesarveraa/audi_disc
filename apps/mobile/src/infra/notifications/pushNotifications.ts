import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { mobileApiFetch } from '../../api/client';

type PushAction = {
  type?: string;
  productId?: string;
  route?: string;
};

export async function registerOperationalPushToken(idToken: string | null) {
  if (!idToken) {
    return;
  }
  if (process.env.EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS !== 'true') {
    return;
  }

  try {
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
    const response = await mobileApiFetch('/notifications/register-token', {
      idToken,
      method: 'POST',
      json: {
        token: deviceToken.data,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
      },
    });
    await response.text().catch(() => undefined);
  } catch {
    console.info('[AudiDisc Mobile Push] Push notifications no disponibles en este entorno.');
  }
}

export function subscribeToPushActions(onAction: (action: PushAction) => void) {
  const subscription = Notifications.addNotificationResponseReceivedListener(response => {
    const data = response.notification.request.content.data as PushAction;
    onAction(data);
  });
  return () => subscription.remove();
}
