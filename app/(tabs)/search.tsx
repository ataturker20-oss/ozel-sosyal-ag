import { Ionicons } from '@expo/vector-icons';
import { AVPlaybackStatus, ResizeMode, Video } from 'expo-av';
import { useRouter } from 'expo-router';
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
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';

import { auth, db } from '../../firebaseConfig';

const { width } = Dimensions.get('window');

export default function SearchScreen() {
  const router = useRouter();
  const currentUser = auth.currentUser;

  const [searchText, setSearchText] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  
  const [selectedUser, setSelectedUser] = useState<any>(null); 
  const [userPosts, setUserPosts] = useState<any[]>([]); 
  const [loadingPosts, setLoadingPosts] = useState(false);
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadingFollow, setLoadingFollow] = useState(false);

  const [selectedPost, setSelectedPost] = useState<any>(null);
  const [showComments, setShowComments] = useState(false); 
  const [footerVisible, setFooterVisible] = useState(true); 

  const [comments, setComments] = useState<any[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);
  const [newComment, setNewComment] = useState(''); 
  const [sendingComment, setSendingComment] = useState(false);

  const videoRef = useRef<Video>(null);
  const [videoStatus, setVideoStatus] = useState<AVPlaybackStatus | null>(null);

  useEffect(() => {
    if (selectedPost) {
        setFooterVisible(true);
        setShowComments(false);
        setVideoStatus(null);
        setComments([]); 
    }
  }, [selectedPost]);

  useEffect(() => {
    if (selectedPost && showComments) {
        setLoadingComments(true);
        const commentsRef = collection(db, "posts", selectedPost.id, "comments");
        const q = query(commentsRef, orderBy("createdAt", "asc")); 
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedComments = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setComments(fetchedComments);
            setLoadingComments(false);
        });

        return () => unsubscribe();
    }
  }, [selectedPost, showComments]);

  const saveNotification = async (recipientId: string, type: 'follow' | 'like' | 'comment', message: string, img: string | null = null) => {
    if (recipientId === currentUser?.uid) return;
    try {
      const username = currentUser?.email?.split('@')[0] || "Biri";
      await addDoc(collection(db, "notifications"), {
        recipientId: recipientId, senderId: currentUser?.uid, senderName: username,
        type: type, message: message, postImage: img, isRead: false, createdAt: serverTimestamp()
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

  const handlePlayPause = async () => {
    if (!videoRef.current || !videoStatus || !videoStatus.isLoaded) return;
    if (videoStatus.isPlaying) { await videoRef.current.pauseAsync(); } 
    else { await videoRef.current.playAsync(); }
  };

  const handleSeek = async (seconds: number) => {
    if (!videoRef.current || !videoStatus || !videoStatus.isLoaded) return;
    const current = videoStatus.positionMillis;
    const newPos = current + (seconds * 1000);
    await videoRef.current.setPositionAsync(newPos);
  };

  const handleProgressBarPress = async (e: any) => {
    if (!videoRef.current || !videoStatus || !videoStatus.isLoaded || !videoStatus.durationMillis) return;
    const { locationX } = e.nativeEvent;
    const percentage = locationX / width;
    const newPos = percentage * videoStatus.durationMillis;
    await videoRef.current.setPositionAsync(newPos);
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
    const userToChat = selectedUser;
    setSelectedUser(null);
    router.push({
      pathname: "/conversation",
      params: { targetUserId: userToChat.id, targetUsername: userToChat.username || "Kullanıcı" }
    });
  };

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
    setUserPosts(prev => prev.map(p => p.id === selectedPost.id ? updatedPost : p));
  };

  const handleSendComment = async () => {
    if (newComment.trim() === '') return;
    setSendingComment(true);
    try {
      if (!currentUser) return;
      const commentsRef = collection(db, "posts", selectedPost.id, "comments");
      const username = currentUser.email?.split('@')[0] || "Anonim";
      await addDoc(commentsRef, { text: newComment, userId: currentUser.uid, username: username, createdAt: serverTimestamp() });
      
      const postRef = doc(db, "posts", selectedPost.id);
      await updateDoc(postRef, { commentCount: increment(1) });
      
      const updatedPost = {...selectedPost, commentCount: (selectedPost.commentCount || 0) + 1};
      setSelectedPost(updatedPost);
      setUserPosts(prev => prev.map(p => p.id === selectedPost.id ? updatedPost : p));

      await saveNotification(selectedPost.userId, 'comment', `yorum yaptı: "${newComment}"`, selectedPost.imageUrl);
      setNewComment(''); Keyboard.dismiss(); 
    } catch (error) { } finally { setSendingComment(false); }
  };

  const handleDeleteComment = async (comment: any) => {
    if (comment.userId !== currentUser?.uid) return;
    Alert.alert("Yorumu Sil", "Yorumunu silmek istiyor musun?", [
      { text: "Vazgeç", style: "cancel" },
      { text: "Sil", style: 'destructive', onPress: async () => {
          try {
             await deleteDoc(doc(db, "posts", selectedPost.id, "comments", comment.id));
             
             const postRef = doc(db, "posts", selectedPost.id);
             await updateDoc(postRef, { commentCount: increment(-1) });
             
             const updatedPost = {...selectedPost, commentCount: Math.max(0, (selectedPost.commentCount || 1) - 1)};
             setSelectedPost(updatedPost);
             setUserPosts(prev => prev.map(p => p.id === selectedPost.id ? updatedPost : p));
          } catch (e) { Alert.alert("Hata", "Yorum silinemedi."); }
      }}
    ]);
  };

  const isPostLikedByMe = selectedPost?.likedBy?.includes(currentUser?.uid);

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
                    <TouchableOpacity style={[styles.profileActionBtn, isFollowing ? styles.unfollowBtn : styles.followBtn]} onPress={handleFollowToggle} disabled={loadingFollow}>
                        {loadingFollow ? <ActivityIndicator color="#fff" /> : <Text style={{color:'#fff', fontWeight:'bold'}}>{isFollowing ? "Takibi Bırak" : "Takip Et"}</Text>}
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.profileActionBtn, styles.messageBtn]} onPress={goToChat}>
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
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalOverlayPost}>
              <View style={styles.modalContentPost}>
                
                <TouchableOpacity style={styles.closeButton} onPress={() => setSelectedPost(null)}>
                    <Ionicons name="chevron-down" size={30} color="#fff" />
                </TouchableOpacity>

                {selectedPost && (
                  <View style={{flex: 1}}>
                    
                    <TouchableWithoutFeedback onPress={() => setFooterVisible(!footerVisible)}>
                        <View style={showComments ? styles.imageWithComments : styles.fullImage}>
                        {selectedPost.mediaType === 'video' ? (
                            <>
                              <Video 
                                ref={videoRef}
                                source={{ uri: selectedPost.imageUrl }} 
                                style={{ width: '100%', height: '100%' }} 
                                useNativeControls={false} 
                                resizeMode={ResizeMode.CONTAIN} 
                                isLooping 
                                shouldPlay={true} 
                                onPlaybackStatusUpdate={status => setVideoStatus(() => status)}
                              />
                              
                              {footerVisible && (
                                <View style={styles.videoControlsOverlay}>
                                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleSeek(-10); }} style={styles.controlBtn}>
                                      <Ionicons name="play-back" size={30} color="#fff" />
                                      <Text style={styles.controlText}>-10</Text>
                                  </TouchableOpacity>

                                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); handlePlayPause(); }} style={styles.playPauseBtn}>
                                      <Ionicons name={videoStatus?.isLoaded && videoStatus.isPlaying ? "pause" : "play"} size={40} color="#fff" />
                                  </TouchableOpacity>

                                  <TouchableOpacity onPress={(e) => { e.stopPropagation(); handleSeek(10); }} style={styles.controlBtn}>
                                      <Ionicons name="play-forward" size={30} color="#fff" />
                                      <Text style={styles.controlText}>+10</Text>
                                  </TouchableOpacity>
                                </View>
                              )}
                            </>
                        ) : ( 
                            <Image source={{ uri: selectedPost.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="contain" /> 
                        )}
                        </View>
                    </TouchableWithoutFeedback>
                    
                    {footerVisible && (
                        <View style={showComments ? styles.footerWithComments : styles.modalFooter}>
                        
                        {selectedPost.mediaType === 'video' && videoStatus?.isLoaded && (
                            <TouchableOpacity activeOpacity={1} onPress={handleProgressBarPress} style={styles.progressBarContainer}>
                                <View style={[styles.progressBarFill, { width: `${(videoStatus.positionMillis / (videoStatus.durationMillis || 1)) * 100}%` }]} />
                            </TouchableOpacity>
                        )}

                        <View style={{flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, marginTop: 10}}>
                            <View style={{flex: 1, marginRight: 10}}>
                                <Text numberOfLines={1} style={styles.usernameText}>@{selectedPost.username}</Text>
                                <View style={{flexDirection:'row', alignItems:'center', marginTop: 4, gap: 10}}>
                                    <Text style={{color:'#666', fontSize:12}}>
                                    {getTimeAgo(selectedPost.createdAt)}
                                    </Text>
                                    {selectedPost.location ? (
                                        <View style={styles.locationTag}>
                                            <Ionicons name="location" size={12} color="#FF3B30" />
                                            <Text numberOfLines={1} style={{color:'#333', fontSize:12, fontWeight:'600', marginLeft: 2, maxWidth: 80}}>{selectedPost.location}</Text>
                                        </View>
                                    ) : null}
                                </View>
                            </View>

                            <View style={{flexDirection:'row', gap: 15, alignItems:'center'}}>
                                <TouchableOpacity style={styles.actionBtn} onPress={() => setShowComments(!showComments)}>
                                    <Ionicons name={showComments ? "chatbubble" : "chatbubble-outline"} size={26} color="#000" />
                                    <Text style={styles.countText}>{selectedPost.commentCount || 0}</Text>
                                </TouchableOpacity>
                                
                                <TouchableOpacity style={styles.actionBtn} onPress={handleLike}>
                                    <Ionicons name={isPostLikedByMe ? "heart" : "heart-outline"} size={26} color="#FF3B30" />
                                    <Text style={styles.countText}>{selectedPost.likes || 0}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {!showComments && selectedPost.caption ? (
                            <View style={{maxHeight: 100, marginTop:5}}>
                                <ScrollView>
                                    <Text style={styles.caption}>{selectedPost.caption}</Text>
                                </ScrollView>
                            </View>
                        ) : null}
                        
                        {showComments && (
                            <View style={styles.commentsSection}>
                            <View style={styles.divider} />
                            <ScrollView style={styles.commentsList}>
                                {loadingComments ? (
                                    <ActivityIndicator size="small" color="#FF3B30" />
                                ) : comments.length > 0 ? (
                                    comments.map((comment) => (
                                        <View key={comment.id} style={styles.commentItem}>
                                            <View style={{flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start'}}>
                                                <View style={{flex:1}}>
                                                    <Text style={styles.commentUser}>@{comment.username}</Text>
                                                    <Text style={styles.commentText}>{comment.text}</Text>
                                                    <Text style={styles.commentTime}>{getTimeAgo(comment.createdAt)}</Text>
                                                </View>
                                                {comment.userId === currentUser?.uid && (
                                                    <TouchableOpacity onPress={() => handleDeleteComment(comment)} style={{padding:5}}>
                                                        <Ionicons name="trash-outline" size={16} color="#666" />
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                    ))
                                ) : (
                                    <Text style={{textAlign:'center', color:'#666', marginTop:10}}>İlk yorumu sen yap!</Text>
                                )}
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
                    )}
                  </View>
                )}
              </View>
            </KeyboardAvoidingView>
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
  profileActionBtn: { flexDirection:'row', paddingVertical:10, paddingHorizontal:20, borderRadius:20, minWidth: 120, justifyContent: 'center', alignItems:'center' },
  followBtn: { backgroundColor: '#FF3B30' }, 
  unfollowBtn: { backgroundColor: '#333', borderWidth: 1, borderColor: '#666' }, 
  messageBtn: { backgroundColor: '#222', borderWidth: 1, borderColor: '#333' },
  
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap' },
  gridItem: { width: '33%', aspectRatio: 1, padding: 1 },
  gridImage: { width: '100%', height: '100%', backgroundColor: '#111' },
  videoIconOverlay: { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 10, padding: 2 },
  
  modalOverlayPost: { flex: 1, backgroundColor: '#000' }, 
  modalContentPost: { flex: 1 }, 
  fullImage: { flex: 1, width: '100%', backgroundColor:'#000', justifyContent: 'center' }, 
  imageWithComments: { flex: 0.5, width: '100%', backgroundColor:'#000', justifyContent: 'center' }, 
  closeButton: { position: 'absolute', top: 50, right: 20, zIndex: 99, padding: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  
  modalFooter: { width: '100%', backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20, paddingBottom: 40 },
  footerWithComments: { flex: 0.5, backgroundColor: '#fff', borderTopLeftRadius: 25, borderTopRightRadius: 25, padding: 20 },

  videoControlsOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', flexDirection: 'row', gap: 40 },
  controlBtn: { alignItems: 'center' },
  controlText: { color: '#fff', fontSize: 10, fontWeight: 'bold', marginTop: 2 },
  playPauseBtn: { backgroundColor: 'rgba(0,0,0,0.6)', padding: 15, borderRadius: 40 },
  progressBarContainer: { width: '100%', height: 4, backgroundColor: '#ddd', marginBottom: 5, borderRadius: 2 },
  progressBarFill: { height: '100%', backgroundColor: '#FF3B30', borderRadius: 2 },

  usernameText: { color: '#000', fontSize: 18, fontWeight: 'bold' }, 
  caption: { color: '#333', fontSize: 15, marginTop: 5, lineHeight: 22 },
  locationTag: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  actionBtn: { flexDirection:'row', alignItems:'center', gap:5 },
  countText: { 
    color: '#000', 
    fontSize: 14, 
    fontWeight: 'bold', 
    minWidth: 20, 
    textAlign: 'center' 
  },

  commentsSection: { flex: 1, marginTop: 10 },
  divider: { height: 1, backgroundColor: '#eee', marginVertical: 10 },
  commentsList: { flex: 1 },
  commentItem: { marginBottom: 15, borderBottomWidth: 1, borderBottomColor: '#f5f5f5', paddingBottom: 10 },
  commentUser: { fontWeight: 'bold', fontSize: 14, color: '#000' },
  commentText: { fontSize: 14, color: '#333', marginTop: 2 },
  commentTime: { fontSize: 10, color: '#999', marginTop: 4 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f0f0', borderRadius: 30, paddingHorizontal: 15, paddingVertical: 8, marginTop: 10, marginBottom: 20 },
  input: { flex: 1, color: '#000', marginRight: 10, height: 40 }
});