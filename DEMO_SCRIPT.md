# LeadSens Demo Script — Validated 2026-04-05

**Durée** : 3-5 min
**Pré-requis** : Compte connecté avec Google OAuth (pour email sync + calendar)
**Résolution** : 1440px, dark mode recommandé

---

## FLOW 1 — Construction du TAM en temps réel (1:00)

### Setup
Aller dans Settings → ICP & Product. Montrer l'ICP déjà configuré :
- Product: "AI-powered GTM engine for B2B SaaS founders"
- Sales motion: Founder-led sales
- Industries: Computer Software, IT Services

### Action
Revenir sur Accounts → montrer que le TAM a été construit automatiquement.

### Ce que l'écran montre
- **28 comptes** (8 manuels + 20 TAM)
- Tab "TAM (20)" avec des **vraies entreprises françaises** validées par Apollo :
  - **Livestorm** (livestorm.co) — IT Services, 101-200, $10M-$50M
  - **Spendesk** (spendesk.com) — IT Services, 201-500, $50M-$100M
  - **Axonaut** (axonaut.com) — IT Services, 21-50, $1M-$10M
  - **Crisp** (crisp.chat) — Professional Training, 101-200, $1M-$10M
  - **Slite** (slite.com) — IT Services, 21-50, $1M-$10M
  - **Sinch Mailjet** (mailjet.com) — IT Services, 21-50, $10M-$50M
  - **Ringover France** (ringover.com) — IT Services, 201-500, $50M-$100M
  - **Agorapulse** (agorapulse.com) — IT Services, 201-500, $10M-$50M
- Chaque compte a : industrie, taille, revenu, lien LinkedIn, domaine
- Badges "TAM" violets sur chaque entreprise

### Talking point
> "J'ai défini mon ICP — SaaS B2B en France, 10-200 employés. LeadSens a interrogé Apollo, généré 120 candidats, et validé 20 entreprises avec des données réelles : taille, revenu, industrie, LinkedIn. Pas du scraping approximatif — des données vérifiées."

### Wow moment
Les noms sont vrais — Livestorm, Spendesk, Agorapulse. Pas du fake data. Apollo a validé chaque entreprise.

---

## FLOW 2 — Connexion email + CRM auto-rempli (1:00)

### Action
Settings → Mail & Calendar → "Add account" → Google OAuth

### Ce que l'écran montre
- OAuth Google avec les scopes Gmail + Calendar (lecture seule)
- Après connexion : sync automatique des emails en arrière-plan (Inngest)
- Contacts auto-créés à partir des emails (noms, sociétés, titres extraits)
- Sociétés auto-détectées à partir des domaines email
- Activités avec analyse de sentiment (positive/neutral/negative)

### Talking point
> "Je connecte mon Gmail. LeadSens scanne mes emails, identifie les contacts business, crée les fiches automatiquement dans le CRM avec le nom, la société, le dernier échange. Pas de saisie manuelle."

### Wow moment
Les contacts apparaissent avec leurs sociétés liées, les titres, et l'historique des échanges. Zero data entry.

### ⚠️ Note technique
- Fonctionne uniquement avec Gmail (pas Microsoft — sync Outlook broken)
- Email sync prend 30-60 secondes en arrière-plan via Inngest
- Le CRM se remplit progressivement — re-check la page Contacts après 1 min

---

## FLOW 3 — Campagnes personnalisées (1:00)

### Action
Sequences → "+ Create Sequence" → Nommer "Outbound SaaS France" → Ajouter des steps

### Ce que l'écran montre
- Formulaire de création de séquence (nom + description)
- Builder de steps avec subject/body templates + délai entre steps
- Suggestions AI de contacts à enroller (basées sur le score ICP)
- Emails personnalisés par contact avec les signaux de l'entreprise

### Talking point
> "Je crée une séquence outbound. LeadSens me suggère les contacts les mieux scorés de mon TAM, et génère des emails personnalisés pour chacun — pas juste {prénom}, mais des refs au funding récent, à la stack tech, à la taille de l'équipe."

### Wow moment
L'AI suggestions montre les contacts avec leur score + les raisons du score. Les emails référencent des données réelles de l'entreprise.

