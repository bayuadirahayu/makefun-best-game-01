// AETHERHOLD — the three.js view: a dusk valley with a serpentine road, a
// pond, pines, rocks and glowing crystals, lit by a low sun with soft
// shadows, ACES tone mapping and distance fog. All meshes come from shared
// geometries and materials (one per colour), and the game state drives them:
// towers, enemies, projectiles, beams, arcs and particles are synced every
// frame from the logic objects, never stored twice.
import * as THREE from 'three';
import { BASTION, POND } from './world.js';

function canvasTexture(size, draw, repeat) {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) tex.repeat.set(repeat[0], repeat[1]);
  return tex;
}

function speckle(ctx, size, colors, n, rMin, rMax) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
    const r = rMin + Math.random() * (rMax - rMin);
    ctx.beginPath();
    ctx.arc(Math.random() * size, Math.random() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
}

export class Renderer3D {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.world = world;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(1280, 720, false);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x2a3550);
    this.scene.fog = new THREE.FogExp2(0x2a3550, 0.009);

    this.camera = new THREE.PerspectiveCamera(50, 1280 / 720, 0.1, 220);
    this.panX = 0;
    this.panZ = 0;
    this.zoom = 1;

    // Dusk light: a warm low sun, a cool sky fill, and the bastion's own glow.
    const hemi = new THREE.HemisphereLight(0x8fa8d8, 0x3d2f22, 0.85);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffb36b, 2.1);
    sun.position.set(-26, 30, -14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -38;
    sun.shadow.camera.right = 38;
    sun.shadow.camera.top = 28;
    sun.shadow.camera.bottom = -28;
    sun.shadow.camera.far = 90;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.08;
    this.scene.add(sun);
    const bastionLight = new THREE.PointLight(0x7fe7ff, 30, 26, 1.6);
    bastionLight.position.set(BASTION.x, 6, BASTION.z);
    this.scene.add(bastionLight);

    this.materials = new Map();
    this.geometries = new Map();
    this.towerMeshes = new Map();
    this.enemyMeshes = new Map();
    this.projMeshes = new Map();
    this.arcLines = [];
    this.beamMeshes = new Map();
    this.plotMeshes = [];
    this.time = 0;

    this._buildTerrain();
    this._buildWater();
    this._buildDecor();
    this._buildBastion();
    this._buildMountains();
    this._buildPlots();
    this._buildParticles();
    this.rangeRing = this._ringMesh(0xffe95e);
    this.scene.add(this.rangeRing);
    this.rangeRing.visible = false;
  }

  mat(color, opts = {}) {
    const key = `${color}|${opts.emissive || 0}|${opts.emissiveIntensity || 0}|${opts.roughness ?? 0.85}|${opts.metalness ?? 0}|${opts.transparent ? 1 : 0}|${opts.opacity ?? 1}`;
    if (!this.materials.has(key)) {
      this.materials.set(key, new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.85,
        metalness: opts.metalness ?? 0,
        emissive: opts.emissive || 0x000000,
        emissiveIntensity: opts.emissiveIntensity || 0,
        transparent: !!opts.transparent,
        opacity: opts.opacity ?? 1,
      }));
    }
    return this.materials.get(key);
  }

  geo(kind, ...args) {
    const key = `${kind}|${args.join(',')}`;
    if (!this.geometries.has(key)) {
      let g;
      if (kind === 'box') g = new THREE.BoxGeometry(...args);
      else if (kind === 'cyl') g = new THREE.CylinderGeometry(...args);
      else if (kind === 'sphere') g = new THREE.SphereGeometry(...args);
      else if (kind === 'cone') g = new THREE.ConeGeometry(...args);
      else if (kind === 'octa') g = new THREE.OctahedronGeometry(...args);
      else if (kind === 'torus') g = new THREE.TorusGeometry(...args);
      else if (kind === 'dodeca') g = new THREE.DodecahedronGeometry(...args);
      this.geometries.set(key, g);
    }
    return this.geometries.get(key);
  }

  _buildTerrain() {
    const grass = canvasTexture(256, (ctx, s) => {
      ctx.fillStyle = '#4a7a3d';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, ['#3d6a33', '#578a46', '#6b9a4e', '#2f5c2a'], 900, 1, 3);
    }, [10, 7]);
    const geo = new THREE.PlaneGeometry(64, 42, 64, 42);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.world.heightAt(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: grass, roughness: 0.95 }));
    ground.receiveShadow = true;
    this.scene.add(ground);
    // The road: a flat ribbon hugging the waypoints, pale stone tiles that
    // read clearly against the grass even in the dusk light.
    const stone = canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = '#b3a893';
      ctx.fillRect(0, 0, s, s);
      ctx.strokeStyle = '#5a5248';
      ctx.lineWidth = 4;
      for (let i = 0; i <= 4; i++) {
        ctx.beginPath(); ctx.moveTo(0, (i * s) / 4); ctx.lineTo(s, (i * s) / 4); ctx.stroke();
        ctx.beginPath(); ctx.moveTo((i * s) / 4, 0); ctx.lineTo((i * s) / 4, s); ctx.stroke();
      }
      speckle(ctx, s, ['#a89e8c', '#c2b8a4'], 160, 1, 2);
    }, [1, 1]);
    const wp = this.world.waypoints;
    const positions = [];
    const uvs = [];
    const index = [];
    const half = 1.35;
    let v = 0;
    for (let i = 0; i < wp.length - 1; i++) {
      const a = wp[i];
      const b = wp[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const len = Math.hypot(dx, dz);
      const nx = (-dz / len) * half;
      const nz = (dx / len) * half;
      const base = positions.length / 3;
      const pts = [
        [a.x + nx, a.z + nz], [a.x - nx, a.z - nz],
        [b.x + nx, b.z + nz], [b.x - nx, b.z - nz],
      ];
      for (const [x, z] of pts) {
        positions.push(x, this.world.heightAt(x, z) + 0.07, z);
      }
      uvs.push(0, v, 1, v, 0, v + len / 2.7, 1, v + len / 2.7);
      v += len / 2.7;
      // Winding is chosen so the faces point UP (+y): the ribbon is seen
      // from above, and a downward normal would be backface-culled.
      index.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(index);
    roadGeo.computeVertexNormals();
    const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ map: stone, roughness: 0.9, emissive: 0x2a2620, emissiveIntensity: 0.5 }));
    road.receiveShadow = true;
    this.scene.add(road);
    // Bright kerb lines along both road edges, so the route reads at a glance.
    for (const side of [-1, 1]) {
      const edgePts = [];
      for (let i = 0; i < wp.length - 1; i++) {
        const a = wp[i];
        const b = wp[i + 1];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const len = Math.hypot(dx, dz);
        const nx = (-dz / len) * half * side;
        const nz = (dx / len) * half * side;
        const steps = Math.max(1, Math.floor(len / 2));
        for (let s = 0; s <= steps; s++) {
          const x = a.x + ((b.x - a.x) * s) / steps + nx;
          const z = a.z + ((b.z - a.z) * s) / steps + nz;
          edgePts.push(new THREE.Vector3(x, this.world.heightAt(x, z) + 0.12, z));
        }
      }
      const edgeGeo = new THREE.BufferGeometry().setFromPoints(edgePts);
      this.scene.add(new THREE.Line(edgeGeo, new THREE.LineBasicMaterial({ color: 0xffd76a, transparent: true, opacity: 0.55 })));
    }
    // A glowing rune line down the road's centre: the path reads at a glance.
    const runePts = [];
    for (let i = 0; i < wp.length - 1; i++) {
      const a = wp[i];
      const b = wp[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.max(1, Math.floor(len / 2));
      for (let s = 0; s <= steps; s++) {
        const x = a.x + ((b.x - a.x) * s) / steps;
        const z = a.z + ((b.z - a.z) * s) / steps;
        runePts.push(new THREE.Vector3(x, this.world.heightAt(x, z) + 0.12, z));
      }
    }
    const runeGeo = new THREE.BufferGeometry().setFromPoints(runePts);
    const rune = new THREE.Line(runeGeo, new THREE.LineBasicMaterial({ color: 0x7fe7ff, transparent: true, opacity: 0.55 }));
    this.scene.add(rune);
  }

  _buildWater() {
    const waterTex = canvasTexture(128, (ctx, s) => {
      ctx.fillStyle = '#2a6a8a';
      ctx.fillRect(0, 0, s, s);
      speckle(ctx, s, ['#3a7fa8', '#1f5578', '#4a94b8'], 200, 1, 3);
    }, [2, 2]);
    this.waterTex = waterTex;
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(1, 24),
      new THREE.MeshStandardMaterial({ map: waterTex, transparent: true, opacity: 0.85, roughness: 0.25, metalness: 0.3 }),
    );
    water.rotation.x = -Math.PI / 2;
    water.scale.set(POND.rx, POND.rz, 1);
    water.position.set(POND.x, -0.12, POND.z);
    this.scene.add(water);
  }

  _buildDecor() {
    const trunkMat = this.mat(0x5a4028, { roughness: 1 });
    const leafMat = this.mat(0x2e5c26, { roughness: 0.95 });
    const leafMat2 = this.mat(0x3a7030, { roughness: 0.95 });
    const rockMat = this.mat(0x7d7a74, { roughness: 1 });
    const crystalMat = this.mat(0x9fd8ff, { emissive: 0x2fa8d8, emissiveIntensity: 1.4, roughness: 0.3 });
    for (const t of this.world.trees) {
      const g = new THREE.Group();
      const trunk = new THREE.Mesh(this.geo('cyl', 0.22 * t.s, 0.32 * t.s, 1.6 * t.s, 6), trunkMat);
      trunk.position.y = 0.8 * t.s;
      trunk.castShadow = true;
      g.add(trunk);
      const c1 = new THREE.Mesh(this.geo('cone', 1.5 * t.s, 2.6 * t.s, 7), t.rot > 3 ? leafMat2 : leafMat);
      c1.position.y = 2.6 * t.s;
      c1.castShadow = true;
      g.add(c1);
      const c2 = new THREE.Mesh(this.geo('cone', 1.05 * t.s, 1.9 * t.s, 7), leafMat);
      c2.position.y = 3.9 * t.s;
      c2.castShadow = true;
      g.add(c2);
      g.position.set(t.x, t.y, t.z);
      g.rotation.y = t.rot;
      this.scene.add(g);
    }
    for (const r of this.world.rocks) {
      const m = new THREE.Mesh(this.geo('dodeca', 0.9 * r.s), rockMat);
      m.position.set(r.x, r.y + 0.3 * r.s, r.z);
      m.rotation.set(r.rot, r.rot * 1.7, 0.4);
      m.castShadow = true;
      m.receiveShadow = true;
      this.scene.add(m);
    }
    this.crystals = [];
    for (const c of this.world.crystals) {
      const m = new THREE.Mesh(this.geo('octa', 0.7 * c.s), crystalMat);
      m.position.set(c.x, c.y + 0.7 * c.s, c.z);
      m.rotation.y = c.rot;
      m.castShadow = true;
      this.scene.add(m);
      this.crystals.push(m);
    }
  }

  _buildBastion() {
    const g = new THREE.Group();
    const stoneMat = this.mat(0x8a7f74, { roughness: 0.9 });
    const darkMat = this.mat(0x5c5348, { roughness: 0.9 });
    const keep = new THREE.Mesh(this.geo('cyl', 2.6, 3.1, 4.6, 8), stoneMat);
    keep.position.y = 2.3;
    keep.castShadow = true;
    g.add(keep);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const merlon = new THREE.Mesh(this.geo('box', 0.7, 0.9, 0.7), darkMat);
      merlon.position.set(Math.cos(a) * 2.4, 5.0, Math.sin(a) * 2.4);
      merlon.castShadow = true;
      g.add(merlon);
    }
    const crystal = new THREE.Mesh(
      this.geo('octa', 1.1),
      this.mat(0xbfe6ff, { emissive: 0x35c8ff, emissiveIntensity: 2.2, roughness: 0.2 }),
    );
    crystal.position.y = 6.4;
    g.add(crystal);
    this.bastionCrystal = crystal;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: this._glowTexture(), color: 0x7fe7ff, transparent: true, opacity: 0.5, depthWrite: false,
    }));
    glow.scale.set(7, 7, 1);
    glow.position.y = 6.4;
    g.add(glow);
    g.position.set(BASTION.x, this.world.heightAt(BASTION.x, BASTION.z), BASTION.z);
    this.scene.add(g);
  }

  _buildMountains() {
    // Distant silhouettes, far enough out that the fog swallows their bases.
    // Pale blue-grey so they read as far mountains, not floating shards.
    const mat = this.mat(0x5a6c96, { roughness: 1, emissive: 0x2a3550, emissiveIntensity: 0.6 });
    const mat2 = this.mat(0x4a5a80, { roughness: 1, emissive: 0x232c44, emissiveIntensity: 0.6 });
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.12;
      const r = 60 + (i % 4) * 8;
      const h = 8 + ((i * 7) % 6);
      const m = new THREE.Mesh(this.geo('cone', 10 + (i % 3) * 3, h, 5), i % 2 ? mat : mat2);
      m.position.set(Math.cos(a) * r, h / 2 - 1, Math.sin(a) * r);
      this.scene.add(m);
    }
  }

  _buildPlots() {
    const discGeo = new THREE.CircleGeometry(1.55, 24);
    for (const plot of this.world.plots) {
      const m = new THREE.Mesh(
        discGeo,
        new THREE.MeshStandardMaterial({ color: 0x6b5a3d, roughness: 1, transparent: true, opacity: 0.55 }),
      );
      m.rotation.x = -Math.PI / 2;
      m.position.set(plot.x, this.world.heightAt(plot.x, plot.z) + 0.09, plot.z);
      m.receiveShadow = true;
      m.userData.plotId = plot.id;
      this.scene.add(m);
      this.plotMeshes.push(m);
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(1.55, 0.09, 8, 24),
        this.mat(0x9a9184, { roughness: 0.9 }),
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(plot.x, this.world.heightAt(plot.x, plot.z) + 0.1, plot.z);
      this.scene.add(rim);
    }
  }

  _buildParticles() {
    const cap = 500;
    this.particleGeo = new THREE.BufferGeometry();
    this.particlePos = new Float32Array(cap * 3);
    this.particleCol = new Float32Array(cap * 3);
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(this.particlePos, 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(this.particleCol, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.34, vertexColors: true, transparent: true, opacity: 0.95,
      depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true,
    });
    this.particlePoints = new THREE.Points(this.particleGeo, mat);
    this.particlePoints.frustumCulled = false;
    this.scene.add(this.particlePoints);
  }

  _glowTexture() {
    if (this._glowTex) return this._glowTex;
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,255,255,0.4)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    const tex = new THREE.CanvasTexture(c);
    this._glowTex = tex;
    return tex;
  }

  _ringMesh(color) {
    const m = new THREE.Mesh(
      new THREE.RingGeometry(0.96, 1, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    return m;
  }

  // --- per-type mesh builders ---------------------------------------------

  _towerGroup(tower) {
    const g = new THREE.Group();
    const def = tower.def;
    const stone = this.mat(0x8a7f74, { roughness: 0.9 });
    const base = new THREE.Mesh(this.geo('cyl', 1.05, 1.3, 1.1, 8), stone);
    base.position.y = 0.55;
    base.castShadow = true;
    g.add(base);
    const platform = new THREE.Mesh(this.geo('cyl', 1.15, 1.15, 0.22, 8), this.mat(0x6b6156, { roughness: 0.9 }));
    platform.position.y = 1.2;
    platform.castShadow = true;
    g.add(platform);
    const head = new THREE.Group();
    head.position.y = 1.3;
    g.add(head);
    const accent = this.mat(def.accent, { emissive: def.accent, emissiveIntensity: 0.9, roughness: 0.4 });
    const body = this.mat(def.color, { roughness: 0.75 });
    if (tower.type === 'arrow') {
      const pole = new THREE.Mesh(this.geo('cyl', 0.14, 0.2, 1.9, 6), this.mat(0x6b4a26, { roughness: 1 }));
      pole.position.y = 0.95;
      pole.castShadow = true;
      head.add(pole);
      const bow = new THREE.Mesh(this.geo('box', 1.1, 0.14, 0.14), body);
      bow.position.y = 1.95;
      head.add(bow);
      const tip = new THREE.Mesh(this.geo('sphere', 0.2, 8, 6), accent);
      tip.position.y = 2.0;
      head.add(tip);
    } else if (tower.type === 'cannon') {
      const barrel = new THREE.Mesh(this.geo('cyl', 0.42, 0.5, 1.7, 10), this.mat(0x2e3238, { roughness: 0.5, metalness: 0.6 }));
      barrel.rotation.x = Math.PI / 2.6;
      barrel.position.set(0, 0.7, 0.3);
      barrel.castShadow = true;
      head.add(barrel);
      const mouth = new THREE.Mesh(this.geo('torus', 0.42, 0.08, 8, 16), accent);
      mouth.position.set(0, 1.05, 0.95);
      mouth.rotation.x = Math.PI / 2.6;
      head.add(mouth);
    } else if (tower.type === 'frost') {
      const crystal = new THREE.Mesh(this.geo('octa', 0.85), this.mat(0x9fd8ff, { emissive: 0x2fa8d8, emissiveIntensity: 1.6, roughness: 0.25 }));
      crystal.position.y = 1.1;
      crystal.castShadow = true;
      head.add(crystal);
      head.userData.spin = crystal;
    } else if (tower.type === 'sniper') {
      const mast = new THREE.Mesh(this.geo('cyl', 0.12, 0.18, 2.6, 6), body);
      mast.position.y = 1.3;
      mast.castShadow = true;
      head.add(mast);
      const lens = new THREE.Mesh(this.geo('sphere', 0.42, 12, 10), accent);
      lens.position.y = 2.7;
      head.add(lens);
    } else if (tower.type === 'tesla') {
      for (let i = 0; i < 3; i++) {
        const ring = new THREE.Mesh(this.geo('torus', 0.55 - i * 0.1, 0.09, 8, 18), this.mat(0x4a3f66, { roughness: 0.5, metalness: 0.5 }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.5 + i * 0.55;
        head.add(ring);
      }
      const orb = new THREE.Mesh(this.geo('sphere', 0.5, 12, 10), accent);
      orb.position.y = 2.3;
      head.add(orb);
      head.userData.spin = orb;
    } else if (tower.type === 'laser') {
      const prism = new THREE.Mesh(this.geo('cone', 0.7, 1.8, 4), this.mat(0xc9a227, { emissive: 0x8a6d1f, emissiveIntensity: 0.5, roughness: 0.3, metalness: 0.6 }));
      prism.position.y = 1.1;
      prism.rotation.y = Math.PI / 4;
      prism.castShadow = true;
      head.add(prism);
      const ring = new THREE.Mesh(this.geo('torus', 0.85, 0.07, 8, 24), accent);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.6;
      head.add(ring);
      head.userData.spin = ring;
    }
    // Level markers: a gold band at level 2, a crystal crown at level 3.
    if (tower.level >= 2) {
      const band = new THREE.Mesh(this.geo('torus', 1.18, 0.09, 8, 24), this.mat(0xd9a441, { emissive: 0x6b4a00, emissiveIntensity: 0.4, metalness: 0.7, roughness: 0.35 }));
      band.rotation.x = Math.PI / 2;
      band.position.y = 0.35;
      g.add(band);
    }
    if (tower.level >= 3) {
      const crown = new THREE.Mesh(this.geo('octa', 0.4), accent);
      crown.position.y = 2.9;
      g.add(crown);
    }
    const s = 1 + (tower.level - 1) * 0.12;
    g.scale.setScalar(s);
    g.userData.head = head;
    return g;
  }

  _enemyGroup(e) {
    const g = new THREE.Group();
    const def = e.def;
    const body = this.mat(def.color, { roughness: 0.8 });
    const dark = this.mat(0x2e2a26, { roughness: 0.9 });
    const s = def.scale || 1;
    const accent = this.mat(0xffe95e, { emissive: 0xffe95e, emissiveIntensity: 0.7 });
    if (e.boss) {
      const torso = new THREE.Mesh(this.geo('box', 1.6 * s, 1.8 * s, 1.1 * s), body);
      torso.position.y = 1.1 * s;
      torso.castShadow = true;
      g.add(torso);
      const headM = new THREE.Mesh(this.geo('box', 0.9 * s, 0.7 * s, 0.9 * s), dark);
      headM.position.y = 2.3 * s;
      headM.castShadow = true;
      g.add(headM);
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(this.geo('cone', 0.22 * s, 0.9 * s, 6), accent);
        horn.position.set(side * 0.55 * s, 2.7 * s, 0);
        horn.rotation.z = -side * 0.5;
        g.add(horn);
      }
      const core = new THREE.Mesh(this.geo('sphere', 0.4 * s, 10, 8), accent);
      core.position.set(0, 1.2 * s, 0.62 * s);
      g.add(core);
      if (e.def.fly) {
        for (const side of [-1, 1]) {
          const wing = new THREE.Mesh(this.geo('box', 1.6 * s, 0.08, 0.9 * s), dark);
          wing.position.set(side * 1.3 * s, 1.6 * s, -0.2);
          wing.rotation.z = side * 0.35;
          g.add(wing);
        }
      }
    } else if (e.type === 'runner') {
      const bodyM = new THREE.Mesh(this.geo('cone', 0.42 * s, 1.3 * s, 6), body);
      bodyM.position.y = 0.65 * s;
      bodyM.castShadow = true;
      g.add(bodyM);
    } else if (e.type === 'tank') {
      const shell = new THREE.Mesh(this.geo('box', 1.2 * s, 1.0 * s, 1.0 * s), body);
      shell.position.y = 0.55 * s;
      shell.castShadow = true;
      g.add(shell);
      const plate = new THREE.Mesh(this.geo('box', 1.3 * s, 0.25 * s, 1.1 * s), dark);
      plate.position.y = 1.1 * s;
      g.add(plate);
    } else if (e.type === 'swarm') {
      const m = new THREE.Mesh(this.geo('sphere', 0.42 * s, 8, 6), body);
      m.position.y = 0.42 * s;
      m.castShadow = true;
      g.add(m);
    } else if (e.type === 'flyer') {
      const bodyM = new THREE.Mesh(this.geo('cone', 0.4 * s, 1.1 * s, 6), body);
      bodyM.rotation.x = Math.PI / 2;
      bodyM.position.y = 0.5 * s;
      bodyM.castShadow = true;
      g.add(bodyM);
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(this.geo('box', 0.9 * s, 0.06, 0.5 * s), dark);
        wing.position.set(side * 0.7 * s, 0.5 * s, 0);
        wing.rotation.z = side * 0.3;
        g.add(wing);
      }
    } else if (e.type === 'healer') {
      const m = new THREE.Mesh(this.geo('sphere', 0.62 * s, 10, 8), body);
      m.position.y = 0.62 * s;
      m.castShadow = true;
      g.add(m);
      const ring = new THREE.Mesh(this.geo('torus', 0.8 * s, 0.07, 8, 20), accent);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = 0.62 * s;
      g.add(ring);
    } else if (e.type === 'splitter') {
      const m = new THREE.Mesh(this.geo('sphere', 0.66 * s, 10, 8), body);
      m.scale.y = 0.8;
      m.position.y = 0.55 * s;
      m.castShadow = true;
      g.add(m);
      const bump = new THREE.Mesh(this.geo('sphere', 0.3 * s, 8, 6), accent);
      bump.position.set(0.3 * s, 0.9 * s, 0.2 * s);
      g.add(bump);
    } else {
      // Grunt: a sturdy little walker.
      const bodyM = new THREE.Mesh(this.geo('box', 0.8 * s, 0.9 * s, 0.7 * s), body);
      bodyM.position.y = 0.55 * s;
      bodyM.castShadow = true;
      g.add(bodyM);
      const headM = new THREE.Mesh(this.geo('sphere', 0.34 * s, 8, 6), dark);
      headM.position.y = 1.2 * s;
      g.add(headM);
    }
    return g;
  }

  // --- frame sync -----------------------------------------------------------

  draw(game, time) {
    this.time = time;
    const shake = game.fx.shakeOffset();
    const zoom = this.zoom;
    this.camera.position.set(
      this.panX + shake.x,
      37 * zoom,
      31 * zoom + this.panZ + shake.z,
    );
    this.camera.lookAt(this.panX, 0, -1.5 + this.panZ);
    // Water drifts; crystals pulse; the bastion crystal turns.
    this.waterTex.offset.x = (time * 0.02) % 1;
    this.waterTex.offset.y = (time * 0.013) % 1;
    const pulse = 1.3 + Math.sin(time * 2.2) * 0.35;
    for (const c of this.crystals) {
      c.material.emissiveIntensity = pulse;
      c.rotation.y += 0.003;
    }
    if (this.bastionCrystal) {
      this.bastionCrystal.rotation.y = time * 0.5;
      this.bastionCrystal.position.y = 6.4 + Math.sin(time * 1.4) * 0.15;
    }
    this._syncTowers(game);
    this._syncEnemies(game);
    this._syncProjectiles(game);
    this._syncParticles(game);
    this._syncSelection(game);
    this.renderer.render(this.scene, this.camera);
  }

  _syncTowers(game) {
    const seen = new Set();
    for (const t of game.towers) {
      seen.add(t.id);
      let mesh = this.towerMeshes.get(t.id);
      if (!mesh || mesh.userData.level !== t.level) {
        if (mesh) this.scene.remove(mesh);
        mesh = this._towerGroup(t);
        mesh.position.set(t.x, t.y, t.z);
        mesh.userData.level = t.level;
        this.scene.add(mesh);
        this.towerMeshes.set(t.id, mesh);
      }
      const head = mesh.userData.head;
      if (head) head.rotation.y = t.angle;
      if (head && head.userData.spin) head.userData.spin.rotation.y = this.time * 1.5;
    }
    for (const [id, mesh] of this.towerMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.towerMeshes.delete(id);
      }
    }
  }

  _syncEnemies(game) {
    const seen = new Set();
    for (const e of game.enemies) {
      if (e.dead || e.leaked) continue;
      seen.add(e.id);
      let mesh = this.enemyMeshes.get(e.id);
      if (!mesh) {
        mesh = this._enemyGroup(e);
        this.scene.add(mesh);
        this.enemyMeshes.set(e.id, mesh);
      }
      const bob = Math.sin(e.wobble) * 0.06;
      mesh.position.set(e.x, e.y + bob, e.z);
      mesh.rotation.y = Math.atan2(e.x - (e.prevX ?? e.x), e.z - (e.prevZ ?? e.z)) || 0;
      e.prevX = e.x;
      e.prevZ = e.z;
    }
    for (const [id, mesh] of this.enemyMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.enemyMeshes.delete(id);
      }
    }
  }

  _syncProjectiles(game) {
    const seen = new Set();
    for (const p of game.projectiles.list) {
      seen.add(p);
      let mesh = this.projMeshes.get(p);
      if (!mesh) {
        if (p.kind === 'cannon') {
          mesh = new THREE.Mesh(this.geo('sphere', 0.24, 8, 6), this.mat(0x2e3238, { roughness: 0.5 }));
        } else if (p.kind === 'sniper') {
          mesh = new THREE.Mesh(this.geo('sphere', 0.14, 8, 6), this.mat(0xbfe6ff, { emissive: 0xbfe6ff, emissiveIntensity: 1.5 }));
        } else {
          mesh = new THREE.Mesh(this.geo('box', 0.08, 0.08, 0.7), this.mat(0xffd27a, { emissive: 0xffd27a, emissiveIntensity: 0.8 }));
        }
        this.scene.add(mesh);
        this.projMeshes.set(p, mesh);
      }
      mesh.position.set(p.x, p.y, p.z);
      if (p.kind === 'arrow' && p.target) {
        mesh.lookAt(p.target.x, p.target.y + 0.7, p.target.z);
      }
    }
    for (const [id, mesh] of this.projMeshes) {
      if (!seen.has(id)) {
        this.scene.remove(mesh);
        this.projMeshes.delete(id);
      }
    }
    // Tesla arcs: one jittered line each, fading fast.
    for (const line of this.arcLines) this.scene.remove(line);
    this.arcLines = [];
    for (const arc of game.projectiles.arcs) {
      const pts = [];
      const segs = 5;
      for (let i = 0; i <= segs; i++) {
        const t = i / segs;
        const jx = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 1.1;
        const jy = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 0.9;
        const jz = i === 0 || i === segs ? 0 : (Math.random() - 0.5) * 1.1;
        pts.push(new THREE.Vector3(
          arc.x1 + (arc.x2 - arc.x1) * t + jx,
          arc.y1 + (arc.y2 - arc.y1) * t + jy,
          arc.z1 + (arc.z2 - arc.z1) * t + jz,
        ));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: new THREE.Color(arc.color), transparent: true, opacity: arc.life / arc.maxLife,
      }));
      this.scene.add(line);
      this.arcLines.push(line);
    }
    // Laser beams: a glowing cylinder stretched between tower and target.
    const beamSeen = new Set();
    for (const [towerId, beam] of game.projectiles.beams) {
      beamSeen.add(towerId);
      let mesh = this.beamMeshes.get(towerId);
      if (!mesh) {
        mesh = new THREE.Mesh(
          this.geo('cyl', 0.09, 0.09, 1, 6),
          new THREE.MeshBasicMaterial({ color: 0xffe95e, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
        );
        this.scene.add(mesh);
        this.beamMeshes.set(towerId, mesh);
      }
      const a = new THREE.Vector3(beam.x1, beam.y1, beam.z1);
      const b = new THREE.Vector3(beam.x2, beam.y2, beam.z2);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      const len = a.distanceTo(b);
      mesh.position.copy(mid);
      mesh.scale.set(1, len, 1);
      mesh.lookAt(b.x, b.y, b.z);
      mesh.rotateX(Math.PI / 2);
    }
    for (const [id, mesh] of this.beamMeshes) {
      if (!beamSeen.has(id)) {
        this.scene.remove(mesh);
        this.beamMeshes.delete(id);
      }
    }
  }

  _syncParticles(game) {
    const list = game.fx.list;
    const n = Math.min(list.length, 500);
    for (let i = 0; i < n; i++) {
      const p = list[i];
      this.particlePos[i * 3] = p.x;
      this.particlePos[i * 3 + 1] = p.y;
      this.particlePos[i * 3 + 2] = p.z;
      const c = new THREE.Color(p.color);
      const fade = Math.max(0.15, p.life / p.maxLife);
      this.particleCol[i * 3] = c.r * fade;
      this.particleCol[i * 3 + 1] = c.g * fade;
      this.particleCol[i * 3 + 2] = c.b * fade;
    }
    this.particleGeo.setDrawRange(0, n);
    this.particleGeo.attributes.position.needsUpdate = true;
    this.particleGeo.attributes.color.needsUpdate = true;
  }

  _syncSelection(game) {
    const sel = game.selectedTower;
    const plot = game.selectedPlot;
    if (sel) {
      this.rangeRing.visible = true;
      this.rangeRing.position.set(sel.x, this.world.heightAt(sel.x, sel.z) + 0.15, sel.z);
      const r = sel.stats.range;
      this.rangeRing.scale.set(r, r, 1);
    } else if (plot) {
      const type = game.pendingType;
      const range = type ? game.towerRange(type) : 0;
      if (range > 0) {
        this.rangeRing.visible = true;
        this.rangeRing.position.set(plot.x, this.world.heightAt(plot.x, plot.z) + 0.15, plot.z);
        this.rangeRing.scale.set(range, range, 1);
      } else {
        this.rangeRing.visible = false;
      }
    } else {
      this.rangeRing.visible = false;
    }
    // Plot discs glow when hovered or selected.
    for (const m of this.plotMeshes) {
      const id = m.userData.plotId;
      const isSel = plot && plot.id === id;
      const isHover = game.hoverPlot && game.hoverPlot.id === id;
      m.material.opacity = isSel ? 0.9 : isHover ? 0.75 : 0.55;
      m.material.color.setHex(isSel ? 0xffe95e : isHover ? 0x9fd8ff : 0x6b5a3d);
    }
  }

  // World (x, y, z) to 2D canvas pixels (1280x720), or null behind camera.
  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    if (v.z > 1) return null;
    return { x: (v.x + 1) * 640, y: (1 - v.y) * 360 };
  }

  // Raycast a logical screen point onto the ground plane y=0.
  groundPoint(sx, sy) {
    const ndc = new THREE.Vector2((sx / 640) - 1, 1 - (sy / 360));
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (!Number.isFinite(t) || t < 0) return null;
    const p = ray.ray.origin.clone().add(ray.ray.direction.clone().multiplyScalar(t));
    return { x: p.x, z: p.z };
  }
}
