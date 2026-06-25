# Call Mode — enregistrement des conversations (parole)

Demande: "dans le call mode on puisse également enregistrer les conversations (parole)".

## État vérifié (2026-06-25)
- L'enregistrement audio Twilio est DÉJÀ codé mais éteint derrière le flag global
  `VOICE_RECORDING_ENABLED` (twilio.ts:402/488, agent-twiml/route.ts:77). All-or-nothing,
  aucun contrôle UI, aucune granularité workspace.
- Disclosure obligatoire en zone bipartite (CH/FR — art. 179bis pénal): jouée seulement
  quand `requiresConsent && VOICE_RECORDING_ENABLED==='true'`.
- Webhook `recording-status` écrit `recordingUrl`/`recordingDurationSec` + déclenche post-process. OK.
- Purge rétention 90j (recording-retention.ts). OK.
- `GET /api/calls/[id]` pointe vers `/api/calls/[id]/recording` qui **N'EXISTE PAS** → lecture cassée.
- `settings/recording` + `tenants.settings.recordingEnabled` = bot Recall (visio), PAS l'appel.

## Décision
Gate à deux couches, disclosure non négociable en zone bipartite:
1. Déploiement: `VOICE_RECORDING_ENABLED === 'true'` (inchangé — kill-switch conformité).
2. Workspace: `tenants.settings.callRecordingEnabled === true` (NOUVEAU, défaut off, jsonb, pas de migration).
3. Si zone bipartite ET pas de `VOICE_DISCLOSURE_AUDIO_URL` → on NE PAS enregistrer (fail-safe légal).

Source unique de vérité: `lib/voice/recording-policy.ts::resolveCallRecording()`.

## Tâches — TOUTES FAITES (2026-06-25), tsc+tests verts
- [x] `lib/voice/recording-policy.ts` + test (6 cas, matrice de décision)
- [x] `twilio.ts` buildTwiml/buildAgentTwiml: param explicite `record` (découplé de l'env) + maj test
- [x] `agent-twiml/route.ts`: charge settings tenant → décision → record+disclosure + stamp recordingConsent
- [x] `twiml/route.ts`: même décision (chemin server-placed)
- [x] `start/route.ts`: décision → recordingConsent à l'insert + renvoie `recording: boolean`
- [x] `tenant-settings.ts`: `callRecordingEnabled?: boolean`
- [x] `config/route.ts`: renvoie `recording: { available, enabled, disclosureConfigured }`
- [x] `POST /api/calls/recording-setting`: toggle workspace + test (3 cas)
- [x] `GET /api/calls/[id]/recording`: proxy tenant-scoped (basic auth Twilio, Range) + test (6 cas)
- [x] Call Mode UI: toggle header + indicateur "REC" live + player `<audio>` dans le debrief
- [x] Docs conformité 07/10/11 + .env.example

## Reste à activer (ops, hors code)
- Poser `VOICE_RECORDING_ENABLED=true` côté déploiement (Vercel env).
- Poser `VOICE_DISCLOSURE_AUDIO_URL` (MP3 d'annonce FR) — SANS lui, les appels CH/FR ne s'enregistrent pas.
- Puis flipper le toggle "Enregistrer" dans le call mode (par workspace).

## Vérif live non faite (Twilio/navigateur requis)
tsc (web) propre sur tous mes fichiers; 1 erreur préexistante hors-périmètre
(`contacts/__tests__/route-companyid.test.ts`, SQLWrapper). Worker tsc préexistant (ioredis dual-version).
Lint non fonctionnel dans le repo (`next lint` sans config eslint → prompt interactif).
