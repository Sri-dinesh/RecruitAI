import React, { forwardRef, useMemo, useCallback } from "react";
import { View, Text, TouchableOpacity, Alert } from "react-native";
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetBackdrop,
} from "@gorhom/bottom-sheet";
import {
  Briefcase,
  Sparkles,
  Users,
  Trash2,
  CheckCircle2,
  Calendar,
  LogOut,
  User,
  ShieldCheck,
  ExternalLink,
} from "lucide-react-native";
import * as WebBrowser from "expo-web-browser";
import { useRecruit } from "@/context/RecruitContext";
import { useAuth } from "@/context/AuthContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, impactHaptic } from "@/lib/haptics";

export interface SessionPickerModalProps {
  onClose?: () => void;
}

export const SessionPickerModal = forwardRef<
  BottomSheetModal,
  SessionPickerModalProps
>(({ onClose }, ref) => {
  const { user, logout } = useAuth();
  const {
    sessions,
    activeSessionId,
    candidates,
    selectSession,
    createSession,
    deleteSession,
  } = useRecruit();

  const snapPoints = useMemo(() => ["55%", "85%"], []);

  const renderBackdrop = useCallback(
    (props: any) => (
      <BottomSheetBackdrop
        {...props}
        disappearsOnIndex={-1}
        appearsOnIndex={0}
        opacity={0.4}
        pressBehavior="close"
      />
    ),
    []
  );

  const handleSelectSession = (sessionId: string) => {
    selectionHaptic();
    selectSession(sessionId);
    // @ts-ignore
    ref?.current?.dismiss();
    onClose?.();
  };

  const handleCreateSession = async () => {
    impactHaptic();
    await createSession();
    // @ts-ignore
    ref?.current?.dismiss();
    onClose?.();
  };

  const handleDeleteSession = (sessionId: string, title: string) => {
    impactHaptic();
    Alert.alert(
      "Delete Campaign",
      `Are you sure you want to permanently delete "${title}"?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            await deleteSession(sessionId);
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    impactHaptic();
    Alert.alert("Sign Out", "Are you sure you want to sign out of RecruitAI?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Sign Out",
        style: "destructive",
        onPress: async () => {
          // @ts-ignore
          ref?.current?.dismiss();
          await logout();
        },
      },
    ]);
  };

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={snapPoints}
      backdropComponent={renderBackdrop}
      enablePanDownToClose
      backgroundStyle={{
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
      }}
      handleIndicatorStyle={{
        backgroundColor: "#D1D5DB",
        width: 44,
        height: 4,
      }}
    >
      <BottomSheetView className="flex-1 px-4 pt-1 pb-4">
        {/* Modal Header */}
        <View className="flex-row items-center justify-between pb-3 border-b border-border">
          <View>
            <Text className="font-serif-bold text-lg text-foreground">
              Campaign Sessions
            </Text>
            <Text className="font-sans text-xs text-muted mt-0.5">
              {sessions.length} active hiring workspace
              {sessions.length === 1 ? "" : "s"}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleCreateSession}
            activeOpacity={0.8}
            className="bg-accent px-3 py-1.5 rounded-[6px] flex-row items-center shadow-xs"
          >
            <Sparkles size={12} color="#FFFFFF" />
            <Text className="font-sans-bold text-xs text-white ml-1.5">
              New Campaign
            </Text>
          </TouchableOpacity>
        </View>

        {/* Scrollable Sessions List */}
        <BottomSheetScrollView
          contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
        >
          {sessions.length === 0 ? (
            <View className="py-8 items-center justify-center">
              <Briefcase size={32} color={COLORS.muted} />
              <Text className="font-sans text-sm text-muted mt-2">
                No active hiring campaigns yet.
              </Text>
            </View>
          ) : (
            sessions.map((s) => {
              const isActive = s.id === activeSessionId;
              const formattedDate = s.created_at
                ? new Date(s.created_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                : "Active";

              return (
                <TouchableOpacity
                  key={s.id}
                  onPress={() => handleSelectSession(s.id)}
                  activeOpacity={0.7}
                  className={`p-3.5 mb-2 rounded-[6px] border flex-row items-center justify-between ${
                    isActive
                      ? "bg-slate-50 border-accent shadow-xs"
                      : "bg-white border-border"
                  }`}
                >
                  <View className="flex-1 mr-3">
                    <View className="flex-row items-center">
                      <Text
                        className={`font-sans-bold text-sm ${
                          isActive ? "text-accent" : "text-foreground"
                        }`}
                        numberOfLines={1}
                      >
                        {s.title || "Untitled Campaign"}
                      </Text>
                      {isActive && (
                        <View className="bg-accent/10 px-1.5 py-0.5 rounded-[4px] ml-2">
                          <Text className="font-sans-bold text-[10px] text-accent">
                            Current
                          </Text>
                        </View>
                      )}
                    </View>

                    {(() => {
                      const candCount =
                        isActive && candidates?.length > 0
                          ? candidates.length
                          : ((s as any).candidate_count ?? s.resumes?.length ?? 0);
                      return (
                        <View className="flex-row items-center mt-1 space-x-3">
                          <View className="flex-row items-center">
                            <Users size={11} color={COLORS.muted} />
                            <Text className="font-sans text-xs text-muted ml-1">
                              {candCount} candidate{candCount === 1 ? "" : "s"}
                            </Text>
                          </View>
                          <Text className="font-sans text-xs text-slate-300 mx-1">
                            •
                          </Text>
                          <View className="flex-row items-center">
                            <Calendar size={11} color={COLORS.muted} />
                            <Text className="font-sans text-xs text-muted ml-1">
                              {formattedDate}
                            </Text>
                          </View>
                        </View>
                      );
                    })()}
                  </View>

                  {/* Actions */}
                  <View className="flex-row items-center space-x-1">
                    {isActive ? (
                      <CheckCircle2 size={18} color={COLORS.brandPrimary} />
                    ) : (
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleDeleteSession(s.id, s.title);
                        }}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        className="p-1.5 rounded-full"
                      >
                        <Trash2 size={15} color={COLORS.muted} />
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })
          )}
        </BottomSheetScrollView>

        {/* Legal, Privacy & Compliance Section */}
        <View className="py-2.5 px-1 border-t border-border mt-1">
          <View className="flex-row items-center justify-between mb-2">
            <View className="flex-row items-center">
              <ShieldCheck size={12} color={COLORS.brandPrimary} />
              <Text className="font-sans-bold text-[10px] text-muted uppercase tracking-wider ml-1">
                Legal & Compliance
              </Text>
            </View>
            <Text className="font-sans text-[10px] text-muted">RecruitAI v1.0.0</Text>
          </View>
          <View className="flex-row flex-wrap items-center gap-x-3 gap-y-1">
            <TouchableOpacity
              onPress={() => WebBrowser.openBrowserAsync("https://recruitaiofficial.vercel.app/privacy")}
              activeOpacity={0.7}
            >
              <Text className="font-sans text-[11px] text-brand-primary underline">
                Privacy Policy
              </Text>
            </TouchableOpacity>
            <Text className="text-slate-300 text-[11px]">•</Text>
            <TouchableOpacity
              onPress={() => WebBrowser.openBrowserAsync("https://recruitaiofficial.vercel.app/terms")}
              activeOpacity={0.7}
            >
              <Text className="font-sans text-[11px] text-brand-primary underline">
                Terms
              </Text>
            </TouchableOpacity>
            <Text className="text-slate-300 text-[11px]">•</Text>
            <TouchableOpacity
              onPress={() => WebBrowser.openBrowserAsync("https://recruitaiofficial.vercel.app/support")}
              activeOpacity={0.7}
            >
              <Text className="font-sans text-[11px] text-brand-primary underline">
                Support
              </Text>
            </TouchableOpacity>
            <Text className="text-slate-300 text-[11px]">•</Text>
            <TouchableOpacity
              onPress={() => WebBrowser.openBrowserAsync("https://recruitaiofficial.vercel.app/data-deletion")}
              activeOpacity={0.7}
            >
              <Text className="font-sans text-[11px] text-rose-600 underline">
                Data Deletion
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* User Profile & Sign Out Footer */}
        <View className="pt-3 border-t border-border mt-auto">
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center flex-1 mr-2">
              <View className="w-8 h-8 rounded-full bg-slate-100 border border-border items-center justify-center">
                <User size={14} color={COLORS.muted} />
              </View>
              <View className="ml-2 flex-1">
                <Text
                  className="font-sans-bold text-xs text-foreground"
                  numberOfLines={1}
                >
                  {user?.user_metadata?.full_name || "Recruiter"}
                </Text>
                <Text
                  className="font-sans text-[11px] text-muted"
                  numberOfLines={1}
                >
                  {user?.email}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={handleSignOut}
              activeOpacity={0.7}
              className="bg-rose-50 border border-rose-200 px-3 py-1.5 rounded-[6px] flex-row items-center"
            >
              <LogOut size={12} color={COLORS.statusReject} />
              <Text className="font-sans-bold text-xs text-rose-700 ml-1">
                Sign Out
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </BottomSheetView>
    </BottomSheetModal>
  );
});

SessionPickerModal.displayName = "SessionPickerModal";

export default SessionPickerModal;
