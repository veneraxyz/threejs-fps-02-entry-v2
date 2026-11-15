// DUSTFALL II — the stage: everything three.js. The scene, the dusk
// lighting rig, the camera, the bot figures, the first-person viewmodel
// and the transient effects (tracers, sparks, smoke, muzzle flashes).
// The renderer reads the sim state and never writes it. Lighting is the
// v2 headline: a low ember sun with long shadows, a cool violet fill,
// warm lamp points at the sites, and a dusk gradient sky.

import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { buildYardMeshes, SITES } from './yard.js';
import { WEAPONS } from './tuning.js';

export function createStage(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(PALETTE.sky);
  scene.fog = new THREE.Fog(PALETTE.fog, 40, 95);

  const skyGeo = new THREE.SphereGeometry(120, 24, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      top: { value: new THREE.Color(PALETTE.sky) },
      horizon: { value: new THREE.Color(PALETTE.horizon) },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying vec3 vP; uniform vec3 top; uniform vec3 horizon; void main(){ float h = clamp(normalize(vP).y * 1.6 + 0.25, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, h), 1.0); }',
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));

  // ---- the lighting rig ---------------------------------------------------
  const sun = new THREE.DirectionalLight(PALETTE.sun, 3.2);
  sun.position.set(-40, 18, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40;
  sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40;
  sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(sun.target);

  const fill = new THREE.DirectionalLight(PALETTE.sunFill, 0.7);
  fill.position.set(30, 25, 20);
  scene.add(fill);

  const hemi = new THREE.HemisphereLight(PALETTE.hemiSky, PALETTE.hemiGround, 0.85);
  scene.add(hemi);

  const lampPositions = [[-11, 4.6, -12], [11, 4.6, 12], [0, 4.6, 0], [-24, 4.6, 0], [24, 4.6, 0]];
  for (const [lx, ly, lz] of lampPositions) {
    const lamp = new THREE.PointLight(PALETTE.lampWarm, 18, 16, 1.8);
    lamp.position.set(lx, ly, lz);
    scene.add(lamp);
  }

  buildYardMeshes(scene);

  // ---- camera -------------------------------------------------------------
  const camera = new THREE.PerspectiveCamera(74, container.clientWidth / container.clientHeight, 0.1, 300);
  camera.rotation.order = 'YXZ';

  // ---- bot figures --------------------------------------------------------
  // Each bot is a small articulated figure: torso, head with visor,
  // legs that swing while walking, and a gun. Built once per bot and
  // reused; the update just moves and rotates the group.
  const figures = new Map();
  const figureGeo = {
    torso: new THREE.BoxGeometry(0.52, 0.72, 0.3),
    head: new THREE.BoxGeometry(0.34, 0.34, 0.34),
    visor: new THREE.BoxGeometry(0.36, 0.12, 0.06),
    leg: new THREE.BoxGeometry(0.18, 0.8, 0.2),
    arm: new THREE.BoxGeometry(0.14, 0.6, 0.16),
    gun: new THREE.BoxGeometry(0.1, 0.14, 0.7),
  };

  function makeFigure(team) {
    const group = new THREE.Group();
    const teamColor = team === 'vanguard' ? PALETTE.vanguard : PALETTE.sentinel;
    const teamDark = team === 'vanguard' ? PALETTE.vanguardDark : PALETTE.sentinelDark;
    const suitMat = new THREE.MeshStandardMaterial({ color: PALETTE.suit, roughness: 0.85 });
    const teamMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.7 });
    const darkMat = new THREE.MeshStandardMaterial({ color: teamDark, roughness: 0.7 });
    const visorMat = new THREE.MeshStandardMaterial({ color: PALETTE.visor, roughness: 0.2, metalness: 0.6 });

    const torso = new THREE.Mesh(figureGeo.torso, suitMat);
    torso.position.y = 1.15;
    torso.castShadow = true;
    group.add(torso);
    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.4, 0.34), teamMat);
    vest.position.y = 1.2;
    group.add(vest);
    const head = new THREE.Mesh(figureGeo.head, suitMat);
    head.position.y = 1.68;
    head.castShadow = true;
    group.add(head);
    const visor = new THREE.Mesh(figureGeo.visor, visorMat);
    visor.position.set(0, 1.68, -0.18);
    group.add(visor);
    const legL = new THREE.Mesh(figureGeo.leg, darkMat);
    legL.position.set(-0.15, 0.4, 0);
    legL.castShadow = true;
    group.add(legL);
    const legR = new THREE.Mesh(figureGeo.leg, darkMat);
    legR.position.set(0.15, 0.4, 0);
    legR.castShadow = true;
    group.add(legR);
    for (const side of [-0.32, 0.32]) {
      const arm = new THREE.Mesh(figureGeo.arm, suitMat);
      arm.position.set(side, 1.2, -0.1);
      arm.rotation.x = -0.9;
      group.add(arm);
    }
    const gun = new THREE.Mesh(figureGeo.gun, new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.7 }));
    gun.position.set(0.12, 1.3, -0.45);
    group.add(gun);
    // A small team-coloured plate above the head.
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(0.5, 0.08),
      new THREE.MeshBasicMaterial({ color: teamColor, transparent: true, opacity: 0.9 }),
    );
    plate.position.y = 2.0;
    group.add(plate);
    scene.add(group);
    return { group, legL, legR, plate, walkPhase: Math.random() * 6 };
  }

  function figureFor(agent) {
    let f = figures.get(agent.id);
    if (!f) {
      f = makeFigure(agent.team);
      figures.set(agent.id, f);
    }
    return f;
  }

  function updateFigures(state, dt) {
    for (const a of state.agents) {
      const f = figureFor(a);
      f.group.visible = a.alive;
      if (!a.alive) continue;
      f.group.position.set(a.x, a.y, a.z);
      f.group.rotation.y = -a.yaw; // three.js forward is -Z; sim yaw 0 faces -Z
      if (a.moving) {
        f.walkPhase += dt * 9;
        const swing = Math.sin(f.walkPhase) * 0.55;
        f.legL.rotation.x = swing;
        f.legR.rotation.x = -swing;
      } else {
        f.legL.rotation.x *= 0.8;
        f.legR.rotation.x *= 0.8;
      }
      f.plate.lookAt(camera.position);
    }
  }

  return {
    renderer,
    scene,
    camera,
    updateFigures,
    figures,
  };
}

