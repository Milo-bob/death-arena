// Achievements: kleine Aufgaben mit Icon, Namen (Minecraft-Stil: Gags/Anspielungen, verraten nicht direkt, was zu tun ist) und kurzer Beschreibung,
// die nur beim Ueberfahren/Auswaehlen im Baum gezeigt wird. Jedes gibt einmalig eine kleine Belohnung (Cores oder ein Cosmetic).
// Daten: ACH_BRANCHES + ACH_LIST (hier, damit Namen und Zahlen beieinander stehen). Spielstand: Save.data.ach = { done, cnt, seen }.
//
// Zaehler (key): entweder abgeleitet aus dem Spielstand (ACH_DERIVED) oder ein Zaehler in Save.data.ach.cnt, den Haken im Spiel fuellen:
//   Ach.add(key, n)   zaehlt hoch          Ach.max(key, v)   merkt den Hoechstwert          Ach.mark(key, item)   Menge verschiedener Dinge
// Ein Achievement ist erreicht, sobald value(key) >= need. Im Tutorial und in Cheat-Laeufen (G.cheated) zaehlen die Haken nicht.
// Neues Achievement = Eintrag in ACH_LIST (Zeile gehoert zu einem Zweig 'br'), ggf. einen Haken setzen. Bis zu 9 pro Zweig passen auf den Bildschirm,
// es sind 6 Zweige gleichzeitig sichtbar, der Rest scrollt (W/S, Mausrad).
// Dynamische Zaehler (werden in runEnd/update/bossDown gefuellt): d_<KILLER> = Tode durch diese Quelle (Stats.lastSrc), kw_<WAFFE> = Kills mit dieser Waffe (Stats.kills),
// bk_<bossTyp> = besiegte Bosse dieses Typs, hb_<held> = Bosse mit diesem Helden, t_<held> / tm_<karte> = laengste Zeit mit Held / auf Karte, art_<artefakt> = Artefakt-Einsaetze.

const ACH_BRANCHES = [
  { id: 'run',   label: 'SURVIVAL' },
  { id: 'fight', label: 'COMBAT' },
  { id: 'boss',  label: 'BOSSES' },
  { id: 'grow',  label: 'GROWTH' },
  { id: 'odd',   label: 'DUMB WAYS' },
  { id: 'dumbd', label: 'DUMB DEATHS' },
  { id: 'habit', label: 'DUMB HABITS' },
  { id: 'world', label: 'WORLD' },
  { id: 'maps',  label: 'MAPS' },
  { id: 'hero',  label: 'HEROES' },
  { id: 'gear',  label: 'LOADOUT' },
  { id: 'grind', label: 'GRIND' },
];
const ACH_VISIBLE = 6;          // Zweige gleichzeitig auf dem Bildschirm
const ACH_FAST_BOSS = 25;       // Sekunden fuer "Speedrun Strats"
const ACH_QUICK_DEATH = 30;     // Sekunden fuer "Skill Issue"

