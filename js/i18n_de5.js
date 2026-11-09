// Deutsche Texte: Gamepad, Leistungsmodus, Teilen, Erinnerung, Comeback, Loadouts, Heldenmeisterschaft, Geist, Zeitevents (gamepad.js, share.js, pwa.js, retention.js, mastery.js, ghost.js, events.js). Siehe i18n.js.
if (typeof I18n !== 'undefined' && I18n.add) {
  I18n.add({
    'CONTROLLER CONNECTED': 'CONTROLLER VERBUNDEN',
    'REPORT A BUG / FEEDBACK': 'FEHLER MELDEN / FEEDBACK', 'HOLIDAY GAMES WEBSITE': 'HOLIDAY-GAMES-WEBSEITE', 'LINK COPIED - OPEN IT IN YOUR BROWSER': 'LINK KOPIERT - ÖFFNE IHN IM BROWSER',
    'PERFORMANCE MODE: EFFECTS REDUCED (SETTINGS > EFFECTS)': 'LEISTUNGSMODUS: EFFEKTE REDUZIERT (EINSTELLUNGEN > EFFEKTE)',
    'PERFORMANCE MODE: EFFECTS OFF (SETTINGS > EFFECTS)': 'LEISTUNGSMODUS: EFFEKTE AUS (EINSTELLUNGEN > EFFEKTE)',
    'SHARE [H]': 'TEILEN [H]', 'SHARING FAILED': 'TEILEN FEHLGESCHLAGEN', 'IMAGE SAVED - SHARE IT!': 'BILD GESPEICHERT - TEIL ES!',
    'DAILY REMINDER': 'TÄGLICHE ERINNERUNG', 'APP ONLY': 'NUR IN DER APP',
    'NOTIFICATIONS WERE NOT ALLOWED': 'BENACHRICHTIGUNGEN WURDEN NICHT ERLAUBT',
    'REMINDERS NEED THE INSTALLED APP (CHROME / EDGE)': 'ERINNERUNGEN BRAUCHEN DIE INSTALLIERTE APP (CHROME / EDGE)',
    'WELCOME BACK! LESS DAMAGE, MORE HEALING THIS RUN': 'WILLKOMMEN ZURÜCK! WENIGER SCHADEN, MEHR HEILUNG IN DIESEM LAUF',
    'LOADOUT 1 SAVED': 'LOADOUT 1 GESPEICHERT', 'LOADOUT 2 SAVED': 'LOADOUT 2 GESPEICHERT', 'LOADOUT 3 SAVED': 'LOADOUT 3 GESPEICHERT',
    'LOADOUT 1 LOADED': 'LOADOUT 1 GELADEN', 'LOADOUT 2 LOADED': 'LOADOUT 2 GELADEN', 'LOADOUT 3 LOADED': 'LOADOUT 3 GELADEN',
    'PRESETS: [1-3] LOAD/SAVE   [SHIFT+1-3] OVERWRITE': 'PRESETS: [1-3] LADEN/SPEICHERN   [SHIFT+1-3] ÜBERSCHREIBEN',
    'BEST-RUN GHOST: OWN': 'GEIST DES BESTEN LAUFS: EIGENER', 'BEST-RUN GHOST: FRIENDS': 'GEIST DES BESTEN LAUFS: FREUNDE', 'MASTERY MAX': 'MEISTERSCHAFT MAX', 'ABILITY POWER: FULL': 'ABILITY-STÄRKE: VOLL', 'NEW BEST PACE!': 'NEUE BESTZEIT-SPUR!', 'GHOST: ': 'GEIST: ',
    'WINTER FEST': 'WINTERFEST', 'FESTIVE SPARKLES': 'FESTLICHE FUNKEN', 'EVENT REWARD': 'EVENT-BELOHNUNG',
  });
  I18n.phrases([
    ['MASTERY ', 'MEISTERSCHAFT '], [' MASTERY +', ' MEISTERSCHAFT +'], ['   LEVEL ', '   STUFE '], ['  +4 HP', '  +4 LP'],
    ['GHOST: ', 'GEIST: '], [': BEATEN!', ': GESCHLAGEN!'], ['BEST-RUN GHOST', 'GEIST DES BESTEN LAUFS'], ['APP ONLY', 'NUR IN DER APP'], ['WINTER FEST', 'WINTERFEST'], ['ABILITY POWER: ', 'ABILITY-STÄRKE: '], ['STARTS AT ', 'STARTET MIT '], ['% POWER, FULL AFTER BOSS ', '% STÄRKE, VOLL NACH BOSS '], ['REWARD UNLOCKED: ', 'BELOHNUNG FREIGESCHALTET: '], ['PLAY ', 'SPIELE '], [' RUNS (', ' LÄUFE ('], [' REWARD: ', '-BELOHNUNG: '],
  ]);
}

// Installieren auf iPhone/iPad und in In-App-Browsern (pwa.js)
if (typeof I18n !== 'undefined' && I18n.add) {
  I18n.add({
    'You are inside another app (Instagram, WhatsApp, ...). Installing only works in Safari: copy the link, open Safari and paste it.': 'Du bist in einer anderen App (Instagram, WhatsApp, ...). Installieren geht nur in Safari: Kopiere den Link, öffne Safari und füge ihn ein.',
    'You are inside another app (Instagram, WhatsApp, ...). Installing only works in Chrome: copy the link, open Chrome and paste it.': 'Du bist in einer anderen App (Instagram, WhatsApp, ...). Installieren geht nur in Chrome: Kopiere den Link, öffne Chrome und füge ihn ein.',
    'Tap SHARE (square with an arrow). Safari on iPhone: bottom bar. iPad and Chrome: top right.': 'Tippe auf TEILEN (Quadrat mit Pfeil). Safari auf dem iPhone: untere Leiste. iPad und Chrome: oben rechts.',
    'Scroll down and tap "Add to Home Screen".': 'Nach unten scrollen und "Zum Home-Bildschirm" antippen.',
    'Tap "Add". Open DeathArena from the new icon.': 'Tippe auf "Hinzufügen". Starte DeathArena über das neue Symbol.',
    'COPY LINK': 'LINK KOPIEREN', 'LINK COPIED!': 'LINK KOPIERT!',
  });
}
