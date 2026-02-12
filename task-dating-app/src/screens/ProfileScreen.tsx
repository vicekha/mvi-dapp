import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, Switch } from 'react-native';
import { signOut } from 'firebase/auth';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../config/firebase';
import { COLORS } from '../theme/colors';
import { useAuth } from '../hooks/useAuth';
import { UserProfile } from '../types';

const ProfileScreen = () => {
    const { user } = useAuth();
    const [profile, setProfile] = useState<UserProfile | null>(null);

    useEffect(() => {
        if (user) {
            const fetchProfile = async () => {
                const docSnap = await getDoc(doc(db, 'users', user.uid));
                if (docSnap.exists()) {
                    setProfile({ uid: user.uid, ...docSnap.data() } as UserProfile);
                }
            };
            fetchProfile();
        }
    }, [user]);

    const toggleVisibility = async (value: boolean) => {
        if (!user) return;
        try {
            await updateDoc(doc(db, 'users', user.uid), {
                showProfileInChat: value
            });
            setProfile(prev => prev ? { ...prev, showProfileInChat: value } : null);
        } catch (error) {
            Alert.alert('Error', 'Failed to update visibility setting');
        }
    };

    const handleSignOut = () => {
        Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Yes', onPress: () => signOut(auth) },
        ]);
    };

    return (
        <View style={styles.container}>
            <View style={styles.avatarContainer}>
                <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarText}>
                        {user?.displayName ? user.displayName.charAt(0).toUpperCase() : '?'}
                    </Text>
                </View>
                <Text style={styles.name}>{user?.displayName || 'User'}</Text>
                <Text style={styles.email}>{user?.email}</Text>
            </View>

            <View style={styles.settings}>
                <View style={styles.settingItemRow}>
                    <Text style={styles.settingText}>Show profile in chats</Text>
                    <Switch
                        value={profile?.showProfileInChat ?? true}
                        onValueChange={toggleVisibility}
                        trackColor={{ false: COLORS.gray, true: COLORS.primary }}
                    />
                </View>

                <TouchableOpacity style={styles.settingItem} onPress={handleSignOut}>
                    <Text style={[styles.settingText, { color: COLORS.error }]}>Sign Out</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
        padding: 20,
    },
    avatarContainer: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 40,
    },
    avatarPlaceholder: {
        width: 100,
        height: 100,
        borderRadius: 50,
        backgroundColor: COLORS.gray,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 15,
    },
    avatarText: {
        fontSize: 40,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    name: {
        fontSize: 24,
        fontWeight: 'bold',
        color: COLORS.text,
    },
    email: {
        fontSize: 16,
        color: COLORS.textLight,
        marginTop: 5,
    },
    settings: {
        borderTopWidth: 1,
        borderTopColor: COLORS.gray,
        paddingTop: 10,
    },
    settingItem: {
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.gray,
    },
    settingItemRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.gray,
    },
    settingText: {
        fontSize: 18,
        fontWeight: '600',
    },
});

export default ProfileScreen;
