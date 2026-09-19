import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as WebBrowser from "expo-web-browser";
import * as Clipboard from "expo-clipboard";
import { showAppModal } from "@/context/ModalContext";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Users,
  ChevronRight,
  Briefcase,
  AlertCircle,
  CalendarCheck,
  Video,
  ExternalLink,
  Copy,
  Check,
  Plus,
  Trash2,
  X,
  Sparkles,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { ScheduledInterview } from "@/types/schema";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, successHaptic, warningHaptic, impactHaptic } from "@/lib/haptics";

interface SlotItem {
  slot_number: number;
  label: string;
  day: string;
  time: string;
}

const INTERVIEW_MODES = [
  { key: "Technical Architecture", label: "Tech Architecture", color: "bg-indigo-50 border-indigo-200 text-brand-primary" },
  { key: "System Design", label: "System Design", color: "bg-purple-50 border-purple-200 text-purple-700" },
  { key: "Coding Pairing", label: "Coding Pair", color: "bg-cyan-50 border-cyan-200 text-cyan-800" },
  { key: "HR Screening", label: "HR Screen", color: "bg-emerald-50 border-emerald-200 text-emerald-800" },
  { key: "Culture & Leadership", label: "Culture Fit", color: "bg-amber-50 border-amber-200 text-amber-800" },
];

