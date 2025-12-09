import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform } from 'react-native';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Siyah arka plan, kırmızı aktif ikon, gri pasif ikon
        tabBarStyle: {
          backgroundColor: '#000',
          borderTopColor: '#333',
          height: Platform.OS === 'ios' ? 85 : 60,
          paddingBottom: Platform.OS === 'ios' ? 30 : 10,
          paddingTop: 10,
        },
        tabBarActiveTintColor: '#FF3B30',
        tabBarInactiveTintColor: '#666',
        tabBarShowLabel: false, // Yazıları gizle, sadece ikon olsun
      }}
    >
      
      {/* 1. ANA SAYFA */}
      <Tabs.Screen
        name="index"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "home" : "home-outline"} size={28} color={color} />
          ),
        }}
      />

      {/* 2. EKLEME (CREATE) */}
      
      {/* 3. ARAMA */}
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "search" : "search-outline"} size={28} color={color} />
          ),
        }}
      />

      {/* --- GİZLİ SAYFALAR (Menüde yer kaplamasın) --- */}
      <Tabs.Screen name="profile" options={{ href: null }} /> 
      <Tabs.Screen name="inbox" options={{ href: null }} /> 
      <Tabs.Screen name="notifications" options={{ href: null }} /> 
      <Tabs.Screen name="conversation" options={{ href: null }} /> 
      
      {/* Eski denemelerden kalan dosyalar varsa onları da gizle */}
      <Tabs.Screen name="placeholder" options={{ href: null }} />
      <Tabs.Screen name="empty" options={{ href: null }} />

    </Tabs>
  );
}