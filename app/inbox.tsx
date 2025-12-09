import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { collection, doc, getDoc, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

export default function InboxScreen() {
  const router = useRouter();
  const currentUser = auth.currentUser;
  const [chats, setChats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) return;

    const chatsRef = collection(db, "chats");
    const q = query(
      chatsRef, 
      where("participants", "array-contains", currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      // 1. Ham verileri al
      const rawChats = snapshot.docs.map(doc => {
        const data = doc.data();
        const otherUserId = data.participants.find((id: string) => id !== currentUser.uid);
        
        // Okundu kontrolü
        let isUnread = false;
        if (data.readStatus && typeof data.readStatus[currentUser.uid] !== 'undefined') {
            isUnread = data.readStatus[currentUser.uid] === false;
        }

        return { 
          id: doc.id, 
          ...data,
          otherUserId: otherUserId, // Sadece ID'yi alıyoruz, ismi aşağıda güncel çekeceğiz
          isUnread: isUnread
        };
      });

      // 2. Her sohbet için KARŞI TARAFIN GÜNCEL BİLGİLERİNİ çek
      const chatsWithDetails = await Promise.all(rawChats.map(async (chat) => {
        if(chat.otherUserId) {
            const userDoc = await getDoc(doc(db, "users", chat.otherUserId));
            if(userDoc.exists()) {
                const userData = userDoc.data();
                return { 
                    ...chat, 
                    otherAvatar: userData.avatar_url,
                    otherName: userData.username || "Kullanıcı" // <-- İşte burası güncel ismi alır!
                };
            }
        }
        // Eğer kullanıcı bulunamazsa eski yöntemle devam et (Yedek)
        return { ...chat, otherName: "Bilinmeyen" };
      }));

      // 3. Sırala
      chatsWithDetails.sort((a: any, b: any) => {
         const dateA = a.updatedAt?.seconds || 0;
         const dateB = b.updatedAt?.seconds || 0;
         return dateB - dateA;
      });

      setChats(chatsWithDetails);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    const now = new Date();
    if (date.toDateString() === now.toDateString()) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const openChat = async (item: any) => {
    if (item.isUnread) {
       const chatRef = doc(db, "chats", item.id);
       await updateDoc(chatRef, {
          [`readStatus.${currentUser?.uid}`]: true
       });
    }

    router.push({
      pathname: "/conversation",
      params: { targetUserId: item.otherUserId, targetUsername: item.otherName }
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
         <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
         </TouchableOpacity>
         <Text style={styles.headerTitle}>Mesajlar</Text>
         <View style={{width: 28}} /> 
      </View>

      {loading ? (
        <ActivityIndicator style={{marginTop: 50}} color="#FF3B30" />
      ) : (
        <FlatList
          data={chats}
          keyExtractor={item => item.id}
          contentContainerStyle={{padding: 15}}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
               <View style={styles.iconCircle}><Ionicons name="chatbubbles" size={40} color="#333" /></View>
               <Text style={styles.emptyText}>Henüz mesajın yok</Text>
               <Text style={styles.emptySubText}>Arkadaşlarının profiline gidip sohbet başlatabilirsin.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity 
              style={[styles.chatItem, item.isUnread && styles.unreadItem]} 
              activeOpacity={0.7}
              onPress={() => openChat(item)}
            >
              <View style={styles.avatarContainer}>
                {item.otherAvatar ? ( <Image source={{ uri: item.otherAvatar }} style={styles.avatarImg} /> ) : ( <Text style={styles.avatarText}>{item.otherName ? item.otherName[0].toUpperCase() : "?"}</Text> )}
              </View>
              
              <View style={styles.chatInfo}>
                <View style={styles.topRow}>
                    <Text style={[styles.username, item.isUnread ? {color:'#fff', fontWeight:'900'} : {color:'#ccc'}]}>
                       @{item.otherName}
                    </Text>
                    <Text style={[styles.timeText, item.isUnread && {color:'#FF3B30'}]}>
                       {formatTime(item.updatedAt)}
                    </Text>
                </View>
                
                <View style={{flexDirection:'row', alignItems:'center'}}>
                   <Text 
                      style={[styles.lastMsg, item.isUnread ? {color:'#fff', fontWeight:'bold'} : {color:'#666'}]} 
                      numberOfLines={1}
                   >
                      {item.lastMessage || "Sohbet başladı 👋"}
                   </Text>
                   {item.isUnread && <View style={styles.unreadDot} />}
                </View>
              </View>
              
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' }, 
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 20, backgroundColor: '#050505', borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  backBtn: { padding: 5 },
  chatItem: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#1A1A1A', borderRadius: 20, marginBottom: 10, borderWidth: 1, borderColor: '#222' },
  unreadItem: { borderColor: '#444', backgroundColor: '#222' }, 
  avatarContainer: { width: 55, height: 55, borderRadius: 27.5, backgroundColor: '#252525', justifyContent: 'center', alignItems: 'center', marginRight: 15, overflow: 'hidden' },
  avatarImg: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: 'bold' },
  chatInfo: { flex: 1 },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 5 },
  username: { fontSize: 16 },
  timeText: { color: '#666', fontSize: 12 },
  lastMsg: { fontSize: 14, flex: 1 },
  unreadDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30', marginLeft: 10 }, 
  emptyContainer: { alignItems:'center', marginTop: 80 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginBottom: 20 },
  emptyText: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  emptySubText: { color: '#666', fontSize: 13, textAlign: 'center', width: '70%' }
});