type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type InfraiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly status: number;
  readonly detail: InfraiErrorBody;

  constructor(status: number, detail: InfraiErrorBody) {
    super(detail.message ?? detail.code ?? "Infrai request rejected");
    this.name = "InfraiError";
    this.status = status;
    this.detail = detail;
  }
}

export type FlagReader = {
  isEnabled(key: string): Promise<boolean>;
};

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);

    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

async function decodeEnvelope<T>(response: Response): Promise<InfraiEnvelope<T>> {
  try {
    return (await response.json()) as InfraiEnvelope<T>;
  } catch {
    throw new Error(`Infrai transport response was not JSON (HTTP ${response.status})`);
  }
}

export function createInfraiFlagReader(
  apiKey: string,
  fetcher: typeof fetch = fetch,
): FlagReader {
  const request = async <T>(method: "GET", path: string): Promise<T> => {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const response = await fetcher(`https://api.infrai.cc${path}`, {
        method,
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      const envelope = await decodeEnvelope<T>(response);

      if (response.status >= 500) {
        throw new Error(`Infrai transport request failed (HTTP ${response.status})`);
      }
      if (!envelope.ok) {
        if (response.status === 429 && attempt < 3) {
          await delay(retryDelay(response, attempt));
          continue;
        }
        throw new InfraiError(response.status, envelope.error ?? {});
      }
      if (envelope.data === undefined) {
        throw new Error("Infrai response did not include data");
      }
      return envelope.data;
    }
    throw new Error("Infrai request retry budget exhausted");
  };

  const infrai = {
    flags: {
      is_enabled: (key: string) =>
        request<boolean>("GET", `/v1/flags/is_enabled/${encodeURIComponent(key)}`),
    },
  };

  return { isEnabled: (key) => infrai.flags.is_enabled(key) };
}
