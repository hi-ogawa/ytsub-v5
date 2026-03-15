export const chromeStorage = {
  async get<T>(key: string): Promise<T | undefined> {
    const r = await chrome.storage.local.get(key);
    return r[key] as T | undefined;
  },
  set(items: Record<string, unknown>) {
    return chrome.storage.local.set(items);
  },
  remove(keys: string[]) {
    return chrome.storage.local.remove(keys);
  },
  queryOptions<T>(key: string) {
    return {
      queryKey: ["chrome-storage", key] as const,
      queryFn: () => chromeStorage.get<T>(key),
    };
  },
};
