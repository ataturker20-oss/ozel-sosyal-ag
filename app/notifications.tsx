import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av'; // Video için
import { Stack, useRouter } from 'expo-router';
import { arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where } from 'firebase/firestore';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Platform, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

export default function NotificationsScreen() {
  const router = useRouter();
  const currentUser = auth.currentUser;
  
  // Bildirim Verileri
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Profil Görüntüleme State'leri (Search ekranındaki gibi)
  const [selectedUser, setSelectedUser] = useState<any>(null); 
  const [userPosts, setUserPosts] = useState<any[]>([]); 
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);

  useEffect(() => {
    if (!currentUser) return;

    const notifRef = collection(db, "notifications");
    const q = query(
      notifRef, 
      where("recipientId", "==", currentUser.uid)
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      // 1. Bildirimleri Al (Tip hatasını çözmek için 'as any' kullanıyoruz)
      const rawList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      
      // 2. Her bildirim için GÖNDERENİN GÜNCEL BİLGİSİNİ çek
      const enrichedList = await Promise.all(rawList.map(async (notif) => {
        let currentSenderName = notif.senderName || "Kullanıcı";
        let senderAvatar = null;
        
        if (notif.senderId) {
            const senderDoc = await getDoc(doc(db, "users", notif.senderId));
            if (senderDoc.exists()) {
                const data = senderDoc.data();
                currentSenderName = data.username || "Kullanıcı";
                senderAvatar = data.avatar_url;
            }
        }
        return { ...notif, currentSenderName, senderAvatar };
      }));

      // 3. Sırala
      enrichedList.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      
      setNotifications(enrichedList);
      setLoading(false);

      // 4. Okundu İşaretle
      const unreadBatch = rawList.filter((n: any) => !n.isRead);
      if (unreadBatch.length > 0) {
         unreadBatch.forEach((n: any) => {
            updateDoc(doc(db, "notifications", n.id), { isRead: true });
         });
      }
    });

    return () => unsubscribe();
  }, []);

  // --- PROFİL AÇMA FONKSİYONLARI ---
  const openUserProfile = async (userId: string) => {
    if (!userId) return;
    setLoadingPosts(true);
    
    // Kullanıcı bilgilerini çek
    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists()) {
       const userData = { id: userDoc.id, ...userDoc.data() };
       setSelectedUser(userData);

       // Takip durumunu kontrol et
       if (currentUser) {
          const myDoc = await getDoc(doc(db, "users", currentUser.uid));
          if (myDoc.exists()) {
              const followingList = myDoc.data().following || [];
              setIsFollowing(followingList.includes(userId));
          }
       }

       // Postlarını çek
       try {
         const q = query(collection(db, "posts"), where("userId", "==", userId));
         const querySnapshot = await getDocs(q);
         const data = querySnapshot.docs.map((doc: { id: any; data: () => any; }) => ({ id: doc.id, ...doc.data() }));
         data.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
         setUserPosts(data);
       } catch (error) { console.log("Post hata:", error); } 
    }
    setLoadingPosts(false);
  };

  const handleFollowToggle = async () => {
    if (!currentUser || !selectedUser) return;
    setLoadingFollow(true);
    try {
        const myRef = doc(db, "users", currentUser.uid);
        const targetRef = doc(db, "users", selectedUser.id);

        if (isFollowing) {
            await updateDoc(myRef, { following: arrayRemove(selectedUser.id) });
            await updateDoc(targetRef, { followers: arrayRemove(currentUser.uid) });
            setIsFollowing(false);
        } else {
            await updateDoc(myRef, { following: arrayUnion(selectedUser.id) });
            await updateDoc(targetRef, { followers: arrayUnion(currentUser.uid) });
            setIsFollowing(true);
        }
    } catch (error) { Alert.alert("Hata", "İşlem yapılamadı."); } 
    finally { setLoadingFollow(false); }
  };

  const goToChat = () => {
    if (!selectedUser) return;
    const userToChat = selectedUser; // Kaybetmemek için değişkene at
    setSelectedUser(null); // Modalı kapat
    router.push({
      pathname: "/conversation",
      params: { targetUserId: userToChat.id, targetUsername: userToChat.username || "Kullanıcı" }
    });
  };

  // --- YARDIMCI FONKSİYONLAR ---
  const formatTime = (timestamp: any) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getIcon = (type: string) => {
    switch(type) {
        case 'like': return <Ionicons name="heart" size={20} color="#FF3B30" />;
        case 'comment': return <Ionicons name="chatbubble" size={20} color="#007AFF" />;
        case 'follow': return <Ionicons name="person-add" size={20} color="#25D366" />;
        default: return <Ionicons name="notifications" size={20} color="#fff" />;
    }
  };

  const renderGridItem = (post: any) => {
    if (post.mediaType === 'video') {
       return (
         <View style={styles.gridImage}>
            <Video source={{ uri: post.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode={ResizeMode.COVER} />
            <View style={styles.videoIconOverlay}><Ionicons name="play" size={20} color="white" /></View>
         </View>
       );
    }
    return <Image source={{ uri: post.imageUrl }} style={styles.gridImage} />;
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      <Stack.Screen options={{ headerShown: false }} />

      {/* HEADER */}
      <View style={styles.header}>
         <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
         </TouchableOpacity>
         <Text style={styles.headerTitle}>Bildirimler</Text>
         <View style={{width: 28}} /> 
      </View>

      {/* LİSTE */}
      {loading ? (
        <ActivityIndicator style={{marginTop: 50}} color="#FF3B30" />
      ) : (
        <FlatList
          data={notifications}
          keyExtractor={item => item.id}
          contentContainerStyle={{padding: 15}}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
               <Ionicons name="notifications-off-outline" size={50} color="#333" />
               <Text style={styles.emptyText}>Henüz bildirim yok</Text>
            </View>
          }
          renderItem={({ item }) => (
            <TouchableOpacity 
               style={[styles.notifItem, !item.isRead && styles.unreadItem]}
               onPress={() => openUserProfile(item.senderId)} // Tıklayınca profile git
            >
              {/* Sol: İkon veya Avatar */}
              <View style={styles.leftSide}>
                 {/* Eğer takip bildirimi ise avatar göster, değilse ikon */}
                 <View style={styles.iconBadge}>
                    {item.senderAvatar ? (
                        <Image source={{uri: item.senderAvatar}} style={{width:'100%', height:'100%', borderRadius: 20}} />
                    ) : getIcon(item.type)}
                 </View>
                 
                 <View style={{marginLeft: 10, flex: 1}}>
                    <Text style={styles.notifText}>
                        <Text style={{fontWeight: 'bold', color: '#fff'}}>@{item.currentSenderName}</Text> {item.message}
                    </Text>
                    <Text style={styles.timeText}>{formatTime(item.createdAt)}</Text>
                 </View>
              </View>

              {/* Sağ: Post Resmi (Varsa) */}
              {item.postImage && (
                  <Image source={{ uri: item.postImage }} style={styles.postThumb} />
              )}
            </TouchableOpacity>
          )}
        />
      )}

      {/* --- PROFİL MODALI (SEARCH'TEKİNİN AYNISI) --- */}
      <Modal visible={selectedUser !== null} animationType="slide" onRequestClose={() => setSelectedUser(null)}>
        <View style={styles.profileContainer}>
          <View style={styles.profileHeader}>
            <TouchableOpacity onPress={() => setSelectedUser(null)} style={styles.backBtn}><Ionicons name="arrow-back" size={28} color="#fff" /></TouchableOpacity>
            <Text style={styles.headerTitle}>@{selectedUser?.username}</Text>
          </View>

          <ScrollView>
             <View style={styles.userInfoSection}>
                <View style={styles.bigAvatar}>
                  {selectedUser?.avatar_url ? <Image source={{ uri: selectedUser.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarTextLarge}>{selectedUser?.username?.[0]?.toUpperCase()}</Text>}
                </View>
                <Text style={styles.statsText}>{userPosts.length} Gönderi</Text>

                <View style={{flexDirection: 'row', gap: 10, marginTop: 10}}>
                    <TouchableOpacity style={[styles.actionBtn, isFollowing ? styles.unfollowBtn : styles.followBtn]} onPress={handleFollowToggle} disabled={loadingFollow}>
                        {loadingFollow ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff', fontWeight:'bold'}}>{isFollowing ? "Takibi Bırak" : "Takip Et"}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.actionBtn, styles.messageBtn]} onPress={goToChat}>
                        <Ionicons name="chatbubble-ellipses-outline" size={20} color="#fff" style={{marginRight: 5}} />
                        <Text style={{color:'#fff', fontWeight:'bold'}}>Mesaj</Text>
                    </TouchableOpacity>
                </View>
             </View>

             {loadingPosts ? <ActivityIndicator color="#FF3B30" style={{marginTop: 50}} /> : (
                <View style={styles.gridContainer}>
                  {userPosts.length === 0 ? <Text style={styles.emptyText}>Henüz gönderisi yok.</Text> : null}
                  {userPosts.map((post) => (
                    <TouchableOpacity key={post.id} style={styles.gridItem} onPress={() => setSelectedPost(post)}>{renderGridItem(post)}</TouchableOpacity>
                  ))}
                </View>
             )}
          </ScrollView>

          {/* POST DETAY */}
          <Modal visible={selectedPost !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedPost(null)}>
            <View style={styles.postModalOverlay}>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedPost(null)}><Ionicons name="close" size={30} color="#fff" /></TouchableOpacity>
              {selectedPost && (
                 selectedPost.mediaType === 'video' ? (
                    <Video source={{ uri: selectedPost.imageUrl }} style={styles.fullImage} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay />
                 ) : ( <Image source={{ uri: selectedPost.imageUrl }} style={styles.fullImage} resizeMode="contain" /> )
              )}
            </View>
          </Modal>
        </View>
      </Modal>

    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' }, 
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 20, backgroundColor: '#050505', borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  backBtn: { padding: 5 },

  notifItem: { flexDirection: 'row', alignItems: 'center', padding: 15, backgroundColor: '#1A1A1A', borderRadius: 15, marginBottom: 10, borderWidth: 1, borderColor: '#222' },
  unreadItem: { backgroundColor: '#222', borderColor: '#444' }, // Okunmamışlar daha parlak
  
  leftSide: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  iconBadge: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333', overflow:'hidden' },
  notifText: { color: '#ccc', fontSize: 14, lineHeight: 20 },
  timeText: { color: '#666', fontSize: 11, marginTop: 3 },
  postThumb: { width: 40, height: 40, borderRadius: 5, marginLeft: 10, backgroundColor: '#333' },

  emptyContainer: { alignItems:'center', marginTop: 80 },
  emptyText: { color: '#666', fontSize: 16, marginTop: 10, fontWeight: 'bold' },

  // Profil Modal Stilleri
  profileContainer: { flex: 1, backgroundColor: '#050505' },
  profileHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: '#222' },
  userInfoSection: { alignItems: 'center', padding: 30 },
  bigAvatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FF3B30', marginBottom: 15, overflow:'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  avatarTextLarge: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  statsText: { color: '#888', fontSize: 16, marginBottom: 15 },
  
  actionBtn: { flexDirection:'row', paddingVertical:10, paddingHorizontal:20, borderRadius:20, minWidth: 120, justifyContent: 'center', alignItems:'center' },
  followBtn: { backgroundColor: '#FF3B30' }, 
  unfollowBtn: { backgroundColor: '#333', borderWidth: 1, borderColor: '#666' }, 
  messageBtn: { backgroundColor: '#222', borderWidth: 1, borderColor: '#333' },

  gridContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '33%', aspectRatio: 1, padding: 1 },
  gridImage: { width: '100%', height: '100%', backgroundColor: '#111' },
  videoIconOverlay: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 2 },
  
  postModalOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  fullImage: { width: '100%', height: '80%' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 99, padding: 10, backgroundColor: 'rgba(50,50,50,0.5)', borderRadius: 20 }
});