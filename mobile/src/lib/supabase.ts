import { createClient } from "@supabase/supabase-js";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

/**
 * LargeSecureStore: An expo-secure-store adapter that transparently handles
 * values exceeding Android's 2048-byte Keystore limit by chunking them.
 */
const CHUNK_SIZE = 2000;

const LargeSecureStore = {
  async getItem(key: string): Promise<string | null> {
    try {
      // Check if chunk 0 exists
      const firstChunk = await SecureStore.getItemAsync(`${key}.0`);
      if (firstChunk !== null) {
        let fullValue = firstChunk;
        let index = 1;
        while (true) {
          const nextChunk = await SecureStore.getItemAsync(`${key}.${index}`);
          if (nextChunk === null) break;
          fullValue += nextChunk;
          index++;
        }
        return fullValue;
      }
      // Fallback to standard key lookup
      return await SecureStore.getItemAsync(key);
    } catch (error) {
      console.warn(`[LargeSecureStore] Error reading key "${key}":`, error);
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        // Clear any old chunks
        await this.removeItem(key);
        await SecureStore.setItemAsync(key, value);
      } else {
        // Clear non-chunked key first
        await SecureStore.deleteItemAsync(key).catch(() => {});
        const totalChunks = Math.ceil(value.length / CHUNK_SIZE);
        for (let i = 0; i < totalChunks; i++) {
          const chunk = value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await SecureStore.setItemAsync(`${key}.${i}`, chunk);
        }
      }
    } catch (error) {
      console.warn(`[LargeSecureStore] Error writing key "${key}":`, error);
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      await SecureStore.deleteItemAsync(key).catch(() => {});
      let index = 0;
      while (true) {
        const chunkExists = await SecureStore.getItemAsync(`${key}.${index}`);
        if (chunkExists === null) break;
        await SecureStore.deleteItemAsync(`${key}.${index}`).catch(() => {});
        index++;
      }
    } catch (error) {
      console.warn(`[LargeSecureStore] Error removing key "${key}":`, error);
    }
  },
};

const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  "https://ytskjpsaypkngzeivhko.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inl0c2tqcHNheXBrbmd6ZWl2aGtvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMxNzU5NTQsImV4cCI6MjA5ODc1MTk1NH0.nttb-5alEwM7acKqmOc_QpZ15xim_nx3aCr9VQ0Ed9Y";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: LargeSecureStore,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