// reward: { cores: n } oder { secret: 'kategorie:id' } (geheimes Cosmetic, nur ueber das Achievement, gewaehlt im Inventar)
const ACH_LIST = [
  // ---- SURVIVAL ----
  { id: 'student',   br: 'run', name: 'STUDENT OF PAIN',        desc: 'Complete the tutorial.',                         icon: 'shot',         key: 'tutorial',  need: 1,    reward: { cores: 10 } },
  { id: 'hello',     br: 'run', name: 'HELLO, VOID',            desc: 'Finish your first run.',                         icon: 'player',       key: 'runs',      need: 1,    reward: { cores: 10 } },
  { id: 'skill',     br: 'run', name: 'SKILL ISSUE',            desc: 'Die in under 30 seconds.',                       icon: 'circle',       key: 'quickDeath', need: 1,   reward: { cores: 10 } },
  { id: 'kicking',   br: 'run', name: 'STILL KICKING',         desc: 'Survive 2 minutes in one run.',                  icon: 'bubble',       key: 'time',      need: 120,  reward: { cores: 15 } },
  { id: 'halfway',   br: 'run', name: 'HALFWAY DECENT',        desc: 'Survive 7 minutes in one run.',                  icon: 'ult1',         key: 'time',      need: 420,  reward: { cores: 30 } },
  { id: 'beast',     br: 'run', name: 'NUMBER OF THE BEAST',   desc: 'Reach 666 seconds in one run.',                  icon: 'deathSecret1', key: 'time',      need: 666,  reward: { cores: 66 } },
  { id: 'date',      br: 'run', name: 'DATE WITH DEATH',       desc: 'Make it to the final boss.',                     icon: 'deathSecret2', key: 'finalBoss', need: 1,    reward: { cores: 50 } },
  { id: 'groundhog', br: 'run', name: 'GROUNDHOG DAY',         desc: 'Finish 25 runs.',                                icon: 'spawnPoint',   key: 'runs',      need: 25,   reward: { cores: 40 } },
  { id: 'grass',     br: 'run', name: 'TOUCH GRASS',           desc: 'Finish 100 runs.',                               icon: 'heal',         key: 'runs',      need: 100,  reward: { cores: 100 } },

  // ---- COMBAT ----
  { id: 'blood1',    br: 'fight', name: 'FIRST BLOOD',          desc: 'Defeat an enemy.',                               icon: 'circle',       key: 'kills',     need: 1,    reward: { cores: 5 } },
  { id: 'mosh',      br: 'fight', name: 'MOSH PIT',             desc: 'Defeat 100 enemies in one run.',                 icon: 'splitter',     key: 'killsRun',  need: 100,  reward: { cores: 25 } },
  { id: 'pest',      br: 'fight', name: 'PEST CONTROL',         desc: 'Defeat 250 enemies in total.',                   icon: 'triangle',     key: 'kills',     need: 250,  reward: { cores: 20 } },
  { id: 'combo',     br: 'fight', name: 'COMBO BREAKER',        desc: 'Defeat 15 enemies in a row without being hit.',  icon: 'sword',        key: 'combo',     need: 15,   reward: { cores: 25 } },
  { id: 'redbutton', br: 'fight', name: 'THE BIG RED BUTTON',   desc: 'Use your Ultimate 10 times.',                    icon: 'ult1',         key: 'ult',       need: 10,   reward: { cores: 15 } },
  { id: 'bloodyhell', br: 'fight', name: 'BLOODY HELL',         desc: 'Set off Bloodburst.',                            icon: 'blood1',       key: 'bloodburst', need: 1,   reward: { cores: 15 } },
  { id: 'annihil',   br: 'fight', name: 'TOTAL ANNIHILATION',   desc: 'Defeat 3000 enemies in total.',                  icon: 'square',       key: 'kills',     need: 3000, reward: { cores: 60 } },
  { id: 'elite',     br: 'fight', name: 'ELITE HUNTER',         desc: 'Defeat 5 elite enemies.',                        icon: 'tank',         key: 'elites',    need: 5,    reward: { cos: 'enemy:frostbite' } },
  { id: 'allfoes',   br: 'fight', name: "GOTTA KILL 'EM ALL",   desc: 'Defeat every kind of regular enemy.',            icon: 'necro',        key: 'types',     need: 14,   reward: { cos: 'skin:ghost' } },

  // ---- BOSSES ----
  { id: 'giant',     br: 'boss', name: 'GIANT SLAYER',          desc: 'Defeat a boss.',                                 icon: 'octagon',      key: 'bosses',    need: 1,    reward: { cores: 25 } },
  { id: 'hattrick',  br: 'boss', name: 'HAT TRICK',             desc: 'Defeat 3 bosses in one run.',                    icon: 'kite',         key: 'bossesRun', need: 3,    reward: { cores: 30 } },
  { id: 'speed',     br: 'boss', name: 'SPEEDRUN STRATS',       desc: 'Defeat a boss in under 25 seconds.',             icon: 'turret',       key: 'bossFast',  need: 1,    reward: { cores: 40 } },
  { id: 'untouch',   br: 'boss', name: 'CAN\'T TOUCH THIS',     desc: 'Defeat a boss without taking damage.',           icon: 'barrierIcon',  key: 'bossNoHit', need: 1,    reward: { cores: 50 } },
  { id: 'fullhouse', br: 'boss', name: 'FULL HOUSE',            desc: 'Defeat six bosses in one run.',                  icon: 'summoner',     key: 'bossesRun', need: 6,    reward: { cores: 60 } },
  { id: 'holiday',   br: 'boss', name: 'DEATH TAKES A HOLIDAY', desc: 'Defeat Death himself.',                          icon: 'deathSecret3', key: 'wins',      need: 1,    reward: { cores: 100 } },
  { id: 'encore',    br: 'boss', name: 'ENCORE!',               desc: 'Defeat Death 3 times.',                          icon: 'deathSecret4', key: 'wins',      need: 3,    reward: { cos: 'skin:glitch' } },
  { id: 'bingo',     br: 'boss', name: 'BOSS BINGO',            desc: 'Defeat 6 different kinds of boss.',              icon: 'kite',         key: 'bossTypes', need: 6,    reward: { cores: 60 } },
  { id: 'gotcha',    br: 'boss', name: 'GOTTA BEAT THEM ALL',   desc: 'Defeat every kind of boss, map bosses too.',     icon: 'turret',       key: 'bossTypes', need: 12,   reward: { cos: 'skin:scorch' } },

  // ---- GROWTH ----
  { id: 'inventory', br: 'grow', name: 'TAKING INVENTORY',      desc: 'Buy a new weapon or implant.',                   icon: 'beamIcon',     key: 'itemsOwned', need: 3,   reward: { cores: 10 } },
  { id: 'upgrade',   br: 'grow', name: 'GETTING AN UPGRADE',    desc: 'Buy a permanent stat upgrade.',                  icon: 'thrustersIcon', key: 'upgrades', need: 1,    reward: { cos: 'blade:lime' } },
  { id: 'levelirl',  br: 'grow', name: 'LEVELING UP IRL',       desc: 'Level up a weapon, implant or ability.',         icon: 'overclockIcon', key: 'gearLv',   need: 1,    reward: { cores: 15 } },
  { id: 'drip',      br: 'grow', name: 'DRIP CHECK',            desc: 'Buy a cosmetic.',                                icon: 'luckyIcon',    key: 'cosBuy',    need: 1,    reward: { cores: 15 } },
  { id: 'levelhead', br: 'grow', name: 'LEVEL HEADED',          desc: 'Reach level 10 in one run.',                     icon: 'surgeIcon',    key: 'lvl',       need: 10,   reward: { cores: 20 } },
  { id: 'newskin',   br: 'grow', name: 'NEW SKIN, WHO DIS?',    desc: 'Unlock a new hero.',                             icon: 'heroSpecter',  key: 'heroes',    need: 1,    reward: { cores: 30 } },
  { id: 'evolve',    br: 'grow', name: 'EVOLVE OR DIE',         desc: 'Evolve a weapon in a run.',                      icon: 'bladesIcon',   key: 'evolved',   need: 1,    reward: { cos: 'blade:meteor' } },
  { id: 'maxed',     br: 'grow', name: 'MAXED OUT',             desc: 'Take any gear to its maximum level.',            icon: 'capacitorIcon', key: 'gearLv',   need: 5,    reward: { cos: 'skin:venom' } },
  { id: 'moneybags', br: 'grow', name: 'MONEYBAGS',             desc: 'Hold 1000 credits at once.',                       icon: 'buffMagnet',   key: 'cores',     need: 1000, reward: { cos: 'skin:lime' } },

  // ---- DUMB WAYS ----
  { id: 'statue',    br: 'odd', name: 'PROFESSIONAL STATUE',    desc: 'Get hurt for standing still.',                   icon: 'player',       key: 'afk',       need: 1,    reward: { cores: 10 } },
  { id: 'ragequit',  br: 'odd', name: 'RAGE QUIT',              desc: 'Give up a run.',                                 icon: 'dmg20',        key: 'gaveUp',    need: 1,    reward: { cores: 10 } },
  { id: 'lava',      br: 'odd', name: 'THE FLOOR IS LAVA',      desc: 'Be killed by a lava vent.',                      icon: 'fireIcon',     key: 'killLava',  need: 1,    reward: { cores: 15 } },
  { id: 'acid',      br: 'odd', name: 'EW, CHEMISTRY',          desc: 'Be killed by an acid pool.',                     icon: 'molotovIcon',  key: 'killAcid',  need: 1,    reward: { cores: 15 } },
  { id: 'meteor',    br: 'odd', name: 'WELL, THAT HAPPENED',    desc: 'Be killed by a meteor.',                         icon: 'bombardIcon',  key: 'killMeteor', need: 1,   reward: { cores: 15 } },
  { id: 'notoday',   br: 'odd', name: 'NOT TODAY',              desc: 'Get saved by the Revival Core.',                 icon: 'phoenixIcon',  key: 'revive',    need: 1,    reward: { cores: 25 } },
  { id: 'postmortal', br: 'odd', name: 'POSTMORTAL',            desc: 'Get saved by the Revival Core 64 times.',        icon: 'phoenixIcon',  key: 'revive',    need: 64,   reward: { secret: 'revive:totem' } },
  { id: 'crates',    br: 'odd', name: "PANDORA'S BOX",          desc: 'Smash 25 crates.',                               icon: 'spawner',      key: 'crates',    need: 25,   reward: { cores: 20 } },
  { id: 'thread',    br: 'odd', name: 'HANGING BY A THREAD',    desc: 'Spend 10 seconds under 10 HP in one run.',       icon: 'aegisIcon',    key: 'edge',      need: 10,   reward: { cores: 30 } },

  // ---- WORLD ----
  { id: 'surge',     br: 'world', name: 'SWARM SWEEPER',        desc: 'Survive a Swarm Surge.',                         icon: 'circle',       key: 'evFlood',   need: 1,    reward: { cores: 20 } },
  { id: 'eclipse',   br: 'world', name: 'CRIMSON TIDE',         desc: 'Survive a Crimson Eclipse.',                     icon: 'blood1',       key: 'evMoon',    need: 1,    reward: { cores: 20 } },
  { id: 'rain',      br: 'world', name: 'RAIN CHECK',           desc: 'Survive a meteor shower.',                       icon: 'bombardIcon',  key: 'evMeteor',  need: 1,    reward: { cores: 20 } },
  { id: 'walls',     br: 'world', name: 'WALLS CLOSING IN',     desc: 'Survive the arena shrinking.',                   icon: 'barrierIcon',  key: 'evCollapse', need: 1,   reward: { cores: 20 } },
  { id: 'hotstuff',  br: 'world', name: 'HOT STUFF',            desc: 'Unlock Ember Foundry.',                          icon: 'fireIcon',     key: 'maps',      need: 2,    reward: { cores: 25 } },
  { id: 'chemrom',   br: 'world', name: 'CHEMICAL ROMANCE',     desc: 'Unlock Toxic Core.',                             icon: 'buffRegen',    key: 'maps',      need: 3,    reward: { cores: 40 } },
  { id: 'void',      br: 'world', name: 'INTO THE VOID',        desc: 'Finish an Endless Mode run.',                    icon: 'spawnPoint',   key: 'infRuns',   need: 1,    reward: { cores: 20 } },
  { id: 'neverend',  br: 'world', name: 'NEVER-ENDING STORY',   desc: 'Survive 15 minutes in Endless Mode.',            icon: 'ult2',         key: 'timeInf',   need: 900,  reward: { cores: 50 } },
  { id: 'coldopen',  br: 'world', name: 'COLD OPEN',            desc: 'Unlock Cryo Station.',                           icon: 'frostIcon',    key: 'maps',      need: 4,    reward: { cores: 40 } },

  // ---- DUMB DEATHS (wer oder was dich erwischt hat) ----
  { id: 'dcircle',   br: 'dumbd', name: 'SERIOUSLY?',           desc: 'Be killed by a plain Circle.',                   icon: 'circle',       key: 'd_CIRCLE',  need: 1,    reward: { cores: 10 } },
  { id: 'dbomber',   br: 'dumbd', name: 'KABOOM, BABY',         desc: 'Be killed by a Bomber.',                         icon: 'bombardIcon',  key: 'd_BOMBER',  need: 1,    reward: { cores: 15 } },
  { id: 'dmine',     br: 'dumbd', name: 'WATCH YOUR STEP',      desc: 'Be killed by a mine.',                           icon: 'thornsIcon',   key: 'd_MINE',    need: 1,    reward: { cores: 15 } },
  { id: 'dleech',    br: 'dumbd', name: "WHAT'S ON MY BACK?",   desc: 'Be killed by a Bloodsucker.',                    icon: 'vampireIcon',  key: 'd_BLOODSUCKER', need: 1, reward: { cores: 15 } },
  { id: 'dtank',     br: 'dumbd', name: 'BIG BOY PROBLEMS',     desc: 'Be killed by a Tank.',                           icon: 'tank',         key: 'd_TANK',    need: 1,    reward: { cores: 15 } },
  { id: 'dsniper',   br: 'dumbd', name: 'NO SCOPE NEEDED',      desc: 'Be killed by a Sniper.',                         icon: 'scannerIcon',  key: 'd_SNIPER',  need: 1,    reward: { cores: 15 } },
  { id: 'dstill',    br: 'dumbd', name: 'JUST STANDING THERE',  desc: 'Die from standing still.',                       icon: 'player',       key: 'd_STANDING STILL', need: 1, reward: { cores: 20 } },
  { id: 'dcloud',    br: 'dumbd', name: 'AIR QUALITY INDEX',    desc: 'Be killed by a toxic cloud.',                    icon: 'buffRegen',    key: 'd_TOXIC CLOUD', need: 1, reward: { cores: 20 } },
  { id: 'dphantom',  br: 'dumbd', name: 'NOT EVEN FAIR',        desc: 'Be killed by a Phantom.',                        icon: 'blinkIcon',    key: 'd_PHANTOM', need: 1,    reward: { cos: 'skin:obsidian' } },

  // ---- DUMB HABITS (was du so treibst) ----
  { id: 'pacifist',  br: 'habit', name: 'PEACE WAS NEVER AN OPTION', desc: 'Survive 2 minutes without attacking once.', icon: 'aegisIcon',    key: 'pacifist',  need: 1,    reward: { cos: 'skin:sunset' } },
  { id: 'hugger',    br: 'habit', name: 'WALL HUGGER',          desc: 'Spend 30 seconds pressed against the arena edge.', icon: 'barrierIcon', key: 'wallhug', need: 30,  reward: { cores: 20 } },
  { id: 'bag',       br: 'habit', name: 'PUNCHING BAG',         desc: 'Get hit 500 times in total.',                    icon: 'dmg20',        key: 'hitsTaken', need: 500,  reward: { cores: 40 } },
  { id: 'pauses',    br: 'habit', name: 'NEED A MOMENT',        desc: 'Pause the game 20 times.',                       icon: 'ult1',         key: 'pauses',    need: 20,   reward: { cores: 15 } },
  { id: 'selfpat',   br: 'habit', name: 'SELF-CONGRATULATION',  desc: 'Open this screen 10 times.',                     icon: 'heroArchon',   key: 'achOpens',  need: 10,   reward: { cores: 10 } },
  { id: 'switchy',   br: 'habit', name: 'COMMITMENT ISSUES',    desc: 'Switch weapons 200 times.',                      icon: 'sword',        key: 'switches',  need: 200,  reward: { cores: 25 } },
  { id: 'legday',    br: 'habit', name: 'LEG DAY',              desc: 'Run 20000 units in total.',                      icon: 'buffHaste',    key: 'dist',      need: 20000, reward: { cores: 20 } },
  { id: 'marathon',  br: 'habit', name: 'MARATHON RUNNER',      desc: 'Run 100000 units in total.',                     icon: 'thrustersIcon', key: 'dist',     need: 100000, reward: { cos: 'skin:bubblegum' } },
  { id: 'finger',    br: 'habit', name: 'FINGER WORKOUT',       desc: 'Hold the attack button for 10 minutes in total.', icon: 'shot',        key: 'attackT',   need: 600,  reward: { cos: 'skin:copper' } },

  // ---- MAPS ----
  { id: 'tour',      br: 'maps', name: 'WORLD TOUR',            desc: 'Play a run on every map.',                       icon: 'spawnPoint',   key: 'mapsPlayed', need: 4,   reward: { cores: 40 } },
  { id: 'meltdown',  br: 'maps', name: 'MELTDOWN',              desc: 'Survive 5 minutes on Ember Foundry.',            icon: 'fireIcon',     key: 'tm_foundry', need: 300, reward: { cores: 40 } },
  { id: 'hazmat',    br: 'maps', name: 'HAZMAT SUIT',           desc: 'Survive 5 minutes on Toxic Core.',               icon: 'molotovIcon',  key: 'tm_toxic',  need: 300,  reward: { cores: 50 } },
  { id: 'iceice',    br: 'maps', name: 'ICE ICE BABY',          desc: 'Survive 5 minutes on Cryo Station.',             icon: 'frostIcon',    key: 'tm_cryo',   need: 300,  reward: { cores: 60 } },
  { id: 'abszero',   br: 'maps', name: 'ABSOLUTE ZERO',         desc: 'Survive 10 minutes on Cryo Station.',            icon: 'ult3',         key: 'tm_cryo',   need: 600,  reward: { cores: 80 } },
  { id: 'sauna',     br: 'maps', name: 'SAUNA',                 desc: 'Get hit by lava vents 10 times in total.',       icon: 'fireIcon',     key: 'lavaHits',  need: 10,   reward: { cores: 25 } },
  { id: 'acidbath',  br: 'maps', name: 'ACID BATH',             desc: 'Get hit by acid pools 20 times in total.',       icon: 'buffRegen',    key: 'acidHits',  need: 20,   reward: { cores: 25 } },
  { id: 'coldwar',   br: 'maps', name: 'THE COLD WAR',          desc: 'Defeat the Frost Sentinel.',                     icon: 'octagon',      key: 'bk_frost',  need: 1,    reward: { cores: 60 } },
  { id: 'lookback',  br: 'maps', name: "DON'T LOOK BACK",       desc: 'Defeat the Frost Wraith.',                       icon: 'kite',         key: 'bk_wraith', need: 1,    reward: { cores: 60 } },

  // ---- HEROES ----
  { id: 'identity',  br: 'hero', name: 'IDENTITY CRISIS',       desc: 'Finish runs with 2 different heroes.',           icon: 'heroSpecter',  key: 'heroRuns',  need: 2,    reward: { cores: 30 } },
  { id: 'roster',    br: 'hero', name: 'FULL ROSTER',           desc: 'Finish runs with all 6 heroes.',                 icon: 'heroAlchemist', key: 'heroRuns', need: 6,    reward: { cos: 'skin:midnight' } },
  { id: 'thewall',   br: 'hero', name: 'THE WALL',              desc: 'Defeat 3 bosses as Bulwark.',                    icon: 'heroBulwark',  key: 'hb_bulwark', need: 3,   reward: { cores: 50 } },
  { id: 'fastfrag',  br: 'hero', name: 'FAST AND FRAGILE',      desc: 'Survive 7 minutes as Specter.',                  icon: 'riftIcon',     key: 't_specter', need: 420,  reward: { cores: 50 } },
  { id: 'brewmstr',  br: 'hero', name: 'BREWMASTER',            desc: 'Use the Catalyst 10 times.',                     icon: 'catalystIcon', key: 'art_catalyst', need: 10, reward: { cores: 40 } },
  { id: 'timeout',   br: 'hero', name: 'TIME OUT',              desc: 'Use Chrono Lock 10 times.',                      icon: 'chronoIcon',   key: 'art_chrono', need: 10,  reward: { cores: 40 } },
  { id: 'crown',     br: 'hero', name: 'HEAVY IS THE CROWN',    desc: 'Survive 5 minutes as Harbinger.',                icon: 'heroHarbinger', key: 't_harbinger', need: 300, reward: { cores: 100 } },
  { id: 'greed',     br: 'hero', name: 'GREED IS GOOD',         desc: 'Earn 1000 credits in one run as Harbinger.',       icon: 'buffMagnet',   key: 'earn_harbinger', need: 1000, reward: { cores: 200 } },

  // ---- LOADOUT ----
  { id: 'bladerun',  br: 'gear', name: 'BLADE RUNNER',          desc: 'Defeat 500 enemies with the Plasma Blade.',      icon: 'sword',        key: 'kw_PLASMA BLADE', need: 500, reward: { cores: 30 } },
  { id: 'clickpt',   br: 'gear', name: 'POINT AND CLICK',       desc: 'Defeat 500 enemies with the Blaster.',           icon: 'shot',         key: 'kw_BLASTER', need: 500, reward: { cores: 30 } },
  { id: 'beamme',    br: 'gear', name: 'BEAM ME UP',            desc: 'Defeat 100 enemies with the Beam.',              icon: 'beamIcon',     key: 'kw_BEAM',   need: 100,  reward: { cores: 30 } },
  { id: 'firehole',  br: 'gear', name: 'FIRE IN THE HOLE',      desc: 'Defeat 100 enemies with the Rocket Blaster.',    icon: 'rocketIcon',   key: 'kw_ROCKET BLASTER', need: 100, reward: { cores: 30 } },
  { id: 'burnbaby',  br: 'gear', name: 'BURN, BABY, BURN',      desc: 'Defeat 100 enemies with the Thermite Flask.',    icon: 'molotovIcon',  key: 'kw_THERMITE FLASK', need: 100, reward: { cores: 30 } },
  { id: 'shocking',  br: 'gear', name: 'SHOCKING, REALLY',      desc: 'Defeat 100 enemies with the Tesla Chain.',       icon: 'chainIcon',    key: 'kw_TESLA CHAIN', need: 100, reward: { cores: 30 } },
  { id: 'ultpower',  br: 'gear', name: 'ULTIMATE POWER',        desc: 'Defeat 50 enemies with the Ultimate.',           icon: 'ult2',         key: 'kw_ULTIMATE', need: 50,  reward: { cores: 30 } },
  { id: 'swiss',     br: 'gear', name: 'SWISS ARMY KNIFE',      desc: 'Defeat enemies with 8 different weapons in one run.', icon: 'bladesIcon', key: 'weaponsRun', need: 8, reward: { cores: 50 } },
  { id: 'minimal',   br: 'gear', name: 'MINIMALIST',            desc: 'Survive 5 minutes with no heavy weapon and no implant.', icon: 'player', key: 'minimal', need: 1,    reward: { cores: 60 } },

  // ---- GRIND ----
  { id: 'spree',     br: 'grind', name: 'KILLING SPREE',        desc: 'Defeat 10000 enemies in total.',                 icon: 'splitter',     key: 'kills',     need: 10000, reward: { cores: 100 } },
  { id: 'farmer',    br: 'grind', name: 'BOSS FARMER',          desc: 'Defeat 100 bosses in total.',                    icon: 'summoner',     key: 'bosses',    need: 100,  reward: { cores: 100 } },
  { id: 'getlife',   br: 'grind', name: 'GET A LIFE',           desc: 'Finish 250 runs.',                               icon: 'heal',         key: 'runs',      need: 250,  reward: { cores: 150 } },
  { id: 'serial',    br: 'grind', name: 'SERIAL WINNER',        desc: 'Defeat Death 10 times.',                         icon: 'deathSecret3', key: 'wins',      need: 10,   reward: { cores: 200 } },
  { id: 'spend1',    br: 'grind', name: 'SPENDING SPREE',       desc: 'Buy 50 stat upgrade levels.',                    icon: 'thrustersIcon', key: 'upgrades', need: 50,   reward: { cores: 50 } },
  { id: 'spend2',    br: 'grind', name: 'BIG SPENDER',          desc: 'Buy 150 stat upgrade levels.',                   icon: 'luckyIcon',    key: 'upgrades',  need: 150,  reward: { cores: 100 } },
  { id: 'collector', br: 'grind', name: 'COLLECTOR',            desc: 'Complete 15 milestones.',                        icon: 'barrierIcon',  key: 'msCount',   need: 15,   reward: { cores: 75 } },
  { id: 'lvl20',     br: 'grind', name: 'OVER NINE... TEEN',    desc: 'Reach level 20 in one run.',                     icon: 'surgeIcon',    key: 'lvl',       need: 20,   reward: { cores: 75 } },
  { id: 'hunter',    br: 'grind', name: 'ACHIEVEMENT HUNTER',   desc: 'Unlock 60 achievements.',                        icon: 'phoenixIcon',  key: 'achDone',   need: 60,   reward: { cores: 300 } },
];
// Cosmetics gibt es nur noch fuer Credits: Belohnungen, die frueher ein Cosmetic waren, zahlen dessen Wert in Credits aus (cosRewardCredits in config.js)
for (const a of ACH_LIST) if (a.reward && a.reward.cos) a.reward = { cores: cosRewardCredits(a.reward.cos) };

