import { Ionicons } from '@expo/vector-icons';
import { ResizeMode, Video } from 'expo-av';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  StatusBar, // EKLENDİ
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { auth, db, storage } from '../firebaseConfig';

const { width } = Dimensions.get('window');

const MOODS = [
  { id: 'fire', label: 'Ateş', icon: '🔥' },
  { id: 'happy', label: 'Mutlu', icon: '😊' },
  { id: 'tired', label: 'Yorgun', icon: '😴' },
  { id: 'coffee', label: 'Keyif', icon: '☕' },
  { id: 'party', label: 'Parti', icon: '🥳' },
  { id: 'gym', label: 'Spor', icon: '💪' },
  { id: 'travel', label: 'Gezi', icon: '✈️' },
  { id: 'work', label: 'İş', icon: '💻' },
];

export default function CreateScreen() {
  const router = useRouter();
  
  const [media, setMedia] = useState<string | null>(null);
  const [mediaType, setMediaType] = useState<'image' | 'video'>('image');
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState<string | null>(null);
  const [mood, setMood] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [gettingLocation, setGettingLocation] = useState(false);

  // --- GERİ TUŞU YÖNETİMİ ---
  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        if (media) {
          Alert.alert("İptal Et", "Düzenlemeyi bırakıp çıkmak istiyor musun?", [
            { text: "Hayır", style: "cancel" },
            { text: "Evet", style: 'destructive', onPress: () => { setMedia(null); setCaption(''); } }
          ]);
          return true;
        }
        router.replace('/(tabs)');
        return true;
      };

      // YENİ YÖNTEM: subscription.remove() kullanımı
      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => subscription.remove();

    }, [media])
  );

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

  const processMediaResult = (result: ImagePicker.ImagePickerResult) => {
    if (!result.canceled) {
      const asset = result.assets[0];
      setMedia(asset.uri);
      setMediaType(asset.type === 'video' ? 'video' : 'image');
    }
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsEditing: false, 
      quality: 0.8,
    });
    processMediaResult(result);
  };

  const openCamera = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) { Alert.alert("İzin Gerekli", "Kamera izni gerekli."); return; }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      quality: 0.8,
    });
    processMediaResult(result);
  };

  const getLocation = async () => {
    setGettingLocation(true);
    try {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      let locationData = await Location.getCurrentPositionAsync({});
      let address = await Location.reverseGeocodeAsync(locationData.coords);
      if (address.length > 0) {
        const addr = address[0];
        const locString = `${addr.district || addr.name || ''}, ${addr.city || addr.region || ''}`;
        setLocation(locString);
      }
    } catch (error) { } finally { setGettingLocation(false); }
  };

  const handleShare = async () => {
    if (!media) return;
    setUploading(true);
    try {
      const user = auth.currentUser;
      if (!user) throw new Error("Giriş yok");
      
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const username = userDoc.exists() ? userDoc.data().username : "Anonim";

      const blob = await uriToBlob(media);
      const ext = mediaType === 'video' ? 'mp4' : 'jpg';
      const filename = `posts/${user.uid}/${Date.now()}.${ext}`;
      const storageRef = ref(storage, filename);
      await uploadBytes(storageRef, blob);
      // @ts-ignore
      blob.close();
      const downloadUrl = await getDownloadURL(storageRef);

      await addDoc(collection(db, "posts"), {
        imageUrl: downloadUrl, mediaType, caption, userId: user.uid, username,
        location, mood, likes: 0, likedBy: [], commentCount: 0,
        createdAt: serverTimestamp(), type: 'wall'
      });

      setMedia(null); setCaption(''); setLocation(null); setMood(null);
      router.replace('/(tabs)');
    } catch (error: any) { Alert.alert("Hata", error.message); } 
    finally { setUploading(false); }
  };

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <StatusBar barStyle="light-content" backgroundColor="transparent" translucent />

      {!media ? (
        <SafeAreaView style={styles.emptyContainer}>
           <TouchableOpacity style={styles.closeButtonAbs} onPress={() => router.replace('/(tabs)')}>
              <Ionicons name="close" size={32} color="#fff" />
           </TouchableOpacity>
           
           <View style={styles.centerContent}>
              <Text style={styles.title}>Oluştur</Text>
              <View style={styles.actionButtonsRow}>
                 <TouchableOpacity style={styles.bigButton} onPress={pickFromGallery}>
                    <View style={[styles.iconCircle, {backgroundColor: '#1A1A1A'}]}>
                       <Ionicons name="images" size={30} color="#fff" />
                    </View>
                    <Text style={styles.btnText}>Galeri</Text>
                 </TouchableOpacity>
                 
                 <TouchableOpacity style={styles.bigButton} onPress={openCamera}>
                    <View style={[styles.iconCircle, {backgroundColor: '#FF3B30'}]}>
                       <Ionicons name="camera" size={30} color="#fff" />
                    </View>
                    <Text style={styles.btnText}>Kamera</Text>
                 </TouchableOpacity>
              </View>
           </View>
        </SafeAreaView>
      ) : (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{flex:1}}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.editorContainer}>
               
               <View style={styles.fullScreenMedia}>
                  {mediaType === 'video' ? (
                    <Video source={{ uri: media }} style={{width: '100%', height: '100%'}} resizeMode={ResizeMode.CONTAIN} shouldPlay isLooping isMuted />
                  ) : (
                    <Image source={{ uri: media }} style={{width: '100%', height: '100%'}} resizeMode="contain" />
                  )}
               </View>

               <SafeAreaView style={styles.topOverlay}>
                  <TouchableOpacity onPress={() => setMedia(null)} style={styles.iconBtn}>
                     <Ionicons name="chevron-back" size={28} color="#fff" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={[styles.shareBtn, uploading && {opacity: 0.5}]} 
                    onPress={handleShare}
                    disabled={uploading}
                  >
                    {uploading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.shareText}>Paylaş</Text>}
                  </TouchableOpacity>
               </SafeAreaView>

               <View style={styles.contentOverlay}>
                  <View style={styles.captionBox}>
                     <TextInput 
                        style={styles.captionInput} 
                        placeholder="Bir şeyler yaz..." 
                        placeholderTextColor="rgba(255,255,255,0.7)"
                        multiline
                        maxLength={250}
                        value={caption}
                        onChangeText={setCaption}
                     />
                  </View>

                  <View style={styles.tagsContainer}>
                     {location && (
                       <TouchableOpacity onPress={() => setLocation(null)} style={styles.tagChip}>
                          <Ionicons name="location" size={14} color="#FF3B30" />
                          <Text style={styles.tagText}>{location}</Text>
                       </TouchableOpacity>
                     )}
                     {mood && (
                       <TouchableOpacity onPress={() => setMood(null)} style={[styles.tagChip, {backgroundColor: 'rgba(0,122,255,0.3)'}]}>
                          <Text style={styles.tagText}>{mood}</Text>
                       </TouchableOpacity>
                     )}
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.toolsScroll} contentContainerStyle={{alignItems:'center'}}>
                     <TouchableOpacity style={styles.toolCircle} onPress={getLocation} disabled={gettingLocation}>
                        {gettingLocation ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="location-sharp" size={24} color="#fff" />}
                     </TouchableOpacity>
                     
                     <View style={styles.divider} />
                     
                     {MOODS.map(m => (
                       <TouchableOpacity key={m.id} style={styles.moodEmojiBtn} onPress={() => setMood(`${m.icon} ${m.label}`)}>
                          <Text style={{fontSize: 22}}>{m.icon}</Text>
                       </TouchableOpacity>
                     ))}
                  </ScrollView>
               </View>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  closeButtonAbs: { position: 'absolute', top: 50, left: 20, zIndex: 10, padding: 10 },
  centerContent: { width: '100%', alignItems: 'center', gap: 40 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', letterSpacing: 1 },
  actionButtonsRow: { flexDirection: 'row', gap: 30 },
  bigButton: { alignItems: 'center', gap: 10 },
  iconCircle: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#333' },
  btnText: { color: '#888', fontSize: 16, fontWeight: '500' },
  editorContainer: { flex: 1, backgroundColor: '#000' },
  fullScreenMedia: { ...StyleSheet.absoluteFillObject, backgroundColor: '#000', zIndex: -1 },
  topOverlay: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 15, paddingTop: Platform.OS === 'android' ? 40 : 10 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  shareBtn: { backgroundColor: '#FF3B30', paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20 },
  shareText: { color: '#fff', fontWeight: 'bold' },
  contentOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, paddingBottom: 20, paddingHorizontal: 15 },
  captionBox: { backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 15, padding: 15, marginBottom: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  captionInput: { color: '#fff', fontSize: 16, maxHeight: 100 },
  tagsContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 15 },
  tagChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, gap: 5 },
  tagText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  toolsScroll: { flexGrow: 0 },
  toolCircle: { width: 45, height: 45, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center', alignItems: 'center', marginRight: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  divider: { width: 1, height: 25, backgroundColor: 'rgba(255,255,255,0.3)', marginHorizontal: 5 },
  moodEmojiBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center', marginRight: 2 },
});