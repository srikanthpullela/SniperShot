# SniperShot

Turn any webpage into **Operation: Paper Trail**, a sniper game about the Bureau of Misplaced Documents and its stolen punchline. Soldiers in the BlastBlastBlast style hide behind the page's real text, images and frames, peek out from different sides, pop up over headlines and sprint between cover. Scope in, wait for the peek, and take the headshot.

## Install

1. Download or clone this repository.
2. Open `chrome://extensions` in Google Chrome and enable **Developer mode**.
3. Select **Load unpacked** and choose the repository folder containing `manifest.json`.
4. Open an ordinary webpage, click the SniperShot toolbar icon, and select **Launch SniperShot**. Pin the extension for easy access.

## Play

Read the briefing and select **Accept mission**. **Only headshots kill.** Soldiers peek for a few seconds at a time, so there is time to scope in, line up and squeeze.

- **Hip view**: the page with your rifle. Red **danger** markers show where soldiers are hiding and turn bright when one is exposed (or **SNIPER AIMING** for a marksman). Moving the mouse opens up the hip-fire spread (rounds land anywhere inside the circle); hold still for about half a second and it closes onto the red dot and turns green, so the shot lands exactly on the dot.
- **Scope** (right-click or Space): a full-screen black scope. The page and the soldiers are magnified together, so whatever sits under the red dot is exactly what you hit. The pointer is locked while scoped: moving the mouse pans the view, and the **mouse wheel** (or **+** / **−**) zooms from 2× to 16× to get right on the head — about 1.5× per wheel notch. Red lines on the rim of the lens point toward soldiers outside your view, and a mini-map shows where you are looking on the page.
- **Shift** holds your breath to steady the scope sway, until your breath runs out.
- **Click** fires. The round flies in a straight line to the point of aim. Feedback tells you exactly how it went: **HEADSHOT**, **HEADSHOT MISSED** (a body shot — he ducks back and peeks again later) or **MISSED** with which way the shot went (high, low, left or right of the head).
- **Bullet cam**: every 4th headshot in a row plays a slow-motion bullet cam. The banner counts down how many more you need.
- The rifle is bolt-action (a short chambering pause between shots) with a five-round magazine and unlimited reserve. **R** reloads; an empty magazine reloads by itself (and clicking on empty starts a reload too).

Scoring: 200 per headshot plus a distance bonus and a streak multiplier. A few soldiers are out at a time. Cases rotate with different objectives and story beats; the threat level rises every 600 points. Escaped soldiers never end the game.

### Know your targets

- **Soldiers** (helmets, red markers): headshot them.
- **Civilians** (white shirt and tie, coffee, no helmet, *no marker*): don't shoot. A hit costs 250 points and a heart.
- **Bombers** (red charge on the back, red **BOMB** countdown): stop them within 10 seconds or the bomb goes off and costs a heart.
- **Marksmen** (lens glint, **SNIPER AIMING**): fire back after about five seconds and cost you a heart.
- **HVT** (red beret and sunglasses, gold ★ marker): turns up now and then and peeks only briefly. Worth 1000 points and gives a heart back.

### Hearts, medals and career

- You start with 3 ♥. Lose them all and the mission ends with a debrief: score, headshots, accuracy, longest shot, best streak, medals, XP earned and your personal best. **Play again** starts a fresh run.
- **Medals** for style: No-scope (hip-fire headshot at 350 m+), Quickscope (scoped kill within a second of raising the scope), Longshot (560 m+), Collateral (two heads, one round), Close call (a marksman about to fire), Bomb stopped / Last second, HVT eliminated, and streak medals at 5, 10 and 15 in a row.
- **Career**: every run (finished or abandoned) banks XP (score ÷ 5). Ten ranks, from *Paper Pusher* to *Legend of Accounts Payable*; each rank-up unlocks gear for the next run — a 6- then 7-round magazine, longer breath, a faster bolt, a 4th and 5th heart, a 24× scope and faster reloads. Your rank, best score and the next unlock show in the briefing, the debrief and the toolbar popup.

- **G** or **Grid**: toggle the aiming grid (off by default) and the scope's ranging grid.
- **M** or **Sound**: toggle sound effects (synthesized in the browser).
- **Esc** lowers the scope; when not scoped, **Esc**, **Exit**, or the popup's **Remove SniperShot** ends the game and restores the page.

If a page has no suitable cover, the game brings sandbags. The game runs in the top frame; embedded frames can be used as cover but their contents are not inspected. While scoped, the page is magnified with a temporary CSS transform and cannot be scrolled; elements fixed to the window (such as sticky headers) may shift until you unscope.

Chrome blocks extensions on browser-internal pages, the Chrome Web Store, and certain document viewers. For local files, enable **Allow access to file URLs** in the extension's details in `chrome://extensions`.

SniperShot requests `activeTab`, `scripting` and `storage` only. It runs locally on demand and makes no network requests. The only thing it saves is your career (XP, best score, headshot and game counts) in the browser's local extension storage. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## Package for the Chrome Web Store

`node tools/package.mjs` builds `dist/snipershot-<version>.zip` for upload, plus the same files unpacked in `dist/snipershot-<version>/`. The package contains only the runtime files (manifest, popup, game scripts and icons). The script also checks that every file the manifest and popup reference is included and that no shipped script contains network or remote-code calls. Listing text, permission justifications, privacy answers, screenshots and the promo tile are in [store/STORE_LISTING.md](store/STORE_LISTING.md). SniperShot needs Chrome 114 or newer.

## Development

No build step or dependencies are required; the dev scripts need Node.js 18 or newer. Regenerate the toolbar icons with `node tools/create_icons.mjs`. Run the focused logic checks with `node --test tests/core.test.cjs`. Run the unpacked-extension browser check with `node tests/browser.test.cjs` (set `SNIPER_EXT` to test another build, such as the unzipped store package) (set `CHROME_PATH` if Chrome is not installed at the default macOS path; set `SNIPER_SHOTS` to a folder to save hip, scope and bullet-cam screenshots).
