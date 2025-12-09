import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, KeyboardAvoidingView, Platform, SafeAreaView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

export default function ConversationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams();
  const { targetUserId } = params; // targetUsername'i artık buradan almıyoruz

  const currentUser = auth.currentUser;
  const [messages, setMessages] = useState<any[]>([]);
  const [inputText, setInputText] = useState('');
  const [chatId, setChatId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Güncel Profil Bilgileri
  const [targetAvatar, setTargetAvatar] = useState<string | null>(null);
  const [targetRealName, setTargetRealName] = useState<string>("Kullanıcı");

  const flatListRef = useRef<FlatList>(null);

  // 1. Karşı Tarafın GÜNCEL Profilini Çek
  useEffect(() => {
    const fetchTargetProfile = async () => {
      const tId = Array.isArray(targetUserId) ? targetUserId[0] : targetUserId;
      if (tId) {
        const docRef = doc(db, "users", tId);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setTargetAvatar(data.avatar_url);
          // İşte burası güncel ismi alır:
          setTargetRealName(data.username || "Kullanıcı");
        }
      }
    };
    fetchTargetProfile();
  }, [targetUserId]);

  // 2. Sohbet Başlat
  useEffect(() => {
    const initChat = async () => {
      if (!currentUser || !targetUserId) return;
      const tId = Array.isArray(targetUserId) ? targetUserId[0] : targetUserId;
      const ids = [currentUser.uid, tId].sort();
      const generatedChatId = ids.join("_");
      setChatId(generatedChatId);
      
      const chatDocRef = doc(db, "chats", generatedChatId);
      // İsimleri kaydetmeye gerek yok, artık canlı çekiyoruz. Sadece katılımcı ID'leri yeterli.
      await setDoc(chatDocRef, {
        participants: [currentUser.uid, tId],
        updatedAt: serverTimestamp()
      }, { merge: true });

      setLoading(false);
    };
    initChat();
  }, [targetUserId]);

  // 3. Mesajları Dinle
  useEffect(() => {
    if (!chatId) return;
    const messagesRef = collection(db, "chats", chatId, "messages");
    const q = query(messagesRef, orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setMessages(msgs);
    });
    return () => unsubscribe();
  }, [chatId]);

  const sendMessage = async () => {
    if (inputText.trim() === '' || !chatId || !currentUser) return;
    const textToSend = inputText;
    setInputText('');
    try {
      await addDoc(collection(db, "chats", chatId, "messages"), {
        text: textToSend, senderId: currentUser.uid, createdAt: serverTimestamp()
      });
      
      const tId = Array.isArray(targetUserId) ? targetUserId[0] : targetUserId;
      await updateDoc(doc(db, "chats", chatId), { 
        lastMessage: textToSend, 
        updatedAt: serverTimestamp(),
        [`readStatus.${currentUser.uid}`]: true,
        [`readStatus.${tId}`]: false
      });
    } catch (error) { console.log("Hata:", error); }
  };

  const renderMessage = ({ item }: any) => {
    const isMe = item.senderId === currentUser?.uid;
    let timeString = "";
    if (item.createdAt) {
       const date = item.createdAt.toDate ? item.createdAt.toDate() : new Date();
       timeString = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return (
      <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowOther]}>
        {!isMe && (
           <View style={styles.chatAvatar}>
              {targetAvatar ? ( <Image source={{ uri: targetAvatar }} style={styles.avatarImg} /> ) : ( <Text style={styles.avatarText}>{targetRealName[0]?.toUpperCase()}</Text> )}
           </View>
        )}
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
          <Text style={[styles.msgText, isMe ? styles.textMe : styles.textOther]}>{item.text}</Text>
          <Text style={styles.timeText}>{timeString}</Text>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#050505" />
      <Stack.Screen options={{ headerShown: false }} /> 

      <View style={styles.header}>
         <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={28} color="#fff" />
         </TouchableOpacity>
         <View style={styles.headerInfo}>
            <View style={styles.headerAvatar}>
               {targetAvatar ? ( <Image source={{ uri: targetAvatar }} style={styles.headerAvatarImg} /> ) : ( <Text style={styles.headerAvatarText}>{targetRealName[0]?.toUpperCase()}</Text> )}
               <View style={styles.onlineDot} /> 
            </View>
            <View>
               <Text style={styles.headerName}>@{targetRealName}</Text>
               <Text style={styles.headerStatus}>Çevrimiçi</Text>
            </View>
         </View>
         <TouchableOpacity>
            <Ionicons name="ellipsis-vertical" size={24} color="#fff" />
         </TouchableOpacity>
      </View>

      <KeyboardAvoidingView 
        style={{ flex: 1 }} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {loading ? (
          <ActivityIndicator style={{marginTop: 50}} color="#FF3B30" />
        ) : (
          <FlatList
            ref={flatListRef}
            data={messages}
            renderItem={renderMessage}
            keyExtractor={item => item.id}
            inverted
            contentContainerStyle={{ paddingHorizontal: 15, paddingBottom: 20 }}
            style={{ flex: 1 }} 
          />
        )}

        <View style={styles.inputWrapper}>
          <View style={styles.inputContainer}>
            <TouchableOpacity style={styles.attachBtn}>
               <Ionicons name="add" size={24} color="#666" />
            </TouchableOpacity>
            <TextInput
              style={styles.input}
              placeholder="Mesaj yaz..."
              placeholderTextColor="#666"
              value={inputText}
              onChangeText={setInputText}
              multiline
            />
            <TouchableOpacity onPress={sendMessage} style={[styles.sendBtn, inputText.length > 0 && styles.sendBtnActive]}>
              <Ionicons name="arrow-up" size={20} color={inputText.length > 0 ? "#000" : "#666"} />
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' }, 
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, paddingTop: Platform.OS === 'android' ? 40 : 10, paddingBottom: 15, backgroundColor: '#050505', borderBottomWidth: 1, borderBottomColor: '#1A1A1A', zIndex: 10 },
  backBtn: { marginRight: 15, padding: 5 },
  headerInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  headerAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#222', justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  headerAvatarImg: { width: '100%', height: '100%', borderRadius: 20 },
  headerAvatarText: { color: '#fff', fontWeight: 'bold' },
  onlineDot: { position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: '#25D366', borderWidth: 2, borderColor: '#050505' },
  headerName: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  headerStatus: { color: '#25D366', fontSize: 11 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 15 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgRowOther: { justifyContent: 'flex-start' },
  chatAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginRight: 8, marginBottom: 5 },
  avatarImg: { width: '100%', height: '100%', borderRadius: 15 },
  avatarText: { color: '#ccc', fontSize: 12, fontWeight: 'bold' },
  bubble: { maxWidth: '75%', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 22 },
  bubbleMe: { backgroundColor: '#FF3B30', borderBottomRightRadius: 4 }, 
  textMe: { color: '#fff', fontSize: 16 },
  bubbleOther: { backgroundColor: '#1A1A1A', borderBottomLeftRadius: 4 }, 
  textOther: { color: '#fff', fontSize: 16 },
  timeMe: { color: 'rgba(255,255,255,0.7)', fontSize: 10, marginTop: 4, textAlign: 'right' },
  timeOther: { color: '#666', fontSize: 10, marginTop: 4 },
  timeText: { fontSize: 10, marginTop: 4, color: '#999' },
  msgText: { lineHeight: 22 },
  inputWrapper: { width: '100%', backgroundColor: '#050505', paddingBottom: 10 },
  inputContainer: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 10, marginTop: 5, backgroundColor: '#1A1A1A', borderRadius: 30, paddingHorizontal: 10, paddingVertical: 5 },
  attachBtn: { padding: 10 },
  input: { flex: 1, color: '#fff', fontSize: 16, maxHeight: 100, paddingHorizontal: 10 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#333', justifyContent: 'center', alignItems: 'center', marginLeft: 5 },
  sendBtnActive: { backgroundColor: '#FF3B30' } 
});