import { Ionicons } from '@expo/vector-icons';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import {
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where
} from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';

import { auth, db, storage } from '../../firebaseConfig';

const { width } = Dimensions.get('window');

// --- TYPES ---
interface UserData {
  uid: string;
  username: string;
  avatar_url?: string;
  email?: string;
}

interface Post {
  id: string;
  userId: string;
  username: string;
  imageUrl: string;
  mediaType: 'image' | 'video';
  caption?: string;
  likes: number;
  likedBy: string[];
  commentCount: number;
  location?: string;
  createdAt: any;
}

// --- HELPER FUNCTIONS ---
const getTimeAgo = (timestamp: any) => {
  if (!timestamp) return "Az önce";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = (now.getTime() - date.getTime()) / 1000;
  if (diff < 60) return "Az önce";
  if (diff < 3600) return Math.floor(diff / 60) + "dk";
  if (diff < 86400) return Math.floor(diff / 3600) + "s";
  return Math.floor(diff / 86400) + "g";
};

// --- SUB-COMPONENT: EDIT PROFILE MODAL ---
const EditProfileModal = ({ visible, onClose, userData, onUpdate }: { visible: boolean, onClose: () => void, userData: UserData, onUpdate: () => void }) => {
    const [newUsername, setNewUsername] = useState(userData.username || '');
    const [newAvatar, setNewAvatar] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setNewUsername(userData.username || '');
        setNewAvatar(null);
    }, [userData, visible]);

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, allowsEditing: true, aspect: [1, 1], quality: 0.5 });
        if (!result.canceled) setNewAvatar(result.assets[0].uri);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            let avatarUrl = userData.avatar_url || null;
            if (newAvatar) {
                const response = await fetch(newAvatar);
                const blob = await response.blob();
                const storageRef = ref(storage, `profile_pictures/${userData.uid}.jpg`);
                await uploadBytes(storageRef, blob);
                avatarUrl = await getDownloadURL(storageRef);
            }

            await setDoc(doc(db, "users", userData.uid), {
                username: newUsername,
                avatar_url: avatarUrl,
                uid: userData.uid
            }, { merge: true });

            Alert.alert("Başarılı", "Profil güncellendi! ✅");
            onUpdate();
            onClose();
        } catch (e: any) { Alert.alert("Hata", e.message); }
        finally { setSaving(false); }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
            <View style={styles.modalOverlay}>
                <View style={styles.editModalContent}>
                    <Text style={styles.modalTitle}>Profili Düzenle</Text>
                    <TouchableOpacity onPress={pickImage} style={styles.avatarEditWrapper}>
                        {newAvatar ? <Image source={{ uri: newAvatar }} style={styles.avatarEditImage} /> : 
                         userData.avatar_url ? <Image source={{ uri: userData.avatar_url }} style={styles.avatarEditImage} /> :
                         <View style={[styles.avatarEditImage, {backgroundColor:'#333', justifyContent:'center', alignItems:'center'}]}><Text style={{color:'#fff', fontSize:30}}>{userData.username?.[0]?.toUpperCase() || 'U'}</Text></View>}
                        <View style={styles.cameraIconBadge}><Ionicons name="camera" size={16} color="#fff" /></View>
                    </TouchableOpacity>
                    <Text style={styles.label}>Kullanıcı Adı</Text>
                    <TextInput style={styles.inputModal} value={newUsername} onChangeText={setNewUsername} placeholder="Yeni kullanıcı adı" placeholderTextColor="#666" />
                    <View style={styles.modalButtons}>
                        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}><Text style={{color:'#fff'}}>İptal</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff', fontWeight:'bold'}}>Kaydet</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
};

