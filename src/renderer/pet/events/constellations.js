// Constellation shapes for the constellation quiz (./constellation.js).
//
// Each one: name (shown on the answer buttons), stars as [x, y] in its own box (x right, y down,
// roughly 0–1; the quiz scales each shape to fit and keeps its proportions), and lines as pairs
// of star indexes. Shapes are the usual stick figures, as they look on a star chart, simplified.
//
// TO ADD ONE: add an entry here. It automatically shows up as a question and as a wrong answer
// for the others. Keep it to ~5–12 stars (each star is one starbit).

export const CONSTELLATIONS = [
  {
    name: 'Big Dipper',
    // handle (left) → bowl (right)
    stars: [[0, 0.18], [0.18, 0.08], [0.34, 0.16], [0.5, 0.3], [0.54, 0.66], [0.9, 0.74], [0.95, 0.34]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  {
    name: 'Little Dipper',
    // Polaris at the end of the handle
    stars: [[0, 0.1], [0.17, 0.16], [0.33, 0.27], [0.48, 0.42], [0.82, 0.36], [0.88, 0.7], [0.53, 0.76]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 3]],
  },
  {
    name: 'Orion',
    // Betelgeuse, Meissa (head), Bellatrix, belt (3), Saiph, Rigel
    stars: [[0.18, 0.12], [0.5, 0], [0.78, 0.18], [0.4, 0.5], [0.5, 0.47], [0.6, 0.44], [0.26, 0.92], [0.84, 0.86]],
    lines: [[0, 1], [1, 2], [0, 3], [2, 5], [3, 4], [4, 5], [3, 6], [5, 7]],
  },
  {
    name: 'Cassiopeia',
    // the "W"
    stars: [[0, 0.25], [0.24, 0.75], [0.5, 0.42], [0.74, 0.9], [1, 0.3]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
  },
  {
    name: 'Cygnus',
    // the Northern Cross: Deneb (top), Sadr (middle), Albireo (bottom), the wings
    stars: [[0.5, 0], [0.5, 0.35], [0.5, 0.65], [0.5, 1], [0.15, 0.25], [0, 0.45], [0.85, 0.42], [1, 0.62]],
    lines: [[0, 1], [1, 2], [2, 3], [1, 4], [4, 5], [1, 6], [6, 7]],
  },
  {
    name: 'Lyra',
    // Vega and its small triangle, then the parallelogram
    stars: [[0.35, 0], [0.62, 0.12], [0.45, 0.32], [0.7, 0.4], [0.62, 1], [0.36, 0.92]],
    lines: [[0, 1], [1, 2], [2, 0], [2, 3], [3, 4], [4, 5], [5, 2]],
  },
  {
    name: 'Leo',
    // the sickle (head, right) ending at Regulus, and the triangle of the back (left)
    stars: [[0.72, 0.85], [0.74, 0.58], [0.66, 0.38], [0.72, 0.2], [0.86, 0.08], [0.97, 0.22], [0.3, 0.42], [0, 0.62], [0.32, 0.74]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [2, 6], [6, 7], [7, 8], [8, 0]],
  },
  {
    name: 'Scorpius',
    // the claws (top right), Antares, then the curling tail and stinger
    stars: [[0.86, 0], [0.96, 0.14], [0.9, 0.3], [0.76, 0.18], [0.63, 0.3], [0.52, 0.42], [0.45, 0.58], [0.42, 0.74], [0.32, 0.88], [0.16, 0.92], [0.05, 0.82], [0.08, 0.68]],
    lines: [[0, 3], [1, 3], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 8], [8, 9], [9, 10], [10, 11]],
  },
  // ---- The zodiac (Leo and Scorpius are above) ----
  {
    name: 'Aries',
    // a short bent line: 41 Ari, Hamal, Sheratan, Mesarthim
    stars: [[0, 0.2], [0.55, 0.45], [0.85, 0.65], [0.9, 0.88]],
    lines: [[0, 1], [1, 2], [2, 3]],
  },
  {
    name: 'Taurus',
    // the V of the Hyades (Aldebaran on the lower arm), the long horns, and the body
    stars: [[0.62, 0.66], [0.5, 0.5], [0.38, 0.36], [0, 0.05], [0.46, 0.62], [0.28, 0.56], [0.06, 0.46], [0.85, 0.85]],
    lines: [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [0, 7]],
  },
  {
    name: 'Gemini',
    // the twins side by side: Castor (left head) and Pollux (right head), holding hands
    stars: [[0.12, 0], [0.22, 0.45], [0.12, 0.95], [0.34, 0.98], [0.48, 0.06], [0.58, 0.48], [0.5, 0.92], [0.8, 0.95]],
    lines: [[0, 1], [1, 2], [1, 3], [4, 5], [5, 6], [5, 7], [1, 5], [0, 4]],
  },
  {
    name: 'Cancer',
    // an upside-down Y
    stars: [[0.5, 0.48], [0.46, 0.15], [0.44, 0], [0.12, 0.95], [0.88, 0.88]],
    lines: [[0, 1], [1, 2], [0, 3], [0, 4]],
  },
  {
    name: 'Virgo',
    // Spica at the bottom, Porrima in the middle, arms out to Vindemiatrix and beta Vir
    stars: [[0.38, 1], [0.42, 0.72], [0.5, 0.5], [0.75, 0.45], [0.98, 0.35], [0.4, 0.35], [0.3, 0.1], [0.2, 0.6], [0, 0.85]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [2, 5], [5, 6], [1, 7], [7, 8]],
  },
  {
    name: 'Libra',
    // the scales: a triangle with a star hanging off each lower corner
    stars: [[0.5, 0], [0.1, 0.5], [0.85, 0.4], [0, 0.95], [0.9, 0.9]],
    lines: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4]],
  },
  {
    name: 'Sagittarius',
    // the Teapot: spout (right), lid (top), handle (left)
    stars: [[1, 0.55], [0.75, 0.85], [0.72, 0.5], [0.6, 0.25], [0.45, 0.5], [0.25, 0.4], [0.2, 0.7], [0.42, 0.82]],
    lines: [[0, 1], [0, 2], [2, 3], [3, 4], [2, 4], [4, 5], [5, 6], [6, 7], [7, 1], [7, 4]],
  },
  {
    name: 'Capricornus',
    // the sea-goat: a wide upside-down triangle
    stars: [[0.95, 0.05], [0.9, 0.2], [0.75, 0.75], [0.65, 0.9], [0.35, 0.85], [0, 0.2], [0.12, 0.28], [0.5, 0.3]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 1]],
  },
  {
    name: 'Aquarius',
    // the water bearer: a zigzag across the top, the water jar, and the water pouring down
    stars: [[1, 0.3], [0.75, 0.25], [0.5, 0.15], [0.42, 0.3], [0.35, 0.22], [0.28, 0.36], [0.38, 0.65], [0.5, 0.95], [0.15, 0.75], [0, 0.95]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 3], [2, 6], [6, 7], [6, 8], [8, 9]],
  },
  {
    name: 'Pisces',
    // a big V tied at Alrescha: one arm ends in the Circlet (left), the other in the northern fish (top)
    stars: [[0.75, 0.95], [0.55, 0.85], [0.38, 0.75], [0.22, 0.7], [0.1, 0.6], [0, 0.72], [0.08, 0.86], [0.2, 0.83], [0.8, 0.6], [0.85, 0.3], [0.95, 0.05], [0.75, 0.12]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7], [7, 3], [0, 8], [8, 9], [9, 10], [10, 11], [11, 9]],
  },
  {
    name: 'Southern Cross',
    // Crux: four bright stars in a kite-shaped cross, plus the small fifth star
    stars: [[0.48, 0], [0.55, 1], [0.05, 0.42], [0.85, 0.5], [0.66, 0.66]],
    lines: [[0, 1], [2, 3]],
  },
];