const ACH_TIME_KEYS = /^(time|timeInf|tm_.*|attackT)$/;       // Zaehler in Sekunden: als m:ss anzeigen

// Zaehler, die direkt aus dem Spielstand folgen (kein eigener Haken noetig)
const ACH_DERIVED = {
  runs: () => Save.data.runs || 0,
  wins: () => Save.data.wins || 0,
  tutorial: () => (Save.data.tutorialDone ? 1 : 0),
  kills: () => ((Save.data.stats && Save.data.stats.kills) || 0) + (Ach.running() ? G.kills : 0),
  bosses: () => ((Save.data.stats && Save.data.stats.bosses) || 0) + (Ach.running() ? G.bosses : 0),
  itemsOwned: () => Object.keys(Save.data.items.owned).length,                                           // Start: Schwert + Blaster
  upgrades: () => Object.values(Save.data.upgrades || {}).reduce((s, v) => s + v, 0),
  gearLv: () => Math.max(0, ...Object.values(Save.data.gear || {}).map((g) => g.lv || 0)),
  heroes: () => Object.keys(Save.data.heroes || {}).length,
  maps: () => CFG.maps.reduce((n, m, i) => n + (i === 0 || Save.mapBestTime(i - 1) >= Save.mapNeed(i) ? 1 : 0), 0),
  types: () => Object.keys(Ach.data().cnt.types || {}).length,
  bossTypes: () => Object.keys(Ach.data().cnt.bossTypes || {}).length,
  heroRuns: () => Object.keys(Ach.data().cnt.heroRuns || {}).length,
  mapsPlayed: () => Object.keys(Ach.data().cnt.mapsPlayed || {}).length,
  cores: () => Save.data.souls || 0,
  msCount: () => Object.keys(Save.data.milestones || {}).length,
  achDone: () => Ach.doneCount(),
};

