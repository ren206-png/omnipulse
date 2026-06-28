import React from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text } from 'react-native'
import { useAuth } from '../context/AuthContext'
import LoginScreen from '../screens/LoginScreen'
import DashboardScreen from '../screens/DashboardScreen'
import CalendarScreen from '../screens/CalendarScreen'
import AnalyticsScreen from '../screens/AnalyticsScreen'
import InboxScreen from '../screens/InboxScreen'
import SettingsScreen from '../screens/SettingsScreen'

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

const TAB_ICONS: Record<string, string> = {
  Dashboard: '🏠', Calendar: '📅', Analytics: '📊', Inbox: '💬', Settings: '⚙️',
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.45 }}>
            {TAB_ICONS[route.name] ?? '•'}
          </Text>
        ),
        tabBarActiveTintColor: '#6366f1',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { paddingBottom: 4, height: 56 },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: '#6366f1' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700', fontSize: 18 },
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'OmniPulse' }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
      <Tab.Screen name="Inbox" component={InboxScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  )
}

export default function AppNavigator() {
  const { token, loading } = useAuth()
  if (loading) return null

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {token ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}
