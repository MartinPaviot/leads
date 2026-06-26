/**
 * The proven sequence templates — one structurally-distinct cadence per trigger.
 *
 * These are DATA. Each is tuned to a why-now: the angle is recipient-benefit
 * (what's in it for THEM), every follow-up adds new value, and the cadence shape
 * (step count, channel mix, delays) differs by trigger — that difference IS the
 * Monaco moat, not the wording. Copy is FR (vouvoiement), tight (cold-email
 * length), hype-free (the voice guide bans "leverage/transform/unlock" and their
 * FR equivalents), and uses only the interpolation vars the send path supports
 * (`{{firstName}}` `{{lastName}}` `{{fullName}}` `{{title}}`).
 *
 * Adding/Tuning a template here changes what the autopilot router can land a
 * cohort on — no schema change, no migration.
 */

import type { ProvenSequenceTemplate } from "./types";

/** Post-funding: congrats + a genuinely useful resource. NEVER a "you raised, buy my thing" pitch. */
const postFunding: ProvenSequenceTemplate = {
  id: "post-funding",
  name: "Post-financement — félicitations, zéro pitch",
  description: "Une levée récente (<180j) : on aide à scaler le GTM, on ne vend pas sur la levée.",
  triggerSignalTypes: ["post_funding"],
  personaFit: ["founder", "exec"],
  recipientBenefitAngle:
    "Lever change la priorité, pas le problème : scaler l'acquisition sans recruter une équipe entière. On offre la ressource, sans contrepartie.",
  lang: "fr",
  steps: [
    {
      stepNumber: 1,
      stepType: "email",
      delayDays: 0,
      subjectTemplate: "Félicitations pour la levée, {{firstName}}",
      bodyTemplate:
        "{{firstName}}, félicitations pour la levée — la barre se déplace vite après ça.\n\n" +
        "On a compilé ce que les équipes qui scalent leur acquisition juste après une levée font différemment (et les pièges qui brûlent du cash les 6 premiers mois). Je vous l'envoie, sans contrepartie : dites-moi juste si ça vous est utile.\n\n" +
        "Pas de rendez-vous à caler — c'est vraiment pour aider sur le moment.",
      valueAdded: "Une ressource concrète (benchmark post-levée) offerte sans demande de meeting.",
    },
    {
      stepNumber: 2,
      stepType: "linkedin_message",
      delayDays: 3,
      subjectTemplate: "",
      bodyTemplate:
        "{{firstName}}, je suis votre parcours depuis la levée — beau move. " +
        "Je vous ai envoyé par mail un récap des écueils GTM post-levée ; je me connecte au cas où ça vous serve plus tard.",
      valueAdded: "Rappel du même cadeau sur un autre canal, sans réitérer la demande.",
      channelConfig: { connectionNote: "Félicitations pour la levée — j'aide les fondateurs à scaler l'acquisition juste après." },
    },
    {
      stepNumber: 3,
      stepType: "email",
      delayDays: 7,
      subjectTemplate: "Une idée précise pour {{firstName}}",
      bodyTemplate:
        "{{firstName}}, une seule idée, applicable cette semaine : prioriser vos premiers envois sur les comptes qui montrent un signal d'achat plutôt que sur toute la liste — c'est ce qui change le taux de réponse à budget constant.\n\n" +
        "Si vous voulez, je vous montre à quoi ça ressemblerait sur vos segments en 15 min. Sinon, l'idée tient sans moi.",
      valueAdded: "Une tactique actionnable + un CTA léger, après deux touches sans ask.",
    },
  ],
};

