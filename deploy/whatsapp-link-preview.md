# WhatsApp link preview — pourquoi ça ne marchait pas + quoi faire

## Cause trouvée (critique)

Le `robots.txt` **géré par Cloudflare** bloquait le crawler Meta :

```
User-agent: meta-externalagent
Disallow: /
```

WhatsApp utilise l’infra Meta (`facebookexternalhit` / `meta-externalagent`) pour lire `og:title`, `og:description` et `og:image`. Si le bot est bloqué ou si l’image a déjà échoué une fois, **WhatsApp met en cache l’échec** (~7 jours).

## Correctifs déployés côté Django

1. **Meta OG simplifiées** dans `vubez2.html` (tout en haut du `<head>`, avant les scripts)
   - Titre : `DAXI`
   - Description : `Le choix éclatant du confort.`
2. **Nouvelle image** : logo sur fond blanc → `/static/img/daxi-og-share.jpg` (1200×630, JPEG < 300 Ko)
3. **`robots.txt` Django** qui autorise explicitement :
   - `facebookexternalhit`
   - `Facebot`
   - `meta-externalagent`
   - `WhatsApp`

## Action obligatoire Cloudflare (sinon previews toujours cassées)

Si Cloudflare injecte encore son propre `robots.txt` :

1. Dashboard Cloudflare → **Security** → **Bots** (ou **Scrape Shield**)
2. Désactiver **Managed robots.txt** / règles qui bloquent `meta-externalagent`
3. Ou ajouter une **Configuration Rule** : pour `robots.txt`, servir depuis l’origine Railway (bypass cache)

Vérifier après deploy :

```powershell
(Invoke-WebRequest https://daxipro.com/robots.txt -UseBasicParsing).Content
```

Tu dois voir `Allow: /` pour `meta-externalagent`, **pas** `Disallow: /`.

## Forcer le refresh du cache WhatsApp

WhatsApp ne rafraîchit **pas** les anciens messages. Pour tester :

1. Ouvre [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/?q=https%3A%2F%2Fdaxipro.com%2F)
2. Clique **Scrape Again** (2–3 fois)
3. Envoie le lien dans une **nouvelle conversation** WhatsApp  
   Ou utilise une URL avec paramètre : `https://daxipro.com/?v=2`

## Exigences officielles Meta / WhatsApp

| Règle | DAXI |
|---|---|
| `og:title` + `og:description` + `og:image` dans les **300 premiers Ko** du HTML | OK |
| `og:image` = URL HTTPS absolue, publique | OK |
| Image ≥ 300 px de large, ratio ≤ 4:1 | OK (1200×630) |
| Image **< 600 Ko** (idéal **< 300 Ko** pour WhatsApp) | OK (JPEG) |
| Format JPG/PNG/WebP (pas SVG/GIF) | OK (JPEG) |
| Un seul `og:image` principal | OK |
| Crawler non bloqué (`robots.txt`, firewall) | À confirmer après fix Cloudflare |

## Test rapide

```powershell
# Simuler le crawler Meta
Invoke-WebRequest https://daxipro.com/ -Headers @{"User-Agent"="facebookexternalhit/1.1"} -UseBasicParsing |
  Select-Object -ExpandProperty Content | Select-String "og:image|og:title"

Invoke-WebRequest https://daxipro.com/static/img/daxi-og-share.jpg -Method Head -UseBasicParsing
```
