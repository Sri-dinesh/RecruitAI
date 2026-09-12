import React, { createContext, useContext, useState, useCallback, useRef } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Animated,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  StyleProp,
  ViewStyle,
  TextStyle,
} from "react-native";
import {
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Info,
  Sparkles,
  X,
} from "lucide-react-native";
import { COLORS, FONTS } from "@/constants/theme";
import { successHaptic, warningHaptic, impactHaptic, selectionHaptic } from "@/lib/haptics";

export type ModalType = "success" | "error" | "warning" | "info" | "confirm" | "actions";

export interface ModalAction {
  label: string;
  onPress?: () => void | Promise<void>;
  variant?: "primary" | "destructive" | "secondary" | "cancel";
  icon?: React.ComponentType<{ size: number; color: string }>;
}

export interface ModalOptions {
  title: string;
  message?: string;
  type?: ModalType;
  actions?: ModalAction[];
  dismissable?: boolean;
}

interface ModalContextType {
  showModal: (options: ModalOptions) => void;
  hideModal: () => void;
}

const ModalContext = createContext<ModalContextType | undefined>(undefined);

// Global bridge for non-React or hook calls
let globalShowModal: ((options: ModalOptions) => void) | null = null;
let globalHideModal: (() => void) | null = null;

export const showAppModal = (options: ModalOptions) => {
  if (globalShowModal) {
    globalShowModal(options);
  } else {
    console.warn("[ModalContext] Modal provider not initialized");
  }
};

export const hideAppModal = () => {
  if (globalHideModal) {
    globalHideModal();
  }
};

function sanitizeModalMessage(msg?: string): string | undefined {
  if (!msg) return undefined;
  if (!__DEV__) {
    const lower = msg.toLowerCase();
    if (
      msg.includes("java.io.") ||
      msg.includes("ExponentFileSystem") ||
      msg.includes("CodedError") ||
      msg.includes("FormDataPartImplementation") ||
      msg.includes("Location 'file:") ||
      msg.includes("at Object.") ||
      msg.includes("at Generator.")
    ) {
      if (lower.includes("upload") || lower.includes("file") || lower.includes("document")) {
        return "Unable to process the document. Please verify the file is accessible and try again.";
      }
      return "An unexpected error occurred. Please try again or contact support if the issue persists.";
    }
  }
  return msg;
}

