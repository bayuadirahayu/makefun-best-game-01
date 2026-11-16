// EMBERFALL — the 3D diorama renderer (three.js r187, vendored under
// game/vendor/three/). The game logic stays exactly the 2D plane it was
// (x across, y down the cave, the cave scrolling past), and this renderer
// stages it as a lit diorama: the cave walls are extruded rock the lantern's
// own point light plays across, shards and wisps are glowing geometry, and
// linear fog swallows the deep. The HUD, screens and particles stay on the
// 2D overlay canvas above this one. (threejs-scenes: linear Fog, tuned so the
// play plane stays clear and only the deep fades; threejs-renderers:
// WebGLRenderer with ACES tone mapping and a capped pixel ratio.)
import * as THREE from 'three';
import { CONFIG } from './config.js';
import { clamp, lerp } from './random.js';

// Screen space (1280x720, y down) into three.js space (y up, z out).
const toX = (x) => x;
const toY = (y) => CONFIG.height - y;

function glowTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, inner);
  g.addColorStop(0.4, outer);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

function letterTexture(letter, color) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = color;
  ctx.font = '700 40px "Segoe UI", system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(letter, 32, 34);
  return new THREE.CanvasTexture(c);
}

export class Renderer3D {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(CONFIG.width, CONFIG.height, false);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x02080d);
    this.fog = new THREE.Fog(0x04141c, 780, 1250);
    this.scene.fog = this.fog;

    this.camera = new THREE.PerspectiveCamera(55, CONFIG.width / CONFIG.height, 1, 3000);
    this.camera.position.set(640, 360, 700);
    this.camera.lookAt(640, 360, 0);

    // Lights: a dim teal wash so the rock reads, and the lantern's own warm
    // point light, which is what makes the cave feel lit by the player.
    this.scene.add(new THREE.AmbientLight(0x2a4a5a, 1.2));
    const top = new THREE.DirectionalLight(0x8fb8c8, 0.7);
    top.position.set(300, 900, 400);
    this.scene.add(top);
    // Physical falloff: the standard material divides by pi, so the
    // intensity has to be in the thousands to pool visibly on the rock.
    this.lanternLight = new THREE.PointLight(0xffb347, 8000, 900, 1.2);
    this.scene.add(this.lanternLight);
    this.heartLight = new THREE.PointLight(0xffc95e, 0, 900, 1.6);
    this.heartLight.position.set(640, 200, 60);
    this.scene.add(this.heartLight);

    this._buildBackdrop();
    this._buildWalls();
    this._buildPools();
    this._buildLantern();
  }

  // --- static dressing -----------------------------------------------------

  _buildBackdrop() {
    // Far rock slabs, small and far back and mostly near the frame edges,
    // so they frame the shaft instead of blocking it.
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x0e1a24, roughness: 1, metalness: 0,
    });
    this.rocks = [];
    const seeds = [11, 47, 83, 129, 171, 223, 269];
    for (let i = 0; i < 7; i++) {
      const geo = new THREE.IcosahedronGeometry(30 + (seeds[i] % 40), 0);
      const m = new THREE.Mesh(geo, rockMat);
      const edgeSide = i % 2 === 0 ? 1 : -1;
      m.position.set(
        640 + edgeSide * (420 + ((seeds[i] * 137) % 260)),
        60 + ((seeds[i] * 71) % 600),
        -260 - (seeds[i] % 160),
      );
      m.scale.set(1.1 + (seeds[i] % 10) / 20, 0.8 + (seeds[i] % 7) / 14, 0.7);
      m.rotation.set(seeds[i] % 3, seeds[i] % 5, seeds[i] % 7);
      this.scene.add(m);
      this.rocks.push(m);
    }
    // Dust motes as points, drifting slowly upward past the lantern.
    const n = 140;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = Math.random() * 1280;
      pos[i * 3 + 1] = Math.random() * 720;
      pos[i * 3 + 2] = -20 - Math.random() * 160;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0x8cc8dc, size: 2.4, transparent: true, opacity: 0.5,
        sizeAttenuation: true, depthWrite: false,
      }),
    );
    this.scene.add(this.dust);
  }

  _buildWalls() {
    // Two solid walls (left and right), rebuilt every frame from the world's
    // wall shape: each step contributes a face quad (from the cave edge
    // outward past the screen edge, at z = 0, so the wall reads as a mass)
    // and a lip quad (from the edge 90 units into the screen, which catches
    // the lantern's light). Plus a thin glowing rim strip along each inner
    // edge so the gap reads at a glance.
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x2c3e50, roughness: 0.92, metalness: 0.05, side: THREE.DoubleSide,
    });
    this.wallGeoL = new THREE.BufferGeometry();
    this.wallGeoR = new THREE.BufferGeometry();
    this.wallL = new THREE.Mesh(this.wallGeoL, wallMat);
    this.wallR = new THREE.Mesh(this.wallGeoR, wallMat);
    this.scene.add(this.wallL);
    this.scene.add(this.wallR);
    const rimMatL = new THREE.MeshBasicMaterial({
      color: 0xffb05c, transparent: true, opacity: 0.32, side: THREE.DoubleSide,
    });
    const rimMatR = new THREE.MeshBasicMaterial({
      color: 0x6ec8e6, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
    });
    this.rimGeoL = new THREE.BufferGeometry();
    this.rimGeoR = new THREE.BufferGeometry();
    this.scene.add(new THREE.Mesh(this.rimGeoL, rimMatL));
    this.scene.add(new THREE.Mesh(this.rimGeoR, rimMatR));
    this._steps = 46;
  }

  _buildPools() {
    // Shards: glowing octahedrons, pooled and reused.
    const shardGeo = new THREE.OctahedronGeometry(11, 0);
    const shardMat = new THREE.MeshStandardMaterial({
      color: 0x201404, emissive: 0xffb347, emissiveIntensity: 1.7,
      roughness: 0.25, metalness: 0.4,
    });
    this.shardPool = [];
    for (let i = 0; i < 64; i++) {
      const m = new THREE.Mesh(shardGeo, shardMat);
      m.visible = false;
      this.scene.add(m);
      this.shardPool.push(m);
    }
    // Wisps: dark cores with a violet glow and two pale eyes.
    const wispGeo = new THREE.IcosahedronGeometry(18, 1);
    const wispMat = new THREE.MeshStandardMaterial({
      color: 0x2a1245, emissive: 0x7a3cff, emissiveIntensity: 1.5,
      roughness: 0.6, metalness: 0.1,
    });
    const eyeGeo = new THREE.SphereGeometry(2.6, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xe9d5ff });
    this.wispPool = [];
    for (let i = 0; i < 12; i++) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(wispGeo, wispMat));
      const e1 = new THREE.Mesh(eyeGeo, eyeMat);
      e1.position.set(-6, 3, 15);
      const e2 = new THREE.Mesh(eyeGeo, eyeMat);
      e2.position.set(6, 3, 15);
      g.add(e1);
      g.add(e2);
      g.visible = false;
      this.scene.add(g);
      this.wispPool.push(g);
    }
    // Spikes: cones jutting from the walls.
    const spikeGeo = new THREE.ConeGeometry(13, 1, 6);
    spikeGeo.translate(0, 0.5, 0); // base at the origin, tip at +y
    const spikeMat = new THREE.MeshStandardMaterial({
      color: 0x46586e, emissive: 0x2a0f08, emissiveIntensity: 0.7,
      roughness: 0.85, metalness: 0.1,
    });
    this.spikePool = [];
    for (let i = 0; i < 28; i++) {
      const m = new THREE.Mesh(spikeGeo, spikeMat);
      m.visible = false;
      this.scene.add(m);
      this.spikePool.push(m);
    }
    // Pickups: a coloured ring with a letter sprite (S shield, M magnet).
    this.pickupPool = [];
    const kinds = {
      shield: { color: 0x7be0ff, letter: 'S' },
      magnet: { color: 0xc792ff, letter: 'M' },
      slow: { color: 0x8dff9e, letter: '◷' },
    };
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group();
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(15, 3, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xffffff }),
      );
      g.add(ring);
      g.userData.ring = ring;
      const sprites = {};
      for (const [kind, def] of Object.entries(kinds)) {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({
          map: letterTexture(def.letter, '#' + def.color.toString(16).padStart(6, '0')),
          transparent: true, depthWrite: false,
        }));
        sp.scale.set(26, 26, 1);
        sp.visible = false;
        g.add(sp);
        sprites[kind] = sp;
      }
      g.userData.sprites = sprites;
      g.userData.kinds = kinds;
      g.visible = false;
      this.scene.add(g);
      this.pickupPool.push(g);
    }
  }

  _buildLantern() {
    // The lantern: a bright core, a soft glow sprite, and the point light
    // that makes the whole cave answer to where the player is.
    this.lantern = new THREE.Group();
    const core = new THREE.Mesh(
      new THREE.SphereGeometry(10, 20, 16),
      new THREE.MeshBasicMaterial({ color: 0xffe9a8 }),
    );
    this.lantern.add(core);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(8, 22, 10),
      new THREE.MeshBasicMaterial({ color: 0xff7a1a }),
    );
    flame.position.y = 14;
    this.lantern.add(flame);
    this.lanternFlame = flame;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture('rgba(255,196,92,0.85)', 'rgba(255,150,60,0.25)'),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.set(220, 220, 1);
    this.lantern.add(glow);
    this.lanternGlow = glow;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(19, 2.2, 8, 32),
      new THREE.MeshStandardMaterial({
        color: 0x7a5a2e, roughness: 0.5, metalness: 0.7,
      }),
    );
    this.lantern.add(ring);
    this.scene.add(this.lantern);
    // A shield ring, shown only while the shield pickup holds.
    this.shieldRing = new THREE.Mesh(
      new THREE.TorusGeometry(32, 2, 8, 40),
      new THREE.MeshBasicMaterial({
        color: 0x7be0ff, transparent: true, opacity: 0.8,
      }),
    );
    this.shieldRing.visible = false;
    this.scene.add(this.shieldRing);
  }

  // --- per-frame -----------------------------------------------------------

  draw(state, t) {
    const { world, player } = state;
    this._drawWalls(world);
    this._drawEntities(world, t);
    this._drawLantern(player, world, t);
    this._drawBackdrop(world, t);

    // The Heart Chamber warms the fog and lights its own gold.
    if (world.chamber) {
      this.heartLight.intensity = 1100 + Math.sin(t * 2) * 150;
      this.heartLight.position.set(640, 360, 100);
      this.fog.color.setHex(0x241a08);
    } else if (world.surgeActive) {
      this.fog.color.setHex(0x1a0f08);
      this.heartLight.intensity = 0;
    } else {
      this.fog.color.setHex(0x04141c);
      this.heartLight.intensity = 0;
    }
    this.renderer.render(this.scene, this.camera);
  }

  _drawBackdrop(world, t) {
    // The dust drifts upward past the lantern; the far rocks crawl slower
    // than the cave, which is what sells the depth.
    const pos = this.dust.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i) + 0.12;
      if (y > 740) y = -20;
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    for (const r of this.rocks) {
      r.position.y -= world.speed * 0.00012;
      if (r.position.y < -120) r.position.y = 780;
    }
    void t;
  }

  _drawWalls(world) {
    const steps = this._steps;
    const depth = 90;
    const outer = 420; // the wall face runs this far past the cave edge
    const build = (geo, side) => {
      // Four vertices per step: edge/front, outer/front, edge/back, outer/back.
      const pos = new Float32Array((steps + 1) * 4 * 3);
      const idx = [];
      for (let i = 0; i <= steps; i++) {
        const sy = (i / steps) * CONFIG.height;
        const wy = world.scrollY + sy;
        const { centre, halfGap } = world.wallsAt(wy);
        const edge = side < 0 ? centre - halfGap : centre + halfGap;
        const out = side < 0 ? edge - outer : edge + outer;
        const y = toY(sy);
        const b = i * 12;
        pos.set([toX(edge), y, 0], b);
        pos.set([toX(out), y, 0], b + 3);
        pos.set([toX(edge), y, -depth], b + 6);
        pos.set([toX(out), y, -depth], b + 9);
        if (i < steps) {
          const a = i * 4;
          // Face quad (edge-outer at z = 0).
          idx.push(a, a + 1, a + 4, a + 1, a + 5, a + 4);
          // Lip quad (edge at z = 0 to z = -depth).
          idx.push(a, a + 2, a + 4, a + 2, a + 6, a + 4);
        }
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
    };
    build(this.wallGeoL, -1);
    build(this.wallGeoR, 1);

    // Rim strips: a narrow band hugging each inner edge, at z just in
    // front of the wall, so the gap's outline glows.
    const rim = (geo, side, width) => {
      const pos = new Float32Array((steps + 1) * 2 * 3);
      const idx = [];
      for (let i = 0; i <= steps; i++) {
        const sy = (i / steps) * CONFIG.height;
        const wy = world.scrollY + sy;
        const { centre, halfGap } = world.wallsAt(wy);
        const edge = side < 0 ? centre - halfGap : centre + halfGap;
        const x0 = toX(edge);
        const x1 = toX(edge + (side < 0 ? width : -width));
        const y = toY(sy);
        pos.set([x0, y, 4], i * 6);
        pos.set([x1, y, 4], i * 6 + 3);
        if (i < steps) {
          const a = i * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(idx);
      geo.computeVertexNormals();
    };
    rim(this.rimGeoL, -1, 7);
    rim(this.rimGeoR, 1, 7);
  }

  _drawEntities(world, t) {
    // Shards.
    let si = 0;
    for (const s of world.shards) {
      if (si >= this.shardPool.length) break;
      const y = s.y - world.scrollY;
      if (y < -30 || y > CONFIG.height + 30) continue;
      const m = this.shardPool[si++];
      m.visible = true;
      m.position.set(toX(s.x), toY(y + Math.sin(t * 2.4 + s.phase) * 3), 0);
      m.rotation.y = t * 1.6 + s.phase;
      m.rotation.x = 0.4;
      const pulse = 0.9 + 0.12 * Math.sin(t * 5 + s.phase);
      m.scale.setScalar(pulse);
    }
    for (; si < this.shardPool.length; si++) this.shardPool[si].visible = false;

    // Wisps.
    let wi = 0;
    for (const w of world.wisps) {
      if (wi >= this.wispPool.length) break;
      const y = w.y - world.scrollY;
      if (y < -50 || y > CONFIG.height + 50) continue;
      const g = this.wispPool[wi++];
      g.visible = true;
      g.position.set(toX(w.x), toY(y), 0);
      const pulse = 1 + Math.sin(t * 3 + w.t) * 0.1;
      g.scale.setScalar(pulse);
    }
    for (; wi < this.wispPool.length; wi++) this.wispPool[wi].visible = false;

    // Spikes.
    let pi = 0;
    for (const s of world.spikes) {
      if (pi >= this.spikePool.length) break;
      const y = s.y - world.scrollY;
      if (y < -80 || y > CONFIG.height + 80) continue;
      const m = this.spikePool[pi++];
      m.visible = true;
      m.scale.set(1, s.len, 1);
      m.rotation.z = s.side < 0 ? -Math.PI / 2 : Math.PI / 2;
      m.position.set(toX(s.x), toY(y), 0);
    }
    for (; pi < this.spikePool.length; pi++) this.spikePool[pi].visible = false;

    // Pickups.
    let ki = 0;
    for (const p of world.pickups) {
      if (ki >= this.pickupPool.length) break;
      const y = p.y - world.scrollY;
      if (y < -30 || y > CONFIG.height + 30) continue;
      const g = this.pickupPool[ki++];
      g.visible = true;
      g.position.set(toX(p.x), toY(y + Math.sin(t * 2 + p.t) * 4), 0);
      const def = g.userData.kinds[p.kind];
      g.userData.ring.material.color.setHex(def.color);
      for (const [kind, sp] of Object.entries(g.userData.sprites)) {
        sp.visible = kind === p.kind;
      }
      g.rotation.z = t * 0.8;
    }
    for (; ki < this.pickupPool.length; ki++) this.pickupPool[ki].visible = false;
  }

  _drawLantern(player, world, t) {
    const flick = 1 + Math.sin(t * 13) * 0.06 + Math.sin(t * 29) * 0.04;
    const blink = player.invulnerable > 0 && Math.floor(t * 14) % 2 === 0;
    this.lantern.visible = player.alive || world.depth < 1;
    this.lantern.position.set(toX(player.x), toY(player.y), 10);
    this.lantern.rotation.z = clamp(player.vx * 0.00045, -0.35, 0.35);
    this.lanternGlow.material.opacity = blink ? 0.4 : 1;
    this.lanternGlow.scale.setScalar((player.dashing ? 260 : 220) * flick);
    this.lanternFlame.scale.y = flick * (player.dashing ? 1.4 : 1);
    this.lanternLight.position.set(toX(player.x), toY(player.y), 60);
    this.lanternLight.intensity = (player.dashing ? 11000 : 8000) * flick;
    this.shieldRing.visible = player.shield;
    if (player.shield) {
      this.shieldRing.position.set(toX(player.x), toY(player.y), 12);
      this.shieldRing.rotation.x = t * 0.6;
      this.shieldRing.rotation.y = t * 0.9;
    }
    void t;
  }
}