/** Hiring signal: the role they're opening IS the problem we solve. To the hiring manager. */
const hiringSignal: ProvenSequenceTemplate = {
  id: "hiring-signal",
  name: "Recrutement en cours — couvrir le rôle sans embaucher",
  description: "Une offre ouverte pour un rôle qu'on automatise/augmente : on adresse le manager qui recrute.",
  triggerSignalTypes: ["hiring_signal"],
  personaFit: ["vp", "manager", "exec"],
  recipientBenefitAngle:
    "Le poste ouvert = le manque qu'on comble. On montre comment d'autres ont couvert ce besoin sans attendre 3 mois de recrutement.",
  lang: "fr",
  steps: [
    {
      stepNumber: 1,
      stepType: "email",
      delayDays: 0,
      subjectTemplate: "Votre offre {{title}} — une façon de la couvrir dès maintenant",
      bodyTemplate:
        "{{firstName}}, j'ai vu que vous recrutez sur ce périmètre. Entre l'ouverture et l'opérationnel, il se passe souvent 3 à 4 mois.\n\n" +
        "On aide des équipes à couvrir cette partie du rôle dès la première semaine, le temps que la personne arrive (et après). Je vous montre le « avant/après » d'une équipe comparable ?",
      valueAdded: "Relie directement l'offre ouverte au manque opérationnel immédiat.",
    },
    {
      stepNumber: 2,
      stepType: "email",
      delayDays: 4,
      subjectTemplate: "Comment {{firstName}} pourrait gagner les 3 mois de recrutement",
      bodyTemplate:
        "{{firstName}}, un cas concret : une équipe de votre taille a couvert exactement ce périmètre pendant son recrutement, et a gardé le dispositif une fois la personne en poste parce que ça déchargeait le répétitif.\n\n" +
        "Le détail tient en une page — je vous l'envoie si c'est utile.",
      valueAdded: "Un cas chiffré comparable (preuve), nouvelle information vs le step 1.",
    },
    {
      stepNumber: 3,
      stepType: "linkedin_message",
      delayDays: 7,
      subjectTemplate: "",
      bodyTemplate:
        "{{firstName}}, je me connecte — vous recrutez sur un périmètre qu'on couvre souvent en attendant la bonne personne. Aucun pitch, juste au cas où le timing colle.",
      valueAdded: "Touche LinkedIn qui ouvre le canal sans répéter la demande email.",
      channelConfig: { connectionNote: "Vous recrutez sur ce périmètre — on aide à le couvrir le temps du recrutement." },
    },
  ],
};

/** Product launch: congrats + how our value amplifies post-launch traction. */
const productLaunch: ProvenSequenceTemplate = {
  id: "product-launch",
  name: "Lancement produit — amplifier la traction post-launch",
  description: "Un lancement récent : on aide à transformer le pic d'attention en pipeline, sans gâcher le momentum.",
  triggerSignalTypes: ["product_launch"],
  personaFit: ["founder", "exec", "vp"],
  recipientBenefitAngle:
    "Un lancement crée un pic d'attention court : l'enjeu est de le convertir en conversations qualifiées avant qu'il retombe.",
  lang: "fr",
  steps: [
    {
      stepNumber: 1,
      stepType: "email",
      delayDays: 0,
      subjectTemplate: "Vu votre lancement, {{firstName}} — une remarque",
      bodyTemplate:
        "{{firstName}}, j'ai vu le lancement — c'est propre. Le pic d'attention d'un launch retombe en quelques jours ; ce qui reste, c'est ce que vous en convertissez en conversations.\n\n" +
        "On aide à capter les comptes qui ont réagi au lancement et à les engager pendant qu'ils sont chauds. Je vous montre comment sur votre cas ?",
      valueAdded: "Pointe l'enjeu temporel propre au lancement (fenêtre courte).",
    },
    {
      stepNumber: 2,
      stepType: "linkedin_message",
      delayDays: 2,
      subjectTemplate: "",
      bodyTemplate:
        "{{firstName}}, félicitations pour le lancement. Je me connecte — j'ai un angle précis sur la conversion du momentum post-launch que je vous ai esquissé par mail.",
      valueAdded: "Renforce sur LinkedIn pendant que le launch est encore visible.",
      channelConfig: { connectionNote: "Félicitations pour le lancement — un angle sur la conversion du momentum." },
    },
    {
      stepNumber: 3,
      stepType: "email",
      delayDays: 6,
      subjectTemplate: "Le momentum {{firstName}}, une semaine après",
      bodyTemplate:
        "{{firstName}}, une semaine après un lancement, l'attention retombe mais les comptes qui ont réagi sont encore identifiables. C'est la dernière bonne fenêtre pour les engager.\n\n" +
        "Si vous voulez, je vous liste comment les repérer dans vos propres signaux — 15 min, repartez avec, qu'on travaille ensemble ou non.",
      valueAdded: "Crée l'urgence de la fenêtre qui se ferme + offre tangible.",
    },
  ],
};

