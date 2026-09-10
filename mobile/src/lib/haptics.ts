import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export const selectionHaptic = async () => {
  if (Platform.OS === "web") return;
  try {
    await Haptics.selectionAsync();
  } catch {}
};

export const successHaptic = async () => {
  if (Platform.OS === "web") return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {}
};

export const warningHaptic = async () => {
  if (Platform.OS === "web") return;
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {}
};

export const impactHaptic = async (style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) => {
  if (Platform.OS === "web") return;
  try {
    await Haptics.impactAsync(style);
  } catch {}
};
