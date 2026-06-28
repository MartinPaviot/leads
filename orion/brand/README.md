# Orion — marque

Logo calé sur le design system Elevay (mêmes tokens, pour que l'UI reste « dans le registre Elevay »).

## Concept
La marque est un **« O » en forme de constellation** : un anneau d'étoiles reliées par des hairlines forme la lettre O d'« Orion ». À l'intérieur, trois étoiles alignées en diagonale = la **Ceinture d'Orion** (le clin d'œil spécifique à la constellation). La diagonale du gradient rend littéralement le **gradient de marque Elevay**.

## Tokens (depuis `app/apps/web/src/app/globals.css`)
- Gradient de marque (clair) : `#17C3B2 → #2C6BED → #FF7A3D` ; (sombre) : `#2DD4BF → #60A5FA → #FB923C`.
- Encre / wordmark (clair) : `#1A1A2E` ; (sombre) : `#E8E8ED`.
- Accent : `#2C6BED`. Sol nuit (icône sombre) : `#0E0F14`.
- Police wordmark : **Inter**, weight 600, tracking −0.02em (≈ `letter-spacing:-0.84` à 42px).

## Fichiers
| Fichier | Usage |
|---|---|
| `orion-icon.svg` | icône / app-icon, fond nuit sombre (favicon, avatar) |
| `orion-icon-light.svg` | icône sur fond clair |
| `orion-lockup.svg` | lockup horizontal (O-constellation + « rion »), thème clair |
| `orion-lockup-dark.svg` | lockup horizontal, thème sombre |

## Notes
- **Pas d'emoji** (règle UI Elevay, load-bearing) — le logo est purement vectoriel.
- Le wordmark utilise `<text font-family="Inter">` : rend exactement comme l'app là où Inter est chargée. Pour une distribution hors-app (favicon multi-plateforme, presse), **convertir le texte en paths** (le mark, lui, est déjà 100% paths/formes).
- Le mark seul (sans wordmark) = `orion-icon*.svg`, conçu pour rester lisible à 16px (favicon).
