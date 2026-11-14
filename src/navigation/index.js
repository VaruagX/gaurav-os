import React from 'react';
import { NavigationContainer, createNavigationContainerRef, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../theme';
import TabBar from './TabBar';
import DrawerHost from './Drawer';

import HomeScreen from '../screens/HomeScreen';
import AssistantScreen from '../screens/AssistantScreen';
import RemindersScreen from '../screens/RemindersScreen';
import CollegeScreen from '../screens/CollegeScreen';
import RoutineScreen from '../screens/RoutineScreen';
import ProgressScreen from '../screens/ProgressScreen';
import MoneyDashboardScreen from '../screens/money/MoneyDashboardScreen';
import TransactionsScreen from '../screens/money/TransactionsScreen';
import AnalyticsScreen from '../screens/money/AnalyticsScreen';
import BudgetScreen from '../screens/money/BudgetScreen';
import KhataScreen from '../screens/khata/KhataScreen';
import KhataPersonScreen from '../screens/khata/KhataPersonScreen';
import CallAssistantScreen from '../screens/CallAssistantScreen';
import TasksScreen from '../screens/TasksScreen';
import SettingsScreen from '../screens/SettingsScreen';
import VaultScreen from '../screens/VaultScreen';
import ReminderEditorScreen from '../screens/ReminderEditorScreen';
import ReminderHistoryScreen from '../screens/ReminderHistoryScreen';
import ReminderSetupScreen from '../screens/ReminderSetupScreen';
import RoutineEditorScreen from '../screens/RoutineEditorScreen';
import ModuleScreen from '../screens/personal/ModuleScreen';
import TimetableImportScreen from '../screens/college/TimetableImportScreen';
import AttendanceScreen from '../screens/college/AttendanceScreen';
import TimetableScreen from '../screens/college/TimetableScreen';
import AssignmentsScreen from '../screens/college/AssignmentsScreen';
import ExamsScreen from '../screens/college/ExamsScreen';
import SyllabusScreen from '../screens/college/SyllabusScreen';
import PracticalsScreen from '../screens/college/PracticalsScreen';
import MarksScreen from '../screens/college/MarksScreen';
import StudyPlannerScreen from '../screens/study/StudyPlannerScreen';
import FocusTimerScreen from '../screens/study/FocusTimerScreen';
import RevisionScreen from '../screens/study/RevisionScreen';
import FlashcardsScreen from '../screens/study/FlashcardsScreen';
import McqScreen from '../screens/study/McqScreen';

export const navigationRef = createNavigationContainerRef();
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function Tabs() {
  return (
    <Tab.Navigator tabBar={(p) => <TabBar {...p} />} screenOptions={{ headerShown: false }} initialRouteName="Home">
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Assistant" component={AssistantScreen} />
      <Tab.Screen name="Reminders" component={RemindersScreen} />
      <Tab.Screen name="College" component={CollegeScreen} />
      <Tab.Screen name="Routine" component={RoutineScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
    </Tab.Navigator>
  );
}

const SCREENS = {
  Tasks: TasksScreen, Expenses: MoneyDashboardScreen, ExpenseTransactions: TransactionsScreen, ExpenseAnalytics: AnalyticsScreen, ExpenseBudgets: BudgetScreen, Khata: KhataScreen, KhataPerson: KhataPersonScreen, CallAssistant: CallAssistantScreen, Settings: SettingsScreen, Vault: VaultScreen, ReminderEditor: ReminderEditorScreen, ReminderHistory: ReminderHistoryScreen,
  ReminderSetup: ReminderSetupScreen, RoutineEditor: RoutineEditorScreen, Module: ModuleScreen, Attendance: AttendanceScreen, Timetable: TimetableScreen, TimetableImport: TimetableImportScreen,
  Assignments: AssignmentsScreen, Exams: ExamsScreen, Syllabus: SyllabusScreen, Practicals: PracticalsScreen, Marks: MarksScreen,
  StudyPlanner: StudyPlannerScreen, FocusTimer: FocusTimerScreen, Revision: RevisionScreen, Flashcards: FlashcardsScreen, Mcq: McqScreen,
};

export default function Navigation({ navRef = navigationRef }) {
  const t = useTheme();
  const base = t.mode === 'dark' ? DarkTheme : DefaultTheme;
  const theme = { ...base, colors: { ...base.colors, background: t.bg, card: t.surface, text: t.text, border: t.border, primary: t.primary } };
  return (
    <NavigationContainer theme={theme} ref={navRef}>
      <DrawerHost navRef={navRef}>
      <Stack.Navigator screenOptions={{ headerShown: false, animation: 'slide_from_right', contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="Tabs" component={Tabs} />
        {Object.entries(SCREENS).map(([name, comp]) => <Stack.Screen key={name} name={name} component={comp} />)}
      </Stack.Navigator>
      </DrawerHost>
    </NavigationContainer>
  );
}
