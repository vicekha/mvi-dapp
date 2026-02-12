import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TextInput,
    TouchableOpacity,
    KeyboardAvoidingView,
    Platform,
    Alert
} from 'react-native';
import {
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    doc,
    updateDoc,
    arrayRemove,
    getDoc
} from 'firebase/firestore';
import { db, auth } from '../config/firebase';
import { COLORS } from '../theme/colors';
import { Message, Task } from '../types';
import { Ionicons } from '@expo/vector-icons';

const ChatScreen = ({ route, navigation }: any) => {
    const { taskId, title } = route.params;
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputText, setInputText] = useState('');
    const [task, setTask] = useState<Task | null>(null);
    const flatListRef = useRef<FlatList>(null);

    useEffect(() => {
        // Fetch task details for header and moderation
        const taskUnsubscribe = onSnapshot(doc(db, 'tasks', taskId), (snapshot) => {
            if (snapshot.exists()) {
                const taskData = { id: snapshot.id, ...snapshot.data() } as Task;
                setTask(taskData);

                // If user was kicked, they'll be removed from participantIds
                if (!taskData.participantIds?.includes(auth.currentUser?.uid || '')) {
                    Alert.alert('Notice', 'You are no longer a participant in this task.');
                    navigation.navigate('Main');
                }
            }
        });

        // Fetch messages
        const q = query(
            collection(db, `chats/${taskId}/messages`),
            orderBy('timestamp', 'asc')
        );

        const messagesUnsubscribe = onSnapshot(q, (snapshot) => {
            const msgs = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as Message));
            setMessages(msgs);
        });

        // Set navigation header
        navigation.setOptions({
            headerTitle: title,
            headerRight: () => (
                <TouchableOpacity onPress={handleLeave} style={{ marginRight: 15 }}>
                    <Text style={{ color: COLORS.error, fontWeight: '600' }}>Leave</Text>
                </TouchableOpacity>
            ),
        });

        return () => {
            taskUnsubscribe();
            messagesUnsubscribe();
        };
    }, [taskId]);

    const handleSendMessage = async () => {
        if (!inputText.trim()) return;

        try {
            await addDoc(collection(db, `chats/${taskId}/messages`), {
                senderId: auth.currentUser?.uid,
                senderName: auth.currentUser?.displayName || 'Anonymous',
                text: inputText,
                timestamp: Date.now(),
            });
            setInputText('');
        } catch (error) {
            console.error('Error sending message:', error);
        }
    };

    const handleLeave = () => {
        Alert.alert('Leave Task', 'Are you sure you want to leave this task chat?', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Leave',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await updateDoc(doc(db, 'tasks', taskId), {
                            participantIds: arrayRemove(auth.currentUser?.uid)
                        });
                        navigation.navigate('Main');
                    } catch (error) {
                        Alert.alert('Error', 'Failed to leave task');
                    }
                }
            },
        ]);
    };

    const handleKickUser = (userId: string, userName: string) => {
        if (auth.currentUser?.uid !== task?.ownerId) return;
        if (userId === auth.currentUser?.uid) return;

        Alert.alert('Kick Participant', `Are you sure you want to kick ${userName}?`, [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Kick',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await updateDoc(doc(db, 'tasks', taskId), {
                            participantIds: arrayRemove(userId)
                        });
                    } catch (error) {
                        Alert.alert('Error', 'Failed to kick participant');
                    }
                }
            },
        ]);
    };

    const renderMessage = ({ item }: { item: Message }) => {
        const isMe = item.senderId === auth.currentUser?.uid;
        const isOwner = auth.currentUser?.uid === task?.ownerId;

        return (
            <View style={[styles.messageRow, isMe ? styles.myRow : styles.otherRow]}>
                {!isMe && (
                    <TouchableOpacity
                        onLongPress={() => isOwner && handleKickUser(item.senderId, item.senderName)}
                        disabled={!isOwner}
                    >
                        <View style={styles.avatarSmall}>
                            <Text style={styles.avatarTextSmall}>{item.senderName.charAt(0)}</Text>
                        </View>
                    </TouchableOpacity>
                )}
                <View style={[styles.bubble, isMe ? styles.myBubble : styles.otherBubble]}>
                    {!isMe && <Text style={styles.senderName}>{item.senderName}</Text>}
                    <Text style={[styles.messageText, isMe ? styles.myMessageText : styles.otherMessageText]}>
                        {item.text}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
            <FlatList
                ref={flatListRef}
                data={messages}
                keyExtractor={(item) => item.id}
                renderItem={renderMessage}
                contentContainerStyle={styles.listContent}
                onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            />

            <View style={styles.inputContainer}>
                <TextInput
                    style={styles.input}
                    placeholder="Type a message..."
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                />
                <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
                    <Ionicons name="send" size={24} color={COLORS.white} />
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    listContent: {
        padding: 15,
    },
    messageRow: {
        flexDirection: 'row',
        marginBottom: 15,
        alignItems: 'flex-end',
    },
    myRow: {
        justifyContent: 'flex-end',
    },
    otherRow: {
        justifyContent: 'flex-start',
    },
    avatarSmall: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: COLORS.gray,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 8,
    },
    avatarTextSmall: {
        fontSize: 14,
        fontWeight: 'bold',
        color: COLORS.primary,
    },
    bubble: {
        maxWidth: '80%',
        padding: 12,
        borderRadius: 20,
    },
    myBubble: {
        backgroundColor: COLORS.primary,
        borderBottomRightRadius: 4,
    },
    otherBubble: {
        backgroundColor: COLORS.surface,
        borderBottomLeftRadius: 4,
        borderWidth: 1,
        borderColor: COLORS.gray,
    },
    senderName: {
        fontSize: 12,
        fontWeight: 'bold',
        color: COLORS.textLight,
        marginBottom: 4,
    },
    messageText: {
        fontSize: 16,
    },
    myMessageText: {
        color: COLORS.white,
    },
    otherMessageText: {
        color: COLORS.text,
    },
    inputContainer: {
        flexDirection: 'row',
        padding: 15,
        borderTopWidth: 1,
        borderTopColor: COLORS.gray,
        backgroundColor: COLORS.white,
        alignItems: 'center',
    },
    input: {
        flex: 1,
        backgroundColor: COLORS.surface,
        borderRadius: 25,
        paddingHorizontal: 20,
        paddingVertical: 10,
        fontSize: 16,
        maxHeight: 120,
    },
    sendButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: COLORS.primary,
        justifyContent: 'center',
        alignItems: 'center',
        marginLeft: 10,
    },
});

export default ChatScreen;
