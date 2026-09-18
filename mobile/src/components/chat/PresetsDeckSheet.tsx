import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  TextInput,
  TouchableWithoutFeedback,
} from "react-native";
import {
  X,
  Search,
  Sparkles,
  ArrowRight,
  SlidersHorizontal,
} from "lucide-react-native";
import {
  PRESET_CATEGORIES,
  TOTAL_PRESETS_COUNT,
  type PresetCategory,
  type PresetPrompt,
} from "@/constants/copilotPresets";
import { selectionHaptic, impactHaptic } from "@/lib/haptics";

interface PresetsDeckSheetProps {
  visible: boolean;
  onClose: () => void;
  onSelectPrompt: (promptText: string) => void;
}

export const PresetsDeckSheet: React.FC<PresetsDeckSheetProps> = ({
  visible,
  onClose,
  onSelectPrompt,
}) => {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>("screening");
  const [searchQuery, setSearchQuery] = useState("");

  const activeCategory = useMemo(() => {
    return (
      PRESET_CATEGORIES.find((c) => c.id === selectedCategoryId) ||
      PRESET_CATEGORIES[0]
    );
  }, [selectedCategoryId]);

  const filteredPrompts = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) {
      return activeCategory.prompts;
    }
    // If searching, search across all categories
    const allPrompts: { prompt: PresetPrompt; category: PresetCategory }[] = [];
    PRESET_CATEGORIES.forEach((cat) => {
      cat.prompts.forEach((p) => {
        if (
          p.title.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.prompt.toLowerCase().includes(q)
        ) {
          allPrompts.push({ prompt: p, category: cat });
        }
      });
    });
    return allPrompts;
  }, [searchQuery, activeCategory]);

  const handlePromptPress = (promptText: string) => {
    impactHaptic();
    onSelectPrompt(promptText);
    onClose();
  };

  const isSearching = searchQuery.trim().length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-black/50 justify-end">
          <TouchableWithoutFeedback>
            <View className="bg-white rounded-t-3xl max-h-[85%] border-t border-slate-200">
              {/* Header */}
              <View className="px-5 pt-4 pb-3 border-b border-slate-100 flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <View className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 items-center justify-center mr-2.5">
                    <Sparkles size={16} color="#4338CA" />
                  </View>
                  <View>
                    <Text className="font-serif-bold text-base text-slate-900">
                      Workflow Presets Deck
                    </Text>
                    <Text className="font-sans text-[11px] text-slate-500">
                      {TOTAL_PRESETS_COUNT} one-tap recruitment prompts
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={onClose}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  className="w-8 h-8 rounded-full bg-slate-100 items-center justify-center"
                >
                  <X size={16} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Search Bar */}
              <View className="px-4 py-2.5 bg-slate-50/70 border-b border-slate-100">
                <View className="flex-row items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5">
                  <Search size={14} color="#94A3B8" />
                  <TextInput
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    placeholder="Search workflow prompts..."
                    placeholderTextColor="#94A3B8"
                    className="flex-1 ml-2 font-sans text-xs text-slate-800 p-0"
                    autoCorrect={false}
                  />
                  {searchQuery.length > 0 && (
                    <TouchableOpacity onPress={() => setSearchQuery("")}>
                      <X size={14} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>

              {/* Category Pills (Visible when not actively searching) */}
              {!isSearching && (
                <View className="border-b border-slate-100">
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 8 }}
                    className="flex-row"
                  >
                    {PRESET_CATEGORIES.map((cat) => {
                      const isActive = cat.id === selectedCategoryId;
                      const Icon = cat.icon;
                      return (
                        <TouchableOpacity
                          key={cat.id}
                          onPress={() => {
                            selectionHaptic();
                            setSelectedCategoryId(cat.id);
                          }}
                          activeOpacity={0.7}
                          className={`flex-row items-center px-3 py-1.5 rounded-full mr-2 border ${
                            isActive
                              ? "bg-indigo-600 border-indigo-600"
                              : "bg-slate-100/80 border-slate-200"
                          }`}
                        >
                          <Icon
                            size={12}
                            color={isActive ? "#FFFFFF" : "#64748B"}
                          />
                          <Text
                            className={`font-sans-bold text-xs ml-1.5 ${
                              isActive ? "text-white" : "text-slate-700"
                            }`}
                          >
                            {cat.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Prompts List */}
              <ScrollView
                contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
              >
                {!isSearching && (
                  <Text className="font-sans text-xs text-slate-500 mb-3 px-1">
                    {activeCategory.description}
                  </Text>
                )}

                {isSearching ? (
                  // Search results view
                  (filteredPrompts as { prompt: PresetPrompt; category: PresetCategory }[]).length === 0 ? (
                    <View className="py-12 items-center justify-center">
                      <SlidersHorizontal size={28} color="#94A3B8" />
                      <Text className="font-sans-medium text-xs text-slate-500 mt-2">
                        No presets matched "{searchQuery}"
                      </Text>
                    </View>
                  ) : (
                    (filteredPrompts as { prompt: PresetPrompt; category: PresetCategory }[]).map(
                      ({ prompt, category }, idx) => (
                        <TouchableOpacity
                          key={idx}
                          onPress={() => handlePromptPress(prompt.prompt)}
                          activeOpacity={0.7}
                          className="bg-white border border-slate-200 rounded-2xl p-3.5 mb-2.5 shadow-xs active:border-indigo-400 active:bg-indigo-50/20"
                        >
                          <View className="flex-row items-center justify-between mb-1">
                            <Text className="font-sans-bold text-xs text-slate-900 flex-1 mr-2">
                              {prompt.title}
                            </Text>
                            <View className="px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200">
                              <Text className="font-sans-bold text-[9px] text-slate-600">
                                {category.label}
                              </Text>
                            </View>
                          </View>
                          <Text className="font-sans text-[11px] text-slate-600 leading-4">
                            {prompt.description}
                          </Text>
                          <View className="flex-row items-center justify-end mt-2">
                            <Text className="font-sans-bold text-[10px] text-indigo-700 mr-1">
                              Use Prompt
                            </Text>
                            <ArrowRight size={11} color="#4338CA" />
                          </View>
                        </TouchableOpacity>
                      )
                    )
                  )
                ) : (
                  // Normal category view
                  (filteredPrompts as PresetPrompt[]).map((prompt, idx) => (
                    <TouchableOpacity
                      key={idx}
                      onPress={() => handlePromptPress(prompt.prompt)}
                      activeOpacity={0.7}
                      className="bg-white border border-slate-200 rounded-2xl p-3.5 mb-2.5 shadow-xs active:border-indigo-400 active:bg-indigo-50/20"
                    >
                      <View className="flex-row items-center justify-between mb-1">
                        <Text className="font-sans-bold text-xs text-slate-900 flex-1 mr-2">
                          {prompt.title}
                        </Text>
                        {prompt.shortLabel ? (
                          <View className="px-2 py-0.5 rounded-full bg-indigo-50 border border-indigo-200">
                            <Text className="font-sans-bold text-[9px] text-indigo-700">
                              {prompt.shortLabel}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text className="font-sans text-[11px] text-slate-600 leading-4">
                        {prompt.description}
                      </Text>
                      <View className="flex-row items-center justify-end mt-2">
                        <Text className="font-sans-bold text-[10px] text-indigo-700 mr-1">
                          Use Prompt
                        </Text>
                        <ArrowRight size={11} color="#4338CA" />
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
};
