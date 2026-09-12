process.env.EXPO_PUBLIC_SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://mock.supabase.co';
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'mock-anon-key';

module.exports = {};


jest.mock('lucide-react-native', () => {
  return new Proxy(
    {},
    {
      get: (_target, prop) => {
        const MockIcon = () => null;
        MockIcon.displayName = `LucideIcon(${String(prop)})`;
        return MockIcon;
      },
    }
  );
});

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock-cache/',
  documentDirectory: 'file:///mock-documents/',
  writeAsStringAsync: jest.fn().mockResolvedValue(undefined),
  readAsStringAsync: jest.fn().mockResolvedValue('mock-content'),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn().mockResolvedValue({ exists: true, size: 1024 }),
  EncodingType: { UTF8: 'utf8' },
  uploadAsync: jest.fn().mockResolvedValue({
    status: 200,
    body: JSON.stringify([{ candidate_id: 'test-1', name: 'Test User' }]),
  }),
  downloadAsync: jest.fn().mockResolvedValue({
    status: 200,
    uri: 'file:///mock-cache/report.pdf',
  }),
  FileSystemUploadType: {
    BINARY_CONTENT: 0,
    MULTIPART: 1,
  },
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn().mockResolvedValue(true),
  shareAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));
