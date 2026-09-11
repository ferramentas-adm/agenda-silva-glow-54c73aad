// POST /sdr-ia-transcrever — transcrição autenticada de áudios recebidos pelo SDR IA.
// Auth: x-api-key = SDR_IA_API_KEY (verify_jwt = false).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-api-key, content-type, apikey",
};

const MAX_AUDIO_BYTES = 15 * 1024 * 1024;
const MODEL = "google/gemini-2.5-flash";
const TRANSCRIPTION_PROMPT =
  "Transcreva este áudio em português do Brasil, literalmente, sem comentários e sem cabeçalho. Se estiver inaudível, responda só: [inaudível]";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  const compact = normalized.replace(/\s/g, "");
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error("base64_invalido");
  }
  if (Math.floor((compact.length * 3) / 4) > MAX_AUDIO_BYTES) {
    throw new Error("audio_muito_grande");
  }

  const binary = atob(compact);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function downloadAudio(url: string): Promise<Uint8Array> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("url_invalida");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("url_invalida");
  }

  const response = await fetch(parsed);
  if (!response.ok) throw new Error(`falha_download: HTTP ${response.status}`);

  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (declaredLength > MAX_AUDIO_BYTES) throw new Error("audio_muito_grande");
  if (!response.body) throw new Error("audio_vazio");

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    total += chunk.value.byteLength;
    if (total > MAX_AUDIO_BYTES) {
      await reader.cancel("audio_muito_grande");
      throw new Error("audio_muito_grande");
    }
    chunks.push(chunk.value);
  }
  if (total === 0) throw new Error("audio_vazio");

  const audio = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return audio;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 32_768;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function readGatewayStream(response: Response): Promise<string> {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let text = "";

  while (true) {
    const chunk = await reader.read();
    pending += decoder.decode(chunk.value, { stream: !chunk.done });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";

    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const event = JSON.parse(data);
        const content = event?.choices?.[0]?.delta?.content;
        if (typeof content === "string") text += content;
      } catch {
        // Ignora apenas eventos SSE auxiliares; erros HTTP são tratados antes.
      }
    }
    if (chunk.done) break;
  }
  return text.trim();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ erro: "method_not_allowed" }, 405);

  const expected = Deno.env.get("SDR_IA_API_KEY");
  if (!expected || req.headers.get("x-api-key") !== expected) {
    return json({ erro: "unauthorized" }, 401);
  }

  const payload = await req.json().catch(() => null);
  const url = typeof payload?.url === "string" && payload.url.trim() ? payload.url.trim() : null;
  const base64 = typeof payload?.base64 === "string" && payload.base64.trim() ? payload.base64.trim() : null;
  const mime = typeof payload?.mime === "string" ? payload.mime.split(";")[0].trim().toLowerCase() : "";

  if ((!url && !base64) || !mime.startsWith("audio/")) {
    return json({ erro: "payload_invalido", mensagem: "Informe url ou base64 e um mime de áudio." }, 400);
  }

  let audio: Uint8Array;
  try {
    audio = base64 ? decodeBase64(base64) : await downloadAudio(url ?? "");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = message === "audio_muito_grande" ? 413 : 400;
    return json({ erro: message }, status);
  }

  if (audio.byteLength === 0) return json({ erro: "audio_vazio" }, 400);

  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!lovableApiKey) {
    return json({ erro: "gateway_falhou", mensagem: "LOVABLE_API_KEY não configurada." }, 502);
  }

  try {
    const gatewayResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": lovableApiKey,
        "X-Lovable-AIG-SDK": "fetch",
      },
      body: JSON.stringify({
        model: MODEL,
        stream: true,
        messages: [{
          role: "user",
          content: [
            { type: "text", text: TRANSCRIPTION_PROMPT },
            {
              type: "input_audio",
              input_audio: { data: bytesToBase64(audio), format: mime.slice("audio/".length) },
            },
          ],
        }],
      }),
    });

    if (!gatewayResponse.ok) {
      const message = await gatewayResponse.text().catch(() => "");
      const gatewayStatus = gatewayResponse.status;
      if (gatewayStatus === 402 || gatewayStatus === 403 || gatewayStatus === 429) {
        return json({ erro: "gateway_falhou", mensagem: message || `HTTP ${gatewayStatus}` }, gatewayStatus);
      }
      return json({ erro: "gateway_falhou", mensagem: message || `HTTP ${gatewayStatus}` }, 502);
    }

    const texto = await readGatewayStream(gatewayResponse);
    if (!texto) return json({ erro: "nao_foi_possivel_transcrever" }, 422);
    return json({ texto, modelo: MODEL });
  } catch (error) {
    console.error("sdr-ia-transcrever gateway error", error);
    return json({
      erro: "gateway_falhou",
      mensagem: error instanceof Error ? error.message : String(error),
    }, 502);
  }
});