/** Leadership change: new in seat → a quick first-90-days win. */
const leadershipChange: ProvenSequenceTemplate = {
  id: "leadership-change",
  name: "Nouveau poste — une victoire pour les 90 premiers jours",
  description: "Une prise de poste récente : on propose un quick win visible, pas un grand projet.",
  triggerSignalTypes: ["leadership_change"],
  personaFit: ["exec", "vp"],
  recipientBenefitAngle:
    "Nouveau en poste, on cherche une victoire rapide et visible. On apporte ce quick win, pas un chantier de 6 mois.",
  lang: "fr",
  steps: [
    {
      stepNumber: 1,
      stepType: "email",
      delayDays: 0,
      subjectTemplate: "Félicitations pour le poste, {{firstName}}",
      bodyTemplate:
        "{{firstName}}, félicitations pour la prise de poste. Les 90 premiers jours, ce qui compte c'est une victoire rapide et visible, pas un grand chantier.\n\n" +
        "On aide précisément à en livrer une sur l'acquisition — résultat mesurable en quelques semaines. Je vous montre laquelle serait la plus crédible dans votre contexte ?",
      valueAdded: "Cadre la proposition sur l'enjeu réel du nouveau dirigeant (quick win 90j).",
    },
    {
      stepNumber: 2,
      stepType: "email",
      delayDays: 5,
      subjectTemplate: "Le quick win {{firstName}}, en concret",
      bodyTemplate:
        "{{firstName}}, concrètement : un dirigeant dans votre situation a choisi de prioriser l'outbound sur les comptes à signal d'achat plutôt que d'élargir la liste. Résultat visible en 3 semaines, facile à présenter en interne.\n\n" +
        "Je vous envoie le déroulé si vous voulez vous l'approprier.",
      valueAdded: "Donne un exemple concret + réutilisable en interne (preuve sociale du pair).",
    },
    {
      stepNumber: 3,
      stepType: "linkedin_message",
      delayDays: 9,
      subjectTemplate: "",
      bodyTemplate:
        "{{firstName}}, bienvenue dans le nouveau rôle. Je me connecte — je vous ai partagé par mail un quick win d'acquisition pensé pour vos premières semaines. Au cas où.",
      valueAdded: "Ouvre LinkedIn pour rester accessible sur la durée des 90 jours.",
      channelConfig: { connectionNote: "Félicitations pour la prise de poste — un quick win d'acquisition pour vos premières semaines." },
    },
  ],
};

/** Tech-stack change: adopted X → here's what teams plug on top to get more from it. */
const techStackChange: ProvenSequenceTemplate = {
  id: "tech-stack-change",
  name: "Nouvel outil adopté — en tirer 2× plus vite",
  description: "Une techno récemment adoptée : on se positionne en complément qui accélère le ROI de cet outil.",
  triggerSignalTypes: ["tech_stack_change"],
  personaFit: ["vp", "manager", "ic"],
  recipientBenefitAngle:
    "Un nouvel outil met des semaines à payer. On montre ce que les équipes branchent par-dessus pour en tirer la valeur plus vite.",
  lang: "fr",
  steps: [
    {
      stepNumber: 1,
      stepType: "email",
      delayDays: 0,
      subjectTemplate: "Vous avez adopté un nouvel outil, {{firstName}} — un complément utile",
      bodyTemplate:
        "{{firstName}}, j'ai vu que vous avez intégré un nouvel outil sur votre stack. La valeur arrive rarement le premier mois — il y a souvent une pièce manquante côté usage.\n\n" +
        "On est précisément cette pièce pour plusieurs équipes : ça raccourcit le temps avant que l'outil paie. Je vous montre où, sur votre cas ?",
      valueAdded: "Se positionne en accélérateur du ROI de l'outil déjà choisi (pas un remplaçant).",
    },
    {
      stepNumber: 2,
      stepType: "email",
      delayDays: 4,
      subjectTemplate: "La pièce manquante, {{firstName}}",
      bodyTemplate:
        "{{firstName}}, le détail : les équipes qui tirent vite la valeur d'un nouvel outil branchent dessus un flux qui alimente l'usage réel — sinon l'outil reste sous-utilisé.\n\n" +
        "Une page suffit à l'expliquer ; je vous l'envoie si c'est pertinent.",
      valueAdded: "Explique le mécanisme concret (nouvelle info), preuve d'expertise.",
    },
  ],
};

