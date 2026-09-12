import React, { useRef } from "react";
import { View } from "react-native";
import { Tabs } from "expo-router";
import { BottomSheetModal } from "@gorhom/bottom-sheet";
import { Bot, Users, Sliders, BarChart3 } from "lucide-react-native";
import { Header } from "@/components/common/Header";
import { SessionPickerModal } from "@/components/modals/SessionPickerModal";
import { useRecruit } from "@/context/RecruitContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic } from "@/lib/haptics";

export default function TabsLayout() {
  const sessionPickerRef = useRef<BottomSheetModal>(null);
  const { candidates } = useRecruit();

  const handleOpenSessionPicker = () => {
    sessionPickerRef.current?.present();
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      {/* Global Header with Campaign Switcher & Blind Mode Toggle */}
      <Header onOpenSessionPicker={handleOpenSessionPicker} />

      {/* 4-Tab Bottom Navigation Bar */}
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarHideOnKeyboard: true,
          tabBarActiveTintColor: COLORS.brandPrimary,
          tabBarInactiveTintColor: "#94A3B8",
          tabBarStyle: {
            backgroundColor: "#FFFFFF",
            borderTopColor: COLORS.border,
            borderTopWidth: 1,
            height: 62,
            paddingBottom: 8,
            paddingTop: 6,
            elevation: 8,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: -2 },
            shadowOpacity: 0.05,
            shadowRadius: 4,
          },
          tabBarLabelStyle: {
            fontFamily: "DMSans_500Medium",
            fontSize: 11,
            marginTop: 2,
          },
        }}
        screenListeners={{
          tabPress: () => {
            selectionHaptic();
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Co-Pilot",
            tabBarIcon: ({ color, size }) => (
              <Bot size={size || 22} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="candidates"
          options={{
            title: "Candidates",
            tabBarBadge: candidates.length > 0 ? candidates.length : undefined,
            tabBarBadgeStyle: {
              backgroundColor: COLORS.brandPrimary,
              color: "#FFFFFF",
              fontSize: 10,
              fontFamily: "DMSans_700Bold",
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              lineHeight: 16,
            },
            tabBarIcon: ({ color, size }) => (
              <Users size={size || 22} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="workspace"
          options={{
            title: "Workspace",
            tabBarIcon: ({ color, size }) => (
              <Sliders size={size || 22} color={color} />
            ),
          }}
        />

        <Tabs.Screen
          name="analytics"
          options={{
            title: "Analytics",
            tabBarIcon: ({ color, size }) => (
              <BarChart3 size={size || 22} color={color} />
            ),
          }}
        />
      </Tabs>

      {/* Global Campaign Picker Modal */}
      <SessionPickerModal ref={sessionPickerRef} />
    </View>
  );
}
