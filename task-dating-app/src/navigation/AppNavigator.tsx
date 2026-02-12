import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth, AuthProvider } from '../hooks/useAuth';
import { ActivityIndicator, View } from 'react-native';
import { COLORS } from '../theme/colors';
import { Ionicons } from '@expo/vector-icons';

// Placeholder Screens (to be implemented)
import AuthScreen from '../screens/AuthScreen';
import SwipeScreen from '../screens/SwipeScreen';
import MyTasksScreen from '../screens/MyTasksScreen';
import ProfileScreen from '../screens/ProfileScreen';
import ChatScreen from '../screens/ChatScreen';
import CreateTaskScreen from '../screens/CreateTaskScreen';
import { TouchableOpacity } from 'react-native';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const AppTabs = ({ navigation }: any) => (
    <Tab.Navigator
        screenOptions={({ route }) => ({
            tabBarIcon: ({ focused, color, size }) => {
                let iconName: any;
                if (route.name === 'Explore') iconName = focused ? 'flame' : 'flame-outline';
                else if (route.name === 'Tasks') iconName = focused ? 'chatbubbles' : 'chatbubbles-outline';
                else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';
                return <Ionicons name={iconName} size={size} color={color} />;
            },
            tabBarActiveTintColor: COLORS.primary,
            tabBarInactiveTintColor: 'gray',
        })}
    >
        <Tab.Screen
            name="Explore"
            component={SwipeScreen}
            options={{
                headerRight: () => (
                    <TouchableOpacity
                        onPress={() => navigation.navigate('CreateTask')}
                        style={{ marginRight: 15 }}
                    >
                        <Ionicons name="add-circle" size={32} color={COLORS.primary} />
                    </TouchableOpacity>
                )
            }}
        />
        <Tab.Screen name="Tasks" component={MyTasksScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
);

const RootNavigator = () => {
    const { user, loading } = useAuth();

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
            {!user ? (
                <Stack.Screen name="Auth" component={AuthScreen} />
            ) : (
                <>
                    <Stack.Screen name="Main" component={AppTabs} />
                    <Stack.Screen
                        name="Chat"
                        component={ChatScreen}
                        options={{ headerShown: true, headerTitle: 'Chat' }}
                    />
                    <Stack.Screen
                        name="CreateTask"
                        component={CreateTaskScreen}
                        options={{ headerShown: true, headerTitle: 'Create New Task' }}
                    />
                </>
            )}
        </Stack.Navigator>
    );
};

export default function AppNavigator() {
    return (
        <AuthProvider>
            <NavigationContainer>
                <RootNavigator />
            </NavigationContainer>
        </AuthProvider>
    );
}
