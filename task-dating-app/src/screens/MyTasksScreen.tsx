import React, { useEffect, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    Image,
    ActivityIndicator
} from 'react-native';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { COLORS, SHADOW } from '../theme/colors';
import { Task } from '../types';
import { Ionicons } from '@expo/vector-icons';

const MyTasksScreen = ({ navigation }: any) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Fetch tasks where user is a participant
        const q = query(
            collection(db, 'tasks'),
            where('participantIds', 'array-contains', auth.currentUser?.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const myTasks = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Task));

            // Sort: Owned tasks first, then by date
            myTasks.sort((a, b) => {
                if (a.ownerId === auth.currentUser?.uid) return -1;
                if (b.ownerId === auth.currentUser?.uid) return 1;
                return b.createdAt - a.createdAt;
            });

            setTasks(myTasks);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const renderTaskItem = ({ item }: { item: Task }) => {
        const isOwner = item.ownerId === auth.currentUser?.uid;

        return (
            <TouchableOpacity
                style={styles.taskCard}
                onPress={() => navigation.navigate('Chat', { taskId: item.id, title: item.title })}
            >
                <View style={styles.taskImageContainer}>
                    {item.imageUrl ? (
                        <Image source={{ uri: item.imageUrl }} style={styles.taskImage} />
                    ) : (
                        <View style={styles.imagePlaceholder}>
                            <Ionicons name="chatbubble-ellipses" size={24} color={COLORS.primary} />
                        </View>
                    )}
                </View>

                <View style={styles.taskInfo}>
                    <View style={styles.titleRow}>
                        <Text style={styles.taskTitle} numberOfLines={1}>{item.title}</Text>
                        {isOwner && (
                            <View style={styles.ownerBadge}>
                                <Text style={styles.ownerBadgeText}>Owner</Text>
                            </View>
                        )}
                    </View>
                    <Text style={styles.taskDescription} numberOfLines={1}>{item.description}</Text>
                    <Text style={styles.participantCount}>
                        {item.participantIds?.length || 0}/{item.maxParticipants || '?'} participants
                    </Text>
                </View>

                <Ionicons name="chevron-forward" size={20} color={COLORS.gray} />
            </TouchableOpacity>
        );
    };

    if (loading) {
        return (
            <View style={styles.centered}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            <FlatList
                data={tasks}
                keyExtractor={(item) => item.id}
                renderItem={renderTaskItem}
                contentContainerStyle={styles.listPadding}
                ListEmptyComponent={
                    <View style={styles.emptyState}>
                        <Ionicons name="clipboard-outline" size={60} color={COLORS.gray} />
                        <Text style={styles.emptyText}>You haven joined any tasks yet.</Text>
                        <TouchableOpacity
                            style={styles.exploreButton}
                            onPress={() => navigation.navigate('Explore')}
                        >
                            <Text style={styles.exploreButtonText}>Explore Pool</Text>
                        </TouchableOpacity>
                    </View>
                }
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.surface,
    },
    listPadding: {
        padding: 15,
    },
    taskCard: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: COLORS.white,
        borderRadius: 15,
        padding: 12,
        marginBottom: 12,
        ...SHADOW.sm,
    },
    taskImageContainer: {
        width: 60,
        height: 60,
        borderRadius: 30,
        overflow: 'hidden',
        backgroundColor: COLORS.gray,
    },
    taskImage: {
        width: '100%',
        height: '100%',
    },
    imagePlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    taskInfo: {
        flex: 1,
        marginLeft: 15,
    },
    titleRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    taskTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: COLORS.text,
        flexShrink: 1,
    },
    ownerBadge: {
        backgroundColor: COLORS.primary + '20',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        marginLeft: 8,
    },
    ownerBadgeText: {
        fontSize: 10,
        color: COLORS.primary,
        fontWeight: 'bold',
    },
    taskDescription: {
        fontSize: 14,
        color: COLORS.textLight,
        marginTop: 2,
    },
    participantCount: {
        fontSize: 12,
        color: COLORS.textLight,
        marginTop: 4,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyState: {
        alignItems: 'center',
        marginTop: 100,
    },
    emptyText: {
        fontSize: 16,
        color: COLORS.textLight,
        marginTop: 20,
    },
    exploreButton: {
        marginTop: 20,
        backgroundColor: COLORS.primary,
        paddingHorizontal: 30,
        paddingVertical: 12,
        borderRadius: 25,
    },
    exploreButtonText: {
        color: COLORS.white,
        fontWeight: 'bold',
    },
});

export default MyTasksScreen;