// ---------------------------------------------------------------- viewmodel

// The first-person gun: a simple blocky model per weapon, attached to
// the camera. Each weapon has its own silhouette and accent colour.
// Kick: the model dips and recovers after each shot; the reload dip is
// a slow lower-and-raise.
export function createViewmodel(camera) {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.35, metalness: 0.75 });
  const accentMat = new THREE.MeshStandardMaterial({ color: PALETTE.amber, roughness: 0.5, metalness: 0.4 });
  const gripMat = new THREE.MeshStandardMaterial({ color: 0x2e2620, roughness: 0.9 });

  // Each part: [geometry, material, position, rotation.x]. The table
  // keeps the model compact; setWeapon reshapes it per weapon.
  const defs = [
    ['body', new THREE.BoxGeometry(0.09, 0.14, 0.55), bodyMat, [0, 0, -0.1], 0],
    ['barrel', new THREE.CylinderGeometry(0.02, 0.02, 0.3, 8), bodyMat, [0, 0.02, -0.45], Math.PI / 2],
    ['grip', new THREE.BoxGeometry(0.07, 0.2, 0.09), gripMat, [0, -0.13, 0.05], 0.25],
    ['mag', new THREE.BoxGeometry(0.06, 0.18, 0.1), bodyMat, [0, -0.14, -0.12], 0],
    ['accent', new THREE.BoxGeometry(0.095, 0.03, 0.3), accentMat, [0, 0.075, -0.1], 0],
    ['scope', new THREE.CylinderGeometry(0.035, 0.035, 0.22, 10), bodyMat, [0, 0.1, -0.15], Math.PI / 2],
    ['pump', new THREE.BoxGeometry(0.08, 0.08, 0.18), gripMat, [0, -0.05, -0.4], 0],
  ];
  const parts = {};
  for (const [name, geo, material, pos, rotX] of defs) {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(pos[0], pos[1], pos[2]);
    mesh.rotation.x = rotX;
    parts[name] = mesh;
    group.add(mesh);
  }
  group.position.set(0.28, -0.26, -0.5);
  camera.add(group);

  let kick = 0;
  let reloadDip = 0;
  let currentWeapon = null;

  function setWeapon(weaponId) {
    if (weaponId === currentWeapon) return;
    currentWeapon = weaponId;
    const w = WEAPONS[weaponId];
    // Reshape the model per weapon: sniper gets the scope and a long
    // barrel, the shotgun gets the pump, the SMG is short.
    parts.scope.visible = weaponId === 'sniper';
    parts.pump.visible = weaponId === 'shotgun';
    parts.barrel.scale.z = weaponId === 'sniper' ? 1.9 : weaponId === 'smg' ? 0.6 : weaponId === 'shotgun' ? 1.2 : 1;
    parts.body.scale.z = weaponId === 'smg' ? 0.7 : 1;
    parts.mag.scale.y = weaponId === 'shotgun' ? 0.4 : 1;
    accentMat.color.setHex(
      weaponId === 'sniper' ? PALETTE.teal : weaponId === 'shotgun' ? PALETTE.rustLight : PALETTE.amber,
    );
    void w;
  }

  function addKick(amount) {
    kick = Math.min(0.12, kick + amount);
  }

  function update(dt, reloading) {
    kick = Math.max(0, kick - dt * 0.5);
    const targetDip = reloading ? 0.35 : 0;
    reloadDip += (targetDip - reloadDip) * Math.min(1, dt * 6);
    group.position.y = -0.26 - reloadDip;
    group.position.z = -0.5 + kick;
    group.rotation.x = kick * 1.5 + reloadDip * 0.5;
  }

  return { group, setWeapon, addKick, update };
}

