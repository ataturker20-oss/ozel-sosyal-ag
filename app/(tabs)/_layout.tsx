import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { Platform, View } from 'react-native';

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
        tabBarShowLabel: false, // Yazıları gizle
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
      <Tabs.Screen
        name="empty" // DÜZELTME: Senin klasöründe 'empty.tsx' olduğu için bu ismi kullandık
        options={{
          title: 'Oluştur',
          href: '/create', // Burası butona basınca seni app/create.tsx sayfasına atar
          tabBarIcon: ({ focused }) => (
            <View style={{
              top: Platform.OS === 'ios' ? -10 : -20, // Butonu yukarı taşıdık
              width: 55,
              height: 55,
              borderRadius: 27.5,
              backgroundColor: '#FF3B30',
              justifyContent: 'center',
              alignItems: 'center',
              shadowColor: "#FF3B30",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.5,
              shadowRadius: 5,
              elevation: 5, // Android gölgesi
              borderWidth: 3,
              borderColor: '#000' // Siyah kenarlık ile akıştan ayıralım
            }}>
              <Ionicons name="add" size={32} color="#fff" />
            </View>
          ),
        }}
      />
      
      {/* 3. ARAMA */}
      <Tabs.Screen
        name="search"
        options={{
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? "search" : "search-outline"} size={28} color={color} />
          ),
        }}
      />

      {/* --- GİZLİ SAYFALAR (Menüde buton olarak görünmezler) --- */}
      <Tabs.Screen name="profile" options={{ href: null }} /> 
      <Tabs.Screen name="inbox" options={{ href: null }} /> 
      <Tabs.Screen name="notifications" options={{ href: null }} /> 
      <Tabs.Screen name="conversation" options={{ href: null }} /> 
      
      {/* Eski dosyalar */}
      <Tabs.Screen name="placeholder" options={{ href: null }} />

    </Tabs>
  );
}