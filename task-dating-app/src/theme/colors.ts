export const COLORS = {
    primary: '#FF4458', // Tinder pink/red
    secondary: '#FF6036', // Tinder orange
    accent: '#FD297B',
    background: '#FFFFFF',
    surface: '#F8F8F8',
    text: '#222222',
    textLight: '#777777',
    white: '#FFFFFF',
    black: '#000000',
    gray: '#E8E8E8',
    success: '#4CD964',
    error: '#FF3B30',
    gradient: ['#FF4458', '#FF6036'] as const,
};

export const SPACING = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
};

export const SHADOW = {
    sm: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
    },
    md: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 6,
    },
};
