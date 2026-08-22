export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Error HTTP ${response.status}`);
  }
  return (await response.json()) as T;
}

export const inputClass =
  "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100";
