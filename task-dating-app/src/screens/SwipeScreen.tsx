import React, { useEffect, useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    Dimensions,
    Image,
    ActivityIndicator,
    TouchableOpacity
} from 'react-native';
import Swiper from 'react-native-deck-swiper';
import { collection, query, where, onSnapshot, updateDoc, doc, arrayUnion } from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { COLORS, SHADOW } from '../theme/colors';
import { Task } from '../types';
import { Ionicons } from '@expo/vector-icons';

const { width, height } = Dimensions.get('window');

const SwipeScreen = ({ navigation }: any) => {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const swiperRef = useRef<any>(null);

    useEffect(() => {
        const q = query(
            collection(db, 'tasks'),
            where('status', '==', 'active')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const now = Date.now();
            const activeTasks = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as Task))
                .filter(task => {
                    // Filter out tasks the user is already a participant of
                    const isParticipant = task.participantIds?.includes(auth.currentUser?.uid || '');
                    // Filter out expired tasks
                    const isExpired = task.deadline < now;
                    // Filter out full tasks
                    const isFull = (task.participantIds?.length || 0) >= (task.maxParticipants || 100);

                    return !isParticipant && !isExpired && !isFull;
                });

            setTasks(activeTasks);
            setLoading(false);
        });

        return unsubscribe;
    }, []);

    const handleJoin = async (index: number) => {
        const task = tasks[index];
        if (!task) return;

        try {
            const taskRef = doc(db, 'tasks', task.id);
            await updateDoc(taskRef, {
                participantIds: arrayUnion(auth.currentUser?.uid)
            });

            // Navigate to chat
            navigation.navigate('Chat', { taskId: task.id, title: task.title });
        } catch (error) {
            console.error('Error joining task:', error);
        }
    };

    const renderCard = (task: Task) => {
        if (!task) return null;

        return (
            <View style={styles.card}>
                {task.imageUrl ? (
                    <Image source={{ uri: task.imageUrl }} style={styles.cardImage} />
                ) : (
                    <View style={[styles.cardImage, styles.imagePlaceholder]}>
                        <Ionicons name="image-outline" size={80} color={COLORS.textLight} />
                    </View>
                )}

                <View style={styles.cardContent}>
                    <Text style={styles.cardTitle}>{task.title}</Text>
                    <Text style={styles.cardDescription} numberOfLines={3}>
                        {task.description}
                    </Text>

                    <View style={styles.cardFooter}>
                        <View style={styles.ownerInfo}>
                            <Ionicons name="person-circle-outline" size={20} color={COLORS.primary} />
                            <Text style={styles.ownerName}>{task.ownerName}</Text>
                        </View>
                        <View style={styles.participantCount}>
                            <Ionicons name="people-outline" size={20} color={COLORS.textLight} />
                            <Text style={styles.countText}>
                                {task.participantIds?.length || 0}/{task.maxParticipants || '?'} slots
                            </Text>
                        </View>
                    </View>
                </View>
            </View>
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
            <View style={styles.swiperContainer}>
                {tasks.length > 0 ? (
                    <Swiper
                        ref={swiperRef}
                        cards={tasks}
                        renderCard={renderCard}
                        onSwipedRight={(index) => handleJoin(index)}
                        onSwipedLeft={(index) => console.log('Skipped', index)}
                        backgroundColor={'transparent'}
                        stackSize={3}
                        cardVerticalMargin={20}
                        overlayLabels={{
                            left: {
                                title: 'SKIP',
                                style: {
                                    label: { color: COLORS.error, borderColor: COLORS.error, borderWidth: 4, fontSize: 32, fontWeight: '800' },
                                    wrapper: { flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'flex-start', marginTop: 30, marginLeft: -30 }
                                }
                            },
                            right: {
                                title: 'JOIN',
                                style: {
                                    label: { color: COLORS.success, borderColor: COLORS.success, borderWidth: 4, fontSize: 32, fontWeight: '800' },
                                    wrapper: { flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'flex-start', marginTop: 30, marginLeft: 30 }
                                }
                            }
                        }}
                    />
                ) : (
                    <View style={styles.centered}>
                        <Ionicons name="cafe-outline" size={80} color={COLORS.gray} />
                        <Text style={styles.noTasks}>No more tasks for now!</Text>
                        <Text style={styles.subText}>Check back later or create your own.</Text>
                    </View>
                )}
            </View>

            {tasks.length > 0 && (
                <View style={styles.buttonsContainer}>
                    <TouchableOpacity
                        style={[styles.circleButton, { borderColor: COLORS.error }]}
                        onPress={() => swiperRef.current?.swipeLeft()}
                    >
                        <Ionicons name="close" size={32} color={COLORS.error} />
                    </TouchableOpacity>

                    <TouchableOpacity
                        style={[styles.circleButton, { borderColor: COLORS.success, paddingLeft: 4 }]}
                        onPress={() => swiperRef.current?.swipeRight()}
                    >
                        <Ionicons name="heart" size={32} color={COLORS.success} />
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.surface,
    },
    swiperContainer: {
        flex: 1,
    },
    card: {
        height: height * 0.65,
        borderRadius: 20,
        backgroundColor: COLORS.white,
        ...SHADOW.md,
        overflow: 'hidden',
    },
    cardImage: {
        width: '100%',
        height: '70%',
        resizeMode: 'cover',
    },
    imagePlaceholder: {
        backgroundColor: COLORS.gray,
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardContent: {
        padding: 20,
        flex: 1,
        justifyContent: 'space-between',
    },
    cardTitle: {
        fontSize: 26,
        fontWeight: 'bold',
        color: COLORS.text,
    },
    cardDescription: {
        fontSize: 16,
        color: COLORS.textLight,
        marginTop: 8,
        lineHeight: 22,
    },
    cardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 15,
    },
    ownerInfo: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    ownerName: {
        marginLeft: 5,
        fontSize: 14,
        fontWeight: '600',
        color: COLORS.text,
    },
    participantCount: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    countText: {
        marginLeft: 5,
        fontSize: 14,
        color: COLORS.textLight,
    },
    buttonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-evenly',
        alignItems: 'center',
        paddingVertical: 30,
    },
    circleButton: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 2,
        backgroundColor: COLORS.white,
        justifyContent: 'center',
        alignItems: 'center',
        ...SHADOW.sm,
    },
    centered: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    noTasks: {
        fontSize: 20,
        fontWeight: 'bold',
        color: COLORS.text,
        marginTop: 20,
    },
    subText: {
        fontSize: 16,
        color: COLORS.textLight,
        marginTop: 10,
        textAlign: 'center',
    },
});

export default SwipeScreen;