// --- SUB-COMPONENT: POST DETAIL MODAL ---
const PostDetailModal = ({ post, visible, onClose, currentUser, onDeletePost, onPostUpdate }: { post: Post, visible: boolean, onClose: () => void, currentUser: any, onDeletePost: () => void, onPostUpdate: (post: Post) => void }) => {
    const [currentPost, setCurrentPost] = useState<Post>(post);
    const [comments, setComments] = useState<any[]>([]);
    const [showComments, setShowComments] = useState(false);
    const [loadingComments, setLoadingComments] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [footerVisible, setFooterVisible] = useState(true);
    const [videoStatus, setVideoStatus] = useState<AVPlaybackStatus | null>(null);
    const videoRef = useRef<Video>(null);

    const isLiked = currentPost?.likedBy?.includes(currentUser?.uid);

    useEffect(() => { setCurrentPost(post); }, [post]);

    useEffect(() => {
        if (showComments && currentPost?.id) {
            setLoadingComments(true);
            const unsub = onSnapshot(query(collection(db, "posts", currentPost.id, "comments"), orderBy("createdAt", "asc")), (snap) => {
                setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoadingComments(false);
            });
            return () => unsub();
        }
    }, [showComments, currentPost?.id]);

    const handleLike = async () => {
        if (!currentUser) return;
        const postRef = doc(db, "posts", currentPost.id);
        const newLikes = isLiked ? currentPost.likes - 1 : currentPost.likes + 1;
        const newLikedBy = isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid);
        
        const updatedPost = { ...currentPost, likes: Math.max(0, newLikes), likedBy: isLiked ? currentPost.likedBy.filter(id => id !== currentUser.uid) : [...currentPost.likedBy, currentUser.uid] };
        
        setCurrentPost(updatedPost);
        onPostUpdate(updatedPost); // Parent state'i güncelle

        try { await updateDoc(postRef, { likes: isLiked ? increment(-1) : increment(1), likedBy: newLikedBy }); } catch (e) {}
    };

    const handleSendComment = async () => {
        if (!newComment.trim() || !currentUser) return;
        try {
            const username = (await getDoc(doc(db, "users", currentUser.uid))).data()?.username || "Anonim";
            await addDoc(collection(db, "posts", currentPost.id, "comments"), { text: newComment, userId: currentUser.uid, username, createdAt: serverTimestamp() });
            await updateDoc(doc(db, "posts", currentPost.id), { commentCount: increment(1) });
            
            const updatedPost = { ...currentPost, commentCount: (currentPost.commentCount || 0) + 1 };
            setCurrentPost(updatedPost);
            onPostUpdate(updatedPost);
            setNewComment(''); Keyboard.dismiss();
        } catch (e) {}
    };

    const handleDeleteComment = (commentId: string) => {
         Alert.alert("Sil", "Yorumu sil?", [
             { text: "İptal" },
             { text: "Sil", style: 'destructive', onPress: async () => {
                 await deleteDoc(doc(db, "posts", currentPost.id, "comments", commentId));
                 await updateDoc(doc(db, "posts", currentPost.id), { commentCount: increment(-1) });
                 const updatedPost = { ...currentPost, commentCount: Math.max(0, currentPost.commentCount - 1) };
                 setCurrentPost(updatedPost);
                 onPostUpdate(updatedPost);
             }}
         ]);
    };

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayPost}>
                <View style={styles.modalContentPost}>
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}><Ionicons name="chevron-down" size={30} color="#fff" /></TouchableOpacity>
                    
                    <TouchableWithoutFeedback onPress={() => { setFooterVisible(!footerVisible); Keyboard.dismiss(); }}>
                        <View style={showComments ? styles.imageWithComments : styles.fullImage}>
                            {currentPost.mediaType === 'video' ? (
                                <Video 
                                    ref={videoRef} source={{ uri: currentPost.imageUrl }} style={{ width: '100%', height: '100%' }}
                                    resizeMode={ResizeMode.CONTAIN} isLooping shouldPlay={visible}
                                    onPlaybackStatusUpdate={status => setVideoStatus(status)}
                                />
                            ) : (
                                <Image source={{ uri: currentPost.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                            )}
                        </View>
                    </TouchableWithoutFeedback>

                    {footerVisible && (
                        <View style={showComments ? styles.footerWithComments : styles.modalFooter}>
                            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                                <View>
                                    <Text style={styles.usernameText}>@{currentPost.username}</Text>
                                    <Text style={{color:'#666', fontSize:12}}>{getTimeAgo(currentPost.createdAt)}</Text>
                                </View>
                                <View style={{flexDirection:'row', gap:15}}>
                                    <TouchableOpacity onPress={onDeletePost}><Ionicons name="trash-outline" size={26} color="#FF3B30" /></TouchableOpacity>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(!showComments)}>
                                        <Ionicons name={showComments ? "chatbubble" : "chatbubble-outline"} size={26} color="#000" />
                                        <Text style={styles.countText}>{currentPost.commentCount}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
                                        <Ionicons name={isLiked ? "heart" : "heart-outline"} size={26} color="#FF3B30" />
                                        <Text style={styles.countText}>{currentPost.likes}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                            
                            {!showComments && currentPost.caption && <Text style={styles.caption}>{currentPost.caption}</Text>}

                            {showComments && (
                                <View style={styles.commentsSection}>
                                    <View style={styles.divider} />
                                    <ScrollView style={styles.commentsList}>
                                        {loadingComments ? <ActivityIndicator color="#FF3B30" /> : comments.map(c => (
                                            <TouchableOpacity key={c.id} onLongPress={() => c.userId === currentUser?.uid && handleDeleteComment(c.id)} style={styles.commentItem}>
                                                <Text style={styles.commentUser}>@{c.username} <Text style={styles.commentText}>{c.text}</Text></Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                    <View style={styles.inputContainer}>
                                        <TextInput style={styles.input} placeholder="Yorum yaz..." value={newComment} onChangeText={setNewComment} placeholderTextColor="#888" />
                                        <TouchableOpacity onPress={handleSendComment}><Ionicons name="arrow-up-circle" size={32} color="#FF3B30" /></TouchableOpacity>
                                    </View>
                                </View>
                            )}
                        </View>
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
};

// --- MAIN COMPONENT: PROFILE SCREEN ---
export default function ProfileScreen() {
  const router = useRouter();
  const user = auth.currentUser;

  const [userPosts, setUserPosts] = useState<Post[]>([]);
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);

  const fetchProfileData = useCallback(async () => {
    if (!user) return;
    try {
      const userDocSnap = await getDoc(doc(db, "users", user.uid));
      if (userDocSnap.exists()) setUserData(userDocSnap.data() as UserData);

      const q = query(collection(db, "posts"), where("userId", "==", user.uid));
      const querySnapshot = await getDocs(q);
      const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Post));
      data.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      setUserPosts(data);
    } catch (e) { console.log(e); } 
    finally { setLoading(false); setRefreshing(false); }
  }, [user]);

  useEffect(() => { fetchProfileData(); }, [fetchProfileData]);

  const handleDeletePost = async () => {
      if(!selectedPost) return;
      Alert.alert("Sil", "Emin misin?", [
          { text: "Hayır", style: "cancel" },
          { text: "Evet", style: 'destructive', onPress: async () => {
              await deleteDoc(doc(db, "posts", selectedPost.id));
              setUserPosts(prev => prev.filter(p => p.id !== selectedPost.id));
              setSelectedPost(null);
          }}
      ]);
  };

  const handleLogout = () => {
    Alert.alert("Çıkış", "Emin misin?", [
        { text: "İptal", style: "cancel" },
        { text: "Çıkış Yap", style: 'destructive', onPress: async () => { await signOut(auth); router.replace('/login'); } }
    ]);
  };

  const renderGridItem = (post: Post) => (
      <TouchableOpacity key={post.id} style={styles.gridItem} onPress={() => setSelectedPost(post)}>
         {post.mediaType === 'video' ? (
             <View style={styles.gridImage}>
                 <Video source={{ uri: post.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode={ResizeMode.COVER} />
                 <View style={styles.videoIconOverlay}><Ionicons name="play" size={20} color="white" /></View>
             </View>
         ) : (
             <Image source={{ uri: post.imageUrl }} style={styles.gridImage} />
         )}
      </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <View style={styles.avatarContainer}>
            {userData?.avatar_url ? <Image source={{ uri: userData.avatar_url }} style={styles.avatarImage} /> : 
             <Text style={styles.avatarText}>{userData?.username?.[0]?.toUpperCase() || 'U'}</Text>}
        </View>
        <Text style={styles.username}>@{userData?.username || "isimsiz"}</Text>
        <Text style={styles.stats}>{userPosts.length} Gönderi</Text>
        <View style={styles.actionButtons}>
          <TouchableOpacity style={styles.editButton} onPress={() => setEditModalVisible(true)}><Text style={styles.editText}>Profili Düzenle ✏️</Text></TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}><Ionicons name="log-out-outline" size={20} color="#FF4444" /></TouchableOpacity>
        </View>
      </View>
      <View style={styles.dividerLine} />
      
      {/* GRID */}
      {loading ? <ActivityIndicator color="#C12626" style={{marginTop: 50}} /> : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchProfileData(); }} tintColor="#fff" />}>
          {userPosts.length === 0 ? <Text style={styles.emptyText}>Henüz hiç gönderin yok. 📸</Text> : 
           <View style={styles.gridContainer}>{userPosts.map(renderGridItem)}</View>}
        </ScrollView>
      )}

      {/* MODALS */}
      {userData && (
          <EditProfileModal 
            visible={editModalVisible} 
            onClose={() => setEditModalVisible(false)} 
            userData={userData} 
            onUpdate={fetchProfileData} 
          />
      )}

      {selectedPost && (
          <PostDetailModal 
            post={selectedPost} 
            visible={!!selectedPost} 
            onClose={() => setSelectedPost(null)} 
            currentUser={user}
            onDeletePost={handleDeletePost}
            onPostUpdate={(updatedPost) => {
                // Modal içinde yapılan like/comment değişikliklerini anlık olarak grid verisine yansıt
                setUserPosts(prev => prev.map(p => p.id === updatedPost.id ? updatedPost : p));
            }}
          />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505', paddingTop: 50, paddingHorizontal: 15 },
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
  dividerLine: { height: 1, backgroundColor: '#222', width: '100%', marginBottom: 2 },
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '33%', aspectRatio: 1, padding: 1 },
  gridImage: { width: '100%', height: '100%', backgroundColor: '#111' },
  videoIconOverlay: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 2 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 50 },
  // Modal Styles (Önceki ile benzer)
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center' },
  editModalContent: { width: '85%', backgroundColor: '#181818', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#333' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },
  avatarEditWrapper: { alignSelf: 'center', marginBottom: 20 },
  avatarEditImage: { width: 100, height: 100, borderRadius: 50, backgroundColor: '#333' },
  cameraIconBadge: { position: 'absolute', bottom: 0, right: 0, backgroundColor: '#C12626', padding: 8, borderRadius: 20 },
  label: { color: '#888', marginBottom: 5, marginLeft: 5 },
  inputModal: { backgroundColor: '#111', color: '#fff', padding: 15, borderRadius: 10, marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  cancelBtn: { padding: 15 },
  saveBtn: { backgroundColor: '#C12626', paddingVertical: 12, paddingHorizontal: 30, borderRadius: 10 },
  modalOverlayPost: { flex: 1, backgroundColor: '#000' }, 
  modalContentPost: { flex: 1 }, 
  fullImage: { flex: 1, width: '100%', backgroundColor:'#000', justifyContent: 'center' }, 
  imageWithComments: { flex: 0.5, width: '100%', backgroundColor:'#000', justifyContent: 'center' }, 
  closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 99, padding: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  modalFooter: { width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, paddingBottom: 40 },
  footerWithComments: { flex: 0.5, backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20 },
  usernameText: { color: '#000', fontSize: 18, fontWeight: 'bold' }, 
  caption: { color: '#333', fontSize: 15, marginTop: 5 },
  actionBtn: { flexDirection:'row', alignItems:'center', gap:5 },
  countText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
  commentsSection: { flex: 1, marginTop: 10 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  commentsList: { flex: 1 },
  commentItem: { marginBottom: 15, paddingBottom: 10, borderBottomWidth:1, borderBottomColor:'#eee' },
  commentUser: { fontWeight: 'bold', fontSize: 14, color: '#000' },
  commentText: { fontSize: 14, color: '#333', fontWeight:'normal' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 30, paddingHorizontal: 15, paddingVertical: 8, marginTop: 10 },
  input: { flex: 1, color: '#000', marginRight: 10, height: 40 }
});