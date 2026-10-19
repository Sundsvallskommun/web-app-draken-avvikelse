export const apiURL = (...parts: string[]): string => {
  const urlParts = [process.env.NEXT_PUBLIC_API_URL, ...parts];
  return urlParts.map((pathPart) => (pathPart ?? '').replace(/(^\/|\/$)/g, '')).join('/');
};
