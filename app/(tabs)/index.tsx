import { Ionicons } from '@expo/vector-icons';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { Link, useRouter } from 'expo-router';
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
  updateDoc,
  where
} from 'firebase/firestore';
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
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { auth, db } from '../../firebaseConfig';

const { width } = Dimensions.get('window');

// --- TİP TANIMLAMALARI (TYPES) ---
interface User {
  id: string;
  username: string;
  avatar_url?: string;
  following?: string[];
  followers?: string[];
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

interface Comment {
  id: string;
  text: string;
  userId: string;
  username: string;
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

const saveNotification = async (rid: string, type: 'follow' | 'like' | 'comment', msg: string, img: string | null = null, currentUser: any) => {
    if(!currentUser || rid === currentUser.uid) return;
    await addDoc(collection(db, "notifications"), {
        recipientId: rid, senderId: currentUser.uid, senderName: currentUser.email?.split('@')[0],
        type, message: msg, postImage: img, isRead: false, createdAt: serverTimestamp()
    });
};

// --- ALT COMPONENT: POST DETAIL MODAL ---
// Bu component tüm yorum, like ve video oynatma mantığını kendi içinde tutar.
const PostDetailModal = ({ post, visible, onClose, currentUser, onOpenProfile, onDeletePost }: any) => {
    const [currentPost, setCurrentPost] = useState<Post>(post);
    const [comments, setComments] = useState<Comment[]>([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [showComments, setShowComments] = useState(false);
    const [footerVisible, setFooterVisible] = useState(true);
    const [newComment, setNewComment] = useState('');
    const [sendingComment, setSendingComment] = useState(false);
    const [videoStatus, setVideoStatus] = useState<AVPlaybackStatus | null>(null);
    const [postAuthor, setPostAuthor] = useState<User | null>(null);
    
    const videoRef = useRef<Video>(null);
    const isLiked = currentPost?.likedBy?.includes(currentUser?.uid);

    // Modal açıldığında post verisini güncelle
    useEffect(() => { setCurrentPost(post); }, [post]);

    // Yazar bilgisini çek
    useEffect(() => {
        if (currentPost?.userId) {
            getDoc(doc(db, "users", currentPost.userId)).then(snap => {
                if(snap.exists()) setPostAuthor(snap.data() as User);
            });
        }
    }, [currentPost?.userId]);

    // Yorumları dinle
    useEffect(() => {
        if (showComments && currentPost?.id) {
            setLoadingComments(true);
            const q = query(collection(db, "posts", currentPost.id, "comments"), orderBy("createdAt", "asc"));
            const unsub = onSnapshot(q, (snapshot) => {
                setComments(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Comment)));
                setLoadingComments(false);
            });
            return () => unsub();
        }
    }, [showComments, currentPost?.id]);

    const handlePlayPause = async () => {
        if (!videoRef.current || !videoStatus?.isLoaded) return;
        videoStatus.isPlaying ? await videoRef.current.pauseAsync() : await videoRef.current.playAsync();
    };

    const handleSendComment = async () => {
        if (!newComment.trim() || !currentUser) return;
        setSendingComment(true);
        try {
            const username = (await getDoc(doc(db, "users", currentUser.uid))).data()?.username || "Anonim";
            await addDoc(collection(db, "posts", currentPost.id, "comments"), {
                text: newComment, userId: currentUser.uid, username, createdAt: serverTimestamp()
            });
            await updateDoc(doc(db, "posts", currentPost.id), { commentCount: increment(1) });
            
            // UI'ı optimistic update ile güncellemeye gerek yok, snapshot dinliyor zaten ama sayıyı güncelleyelim
            setCurrentPost(prev => ({ ...prev, commentCount: (prev.commentCount || 0) + 1 }));
            await saveNotification(currentPost.userId, 'comment', `yorum yaptı: "${newComment}"`, currentPost.imageUrl, currentUser);
            setNewComment(''); Keyboard.dismiss();
        } catch(e) { Alert.alert("Hata", "Yorum gönderilemedi."); }
        finally { setSendingComment(false); }
    };

    const handleLike = async () => {
        if(!currentUser) return;
        const postRef = doc(db, "posts", currentPost.id);
        const newLikes = isLiked ? currentPost.likes - 1 : currentPost.likes + 1;
        const newLikedBy = isLiked ? arrayRemove(currentUser.uid) : arrayUnion(currentUser.uid);
        
        // Optimistic UI Update
        setCurrentPost(prev => ({
            ...prev, likes: Math.max(0, newLikes), 
            likedBy: isLiked ? prev.likedBy.filter(id => id !== currentUser.uid) : [...prev.likedBy, currentUser.uid]
        }));

        try {
            await updateDoc(postRef, { likes: isLiked ? increment(-1) : increment(1), likedBy: newLikedBy });
            if(!isLiked) await saveNotification(currentPost.userId, 'like', "gönderini beğendi.", currentPost.imageUrl, currentUser);
        } catch(e) { console.error(e); }
    };

    if (!currentPost) return null;

    return (
        <Modal visible={visible} transparent={true} animationType="fade" onRequestClose={onClose}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayPost}>
                <View style={styles.modalContentPost}>
                    <TouchableOpacity style={styles.closeButton} onPress={onClose}>
                        <Ionicons name="chevron-down" size={30} color="#fff" />
                    </TouchableOpacity>

                    <TouchableWithoutFeedback onPress={() => { setFooterVisible(!footerVisible); Keyboard.dismiss(); }}>
                        <View style={showComments ? styles.imageWithComments : styles.fullImage}>
                            {currentPost.mediaType === 'video' ? (
                                <>
                                    <Video
                                        ref={videoRef}
                                        source={{ uri: currentPost.imageUrl }}
                                        style={{ width: '100%', height: '100%' }}
                                        resizeMode={ResizeMode.CONTAIN}
                                        isLooping
                                        shouldPlay={visible} // Sadece modal açıksa oyna
                                        onPlaybackStatusUpdate={status => setVideoStatus(status)}
                                    />
                                    {footerVisible && (
                                        <View style={styles.videoControlsOverlay}>
                                           <TouchableOpacity onPress={(e) => {e.stopPropagation(); handlePlayPause()}}>
                                             <Ionicons name={videoStatus?.isLoaded && videoStatus.isPlaying ? "pause-circle" : "play-circle"} size={60} color="rgba(255,255,255,0.7)" />
                                           </TouchableOpacity>
                                        </View>
                                    )}
                                </>
                            ) : (
                                <Image source={{ uri: currentPost.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
                            )}
                        </View>
                    </TouchableWithoutFeedback>

                    {footerVisible && (
                        <View style={showComments ? styles.footerWithComments : styles.modalFooter}>
                            {/* Header Info */}
                            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10}}>
                                <TouchableOpacity onPress={() => { onClose(); onOpenProfile(currentPost.userId); }} style={{flexDirection:'row', alignItems:'center'}}>
                                     <Image source={{uri: postAuthor?.avatar_url || 'https://via.placeholder.com/40'}} style={{width:36, height:36, borderRadius:18, marginRight:10, backgroundColor:'#333'}} />
                                     <View>
                                         <Text style={styles.usernameText}>@{currentPost.username}</Text>
                                         <Text style={{color:'#666', fontSize:10}}>{getTimeAgo(currentPost.createdAt)}</Text>
                                     </View>
                                </TouchableOpacity>
                                
                                <View style={{flexDirection:'row', gap:15}}>
                                    {currentUser?.uid === currentPost.userId && (
                                        <TouchableOpacity onPress={() => onDeletePost(currentPost)}><Ionicons name="trash-outline" size={24} color="#FF3B30" /></TouchableOpacity>
                                    )}
                                    <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
                                        <Ionicons name={isLiked ? "heart" : "heart-outline"} size={26} color={isLiked ? "#FF3B30" : "#000"} />
                                        <Text style={styles.countText}>{currentPost.likes}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(!showComments)}>
                                        <Ionicons name={showComments ? "chatbubble" : "chatbubble-outline"} size={26} color="#000" />
                                        <Text style={styles.countText}>{currentPost.commentCount}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>

                            {/* Caption */}
                            {!showComments && currentPost.caption && (
                                <Text style={styles.caption}>{currentPost.caption}</Text>
                            )}

                            {/* Comments Section */}
                            {showComments && (
                                <View style={styles.commentsSection}>
                                    <View style={styles.divider} />
                                    <ScrollView style={styles.commentsList}>
                                        {loadingComments ? <ActivityIndicator color="#FF3B30" /> : comments.map(c => (
                                            <View key={c.id} style={styles.commentItem}>
                                                <Text style={styles.commentUser}>@{c.username} <Text style={styles.commentText}>{c.text}</Text></Text>
                                            </View>
                                        ))}
                                    </ScrollView>
                                    <View style={styles.inputContainer}>
                                        <TextInput style={styles.input} placeholder="Yorum yaz..." value={newComment} onChangeText={setNewComment} placeholderTextColor="#888" />
                                        <TouchableOpacity onPress={handleSendComment} disabled={sendingComment}>
                                            {sendingComment ? <ActivityIndicator /> : <Ionicons name="send" size={24} color="#FF3B30" />}
                                        </TouchableOpacity>
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

// --- MAIN COMPONENT: HOME SCREEN ---
export default function HomeScreen() {
  const router = useRouter();
  const currentUser = auth.currentUser;
  
  // Data States
  const [posts, setPosts] = useState<Post[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<Post[]>([]); 
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);

  // Modal States
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [viewUser, setViewUser] = useState<User | null>(null);
  
  // --- DATA FETCHING ---
  const fetchData = useCallback(async () => {
    try {
      const q = query(collection(db, "posts"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as Post));
      setPosts(data);
      setTrendingPosts(data.filter(p => p.likes >= 5).slice(0, 5));
    } catch (e) { console.error(e); } 
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if(!currentUser) return;
    getDoc(doc(db, "users", currentUser.uid)).then(d => d.exists() && setMyAvatar(d.data().avatar_url));
    
    const unsub = onSnapshot(query(collection(db, "notifications"), where("recipientId", "==", currentUser.uid), where("isRead", "==", false)), 
        (snap) => setHasUnreadNotifs(!snap.empty));
    return () => unsub();
  }, [currentUser]);

  const handleDeletePost = async (post: Post) => {
      Alert.alert("Sil", "Emin misin?", [
          { text: "İptal", style: "cancel" },
          { text: "Sil", style: "destructive", onPress: async () => {
              await deleteDoc(doc(db, "posts", post.id));
              setSelectedPost(null);
              fetchData(); // Listeyi yenile
          }}
      ]);
  };

  // --- RENDER HELPERS ---
  const renderCard = (post: Post, height: number) => (
      <TouchableOpacity key={post.id} style={styles.card} onPress={() => setSelectedPost(post)} activeOpacity={0.9}>
         {post.mediaType === 'video' ? (
             <View style={{height}}>
                 <Video source={{ uri: post.imageUrl }} style={{width:'100%', height:'100%'}} resizeMode={ResizeMode.COVER} />
                 <View style={styles.playIconOverlay}><Ionicons name="play" size={20} color="#fff" /></View>
             </View>
         ) : (
             <Image source={{ uri: post.imageUrl }} style={{width:'100%', height}} />
         )}
         <View style={styles.cardOverlay}>
             <Text style={styles.cardUser}>@{post.username}</Text>
             <Text style={{color:'#ddd', fontSize:9}}>{getTimeAgo(post.createdAt)}</Text>
         </View>
      </TouchableOpacity>
  );

  const leftColumn = posts.filter((_, i) => i % 2 === 0);
  const rightColumn = posts.filter((_, i) => i % 2 !== 0);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* HEADER */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>soce<Text style={{color: '#FF3B30'}}>.</Text></Text>
        <View style={{flexDirection:'row', alignItems:'center', gap: 15}}>
           <Link href="/notifications" asChild><TouchableOpacity><Ionicons name="notifications-outline" size={26} color="#fff" />{hasUnreadNotifs && <View style={styles.redDot} />}</TouchableOpacity></Link>
           <Link href="/inbox" asChild><TouchableOpacity><Ionicons name="chatbubble-ellipses-outline" size={26} color="#fff" /></TouchableOpacity></Link>
           <Link href="/profile" asChild>
              <TouchableOpacity style={styles.profileIcon}>
                 {myAvatar ? <Image source={{ uri: myAvatar }} style={{width:'100%', height:'100%'}} /> : <Text style={styles.profileInitial}>{currentUser?.email?.[0].toUpperCase()}</Text>}
              </TouchableOpacity>
           </Link>
        </View>
      </View>

      {/* FEED */}
      {loading ? <View style={styles.center}><ActivityIndicator color="#FF3B30" size="large"/></View> : (
        <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => {setRefreshing(true); fetchData()}} tintColor="#FF3B30" />}>
            {/* TRENDING */}
            {trendingPosts.length > 0 && (
                <View style={styles.trendingSection}>
                    <Text style={styles.sectionTitle}>🔥 Vitrin</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{paddingLeft:20}}>
                        {trendingPosts.map(p => (
                            <TouchableOpacity key={p.id} style={styles.trendingCard} onPress={() => setSelectedPost(p)}>
                                <Image source={{uri: p.imageUrl}} style={{width:120, height:160}} />
                                <View style={styles.trendingOverlay}><Ionicons name="heart" size={10} color="#fff" /><Text style={{color:'#fff', fontSize:10, marginLeft:3}}>{p.likes}</Text></View>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            )}

            {/* MASONRY LAYOUT */}
            <Text style={styles.sectionTitle}>Akış</Text>
            <View style={styles.feedRow}>
                <View style={styles.column}>{leftColumn.map(p => renderCard(p, 220))}</View>
                <View style={styles.column}>{rightColumn.map(p => renderCard(p, 280))}</View>
            </View>
            <View style={{height: 100}} />
        </ScrollView>
      )}

      {/* POST DETAIL MODAL */}
      {selectedPost && (
        <PostDetailModal 
            post={selectedPost} 
            visible={!!selectedPost} 
            onClose={() => setSelectedPost(null)} 
            currentUser={currentUser}
            onDeletePost={handleDeletePost}
            onOpenProfile={(uid: string) => { 
                setSelectedPost(null); 
                // Burada User Profile mantığı tetiklenebilir veya direkt setViewUser ile id set edilebilir.
                // Basitlik adına burada sadece logluyorum, normalde UserProfileModal'ı açarsınız.
                console.log("Open user:", uid); 
            }}
        />
      )}
      
      {/* Kullanıcı Profili Modalı'nı da aynı PostDetailModal mantığıyla ayırmanızı öneririm. */}

    </View>
  );
}

// --- STYLES (Özetlendi, aynı kalabilir) ---
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505', paddingTop: 50 },
  header: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 10 },
  headerTitle: { fontSize: 32, fontWeight: '900', color: '#fff' },
  redDot: { position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: '#FF3B30' },
  profileIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', overflow:'hidden', borderWidth:1, borderColor:'#333' },
  profileInitial: { color: '#fff', fontWeight: 'bold' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 22, fontWeight: 'bold', color: '#fff', marginLeft: 20, marginBottom: 15 },
  trendingSection: { marginBottom: 20 },
  trendingCard: { marginRight: 10, borderRadius: 12, overflow: 'hidden' },
  trendingOverlay: { position: 'absolute', bottom: 5, left: 5, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 6 },
  feedRow: { flexDirection: 'row', paddingHorizontal: 10, justifyContent: 'space-between' },
  column: { width: '48%', gap: 15 },
  card: { backgroundColor: '#1A1A1A', borderRadius: 16, overflow: 'hidden' },
  cardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: 'rgba(0,0,0,0.5)' },
  cardUser: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  playIconOverlay: { position: 'absolute', top: '40%', left: '40%', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 5 },
  // Modal Styles
  modalOverlayPost: { flex: 1, backgroundColor: '#000' }, 
  modalContentPost: { flex: 1 }, 
  fullImage: { flex: 1, width: '100%', justifyContent: 'center' }, 
  imageWithComments: { flex: 0.5, width: '100%', justifyContent: 'center' }, 
  closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 99, padding: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  modalFooter: { width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, paddingBottom: 40 },
  footerWithComments: { flex: 0.5, backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20 },
  videoControlsOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'center', alignItems: 'center' },
  usernameText: { color: '#000', fontSize: 16, fontWeight: 'bold' },
  caption: { color: '#333', marginTop: 5 },
  actionBtn: { flexDirection:'row', alignItems:'center', gap:5 },
  countText: { fontWeight:'bold', fontSize:14 },
  commentsSection: { flex: 1, marginTop: 10 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  commentsList: { flex: 1 },
  commentItem: { marginBottom: 10 },
  commentUser: { fontWeight: 'bold', fontSize: 13 },
  commentText: { fontWeight: 'normal' },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 25, paddingHorizontal: 15, paddingVertical: 10, marginTop: 10 },
  input: { flex: 1, marginRight: 10, color: '#000' }
});