### ⚠️ Note technique
- Le cron de trigger des steps (nouveau) s'exécute toutes les 2 minutes
- L'envoi réel passe par Resend avec warmup progressif et tracking pixels
- Pas d'envoi réel pendant la démo (pas de mailbox connectée) — montrer la création + preview

---

## FLOW 4 — Calls : synthèse + coaching + follow-up (1:00)

### Setup
Avoir un meeting dans le calendrier (sync Google Calendar) ou créer un meeting manuellement.

### Action
Meetings → Cliquer sur un meeting passé → Upload transcript (texte ou audio) → Voir l'analyse AI

### Ce que l'écran montre
- Upload de transcript (drag-drop fichier ou coller du texte)
- Analyse structurée :
  - **Summary** : résumé en 2-3 phrases
  - **Key points** : points clés de la discussion
  - **Action items** : avec owner et deadline
  - **Buying signals** : budget, timeline, team size, pain points, **objections**, competitors
  - **Sentiment** : positive / neutral / negative
- **Follow-up email draft** auto-généré avec bouton "Edit & Send"
- Tâches CRM créées à partir des action items
- Deal mis à jour avec les buying signals extraits

### Talking point
> "J'uploade le transcript du call. L'IA le décompose : résumé, action items, signaux d'achat, objections détectées. Elle rédige un follow-up email et met à jour mon pipeline avec les infos extraites. Tout ça automatiquement."

### Wow moment
Les buying signals avec budget, timeline, et objections extraites. Le follow-up email qui référence des points précis du call.

### ⚠️ Note technique
- Nécessite Google Calendar connecté pour voir les meetings
- Support audio (Whisper), VTT/SRT, et texte brut
- Si pas de meeting : copier un transcript de démo dans le champ texte

---

## FLOW 5 — Dashboard auto-rempli (0:30)

### Action
Cliquer "Up next" dans la sidebar

### Ce que l'écran montre
- **Greeting** : "Good afternoon, Martin"
- **Weekly summary** : sequences, responses, meetings, deals closed
- **Your priorities today** : actions AI-générées (ex: "Enrich 20 companies")
- **Insights** : "20 new TAM companies need scoring" avec action suggérée
- **Today's meetings** : meetings du jour (si calendar connecté)
- **Hot contacts** : top contacts à relancer
- **This week** : recommendations AI

### Talking point
> "Mon dashboard se remplit tout seul. Les priorités sont calculées par l'IA à partir de mon pipeline, mes emails, mes calls. Chaque matin, je sais exactement quoi faire."

### Wow moment
Les action cards avec priorités (critical/high/medium) qui linkent directement vers les contacts et deals concernés.

---

## FLOW BONUS — Chat AI (0:30)

### Action
Cliquer "New chat" → Taper "Give me a pipeline summary"

### Ce que l'écran montre
- Réponse AI avec analyse détaillée du pipeline :
  - $352K total, 6 deals actifs
  - Deal par stage (Lead, Qualification, Demo, Trial, Proposal, Negotiation)
  - **Flags to Watch** : Pulsar Data ($120K closes April 20), Vortex AI ($85K at Proposal)
  - Recommendation d'actions spécifiques

### Talking point
> "Je pose n'importe quelle question en langage naturel. 'Résume mon pipeline.' 'Quels deals sont à risque ?' 'Rédige un follow-up.' L'IA a le contexte complet — chaque email, chaque call, chaque deal."

### Wow moment
L'AI cite des vrais noms d'entreprises, des vrais montants, des vraies dates de close. Pas du générique.

---

## Pré-checklist avant enregistrement

- [ ] Connecter Google OAuth (Gmail + Calendar) sur le compte démo
- [ ] Attendre 2 min que l'email sync crée des contacts
- [ ] Vérifier que les meetings du calendrier apparaissent
- [ ] Préparer un transcript de call à uploader (texte ou fichier audio)
- [ ] Dark mode activé (toggle dans le menu user sidebar)
- [ ] Browser à 1440px, fermer les extensions
- [ ] Fermer le badge Next.js dev tools ("1 Issue")
- [ ] Tester "Give me a pipeline summary" dans le chat une fois avant de filmer
