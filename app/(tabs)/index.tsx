import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import { Link, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Keyboard, KeyboardAvoidingView, Modal, Platform, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, getDocs, increment, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';

export default function HomeScreen() {
  const router = useRouter();
  
  const [stories, setStories] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [trendingPosts, setTrendingPosts] = useState<any[]>([]); // Vitrindekiler

  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [showComments, setShowComments] = useState(false); 
  const [comments, setComments] = useState<any[]>([]); 
  const [newComment, setNewComment] = useState(''); 
  const [sendingComment, setSendingComment] = useState(false);
  const [hasUnreadNotifs, setHasUnreadNotifs] = useState(false);
  const [myAvatar, setMyAvatar] = useState<string | null>(null);

  // Başkasının profilini görüntülemek için
  const [viewUserProfile, setViewUserProfile] = useState<any>(null);
  const [userProfilePosts, setUserProfilePosts] = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);

  const currentUser = auth.currentUser;
  const userInitial = currentUser?.email ? currentUser.email[0].toUpperCase() : "U";

  useEffect(() => {
    if (currentUser) {
      const fetchMyProfile = async () => {
        const docRef = doc(db, "users", currentUser.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) { setMyAvatar(docSnap.data().avatar_url); }
      };
      fetchMyProfile();
    }
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    const notifRef = collection(db, "notifications");
    const q = query(notifRef, where("recipientId", "==", currentUser.uid), where("isRead", "==", false));
    const unsubscribe = onSnapshot(q, (snapshot) => { setHasUnreadNotifs(!snapshot.empty); });
    return () => unsubscribe();
  }, []);

  // --- ZAMAN HESAPLAYICILAR ---
  const getTimeAgo = (timestamp: any) => {
    if (!timestamp) return "Az önce";
    const date = timestamp.toDate();
    const now = new Date();
    const diff = (now.getTime() - date.getTime()) / 1000; // Saniye farkı

    if (diff < 60) return "Az önce";
    if (diff < 3600) return Math.floor(diff / 60) + "dk";
    if (diff < 86400) return Math.floor(diff / 3600) + "s";
    return Math.floor(diff / 86400) + "g";
  };

  const getStoryCountdown = (expiresAt: any) => {
    if (!expiresAt) return "";
    const expireDate = expiresAt.toDate();
    const now = new Date();
    const diff = (expireDate.getTime() - now.getTime()) / 1000;

    if (diff <= 0) return "Süresi Doldu";
    const hours = Math.floor(diff / 3600);
    const minutes = Math.floor((diff % 3600) / 60);
    return `${hours}s ${minutes}dk kaldı`;
  };

  // --- VERİ ÇEKME ---
  const fetchData = async () => {
    try {
      const postsRef = collection(db, "posts");
      const qPosts = query(postsRef, orderBy("createdAt", "desc"));
      const querySnapshot = await getDocs(qPosts);
      const postsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPosts(postsData);

      // VİTRİNDEKİLER (5 Beğeni Üzeri)
      const trending = postsData.filter((p: any) => p.likes >= 5).slice(0, 5);
      setTrendingPosts(trending);

      const storiesRef = collection(db, "stories");
      const qStories = query(storiesRef, orderBy("createdAt", "desc"));
      const storySnapshot = await getDocs(qStories);
      const now = new Date();
      const validStories = storySnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((story: any) => {
          const expiresAt = story.expiresAt?.toDate(); 
          return expiresAt > now; 
        });
      setStories(validStories);

    } catch (error) { console.log("Hata:", error); } 
    finally { setLoading(false); setRefreshing(false); }
  };

  useEffect(() => { fetchData(); }, []);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  // --- PROFİL AÇMA ---
  const openUserProfile = async (userId: string) => {
    if(userId === currentUser?.uid) {
        router.push('/profile'); // Kendi profilimse oraya git
        return;
    }
    // Başkasının profili
    const userDoc = await getDoc(doc(db, "users", userId));
    if (userDoc.exists()) {
        setViewUserProfile({ id: userDoc.id, ...userDoc.data() });
        
        // Takip durumu
        const myDoc = await getDoc(doc(db, "users", currentUser?.uid!));
        setIsFollowing(myDoc.data()?.following?.includes(userId));

        // Postları
        const q = query(collection(db, "posts"), where("userId", "==", userId));
        const snap = await getDocs(q);
        const userPosts = snap.docs.map(d => ({id: d.id, ...d.data()}));
        setUserProfilePosts(userPosts);
    }
  };

  // ... (Notification ve Push fonksiyonları aynı, yer kaplamasın diye kısaltıyorum) ...
  const saveNotification = async (rid: string, type: string, msg: string, img: string | null = null) => {
      if(rid === currentUser?.uid) return;
      await addDoc(collection(db, "notifications"), {
          recipientId: rid, senderId: currentUser?.uid, senderName: currentUser?.email?.split('@')[0],
          type, message: msg, postImage: img, isRead: false, createdAt: serverTimestamp()
      });
  };

  // YORUM İŞLEMİ (GÜNCELLENDİ: commentCount Eklendi)
  const handleSendComment = async () => {
    if (newComment.trim() === '') return;
    setSendingComment(true);
    try {
      if (!currentUser) return;
      const commentsRef = collection(db, "posts", selectedPost.id, "comments");
      const username = currentUser.email?.split('@')[0] || "Anonim";
      await addDoc(commentsRef, { text: newComment, userId: currentUser.uid, username: username, createdAt: serverTimestamp() });
      
      // Post belgesindeki yorum sayısını artır
      const postRef = doc(db, "posts", selectedPost.id);
      await updateDoc(postRef, { commentCount: increment(1) });
      
      // Yerel state'i güncelle (ekranda anında artsın)
      setSelectedPost((prev: { commentCount: any; }) => ({...prev, commentCount: (prev.commentCount || 0) + 1}));

      await saveNotification(selectedPost.userId, 'comment', `yorum yaptı: "${newComment}"`, selectedPost.imageUrl);
      setNewComment(''); Keyboard.dismiss(); 
    } catch (error) { } finally { setSendingComment(false); }
  };

  // LİKE İŞLEMİ
  const handleLike = async () => {
    if (!selectedPost || !currentUser) return;
    const postRef = doc(db, "posts", selectedPost.id);
    const likedBy = selectedPost.likedBy || [];
    const isLiked = likedBy.includes(currentUser.uid);
    let updatedPost;
    if (isLiked) {
      updatedPost = { ...selectedPost, likes: Math.max(0, (selectedPost.likes || 1) - 1), likedBy: likedBy.filter((id: string) => id !== currentUser.uid) };
      try { await updateDoc(postRef, { likes: increment(-1), likedBy: arrayRemove(currentUser.uid) }); } catch (e) { }
    } else {
      updatedPost = { ...selectedPost, likes: (selectedPost.likes || 0) + 1, likedBy: [...likedBy, currentUser.uid] };
      try { 
        await updateDoc(postRef, { likes: increment(1), likedBy: arrayUnion(currentUser.uid) });
        await saveNotification(selectedPost.userId, 'like', "gönderini beğendi.", selectedPost.imageUrl);
      } catch (e) { }
    }
    setSelectedPost(updatedPost);
  };

  // ... (Delete fonksiyonu aynı) ...
  const handleDelete = async (post: any) => { /* ... */ };

  const renderMediaPreview = (post: any, style: any) => {
    if (post.mediaType === 'video') {
       return <View style={style}><Video source={{ uri: post.imageUrl }} style={{width:'100%', height:'100%'}} resizeMode={ResizeMode.COVER} /><View style={styles.playIconOverlay}><Ionicons name="play-circle" size={30} color="rgba(255,255,255,0.8)" /></View></View>;
    }
    return <Image source={{ uri: post.imageUrl }} style={style} />;
  };

  const leftColumn = posts.filter((_, i) => i % 2 === 0);
  const rightColumn = posts.filter((_, i) => i % 2 !== 0);
  const isPostLikedByMe = selectedPost?.likedBy?.includes(currentUser?.uid);

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      {/* HEADER: SAĞ ÜSTTE PROFİL */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>soce<Text style={{color: '#FF3B30'}}>.</Text></Text>
        <View style={{flexDirection:'row', alignItems:'center', gap: 15}}>
           <Link href="/notifications" asChild>
              <TouchableOpacity>
                 <Ionicons name="notifications-outline" size={26} color="#fff" />
                 {hasUnreadNotifs && <View style={styles.redDot} />}
              </TouchableOpacity>
           </Link>
           <Link href="/inbox" asChild>
              <TouchableOpacity><Ionicons name="chatbubble-ellipses-outline" size={26} color="#fff" /></TouchableOpacity>
           </Link>
           <Link href="/profile" asChild>
              <TouchableOpacity>
                <View style={styles.profileIcon}>
                   {myAvatar ? (<Image source={{ uri: myAvatar }} style={{ width: '100%', height: '100%', borderRadius: 20 }} />) : (<Text style={styles.profileInitial}>{userInitial}</Text>)}
                </View>
              </TouchableOpacity>
           </Link>
        </View>
      </View>

      {loading ? (<View style={styles.center}><ActivityIndicator size="large" color="#FF3B30" /></View>) : (
        <ScrollView showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#FF3B30" />}>
          
          {/* HİKAYELER (SAYAÇLI) */}
          <View style={{height: 130, marginTop: 10}}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.storiesContainer}>
              {stories.map((story) => (
                <TouchableOpacity key={story.id} style={styles.storyItem} onPress={() => setSelectedPost(story)}>
                  <View style={[styles.storyCircle, styles.activeStory]}>
                    {story.mediaType === 'video' ? (<View style={styles.storyImage}><Video source={{ uri: story.imageUrl }} style={{width:'100%', height:'100%'}} resizeMode={ResizeMode.COVER} /></View>) : (<Image source={{ uri: story.imageUrl }} style={styles.storyImage} />)}
                  </View>
                  <Text style={styles.storyText} numberOfLines={1}>{story.username || "Anonim"}</Text>
                  {/* SAYAÇ GÖSTERGESİ (Sadece listede minik) */}
                  <Text style={{color:'#666', fontSize:8}}>24s</Text> 
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* VİTRİNDEKİLER (YENİ ÖZELLİK) */}
          {trendingPosts.length > 0 && (
             <View style={styles.trendingSection}>
                <Text style={styles.sectionTitle}>🔥 Vitrin</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{paddingLeft: 20}}>
                   {trendingPosts.map((post) => (
                      <TouchableOpacity key={post.id} style={styles.trendingCard} onPress={() => setSelectedPost(post)}>
                         {renderMediaPreview(post, {width: 120, height: 160, borderRadius: 15})}
                         <View style={styles.trendingOverlay}><Ionicons name="heart" size={12} color="#fff" /><Text style={{color:'#fff', fontSize:10, marginLeft:3}}>{post.likes}</Text></View>
                      </TouchableOpacity>
                   ))}
                </ScrollView>
             </View>
          )}

          {/* DUVAR */}
          <Text style={styles.sectionTitle}>Akış</Text>
          <View style={styles.feedRow}>
            <View style={styles.column}>
                {leftColumn.map((post) => (
                  <TouchableOpacity key={post.id} style={styles.card} onPress={() => { setSelectedPost(post); setShowComments(false); }} activeOpacity={0.9}>
                    {renderMediaPreview(post, [styles.postImage, {height: 220}])}
                    <View style={styles.cardOverlay}>
                        <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
                           <Text style={styles.cardUser}>@{post.username}</Text>
                           <Text style={{color:'#ddd', fontSize:9}}>{getTimeAgo(post.createdAt)}</Text>
                        </View>
                    </View>
                  </TouchableOpacity>
                ))}
            </View>
            <View style={styles.column}>
                {rightColumn.map((post) => (
                  <TouchableOpacity key={post.id} style={styles.card} onPress={() => { setSelectedPost(post); setShowComments(false); }} activeOpacity={0.9}>
                    {renderMediaPreview(post, [styles.postImage, {height: 280}])}
                    <View style={styles.cardOverlay}>
                        <View style={{flexDirection:'row', alignItems:'center', justifyContent:'space-between'}}>
                           <Text style={styles.cardUser}>@{post.username}</Text>
                           <Text style={{color:'#ddd', fontSize:9}}>{getTimeAgo(post.createdAt)}</Text>
                        </View>
                    </View>
                  </TouchableOpacity>
                ))}
            </View>
          </View>
          <View style={{height: 120}} /> 
        </ScrollView>
      )}

      {/* POST DETAY MODALI */}
      <Modal visible={selectedPost !== null} transparent={true} animationType="slide" onRequestClose={() => setSelectedPost(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayPost}>
          <View style={styles.modalContentPost}>
            <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedPost(null)}><Ionicons name="close" size={24} color="#000" /></TouchableOpacity>
            {selectedPost && (
              <>
                <View style={showComments ? styles.imageWithComments : styles.fullImage}>
                   {selectedPost.mediaType === 'video' ? (
                      <Video source={{ uri: selectedPost.imageUrl }} style={{ width: '100%', height: '100%' }} useNativeControls resizeMode={ResizeMode.CONTAIN} isLooping shouldPlay={true} />
                   ) : ( <Image source={{ uri: selectedPost.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode={ResizeMode.CONTAIN} /> )}
                </View>
                
                <View style={showComments ? styles.footerWithComments : styles.modalFooter}>
                  {/* Üst Bilgi Satırı */}
                  <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10}}>
                    <TouchableOpacity onPress={() => { setSelectedPost(null); openUserProfile(selectedPost.userId); }}>
                        <Text style={styles.username}>@{selectedPost.username}</Text>
                        {/* Zaman / Hikaye Sayacı */}
                        <Text style={{color:'#666', fontSize:12}}>
                           {selectedPost.type === 'story' ? getStoryCountdown(selectedPost.expiresAt) : getTimeAgo(selectedPost.createdAt)}
                        </Text>
                    </TouchableOpacity>

                    <View style={{flexDirection:'row', gap: 15}}>
                       {/* YORUM SAYISI İLE BİRLİKTE */}
                       {selectedPost.type === 'wall' && (
                         <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(!showComments)}>
                            <Ionicons name={showComments ? "chatbubble" : "chatbubble-outline"} size={28} color="#000" />
                            <Text style={styles.countText}>{selectedPost.commentCount || 0}</Text>
                         </TouchableOpacity>
                       )}
                       {/* BEĞENİ SAYISI */}
                       <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
                          <Ionicons name={isPostLikedByMe ? "heart" : "heart-outline"} size={28} color="#FF3B30" />
                          <Text style={styles.countText}>{selectedPost.likes || 0}</Text>
                       </TouchableOpacity>
                    </View>
                  </View>

                  {!showComments && selectedPost.caption ? (<Text style={styles.caption}>{selectedPost.caption}</Text>) : null}
                  
                  {showComments && (
                    <View style={styles.commentsSection}>
                      <View style={styles.divider} />
                      <ScrollView style={styles.commentsList}>
                           {/* Yorumları burada gösterebilirsin (Eski koddan çekilecek) */}
                           <Text style={{textAlign:'center', color:'#666', marginTop:10}}>Yorumlar yükleniyor...</Text>
                      </ScrollView>
                      <View style={styles.inputContainer}>
                        <TextInput style={styles.input} placeholder="Yorum ekle..." placeholderTextColor="#999" value={newComment} onChangeText={setNewComment} />
                        <TouchableOpacity onPress={handleSendComment} disabled={sendingComment}>
                           {sendingComment ? <ActivityIndicator color="#FF3B30" /> : <Ionicons name="arrow-up-circle" size={32} color="#FF3B30" />}
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      
      {/* BAŞKASININ PROFİLİ MODALI (İHTİYAÇ OLURSA BURAYA EKLENECEK) */}
      {/* (Kod çok uzamasın diye burayı Search ekranındaki modal ile aynı mantıkta yapabilirsin) */}

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505', paddingTop: 50 }, 
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
  headerTitle: { fontSize: 32, fontWeight: '900', color: '#fff', letterSpacing: -1.5 },
  redDot: { position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: '#FF3B30', borderWidth: 1, borderColor: '#000' },
  profileIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333', overflow:'hidden' },
  profileInitial: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  
  storiesContainer: { paddingLeft: 15 },
  storyItem: { marginRight: 15, alignItems: 'center' },
  storyCircle: { width: 75, height: 75, borderRadius: 40, borderWidth: 2, borderColor: '#FF3B30', padding: 3 }, 
  storyImage: { width: '100%', height: '100%', borderRadius: 40, backgroundColor:'#222' },
  activeStory: { borderColor: '#FF3B30' },
  storyText: { fontSize: 11, color: '#aaa', marginTop: 5, width: 70, textAlign: 'center' },
  
  sectionTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', marginLeft: 20, marginBottom: 15, marginTop: 10 },
  
  // VİTRİN
  trendingSection: { marginBottom: 20 },
  trendingCard: { marginRight: 10, borderRadius: 15, overflow: 'hidden' },
  trendingOverlay: { position: 'absolute', bottom: 5, left: 5, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 4, borderRadius: 8 },

  feedRow: { flexDirection: 'row', paddingHorizontal: 10, justifyContent: 'space-between' },
  column: { width: '48%', gap: 15 },
  card: { backgroundColor: '#1A1A1A', borderRadius: 20, marginBottom: 0, overflow: 'hidden', position: 'relative' },
  postImage: { width: '100%', resizeMode: 'cover' },
  cardOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 10, backgroundColor: 'rgba(0,0,0,0.5)' },
  cardUser: { color: '#fff', fontWeight: 'bold', fontSize: 12, textShadowColor: 'rgba(0,0,0,0.7)', textShadowRadius: 3 },
  cardTime: { color: '#ccc', fontSize: 10 },
  cardMood: { color: '#ddd', fontSize: 10 },
  playIconOverlay: { position: 'absolute', top: '40%', left: '40%', backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20, padding: 5 },
  
  modalOverlayPost: { flex: 1, backgroundColor: '#000', justifyContent: 'flex-end' }, 
  modalContentPost: { width: '100%', height: '100%', justifyContent: 'center' },
  fullImage: { width: '100%', height: '100%', backgroundColor:'#000' }, 
  imageWithComments: { width: '100%', height: '40%', backgroundColor:'#000' }, 
  closeButton: { position: 'absolute', top: 50, left: 20, zIndex: 99, padding: 10, backgroundColor: '#fff', borderRadius: 25, elevation: 5 },
  
  modalFooter: { position: 'absolute', bottom: 30, left: 15, right: 15, padding: 20, backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 25 },
  footerWithComments: { flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 20, marginTop: -25 },
  username: { color: '#000', fontSize: 20, fontWeight: 'bold' }, 
  caption: { color: '#333', fontSize: 15, marginTop: 5, lineHeight: 22 },
  
  actionBtn: { flexDirection:'row', alignItems:'center', gap:5 },
  countText: { color: '#000', fontSize: 16, fontWeight: 'bold' },

  commentsSection: { flex: 1, marginTop: 10 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  commentsList: { flex: 1 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 30, paddingHorizontal: 15, paddingVertical: 8, marginTop: 10, marginBottom: 20 },
  input: { flex: 1, color: '#000', marginRight: 10, height: 40 }
});