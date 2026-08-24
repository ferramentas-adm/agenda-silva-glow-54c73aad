import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get('code');
    const closerId = url.searchParams.get('state');

    if (!code || !closerId) {
      return new Response('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>Erro: parâmetros inválidos</h2></body></html>', {
        status: 400, headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      });
    }

    const clientId = Deno.env.get('GOOGLE_CLIENT_ID')!;
    const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET')!;
    const redirectUri = Deno.env.get('GOOGLE_REDIRECT_URI')!;

    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Token exchange failed:', tokenData);
      return new Response('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>Erro ao autenticar com Google</h2></body></html>', {
        status: 400, headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const expiryDate = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

    // Upsert token — guarda também os escopos concedidos, para o
    // google-create-event saber se pode usar a Meet API (gravação automática).
    const { error } = await supabaseAdmin
      .from('closer_google_tokens')
      .upsert({
        closer_id: closerId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expiry: expiryDate,
        granted_scopes: typeof tokenData.scope === 'string' ? tokenData.scope : null,
      }, { onConflict: 'closer_id' });


    if (error) {
      console.error('Error saving token:', error);
      return new Response('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>Erro ao salvar token</h2></body></html>', {
        status: 500, headers: { 'Content-Type': 'text/html; charset=UTF-8' },
      });
    }

    return new Response(
      `<!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0a0a0a;color:#fff">
          <div style="text-align:center">
            <h2>✅ Google Calendar conectado!</h2>
            <p>Você pode fechar esta janela.</p>
          </div>
        </body>
      </html>`,
      { headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
    );
  } catch (error) {
    console.error('Callback error:', error);
    return new Response('<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body><h2>Erro interno</h2></body></html>', {
      status: 500, headers: { 'Content-Type': 'text/html; charset=UTF-8' },
    });
  }
});
