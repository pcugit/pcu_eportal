const imageUrlCache = new Map<string, string>();

export function getSessionImageUrl(key: string): string | null {
  return imageUrlCache.get(key) || null;
}

export function setSessionImageUrl(key: string, url: string) {
  const existing = imageUrlCache.get(key);
  if (existing && existing !== url) {
    URL.revokeObjectURL(existing);
  }
  imageUrlCache.set(key, url);
}

export function clearSessionImageCache() {
  imageUrlCache.forEach((url) => URL.revokeObjectURL(url));
  imageUrlCache.clear();
}
