import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter, useSegments } from 'expo-router';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore'; // setDoc kullanıyoruz, daha güvenli
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  } as any),
});

export default function RootLayout() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();
  const segments = useSegments();
  
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  async function registerForPushNotificationsAsync() {
    let token;
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF3B30',
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') return;
      
      try {
        const tokenData = await Notifications.getExpoPushTokenAsync({ projectId: undefined });
        token = tokenData.data;
      } catch (error) { console.log(error); }
    }
    return token;
  }

  useEffect(() => {
    const subscriber = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (initializing) setInitializing(false);

      if (currentUser) {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          // HATA ÇÖZÜMÜ: updateDoc yerine setDoc(merge: true)
          // Kullanıcı yoksa oluşturur, varsa günceller.
          await setDoc(doc(db, "users", currentUser.uid), {
            pushToken: token,
            email: currentUser.email,
            uid: currentUser.uid
          }, { merge: true });
        }
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {});
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {});

    return () => {
      subscriber();
      if (notificationListener.current) notificationListener.current.remove();
      if (responseListener.current) responseListener.current.remove();
    };
  }, []);

  useEffect(() => {
    if (initializing) return;
    const inTabsGroup = segments[0] === '(tabs)';
    const inLogin = segments[0] === 'login';

    if (user && inLogin) {
      router.replace('/(tabs)');
    } else if (!user && !inLogin) {
      router.replace('/login');
    }
  }, [user, initializing, segments]);

  if (initializing) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
        <ActivityIndicator size="large" color="#FF3B30" />
      </View>
    );
  }

  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="inbox" options={{ headerShown: false }} /> 
      <Stack.Screen name="conversation" options={{ headerShown: false }} />
      <Stack.Screen name="notifications" options={{ headerShown: false }} />
    </Stack>
  );
}