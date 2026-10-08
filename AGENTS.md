# Architecture rules

- Derive funnel visual markers from shared helpers in `src/lib/funilDiretor.ts` so every appointment view uses identical classification rules.- Classify closer 'desfecho pendente' only via `isDesfechoPendente` in `src/lib/vendaConstants.ts` so the banner and meeting card agree.