const Ach = {
  toasts: [], dirty: false, scanT: 0, lowT: 0, prev: {}, sel: { r: 0, c: 0 },
  TOAST_LIFE: 4.2,

  data() {
    const d = Save.data;
    if (!d.ach) d.ach = { done: {}, cnt: {}, seen: 0 };
    return d.ach;
  },
  running() { return G.mode === 'play' && this.ok(); },
  ok() { return !(typeof Tutorial !== 'undefined' && Tutorial.active) && !G.cheated && !Save.srOn; },       // Tutorial, Cheat-Laeufe und Speedruns zaehlen nicht
  done(id) { return !!this.data().done[id]; },
  total() { return ACH_LIST.length; },
  doneCount() { return ACH_LIST.filter((a) => this.done(a.id)).length; },
  unseen() { return Math.max(0, this.doneCount() - (this.data().seen || 0)); },
  value(key) { return ACH_DERIVED[key] ? ACH_DERIVED[key]() : this.data().cnt[key] || 0; },
  rows() { return ACH_BRANCHES.map((b) => ACH_LIST.filter((a) => a.br === b.id)); },

  // ---- Haken ----
  add(key, n = 1, force = false) {
    if (!force && !this.ok()) return;
    const c = this.data().cnt; c[key] = (c[key] || 0) + n; this.dirty = true;
  },
  max(key, v) {
    if (!this.ok()) return;
    const c = this.data().cnt;
    if (v > (c[key] || 0)) { c[key] = v; this.dirty = true; }
  },
  mark(key, item) {
    if (!this.ok()) return;
    const c = this.data().cnt, s = c[key] || (c[key] = {});
    if (!s[item]) { s[item] = 1; this.dirty = true; }
  },
  acc(key, v) { const c = this.data().cnt; c[key] = (c[key] || 0) + v; },       // wie add, aber ohne Neupruefung (fuer Werte, die jedes Bild wachsen; geprueft wird ohnehin einmal pro Sekunde)
  kill(e) { if (e && e.elite) this.add('elites'); else if (e && e.type) this.mark('types', e.type); },       // Elite-Gegner zaehlen nicht zu "jede Art" (types)
  bossDown(b) {                                           // Boss besiegt (vor G.endBossFight): Dauer und Schaden im Kampf
    if (!this.ok() || !b || b.type === 'reaper') return;
    this.mark('bossTypes', b.type); this.add('bk_' + b.type); this.add('hb_' + Hero.id());
    if (G.bossTimer > 0 && G.bossTimer < ACH_FAST_BOSS) this.add('bossFast');
    if (Stats.fight && Stats.taken <= Stats.fight.dmg0) this.add('bossNoHit');
  },
  // Lauf zu Ende (Tod, Aufgeben, Sieg), aufgerufen aus G.die / G.win nach der Abrechnung
  runEnd(win) {
    if (!this.ok()) return;
    const k = Stats.lastSrc;
    if (!win) {
      if (k === 'GAVE UP') this.add('gaveUp');
      else if (G.time < ACH_QUICK_DEATH) this.add('quickDeath');
      if (k === 'LAVA VENT') this.add('killLava');
      if (k === 'ACID POOL') this.add('killAcid');
      if (k === 'METEOR') this.add('killMeteor');
    }
    if (Stats.dmg && Stats.dmg['STANDING STILL'] > 0) this.add('afk');
    if (G.infinite) this.add('infRuns');
    // Dumb Deaths, Loadout, Heroes, Maps
    if (!win && k) this.add('d_' + k);
    const hid = Hero.id();
    this.mark('heroRuns', hid); this.mark('mapsPlayed', G.map.id);
    if (hid === 'harbinger') this.max('earn_harbinger', G.earned || 0);
    for (const [name, n] of Object.entries(Stats.kills || {})) this.add('kw_' + name, n);
    this.max('weaponsRun', Object.keys(Stats.kills || {}).length);
    this.add('hitsTaken', Stats.hitCount || 0);
    this.add('lavaHits', (Stats.hits && Stats.hits['LAVA VENT']) || 0);
    this.add('acidHits', (Stats.hits && Stats.hits['ACID POOL']) || 0);
    this.scan();
  },

  beginRun() { this.lowT = 0; this.prev = {}; this.run = { attacked: false, px: null, py: null, weapon: null, cd: {} }; },

  // Pro Bild im Lauf: Hoechstwerte und Welt-Events beobachten
  update(dt) {
    if (!this.ok()) return;
    const p = G.player;
    this.max('combo', G.combo); this.max('killsRun', G.kills); this.max('bossesRun', G.bosses); this.max('lvl', Xp.level);
    this.max('time', G.time); if (G.infinite) this.max('timeInf', G.time);
    if (G.finalStarted) this.max('finalBoss', 1);
    if (p) {
      if (p.evolved && Object.values(p.evolved).some(Boolean)) this.max('evolved', 1);
      if (p.hp > 0 && p.hp < 10) { this.lowT += dt; this.max('edge', this.lowT); }
      this.updateHabits(dt, p);
    }
    // Event beendet, waehrend man noch lebt = ueberlebt
    const ev = { flood: 'evFlood', bloodMoon: 'evMoon', meteorShower: 'evMeteor', collapse: 'evCollapse' };
    for (const f of Object.keys(ev)) {
      if (this.prev[f] && !G[f] && G.mode === 'play' && p && p.hp > 0 && !G.bossFight) this.add(ev[f]);
      this.prev[f] = !!G[f];
    }
  },

  // Verhalten im Lauf (Dumb Habits, Held-/Karten-/Loadout-Zeiten). this.run wird in beginRun angelegt.
  updateHabits(dt, p) {
    const R = this.run || (this.run = { attacked: false, px: null, py: null, weapon: null, cd: {} }), hid = Hero.id();
    if (Input.actDown('attack')) { R.attacked = true; this.acc('attackT', dt); }
    if (!R.attacked && G.time >= 120) this.max('pacifist', 1);
    if (R.px !== null) { const d = Math.hypot(p.x - R.px, p.y - R.py); if (d < 60) this.acc('dist', d); }       // Spruenge (Phase, Rift Step) zaehlen nicht
    R.px = p.x; R.py = p.y;
    if (R.weapon !== null && p.weapon !== R.weapon) this.add('switches');
    R.weapon = p.weapon;
    if (!G.infinite && G.map && G.map.half && (Math.abs(p.x) > G.map.half[0] - 24 || Math.abs(p.y) > G.map.half[1] - 24)) this.acc('wallhug', dt);
    for (const id of ['fortress', 'rift', 'chrono', 'catalyst']) {                       // Held-Artefakt eingesetzt = Abklingzeit springt hoch
      const c = p.cds[id] || 0;
      if (c > (R.cd[id] || 0) + 0.5) this.add('art_' + id);
      R.cd[id] = c;
    }
    this.max('t_' + hid, G.time);
    if (!G.infinite && G.map) this.max('tm_' + G.map.id, G.time);
    if (G.time >= 300 && !Save.equipped('heavy') && !Save.equipped('artifact')) this.max('minimal', 1);
  },

  // ---- Pruefen und freischalten ----
  scan() {
    for (const a of ACH_LIST) {
      if (this.done(a.id)) { if (a.reward.secret && !Save.data.cosmetics.owned[a.reward.secret]) { Save.data.cosmetics.owned[a.reward.secret] = true; this.dirty2 = true; } }       // erreicht, aber das geheime Cosmetic fehlt (z. B. nach einem Import)
      else if (this.value(a.key) >= a.need) this.unlock(a);
    }
    if (this.dirty2) { this.dirty2 = false; Save.write(); }
  },
  unlock(a) {
    const d = this.data();
    d.done[a.id] = true;
    if (a.reward.cores) Save.data.souls += a.reward.cores;
    else if (a.reward.secret) Save.data.cosmetics.owned[a.reward.secret] = true;
    Save.write();
    this.toasts.push({ a, age: 0 });
    try { Sfx.play('buy'); } catch (e) { /* kein Ton */ }
  },
  rewardText(a) {
    return a.reward.secret ? 'SECRET: TOTEM OF UNDYING' : '+' + a.reward.cores + ' CREDITS';
  },

  // Jedes Bild (auch in Menues): Pruefung bei Aenderung bzw. einmal pro Sekunde, Hinweise ablaufen lassen
  tick(dt) {
    this.scanT -= dt;
    if (this.dirty || this.scanT <= 0) { this.dirty = false; this.scanT = 1; this.scan(); }
    for (const t of this.toasts) t.age += dt;
    this.toasts = this.toasts.filter((t) => t.age < this.TOAST_LIFE);
  },

  // Hinweis unten rechts: "ACHIEVEMENT MADE!" mit Icon, Name und Belohnung, faehrt von rechts ein und wieder aus
  drawToasts(ctx) {
    if (!this.toasts.length) return;
    const P = STYLE.pal, T = STYLE.type, w = 176, h = 32;
    ctx.save();
    ctx.setTransform(SCALE, 0, 0, SCALE, VIEW_PAD * SCALE, 0);
    this.toasts.slice(0, 3).forEach((t, i) => {
      const inn = Math.min(1, t.age / 0.35), out = Math.min(1, (this.TOAST_LIFE - t.age) / 0.35), k = Math.min(inn, out), e = 1 - Math.pow(1 - k, 3);
      const x = STAGE_W - w - 8 + (1 - e) * (w + 12), y = STAGE_H - 74 - i * (h + 4);
      uiPanel(ctx, x, y, w, h, { color: P.yellow, fill: P.void, alpha: 0.95, glow: true });
      uiPanel(ctx, x + 4, y + 4, 24, 24, { color: P.yellow, fill: P.voidLight, alpha: 1 });
      drawIcon(ctx, t.a.icon, x + 16, y + 16, 16, 1);
      uiText(ctx, 'ACHIEVEMENT MADE!', x + 34, y + 12, { size: T.small, color: P.yellow });
      uiText(ctx, uiFit(ctx, t.a.name, w - 40, T.body), x + 34, y + 23, { size: T.body, color: P.ice });
      uiText(ctx, this.rewardText(t.a), x + w - 6, y + 12, { size: T.small, color: P.cyan, align: 'right' });
    });
    ctx.restore();
  },

  // ---- Menue ----
  open() { this.sel = { r: 0, c: 0, top: 0 }; this.data().seen = this.doneCount(); this.add('achOpens', 1, true); Save.write(); },
  updateScreen() {
    const rows = this.rows(), n = rows.length, s = this.sel;
    if (s.top === undefined) s.top = 0;
    if (Input.pressed('Escape')) { G.mode = 'start'; return; }
    if (Input.pressed('ArrowUp') || Input.pressed('KeyW')) { s.r = (s.r + n) % (n + 1); if (s.r < n) s.c = Math.min(s.c, rows[s.r].length - 1); }
    if (Input.pressed('ArrowDown') || Input.pressed('KeyS')) { s.r = (s.r + 1) % (n + 1); if (s.r < n) s.c = Math.min(s.c, rows[s.r].length - 1); }
    const maxTop = Math.max(0, n - ACH_VISIBLE);
    if (s.seenR !== s.r) {                                                                 // nur wenn sich die Auswahl aendert (sonst darf die Scrollleiste frei verschieben)
      s.seenR = s.r;
      if (s.r < n) s.top = clamp(clamp(s.top, s.r - ACH_VISIBLE + 1, s.r), 0, maxTop);     // Auswahl bleibt im sichtbaren Ausschnitt
      else s.top = maxTop;                                                                 // BACK: ganz unten
    }
    if (s.r < n) {
      if (Input.pressed('ArrowRight') || Input.pressed('KeyD')) s.c = Math.min(rows[s.r].length - 1, s.c + 1);
      if (Input.pressed('ArrowLeft') || Input.pressed('KeyA')) s.c = Math.max(0, s.c - 1);
    }
    if ((Input.pressed('Space') || Input.pressed('Enter')) && s.r >= n) G.mode = 'start';
  },

  drawScreen(ctx) {
    const P = STYLE.pal, T = STYLE.type, rows = this.rows(), s = this.sel;
    drawMenuBg(ctx, 'keysettings');
    drawEmbers(ctx);
    uiText(ctx, 'ACHIEVEMENTS', 24, 40, { size: T.h1, color: P.yellow, glow: P.yellow });
    uiText(ctx, this.doneCount() + ' / ' + this.total(), STAGE_W - 56, 38, { size: T.h2, color: P.yellow, align: 'right', glow: P.yellow });
    const X0 = 150, DX = 52, NS = 36, Y0 = 56, DY = 41, top = s.top || 0, vis = Math.min(ACH_VISIBLE, rows.length);
    let tip = null;
    UIScroll.bar(ctx, 'ach', STAGE_W - 20, Y0, 6, vis * DY - 13, true, rows.length, vis, top, (v) => { s.top = v; });
    rows.forEach((row, r) => {
      if (r < top || r >= top + vis) return;                                    // nur der sichtbare Ausschnitt
      const y = Y0 + (r - top) * DY, B = ACH_BRANCHES[r], got = row.filter((a) => this.done(a.id)).length;
      uiText(ctx, B.label, 24, y + 13, { size: T.body, color: got === row.length ? P.yellow : P.ice });
      uiText(ctx, got + '/' + row.length, 24, y + 25, { size: T.small, color: P.grey });
      row.forEach((a, c) => {                                                     // Verbindungslinie zum vorigen Knoten
        if (c === 0) return;
        ctx.fillStyle = this.done(row[c - 1].id) ? P.cyan : P.greyDark;
        ctx.fillRect(X0 + (c - 1) * DX + NS, y + NS / 2 - 1, DX - NS, 2);
      });
      row.forEach((a, c) => {
        const x = X0 + c * DX, d = this.done(a.id), sel = s.r === r && s.c === c;
        UIHit.add(x, y, NS, NS, () => { s.r = r; s.c = c; }, { noConfirm: true });
        uiPanel(ctx, x, y, NS, NS, { color: d ? P.yellow : sel ? P.cyan : P.greyMid, fill: d ? P.voidLight : P.void, alpha: 0.95, glow: d || sel });
        drawIcon(ctx, a.icon, x + NS / 2, y + NS / 2, 18, d ? 1 : 0.55, !d);
        if (sel) { ctx.strokeStyle = P.ice; ctx.strokeRect(x - 1.5, y - 1.5, NS + 3, NS + 3); tip = { a, x, y, r: r - top }; }
      });
    });
    // Zurueck
    const by = Y0 + vis * DY + 2, backSel = s.r >= rows.length;
    UIHit.add(24, by, 120, 22, () => { s.r = rows.length; });
    uiPanel(ctx, 24, by, 120, 22, { color: backSel ? P.cyan : P.greyMid, fill: P.void, alpha: 0.9, glow: backSel });
    uiText(ctx, 'BACK', 84, by + 15, { size: T.h2, color: backSel ? P.ice : P.grey, align: 'center' });
    if (tip) this.drawTip(ctx, tip);
  },

  // Beschreibung nur fuer den gewaehlten bzw. ueberfahrenen Knoten
  drawTip(ctx, tip) {
    const P = STYLE.pal, T = STYLE.type, a = tip.a, d = this.done(a.id), w = 200, h = 80;
    const x = clamp(tip.x + 14 - w / 2, 8, STAGE_W - w - 8), y = tip.r < 3 ? tip.y + 34 : tip.y - h - 6;
    uiPanel(ctx, x, y, w, h, { color: d ? P.yellow : P.cyan, fill: P.void, alpha: 0.97, glow: true });
    uiText(ctx, uiFit(ctx, a.name, w - 20, T.h2), x + 10, y + 17, { size: T.h2, color: d ? P.yellow : P.ice });
    uiWrap(ctx, a.desc, x + 10, y + 31, w - 20, 11, { size: T.small, color: P.grey });
    // Fortschritt: Balken unten, daneben Zahl (Aufgaben mit Ziel 1 zeigen 0/1, Zeiten als m:ss)
    const v = d ? a.need : Math.min(a.need, Math.floor(this.value(a.key))), fmt = ACH_TIME_KEYS.test(a.key) ? formatTime : String;
    uiText(ctx, d ? 'DONE  -  ' + this.rewardText(a) : 'REWARD  ' + this.rewardText(a), x + 10, y + h - 20, { size: T.small, color: d ? P.cyan : P.yellow, maxW: w - 70 });
    uiText(ctx, fmt(v) + '/' + fmt(a.need), x + w - 10, y + h - 20, { size: T.small, color: d ? P.cyan : P.ice, align: 'right' });
    uiBar(ctx, x + 10, y + h - 13, w - 20, 5, a.need > 0 ? v / a.need : 1, d ? P.yellow : P.cyan);
  },
};
