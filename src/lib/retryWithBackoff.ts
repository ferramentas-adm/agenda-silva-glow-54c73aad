/**
 * Retry com backoff exponencial + timeout por tentativa.
 *
 * - Timeout default: 10s por tentativa (AbortController)
 * - Backoff default: 500ms → 1s → 2s
 * - Só retenta para 502/503/504 e erros de rede/timeout
 * - Erros 4xx (cliente) NÃO são retentados
 */

export class DataCrazyUnavailableError extends Error {
  constructor(message = "Serviço temporariamente indisponível. Tente novamente em alguns instantes.") {
    super(message);
    this.name = "DataCrazyUnavailableError";
  }
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504]);

function extractStatus(err: unknown): number | null {
  if (!err || typeof err !== "object") return null;
  const e = err as Record<string, unknown>;
  // Supabase FunctionsHttpError shape
  if (typeof e.status === "number") return e.status;
  if (e.context && typeof e.context === "object") {
    const ctx = e.context as Record<string, unknown>;
    if (typeof ctx.status === "number") return ctx.status;
  }
  // Try to parse "Edge function returned 503: ..."
  if (typeof e.message === "string") {
    const m = e.message.match(/\b(5\d{2})\b/);
    if (m) return Number(m[1]);
  }
  return null;
}

function isRetryable(err: unknown): boolean {
  if (err instanceof DOMException && err.name === "AbortError") return true; // timeout
  const status = extractStatus(err);
  if (status !== null) return RETRYABLE_STATUS.has(status);
  // Network / fetch failures (no status) → retryable
  if (err instanceof TypeError) return true;
  if (err && typeof err === "object" && (err as { name?: string }).name === "TypeError") return true;
  return false;
}

export interface RetryOptions {
  /** Máximo de tentativas (incluindo a primeira). Default: 3. */
  maxAttempts?: number;
  /** Timeout por tentativa em ms. Default: 10000. */
  timeoutMs?: number;
  /** Delay inicial em ms. Default: 500. */
  initialDelayMs?: number;
  /** Multiplicador de backoff. Default: 2. */
  backoffFactor?: number;
  /** Label para logs. */
  label?: string;
}

/**
 * Executa `fn` com retry+backoff e timeout por tentativa.
 *
 * `fn` recebe um AbortSignal — repasse-o para `fetch` quando possível.
 * Para chamadas que não aceitam signal (ex: supabase.functions.invoke),
 * o timeout dispara via `Promise.race`.
 */
export async function retryWithBackoff<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    timeoutMs = 10_000,
    initialDelayMs = 500,
    backoffFactor = 2,
    label = "request",
  } = options;

  let lastErr: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const result = await Promise.race([
        fn(controller.signal),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new DOMException(`Timeout após ${timeoutMs}ms`, "AbortError"));
          });
        }),
      ]);
      clearTimeout(timeoutId);
      return result;
    } catch (err) {
      clearTimeout(timeoutId);
      lastErr = err;

      const retryable = isRetryable(err);
      const isLastAttempt = attempt === maxAttempts;

      if (!retryable || isLastAttempt) {
        if (retryable && isLastAttempt) {
          console.warn(`[retry:${label}] esgotadas ${maxAttempts} tentativas`, err);
          throw new DataCrazyUnavailableError();
        }
        throw err;
      }

      const delay = initialDelayMs * Math.pow(backoffFactor, attempt - 1);
      console.warn(`[retry:${label}] tentativa ${attempt}/${maxAttempts} falhou, retentando em ${delay}ms`, err);
      await new Promise((r) => setTimeout(r, delay));
    }
  }

  throw lastErr;
}
