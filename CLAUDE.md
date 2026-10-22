# Localities Testing Tool

## Overview
Outil de test interne pour l'API Woosmap Localities. Permet de comparer les reponses entre environnements (PR deploy, develop, production) via une interface 3 panneaux : controles (gauche), carte (centre), details (droite).

## Architecture
- **Vanilla JS** avec ES6 modules natifs (pas de framework, pas de build obligatoire)
- **CSS** : Tailwind CSS via CDN
- **Carte** : Woosmap Map SDK (API similaire a Google Maps)
- **UI libs** : jQuery 3.6 + Selectize.js (select multi-values)
- **Build optionnel** : Parcel Bundler

## Fichiers cles

| Fichier | Role |
|---------|------|
| `index.html` | Layout 3 panneaux, formulaire de controles |
| `src/index.js` | Orchestrateur principal, event listeners, `requestDetails()`, `performSearch()` |
| `src/api-service.js` | Appels API (`autocompleteSearch`, `getDetails`, `reverseGeocode`) |
| `src/ui-manager.js` | Rendu HTML des resultats et details, comparaison dev/prod |
| `src/map-manager.js` | Gestion carte, markers (dev=rouge, prod=bleu), polygons viewport |
| `src/diff-utils.js` | Comparaison profonde des reponses API (`computeDiff`, `deepEqual`) |
| `src/config.js` | Constantes (zoom levels, styles markers/polygons, cles API) |
| `src/environment_select.js` | Gestion des 3 envs : `prod`, `dev`, `pr` (URL dynamique pour PR) |
| `src/endpoint_select.js` | Selecteur endpoint : `autocomplete`, `search`, `geocode` |
| `src/countries.js` | Liste ISO pays + `buildCountryComponents()` (entree UK = GB+JE+GG+IM) |
| `src/request-url.js` | Export/import d'URL de requete (`maskApiKey`, `parseRequestUrl`), cles jamais exposees |
| `src/request-modal.js` | Modale "Request URL" : copie de la derniere requete cible, collage + rejeu via `applyRequest()` |
| `src/utils.js` | `buildQueryString`, `debounce`, `escapeHtml`, `boldMatchedSubstring` |
| `mobile.html` | Entree mobile : carte + bottom sheet (recherche/resultats/detail), pages plein ecran (filtres, pays, langue), sheets compacts (env, endpoint, Request URL) |
| `src/mobile-app.js` | Orchestrateur mobile : etat, recherche/details/compare, rejeu d'URL, pickers |
| `src/mobile-ui.js` | Rendu mobile : chips, resultats fusionnes cible/compare, detail, onglets DEV/PROD/Compare, diff |
| `src/mobile-sheet.js` | Bottom sheet a crans (peek/half/full), drag, zone carte = au-dessus du sheet, clavier (`visualViewport`) |
| `src/mobile-filters.js` | Page filtres (types, pays, options, langue, custom description) et listes pays/langue |
| `src/mobile-redirect.js` | Redirige les UA mobiles de `index.html` vers `mobile.html` (`?nomobile` pour rester sur desktop) |

## Environnements API
- **prod** : `https://api.woosmap.com/localities/` (cle prod)
- **dev** : `https://develop-api.woosmap.com/localities/` (cle dev)
- **pr** : `https://develop-api.woosmap.com/{prNumber}/localities/` (cle dev, URL dynamique)

## Flux principal
1. User tape dans l'input → `performSearch()` (debounce 300ms)
2. 2 appels paralleles : autocomplete dev + autocomplete prod
3. Resultats affiches cote a cote (prod en lecture seule, opacity 0.6)
4. Click sur un resultat → `requestDetails(publicId)`
5. Si env != prod : 2 appels details paralleles (dev + prod), comparaison via `computeDiff()`
6. Si differences : affichage comparatif (champs colores jaune/vert/rouge) + marker bleu prod sur la carte

## Conventions
- XSS protection : toujours utiliser `escapeHtml()` pour le contenu dynamique
- Styles : classes Tailwind inline dans le JS (pas de CSS custom)
- Markers carte : dev/PR = rouge (`dot-marker.png`), prod = bleu (SVG data-URI)
- Polygons viewport : dev = rouge `#b71c1c`, prod = bleu `#1565C0`
- Langue par defaut : `fr` (overridable via query param `?language=`)

## Mobile (`mobile.html`)
- Memes features que le desktop ; reutilise `api-service`, `map-manager`, `diff-utils`, `environment_select`, `request-url` sans modification. Des `<select>` caches (`env-select`, `compare-select`, `endpoint-select`, `language-select`) servent de miroir a l'etat pour ces modules.
- Bottom sheet a 3 crans : `peek` (recherche seule), `half` (55 %), `full` (sous le header). Le conteneur carte s'arrete au-dessus du sheet, donc markers/polygones restent centres dans la zone visible ; la carte est redessinee a chaque cran.
- Les filtres sont une page plein ecran : jamais affiches en meme temps que la carte.
- Env `pr` : le `prompt()` est fait par le mobile, puis `setTargetEnvironment` / `setCompareEnvironment` (pas de double prompt).
