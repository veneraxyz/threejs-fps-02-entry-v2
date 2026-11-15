// DUSTFALL II — the hand-in program (Node 22, standard library only).
// The game is this directory's game/ folder: plain static files the
// browser loads as ES modules, three.js from an import map. This program
// copies game/ and screenshots/ beside this file into the output
// directory and writes dossier.json there — the summary the judge reads
// — using the vendored make.fun library, byte for byte the same call the
// scorer makes. It cleans the output's game/, screenshots/ and
// dossier.json first, so a second run over the same directory writes
// exactly the same bytes as the first.
//
//   Serve it locally:  node serve.ts        → http://localhost:8080
//   Build the output:  MAKEFUN_OUTPUT_DIR=out node main.ts
//   (Inside the grader's container the output directory is /output.)

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The scorer's caps (reference/gate.json): only text_max_bytes shapes
// the dossier's bytes; the other caps refuse an entry the scorer would
// refuse — more than 4 screenshots, one over 256 KiB, more than 993
// entries in game/, or more than 48 MiB of game files.
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
} as const;

// Clean the previous output first: stale screenshots or game files from
// an earlier build must never leak into this one.
for (const name of ['game', 'screenshots', 'dossier.json']) {
  rmSync(join(out, name), { recursive: true, force: true });
}
mkdirSync(out, { recursive: true });

cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  // Copy only images: a stray file in screenshots/ (an editor backup,
  // a .DS_Store) must never reach the output or break the dossier.
  for (const name of readdirSync(join(here, 'screenshots'))) {
    if (/\.(png|jpe?g)$/i.test(name)) {
      cpSync(join(here, 'screenshots', name), join(out, 'screenshots', name));
    }
  }
}

writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));

// A one-line build summary, so a run reports what it handed in.
const dossierBytes = statSync(join(out, 'dossier.json')).size;
const shotCount = readdirSync(join(out, 'screenshots')).length;
console.log(`DUSTFALL II → ${out} (dossier.json ${dossierBytes} bytes, ${shotCount} screenshots)`);
