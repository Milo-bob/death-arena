// Texte der Death-Screens (aus den Original-SVGs). Die Schrift "Pixel" gibt es im Browser nicht,
// deshalb zeichnen wir die Texte selbst, zentriert, in Breite des Originals.
// x/y = Startpunkt im Original (Bühne 480 x 360, y nach unten), px = Schriftgröße, rot = Drehung in Grad.
const DEATH_TEXTS = {
 death1: [
  {
   text: "DEATH",
   x: 35.75245,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#a80000"
  },
  {
   text: "Are you AFK or what?",
   x: 129.2982,
   y: 257.58258,
   rot: 0,
   px: 20,
   fill: "#a80000"
  }
 ],
 death2: [
  {
   text: "DEATH",
   x: 35.75245,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#a80000"
  },
  {
   text: "You do know how to play this game tho right?",
   x: 8.7982,
   y: 257.08258,
   rot: 0,
   px: 20,
   fill: "#a80000"
  }
 ],
 death3: [
  {
   text: "DEATH",
   x: 35.75245,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#a80000"
  },
  {
   text: "Nice try but not this time!",
   x: 116.7982,
   y: 256.08258,
   rot: 0,
   px: 20,
   fill: "#a80000"
  }
 ],
 death4: [
  {
   text: "DEATH",
   x: 35.75245,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#a80000"
  },
  {
   text: "I see you can indeed improve...",
   x: 97.7982,
   y: 257.08258,
   rot: 0,
   px: 20,
   fill: "#a80000"
  }
 ],
 death5: [
  {
   text: "DEATH",
   x: 35.75245,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#a80000"
  },
  {
   text: "Respekt bro thats pretty god already! Not...",
   x: 4.2982,
   y: 254.58258,
   rot: 0,
   px: 20,
   fill: "#a80000"
  }
 ],
 death6: [
  {
   text: "DEATH",
   x: 35.75245,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#a80000"
  },
  {
   text: "New Highscore (Not Even close...)!",
   x: 55.78469,
   y: 262.33333,
   rot: 0,
   px: 20,
   fill: "#a80000"
  }
 ],
 death7: [
  {
   text: "DEATH",
   x: 35.75245,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#a80000"
  },
  {
   text: "OK I admit, now you have impressed me!",
   x: 39.7982,
   y: 260.58258,
   rot: 0,
   px: 20,
   fill: "#a80000"
  }
 ],
 deathSecret1: [
  {
   text: "DEATH",
   x: 35.75245,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#660000"
  },
  {
   text: "No way back now, this was a oneway-ticket...",
   x: 12.7982,
   y: 257.08258,
   rot: 0,
   px: 20,
   fill: "#650000"
  }
 ],
 deathSecret2: [
  {
   text: "DEATH",
   x: 35.75245,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#660000"
  },
  {
   text: "You should go tuch some grass",
   x: 81.11652,
   y: 257.08258,
   rot: 0,
   px: 20,
   fill: "#650000"
  }
 ],
 deathSecret3: [
  {
   text: "DEATH",
   x: 35.75245,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#660000"
  },
  {
   text: "If you read this you have finished the game",
   x: 18.05346,
   y: 256.33183,
   rot: 0,
   px: 20,
   fill: "#650000"
  },
  {
   text: "I am proud of you!",
   x: 142.16161,
   y: 102.3058,
   rot: 0,
   px: 20,
   fill: "#650000"
  }
 ],
 deathSecret4: [
  {
   text: "END",
   x: 119.75783,
   y: 215.1042,
   rot: 0,
   px: 117.01,
   fill: "#660000"
  },
  {
   text: "This was not supposed to happen!!!",
   x: 6.55346,
   y: 249.06345,
   rot: 0,
   px: 25.89,
   fill: "#650000"
  },
  {
   text: "WTF?!",
   x: 200.66161,
   y: 98.8058,
   rot: 0,
   px: 20,
   fill: "#650000"
  },
  {
   text: "How?",
   x: 348.34269,
   y: 114.30858,
   rot: 24.96042,
   px: 16.23,
   fill: "#650000"
  },
  {
   text: "Why?",
   x: 84.47812,
   y: 135.85171,
   rot: -42.52172,
   px: 15.55,
   fill: "#650000"
  },
  {
   text: "I have to end this!",
   x: 151.50545,
   y: 342.13913,
   rot: 0,
   px: 20,
   fill: "#650000"
  }
 ]
};

// Weitere Death-Screens im gleichen Stil wie die Originale: großes "DEATH" und eine Zeile darunter, Breite wie bei den Original-Zeilen (ca. 10.6 px pro Zeichen)
const DEATH_LINES = {
  death8: "Was that your warm-up?",
  death9: "The arena has barely woken up.",
  death10: "Five minutes. Even the walls are bored.",
  death11: "Tick tock. The bosses are just warming up.",
  death12: "Even your cores look disappointed.",
  death13: "Eleven minutes and still no skill. Impressive.",
  death14: "Now we are getting somewhere. Slowly.",
  death15: "My patience is wearing thin...",
  death16: "Who taught you to dodge like that?",
  death17: "I am running out of insults.",
  death18: "Something is wrong with this arena...",
  death19: "You are not supposed to be here.",
};
for (const [name, line] of Object.entries(DEATH_LINES)) {
  DEATH_TEXTS[name] = [
    { text: "DEATH", x: 35.75245, y: 215.1042, rot: 0, px: 117.01, fill: "#a80000" },
    { text: line, x: Math.max(8, (480 - line.length * 10.6) / 2), y: 257.08258, rot: 0, px: 20, fill: "#a80000" },
  ];
}
