import { Stack, useRouter } from 'expo-router';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, db } from '../firebaseConfig';

export default function LoginScreen() {
  const router = useRouter();
  
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');

  const handleAuth = async () => {
    if (!email || !password) {
      Alert.alert("Eksik Bilgi", "Lütfen e-posta ve şifreyi gir.");
      return;
    }

    setLoading(true);

    try {
      if (isLoginMode) {
        // --- GİRİŞ YAP ---
        await signInWithEmailAndPassword(auth, email, password);
        router.replace('/(tabs)'); 
      } else {
        // --- KAYIT OL ---
        if (!username) {
          Alert.alert("Eksik Bilgi", "Kullanıcı adı seçmelisin!");
          setLoading(false);
          return;
        }

        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;

        await setDoc(doc(db, "users", user.uid), {
          username: username,
          email: email,
          uid: user.uid,
          createdAt: new Date()
        });

        router.replace('/(tabs)');
      }
    } catch (error: any) {
      // --- HATA TERCÜMANI ---
      let errorMessage = "Bir hata oluştu.";
      const errorCode = error.code || error.message; // Firebase hata kodunu al

      if (errorCode.includes('auth/invalid-credential') || errorCode.includes('auth/wrong-password')) {
        errorMessage = "Şifre veya E-posta hatalı! Lütfen kontrol et.";
      } else if (errorCode.includes('auth/user-not-found')) {
        errorMessage = "Böyle bir kullanıcı bulunamadı.";
      } else if (errorCode.includes('auth/email-already-in-use')) {
        errorMessage = "Bu e-posta adresi zaten kayıtlı.";
      } else if (errorCode.includes('auth/invalid-email')) {
        errorMessage = "Geçersiz bir e-posta adresi girdin.";
      } else if (errorCode.includes('auth/weak-password')) {
        errorMessage = "Şifre çok zayıf (En az 6 karakter olmalı).";
      } else if (errorCode.includes('auth/too-many-requests')) {
        errorMessage = "Çok fazla deneme yaptın. Biraz bekle.";
      }

      Alert.alert("Hata", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      
      <Stack.Screen options={{ headerShown: false }} />

      <Text style={styles.logo}>
        soce<Text style={{color: '#C12626'}}>.</Text>
      </Text>
      
      <Text style={styles.subtitle}>
        {isLoginMode ? "Tekrar Hoşgeldin!" : "Aramıza Katıl"}
      </Text>

      {!isLoginMode && (
        <TextInput 
          style={styles.input} 
          placeholder="Kullanıcı Adı (@turker)" 
          placeholderTextColor="#666"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
        />
      )}

      <TextInput 
        style={styles.input} 
        placeholder="E-posta" 
        placeholderTextColor="#666"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput 
        style={styles.input} 
        placeholder="Şifre" 
        secureTextEntry
        placeholderTextColor="#666"
        value={password}
        onChangeText={setPassword}
      />

      <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>
            {isLoginMode ? "Giriş Yap" : "Kayıt Ol"}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsLoginMode(!isLoginMode)} style={{marginTop: 20}}>
        <Text style={styles.switchText}>
          {isLoginMode ? "Hesabın yok mu? Kayıt Ol" : "Zaten hesabın var mı? Giriş Yap"}
        </Text>
      </TouchableOpacity>

    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  logo: { fontSize: 50, fontWeight: '900', color: '#fff', marginBottom: 5, letterSpacing: -2 },
  subtitle: { fontSize: 16, color: '#888', marginBottom: 40 },
  input: { width: '80%', height: 50, backgroundColor: '#111', borderRadius: 10, paddingHorizontal: 20, color: '#fff', marginBottom: 15, borderWidth: 1, borderColor: '#333' },
  button: { width: '80%', height: 50, backgroundColor: '#C12626', borderRadius: 10, justifyContent: 'center', alignItems: 'center', marginTop: 10 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  switchText: { color: '#C12626', fontWeight: 'bold' }
});