/** Website visit: warm, noticed interest — answer the usual next question without being creepy. */
const websiteVisit: ProvenSequenceTemplate = {
  id: "website-visit",
  name: "Visite du site — répondre à la question d'après",
  description: "Un intérêt manifesté (visite) : on répond à la question que cet intérêt pose d'habitude, sans surveiller.",
  triggerSignalTypes: ["website_visit"],
  personaFit: ["vp", "manager", "ic", "exec"],
  recipientBenefitAngle:
    "Un intérêt récent appelle une réponse utile, pas une relance commerciale. On répond à la question d'après, discrètement.",
  lang: "fr",
  steps: [
    {
      stepNumber: 1,
      stepType: "email",
      delayDays: 0,
      subjectTemplate: "Une réponse rapide, {{firstName}}",
      bodyTemplate:
        "{{firstName}}, sans vous solliciter inutilement : quand des équipes comme la vôtre s'intéressent à ce sujet, la question d'après est presque toujours la même — comment le mettre en place sans alourdir l'équipe.\n\n" +
        "La réponse courte tient en trois points ; je vous les envoie si ça vous fait gagner du temps.",
      valueAdded: "Apporte la réponse utile attendue, sans mentionner la visite (non intrusif).",
    },
    {
      stepNumber: 2,
      stepType: "email",
      delayDays: 3,
      subjectTemplate: "Les trois points, {{firstName}}",
      bodyTemplate:
        "{{firstName}}, je reviens avec le concret : prioriser les bons comptes, personnaliser à l'échelle, et garder un humain dans la boucle pour valider. C'est l'ossature qui marche.\n\n" +
        "Si vous voulez, je vous montre à quoi ça ressemble sur votre périmètre — sinon, vous repartez avec les trois points.",
      valueAdded: "Livre la valeur promise (les 3 points) + CTA optionnel, jamais bloquant.",
    },
  ],
};

/** Exec engagement: they engaged with content → give the deeper version + one applicable point. */
const execEngagement: ProvenSequenceTemplate = {
  id: "exec-engagement",
  name: "Engagement sur un contenu — la version qui va au fond",
  description: "Une réaction à un contenu : on prolonge sur LinkedIn (là où ça s'est passé) puis par mail.",
  triggerSignalTypes: ["exec_engagement"],
  personaFit: ["exec", "vp", "founder"],
  recipientBenefitAngle:
    "Une réaction à un contenu = un intérêt déclaré. On prolonge avec la version approfondie + un point applicable chez eux.",
  lang: "fr",
  steps: [
    {
      stepNumber: 1,
      stepType: "linkedin_message",
      delayDays: 0,
      subjectTemplate: "",
      bodyTemplate:
        "{{firstName}}, vous avez réagi au sujet — content que ça résonne. J'ai une version plus complète sur le point précis qui revient le plus, et un angle applicable chez vous. Je me connecte et je vous l'envoie ?",
      valueAdded: "Prolonge la conversation sur le canal même de l'engagement.",
      channelConfig: { connectionNote: "Content que le sujet vous ait parlé — j'ai une version plus complète à partager." },
    },
    {
      stepNumber: 2,
      stepType: "email",
      delayDays: 2,
      subjectTemplate: "La version complète, {{firstName}}",
      bodyTemplate:
        "{{firstName}}, comme promis, le fond plutôt que le post : le point qui fait la différence, c'est de relier chaque message à un signal réel du compte plutôt qu'à un segment générique.\n\n" +
        "Je vous montre comment l'appliquer à vos comptes en 15 min, si l'angle vous parle.",
      valueAdded: "Délivre la profondeur promise + relie au contexte du destinataire.",
    },
  ],
};

