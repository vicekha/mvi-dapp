import React, { useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    Image,
    Alert,
    ActivityIndicator
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { addDoc, collection } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage, auth } from '../config/firebase';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

const CreateTaskScreen = ({ navigation }: any) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [image, setImage] = useState<string | null>(null);
    const [maxParticipants, setMaxParticipants] = useState('5');
    const [date, setDate] = useState(new Date(Date.now() + 86400000)); // Default 24 hours
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [loading, setLoading] = useState(false);

    const onDateChange = (event: any, selectedDate?: Date) => {
        setShowDatePicker(false);
        if (selectedDate) {
            setDate(selectedDate);
        }
    };

    const pickImage = async () => {
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            aspect: [4, 3],
            quality: 0.8,
        });

        if (!result.canceled) {
            setImage(result.assets[0].uri);
        }
    };

    const handleCreate = async () => {
        if (!title || !description) {
            Alert.alert('Error', 'Please provide a title and description');
            return;
        }

        setLoading(true);
        try {
            let imageUrl = '';
            if (image) {
                const response = await fetch(image);
                const blob = await response.blob();
                const imageRef = ref(storage, `tasks/${Date.now()}.jpg`);
                await uploadBytes(imageRef, blob);
                imageUrl = await getDownloadURL(imageRef);
            }

            await addDoc(collection(db, 'tasks'), {
                title,
                description,
                maxParticipants: parseInt(maxParticipants) || 5,
                imageUrl,
                deadline: date.getTime(),
                ownerId: auth.currentUser?.uid,
                ownerName: auth.currentUser?.displayName || 'Anonymous',
                participantIds: [auth.currentUser?.uid],
                createdAt: Date.now(),
                status: 'active',
            });

            Alert.alert('Success', 'Task created and added to the pool!');
            navigation.goBack();
        } catch (error: any) {
            Alert.alert('Error', error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <ScrollView style={styles.container}>
            <View style={styles.content}>
                <Text style={styles.label}>Task Title</Text>
                <TextInput
                    style={styles.input}
                    placeholder="What needs to be done?"
                    value={title}
                    onChangeText={setTitle}
                />

                <Text style={styles.label}>Description</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Give some details..."
                    multiline
                    numberOfLines={4}
                    value={description}
                    onChangeText={setDescription}
                />

                <Text style={styles.label}>Task Deadline</Text>
                <TouchableOpacity style={styles.input} onPress={() => setShowDatePicker(true)}>
                    <Text style={styles.dateText}>{date.toLocaleString()}</Text>
                </TouchableOpacity>

                {showDatePicker && (
                    <DateTimePicker
                        value={date}
                        mode="datetime"
                        display="default"
                        onChange={onDateChange}
                        minimumDate={new Date()}
                    />
                )}

                <Text style={styles.label}>Available Slots</Text>
                <TextInput
                    style={styles.input}
                    placeholder="Maximum participants"
                    value={maxParticipants}
                    onChangeText={setMaxParticipants}
                    keyboardType="number-pad"
                />

                <Text style={styles.label}>Task Thumbnail</Text>
                <TouchableOpacity style={styles.imagePicker} onPress={pickImage}>
                    {image ? (
                        <Image source={{ uri: image }} style={styles.image} />
                    ) : (
                        <View style={styles.imagePlaceholder}>
                            <Ionicons name="camera" size={40} color={COLORS.textLight} />
                            <Text style={styles.imagePlaceholderText}>Add Photo</Text>
                        </View>
                    )}
                </TouchableOpacity>

                <TouchableOpacity
                    style={styles.createButton}
                    onPress={handleCreate}
                    disabled={loading}
                >
                    {loading ? (
                        <ActivityIndicator color={COLORS.white} />
                    ) : (
                        <Text style={styles.createButtonText}>Post to Pool</Text>
                    )}
                </TouchableOpacity>
            </View>
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: COLORS.background,
    },
    content: {
        padding: 20,
    },
    label: {
        fontSize: 16,
        fontWeight: 'bold',
        color: COLORS.text,
        marginBottom: 8,
        marginTop: 15,
    },
    input: {
        backgroundColor: COLORS.surface,
        padding: 15,
        borderRadius: 10,
        fontSize: 16,
        borderWidth: 1,
        borderColor: COLORS.gray,
    },
    textArea: {
        height: 120,
        textAlignVertical: 'top',
    },
    dateText: {
        fontSize: 16,
        color: COLORS.text,
    },
    imagePicker: {
        width: '100%',
        height: 200,
        borderRadius: 15,
        backgroundColor: COLORS.surface,
        borderWidth: 1,
        borderColor: COLORS.gray,
        borderStyle: 'dashed',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        marginTop: 10,
    },
    image: {
        width: '100%',
        height: '100%',
    },
    imagePlaceholder: {
        alignItems: 'center',
    },
    imagePlaceholderText: {
        color: COLORS.textLight,
        marginTop: 5,
    },
    createButton: {
        backgroundColor: COLORS.primary,
        padding: 18,
        borderRadius: 30,
        alignItems: 'center',
        marginTop: 30,
        marginBottom: 40,
    },
    createButtonText: {
        color: COLORS.white,
        fontSize: 18,
        fontWeight: 'bold',
    },
});

export default CreateTaskScreen;
