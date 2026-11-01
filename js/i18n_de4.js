// Deutsche Texte: Ascension, Challenge, erste Laeufe (retention.js), Koop-Wiederbeleben/Verbindung (coop.js), Einladungslink (pvp.js). Siehe i18n.js.
if (typeof I18n !== 'undefined' && I18n.add) {
  I18n.add({
    'BREACH LIGHTS': 'SPAWNER-LICHT',
    'TOTAL ECLIPSE': 'TOTALE FINSTERNIS', 'Defeat the Eclipse.': 'Besiege den Eclipse.', 'WAKE UP': 'AUFWACHEN', 'Defeat the Nightmare.': 'Besiege den Nightmare.', 'OPPOSITES ATTRACT': 'GEGENSÄTZE ZIEHEN SICH AN', 'Defeat the Magnetron.': 'Besiege den Magnetron.', 'IMMOVABLE OBJECT': 'UNBEWEGLICHES OBJEKT', 'Defeat the Juggernaut.': 'Besiege den Juggernaut.', 'LIGHTS OUT!': 'LICHTER AUS!',
    // Meilensteine und Achievements der Karten 5 und 6
    'SURVIVE # MIN ON BLACKOUT': 'ÜBERLEBE # MIN AUF BLACKOUT', 'DEFEAT # BOSSES ON BLACKOUT': 'BESIEGE # BOSSE AUF BLACKOUT', 'DEFEAT # ENEMIES ON BLACKOUT': 'BESIEGE # GEGNER AUF BLACKOUT', 'REACH THE FINAL BOSS ON BLACKOUT': 'ERREICHE DEN ENDBOSS AUF BLACKOUT', 'SURVIVE # MIN ON SCRAPYARD': 'ÜBERLEBE # MIN AUF SCRAPYARD', 'DEFEAT # BOSSES ON SCRAPYARD': 'BESIEGE # BOSSE AUF SCRAPYARD', 'DEFEAT # ENEMIES ON SCRAPYARD': 'BESIEGE # GEGNER AUF SCRAPYARD', 'REACH THE FINAL BOSS ON SCRAPYARD': 'ERREICHE DEN ENDBOSS AUF SCRAPYARD', 'LIGHTS OUT': 'LICHT AUS', 'Survive # minutes on Blackout.': 'Überlebe # Minuten auf Blackout.', 'NIGHT OWL': 'NACHTEULE', 'SCRAP METAL': 'SCHROTTMETALL', 'Survive # minutes on Scrapyard.': 'Überlebe # Minuten auf Scrapyard.', 'JUNK DEALER': 'SCHROTTHÄNDLER', 'MAP ELITE HUNTER': 'KARTEN-ELITE-JÄGER', 'Defeat each elite that belongs to a map.': 'Besiege jede Elite, die zu einer Karte gehört.', 'INTO THE DARK': 'IN DIE DUNKELHEIT', 'Unlock Blackout.': 'Schalte Blackout frei.', 'JUNK FOR ALL': 'SCHROTT FÜR ALLE', 'Unlock Scrapyard.': 'Schalte Scrapyard frei.',
    // Karte 5 Blackout und Karte 6 Scrapyard (mapnew.js, config.js)
    'Light is life.': 'Licht ist Leben.', 'Junk, cranes, magnets.': 'Schrott, Kräne, Magnete.', 'TOTAL DARKNESS': 'TOTALE DUNKELHEIT', 'LAMPS': 'LAMPEN',
    'MAGNET CRANES': 'MAGNETKRÄNE', 'SCRAP WALLS': 'SCHROTTWÄNDE', 'A LAMP WENT OUT!': 'EINE LAMPE IST AUSGEGANGEN!',
    'ROOKIE ASSIST: THE FIRST # RUNS ARE EASIER AND HAVE A GOAL EACH': 'ANFÄNGER-HILFE: DIE ERSTEN # LÄUFE SIND LEICHTER UND HABEN JE EIN ZIEL',
    'ASCENSION: WIN ONCE TO UNLOCK HARDER RUNS WITH MORE CREDITS': 'ASCENSION: GEWINNE EINMAL, UM HÄRTERE LÄUFE MIT MEHR CREDITS FREIZUSCHALTEN',
    'No extra rules.': 'Keine Zusatzregeln.', '[W/S] LEVEL # MAX': '[W/S] STUFE # MAX',
    'WIN ONCE TO UNLOCK ASCENSION': 'GEWINNE EINMAL, UM ASCENSION FREIZUSCHALTEN',
    'CHALLENGES: FINISH # RUNS TO UNLOCK DAILY AND WEEKLY CHALLENGES': 'CHALLENGES: SCHLIESSE # LÄUFE AB, UM TÄGLICHE UND WÖCHENTLICHE CHALLENGES FREIZUSCHALTEN',
    'FINISH # RUNS TO UNLOCK THE CHALLENGES': 'SCHLIESSE # LÄUFE AB, UM DIE CHALLENGES FREIZUSCHALTEN',
    'CHALLENGE: OFF': 'CHALLENGE: AUS', '(DONE)': '(ERLEDIGT)', '[C] CHANGE': '[C] WECHSELN',
    // Ascension-Stufen
    'Enemies have 15% more health.': 'Gegner haben 15 % mehr Leben.', '12% more enemies.': '12 % mehr Gegner.', 'Healing is 25% weaker.': 'Heilung ist 25 % schwächer.', 'Bosses have 20% more health.': 'Bosse haben 20 % mehr Leben.',
    'You take 20% more damage.': 'Du erleidest 20 % mehr Schaden.', 'Bosses attack 15% more often.': 'Bosse greifen 15 % öfter an.', 'Healing is another third weaker.': 'Heilung ist nochmal ein Drittel schwächer.', '15% more enemies.': '15 % mehr Gegner.',
    'Enemies have another 20% more health.': 'Gegner haben nochmal 20 % mehr Leben.', 'Enemies and bosses 8% faster, you take 10% more damage.': 'Gegner und Bosse 8 % schneller, du erleidest 10 % mehr Schaden.',
    // Challenge-Modifier
    '50% more enemies.': '50 % mehr Gegner.', 'Enemies have 60% more health.': 'Gegner haben 60 % mehr Leben.', 'You take double damage.': 'Du erleidest doppelten Schaden.', 'Bosses: 50% more health, 25% more attacks.': 'Bosse: 50 % mehr Leben, 25 % mehr Angriffe.',
    'Healing is 60% weaker.': 'Heilung ist 60 % schwächer.', 'Enemies are 25% faster.': 'Gegner sind 25 % schneller.',
    // Koop
    'LINKED +#% SPEED  -#% DAMAGE': 'VERBUNDEN +#% TEMPO  -#% SCHADEN', '[L] COPY INVITE LINK': '[L] EINLADUNGSLINK KOPIEREN', 'INVITE LINK COPIED!': 'LINK KOPIERT!', 'REMATCH [R]': 'REVANCHE [R]',
    'YOU ARE OUT - A TEAMMATE CAN REVIVE YOU, OR YOU RETURN AFTER THE NEXT BOSS': 'DU BIST RAUS - EIN MITSPIELER KANN DICH WIEDERBELEBEN, SONST BIST DU NACH DEM NÄCHSTEN BOSS ZURÜCK',
  });
  I18n.phrases([
    ['DAILY CHALLENGE', 'TAGES-CHALLENGE'], ['WEEKLY CHALLENGE', 'WOCHEN-CHALLENGE'], ['COMPLETE!', 'GESCHAFFT!'], [' COMPLETE  +', ' GESCHAFFT  +'], ['ALREADY DONE - NO REWARD', 'SCHON ERLEDIGT - KEINE BELOHNUNG'], [' ALREADY DONE', ' SCHON ERLEDIGT'], ['(STREAK ', '(SERIE '],
    ['Daily: ', 'Heute: '], ['TIP: BUY ', 'TIPP: KAUFE '], [' UNDER HERO', ' UNTER HERO'], ['TIP: SPEND YOUR CREDITS UNDER HERO TO GET STRONGER', 'TIPP: GIB DEINE CREDITS UNTER HERO AUS, UM STÄRKER ZU WERDEN'], ['REVIVING ', 'WIEDERBELEBE '], [' - STAND HERE TO REVIVE', ' - HIER STEHEN ZUM WIEDERBELEBEN'], ['REVIVED ', 'WIEDERBELEBT: '],
    [' UNLOCKED!', ' FREIGESCHALTET!'], [' CLEARED  +', ' GESCHAFFT  +'], ['ROOKIE ASSIST ACTIVE (RUN ', 'ANFÄNGER-HILFE AKTIV (LAUF '],
  ]);
}
