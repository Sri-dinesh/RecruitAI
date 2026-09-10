import React, { useEffect } from "react";
import { View, Text } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { Bot } from "lucide-react-native";
import { COLORS } from "@/constants/theme";

const Dot = ({ delay }: { delay: number }) => {
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 300, easing: Easing.ease }),
          withTiming(0, { duration: 300, easing: Easing.ease })
        ),
        -1,
        true
      )
    );
  }, [delay, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View
      style={animatedStyle}
      className="w-1.5 h-1.5 rounded-full bg-slate-500 mx-0.5"
    />
  );
};

export const TypingDots: React.FC = () => {
  return (
    <View className="flex-row items-center my-2">
      <View className="w-7 h-7 rounded-full bg-[#1B2A4A] items-center justify-center mr-2 shadow-xs">
        <Bot size={14} color="#FFFFFF" />
      </View>
      <View className="bg-white border border-border px-3.5 py-2.5 rounded-[8px] flex-row items-center shadow-xs">
        <Text className="font-sans-medium text-xs text-muted mr-2">
          RecruitAI thinking
        </Text>
        <View className="flex-row items-center">
          <Dot delay={0} />
          <Dot delay={180} />
          <Dot delay={360} />
        </View>
      </View>
    </View>
  );
};

export default TypingDots;
