# Architecture rules

- Derive funnel visual markers from shared helpers in `src/lib/funilDiretor.ts` so every appointment view uses identical classification rules.- Classify closer 'desfecho pendente' only via `isDesfechoPendente` in `src/lib/vendaConstants.ts` so the banner and meeting card agree.
- Use `buildFollowUpEncerramento` for closing follow-up contacts: store their amount as follow-up metadata and their date in audit details, never in accounting sale fields, to preserve manual sale reporting.
