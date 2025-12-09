import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Image, Modal, RefreshControl, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { auth, db, storage } from '../../firebaseConfig';
// setDoc EKLENDİ
import { signOut } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';

export default function ProfileScreen() {
  const router = useRouter();
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [userData, setUserData] = useState<any>({}); 
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [editModalVisible, setEditModalVisible] = useState(false); 
  const [newUsername, setNewUsername] = useState('');
  const [newAvatar, setNewAvatar] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const user = auth.currentUser;

  const fetchProfileData = async () => {
    if (!user) return;
    try {
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists()) {
        const data = userDocSnap.data();
        setUserData(data);
        setNewUsername(data.username || ''); 
      } else { setUserData({}); }

      const q = query(collection(db, "posts"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      data.sort((a: any, b: any) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setUserPosts(data);
    } catch (error) { console.log("Profil hatası:", error); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchProfileData(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchProfileData(); };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
    if (!result.canceled) setNewAvatar(result.assets[0].uri);
  };

  // --- BURASI DÜZELTİLDİ ---
  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      let avatarUrl = userData.avatar_url || null; 
      if (newAvatar) {
        const response = await fetch(newAvatar);
        const blob = await response.blob();
        const filename = `profile_pictures/${user.uid}.jpg`; 
        const storageRef = ref(storage, filename);
        await uploadBytes(storageRef, blob);
        avatarUrl = await getDownloadURL(storageRef);
      }
      
      // HATA VEREN YER BURASIYDI. ARTIK setDoc KULLANIYORUZ.
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        username: newUsername,
        avatar_url: avatarUrl,
        email: user.email,
        uid: user.uid
      }, { merge: true }); // MERGE: TRUE VARSA GÜNCELLER YOKSA AÇAR

      Alert.alert("Başarılı", "Profil güncellendi! ✅");
      setEditModalVisible(false); setNewAvatar(null);
      fetchProfileData(); 
    } catch (error: any) { Alert.alert("Hata", error.message); } 
    finally { setSaving(false); }
  };

  const handleLogout = async () => {
    Alert.alert("Çıkış", "Çıkmak istiyor musun?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Çıkış Yap", style: 'destructive', onPress: async () => { await signOut(auth); router.replace('/login'); } }
    ]);
  };

  const userInitial = userData.username ? userData.username[0].toUpperCase() : (user?.email ? user.email[0].toUpperCase() : "U");

  const renderGridItem = (post: any) => {
    if (post.mediaType === 'video') {
       return <View style={styles.gridImage}><Video source={{ uri: post.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode={ResizeMode.COVER} /><View style={styles.videoIconOverlay}><Ionicons name="play" size={20} color="white" /></View></View>;
    }
    return <Image source={{ uri: post.imageUrl }} style={styles.gridImage} />;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatarContainer}>{userData.avatar_url ? ( <Image source={{ uri: userData.avatar_url }} style={styles.avatarImage} /> ) : ( <Text style={styles.avatarText}>{userInitial}</Text> )}</View>
        <Text style={styles.username}>@{userData.username || "isimsiz"}</Text>
        <Text style={styles.stats}>{userPosts.length} Gönderi</Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.editButton} onPress={() => setEditModalVisible(true)}><Text style={styles.editText}>Profili Düzenle ✏️</Text></TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}><Ionicons name="log-out-outline" size={20} color="#FF4444" /></TouchableOpacity>
        </View>
      </View>
      <View style={styles.divider} />
      {loading ? <ActivityIndicator color="#C12626" style={{marginTop: 50}} /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}>
          {userPosts.length === 0 ? <Text style={styles.emptyText}>Henüz hiç gönderin yok. 📸</Text> : (
            <View style={styles.gridContainer}>
              {userPosts.map((post) => (
                <TouchableOpacity key={post.id} style={styles.gridItem} onPress={() => setSelectedPost(post)}>{renderGridItem(post)}</TouchableOpacity>
              ))}
            </View>
          )}
        </ScrollView>
      )}
      <Modal visible={editModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.editModalContent}>
            <Text style={styles.modalTitle}>Profili Düzenle</Text>
            <TouchableOpacity onPress={pickImage} style={styles.avatarEditWrapper}>
               {newAvatar ? ( <Image source={{ uri: newAvatar }} style={styles.avatarEditImage} /> ) : (userData.avatar_url ? ( <Image source={{ uri: userData.avatar_url }} style={styles.avatarEditImage} /> ) : ( <View style={[styles.avatarEditImage, {backgroundColor:'#333', justifyContent:'center', alignItems:'center'}]}><Text style={{color:'#fff', fontSize:30}}>{userInitial}</Text></View> ))}
               <View style={styles.cameraIconBadge}><Ionicons name="camera" size={16} color="#fff" /></View>
            </TouchableOpacity>
            <Text style={styles.label}>Kullanıcı Adı</Text>
            <TextInput style={styles.input} value={newUsername} onChangeText={setNewUsername} placeholder="Yeni kullanıcı adı" placeholderTextColor="#666" />
            
            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditModalVisible(false)}><Text style={{color:'#fff'}}>İptal</Text></TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSaveProfile} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff', fontWeight:'bold'}}>Kaydet</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={selectedPost !== null} transparent={true} animationType="fade" onRequestClose={() => setSelectedPost(null)}>
        <View style={styles.postModalOverlay}>
          <TouchableOpacity style={styles.closeBtn} onPress={() => setSelectedPost(null)}><Ionicons name="close" size={30} color="#fff" /></TouchableOpacity>
          {selectedPost && ( selectedPost.mediaType === 'video' ? ( <Video source={{ uri: selectedPost.imageUrl }} style={styles.fullImage} resizeMode={ResizeMode.CONTAIN} useNativeControls shouldPlay isLooping /> ) : ( <Image source={{ uri: selectedPost.imageUrl }} style={styles.fullImage} resizeMode="contain" /> ) )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: 50 },
  header: { alignItems: 'center', marginBottom: 20 },
  avatarContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#C12626', marginBottom: 10, overflow: 'hidden' },
  avatarImage: { width: '100%', height: '100%' },
  avatarText: { color: '#fff', fontSize: 40, fontWeight: 'bold' },
  username: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginBottom: 5 },
  stats: { color: '#888', fontSize: 14, marginBottom: 15 },
  actionButtons: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  editButton: { backgroundColor: '#222', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  editText: { color: '#fff', fontWeight: 'bold' },
  logoutButton: { backgroundColor: '#222', padding: 10, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  divider: { height: 1, backgroundColor: '#222', width: '100%', marginBottom: 2 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '33%', aspectRatio: 1, padding: 1 },
  gridImage: { width: '100%', height: '100%', backgroundColor: '#111' },
  videoIconOverlay: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 2 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 50 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  editModalContent: { width: '85%', backgroundColor: '#181818', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  avatarEditWrapper: { alignSelf: 'center', marginBottom: 20 },
  avatarEditImage: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#333' },
  cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#C12626', padding: 8, borderRadius: 20 },
  label: { color: '#888', marginBottom: 5, marginLeft: 5 },
  input: { backgroundColor: '#111', color: '#fff', padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cancelBtn: { padding: 15 },
  saveBtn: { backgroundColor: '#C12626', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10 },
  postModalOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'center' },
  fullImage: { width: '100%', height: '80%' },
  closeBtn: { position: 'absolute', top: 50, right: 20, zIndex: 99, padding: 10, backgroundColor: 'rgba(50,50,50,0.5)', borderRadius: 20 }
});