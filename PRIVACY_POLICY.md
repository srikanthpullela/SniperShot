# Privacy Policy

## Overview

SniperShot is a Chrome extension that overlays a local arcade game on a page when you choose to launch it.

## Data collection and sharing

SniperShot does not collect, sell, or share personal information, browsing history, page content, or analytics. It makes no network requests and loads no remote code or assets. The websites you visit may independently make their own network requests.

## Page access

After you launch a game, the extension reads the positions and visibility of suitable page elements in the active tab to place cover. It does not read form values or the contents of embedded frames. This information and the in-progress game state remain in memory on your device and are discarded when the game ends or the page closes. The game never changes the page's content. While you play, the overlay intercepts clicks; while the scope is raised, the page is magnified with a temporary style on the page's root element, which is removed when you lower the scope or end the game. Sound effects are generated in your browser; nothing is downloaded or recorded.

## Locally stored data

SniperShot stores one small value, `ssCareer`, in Chrome's local extension storage (`chrome.storage.local`): your total XP, best score, total headshots and number of games played. It is used to show your rank and unlock in-game gear. It contains no personal or page information, never leaves your device, and is removed if you clear the extension's data or uninstall it.

## Permissions

- **activeTab** provides temporary access to the current tab when you use the extension.
- **scripting** lets the extension inject and remove the game on that tab.
- **storage** saves your career progress locally, as described above.

The extension requests no persistent host permissions and does not run automatically on websites.