export const SlotScheduler: React.FC = () => {
  const {
    candidates,
    jd,
    scheduledInterviews,
    bookInterview,
    cancelInterview,
    isBlindHiring,
  } = useRecruit();

  // Active candidate being scheduled
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(() => {
    return candidates[0]?.candidate_id || "";
  });

  const [selectedMode, setSelectedMode] = useState<string>("Technical Architecture");
  const [bookingSlot, setBookingSlot] = useState<number | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Custom Slot Modal state
  const [customModalVisible, setCustomModalVisible] = useState(false);
  const [customSlotDate, setCustomSlotDate] = useState("");
  const [customSlotTime, setCustomSlotTime] = useState("");
  const [customMeetingUrl, setCustomMeetingUrl] = useState("");
  const [customMode, setCustomMode] = useState("Technical Architecture");
  const [isSubmittingCustom, setIsSubmittingCustom] = useState(false);

  const selectedCandidate = useMemo(() => {
    return (
      candidates.find((c) => c.candidate_id === selectedCandidateId) ||
      candidates[0] ||
      null
    );
  }, [candidates, selectedCandidateId]);

  // Generate dynamic upcoming interview slots
  const availableSlots: SlotItem[] = useMemo(() => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const dayAfter = new Date(today);
    dayAfter.setDate(today.getDate() + 2);

    const formatDay = (d: Date) =>
      d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

    return [
      {
        slot_number: 1,
        day: formatDay(tomorrow),
        time: "10:00 AM - 10:45 AM",
        label: `${formatDay(tomorrow)} • 10:00 AM`,
      },
      {
        slot_number: 2,
        day: formatDay(tomorrow),
        time: "02:00 PM - 02:45 PM",
        label: `${formatDay(tomorrow)} • 02:00 PM`,
      },
      {
        slot_number: 3,
        day: formatDay(tomorrow),
        time: "04:30 PM - 05:15 PM",
        label: `${formatDay(tomorrow)} • 04:30 PM`,
      },
      {
        slot_number: 4,
        day: formatDay(dayAfter),
        time: "11:00 AM - 11:45 AM",
        label: `${formatDay(dayAfter)} • 11:00 AM`,
      },
      {
        slot_number: 5,
        day: formatDay(dayAfter),
        time: "03:00 PM - 03:45 PM",
        label: `${formatDay(dayAfter)} • 03:00 PM`,
      },
    ];
  }, []);

  const handleBookSlot = (slot: SlotItem) => {
    if (!selectedCandidate) {
      showAppModal({
        title: "Select Candidate",
        message: "Please select a candidate to schedule an interview.",
        type: "info",
      });
      return;
    }

    selectionHaptic();

    showAppModal({
      title: "Confirm Interview Slot",
      message: `Book 45-min "${selectedMode}" interview for ${selectedCandidate.name} on ${slot.label}?`,
      type: "confirm",
      actions: [
        {
          label: "Confirm Booking",
          variant: "primary",
          onPress: async () => {
            setBookingSlot(slot.slot_number);
            try {
              await bookInterview(
                selectedCandidate.name,
                slot.label,
                selectedCandidate.candidate_id,
                selectedMode
              );
              showAppModal({
                title: "Interview Confirmed",
                message: `Interview successfully scheduled with ${selectedCandidate.name} for ${slot.label}.`,
                type: "success",
              });
            } catch (err: any) {
              showAppModal({
                title: "Booking Error",
                message: err.message || "Failed to confirm slot.",
                type: "error",
              });
            } finally {
              setBookingSlot(null);
            }
          },
        },
        {
          label: "Cancel",
          variant: "cancel",
        },
      ],
    });
  };

  const handleOpenCustomModal = () => {
    selectionHaptic();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dayStr = tomorrow.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    setCustomSlotDate(dayStr);
    setCustomSlotTime("11:00 AM - 12:00 PM");
    setCustomMeetingUrl("");
    setCustomMode(selectedMode);
    setCustomModalVisible(true);
  };

  const handleSaveCustomSlot = async () => {
    if (!selectedCandidate) {
      Alert.alert("Select Candidate", "Please select a candidate first.");
      return;
    }
    if (!customSlotDate.trim() || !customSlotTime.trim()) {
      Alert.alert("Missing Details", "Please enter both slot date and time.");
      return;
    }

    impactHaptic();
    setIsSubmittingCustom(true);
    const fullSlot = `${customSlotDate.trim()} • ${customSlotTime.trim()}`;

    try {
      await bookInterview(
        selectedCandidate.name,
        fullSlot,
        selectedCandidate.candidate_id,
        customMode,
        customMeetingUrl.trim() || undefined
      );
      setCustomModalVisible(false);
      showAppModal({
        title: "Custom Slot Booked",
        message: `Successfully booked "${customMode}" interview with ${selectedCandidate.name} for ${fullSlot}.`,
        type: "success",
      });
    } catch (err: any) {
      Alert.alert("Booking Error", err.message || "Failed to book custom interview slot.");
    } finally {
      setIsSubmittingCustom(false);
    }
  };

  const handleJoinMeeting = async (link?: string) => {
    if (!link) return;
    selectionHaptic();
    try {
      await WebBrowser.openBrowserAsync(link);
    } catch (err) {
      Alert.alert("Unable to Open Link", "Could not open video room in browser.");
    }
  };

  const handleCopyLink = async (link?: string) => {
    if (!link) return;
    selectionHaptic();
    await Clipboard.setStringAsync(link);
    setCopiedLink(link);
    setTimeout(() => {
      setCopiedLink(null);
    }, 2000);
  };

  const handleCancelBooking = (item: ScheduledInterview) => {
    warningHaptic();
    showAppModal({
      title: "Cancel Interview",
      message: `Are you sure you want to cancel the scheduled interview with ${item.candidate_name} on ${item.slot}?`,
      type: "confirm",
      actions: [
        {
          label: "Keep Interview",
          variant: "cancel",
        },
        {
          label: "Yes, Cancel",
          variant: "destructive",
          onPress: async () => {
            if (cancelInterview) {
              await cancelInterview(item.candidate_name, item.slot);
            }
          },
        },
      ],
    });
  };

  const getInitials = (name?: string) => {
    if (!name) return "";
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase() + ".";
    return parts.map((p) => p.charAt(0).toUpperCase() + ".").join("");
  };

  return (
    <View className="py-2">
      {/* Candidate Selection Row */}
      {candidates.length > 0 && (
        <View className="px-4 mb-3">
          <Text className="font-sans-bold text-xs text-foreground uppercase tracking-wider mb-2">
            Select Candidate to Schedule
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
          >
            {candidates.map((c, idx) => {
              const isSelected =
                (selectedCandidate?.candidate_id || "") === c.candidate_id;
              const displayName = isBlindHiring
                ? `Candidate (${getInitials(c.name)})`
                : c.name.split(" ")[0];

              return (
                <TouchableOpacity
                  key={c.candidate_id || idx}
                  onPress={() => {
                    selectionHaptic();
                    setSelectedCandidateId(c.candidate_id);
                  }}
                  activeOpacity={0.7}
                  className={`flex-row items-center px-3 py-1.5 rounded-[6px] border ${
                    isSelected
                      ? "bg-accent border-accent"
                      : "bg-white border-border"
                  }`}
                >
                  <Text
                    className={`font-sans-bold text-xs ${
                      isSelected ? "text-white" : "text-foreground"
                    }`}
                  >
                    {displayName}
                  </Text>
                  {c.match_score !== null && c.match_score !== undefined && (
                    <Text
                      className={`font-sans text-[10px] ml-1.5 ${
                        isSelected ? "text-slate-200" : "text-muted"
                      }`}
                    >
                      {c.match_score}%
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Active Booking Header Card */}
      <View className="bg-white border border-border rounded-[6px] p-4 mx-4 mb-4 shadow-xs">
        <View className="flex-row items-center justify-between pb-3 mb-3 border-b border-slate-100">
          <View className="flex-1 mr-2">
            <Text className="font-serif-bold text-sm text-foreground">
              {selectedCandidate ? selectedCandidate.name : "No Candidate Selected"}
            </Text>
            <Text className="font-sans text-xs text-muted mt-0.5" numberOfLines={1}>
              Position: {jd?.role || "General Recruitment"}
            </Text>
          </View>
          <TouchableOpacity
            onPress={handleOpenCustomModal}
            activeOpacity={0.8}
            className="bg-slate-50 border border-border px-2.5 py-1.5 rounded-[6px] flex-row items-center"
          >
            <Plus size={11} color={COLORS.brandPrimary} />
            <Text className="font-sans-bold text-[11px] text-brand-primary ml-1">
              Custom Slot
            </Text>
          </TouchableOpacity>
        </View>

        {/* Round Mode Selector */}
        <View className="mb-3">
          <Text className="font-sans-bold text-[11px] text-muted uppercase tracking-wider mb-2">
            Interview Round Mode:
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 6 }}
          >
            {INTERVIEW_MODES.map((mode) => {
              const isActive = selectedMode === mode.key;
              return (
                <TouchableOpacity
                  key={mode.key}
                  onPress={() => {
                    selectionHaptic();
                    setSelectedMode(mode.key);
                  }}
                  activeOpacity={0.7}
                  className={`px-2.5 py-1 rounded-[4px] border ${
                    isActive
                      ? "bg-brand-primary border-brand-primary"
                      : "bg-[#F8F6F2] border-border"
                  }`}
                >
                  <Text
                    className={`font-sans-medium text-[11px] ${
                      isActive ? "text-white" : "text-foreground"
                    }`}
                  >
                    {mode.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <Text className="font-sans-bold text-xs text-foreground mb-2">
          Available Smart Slots:
        </Text>

        {/* Available Slots Tiles */}
        <View className="gap-2">
          {availableSlots.map((slot) => {
            const isBooking = bookingSlot === slot.slot_number;
            const alreadyBooked = scheduledInterviews.some(
              (si) =>
                si.slot === slot.label &&
                si.candidate_name === selectedCandidate?.name
            );

            return (
              <TouchableOpacity
                key={slot.slot_number}
                onPress={() => handleBookSlot(slot)}
                disabled={isBooking || alreadyBooked}
                activeOpacity={0.7}
                className={`flex-row items-center justify-between p-3 rounded-[6px] border ${
                  alreadyBooked
                    ? "bg-emerald-50/50 border-emerald-300"
                    : "bg-[#F8F6F2] border-border"
                }`}
              >
                <View className="flex-row items-center flex-1 mr-2">
                  <View
                    className={`w-6 h-6 rounded-full items-center justify-center mr-2.5 ${
                      alreadyBooked
                        ? "bg-emerald-600"
                        : "bg-slate-200"
                    }`}
                  >
                    <Text
                      className={`font-sans-bold text-xs ${
                        alreadyBooked ? "text-white" : "text-slate-700"
                      }`}
                    >
                      {slot.slot_number}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="font-sans-bold text-xs text-foreground">
                      {slot.day}
                    </Text>
                    <Text className="font-sans text-[11px] text-muted">
                      {slot.time} • {selectedMode}
                    </Text>
                  </View>
                </View>

                {isBooking ? (
                  <ActivityIndicator size="small" color={COLORS.brandPrimary} />
                ) : alreadyBooked ? (
                  <View className="flex-row items-center">
                    <CheckCircle2 size={15} color={COLORS.statusShortlist} />
                    <Text className="font-sans-bold text-[11px] text-emerald-800 ml-1">
                      Booked
                    </Text>
                  </View>
                ) : (
                  <View className="flex-row items-center bg-white border border-border px-2.5 py-1 rounded-[4px]">
                    <Text className="font-sans-bold text-xs text-foreground mr-1">
                      Book
                    </Text>
                    <ChevronRight size={13} color={COLORS.muted} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Confirmed Interviews List with Video Rooms */}
      <View className="px-4">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center">
            <CalendarCheck size={14} color={COLORS.statusShortlist} />
            <Text className="font-sans-bold text-xs text-foreground ml-1.5 uppercase tracking-wider">
              Confirmed Interviews ({scheduledInterviews.length})
            </Text>
          </View>
        </View>

        {scheduledInterviews.length === 0 ? (
          <View className="bg-white border border-border rounded-[6px] p-5 items-center justify-center shadow-xs">
            <Calendar size={28} color={COLORS.muted} />
            <Text className="font-sans text-xs text-muted text-center mt-2 leading-relaxed">
              No interview slots confirmed yet. Select a candidate and tap an available slot above or tap "Custom Slot" to schedule.
            </Text>
          </View>
        ) : (
          <View className="gap-2.5">
            {scheduledInterviews.map((item, idx) => {
              const meetingUrl = item.meeting_link || `https://meet.recruitai.internal/${item.candidate_name.toLowerCase().replace(/\s+/g, "-")}`;
              const isCopied = copiedLink === meetingUrl;

              return (
                <View
                  key={idx}
                  className="bg-white border border-border rounded-[6px] p-3.5 shadow-xs"
                >
                  {/* Header Row */}
                  <View className="flex-row items-center justify-between pb-2 mb-2 border-b border-slate-100">
                    <View className="flex-1 mr-2">
                      <Text className="font-serif-bold text-sm text-foreground">
                        {item.candidate_name}
                      </Text>
                      <View className="flex-row items-center mt-1">
                        <Clock size={11} color={COLORS.muted} />
                        <Text className="font-sans text-xs text-muted ml-1">
                          {item.slot}
                        </Text>
                      </View>
                    </View>

                    <View className="items-end">
                      <View className="bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                        <Text className="font-sans-bold text-[10px] text-brand-primary">
                          {item.mode || "Technical Round"}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Meeting Room Link Row */}
                  <View className="flex-row items-center justify-between bg-slate-50 border border-slate-200/80 rounded-[6px] px-2.5 py-1.5 mb-2.5">
                    <View className="flex-row items-center flex-1 mr-2">
                      <Video size={12} color={COLORS.brandPrimary} />
                      <Text
                        className="font-sans text-[11px] text-brand-primary ml-1.5 flex-1"
                        numberOfLines={1}
                      >
                        {meetingUrl}
                      </Text>
                    </View>

                    <View className="flex-row items-center gap-1.5">
                      <TouchableOpacity
                        onPress={() => handleCopyLink(meetingUrl)}
                        activeOpacity={0.7}
                        className="p-1 rounded bg-white border border-border"
                      >
                        {isCopied ? (
                          <Check size={12} color={COLORS.statusShortlist} />
                        ) : (
                          <Copy size={12} color={COLORS.muted} />
                        )}
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleJoinMeeting(meetingUrl)}
                        activeOpacity={0.7}
                        className="flex-row items-center bg-brand-primary px-2 py-1 rounded"
                      >
                        <Text className="font-sans-bold text-[10px] text-white mr-1">
                          Join Room
                        </Text>
                        <ExternalLink size={10} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Cancel / Manage Action */}
                  <View className="flex-row items-center justify-between">
                    <Text className="font-sans text-[10px] text-muted">
                      Confirmed • Calendar Invite Sent
                    </Text>

                    <TouchableOpacity
                      onPress={() => handleCancelBooking(item)}
                      activeOpacity={0.7}
                      className="flex-row items-center px-2 py-0.5 rounded"
                    >
                      <Trash2 size={11} color="#EF4444" />
                      <Text className="font-sans text-[11px] text-rose-600 ml-1">
                        Cancel Slot
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* Custom Booking Modal */}
      <Modal
        visible={customModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCustomModalVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          <View className="bg-white rounded-t-2xl p-5 border-t border-border">
            <View className="flex-row items-center justify-between pb-3 mb-4 border-b border-border">
              <View className="flex-row items-center">
                <Calendar size={18} color={COLORS.brandPrimary} />
                <Text className="font-serif-bold text-base text-foreground ml-2">
                  Book Custom Interview
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setCustomModalVisible(false)}
                activeOpacity={0.7}
                className="p-1"
              >
                <X size={20} color={COLORS.muted} />
              </TouchableOpacity>
            </View>

            <View className="mb-3">
              <Text className="font-sans-bold text-xs text-foreground mb-1">
                Candidate:
              </Text>
              <View className="bg-slate-50 border border-border rounded-[6px] p-2.5">
                <Text className="font-sans-medium text-xs text-foreground">
                  {selectedCandidate?.name || "No candidate selected"}
                </Text>
              </View>
            </View>

            <View className="mb-3">
              <Text className="font-sans-bold text-xs text-foreground mb-1">
                Round Mode:
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 6 }}
              >
                {INTERVIEW_MODES.map((mode) => (
                  <TouchableOpacity
                    key={mode.key}
                    onPress={() => setCustomMode(mode.key)}
                    className={`px-3 py-1.5 rounded-[6px] border ${
                      customMode === mode.key
                        ? "bg-brand-primary border-brand-primary"
                        : "bg-slate-50 border-border"
                    }`}
                  >
                    <Text
                      className={`font-sans-bold text-xs ${
                        customMode === mode.key ? "text-white" : "text-foreground"
                      }`}
                    >
                      {mode.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>

            <View className="mb-3">
              <Text className="font-sans-bold text-xs text-foreground mb-1">
                Date (e.g. Fri, Sep 20):
              </Text>
              <TextInput
                value={customSlotDate}
                onChangeText={setCustomSlotDate}
                placeholder="Day, Month Date"
                placeholderTextColor={COLORS.muted}
                className="bg-white border border-border rounded-[6px] p-2.5 font-sans text-xs text-foreground"
              />
            </View>

            <View className="mb-3">
              <Text className="font-sans-bold text-xs text-foreground mb-1">
                Time Window (e.g. 10:00 AM - 11:00 AM):
              </Text>
              <TextInput
                value={customSlotTime}
                onChangeText={setCustomSlotTime}
                placeholder="Start Time - End Time"
                placeholderTextColor={COLORS.muted}
                className="bg-white border border-border rounded-[6px] p-2.5 font-sans text-xs text-foreground"
              />
            </View>

            <View className="mb-5">
              <Text className="font-sans-bold text-xs text-foreground mb-1">
                Custom Video Meeting URL (Optional):
              </Text>
              <TextInput
                value={customMeetingUrl}
                onChangeText={setCustomMeetingUrl}
                placeholder="https://meet.google.com/xyz or leave blank for internal room"
                placeholderTextColor={COLORS.muted}
                autoCapitalize="none"
                keyboardType="url"
                className="bg-white border border-border rounded-[6px] p-2.5 font-sans text-xs text-foreground"
              />
            </View>

            <View className="flex-row items-center gap-3">
              <TouchableOpacity
                onPress={() => setCustomModalVisible(false)}
                className="flex-1 bg-slate-100 py-3 rounded-[6px] items-center"
              >
                <Text className="font-sans-bold text-xs text-foreground">
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSaveCustomSlot}
                disabled={isSubmittingCustom}
                className="flex-1 bg-brand-primary py-3 rounded-[6px] items-center flex-row justify-center"
              >
                {isSubmittingCustom ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CalendarCheck size={14} color="#FFFFFF" />
                    <Text className="font-sans-bold text-xs text-white ml-1.5">
                      Confirm Slot
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

export default SlotScheduler;