export const ModalProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [visible, setVisible] = useState(false);
  const [options, setOptions] = useState<ModalOptions | null>(null);
  const [loadingActionIndex, setLoadingActionIndex] = useState<number | null>(null);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  const hideModal = useCallback(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 0.92,
        duration: 150,
        useNativeDriver: true,
      }),
    ]).start(() => {
      setVisible(false);
      setOptions(null);
      setLoadingActionIndex(null);
    });
  }, [fadeAnim, scaleAnim]);

  const showModal = useCallback(
    (opts: ModalOptions) => {
      const sanitizedOpts: ModalOptions = {
        ...opts,
        message: sanitizeModalMessage(opts.message),
      };
      setOptions(sanitizedOpts);
      setVisible(true);
      setLoadingActionIndex(null);

      // Trigger suitable haptic feedback
      if (opts.type === "success") {
        successHaptic();
      } else if (opts.type === "error" || opts.type === "warning") {
        warningHaptic();
      } else {
        impactHaptic();
      }

      fadeAnim.setValue(0);
      scaleAnim.setValue(0.92);

      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 8,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start();
    },
    [fadeAnim, scaleAnim]
  );

  globalShowModal = showModal;
  globalHideModal = hideModal;

  const handleActionPress = async (action: ModalAction, index: number) => {
    selectionHaptic();
    if (action.onPress) {
      try {
        setLoadingActionIndex(index);
        await action.onPress();
      } catch (err) {
        console.error("[ModalContext] Action error:", err);
      } finally {
        setLoadingActionIndex(null);
      }
    }
    hideModal();
  };

  const renderIcon = () => {
    const type = options?.type || "info";
    switch (type) {
      case "success":
        return (
          <View style={[styles.iconCircle, { backgroundColor: "#ECFDF5", borderColor: "#A7F3D0" }]}>
            <CheckCircle2 size={24} color="#059669" />
          </View>
        );
      case "error":
        return (
          <View style={[styles.iconCircle, { backgroundColor: "#FFF1F2", borderColor: "#FECDD3" }]}>
            <AlertCircle size={24} color="#E11D48" />
          </View>
        );
      case "warning":
      case "confirm":
        return (
          <View style={[styles.iconCircle, { backgroundColor: "#FFFBEB", borderColor: "#FDE68A" }]}>
            <AlertTriangle size={24} color="#D97706" />
          </View>
        );
      case "actions":
        return (
          <View style={[styles.iconCircle, { backgroundColor: "#F0F4F8", borderColor: "#D9E2EC" }]}>
            <Sparkles size={24} color={COLORS.brandPrimary} />
          </View>
        );
      case "info":
      default:
        return (
          <View style={[styles.iconCircle, { backgroundColor: "#F0F4F8", borderColor: "#D9E2EC" }]}>
            <Info size={24} color={COLORS.brandPrimary} />
          </View>
        );
    }
  };

  // Default actions if none provided
  const actions: ModalAction[] =
    options?.actions && options.actions.length > 0
      ? options.actions
      : [{ label: "OK", variant: "primary" }];

  return (
    <ModalContext.Provider value={{ showModal, hideModal }}>
      {children}
      {visible && options && (
        <Modal
          transparent
          visible={visible}
          animationType="none"
          statusBarTranslucent
          onRequestClose={() => {
            if (options.dismissable !== false) {
              hideModal();
            }
          }}
        >
          <TouchableWithoutFeedback
            onPress={() => {
              if (options.dismissable !== false) {
                hideModal();
              }
            }}
          >
            <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
              <TouchableWithoutFeedback>
                <Animated.View
                  style={[
                    styles.card,
                    {
                      opacity: fadeAnim,
                      transform: [{ scale: scaleAnim }],
                    },
                  ]}
                >
                  {/* Top Accent Stripe */}
                  <View
                    style={[
                      styles.accentStripe,
                      {
                        backgroundColor:
                          options.type === "success"
                            ? "#059669"
                            : options.type === "error"
                            ? "#E11D48"
                            : options.type === "warning"
                            ? "#D97706"
                            : COLORS.brandPrimary,
                      },
                    ]}
                  />

                  {/* Close button if dismissable */}
                  {options.dismissable !== false && (
                    <TouchableOpacity
                      onPress={hideModal}
                      activeOpacity={0.7}
                      style={styles.closeBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <X size={16} color={COLORS.muted} />
                    </TouchableOpacity>
                  )}

                  {/* Icon Badge */}
                  <View style={styles.iconContainer}>{renderIcon()}</View>

                  {/* Title */}
                  <Text style={styles.title}>{options.title}</Text>

                  {/* Message */}
                  {options.message ? (
                    <Text style={styles.message}>{options.message}</Text>
                  ) : null}

                  {/* Action Buttons */}
                  <View style={styles.actionsContainer}>
                    {actions.map((action, index) => {
                      const isPrimary = action.variant === "primary" || (!action.variant && actions.length === 1);
                      const isDestructive = action.variant === "destructive";
                      const isCancel = action.variant === "cancel";
                      const IconComponent = action.icon;
                      const isLoading = loadingActionIndex === index;

                      let btnStyle: StyleProp<ViewStyle> = styles.btnSecondary;
                      let textStyle: StyleProp<TextStyle> = styles.btnTextSecondary;

                      if (isPrimary) {
                        btnStyle = styles.btnPrimary;
                        textStyle = styles.btnTextPrimary;
                      } else if (isDestructive) {
                        btnStyle = styles.btnDestructive;
                        textStyle = styles.btnTextDestructive;
                      } else if (isCancel) {
                        btnStyle = styles.btnCancel;
                        textStyle = styles.btnTextCancel;
                      }

                      return (
                        <TouchableOpacity
                          key={index}
                          onPress={() => handleActionPress(action, index)}
                          activeOpacity={0.8}
                          disabled={isLoading}
                          style={[styles.btnBase, btnStyle]}
                        >
                          {isLoading ? (
                            <ActivityIndicator
                              size="small"
                              color={isPrimary || isDestructive ? "#FFFFFF" : COLORS.foreground}
                            />
                          ) : (
                            <View style={styles.btnContent}>
                              {IconComponent && (
                                <View style={styles.btnIcon}>
                                  <IconComponent
                                    size={16}
                                    color={
                                      isPrimary || isDestructive
                                        ? "#FFFFFF"
                                        : isCancel
                                        ? COLORS.muted
                                        : COLORS.foreground
                                    }
                                  />
                                </View>
                              )}
                              <Text style={[styles.btnTextBase, textStyle]}>
                                {action.label}
                              </Text>
                            </View>
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </Animated.View>
              </TouchableWithoutFeedback>
            </Animated.View>
          </TouchableWithoutFeedback>
        </Modal>
      )}
    </ModalContext.Provider>
  );
};

export const useAppModal = (): ModalContextType => {
  const ctx = useContext(ModalContext);
  if (!ctx) {
    throw new Error("useAppModal must be used within a ModalProvider");
  }
  return ctx;
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(17, 24, 39, 0.65)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    paddingTop: 24,
    paddingBottom: 20,
    paddingHorizontal: 20,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    position: "relative",
    overflow: "hidden",
  },
  accentStripe: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  iconContainer: {
    marginBottom: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  iconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontFamily: FONTS.serifBold,
    fontSize: 18,
    color: COLORS.foreground,
    textAlign: "center",
    marginBottom: 8,
    paddingHorizontal: 8,
  },
  message: {
    fontFamily: FONTS.sansRegular,
    fontSize: 13,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 19,
    marginBottom: 20,
    paddingHorizontal: 6,
  },
  actionsContainer: {
    width: "100%",
    gap: 8,
  },
  btnBase: {
    width: "100%",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  btnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  btnIcon: {
    marginRight: 8,
  },
  btnTextBase: {
    fontSize: 13,
    textAlign: "center",
  },
  btnPrimary: {
    backgroundColor: COLORS.brandPrimary,
  },
  btnTextPrimary: {
    fontFamily: FONTS.sansBold,
    color: "#FFFFFF",
  },
  btnDestructive: {
    backgroundColor: "#E11D48",
  },
  btnTextDestructive: {
    fontFamily: FONTS.sansBold,
    color: "#FFFFFF",
  },
  btnSecondary: {
    backgroundColor: "#F8F6F2",
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  btnTextSecondary: {
    fontFamily: FONTS.sansMedium,
    color: COLORS.foreground,
  },
  btnCancel: {
    backgroundColor: "transparent",
    paddingVertical: 8,
  },
  btnTextCancel: {
    fontFamily: FONTS.sansMedium,
    color: COLORS.muted,
  },
});

export default ModalProvider;
