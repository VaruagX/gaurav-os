export const Platform = { OS: 'test', Version: 0 };
export const PermissionsAndroid = { PERMISSIONS: {}, RESULTS: {}, request: async () => 'granted' };
export const Linking = { canOpenURL: async () => false, openURL: async () => {} };
