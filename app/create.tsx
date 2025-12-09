import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { auth, db, storage } from '../firebaseConfig';

const { width } = Dimensions.get('window');

export default function CreateScreen() {
  const router = useRouter();
  
  const [media, setMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  
  const [location, setLocation] = useState<string | null>(null);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [mood, setMood] = useState<string | null>(null);
  
  const [moodModalVisible, setMoodModalVisible] = useState(false);
  const [shareModalVisible, setShareModalVisible] = useState(false);
  
  const [uploading, setUploading] = useState(false);
  const [storyDuration, setStoryDuration] = useState(1440); 

  const moods = ["🔥 Ateş", "😊 Mutlu", "😴 Yorgun", "☕ Keyifli", "🥳 Parti", "💪 Spor", "✈️ Gezi", "💻 Çalışıyor", "🍔 Aç", "💔 Üzgün"];

  // --- KRİTİK: Android İçin Güvenli Blob Çevirici ---
  const uriToBlob = (uri: string): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.onload = function () { resolve(xhr.response); };
      xhr.onerror = function (e) { reject(new TypeError("Dosya işlenemedi.")); };
      xhr.responseType = "blob";
      xhr.open("GET", uri, true);
      xhr.send(null);
    });
  };

  const pickMedia = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("İzin Gerekli", "Galeri izni lazım."); return; }
    
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: true, // Düzenleme ekranını aç
      quality: 0.5, // Hız için kaliteyi düşür
      videoMaxDuration: 60,
    });

    if (!result.canceled) {
      setMedia(result.assets[0].uri);
      setMediaType(result.assets[0].type === 'video' ? 'video' : 'image');
    }
  };

  const getLocation = async () => {
    setGettingLocation(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert("Hata", "Konum izni verilmedi."); setGettingLocation(false); return; }
      let locationData = await Location.getCurrentPositionAsync({});
      let address = await Location.reverseGeocodeAsync(locationData.coords);
      if (address.length > 0) {
        const city = address[0].city || address[0].subregion;
        const district = address[0].district || address[0].name;
        setLocation(`${district}, ${city}`);
      }
    } catch (error) { Alert.alert("Hata", "Konum alınamadı."); } 
    finally { setGettingLocation(false); }
  };

  const finalizeShare = async (type: 'story' | 'wall') => {
    setShareModalVisible(false);
    setUploading(true);

    try {
      const user = auth.currentUser;
      if (!user) { Alert.alert("Hata", "Giriş yapmalısın."); setUploading(false); return; }

      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);
      let currentUsername = "Anonim";
      if (userDocSnap.exists()) { currentUsername = userDocSnap.data().username || user.email?.split('@')[0]; }

      // 1. BLOB YAP
      const blob = await uriToBlob(media!);

      const extension = mediaType === 'video' ? 'mp4' : 'jpg';
      const filename = `posts/${user.uid}/${Date.now()}.${extension}`;
      
      const storageRef = ref(storage, filename);
      
      // 2. YÜKLE
      await uploadBytes(storageRef, blob);
      
      // 3. TEMİZLE
      // @ts-ignore
      blob.close(); 

      const downloadUrl = await getDownloadURL(storageRef);

      const postData = {
        imageUrl: downloadUrl,
        mediaType: mediaType,
        userId: user.uid,
        userEmail: user.email,
        username: currentUsername,
        location: location,
        mood: mood,
        createdAt: serverTimestamp(),
      };

      if (type === 'story') {
        const expiresAt = new Date();
        expiresAt.setMinutes(expiresAt.getMinutes() + storyDuration);
        await addDoc(collection(db, "stories"), { ...postData, caption: caption, expiresAt: expiresAt, durationMin: storyDuration, type: 'story' });
      } else {
        await addDoc(collection(db, "posts"), { ...postData, caption: caption, likes: 0, type: 'wall' });
      }

      Alert.alert("Başarılı", "Paylaşıldı! 🚀");
      setMedia(null); setCaption(''); setLocation(null); setMood(null);
      router.replace('/(tabs)'); 

    } catch (error: any) { 
        Alert.alert("Hata", "Yükleme başarısız. İnternetini kontrol et."); 
    } 
    finally { setUploading(false); }
  };

  const onNextPress = () => {
    if (!media) { Alert.alert("Medya Yok", "Lütfen önce bir görsel seç."); return; }
    setShareModalVisible(true);
  };

  return (
    <KeyboardAvoidingView 
      style={{ flex: 1, backgroundColor: '#050505' }} 
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        
        {/* HEADER */}
        <View style={styles.header}>
           {/* Geri butonu kaldırıldı, çünkü tabs içindeyiz */}
           <Text style={styles.headerTitle}>Oluştur</Text>
           <TouchableOpacity 
              style={[styles.headerNextBtn, (!media || uploading) && styles.disabledBtn]} 
              onPress={onNextPress}
              disabled={!media || uploading}
           >
              {uploading ? <ActivityIndicator size="small" color="#000" /> : <Text style={styles.headerNextText}>İlerle</Text>}
           </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 100, paddingTop: 20 }}>
          
          <TouchableOpacity onPress={pickMedia} activeOpacity={0.9} style={styles.canvasContainer}>
            {media ? (
              <>
                {mediaType === 'video' ? (
                  <Video source={{ uri: media }} style={styles.canvasMedia} useNativeControls resizeMode={ResizeMode.COVER} isLooping shouldPlay />
                ) : ( <Image source={{ uri: media }} style={styles.canvasMedia} /> )}
                <View style={styles.editIconBadge}><Ionicons name="create" size={20} color="#fff" /></View>
              </>
            ) : (
              <View style={styles.emptyCanvas}>
                 <View style={styles.iconGlow}><Ionicons name="add" size={50} color="#fff" /></View>
                 <Text style={styles.emptyTitle}>Medyayı Seç</Text>
                 <Text style={styles.emptySubtitle}>Fotoğraf veya Video Yüklemek İçin Dokun</Text>
              </View>
            )}
          </TouchableOpacity>

          {media && (
            <View style={styles.optionsContainer}>
              <View style={styles.captionInputWrapper}>
                  <TextInput 
                    style={styles.captionInput} 
                    placeholder="Bir şeyler yaz... (İsteğe bağlı)" 
                    placeholderTextColor="#555" 
                    value={caption} 
                    onChangeText={setCaption} 
                    multiline 
                    scrollEnabled={false} 
                  />
              </View>

              <View style={styles.toolsRow}>
                  <TouchableOpacity style={[styles.toolBtn, location && styles.activeToolBtn]} onPress={getLocation} disabled={gettingLocation}>
                    {gettingLocation ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="location-sharp" size={20} color={location ? "#000" : "#fff"} />}
                    {location && <Text style={styles.activeToolText} numberOfLines={1}>{location}</Text>}
                  </TouchableOpacity>

                  <TouchableOpacity style={[styles.toolBtn, mood && styles.activeToolBtn]} onPress={() => setMoodModalVisible(true)}>
                    <Ionicons name="happy" size={20} color={mood ? "#000" : "#fff"} />
                    {mood && <Text style={styles.activeToolText}>{mood.split(' ')[1]}</Text>} 
                  </TouchableOpacity>
              </View>
            </View>
          )}

        </ScrollView>

        <Modal visible={shareModalVisible} transparent={true} animationType="slide" onRequestClose={() => setShareModalVisible(false)}>
           <TouchableOpacity style={styles.modalOverlay} onPress={() => setShareModalVisible(false)}>
              <View style={styles.shareSheetContent}>
                 <View style={styles.sheetHandle} />
                 <Text style={styles.sheetTitle}>Nereye Gönderilsin?</Text>

                 <View style={styles.optionSection}>
                    <TouchableOpacity style={styles.shareOptionBtn} onPress={() => finalizeShare('story')}>
                       <View style={[styles.iconBox, {backgroundColor: '#FF3B30'}]}><Ionicons name="timer-outline" size={24} color="#fff" /></View>
                       <View style={{flex:1}}><Text style={styles.optionTitle}>Hikayene Ekle</Text><Text style={styles.optionSubtitle}>24 Saat Sonra Silinir</Text></View>
                       <Ionicons name="chevron-forward" size={24} color="#666" />
                    </TouchableOpacity>
                    <View style={styles.durationChips}>
                       {[5, 60, 1440].map((m) => (
                          <TouchableOpacity key={m} onPress={() => setStoryDuration(m)} style={[styles.dChip, storyDuration === m && styles.dChipActive]}>
                             <Text style={[styles.dChipText, storyDuration === m && {color:'#fff'}]}>{m === 5 ? "🔥 5dk" : (m === 60 ? "1 Saat" : "24 Saat")}</Text>
                          </TouchableOpacity>
                       ))}
                    </View>
                 </View>

                 <View style={styles.divider} />

                 <TouchableOpacity style={styles.shareOptionBtn} onPress={() => finalizeShare('wall')}>
                    <View style={[styles.iconBox, {backgroundColor: '#fff'}]}><Ionicons name="grid-outline" size={24} color="#000" /></View>
                    <View style={{flex:1}}><Text style={styles.optionTitle}>Duvarında Paylaş</Text><Text style={styles.optionSubtitle}>Profilinde Kalıcı Olur</Text></View>
                    <Ionicons name="chevron-forward" size={24} color="#666" />
                 </TouchableOpacity>

              </View>
           </TouchableOpacity>
        </Modal>

        <Modal visible={moodModalVisible} transparent={true} animationType="slide" onRequestClose={() => setMoodModalVisible(false)}>
           <TouchableOpacity style={styles.modalOverlay} onPress={() => setMoodModalVisible(false)}>
              <View style={styles.moodContent}>
                 <Text style={styles.sheetTitle}>His Durumu</Text>
                 <FlatList data={moods} numColumns={3} keyExtractor={item => item} renderItem={({item}) => (
                      <TouchableOpacity style={styles.moodItem} onPress={() => { setMood(item); setMoodModalVisible(false); }}>
                         <Text style={styles.moodText}>{item}</Text>
                      </TouchableOpacity>
                   )} />
              </View>
           </TouchableOpacity>
        </Modal>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#050505' }, 
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingTop: 50, paddingBottom: 15, borderBottomWidth: 1, borderBottomColor: '#1A1A1A' },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  headerIconBtn: { padding: 5 },
  headerNextBtn: { backgroundColor: '#fff', paddingVertical: 8, paddingHorizontal: 15, borderRadius: 20 },
  headerNextText: { color: '#000', fontWeight: 'bold', fontSize: 14 },
  disabledBtn: { backgroundColor: '#333', opacity: 0.7 }, 
  canvasContainer: { width: width - 30, height: width * 1.2, backgroundColor: '#111', alignSelf: 'center', borderRadius: 35, overflow: 'hidden', borderWidth: 1, borderColor: '#222', marginBottom: 25 },
  canvasMedia: { width: '100%', height: '100%' },
  emptyCanvas: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0F0F0F' },
  iconGlow: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#1A1A1A', justifyContent: 'center', alignItems: 'center', marginBottom: 20, borderWidth: 1, borderColor: '#333' },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold', marginBottom: 5 },
  emptySubtitle: { color: '#666', fontSize: 14 },
  editIconBadge: { position: 'absolute', top: 15, right: 15, backgroundColor: 'rgba(0,0,0,0.6)', padding: 8, borderRadius: 20 },
  optionsContainer: { paddingHorizontal: 25 },
  captionInputWrapper: { marginBottom: 20, borderBottomWidth: 1, borderBottomColor: '#333', paddingBottom: 10 },
  captionInput: { color: '#fff', fontSize: 18, minHeight: 40 },
  toolsRow: { flexDirection: 'row', gap: 12 },
  toolBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 25, borderWidth: 1, borderColor: '#333', gap: 8 },
  activeToolBtn: { backgroundColor: '#fff' },
  activeToolText: { color: '#000', fontWeight: 'bold', fontSize: 12, maxWidth: 100 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-end' },
  shareSheetContent: { backgroundColor: '#151515', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, paddingBottom: 50 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#444', alignSelf: 'center', borderRadius: 2, marginBottom: 20 },
  sheetTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 25 },
  optionSection: { marginBottom: 10 },
  shareOptionBtn: { flexDirection: 'row', alignItems: 'center', paddingVertical: 15, borderRadius: 20 },
  iconBox: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  optionTitle: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  optionSubtitle: { color: '#666', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#333', marginVertical: 10 },
  durationChips: { flexDirection: 'row', marginLeft: 65, marginTop: 5, gap: 10 },
  dChip: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 15, backgroundColor: '#222', borderWidth: 1, borderColor: '#333' },
  dChipActive: { backgroundColor: '#FF3B30', borderColor: '#FF3B30' },
  dChipText: { color: '#666', fontSize: 11, fontWeight: 'bold' },
  moodContent: { backgroundColor: '#1A1A1A', borderTopLeftRadius: 30, borderTopRightRadius: 30, padding: 25, height: '45%' },
  moodItem: { flex: 1, margin: 5, padding: 15, backgroundColor: '#252525', borderRadius: 15, alignItems: 'center' },
  moodText: { color: '#fff', fontSize: 13, fontWeight: 'bold' }
});