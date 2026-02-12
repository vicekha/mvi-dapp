import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Alert,
    ImageBackground
} from 'react-native';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../config/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { COLORS } from '../theme/colors';

const AuthScreen = () => {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAuth = async () => {
        if (!email || !password || (!isLogin && !name)) {
            Alert.alert('Error', 'Please fill in all fields');
            return;
        }

        setLoading(true);
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;

                // Create user profile in Firestore
                await setDoc(doc(db, 'users', user.uid), {
                    uid: user.uid,
                    email: user.email,
                    displayName: name,
                    showProfileInChat: true,
                    createdAt: new Date(),
                });
            }
        } catch (error: any) {
            Alert.alert('Authentication Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.title}>TaskDater</Text>
                <Text style={styles.subtitle}>Swipe. Join. Complete.</Text>

                <View style={styles.form}>
                    {!isLogin && (
                        <TextInput
                            style={styles.input}
                            placeholder="Full Name"
                            value={name}
                            onChangeText={setName}
                            autoCapitalize="words"
                        />
                    )}
                    <TextInput
                        style={styles.input}
                        placeholder="Email"
                        value={email}
                        onChangeText={setEmail}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="Password"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry
                    />

                    <TouchableOpacity
                        style={styles.button}
                        onPress={handleAuth}
                        disabled={loading}
                    >
                        <Text style={styles.buttonText}>
                            {loading ? 'Processing...' : (isLogin ? 'Sign In' : 'Sign Up')}
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => setIsLogin(!isLogin)} style={styles.switchButton}>
                        <Text style={styles.switchText}>
                            {isLogin ? "Don't have an account? Sign Up" : "Already have an account? Sign In"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    content: {
        flex: 1,
        padding: 30,
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 48,
        fontWeight: 'bold',
        color: COLORS.primary,
        marginBottom: 10,
    },
    subtitle: {
        fontSize: 18,
        color: COLORS.textLight,
        marginBottom: 40,
    },
    form: {
        width: '100%',
    },
    input: {
        backgroundColor: COLORS.surface,
        padding: 15,
        borderRadius: 10,
        marginBottom: 15,
        fontSize: 16,
        borderWidth: 1,
        borderColor: COLORS.gray,
    },
    button: {
        backgroundColor: COLORS.primary,
        padding: 18,
        borderRadius: 10,
        alignItems: 'center',
        marginTop: 10,
    },
    buttonText: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: 'bold',
    },
    switchButton: {
        marginTop: 20,
        alignItems: 'center',
    },
    switchText: {
        color: COLORS.primary,
        fontSize: 14,
        fontWeight: '600',
    },
});

export default AuthScreen;
