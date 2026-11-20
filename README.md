# BOATS!

A voxel shipping-company sandbox that runs in the browser. You build a boat company across a randomly generated 100 km × 100 km archipelago: plan routes between towns, carry passengers and freight, keep the fleet reliable and grow the business.

## Running it
Plain JavaScript + Three.js (WebGL 2, vendored in `web/vendor/`). There's no build step. It works in current Firefox and Chrome on desktop and mobile.

```sh
cd web && python3 serve.py 8000   # then open http://localhost:8000 (serve.py disables caching)
```

The game autosaves to the browser's localStorage every in-game month. `?new=1234` starts a fresh game on archipelago seed 1234.

## Deploying
The game is a static site: `web/index.html`, `web/src/` and `web/vendor/`. Any web server can host it.

- **GitHub Pages (automatic):** every push to `main` runs `.github/workflows/pages.yml`, which publishes the game to https://alastairtech.github.io/boats/.
- **A local Debian or Ubuntu machine:** on that machine, clone the repo and run the installer. It installs nginx if needed, copies the game to `/var/www/boats` and sets up an nginx site:
  ```sh
  git clone https://github.com/alastairtech/boats.git && cd boats
  sudo deploy/install-debian.sh              # serves on port 80
  sudo PORT=8080 deploy/install-debian.sh    # or pick another port
  ```
  To update, run `git pull && sudo deploy/install-debian.sh` again. On port 80 it switches off nginx's stock welcome page. To remove it: `sudo rm /etc/nginx/sites-enabled/boats && sudo systemctl reload nginx`.
- **Any server over SSH:** `deploy/deploy.sh user@host:/var/www/boats` copies the files with rsync into an existing web root (nginx, Apache, Caddy…). `deploy/nginx.conf` is a suitable nginx server block (set `root` to that folder).

## The game
- **World:** 1 voxel tile = 25 m. Islands range from about 1 km rocks to large landmasses with mountains, rivers and channels that cut across islands.
- **Towns:** about 100 of them: villages, towns, large towns and port cities. They produce passengers, mail, goods, food, timber and grain. Factories in large towns and cities turn timber and grain into goods. Towns grow when they're well supplied.
- **Boats:** three classes. River boats go nearly anywhere. Coastal boats need open water. Ocean ships need deep-water ports. Nine models unlock from 1950 to 1988. Boats are bought at shipyards (⚓), have running costs, wear out, break down and need servicing.
- **Captains:** every boat needs a captain before it will sail. About 25 parody captains of famous fictional skippers drift through the job market, each with a wage, speed, care and haggling stats, sometimes a weather quirk, and a great deal to say for themselves. Chatter can be muted in the menu.
- **Quests:** about once a week of game time, a town posts an odd job (60 kinds: passengers, cargo, emergencies and pure nonsense) with a big reward and a time limit. Send a suitable boat from the Quests panel; it detours to collect and deliver, then returns to its route. Missing a deadline costs a small penalty. Towns with a quest show 📜 on the map.
- **Routes panel:** boats with the same stops are grouped into routes, with distance sailed against distance paid, round-trip time, load factor, cargo delivered, and income, costs and profit for this year and last.
- **Weather:** clear, fair, overcast, rain, storms and fog roll across the islands. Fog and storms slow boats at sea, and storms wear them out faster. Rivers are sheltered.
- **Time:** one in-game day is 12 seconds at 1× speed. Boats sail fast relative to the calendar, so even long trips take only days or weeks.
- **Routes:** a boat sails a looping list of stops. Each stop's mode is *Load & go*, *Wait for full load*, *Unload & transfer* (for chains between boat classes) or *Unload only*.
- **Money:** pay depends on straight-line distance and delivery time. Towns rate your service on how often you collect, how fast your boats are and how much cargo is left waiting, and better ratings bring more cargo. There's a loan, monthly accounts and per-boat profit.

### Controls
| Input | Action |
| --- | --- |
| Drag | Pan the map |
| Pinch / scroll wheel | Zoom (from one boat out to the whole archipelago) |
| Two-finger twist / right-drag | Rotate |
| Tap a town or boat | Inspect it |
| ⏸ ▶ ▶▶ 4× 8× | Game speed (keyboard: Space, 1–4) |

### Code map (`web/src/`)
- `archipelago.js`: world generation (coarse height field, islands, rivers/channels, navigation grid, towns, jetties) and on-demand fine terrain queries
- `nav.js`: A* pathfinding for each boat class, with line-of-sight smoothing at sea and a route cache
- `sim.js`: the company simulation (calendar, cargo, ratings, boats and orders, breakdowns, servicing, upgrades, finances, save/load)
- `chunks.js`: streamed 32×32 voxel chunks with scenery, town buildings and ambient wildlife
- `water.js`: animated pixel-art sea with waves and a per-waterway sea-state map
- `quests.js`: the quest templates and their texts
- `captains.js`: the captain roster, stats, quirks and lines
- `lod.js`: mid-distance simplified voxel chunks
- `weather.js` / `sky.js`: weather simulation, and its clouds, rain, lightning, fog and light
- `view.js`: Three.js scene (overview map with level of detail, jetties, fleet rendering, labels, camera, picking)
- `ui.js` + `index.html`: top bar, town/boat/shipyard/fleet/towns/finance panels, route editor, news
- `models.js` / `voxel.js`: voxel models (ships, buildings, props, animals) and the mesher
- `fx.js`: voxel particles (smoke, wake, splashes, fish, sparkles, birds)
- `main.js`: boot and map input

## Original Godot version
The 2D isometric Godot 4.7 version is still in this folder and is no longer developed. Run it with `godot` from here.

### Godot controls
| Key | Action |
| --- | --- |
| WASD / Arrows | Steer (screen-relative; the current carries you downstream) |
| E / Space | Dock at a nearby pier / cast off |
| 1–3 | Accept a job while docked |
| U | Upgrade cargo hold (at the harbour) |
| N | New river once the route is complete (Shift+N to skip early) |

### Godot code map (`scripts/`)
- `river_gen.gd`: procedural generation of the river, lakes, islands, towns, landmarks, scenery and wildlife
- `world.gd`: builds nodes from the generated data and runs the docking/jobs gameplay
- `terrain_chunk.gd`: draws the isometric ground tiles in bands of rows
- `prop.gd` / `critter.gd` / `boat.gd`: pixel art drawn in code for scenery, animals and people, and the player's boat
- `water_fx.gd` / `sky_fx.gd`: sparkles, wake, jumping fish, smoke and bird flocks
- `hud.gd`: full-resolution UI drawn over the 3× upscaled pixel viewport

Dev helper: `godot -- --shot=/tmp/prefix` saves screenshots at frames 120/600/1200 and then quits.
