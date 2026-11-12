import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { Platform } from "react-native";
import { Api } from "./api";

/**
 * Push notifications: the phone gets an Expo push token, the API stores it (POST /me/push-tokens) and sends a push
 * with every in-app notification (reminders, announcements, certificates, results…). Tapping one opens the event.
 */
const KEY = "push.token";

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }),
});

/** Asks permission once and registers this phone. Quietly does nothing on simulators or if refused. */
export async function registerForPush(): Promise<void> {
  if (Platform.OS === "web" || !Device.isDevice) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Event updates", importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 200, 120, 200],
    });
  }
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return; // set by `eas init`; without it Expo can't issue a token
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await Api.registerPushToken(token, Platform.OS === "ios" ? "ios" : "android");
  await SecureStore.setItemAsync(KEY, token);
}

/** On sign-out: stop sending pushes to this phone. */
export async function unregisterPush(): Promise<void> {
  const token = await SecureStore.getItemAsync(KEY).catch(() => null);
  if (!token) return;
  await Api.unregisterPushToken(token).catch(() => {});
  await SecureStore.deleteItemAsync(KEY).catch(() => {});
}

/** Opens what a tapped notification is about. */
function openFromNotification(data: Record<string, unknown> | undefined) {
  const eventId = typeof data?.eventId === "string" ? data.eventId : null;
  router.push(eventId ? `/event/${eventId}` : "/notifications");
}

/** Call once when signed in: handles taps on notifications (also the one that launched the app). */
export function listenForTaps(): () => void {
  if (Platform.OS === "web") return () => {};
  Notifications.getLastNotificationResponseAsync().then((r) => {
    if (r) openFromNotification(r.notification.request.content.data as Record<string, unknown>);
  }).catch(() => {});
  const sub = Notifications.addNotificationResponseReceivedListener((r) => openFromNotification(r.notification.request.content.data as Record<string, unknown>));
  return () => sub.remove();
}
