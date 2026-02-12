export interface Task {
    id: string;
    title: string;
    description: string;
    imageUrl?: string;
    deadline: number; // timestamp
    ownerId: string;
    ownerName: string;
    participantIds: string[];
    maxParticipants: number;
    createdAt: number;
    status: 'active' | 'expired';
}

export interface UserProfile {
    uid: string;
    displayName: string;
    photoURL?: string;
    showProfileInChat: boolean;
    email: string;
}

export interface Message {
    id: string;
    senderId: string;
    senderName: string;
    text: string;
    timestamp: number;
}
