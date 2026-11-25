# Chrome Web Store submission

Everything needed to publish SniperShot. Build the package first:

```sh
node tools/package.mjs
```

This creates `dist/snipershot-<version>.zip` (upload this) and `dist/snipershot-<version>/` (the same files unpacked, to try with **Load unpacked**).

## Steps

1. Sign in to the [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) (one-time US$5 developer registration).
2. **Add new item** → upload `dist/snipershot-1.0.0.zip`.
3. Fill in **Store listing**, **Privacy** and **Distribution** with the text below.
4. Publish the privacy policy at a public URL (for example, push `PRIVACY_POLICY.md` to a public GitHub repository or GitHub Pages) and paste the URL into the Privacy tab.
5. **Submit for review.**

For updates, raise `version` in `manifest.json`, run `node tools/package.mjs` again, and upload the new zip under **Package**.

## Store listing

**Name:** SniperShot

**Summary** (from the manifest, 115 of 132 characters):
Turn any webpage into a sniper game: scope in, spare the civilians, stop the bombers and land the perfect headshot.

**Category:** Entertainment (or Fun)

**Language:** English

**Description:**

> Turn the page you're reading into a sniper mission.
>
> Operation: Paper Trail — the Bureau of Misplaced Documents has lost its top-secret punchline, and a squad of over-caffeinated office mercenaries is hiding behind the paragraphs, images and buttons of your webpage. Click the SniperShot icon, accept the mission and take aim.
>
> • A real sniper scope: full-screen black scope, smooth 2×–16× zoom, scope sway, hold your breath to steady the shot.
> • Headshots only: soldiers peek out from behind real page content, so wait for the peek and take the shot.
> • Watch the bullet fly: every round flies straight to the point of aim; four headshots in a row earns a slow-motion bullet cam.
> • Know your targets: spare the civilians, stop bombers before the timer runs out, beat marksmen to the shot and hunt the elusive HVT.
> • Hearts, medals and a debrief: no-scopes, quickscopes, collaterals, long shots and streak medals.
> • A career that carries over: earn XP, climb 10 ranks and unlock a bigger magazine, extra hearts, a 24× scope and more.
> • Red danger markers, scope-edge indicators and a mini-map show where enemies are hiding.
>
> Your page is never changed: press Esc or Exit and everything is restored. SniperShot runs only when you click it, makes no network requests and collects no data. The only thing it saves is your rank and best score, on your own device.
>
> Controls: right-click / Space to scope · click to fire · mouse wheel or +/− to zoom · Shift to hold breath · R to reload · M sound · Esc to unscope / exit.

**Graphic assets** (in `store/`):

| Asset | File | Size |
| --- | --- | --- |
| Store icon | `icons/icon128.png` | 128×128 |
| Screenshots | `store/screenshots/1-scope.png`, `2-bullet-cam.png`, `3-danger-markers.png`, `4-debrief.png` | 1280×800 |
| Small promo tile | `store/promo-tile.png` (source `store/promo-tile.html`) | 440×280 |

The screenshots come from the end-to-end test page; screenshots on a familiar real website may look more appealing. Re-capture them with `SNIPER_SHOTS=<folder> node tests/browser.test.cjs` (1280×800).

## Privacy tab

**Single purpose:**
SniperShot turns the webpage in the current tab into a sniper arcade game when the user launches it from the toolbar, and removes the game when the user exits.

**Permission justifications:**

- **activeTab:** Grants temporary access to the tab the user is viewing when they click the SniperShot icon, so the game can be started on that page. No access to any other tab or site.
- **scripting:** Injects the game's script and overlay into the active tab when the user clicks Launch, and removes it again when they exit.
- **storage:** Saves the player's career progress (XP, best score, headshot and game counts) locally with `chrome.storage.local` so ranks and unlocks persist between games. Nothing is synced or sent anywhere.

**Host permissions:** none.

**Remote code:** No. All JavaScript is included in the package.

**Data usage:** Check **none** of the data categories (no personally identifiable information, health, financial, authentication, personal communications, location, web history, user activity or website content is collected or transmitted). Then certify:

- I do not sell or transfer user data to third parties, outside of the approved use cases.
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose.
- I do not use or transfer user data to determine creditworthiness or for lending purposes.

**Privacy policy URL:** the public URL of `PRIVACY_POLICY.md` (see step 4).

## Distribution

Visibility: Public (or Unlisted to share a link first). Regions: all. Pricing: free; no in-app purchases.
