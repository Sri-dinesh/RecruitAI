import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from "react-native";
import {
  Calendar,
  Clock,
  CheckCircle2,
  Users,
  ChevronRight,
  Briefcase,
  AlertCircle,
  CalendarCheck,
} from "lucide-react-native";
import { useRecruit } from "@/context/RecruitContext";
import { COLORS } from "@/constants/theme";
import { selectionHaptic, successHaptic } from "@/lib/haptics";

interface SlotItem {
  slot_number: number;
  label: string;
  day: string;
  time: string;
}

export const SlotScheduler: React.FC = () => {
  const {
    candidates,
    jd,
    scheduledInterviews,
    bookInterview,
    isBlindHiring,
  } = useRecruit();

  // Active candidate being scheduled
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>(() => {
    return candidates[0]?.candidate_id || "";
  });

  const [bookingSlot, setBookingSlot] = useState<number | null>(null);

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
        time: "10:00 AM - 10:30 AM",
        label: `${formatDay(tomorrow)} • 10:00 AM`,
      },
      {
        slot_number: 2,
        day: formatDay(tomorrow),
        time: "02:00 PM - 02:30 PM",
        label: `${formatDay(tomorrow)} • 02:00 PM`,
      },
      {
        slot_number: 3,
        day: formatDay(tomorrow),
        time: "04:30 PM - 05:00 PM",
        label: `${formatDay(tomorrow)} • 04:30 PM`,
      },
      {
        slot_number: 4,
        day: formatDay(dayAfter),
        time: "11:00 AM - 11:30 AM",
        label: `${formatDay(dayAfter)} • 11:00 AM`,
      },
      {
        slot_number: 5,
        day: formatDay(dayAfter),
        time: "03:00 PM - 03:30 PM",
        label: `${formatDay(dayAfter)} • 03:00 PM`,
      },
    ];
  }, []);

  const handleBookSlot = (slot: SlotItem) => {
    if (!selectedCandidate) {
      Alert.alert("Select Candidate", "Please select a candidate to schedule an interview.");
      return;
    }

    selectionHaptic();

    Alert.alert(
      "Confirm Interview Slot",
      `Book 30-min interview for ${selectedCandidate.name} on ${slot.label}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Confirm Booking",
          style: "default",
          onPress: async () => {
            setBookingSlot(slot.slot_number);
            try {
              await bookInterview(selectedCandidate.name, slot.label);
              successHaptic();
              Alert.alert(
                "Interview Confirmed",
                `Interview successfully scheduled with ${selectedCandidate.name} for ${slot.label}.`
              );
            } catch (err: any) {
              Alert.alert("Booking Error", err.message || "Failed to confirm slot.");
            } finally {
              setBookingSlot(null);
            }
          },
        },
      ]
    );
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
          <View className="bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-full flex-row items-center">
            <Clock size={11} color={COLORS.brandPrimary} />
            <Text className="font-sans-bold text-[11px] text-brand-primary ml-1">
              30 Mins
            </Text>
          </View>
        </View>

        <Text className="font-sans-bold text-xs text-foreground mb-2">
          Available Time Slots:
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
                      {slot.time}
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
                      Select
                    </Text>
                    <ChevronRight size={13} color={COLORS.muted} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Confirmed Interviews List */}
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
              No interview slots confirmed yet. Select a candidate and tap an available slot above to schedule.
            </Text>
          </View>
        ) : (
          <View className="gap-2">
            {scheduledInterviews.map((item, idx) => (
              <View
                key={idx}
                className="bg-white border border-border rounded-[6px] p-3.5 flex-row items-center justify-between shadow-xs"
              >
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

                <View className="bg-emerald-50 border border-emerald-200 px-2 py-1 rounded flex-row items-center">
                  <CheckCircle2 size={12} color={COLORS.statusShortlist} />
                  <Text className="font-sans-bold text-[10px] text-emerald-800 ml-1">
                    Booked
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
};

export default SlotScheduler;
