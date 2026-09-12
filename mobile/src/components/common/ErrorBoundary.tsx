import React, { Component, ErrorInfo, ReactNode } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import { AlertCircle, RotateCcw } from "lucide-react-native";
import { COLORS } from "@/constants/theme";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (__DEV__) {
      console.error("[ErrorBoundary] Caught unhandled component error:", error, errorInfo);
    }
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <View className="flex-1 bg-[#F8F6F2] items-center justify-center p-6">
          <View className="w-12 h-12 rounded-full bg-rose-100 items-center justify-center mb-4">
            <AlertCircle size={24} color={COLORS.statusReject} />
          </View>
          <Text className="font-serif-bold text-lg text-foreground text-center">
            Something went wrong
          </Text>
          <Text className="font-sans text-xs text-muted text-center mt-1.5 mb-6 px-4 leading-relaxed">
            An unexpected error occurred while rendering this view. Your session and candidates data are safely preserved.
          </Text>

          {__DEV__ && this.state.error && (
            <View className="bg-white border border-border rounded-[6px] p-3 mb-6 w-full max-h-32">
              <ScrollView>
                <Text className="font-mono text-[11px] text-rose-800">
                  {this.state.error.message || String(this.state.error)}
                </Text>
              </ScrollView>
            </View>
          )}

          <TouchableOpacity
            onPress={this.handleReset}
            activeOpacity={0.8}
            className="flex-row items-center bg-brand-primary px-5 py-2.5 rounded-[6px]"
          >
            <RotateCcw size={14} color="#FFFFFF" />
            <Text className="font-sans-bold text-xs text-white ml-2">
              Try Again
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
