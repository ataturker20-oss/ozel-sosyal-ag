import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

export default function SearchScreen() {
  const router = useRouter();
  const currentUser = auth.currentUser;

  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<any>(null); 
  const [userPosts, setUserPosts] = useState<any[]>([]); 
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);

  const saveNotification = async (recipientId: string, type: 'follow', message: string) => {
    if (recipientId === currentUser?.uid) return;
    try {
      const username = currentUser?.email?.split('@')[0] || "Biri";
      await addDoc(collection(db, "notifications"), {
        recipientId: recipientId, senderId: currentUser?.uid, senderName: username,
        type: type, message: message, postImage: null, isRead: false, createdAt: serverTimestamp()
      });
    } catch (e) { console.log(e); }
  };

  const sendPushNotification = async (targetUserId: string, title: string, body: string) => {
    try {
      const userDoc = await getDoc(doc(db, "users", targetUserId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        if (userData.pushToken) {
          await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: userData.pushToken, sound: 'default', title: title, body: body }),
          });
        }
      }
    } catch (e) { }
  };

  const handleSearch = async (text: string) => {
    setSearchText(text);
    if (text.length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const usersRef = collection(db, "users");
      const q = query(usersRef, where("username", ">=", text), where("username", "<=", text + '\uf8ff'));
      const querySnapshot = await getDocs(q);
      const users = querySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((u: any) => u.id !== currentUser?.uid);
      setResults(users);
    } catch (error) { console.log("Arama hatası:", error); } 
    finally { setSearching(false); }
  };

  const openUserProfile = async (user: any) => {
    setSelectedUser(user);
    setLoadingPosts(true);
    
    if (currentUser) {
        const myDocRef = doc(db, "users", currentUser.uid);
        const myDoc = await getDoc(myDocRef);
        if (myDoc.exists()) {
            const myData = myDoc.data();
            const followingList = myData.following || [];
            setIsFollowing(followingList.includes(user.id));
        }
    }

    try {
      const q = query(collection(db, "posts"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setUserPosts(data);
    } catch (error) { console.log("Post hata:", error); } 
    finally { setLoadingPosts(false); }
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
            await saveNotification(selectedUser.id, 'follow', "seni takip etmeye başladı.");
            await sendPushNotification(selectedUser.id, "Yeni Takipçi 👤", "Biri seni takip etmeye başladı.");
        }
    } catch (error) { Alert.alert("Hata", "İşlem yapılamadı."); } 
    finally { setLoadingFollow(false); }
  };

  const goToChat = () => {
    if (!selectedUser) return;
    setSelectedUser(null);
    router.push({
      pathname: "/conversation",
      params: { targetUserId: selectedUser.id, targetUsername: selectedUser.username || "Kullanıcı" }
    });
  };

  const renderGridItem = (post: any) => {
    if (post.mediaType === 'video') {
       return <View style={styles.gridImage}><Video source={{ uri: post.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode={ResizeMode.COVER} /><View style={styles.videoIconOverlay}><Ionicons name="play" size={20} color="white" /></View></View>;
    }
    return <Image source={{ uri: post.imageUrl }} style={styles.gridImage} />;
  };

  return (
    <View style={styles.container}>
      <View style={styles.searchBarContainer}>
        <Ionicons name="search" size={20} color="#666" style={{marginRight: 10}} />
        <TextInput style={styles.searchInput} placeholder="Kullanıcı ara (@turker)..." placeholderTextColor="#666" value={searchText} onChangeText={handleSearch} autoCapitalize="none" />
        {searching && <ActivityIndicator color="#FF3B30" />}
      </View>
      <FlatList 
        data={results} keyExtractor={item => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.userItem} onPress={() => openUserProfile(item)}>
            <View style={styles.avatarContainer}>
              {item.avatar_url ? <Image source={{ uri: item.avatar_url }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{item.username?.[0]?.toUpperCase()}</Text>}
            </View>
            <View style={{flex: 1, justifyContent: 'center'}}><Text style={styles.username}>@{item.username}</Text></View>
            <Ionicons name="chevron-forward" size={20} color="#333" />
          </TouchableOpacity>
        )}
        ListEmptyComponent={searchText.length > 2 && !searching ? <Text style={styles.emptyText}>Kullanıcı bulunamadı.</Text> : null}
      />
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
          <Modal visible={selectedPost !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedPost(null)}>
            <View style={styles.postModalOverlay}>
              <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedPost(null)}><Ionicons name="close" size={30} color="#fff" /></TouchableOpacity>
              {selectedPost && ( selectedPost.mediaType === 'video' ? ( <Video source={{ uri: selectedPost.imageUrl }} style={styles.fullImage} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay /> ) : ( <Image source={{ uri: selectedPost.imageUrl }} style={styles.fullImage} resizeMode="contain" /> ) )}
            </View>
          </Modal>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505', paddingTop: 50, paddingHorizontal: 15 },
  searchBarContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 10, marginBottom: 20 },
  searchInput: { flex: 1, color: '#fff', fontSize: 16 },
  userItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1A1A1A', padding: 15, borderRadius: 15, marginBottom: 10 },
  avatarContainer: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginRight: 15, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  username: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 20 },
  profileContainer: { flex: 1, backgroundColor: '#050505' },
  profileHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, paddingTop: 50, borderBottomWidth: 1, borderBottomColor: '#222' },
  backBtn: { marginRight: 20 },
  headerTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
  userInfoSection: { alignItems: 'center', padding: 30 },
  bigAvatar: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#FF3B30', marginBottom: 15, overflow:'hidden' },
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