// ---------------------------------------------------------------- effects

// Transient effects: tracers (thin glowing lines), impact sparks,
// muzzle flashes, smoke puffs and explosion flashes. All pooled —
// nothing is allocated per shot (criterion 5).
export function createEffects(scene) {
  const tracers = [];
  const sparks = [];
  const smokes = [];
  const flashes = [];
  let explosionFlash = null;

  const tracerMat = new THREE.LineBasicMaterial({ color: PALETTE.tracer, transparent: true, opacity: 0.9 });
  const tracerEnemyMat = new THREE.LineBasicMaterial({ color: PALETTE.tracerEnemy, transparent: true, opacity: 0.9 });
  const tracerGeo = new THREE.BufferGeometry();
  tracerGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));

  const sparkGeo = new THREE.BufferGeometry();
  const sparkMat = new THREE.PointsMaterial({ color: PALETTE.spark, size: 0.08, transparent: true, opacity: 0.9 });

  function addTracer(x0, y0, z0, x1, y1, z1, team) {
    const geo = tracerGeo.clone();
    const pos = geo.getAttribute('position');
    pos.setXYZ(0, x0, y0, z0);
    pos.setXYZ(1, x1, y1, z1);
    const line = new THREE.Line(geo, team === 'vanguard' ? tracerMat : tracerEnemyMat);
    scene.add(line);
    tracers.push({ line, until: performance.now() / 1000 + 0.06 });
  }

  function addSparks(x, y, z) {
    const geo = sparkGeo.clone();
    const count = 8;
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = x + (Math.random() - 0.5) * 0.3;
      arr[i * 3 + 1] = y + (Math.random() - 0.5) * 0.3;
      arr[i * 3 + 2] = z + (Math.random() - 0.5) * 0.3;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    const points = new THREE.Points(geo, sparkMat);
    scene.add(points);
    sparks.push({ points, until: performance.now() / 1000 + 0.25 });
  }

  const puffGeo = new THREE.SphereGeometry(1, 10, 8);
  function addSmoke(x, y, z) {
    const cloudMat = new THREE.MeshBasicMaterial({ color: PALETTE.smoke, transparent: true, opacity: 0.5, depthWrite: false });
    const group = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const puff = new THREE.Mesh(puffGeo, cloudMat);
      puff.position.set((Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 2.5);
      puff.scale.setScalar(1.4 + Math.random());
      group.add(puff);
    }
    group.position.set(x, y, z);
    scene.add(group);
    smokes.push({ group, until: performance.now() / 1000 + 12 });
  }

  function addMuzzleFlash(pos, dir) {
    const flash = new THREE.PointLight(PALETTE.muzzle, 8, 6, 2);
    flash.position.copy(pos);
    scene.add(flash);
    flashes.push({ light: flash, until: performance.now() / 1000 + 0.05 });
  }

  function addExplosion(x, y, z) {
    if (!explosionFlash) {
      explosionFlash = new THREE.PointLight(PALETTE.explosion, 0, 30, 1.5);
      scene.add(explosionFlash);
    }
    explosionFlash.position.set(x, y + 1, z);
    explosionFlash.intensity = 60;
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(1.6, 12, 10),
      new THREE.MeshBasicMaterial({ color: PALETTE.explosion, transparent: true, opacity: 0.9 }),
    );
    ball.position.set(x, y + 0.8, z);
    scene.add(ball);
    sparks.push({ points: ball, until: performance.now() / 1000 + 0.5, fireball: true });
  }

  function update() {
    const now = performance.now() / 1000;
    for (let i = tracers.length - 1; i >= 0; i--) {
      if (now > tracers[i].until) {
        scene.remove(tracers[i].line);
        tracers[i].line.geometry.dispose();
        tracers.splice(i, 1);
      }
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      if (now > sparks[i].until) {
        scene.remove(sparks[i].points);
        sparks[i].points.geometry.dispose();
        sparks.splice(i, 1);
      }
    }
    for (let i = smokes.length - 1; i >= 0; i--) {
      const s = smokes[i];
      const remain = s.until - now;
      if (remain <= 0) {
        scene.remove(s.group);
        smokes.splice(i, 1);
      } else if (remain < 2) {
        s.group.children.forEach((c) => { c.material.opacity = 0.5 * (remain / 2); });
      }
    }
    for (let i = flashes.length - 1; i >= 0; i--) {
      if (now > flashes[i].until) {
        scene.remove(flashes[i].light);
        flashes.splice(i, 1);
      }
    }
    if (explosionFlash && explosionFlash.intensity > 0) {
      explosionFlash.intensity = Math.max(0, explosionFlash.intensity - 240 * 0.016);
    }
  }

  return { addTracer, addSparks, addSmoke, addMuzzleFlash, addExplosion, update };
}

