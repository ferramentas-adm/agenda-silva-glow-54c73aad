# Welcome to your Lovable project

## Setup inicial — criação do gestor

A Edge Function `seed-gestor` cria o primeiro usuário com role `gestor`. Ela só funciona quando a variável de ambiente `SEED_ENABLED=true` está configurada no projeto Supabase.

**Após concluir o setup inicial, remova a variável `SEED_ENABLED` do painel do Supabase** (Settings → Edge Functions → Environment variables). Enquanto ela existir com valor `true`, qualquer pessoa com acesso ao endpoint pode criar um gestor.
