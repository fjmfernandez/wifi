import { demoAdminApi } from "./demo-api";

export async function adminApi<T>(path: string, init?: RequestInit): Promise<T> {
  if (process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    return demoAdminApi<T>(path, init);
  }

  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let parsedMessage: string | undefined;
    try {
      const problem = JSON.parse(text) as {
        detail?: string;
        instance?: string;
        message?: string;
        status?: number;
        title?: string;
      };
      parsedMessage =
        problem.detail ??
        problem.message ??
        (problem.title
          ? `${problem.title}${problem.status ? ` (${problem.status})` : ""}${
              problem.instance ? ` en ${problem.instance}` : ""
            }`
          : undefined);
    } catch {
      parsedMessage = undefined;
    }
    throw new Error(parsedMessage ?? (text || `Error HTTP ${response.status}`));
  }
  return (await response.json()) as T;
}

export const inputClass =
  "h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-100";