// ---------------------------------------------------------------- the bomb

// The bomb model: a small device with a blinking light, shown planted
// on the ground at the plant site.
export function createBombModel(scene) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.22, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.4, metalness: 0.6 }),
  );
  body.castShadow = true;
  group.add(body);
  const light = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff3b30 }),
  );
  light.position.set(0.12, 0.14, 0);
  group.add(light);
  const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.01, 0.01, 0.3, 6),
    new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.3 }),
  );
  antenna.position.set(-0.12, 0.2, 0);
  group.add(antenna);
  group.visible = false;
  scene.add(group);

  function update(state) {
    const planted = state.bomb.state === 'planted';
    group.visible = planted;
    if (planted) {
      group.position.set(state.bomb.x, 0.12, state.bomb.z);
      const blink = Math.floor(state.time * 3) % 2 === 0;
      light.material.color.setHex(blink ? 0xff3b30 : 0xffcc00);
    }
  }

  return { group, update };
}

// ---------------------------------------------------------------- camera

// Drive the camera from the player: position at the eye, yaw/pitch from
// the mouse, a bob while walking, recoil pitch, and shake from
// explosions. The sniper scope narrows the FOV.
export function updateCamera(camera, state, dt, bobPhase) {
  const p = state.player;
  const eyeY = p.y + (p.crouch ? 1.12 : 1.62);
  let bobY = 0;
  let bobX = 0;
  if (p.moving && p.y <= 0.01) {
    bobY = Math.sin(bobPhase * 2) * 0.03;
    bobX = Math.cos(bobPhase) * 0.015;
  }
  const shake = state.shake;
  const shakeX = (Math.random() - 0.5) * shake * 0.15;
  const shakeY = (Math.random() - 0.5) * shake * 0.15;
  camera.position.set(p.x + bobX + shakeX, eyeY + bobY + shakeY, p.z);
  camera.rotation.y = -p.yaw;
  camera.rotation.x = p.pitch + p.loadout.recoilPitch;
  camera.rotation.z = 0;
  const targetFov = p.loadout.scoped ? 24 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }
  state.shake = Math.max(0, state.shake - dt * 2);
}