/** Review left: they reviewed X → here's what we do differently on the exact pain they flagged. */
const reviewLeft: ProvenSequenceTemplate = {
  id: "review-left",
  name: "Avis laissé sur un outil — la différence sur le point qui gêne",
  description: "Un avis public sur un outil concurrent : on adresse précisément le point de friction mentionné.",
  triggerSignalTypes: ["review_left"],
  personaFit: ["manager", "vp", "ic"],
  recipientBenefitAngle:
    "Un avis révèle un point de friction précis. On répond sur CE point, pas avec un pitch générique.",
  lang: "fr",
  steps: [
    {
      stepNumber: 1,
      stepType: "email",
      delayDays: 0,
      subjectTemplate: "Sur le point que vous avez relevé, {{firstName}}",
      bodyTemplate:
        "{{firstName}}, j'ai vu votre retour d'expérience sur un outil du même domaine que nous. Le point de friction que vous évoquez, c'est exactement celui qu'on a pris à bras-le-corps.\n\n" +
        "Sans vous demander de changer quoi que ce soit aujourd'hui : je vous montre comment on le traite différemment ?",
      valueAdded: "Répond au point de friction exact mentionné (ultra-ciblé), sans demander de switch.",
    },
    {
      stepNumber: 2,
      stepType: "email",
      delayDays: 5,
      subjectTemplate: "Concrètement, {{firstName}}",
      bodyTemplate:
        "{{firstName}}, en deux lignes sur le point qui vous a gêné : chez nous, c'est traité en amont plutôt qu'en contournement, donc le problème ne réapparaît pas à l'usage.\n\n" +
        "Je vous envoie une démo courte ciblée sur ce point précis si vous voulez juger sur pièce.",
      valueAdded: "Apporte le « comment » concret sur la friction, preuve sur le point exact.",
    },
  ],
};

/** Competitor mention: they're evaluating a competitor → an honest comparison on what matters to them. */
const competitorMention: ProvenSequenceTemplate = {
  id: "competitor-mention",
  name: "Évaluation d'un concurrent — la comparaison honnête",
  description: "Un signal d'évaluation d'un concurrent : on propose une comparaison honnête sur les critères qui comptent.",
  triggerSignalTypes: ["competitor_mention"],
  personaFit: ["vp", "manager", "exec"],
  recipientBenefitAngle:
    "Quelqu'un qui évalue un concurrent veut une comparaison honnête, pas du dénigrement. On donne les critères de décision, y compris ceux où l'autre gagne.",
  lang: "fr",
  steps: [
    {
      stepNumber: 1,
      stepType: "email",
      delayDays: 0,
      subjectTemplate: "Si vous comparez les options, {{firstName}}",
      bodyTemplate:
        "{{firstName}}, si vous regardez les solutions du marché en ce moment, autant que ce soit utile : voici les trois critères sur lesquels la décision se joue vraiment dans votre cas — y compris celui où on n'est pas le meilleur choix.\n\n" +
        "Comparaison honnête, vous tranchez. Je vous l'envoie ?",
      valueAdded: "Offre une grille de décision honnête (concède un point), gagne la confiance.",
    },
    {
      stepNumber: 2,
      stepType: "linkedin_message",
      delayDays: 3,
      subjectTemplate: "",
      bodyTemplate:
        "{{firstName}}, je me connecte — je vous ai partagé par mail une comparaison honnête sur les options du marché, critère par critère. Aucun parti pris, c'est fait pour vous faire gagner du temps d'évaluation.",
      valueAdded: "Réaffirme la posture honnête sur un second canal.",
      channelConfig: { connectionNote: "Une comparaison honnête des options du marché, critère par critère — pour gagner du temps d'éval." },
    },
    {
      stepNumber: 3,
      stepType: "email",
      delayDays: 7,
      subjectTemplate: "Le critère qui départage, {{firstName}}",
      bodyTemplate:
        "{{firstName}}, s'il ne fallait garder qu'un critère pour départager : la capacité à relier chaque message à un signal réel du compte. C'est là que se fait l'écart de résultats.\n\n" +
        "Je vous montre la différence sur vos propres comptes en 15 min si vous voulez vérifier.",
      valueAdded: "Isole le critère décisif (nouvelle info) + invitation à vérifier sur leurs données.",
    },
  ],
};

/** The full proven library — one structurally-distinct sequence per KNOWN_SIGNAL_TYPE. */
export const PROVEN_TEMPLATES: ProvenSequenceTemplate[] = [
  postFunding,
  hiringSignal,
  productLaunch,
  leadershipChange,
  techStackChange,
  websiteVisit,
  execEngagement,
  reviewLeft,
  competitorMention,
];
