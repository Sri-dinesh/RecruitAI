import React from "react";
import { View, Text } from "react-native";
import {
  Clock,
  UserPlus,
  Calendar,
  CheckCircle2,
  Briefcase,
  Activity,
} from "lucide-react-native";
import { COLORS } from "@/constants/theme";
import type { ActivityEvent } from "@/types/analytics";

interface ActivityFeedProps {
  activity: ActivityEvent[];
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ activity }) => {
  const formatTimeAgo = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffSec = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));

      if (diffSec < 60) return "Just now";
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `${diffMin}m ago`;
      const diffHour = Math.floor(diffMin / 60);
      if (diffHour < 24) return `${diffHour}h ago`;
      const diffDay = Math.floor(diffHour / 24);
      return `${diffDay}d ago`;
    } catch {
      return "Recently";
    }
  };

  const getEventIcon = (type: string) => {
    const t = type.toLowerCase();
    if (t.includes("interview")) {
      return { icon: Calendar, color: COLORS.statusOffer, bg: "bg-amber-50" };
    }
    if (t.includes("status") || t.includes("shortlist")) {
      return { icon: CheckCircle2, color: COLORS.statusShortlist, bg: "bg-emerald-50" };
    }
    if (t.includes("job")) {
      return { icon: Briefcase, color: "#2563EB", bg: "bg-blue-50" };
    }
    return { icon: UserPlus, color: COLORS.brandPrimary, bg: "bg-slate-100" };
  };

  return (
    <View className="bg-white border border-border rounded-[6px] p-4 mx-4 mb-4 shadow-xs">
      <View className="flex-row items-center justify-between mb-3 pb-2 border-b border-slate-100">
        <View className="flex-row items-center">
          <Activity size={15} color={COLORS.brandPrimary} />
          <Text className="font-serif-bold text-sm text-foreground ml-2">
            Live Recruitment Activity
          </Text>
        </View>
        <Text className="font-sans text-[11px] text-muted">Real-Time</Text>
      </View>

      {activity.length === 0 ? (
        <Text className="font-sans text-xs text-muted text-center py-4">
          No recent recruitment events recorded.
        </Text>
      ) : (
        <View className="gap-3">
          {activity.slice(0, 10).map((event, idx) => {
            const config = getEventIcon(event.event_type);
            const Icon = config.icon;
            const timeAgo = formatTimeAgo(event.occurred_at);

            return (
              <View key={idx} className="flex-row items-start">
                <View
                  className={`w-7 h-7 rounded-full ${config.bg} items-center justify-center mr-2.5 mt-0.5`}
                >
                  <Icon size={13} color={config.color} />
                </View>
                <View className="flex-1">
                  <Text className="font-sans-medium text-xs text-foreground leading-4">
                    {event.description}
                  </Text>
                  <View className="flex-row items-center mt-1">
                    <Clock size={10} color={COLORS.muted} />
                    <Text className="font-sans text-[10px] text-muted ml-1">
                      {timeAgo}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

export default ActivityFeed;
