// DUSTFALL II — the dusk palette. V2 moves the yard from golden hour to
// last light: a low ember sun, long violet shadows, sand gone copper and
// ash. The two sites keep their identity colours (teal A, amber B) so the
// map reads at a glance, and the teams stay blue versus rust-red. Every
// material in the game, and every HUD accent, takes its colour from here.

export const PALETTE = {
  // Sky and light
  sky: 0x2e2438, // deep dusk violet overhead
  horizon: 0xd98a4e, // ember band where the sun went down
  fog: 0x3a2c33, // warm dusk haze
  sun: 0xffb36b, // the last low sun, almost horizontal
  sunFill: 0x7a86c8, // cool violet bounce from the opposite sky
  hemiSky: 0x8d99c9, // cool sky hemisphere
  hemiGround: 0x6b4a33, // copper ground bounce
  // Ground and structures
  ground: 0x8a6a4a, // packed sand at dusk
  groundDark: 0x6e5238, // worn, darker patches
  groundLight: 0xa37e56, // sunlit sand drifts
  concrete: 0x8f8880, // pale concrete, cooled by dusk
  concreteDark: 0x655e58, // shaded concrete
  concreteWarm: 0xa08a76, // sun-warmed concrete faces
  rust: 0x7e3f26, // rusted steel containers
  rustLight: 0x9a5a34, // rust catching the last sun
  steel: 0x4d565e, // painted gunmetal steel
  steelDark: 0x333a41,
  // Accents and sites
  teal: 0x2fa39b, // site A paint, brighter at dusk
  tealDark: 0x1e6f6a,
  amber: 0xe8a83c, // site B hazard amber
  amberDark: 0xa8761f,
  crate: 0x6e5330, // wooden crates
  crateDark: 0x52401f,
  crateLight: 0x8a6b40,
  // Teams and figures
  vanguard: 0x3d8fd1, // attacker blue
  vanguardDark: 0x2a6394,
  sentinel: 0xd95f33, // defender ember-red
  sentinelDark: 0x9c3f1e,
  visor: 0x101c26, // bot visors, near-black glass
  suit: 0x23262b, // shared dark kit
  // Effects
  tracer: 0xffd98a,
  tracerEnemy: 0xff9a6b,
  muzzle: 0xffc46b,
  spark: 0xffd27a,
  explosion: 0xff7a2a,
  smoke: 0x9a938a, // smoke cloud grey
  flashWhite: 0xfff6e0,
  // Lights
  lampWarm: 0xffc37a, // yard flood lamps
  lampCool: 0x9fb8ff,
};

// The DOM side of the same palette: HUD panels, text and accents.
export const UI = {
  canvas: '#12100f',
  surface: '#1c1917',
  surfaceRaised: '#262019',
  hairline: '#37302a',
  ink: '#efe9dd',
  muted: '#a89e8c',
  dim: '#6f675a',
  accent: '#e8a83c',
  accentSoft: '#c98a2e',
  danger: '#e05545',
  dangerSoft: '#b8453a',
  good: '#7bc47f',
  goodSoft: '#5a9e61',
  blue: '#3d8fd1',
  red: '#d95f33',
  teal: '#2fa39b',
  amber: '#e8a83c',
};
