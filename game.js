(() => {
  "use strict";

  if (!window.THREE) {
    document.getElementById("loading").textContent = "Three.js nao carregou. Confira a internet ou publique no GitHub Pages.";
    return;
  }

  const el = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const escapeHtml = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const WORLD_W = 156;
  const WORLD_D = 122;
  const PLAYER_HEIGHT = 1.72;
  const PLAYER_RADIUS = 0.55;
  const BOT_RADIUS = 0.62;
  const GRAVITY = 15.5;
  const JUMP_SPEED = 8.2;
  const MAX_FALL_SPEED = -18;
  const CLIMB_EPSILON = 0.32;
  const Y_UP = new THREE.Vector3(0, 1, 0);
  const ONLINE_SEND_MS = 55;

  const WEAPONS = {
    pistol:  { name: "Glock-18",    price: 0,    damage: 28,  mag: 15, fireMs: 240,  reloadMs: 1200, spread: 0,    pellets: 1, range: 70  },
    smg:     { name: "MP5",         price: 1000, damage: 18,  mag: 30, fireMs: 82,   reloadMs: 1700, spread: 0,    pellets: 1, range: 60  },
    shotgun: { name: "SPAS-12",     price: 1300, damage: 14,  mag: 8,  fireMs: 700,  reloadMs: 2400, spread: 0.12, pellets: 8, range: 38  },
    rifle:   { name: "AK-47",       price: 2500, damage: 34,  mag: 30, fireMs: 110,  reloadMs: 2200, spread: 0,    pellets: 1, range: 85  },
    sniper:  { name: "Barrett M82", price: 4200, damage: 120, mag: 5,  fireMs: 1350, reloadMs: 2800, spread: 0,    pellets: 1, range: 115 }
  };
  const WEAPON_ORDER = ["pistol", "smg", "shotgun", "rifle", "sniper"];
  const ASSET_MANIFEST_URL = "assets/manifest.json";

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x6aa8d4);
  scene.fog = new THREE.Fog(0x8ec4e8, 55, 165);

  const camera = new THREE.PerspectiveCamera(73, window.innerWidth / window.innerHeight, 0.05, 220);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = "gameCanvas";
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("aria-label", "Area do jogo Tatico 3D");
  document.body.appendChild(renderer.domElement);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xc9e8ff, 0x5a6e3e, 2.1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe8b0, 2.8);
  sun.position.set(-38, 56, 24);
  sun.castShadow = true;
  sun.shadow.camera.left = -100;
  sun.shadow.camera.right = 100;
  sun.shadow.camera.top = 100;
  sun.shadow.camera.bottom = -100;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x9fc4ff, 0.42);
  fill.position.set(40, 18, -32);
  scene.add(fill);
  const rim = new THREE.DirectionalLight(0xff7d5a, 0.28);
  rim.position.set(32, 12, 46);
  scene.add(rim);

  const clock = new THREE.Clock();
  const keys = {};
  const mouse = { down: false, lookHeld: false, freeLook: false, lastX: 0, lastY: 0 };
  const walls = [];
  const bots = [];
  const remotePlayers = new Map();
  const tracers = [];
  const particles = [];
  const impactMarks = [];
  const streetLights = [];
  let phase = "menu";
  let round = 1;
  let ctScore = 0;
  let trScore = 0;
  let messageUntil = 0;
  let roundEndTimer = 0;
  let buyCountdown = 0;
  let gameMode = "elimination";

  const BOMB_SITE = { x: 42, z: 42, halfX: 9, halfZ: 7 };
  const BOMB_PLANT_SECONDS = 3;
  const BOMB_DEFUSE_SECONDS = 6;
  const BOMB_EXPLODE_SECONDS = 35;
  const BOMB_ROUND_SECONDS = 100;
  const bomb = {
    state: "idle",
    plantProgress: 0,
    defuseProgress: 0,
    explodeTimer: 0,
    roundTimer: 0,
    mesh: null,
    light: null
  };

  const ITEMS = {
    hpkit:    { name: "Kit de Vida",   price: 400, desc: "Restaura 50 HP · tecla V" },
    armorkit: { name: "Kit de Escudo", price: 650, desc: "100 de escudo · tecla B" },
    ammo:     { name: "Munição",       price: 200, desc: "Reabastece o pente atual" },
  };
  const ITEM_ORDER = ["hpkit", "armorkit", "ammo"];

  const player = {
    position: new THREE.Vector3(0, PLAYER_HEIGHT, 50),
    yaw: 0,
    pitch: 0,
    hp: 100,
    armor: 0,
    hpKits: 0,
    armorKits: 0,
    money: 800,
    kills: 0,
    weaponId: "pistol",
    ammo: WEAPONS.pistol.mag,
    owned: new Set(["pistol"]),
    fireCooldown: 0,
    reloadEnd: 0,
    reloading: false,
    velocityY: 0,
    grounded: true,
    groundY: 0,
    jumpHeld: false,
    alive: true
  };

  const net = {
    mode: "offline",
    ws: null,
    id: null,
    team: null,
    players: [],
    scores: { CT: 0, TR: 0 },
    slots: { CT: 0, TR: 0 },
    room: null,
    matchState: "waiting",
    buyRemainingMs: 0,
    pendingRoomMode: "quick",
    pendingRoomCode: "",
    pendingPrivate: false,
    lastSend: 0,
    spawnId: -1,
    joined: false,
    pingMs: null,
    pingSentAt: 0
  };

  let manualEnabled = localStorage.getItem("taticoManual") !== "off";
  let sensMult = parseFloat(localStorage.getItem("taticoSens") || "1");
  let intentionalExit = false;
  let chatOpen = false;
  const crosshairStyles = ["pro", "yellow", "cyan"];
  let crosshairStyle = localStorage.getItem("taticoCrosshair") || "pro";
  const timeModes = ["day", "night"];
  let worldTime = localStorage.getItem("taticoTime") || "day";
  const touchInput = {
    used: false,
    moveId: null,
    lookId: null,
    moveX: 0,
    moveY: 0,
    lastLookX: 0,
    lastLookY: 0,
    firing: false,
    jump: false,
    slow: false,
    plant: false
  };

  function weapon() {
    return WEAPONS[player.weaponId];
  }

  function setMessage(title, sub, ms = 1700) {
    el("message").innerHTML = title + (sub ? "<small>" + sub + "</small>" : "");
    messageUntil = performance.now() + ms;
  }

  function pulseCrosshair(hit = false) {
    const crosshair = el("crosshair");
    crosshair.classList.add("firing");
    if (hit) crosshair.classList.add("hit");
    window.setTimeout(() => crosshair.classList.remove("firing"), 95);
    if (hit) window.setTimeout(() => crosshair.classList.remove("hit"), 170);
  }

  function makeMat(color, roughness = 0.85, options = {}) {
    return new THREE.MeshStandardMaterial({
      color,
      roughness,
      metalness: options.metalness ?? 0.05,
      map: options.map || null,
      bumpMap: options.bumpMap || null,
      bumpScale: options.bumpScale ?? 0,
      emissive: options.emissive || 0x000000,
      emissiveIntensity: options.emissiveIntensity || 0,
      envMapIntensity: options.envMapIntensity ?? 1
    });
  }

  function makeNoiseTexture(colors, repeatX = 1, repeatY = 1, size = 128, style = "noise") {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = colors[0];
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < size * 6; i++) {
      ctx.fillStyle = colors[1 + Math.floor(Math.random() * (colors.length - 1))];
      const x = Math.random() * size;
      const y = Math.random() * size;
      const w = 1 + Math.random() * 3;
      ctx.globalAlpha = 0.1 + Math.random() * 0.32;
      ctx.fillRect(x, y, w, w);
    }
    if (style === "asphalt") {
      ctx.globalAlpha = 0.18;
      ctx.strokeStyle = colors[2] || "#555";
      for (let i = 0; i < 34; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + rand(-18, 18), y + rand(-6, 6));
        ctx.stroke();
      }
    }
    if (style === "concrete") {
      ctx.globalAlpha = 0.16;
      ctx.strokeStyle = colors[1] || "#777";
      for (let x = 0; x < size; x += size / 4) {
        ctx.beginPath();
        ctx.moveTo(x + rand(-2, 2), 0);
        ctx.lineTo(x + rand(-2, 2), size);
        ctx.stroke();
      }
      for (let y = 0; y < size; y += size / 4) {
        ctx.beginPath();
        ctx.moveTo(0, y + rand(-2, 2));
        ctx.lineTo(size, y + rand(-2, 2));
        ctx.stroke();
      }
    }
    if (style === "brick") {
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = colors[3] || "#3a2b25";
      const rowH = size / 6;
      for (let y = rowH; y < size; y += rowH) ctx.fillRect(0, y, size, 2);
      for (let row = 0; row < 6; row++) {
        const offset = row % 2 ? size / 8 : 0;
        for (let x = offset; x < size; x += size / 4) ctx.fillRect(x, row * rowH, 2, rowH);
      }
    }
    if (style === "metal") {
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = colors[2] || "#8a9299";
      for (let x = 0; x < size; x += 18) ctx.fillRect(x, 0, 2, size);
      ctx.globalAlpha = 0.12;
      for (let y = 0; y < size; y += 23) ctx.fillRect(0, y, size, 1);
    }
    if (style === "wood") {
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = colors[2] || "#9b7441";
      for (let y = 8; y < size; y += 9) {
        ctx.beginPath();
        ctx.moveTo(0, y + rand(-2, 2));
        for (let x = 0; x < size; x += 18) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function makeTexturedMat(color, roughness, colors, repeatX, repeatY, options = {}) {
    const style = options.style || "noise";
    const size = options.size || 192;
    const bumpColors = ["#777777", "#555555", "#999999", "#444444"];
    return makeMat(color, roughness, {
      ...options,
      map: makeNoiseTexture(colors, repeatX, repeatY, size, style),
      bumpMap: makeNoiseTexture(bumpColors, repeatX, repeatY, 96, style),
      bumpScale: options.bumpScale ?? 0.035
    });
  }

  function makeGlowMat(color, intensity = 1.4) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92 });
  }

  const mats = {
    floor: makeTexturedMat(0x4b5a39, 0.9, ["#4b5a39", "#3c472f", "#66734d", "#2f3828"], 18, 14, { style: "concrete", bumpScale: 0.02 }),
    wall: makeTexturedMat(0x8c8a7e, 0.82, ["#8c8a7e", "#737064", "#b9b19b", "#5e6257"], 5, 5, { style: "concrete", bumpScale: 0.045 }),
    darkWall: makeTexturedMat(0x55594f, 0.86, ["#55594f", "#444940", "#6e7064", "#343a34"], 6, 5, { style: "concrete", bumpScale: 0.045 }),
    brick: makeTexturedMat(0x8e5f4b, 0.84, ["#8e5f4b", "#6f4639", "#ad7661", "#49352d"], 7, 4, { style: "brick", bumpScale: 0.055 }),
    crate: makeTexturedMat(0x7b5a32, 0.76, ["#7b5a32", "#5f421f", "#a77d46", "#3f2d19"], 2, 2, { style: "wood", bumpScale: 0.045 }),
    metal: makeTexturedMat(0x58606a, 0.48, ["#58606a", "#3f4852", "#808b94", "#2c333a"], 3, 3, { style: "metal", metalness: 0.34, bumpScale: 0.025 }),
    site: makeTexturedMat(0xd6a23a, 0.55, ["#d6a23a", "#ad7c25", "#ffd66d", "#765018"], 3, 2, { style: "metal", bumpScale: 0.02 }),
    ct: makeMat(0x3f83c4, 0.62, { metalness: 0.08 }),
    tr: makeMat(0xc49a42, 0.62, { metalness: 0.08 }),
    black: makeMat(0x141414, 0.54, { metalness: 0.16 }),
    asphalt: makeTexturedMat(0x2f332d, 0.92, ["#2f332d", "#20241f", "#555a50", "#141714"], 16, 3, { style: "asphalt", bumpScale: 0.032 }),
    containerBlue: makeTexturedMat(0x315e7e, 0.58, ["#315e7e", "#24465f", "#4d86a5", "#1e3446"], 4, 2, { style: "metal", metalness: 0.28, bumpScale: 0.034 }),
    containerRed: makeTexturedMat(0x85483c, 0.58, ["#85483c", "#65352e", "#ad6958", "#482a25"], 4, 2, { style: "metal", metalness: 0.24, bumpScale: 0.034 }),
    barrel: makeTexturedMat(0x365b4a, 0.52, ["#365b4a", "#254134", "#4d8069", "#16251f"], 2, 2, { style: "metal", metalness: 0.24, bumpScale: 0.025 }),
    house: makeTexturedMat(0x9b8b72, 0.8, ["#9b8b72", "#786b58", "#c4b38e", "#5f5548"], 3, 3, { style: "concrete", bumpScale: 0.035 }),
    houseDark: makeTexturedMat(0x6f705e, 0.84, ["#6f705e", "#565748", "#8d8d76", "#414238"], 3, 3, { style: "concrete", bumpScale: 0.035 }),
    roof: makeTexturedMat(0x564337, 0.75, ["#564337", "#3d3028", "#745848", "#2b211b"], 4, 2, { style: "wood", bumpScale: 0.03 }),
    windowLit: makeMat(0xd9c06a, 0.35),
    trim: makeMat(0xc6b992, 0.7),
    lanePaint: makeGlowMat(0xf4e7bd),
    roadEdge: new THREE.MeshBasicMaterial({ color: 0xd8cfad, transparent: true, opacity: 0.26, depthWrite: false }),
    crateBand: makeMat(0x3d3326, 0.74),
    bombCore: makeMat(0x1a1d18, 0.62, { metalness: 0.3 }),
    bombScreen: makeGlowMat(0xd7ff6e),
    weaponAccent: makeGlowMat(0xd7ff6e),
    spark: new THREE.MeshBasicMaterial({ color: 0xffd36d, transparent: true, opacity: 0.95 }),
    impactMark: new THREE.MeshBasicMaterial({ color: 0x110d0a, transparent: true, opacity: 0.55, depthWrite: false }),
    accentBlue: makeGlowMat(0x74c7ff),
    accentRed: makeGlowMat(0xff6d5d),
    accentGold: makeGlowMat(0xffd76d),
    lampGlow: new THREE.MeshBasicMaterial({ color: 0xffdf9c, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x8dc3d6, roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.42 })
  };

  const assetPack = {
    manifest: null,
    models: new Map(),
    sounds: new Map(),
    ready: false,
    audioContext: null,
    gltfLoader: null,
    gltfLoaderPromise: null
  };

  async function loadAssetPack() {
    try {
      const response = await fetch(ASSET_MANIFEST_URL, { cache: "no-store" });
      if (!response.ok) throw new Error("manifest unavailable");
      assetPack.manifest = await response.json();
    } catch {
      assetPack.manifest = { models: {}, textures: {}, sounds: {} };
    }

    await Promise.all([
      loadTextureAssets(assetPack.manifest.textures || {}),
      loadModelAssets(assetPack.manifest.models || {}),
      loadSoundAssets(assetPack.manifest.sounds || {})
    ]);
    assetPack.ready = true;
  }

  function assetUrl(entry) {
    if (!entry) return "";
    if (typeof entry === "string") return entry;
    return entry.url || "";
  }

  async function getGltfLoader() {
    if (assetPack.gltfLoader) return assetPack.gltfLoader;
    if (!assetPack.gltfLoaderPromise) {
      assetPack.gltfLoaderPromise = import("three/addons/loaders/GLTFLoader.js")
        .then(module => {
          assetPack.gltfLoader = new module.GLTFLoader();
          return assetPack.gltfLoader;
        });
    }
    return assetPack.gltfLoaderPromise;
  }

  async function loadModelAssets(modelEntries) {
    const entries = Object.entries(modelEntries).filter(([, entry]) => assetUrl(entry));
    if (!entries.length) return;
    let loader;
    try {
      loader = await getGltfLoader();
    } catch {
      return;
    }
    await Promise.all(entries.map(([id, entry]) => new Promise(resolve => {
      loader.load(assetUrl(entry), gltf => {
        gltf.scene.traverse(node => {
          if (!node.isMesh) return;
          node.castShadow = true;
          node.receiveShadow = true;
          if (node.material) node.material.needsUpdate = true;
        });
        assetPack.models.set(id, gltf.scene);
        resolve();
      }, undefined, () => resolve());
    })));
  }

  async function loadTextureAssets(textureEntries) {
    const entries = Object.entries(textureEntries).filter(([, entry]) => assetUrl(entry));
    if (!entries.length) return;
    const loader = new THREE.TextureLoader();
    await Promise.all(entries.map(([id, entry]) => new Promise(resolve => {
      const url = assetUrl(entry);
      loader.load(url, texture => {
        const target = typeof entry === "object" && entry.material ? entry.material : id;
        const repeat = typeof entry === "object" && Array.isArray(entry.repeat) ? entry.repeat : [1, 1];
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.repeat.set(repeat[0] || 1, repeat[1] || 1);
        if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
        if (mats[target]) {
          mats[target].map = texture;
          mats[target].needsUpdate = true;
        }
        resolve();
      }, undefined, () => resolve());
    })));
  }

  async function loadSoundAssets(soundEntries) {
    const entries = Object.entries(soundEntries).filter(([, entry]) => assetUrl(entry));
    if (!entries.length) return;
    const context = ensureAudioContext(false);
    if (!context) return;
    await Promise.all(entries.map(async ([id, entry]) => {
      try {
        const response = await fetch(assetUrl(entry), { cache: "force-cache" });
        const data = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(data);
        assetPack.sounds.set(id, buffer);
      } catch {
        // Fallback synth sounds keep the game playable when files are missing.
      }
    }));
  }

  function assetModel(id, options = {}) {
    const source = assetPack.models.get(id);
    if (!source) return null;
    const model = source.clone(true);
    const scale = options.scale ?? 1;
    model.scale.setScalar(scale);
    if (options.position) model.position.copy(options.position);
    if (options.rotationY) model.rotation.y = options.rotationY;
    return model;
  }

  function ensureAudioContext(resume = true) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    if (!assetPack.audioContext) assetPack.audioContext = new AudioCtx();
    if (resume && assetPack.audioContext.state === "suspended") assetPack.audioContext.resume?.();
    return assetPack.audioContext;
  }

  function playBufferSound(id, volume = 0.5) {
    const context = ensureAudioContext();
    const buffer = assetPack.sounds.get(id);
    if (!context || !buffer) return false;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = volume;
    source.connect(gain).connect(context.destination);
    source.start();
    return true;
  }

  function playSynthShot() {
    if (playBufferSound("shot_" + player.weaponId, 0.6) || playBufferSound("shot", 0.6)) return;
    const context = ensureAudioContext();
    if (!context) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(player.weaponId === "sniper" ? 84 : player.weaponId === "smg" ? 150 : 118, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.08);
    filter.type = "lowpass";
    filter.frequency.value = 900;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
    osc.connect(filter).connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  }

  function playHitSound() {
    if (playBufferSound("hit", 0.45)) return;
    const context = ensureAudioContext();
    if (!context) return;
    const now = context.currentTime;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    osc.connect(gain).connect(context.destination);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  function unlockAudio() {
    ensureAudioContext();
  }

  const viewModel = createViewModel();
  camera.add(viewModel);

  function createViewModel() {
    const group = new THREE.Group();
    group.position.set(0.42, -0.54, -0.92);
    group.rotation.set(-0.05, 0.12, 0);

    const sleeveMat = makeMat(0x2f6f9f, 0.74);
    const gloveMat = makeMat(0x161914, 0.7);

    [-1, 1].forEach(side => {
      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.075, 0.44, 6, 10), sleeveMat);
      arm.position.set(side * 0.16, -0.03, 0.06);
      arm.rotation.x = Math.PI / 2.5;
      arm.rotation.z = side * 0.28;
      group.add(arm);

      const glove = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), gloveMat);
      glove.position.set(side * 0.1, -0.05, -0.25);
      group.add(glove);
    });

    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.68), mats.black);
    gun.position.set(0.02, -0.05, -0.45);
    group.add(gun);

    const top = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.08, 0.46), mats.metal);
    top.position.set(0.02, 0.08, -0.5);
    group.add(top);

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.52), mats.crateBand);
    rail.position.set(0.02, 0.145, -0.53);
    group.add(rail);

    const magazine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.34, 0.18), mats.metal);
    magazine.position.set(0.02, -0.25, -0.36);
    magazine.rotation.x = -0.18;
    group.add(magazine);

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.32, 0.18), mats.black);
    grip.position.set(0.02, -0.25, -0.17);
    grip.rotation.x = -0.42;
    group.add(grip);

    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.055, 0.08), mats.metal);
    sightBase.position.set(0.02, 0.2, -0.68);
    group.add(sightBase);

    const sightDot = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), mats.weaponAccent);
    sightDot.position.set(0.02, 0.235, -0.72);
    group.add(sightDot);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.36, 10), mats.black);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.02, 0.04, -0.98);
    group.add(barrel);

    const flash = new THREE.Mesh(
      new THREE.ConeGeometry(0.1, 0.52, 10),
      new THREE.MeshBasicMaterial({ color: 0xffd16b, transparent: true, opacity: 0.9 })
    );
    flash.rotation.x = -Math.PI / 2;
    flash.position.set(0.02, 0.04, -1.18);
    flash.visible = false;
    group.add(flash);

    const flashLight = new THREE.PointLight(0xffb347, 0, 3.2);
    flashLight.position.set(0.02, 0.04, -1.04);
    group.add(flashLight);

    group.userData.gun = gun;
    group.userData.top = top;
    group.userData.rail = rail;
    group.userData.magazine = magazine;
    group.userData.sightBase = sightBase;
    group.userData.sightDot = sightDot;
    group.userData.barrel = barrel;
    group.userData.flash = flash;
    group.userData.flashLight = flashLight;
    group.userData.flashUntil = 0;
    group.userData.recoil = 0;
    group.userData.basePosition = group.position.clone();
    group.userData.baseRotation = group.rotation.clone();
    return group;
  }

  function updateViewModel() {
    const w = weapon();
    const longGun = w.range > 70 || w.mag >= 30;
    viewModel.userData.basePosition.set(longGun ? 0.34 : 0.42, longGun ? -0.52 : -0.54, longGun ? -1.02 : -0.92);
    viewModel.position.copy(viewModel.userData.basePosition);
    viewModel.userData.baseRotation.set(-0.05, 0.12, 0);
    viewModel.rotation.copy(viewModel.userData.baseRotation);
    viewModel.userData.gun.scale.set(longGun ? 0.86 : 1, longGun ? 0.92 : 1, longGun ? 1.55 : 1);
    viewModel.userData.top.scale.set(longGun ? 0.86 : 1, 1, longGun ? 1.45 : 1);
    viewModel.userData.rail.scale.set(longGun ? 0.9 : 1, 1, longGun ? 1.55 : 1);
    viewModel.userData.magazine.scale.set(longGun ? 1.08 : 1, longGun ? 1.35 : 1, longGun ? 1.05 : 1);
    viewModel.userData.sightBase.position.z = longGun ? -0.86 : -0.68;
    viewModel.userData.sightDot.position.z = longGun ? -0.92 : -0.72;
    viewModel.userData.barrel.position.z = longGun ? -1.28 : -0.98;
    viewModel.userData.flash.position.z = longGun ? -1.5 : -1.18;
    applyViewWeaponAsset();
  }

  function applyViewWeaponAsset() {
    if (viewModel.userData.assetWeaponId === player.weaponId) return;
    if (viewModel.userData.assetModel) {
      viewModel.remove(viewModel.userData.assetModel);
      viewModel.userData.assetModel = null;
    }

    const model = assetModel("weapon_" + player.weaponId, { scale: 0.42 });
    if (!model) {
      viewModel.userData.assetWeaponId = player.weaponId;
      [viewModel.userData.gun, viewModel.userData.top, viewModel.userData.rail, viewModel.userData.magazine, viewModel.userData.sightBase, viewModel.userData.sightDot, viewModel.userData.barrel].forEach(part => {
        if (part) part.visible = true;
      });
      return;
    }

    model.position.set(0.05, -0.12, -0.62);
    model.rotation.set(0, Math.PI, 0);
    viewModel.add(model);
    viewModel.userData.assetModel = model;
    viewModel.userData.assetWeaponId = player.weaponId;
    [viewModel.userData.gun, viewModel.userData.top, viewModel.userData.rail, viewModel.userData.magazine, viewModel.userData.sightBase, viewModel.userData.sightDot, viewModel.userData.barrel].forEach(part => {
      if (part) part.visible = false;
    });
  }

  function triggerMuzzleFlash() {
    playSynthShot();
    const flash = viewModel.userData.flash;
    flash.visible = true;
    flash.rotation.z = Math.random() * Math.PI;
    const scale = 0.82 + Math.random() * 0.58;
    flash.scale.set(scale, scale, scale);
    viewModel.userData.flashLight.intensity = 1.6 + Math.random() * 1.4;
    viewModel.userData.flashUntil = performance.now() + 42;
    viewModel.userData.recoil = Math.min(1, viewModel.userData.recoil + 0.72);
  }

  function updateViewEffects() {
    if (viewModel.userData.flashUntil && performance.now() > viewModel.userData.flashUntil) {
      viewModel.userData.flash.visible = false;
      viewModel.userData.flashLight.intensity = 0;
    }
    viewModel.userData.recoil = Math.max(0, viewModel.userData.recoil - 0.12);
    const kick = viewModel.userData.recoil;
    viewModel.position.copy(viewModel.userData.basePosition);
    viewModel.position.z += kick * 0.085;
    viewModel.position.y -= kick * 0.018;
    viewModel.rotation.copy(viewModel.userData.baseRotation);
    viewModel.rotation.x -= kick * 0.035;
  }

  function addBox(x, z, w, d, h, mat, label = "parede") {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    const climbable = h <= 2.25 && !label.includes("muro");
    walls.push({ x, z, halfX: w / 2, halfZ: d / 2, h, mesh, label, climbable });
    decorateWall(mesh, w, d, h, label);
    return mesh;
  }

  function decorateWall(mesh, w, d, h, label) {
    if (h < 2.5 || label === "caixa" || label === "barril" || label === "veiculo") return;
    const group = new THREE.Group();
    const frontBack = w >= d;
    const length = frontBack ? w : d;
    const depth = frontBack ? d : w;
    const faceOffset = depth / 2 + 0.018;
    const stripeMat = label.includes("A") ? mats.accentRed : label.includes("B") ? mats.accentBlue : mats.accentGold;
    const grimeMat = new THREE.MeshBasicMaterial({ color: 0x141712, transparent: true, opacity: 0.22, depthWrite: false });
    const trimMat = mats.metal;

    for (const side of [-1, 1]) {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(length * 0.82, 0.13, 0.04), stripeMat);
      stripe.position.y = h * 0.68;
      if (frontBack) {
        stripe.position.z = side * faceOffset;
      } else {
        stripe.rotation.y = Math.PI / 2;
        stripe.position.x = side * faceOffset;
      }
      group.add(stripe);

      const lowTrim = new THREE.Mesh(new THREE.BoxGeometry(length * 0.92, 0.16, 0.05), trimMat);
      lowTrim.position.y = 0.52;
      if (frontBack) {
        lowTrim.position.z = side * faceOffset;
      } else {
        lowTrim.rotation.y = Math.PI / 2;
        lowTrim.position.x = side * faceOffset;
      }
      group.add(lowTrim);

      const panelCount = clamp(Math.floor(length / 7), 1, 8);
      for (let i = 0; i < panelCount; i++) {
        const t = panelCount === 1 ? 0 : i / (panelCount - 1);
        const pos = -length * 0.38 + t * length * 0.76;
        const stain = new THREE.Mesh(new THREE.BoxGeometry(0.45 + Math.random() * 0.55, h * (0.28 + Math.random() * 0.18), 0.035), grimeMat);
        stain.position.y = h * (0.38 + Math.random() * 0.16);
        if (frontBack) {
          stain.position.x = pos;
          stain.position.z = side * (faceOffset + 0.006);
        } else {
          stain.rotation.y = Math.PI / 2;
          stain.position.z = pos;
          stain.position.x = side * (faceOffset + 0.006);
        }
        group.add(stain);
      }
    }

    group.position.copy(mesh.position);
    group.rotation.copy(mesh.rotation);
    scene.add(group);
    mesh.userData.detail = group;
  }

  function addCrate(x, z, size = 3, h = 2.1) {
    const mesh = addBox(x, z, size, size, h, mats.crate, "caixa");
    const custom = assetModel("crate", { scale: size / 3, position: new THREE.Vector3(x, 0, z) });
    if (custom) {
      scene.add(custom);
      mesh.visible = false;
    }
    const edge = new THREE.EdgesGeometry(mesh.geometry);
    const line = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: 0x312519, transparent: true, opacity: 0.55 }));
    line.position.copy(mesh.position);
    scene.add(line);
    if (custom) line.visible = false;
    mesh.userData.edge = line;
    const bands = new THREE.Group();
    [0.48, h - 0.38].forEach(y => {
      [-1, 1].forEach(side => {
        const front = new THREE.Mesh(new THREE.BoxGeometry(size + 0.06, 0.1, 0.08), mats.crateBand);
        front.position.set(0, y - h / 2, side * (size / 2 + 0.045));
        bands.add(front);
        const sideBand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, size + 0.06), mats.crateBand);
        sideBand.position.set(side * (size / 2 + 0.045), y - h / 2, 0);
        bands.add(sideBand);
      });
    });
    const labelPlate = new THREE.Mesh(new THREE.BoxGeometry(size * 0.42, 0.34, 0.07), mats.metal);
    labelPlate.position.set(0, 0.04, -size / 2 - 0.055);
    bands.add(labelPlate);
    bands.position.copy(mesh.position);
    scene.add(bands);
    if (custom) bands.visible = false;
    mesh.userData.bands = bands;
    const wall = walls[walls.length - 1];
    if (wall) wall.climbable = true;
    return mesh;
  }

  function addContainer(x, z, rot = 0, colorMat = mats.containerBlue) {
    const customId = colorMat === mats.containerRed ? "container_red" : "container_blue";
    const custom = assetModel(customId, { scale: 1, position: new THREE.Vector3(x, 0, z), rotationY: rot });
    if (custom) {
      scene.add(custom);
    }
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(10, 3.3, 3.2), colorMat);
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);
    for (let i = -4; i <= 4; i += 2) {
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.42, 3.34), mats.metal);
      rib.position.x = i;
      group.add(rib);
    }
    [-1.68, 1.68].forEach(zSide => {
      [-1.16, 1.16].forEach(y => {
        const rail = new THREE.Mesh(new THREE.BoxGeometry(10.12, 0.08, 0.08), mats.crateBand);
        rail.position.set(0, y, zSide);
        group.add(rail);
      });
      [-4.6, 4.6].forEach(xSide => {
        const lockBar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.55, 0.08), mats.metal);
        lockBar.position.set(xSide, 0, zSide);
        group.add(lockBar);
      });
    });
    group.position.set(x, 1.65, z);
    group.rotation.y = rot;
    scene.add(group);
    if (custom) group.visible = false;
    const horizontal = Math.abs(Math.cos(rot)) > 0.7;
    walls.push({
      x,
      z,
      halfX: horizontal ? 5 : 1.6,
      halfZ: horizontal ? 1.6 : 5,
      h: 3.3,
      mesh: group,
      label: "container"
    });
    return group;
  }

  function addBarrel(x, z) {
    const custom = assetModel("barrel", { scale: 1, position: new THREE.Vector3(x, 0, z) });
    if (custom) scene.add(custom);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.35, 24), mats.barrel);
    mesh.position.set(x, 0.68, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (custom) mesh.visible = false;
    [0.12, 0.68, 1.24].forEach(y => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.56, 0.025, 6, 24), mats.metal);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, y, z);
      ring.castShadow = true;
      scene.add(ring);
      if (custom) ring.visible = false;
    });
    walls.push({ x, z, halfX: 0.62, halfZ: 0.62, h: 1.35, mesh, label: "barril" });
    return mesh;
  }

  function addLightPost(x, z) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 4.4, 10), mats.black);
    post.position.set(x, 2.2, z);
    post.castShadow = true;
    scene.add(post);
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe6a3 }));
    lamp.position.set(x, 4.5, z);
    scene.add(lamp);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.72, 16, 10), mats.lampGlow);
    glow.position.set(x, 4.5, z);
    scene.add(glow);
    const light = new THREE.PointLight(0xffd08b, 0.18, 18, 2.2);
    light.position.set(x, 4.4, z);
    scene.add(light);
    const pool = addGroundMark(x, z, 8, 8, 0xffc884, 0, 0.08);
    streetLights.push({ light, glow, pool });
  }

  function addScenicDetails() {
    addGroundLayer(0, -9.2, WORLD_W * 0.72, 0.18, mats.roadEdge, 0, 0.038);
    addGroundLayer(0, 9.2, WORLD_W * 0.72, 0.18, mats.roadEdge, 0, 0.038);

    for (let x = -54; x <= 54; x += 18) {
      addGroundMark(x, 0, 7.4, 0.22, 0xf6e8bc, 0, 0.42);
    }
    [-26, 26].forEach(z => {
      for (let x = -64; x <= 64; x += 16) {
        addGroundMark(x, z, 5.8, 0.16, 0xd8cda2, 0, 0.18);
      }
    });

    [
      [0, 52, 46, 0.16, 0x74c7ff, 0],
      [0, -52, 46, 0.16, 0xffbd68, 0],
      [-18, -39, 46, 0.16, 0xffd76d, 0],
      [18, 40, 46, 0.16, 0xffd76d, 0],
      [-50, -18, 28, 0.12, 0x74c7ff, Math.PI / 2],
      [50, 13, 32, 0.12, 0xff6d5d, Math.PI / 2]
    ].forEach(([x, z, w, d, color, rot]) => addGroundMark(x, z, w, d, color, rot, 0.22));

    const { x, z, halfX, halfZ } = BOMB_SITE;
    addGroundMark(x, z - halfZ - 0.35, halfX * 2 + 2, 0.16, 0xff6d5d, 0, 0.42);
    addGroundMark(x, z + halfZ + 0.35, halfX * 2 + 2, 0.16, 0xff6d5d, 0, 0.42);
    addGroundMark(x - halfX - 0.35, z, 0.16, halfZ * 2 + 2, 0xff6d5d, 0, 0.42);
    addGroundMark(x + halfX + 0.35, z, 0.16, halfZ * 2 + 2, 0xff6d5d, 0, 0.42);
    for (let offset = -6; offset <= 6; offset += 3) {
      addGroundMark(x + offset, z, 0.12, halfZ * 1.65, 0xffd76d, 0, 0.18);
    }
    addGroundMark(x, z, halfX * 1.55, 0.14, 0xffd76d, 0, 0.34);
    addGroundMark(x, z, 0.14, halfZ * 1.55, 0xffd76d, 0, 0.34);
  }

  function createBombMesh() {
    const custom = assetModel("bomb", { scale: 1 });
    if (custom) {
      custom.visible = false;
      scene.add(custom);
      bomb.mesh = custom;
      bomb.light = null;
      return custom;
    }
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.36, 0.62), mats.bombCore);
    body.position.y = 0.26;
    body.castShadow = true;
    group.add(body);

    [-0.22, 0.22].forEach(z => {
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.82, 14), mats.metal);
      tube.rotation.z = Math.PI / 2;
      tube.position.set(0, 0.44, z);
      tube.castShadow = true;
      group.add(tube);
    });

    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.05), mats.bombScreen);
    screen.position.set(0.12, 0.48, -0.34);
    group.add(screen);

    const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), mats.accentRed);
    led.position.set(-0.3, 0.5, -0.34);
    group.add(led);

    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.62, 6), mats.black);
    antenna.position.set(0.38, 0.72, 0.2);
    antenna.rotation.z = -0.24;
    group.add(antenna);

    const light = new THREE.PointLight(0xff6d5d, 0, 6, 2);
    light.position.set(0, 0.8, 0);
    group.add(light);

    group.visible = false;
    group.userData.led = led;
    group.userData.light = light;
    scene.add(group);
    bomb.mesh = group;
    bomb.light = light;
    return group;
  }

  function setBombVisible(visible, pos = null) {
    if (!bomb.mesh) return;
    bomb.mesh.visible = visible;
    if (pos) bomb.mesh.position.set(pos.x, 0.06, pos.z);
    if (!visible && bomb.light) bomb.light.intensity = 0;
  }

  function updateBombVisual() {
    if (!bomb.mesh || bomb.state !== "planted") return;
    const pulse = 0.5 + Math.sin(performance.now() * 0.014) * 0.5;
    if (bomb.light) bomb.light.intensity = 0.55 + pulse * 1.15;
    if (bomb.mesh.userData.led) {
      bomb.mesh.userData.led.material = pulse > 0.45 ? mats.accentRed : mats.bombScreen;
    }
  }

  function makeSignTexture(text, bg = "#1a1d17", fg = "#f5f2e8", accent = "#ff6d5d") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 192;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = accent;
    ctx.fillRect(0, 0, 18, canvas.height);
    ctx.fillRect(0, canvas.height - 16, canvas.width, 16);
    ctx.fillStyle = "rgba(255,255,255,0.09)";
    for (let x = 52; x < canvas.width; x += 46) ctx.fillRect(x, 0, 1, canvas.height);
    ctx.fillStyle = fg;
    ctx.font = "900 72px Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2 + 8, canvas.height / 2 - 3);
    const texture = new THREE.CanvasTexture(canvas);
    if ("colorSpace" in texture) texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  function addSign(x, z, y, text, rot = 0, accent = "#ff6d5d") {
    const mat = new THREE.MeshBasicMaterial({ map: makeSignTexture(text, "#171913", "#f6f0df", accent), transparent: true });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 1.8), mat);
    sign.position.set(x, y, z);
    sign.rotation.y = rot;
    scene.add(sign);
    return sign;
  }

  function addGroundMark(x, z, w, d, color, rot = 0, opacity = 0.78) {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rot;
    mesh.position.set(x, 0.035, z);
    scene.add(mesh);
    return mesh;
  }

  function addGroundLayer(x, z, w, d, mat, rot = 0, y = 0.035) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.rotation.z = rot;
    mesh.position.set(x, y, z);
    scene.add(mesh);
    return mesh;
  }

  function addNeonStrip(x, z, w, rot, mat, y = 3.7) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 0.12), mat);
    strip.position.set(x, y, z);
    strip.rotation.y = rot;
    scene.add(strip);
    const light = new THREE.PointLight(mat.color || 0xffffff, 0.35, 12);
    light.position.set(x, y + 0.25, z);
    scene.add(light);
    return strip;
  }

  function addRooftopKit(x, z, w = 5, d = 3, rot = 0) {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.35, d), mats.metal);
    base.position.y = 0.18;
    base.castShadow = true;
    group.add(base);
    const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.75, 16), mats.metal);
    vent.position.set(w * 0.28, 0.76, -d * 0.2);
    vent.castShadow = true;
    group.add(vent);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.3, 8), mats.black);
    antenna.position.set(-w * 0.28, 1.28, d * 0.22);
    antenna.castShadow = true;
    group.add(antenna);
    group.position.set(x, 5.45, z);
    group.rotation.y = rot;
    scene.add(group);
    return group;
  }

  function addCable(x1, z1, x2, z2, y = 5.3) {
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(x1, y, z1),
      new THREE.Vector3((x1 + x2) / 2, y - 0.55, (z1 + z2) / 2),
      new THREE.Vector3(x2, y, z2)
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.85 }));
    scene.add(line);
    return line;
  }

  function addHouse(x, z, w, d, h, mat = mats.house, label = "casa") {
    const group = new THREE.Group();

    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    body.position.y = h / 2;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.9, 0.65, d + 0.9), mats.roof);
    roof.position.y = h + 0.35;
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);

    const trimLow = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, 0.16, 0.18), mats.trim);
    trimLow.position.set(0, 0.72, -d / 2 - 0.09);
    group.add(trimLow);

    const trimHigh = new THREE.Mesh(new THREE.BoxGeometry(w + 0.42, 0.14, 0.2), mats.trim);
    trimHigh.position.set(0, h - 0.28, -d / 2 - 0.1);
    group.add(trimHigh);

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.1, 0.08), mats.black);
    door.position.set(-w * 0.24, 1.05, -d / 2 - 0.045);
    group.add(door);

    [-0.18, 0.24].forEach(offset => {
      const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.78, 0.09), mats.windowLit);
      windowMesh.position.set(w * offset, 2.62, -d / 2 - 0.055);
      group.add(windowMesh);
      const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.65, 1.1), mats.lampGlow);
      glow.position.set(w * offset, 2.62, -d / 2 - 0.075);
      group.add(glow);
    });

    const sideWindow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.78, 1.25), mats.glass);
    sideWindow.position.set(w / 2 + 0.055, 2.45, d * 0.18);
    group.add(sideWindow);

    group.position.set(x, 0, z);
    scene.add(group);
    walls.push({ x, z, halfX: w / 2, halfZ: d / 2, h: h + 0.7, mesh: group, label });
    return group;
  }

  function addVehicle(x, z, rot = 0, colorMat = mats.containerRed) {
    const customId = colorMat === mats.containerBlue ? "vehicle_blue" : "vehicle_red";
    const custom = assetModel(customId, { scale: 1, position: new THREE.Vector3(x, 0, z), rotationY: rot });
    if (custom) scene.add(custom);
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.9, 2.25), colorMat);
    body.position.y = 0.85;
    body.castShadow = true;
    body.receiveShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.86, 1.75), mats.glass);
    cabin.position.set(-0.35, 1.38, 0);
    cabin.castShadow = true;
    group.add(cabin);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.18, 1.92), mats.metal);
    hood.position.set(-1.42, 1.22, 0);
    hood.castShadow = true;
    group.add(hood);

    const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 2.08), mats.black);
    bumperFront.position.set(-2.52, 0.62, 0);
    bumperFront.castShadow = true;
    group.add(bumperFront);

    const bumperRear = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.24, 2.08), mats.black);
    bumperRear.position.set(2.52, 0.62, 0);
    bumperRear.castShadow = true;
    group.add(bumperRear);

    [-0.58, 0.58].forEach(pz => {
      const headlight = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.34), mats.lanePaint);
      headlight.position.set(-2.42, 0.92, pz);
      group.add(headlight);

      const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.3), mats.accentRed);
      tail.position.set(2.42, 0.9, pz);
      group.add(tail);
    });

    [-1.55, 1.55].forEach(px => {
      [-0.96, 0.96].forEach(pz => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.28, 12), mats.black);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(px, 0.42, pz);
        wheel.castShadow = true;
        group.add(wheel);
      });
    });

    group.position.set(x, 0, z);
    group.rotation.y = rot;
    scene.add(group);
    if (custom) group.visible = false;

    const horizontal = Math.abs(Math.cos(rot)) > 0.7;
    walls.push({
      x,
      z,
      halfX: horizontal ? 2.4 : 1.12,
      halfZ: horizontal ? 1.12 : 2.4,
      h: 1.75,
      mesh: group,
      label: "veiculo",
      climbable: true
    });
    return group;
  }

  function buildMap() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_D), mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const asphalt = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W * 0.72, 18), mats.asphalt);
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.position.y = 0.014;
    asphalt.receiveShadow = true;
    scene.add(asphalt);

    const grid = new THREE.GridHelper(156, 30, 0x252c20, 0x252c20);
    grid.position.y = 0.012;
    scene.add(grid);

    addBox(0, -WORLD_D / 2, WORLD_W, 2.4, 4.2, mats.darkWall, "muro");
    addBox(0, WORLD_D / 2, WORLD_W, 2.4, 4.2, mats.darkWall, "muro");
    addBox(-WORLD_W / 2, 0, 2.4, WORLD_D, 4.2, mats.darkWall, "muro");
    addBox(WORLD_W / 2, 0, 2.4, WORLD_D, 4.2, mats.darkWall, "muro");

    addBox(-50, -18, 4, 42, 5.3, mats.wall, "predio B");
    addBox(50, 13, 4, 48, 5.3, mats.wall, "predio A");
    addBox(-18, -39, 48, 4, 4.2, mats.brick, "corredor baixo");
    addBox(18, 40, 48, 4, 4.2, mats.brick, "corredor alto");
    addBox(0, 0, 18, 4, 3.2, mats.wall, "meio");
    addBox(-20, 12, 4, 18, 3.6, mats.wall, "janela");
    addBox(23, -14, 4, 18, 3.6, mats.wall, "porta");
    addBox(-55, 26, 24, 3.4, 3.4, mats.brick, "varanda B");
    addBox(55, -30, 24, 3.4, 3.4, mats.brick, "varanda A");
    addBox(-5, 30, 4, 20, 3.2, mats.wall, "meio alto");
    addBox(5, -31, 4, 20, 3.2, mats.wall, "meio baixo");

    addCrate(-13, 5, 4, 2.7);
    addCrate(-5, 8, 4, 2.7);
    addCrate(14, -6, 4, 2.7);
    addCrate(7, -12, 3.6, 2.5);
    addCrate(-42, 24, 4.5, 2.8);
    addCrate(43, -24, 4.5, 2.8);
    addCrate(0, 17, 3.4, 2.4);
    addCrate(0, -19, 3.4, 2.4);
    addCrate(-32, -4, 3.6, 2.5);
    addCrate(31, 9, 3.6, 2.5);
    addCrate(-58, -41, 4.5, 2.8);
    addCrate(58, 43, 4.5, 2.8);

    addContainer(-36, 39, 0, mats.containerBlue);
    addContainer(-27, 43, 0, mats.containerRed);
    addContainer(34, -42, 0, mats.containerRed);
    addContainer(46, -38, Math.PI / 2, mats.containerBlue);
    addContainer(-61, 2, Math.PI / 2, mats.containerBlue);
    addContainer(62, -2, Math.PI / 2, mats.containerRed);

    addHouse(-68, 34, 11, 10, 4.4, mats.house, "casa oeste");
    addHouse(-68, -43, 12, 9, 4.2, mats.houseDark, "casa rural");
    addHouse(68, 35, 10, 11, 4.5, mats.house, "casa norte");
    addHouse(68, -44, 11, 10, 4.2, mats.houseDark, "oficina");
    addHouse(-36, -26, 10, 8, 3.8, mats.house, "mercado baixo");
    addHouse(36, 27, 10, 8, 3.8, mats.houseDark, "mercado alto");

    addVehicle(-58, -9, Math.PI / 2, mats.containerBlue);
    addVehicle(58, 9, Math.PI / 2, mats.containerRed);
    addVehicle(-38, -52, 0, mats.containerRed);
    addVehicle(38, 52, 0, mats.containerBlue);

    addBox(-66, 13, 12, 1.2, 1.8, mats.brick, "mureta vila");
    addBox(66, -15, 12, 1.2, 1.8, mats.brick, "mureta oficina");
    addBox(-38, 52, 18, 1.2, 1.6, mats.darkWall, "mureta ct");
    addBox(38, -52, 18, 1.2, 1.6, mats.darkWall, "mureta tr");

    [-24, -20, 20, 24].forEach(x => addBarrel(x, -8));
    [-46, -43, 43, 46].forEach(x => addBarrel(x, 18));
    addBarrel(-64, -24);
    addBarrel(64, 26);

    const site = new THREE.Mesh(new THREE.BoxGeometry(18, 0.08, 14), mats.site);
    site.position.set(42, 0.05, 42);
    site.receiveShadow = true;
    scene.add(site);

    const siteText = makeSiteMarker();
    siteText.position.set(42, 0.12, 42);
    scene.add(siteText);
    createBombMesh();

    [-60, -30, 0, 30, 60].forEach(x => {
      addLightPost(x, -52);
      addLightPost(x, 52);
    });

    addSign(-50.1, 0, 3.2, "B LINK", Math.PI / 2, "#74c7ff");
    addSign(50.1, 1, 3.2, "A MAIN", -Math.PI / 2, "#ff6d5d");
    addSign(0, -39.1, 3.15, "MID", 0, "#ffd76d");
    addSign(42, 34.8, 1.7, "SITE A", Math.PI, "#ff6d5d");
    addSign(-64, 28.9, 2.7, "MARKET", Math.PI, "#74c7ff");
    addSign(64, -38.8, 2.7, "GARAGE", 0, "#ffd76d");

    addGroundMark(42, 42, 20, 1.2, 0xff6d5d, 0, 0.38);
    addGroundMark(42, 42, 1.2, 16, 0xff6d5d, 0, 0.38);
    addGroundMark(-42, 27, 18, 1.0, 0x74c7ff, 0.18, 0.35);
    addGroundMark(0, 0, 24, 0.8, 0xffd76d, 0, 0.32);
    addGroundMark(0, 0, 0.8, 18, 0xffd76d, 0, 0.32);

    addNeonStrip(-50, -4, 10, Math.PI / 2, mats.accentBlue, 5.55);
    addNeonStrip(50, -2, 10, Math.PI / 2, mats.accentRed, 5.55);
    addNeonStrip(18, 40, 14, 0, mats.accentGold, 4.5);
    addNeonStrip(-18, -39, 14, 0, mats.accentGold, 4.5);

    addRooftopKit(-68, 34, 4.7, 3.2, 0.2);
    addRooftopKit(68, -44, 4.7, 3.4, -0.35);
    addRooftopKit(-36, -26, 3.8, 2.8, 0.8);
    addRooftopKit(36, 27, 3.8, 2.8, -0.8);

    addCable(-60, 52, -30, 52, 5.2);
    addCable(30, 52, 60, 52, 5.2);
    addCable(-60, -52, -30, -52, 5.2);
    addCable(30, -52, 60, -52, 5.2);

    addScenicDetails();
  }

  function makeSiteMarker() {
    const group = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(6.2, 0.08, 6, 42), new THREE.MeshBasicMaterial({ color: 0xffcc4c }));
    ring.rotation.x = -Math.PI / 2;
    group.add(ring);
    const cross = new THREE.Mesh(new THREE.BoxGeometry(9, 0.05, 0.22), new THREE.MeshBasicMaterial({ color: 0xffcc4c }));
    group.add(cross);
    const cross2 = cross.clone();
    cross2.rotation.y = Math.PI / 2;
    group.add(cross2);
    return group;
  }

  const BOT_SKINS = [0xd4a07a, 0xc08850, 0xf0c8a0, 0x8a6040, 0x6b4530, 0xe8b890];

  function createBotMesh(colorMat, skinHex) {
    const customId = colorMat === mats.ct ? "bot_ct" : "bot_tr";
    const custom = assetModel(customId, { scale: 1 });
    if (custom) return custom;

    const group = new THREE.Group();

    const uniform = colorMat;
    const skin = makeMat(skinHex ?? 0xc99b72, 0.68);
    const boot = makeMat(0x171915, 0.78);
    const gear = makeMat(0x242822, 0.7);
    const darkSkin = makeMat(skinHex ? skinHex * 0.7 : 0x8a6845, 0.7);
    const eyeWhite = makeMat(0xf0ece0, 0.5);
    const eyePupil = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.3 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.43, 0.74, 8, 14), uniform);
    torso.position.y = 1.18;
    torso.scale.set(0.92, 1, 0.7);
    torso.castShadow = true;
    group.add(torso);

    const vest = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.72, 0.32), gear);
    vest.position.set(0, 1.2, -0.18);
    vest.castShadow = true;
    group.add(vest);

    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.38), mats.black);
    belt.position.set(0, 0.78, -0.02);
    belt.castShadow = true;
    group.add(belt);

    [-1, 1].forEach(side => {
      const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.56, 6, 10), uniform);
      leg.position.set(side * 0.19, 0.42, 0);
      leg.rotation.z = side * 0.04;
      leg.castShadow = true;
      group.add(leg);

      const foot = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.5), boot);
      foot.position.set(side * 0.19, 0.08, -0.08);
      foot.castShadow = true;
      group.add(foot);

      const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.58, 6, 10), uniform);
      arm.position.set(side * 0.5, 1.22, -0.2);
      arm.rotation.z = side * 0.25;
      arm.rotation.x = Math.PI / 2.7;
      arm.castShadow = true;
      group.add(arm);

      const hand = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), skin);
      hand.position.set(side * 0.34, 1.17, -0.58);
      hand.castShadow = true;
      group.add(hand);
    });

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.18, 10), skin);
    neck.position.y = 1.71;
    neck.castShadow = true;
    group.add(neck);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 20, 16), skin);
    head.position.y = 1.98;
    head.castShadow = true;
    group.add(head);

    // jaw / chin
    const jaw = new THREE.Mesh(new THREE.SphereGeometry(0.21, 14, 10), skin);
    jaw.scale.set(0.9, 0.72, 0.88);
    jaw.position.set(0, 1.73, -0.06);
    group.add(jaw);

    // eyes — white + pupil
    [-1, 1].forEach(side => {
      const eyeW = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), eyeWhite);
      eyeW.position.set(side * 0.12, 1.99, -0.28);
      group.add(eyeW);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), eyePupil);
      pupil.position.set(side * 0.12, 1.99, -0.31);
      group.add(pupil);
      // brow
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.022, 0.018), darkSkin);
      brow.position.set(side * 0.12, 2.055, -0.295);
      group.add(brow);
    });

    // nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 0.06), skin);
    nose.position.set(0, 1.95, -0.31);
    group.add(nose);

    // mouth line
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.018, 0.018), darkSkin);
    mouth.position.set(0, 1.89, -0.298);
    group.add(mouth);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), gear);
    helmet.position.y = 2.04;
    helmet.castShadow = true;
    group.add(helmet);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.05), mats.glass);
    visor.position.set(0, 1.98, -0.29);
    group.add(visor);

    // ear flaps on helmet
    [-1, 1].forEach(side => {
      const earFlap = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.22), gear);
      earFlap.position.set(side * 0.33, 1.96, 0.04);
      group.add(earFlap);
    });

    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.95), mats.black);
    gun.position.set(0.08, 1.18, -0.83);
    gun.castShadow = true;
    group.add(gun);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.34, 8), mats.black);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.08, 1.18, -1.48);
    barrel.castShadow = true;
    group.add(barrel);

    return group;
  }

  function resetPlayer() {
    if (gameMode === "bomb" && net.mode === "offline") {
      player.position.set(0, PLAYER_HEIGHT, -50);
      player.yaw = Math.PI;
    } else {
      player.position.set(0, PLAYER_HEIGHT, 50);
      player.yaw = 0;
    }
    player.pitch = 0;
    player.hp = 100;
    player.armor = 0;
    player.hpKits = 0;
    player.armorKits = 0;
    player.kills = 0;
    player.alive = true;
    player.velocityY = 0;
    player.grounded = true;
    player.groundY = 0;
    player.jumpHeld = false;
    player.reloading = false;
    player.fireCooldown = 0;
    player.reloadEnd = 0;
    equip(player.weaponId);
  }

  function spawnBots() {
    bots.forEach(bot => scene.remove(bot.mesh));
    bots.length = 0;
    if (gameMode === "bomb" && net.mode === "offline") {
      const spots = [
        [31, 35], [43, 31], [54, 40], [36, 50],
        [55, 27], [26, 46], [47, 52]
      ];
      const count = clamp(4 + Math.floor(round / 3), 4, 7);
      for (let i = 0; i < count; i++) {
        const [x, z] = spots[i % spots.length];
        const bot = {
          position: new THREE.Vector3(x + rand(-1.5, 1.5), 0, z + rand(-1.5, 1.5)),
          yaw: rand(-Math.PI, Math.PI),
          hp: 96 + round * 3,
          alive: true,
          fireCooldown: 0,
          reloadEnd: 0,
          ammo: round > 3 ? WEAPONS.rifle.mag : WEAPONS.smg.mag,
          weaponId: round > 3 ? "rifle" : "smg",
          strafe: i % 2 ? 1 : -1,
          think: rand(0, 0.8),
          target: new THREE.Vector3(BOMB_SITE.x + rand(-8, 8), 0, BOMB_SITE.z + rand(-6, 6)),
          mesh: createBotMesh(mats.ct, BOT_SKINS[i % BOT_SKINS.length])
        };
        bot.mesh.position.copy(bot.position);
        scene.add(bot.mesh);
        bots.push(bot);
      }
      return;
    }
    const count = clamp(3 + Math.floor(round / 2), 3, 8);
    for (let i = 0; i < count; i++) {
      const bot = {
        position: new THREE.Vector3(-30 + i * 12, 0, -20 + (i % 3) * 10),
        yaw: 0,
        hp: 92 + round * 4,
        alive: true,
        fireCooldown: 0,
        reloadEnd: 0,
        ammo: round > 4 ? WEAPONS.rifle.mag : WEAPONS.smg.mag,
        weaponId: round > 4 ? "rifle" : "smg",
        strafe: i % 2 ? 1 : -1,
        think: rand(0, 1),
        mesh: createBotMesh(mats.tr, BOT_SKINS[i % BOT_SKINS.length])
      };
      bot.mesh.position.copy(bot.position);
      scene.add(bot.mesh);
      bots.push(bot);
    }
  }

  function resetBombObjective() {
    bomb.state = "idle";
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;
    bomb.explodeTimer = 0;
    bomb.roundTimer = 0;
    touchInput.plant = false;
    setBombVisible(false);
  }

  function playerInBombSite() {
    return Math.abs(player.position.x - BOMB_SITE.x) <= BOMB_SITE.halfX &&
      Math.abs(player.position.z - BOMB_SITE.z) <= BOMB_SITE.halfZ;
  }

  function bombPosition() {
    if (bomb.mesh && bomb.mesh.visible) return bomb.mesh.position;
    return new THREE.Vector3(BOMB_SITE.x, 0, BOMB_SITE.z);
  }

  function equip(id) {
    player.weaponId = id;
    player.ammo = WEAPONS[id].mag;
    player.reloading = false;
    updateViewModel();
  }

  function getPlayerName() {
    const input = el("playerName");
    const saved = localStorage.getItem("taticoName") || "";
    const name = (input?.value || saved || "Jogador").trim().slice(0, 16);
    return name || "Jogador";
  }

  function setManual(enabled) {
    manualEnabled = enabled;
    localStorage.setItem("taticoManual", enabled ? "on" : "off");
    updateManualUi();
  }

  function updateManualUi() {
    el("manualOn").classList.toggle("active", manualEnabled);
    el("manualOff").classList.toggle("active", !manualEnabled);
    el("manualPanel").hidden = !manualEnabled;
  }

  function setCrosshairStyle(style) {
    crosshairStyle = crosshairStyles.includes(style) ? style : "pro";
    localStorage.setItem("taticoCrosshair", crosshairStyle);
    const crosshair = el("crosshair");
    crosshair.classList.remove(...crosshairStyles.map(item => "crosshair-" + item));
    crosshair.classList.add("crosshair-" + crosshairStyle);
    document.querySelectorAll("[data-crosshair]").forEach(button => {
      button.classList.toggle("active", button.dataset.crosshair === crosshairStyle);
    });
  }

  function setTimeMode(mode) {
    worldTime = timeModes.includes(mode) ? mode : "day";
    localStorage.setItem("taticoTime", worldTime);
    const night = worldTime === "night";

    scene.background.set(night ? 0x050912 : 0x6aa8d4);
    scene.fog.color.set(night ? 0x050912 : 0x8ec4e8);
    scene.fog.near = night ? 38 : 55;
    scene.fog.far = night ? 138 : 165;
    renderer.toneMappingExposure = night ? 0.92 : 1.22;

    hemi.color.set(night ? 0x9bbdff : 0xc9e8ff);
    hemi.groundColor.set(night ? 0x171a24 : 0x5a6e3e);
    hemi.intensity = night ? 0.98 : 2.1;
    sun.color.set(night ? 0xb4c8ff : 0xffe8b0);
    sun.position.set(night ? 24 : -38, night ? 34 : 56, night ? -44 : 24);
    sun.intensity = night ? 0.58 : 2.8;
    fill.color.set(night ? 0x3b6cff : 0x9fc4ff);
    fill.intensity = night ? 0.72 : 0.5;
    rim.color.set(night ? 0x74c7ff : 0xff9060);
    rim.intensity = night ? 0.5 : 0.38;

    document.body.dataset.time = worldTime;
    streetLights.forEach(({ light, glow, pool }) => {
      light.intensity = night ? 1.35 : 0.18;
      glow.material.opacity = night ? 0.34 : 0.13;
      pool.material.opacity = night ? 0.18 : 0.055;
    });
    document.querySelectorAll("[data-time]").forEach(button => {
      button.classList.toggle("active", button.dataset.time === worldTime);
    });
  }

  function toggleQuickSettings(open = el("quickSettings").hidden) {
    const panel = el("quickSettings");
    panel.hidden = !open;
    if (open && document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
    if (open) mouse.down = false;
  }

  function phaseFromMatchState(matchState) {
    if (matchState === "buy") return "buy";
    if (matchState === "live") return "live";
    if (matchState === "resetting") return "round_end";
    if (matchState === "waiting") return "warmup";
    return "connecting";
  }

  function onlineStateLabel(matchState) {
    if (matchState === "buy") return "Compra " + Math.ceil((net.buyRemainingMs || 0) / 1000) + "s";
    if (matchState === "live") return "Combate";
    if (matchState === "resetting") return "Fim do round";
    if (matchState === "waiting") return "Aquecimento";
    return "Conectando";
  }

  function clearRemotePlayers() {
    for (const remote of remotePlayers.values()) {
      scene.remove(remote.mesh);
    }
    remotePlayers.clear();
  }

  function disconnectOnline() {
    const oldWs = net.ws;
    net.ws = null;
    net.id = null;
    net.team = null;
    net.joined = false;
    net.players = [];
    net.slots = { CT: 0, TR: 0 };
    net.room = null;
    net.spawnId = -1;
    el("onlinePanel").hidden = true;
    el("sessionBanner").hidden = true;
    clearRemotePlayers();
    if (oldWs) try { oldWs.close(); } catch { /* ignore */ }
  }

  function startGame() {
    net.mode = "offline";
    gameMode = "elimination";
    disconnectOnline();
    round = 1;
    ctScore = 0;
    trScore = 0;
    player.money = 800;
    player.owned = new Set(["pistol"]);
    player.weaponId = "pistol";
    localStorage.setItem("taticoName", getPlayerName());
    el("startScreen").classList.add("hidden");
    el("buyButton").hidden = false;
    startBuyPhase();
  }

  function startBombGame() {
    net.mode = "offline";
    gameMode = "bomb";
    disconnectOnline();
    round = 1;
    ctScore = 0;
    trScore = 0;
    player.money = 1000;
    player.owned = new Set(["pistol"]);
    player.weaponId = "pistol";
    resetBombObjective();
    localStorage.setItem("taticoName", getPlayerName());
    el("startScreen").classList.add("hidden");
    el("buyButton").hidden = false;
    startBuyPhase();
  }

  function onlineSocketUrl() {
    if (location.protocol === "https:") return "wss://" + location.host + "/multiplayer";
    if (location.protocol === "http:") return "ws://" + location.host + "/multiplayer";
    return null;
  }

  function cleanRoomCode() {
    return (el("roomCode").value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }

  function renderPublicRooms(rooms = [], status = "") {
    const list = el("publicRooms");
    if (!list) return;
    if (status) {
      list.textContent = status;
      return;
    }
    if (!rooms.length) {
      list.textContent = "Nenhuma sala publica agora. Clique em Entrar em sala publica para criar uma.";
      return;
    }
    list.innerHTML = rooms.map(room => {
      const state = room.matchState === "live" ? "Combate" : room.matchState === "buy" ? "Compra" : room.matchState === "resetting" ? "Fim" : "Aquecimento";
      const slots = (room.slots?.CT || 0) + " CT / " + (room.slots?.TR || 0) + " TR";
      return "<button type=\"button\" data-join-room=\"" + room.code + "\">" +
        "<strong>Sala " + room.code + "</strong>" +
        "<span>" + room.players + "/" + room.capacity + "</span>" +
        "<em>" + state + " · " + slots + "</em>" +
        "</button>";
    }).join("");
  }

  async function refreshPublicRooms() {
    if (location.protocol !== "http:" && location.protocol !== "https:") {
      renderPublicRooms([], "Abra pelo Render ou com npm start para listar salas.");
      return;
    }
    try {
      const response = await fetch("/rooms", { cache: "no-store" });
      if (!response.ok) throw new Error("rooms unavailable");
      const data = await response.json();
      renderPublicRooms(data.rooms || []);
    } catch {
      renderPublicRooms([], "Servidor de salas nao respondeu. Use o Render Web Service ou rode npm start.");
    }
  }

  function startOnlineGame(roomMode = "quick", forcedRoomCode = "") {
    const url = onlineSocketUrl();
    if (!url) {
      setMessage("Abra pelo servidor", "Use o Render ou rode npm start.", 3600);
      return;
    }

    const roomCode = (forcedRoomCode || cleanRoomCode()).toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    if (roomMode === "join" && roomCode.length < 4) {
      setMessage("Codigo da sala", "Digite o codigo que seu amigo recebeu.", 2600);
      return;
    }

    net.mode = "online";
    gameMode = "elimination";
    disconnectOnline();
    net.mode = "online";
    net.pendingRoomMode = roomMode;
    net.pendingRoomCode = roomCode;
    net.pendingPrivate = el("privateRoom").checked;
    phase = "connecting";
    player.money = 800;
    player.owned = new Set(["pistol"]);
    equip("pistol");
    localStorage.setItem("taticoName", getPlayerName());
    el("startScreen").classList.add("hidden");
    el("buyButton").hidden = false;
    showBuy(false);
    connectOnline(url);
  }

  function connectOnline(url) {
    const modeLabel = net.pendingRoomMode === "create" ? "Criando sala" : net.pendingRoomMode === "join" ? "Entrando por codigo" : "Procurando sala";
    setMessage(modeLabel, "Conectando no servidor 4x4...", 3000);
    const ws = new WebSocket(url);
    net.ws = ws;

    ws.addEventListener("open", () => {
      sendOnline({
        type: "join",
        name: getPlayerName(),
        roomMode: net.pendingRoomMode,
        roomCode: net.pendingRoomCode,
        private: net.pendingPrivate
      });
    });

    ws.addEventListener("message", event => {
      let data;
      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }
      handleOnlineMessage(data);
    });

    ws.addEventListener("close", () => {
      if (net.ws !== ws) return;
      if (net.mode !== "online") return;
      setMessage("Conexao perdida", "Verifique sua internet e tente de novo.", 4000);
      phase = "menu";
      el("startScreen").classList.remove("hidden");
      el("buyButton").hidden = false;
      disconnectOnline();
      net.mode = "offline";
    });

    ws.addEventListener("error", () => {
      setMessage("Servidor online nao respondeu", "Use o link do Render ou rode npm start.", 4200);
    });
  }

  function sendOnline(data) {
    if (!net.ws || net.ws.readyState !== WebSocket.OPEN) return;
    net.ws.send(JSON.stringify(data));
  }

  function handleOnlineMessage(data) {
    if (data.type === "joined") {
      net.id = data.id;
      net.team = data.team;
      net.room = data.room || null;
      net.matchState = data.matchState || "waiting";
      net.buyRemainingMs = data.buyRemainingMs || 0;
      net.joined = true;
      phase = phaseFromMatchState(net.matchState);
      player.alive = true;
      player.hp = 100;
      player.position.set(data.spawn.x, data.spawn.y || PLAYER_HEIGHT, data.spawn.z);
      player.yaw = data.spawn.yaw || 0;
      player.pitch = 0;
      player.velocityY = 0;
      player.grounded = true;
      ctScore = data.scores?.CT || 0;
      trScore = data.scores?.TR || 0;
      const roomText = net.room?.code ? "Sala " + net.room.code : "Sala online";
      const joinHint = phase === "warmup" ? "Aquecimento ate entrar outro time." : "Clique no jogo para mirar.";
      setMessage("Voce entrou no " + data.team, roomText + " · " + joinHint, 3000);
      el("onlinePanel").hidden = false;
      updateOnlinePanel();
      if (phase === "buy") showBuy(true);
      return;
    }

    if (data.type === "state") {
      const previousPhase = phase;
      net.players = data.players || [];
      net.scores = data.scores || net.scores;
      net.slots = data.slots || net.slots;
      net.room = data.room || net.room;
      net.matchState = data.matchState || net.matchState;
      net.buyRemainingMs = data.buyRemainingMs || 0;
      round = data.round || round;
      ctScore = net.scores.CT || 0;
      trScore = net.scores.TR || 0;

      if (net.mode === "online") {
        phase = phaseFromMatchState(net.matchState);

        if (phase === "buy" && previousPhase !== "buy") {
          showBuy(true);
          setMessage("Fase de compra", "Compre arma. O round comeca em alguns segundos.", 2200);
        }
        if (phase === "live" && previousPhase === "buy") {
          showBuy(false);
          setMessage("Combate liberado", "Sem respawn ate o fim do round.", 1700);
        }
        if (phase === "warmup" && previousPhase !== "warmup") {
          showBuy(false);
          setMessage("Aquecimento online", "Espere jogadores entrarem ou chame seu amigo pelo codigo.", 2600);
        }
      }

      const self = net.players.find(p => p.id === net.id);
      if (self) {
        const wasAlive = player.alive;
        player.hp = self.hp;
        player.alive = self.alive;
        player.money = self.money ?? player.money;
        player.owned = new Set(self.owned || ["pistol"]);
        if (self.weaponId && self.weaponId !== player.weaponId) equip(self.weaponId);
        if (!self.alive) {
          mouse.down = false;
          touchInput.firing = false;
          if (wasAlive && phase === "live") setMessage("Voce morreu", "Aguarde o round acabar.", 1800);
        }
        if (self.spawnId !== net.spawnId) {
          net.spawnId = self.spawnId;
          player.position.set(self.x, self.y || PLAYER_HEIGHT, self.z);
          player.yaw = self.yaw;
          player.pitch = self.pitch || 0;
          player.alive = self.alive;
          player.hp = self.hp;
          player.velocityY = 0;
          player.grounded = true;
          player.groundY = Math.max(0, player.position.y - PLAYER_HEIGHT);
          equip(self.weaponId || player.weaponId);
        }
      }

      syncRemotePlayers();
      updateOnlinePanel();
      return;
    }

    if (data.type === "shot") {
      if (data.shooterId === net.id && data.hitId) {
        pulseCrosshair(true);
        playHitSound();
      }
      if (data.shooterId !== net.id) {
        const color = data.team === "CT" ? 0x73b9ff : 0xf2b85b;
        createTracer(
          new THREE.Vector3(data.start.x, data.start.y, data.start.z),
          new THREE.Vector3(data.end.x, data.end.y, data.end.z),
          color
        );
      }
      if (data.hitId === net.id) {
        addImpact(player.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xd93636);
      }
      return;
    }

    if (data.type === "round") {
      setMessage(data.title || "Rodada", data.sub || "", 2600);
      return;
    }

    if (data.type === "chat") {
      addChatMsg(data.name, data.text, data.team);
      return;
    }

    if (data.type === "pong") {
      if (net.pingSentAt) {
        net.pingMs = Math.round(performance.now() - net.pingSentAt);
        const pingEl = el("onlinePing");
        if (pingEl) pingEl.textContent = net.pingMs + "ms";
      }
      return;
    }

    if (data.type === "error") {
      setMessage(net.joined ? "Aviso online" : "Nao entrou no online", data.message || "Tente de novo em alguns segundos.", 4200);
      if (net.joined) return;
      phase = "menu";
      el("startScreen").classList.remove("hidden");
      el("buyButton").hidden = false;
      disconnectOnline();
      net.mode = "offline";
    }
  }

  let lastPingTime = 0;
  function maybePing(now) {
    if (net.mode !== "online" || !net.joined || now - lastPingTime < 5000) return;
    lastPingTime = now;
    net.pingSentAt = performance.now();
    sendOnline({ type: "ping", t: net.pingSentAt });
  }

  function syncRemotePlayers() {
    const seen = new Set();
    for (const info of net.players) {
      if (info.id === net.id) continue;
      seen.add(info.id);
      let remote = remotePlayers.get(info.id);
      if (!remote) {
        const mesh = createBotMesh(info.team === "CT" ? mats.ct : mats.tr);
        scene.add(mesh);
        remote = { mesh };
        remotePlayers.set(info.id, remote);
      }
      remote.mesh.position.set(info.x, Math.max(0, (info.y || PLAYER_HEIGHT) - PLAYER_HEIGHT), info.z);
      remote.mesh.rotation.y = info.yaw || 0;
      remote.mesh.visible = info.alive;
    }

    for (const [id, remote] of remotePlayers) {
      if (!seen.has(id)) {
        scene.remove(remote.mesh);
        remotePlayers.delete(id);
      }
    }
  }

  function updateOnlinePanel() {
    if (net.mode !== "online") {
      el("onlinePanel").hidden = true;
      return;
    }
    el("onlinePanel").hidden = false;
    const code = net.room?.code || "----";
    const privacy = net.room?.public === false ? "Privada" : "Publica";
    const stateLabel = onlineStateLabel(net.matchState);
    el("onlineTitle").textContent = "Sala " + code + " · " + privacy;
    el("onlineTeam").textContent = stateLabel + " · " + (net.team ? "Time " + net.team : "Conectando");

    const dots = [];
    for (let i = 0; i < 4; i++) dots.push("<span class=\"slot-dot " + (i < (net.slots.CT || 0) ? "ct" : "") + "\"></span>");
    for (let i = 0; i < 4; i++) dots.push("<span class=\"slot-dot " + (i < (net.slots.TR || 0) ? "tr" : "") + "\"></span>");
    el("onlineSlots").innerHTML = dots.join("");

    const playerList = el("onlinePlayers");
    if (playerList && net.players.length) {
      const ct = net.players.filter(p => p.team === "CT");
      const tr = net.players.filter(p => p.team === "TR");
      const row = team => team.map(p => {
        const isMe = p.id === net.id;
        const hp = Math.ceil(p.hp ?? 100);
        const cls = "op-row" + (p.team === "CT" ? " op-ct" : " op-tr") + (isMe ? " op-me" : "") + (!p.alive ? " op-dead" : "");
        return "<div class=\"" + cls + "\"><span class=\"op-name\">" + (isMe ? "▶ " : "") + escapeHtml(p.name) + "</span><span class=\"op-hp\">" + hp + "</span></div>";
      }).join("");
      playerList.innerHTML = "<div class=\"op-team\"><span class=\"op-label ct-label\">CT</span>" + row(ct) + "</div><div class=\"op-team\"><span class=\"op-label tr-label\">TR</span>" + row(tr) + "</div>";
    } else if (playerList) {
      playerList.innerHTML = "";
    }
  }

  function activateSessionStart() {
    if (net.mode !== "online" || !net.joined) return;

    if (phase === "buy") {
      showBuy(false);
      setMessage("Pronto", "Aguarde o combate comecar.", 1200);
      lockPointer();
      return;
    }

    if (phase === "live" || phase === "warmup") {
      showBuy(false);
      lockPointer();
      if (phase === "warmup") {
        setMessage("Sala " + (net.room?.code || "----"), "Compartilhe o codigo para alguem entrar no outro time.", 1700);
      }
      return;
    }

    if (phase === "round_end") {
      setMessage("Fim do round", "A proxima rodada comeca em instantes.", 1200);
    }
  }

  function updateSessionBanner() {
    const banner = el("sessionBanner");
    if (net.mode !== "online" || !net.joined) {
      banner.hidden = true;
      return;
    }

    banner.hidden = false;
    const code = net.room?.code || "----";
    const start = el("sessionStart");
    el("sessionCode").textContent = "Codigo " + code;
    start.hidden = false;

    if (phase === "connecting") {
      start.textContent = "Conectando...";
      start.disabled = true;
    } else if (phase === "live" || phase === "round_end") {
      start.hidden = true;
      start.disabled = false;
    } else {
      start.textContent = "Enter / tocar para comecar";
      start.disabled = false;
    }
  }

  function startBuyPhase() {
    phase = "buy";
    buyCountdown = 10;
    if (gameMode === "bomb" && net.mode === "offline") resetBombObjective();
    resetPlayer();
    spawnBots();
    showBuy(true);
    setMessage("Rodada " + round, gameMode === "bomb" ? "Compre e prepare a entrada no site A." : "10 segundos para comprar.", 1600);
  }

  function startRound() {
    if (net.mode === "online") {
      showBuy(false);
      setMessage("Aguardando round", "A compra fecha automaticamente.", 1200);
      return;
    }
    phase = "live";
    buyCountdown = 0;
    showBuy(false);
    lockPointer();
    if (gameMode === "bomb") {
      bomb.state = "carrying";
      bomb.roundTimer = BOMB_ROUND_SECONDS;
      bomb.plantProgress = 0;
      bomb.defuseProgress = 0;
      setMessage("Modo bomba", "Vá ao site A e segure E para plantar.", 1600);
    } else {
      setMessage("Rodada " + round, "Use cobertura e limpe o mapa.", 1300);
    }
  }

  function endRound(ctWon, reason = "") {
    if (phase === "round_end") return;
    phase = "round_end";
    roundEndTimer = 1.9;
    const playerWon = gameMode === "bomb" && net.mode === "offline" ? !ctWon : ctWon;
    if (playerWon) player.money += 2400 + player.kills * 150;
    else player.money += 1200;
    if (ctWon) {
      ctScore++;
      setMessage("CT venceu", reason || "+ dinheiro de rodada", 1800);
    } else {
      trScore++;
      setMessage("TR venceu", reason || "Reagrupe e compre melhor.", 1800);
    }
  }

  function showBuy(open) {
    if (net.mode === "online" && open && phase !== "buy") {
      setMessage("Loja fechada", "So da para comprar no inicio do round.", 1500);
      return;
    }
    if (open && document.pointerLockElement === renderer.domElement) {
      document.exitPointerLock?.();
    }
    if (open) mouse.down = false;
    renderBuy();
    el("buyMenu").hidden = !open;
  }

  function renderBuy() {
    const seconds = Math.max(0, Math.ceil(buyCountdown));
    el("buyMoney").textContent = "$" + player.money;
    el("closeBuy").textContent = net.mode === "online" ? "Fechar loja" : "Jogar agora";
    el("playRound").textContent = net.mode === "online" ? "Fechar loja" : "Entrar na rodada" + (phase === "buy" && seconds > 0 ? " (" + seconds + "s)" : "");
    el("weaponCards").innerHTML = WEAPON_ORDER.map(id => {
      const w = WEAPONS[id];
      const owned = player.owned.has(id);
      const disabled = !owned && player.money < w.price;
      return "<button class=\"weapon-card " + (owned ? "owned " : "") + (disabled ? "disabled" : "") + "\" data-weapon=\"" + id + "\">" +
        "<strong>" + w.name + "</strong>" +
        "<span class=\"price\">" + (owned ? "Comprada" : "$" + w.price) + "</span>" +
        "<span class=\"stats\">Dano " + w.damage + " · pente " + w.mag + "<br>Cadencia " + Math.round(1000 / w.fireMs * 60) + " rpm</span>" +
        "</button>";
    }).join("");
    el("itemCards").innerHTML = ITEM_ORDER.map(id => {
      const item = ITEMS[id];
      const count = id === "hpkit" ? player.hpKits : player.armorKits;
      const disabled = player.money < item.price;
      return "<button class=\"item-card " + (disabled ? "disabled" : "") + "\" data-item=\"" + id + "\">" +
        "<strong>" + item.name + "</strong>" +
        "<span class=\"price\">$" + item.price + "</span>" +
        "<span class=\"stats\">" + item.desc + "</span>" +
        (count > 0 ? "<span class=\"kit-count\">×" + count + "</span>" : "") +
        "</button>";
    }).join("");
  }

  function buyWeapon(id) {
    if (phase !== "buy") return;
    const w = WEAPONS[id];
    if (!w) return;
    if (net.mode === "online") {
      if (!player.owned.has(id) && player.money < w.price) {
        setMessage("Dinheiro insuficiente", "Ganhe rounds ou eliminações para comprar.", 1300);
        return;
      }
      sendOnline({ type: "buy", weaponId: id });
      if (player.owned.has(id)) equip(id);
      return;
    }
    if (!player.owned.has(id)) {
      if (player.money < w.price) return;
      player.money -= w.price;
      player.owned.add(id);
    }
    equip(id);
    renderBuy();
    updateHud();
  }

  function buyItem(id) {
    if (phase !== "buy") return;
    const item = ITEMS[id];
    if (!item || player.money < item.price) return;
    player.money -= item.price;
    if (id === "hpkit") player.hpKits++;
    else if (id === "armorkit") player.armorKits++;
    else if (id === "ammo") { player.ammo = weapon().mag; }
    renderBuy();
    updateHud();
  }

  function switchWeapon(id) {
    if (!player.owned.has(id) || id === player.weaponId) return;
    player.weaponId = id;
    player.reloading = false;
    player.fireCooldown = 0;
    updateViewModel();
    updateHud();
  }

  function buyMenuOpen() {
    const menu = el("buyMenu");
    return menu && !menu.hidden;
  }

  function canControlPlayer() {
    if (!player.alive) return false;
    if (phase === "live" || phase === "warmup") return true;
    return net.mode === "online" && phase === "buy" && !buyMenuOpen();
  }

  function aimByDelta(dx, dy, internalMult = 1) {
    player.yaw -= dx * 0.0022 * sensMult * internalMult;
    player.pitch = clamp(player.pitch - dy * 0.002 * sensMult * internalMult, -1.18, 1.08);
  }

  function setSensitivity(v) {
    sensMult = clamp(parseFloat(v) || 1, 0.2, 5);
    localStorage.setItem("taticoSens", sensMult);
    const slider = el("sensSlider");
    const label = el("sensValue");
    if (slider) slider.value = sensMult;
    if (label) label.textContent = sensMult.toFixed(1) + "×";
  }

  function openChat() {
    if (chatOpen) return;
    chatOpen = true;
    el("chatForm").hidden = false;
    el("chatInput").focus();
    intentionalExit = true;
    if (document.pointerLockElement) document.exitPointerLock?.();
  }

  function closeChat() {
    if (!chatOpen) return;
    chatOpen = false;
    el("chatForm").hidden = true;
    el("chatInput").value = "";
    intentionalExit = false;
    lockPointer();
  }

  function addChatMsg(name, text, team) {
    const panel = el("chatMessages");
    if (!panel) return;
    const div = document.createElement("div");
    div.className = "chat-msg";
    const nameEl = document.createElement("b");
    nameEl.className = team === "CT" ? "ct-name" : team === "TR" ? "tr-name" : "";
    nameEl.textContent = name + ": ";
    div.appendChild(nameEl);
    div.appendChild(document.createTextNode(text));
    panel.appendChild(div);
    while (panel.children.length > 8) panel.removeChild(panel.firstChild);
    setTimeout(() => { div.style.opacity = "0"; setTimeout(() => div.remove(), 3000); }, 7000);
  }

  function sendChat(text) {
    const t = text.trim().slice(0, 80);
    if (!t) return;
    const team = net.mode === "online" ? net.team : "CT";
    addChatMsg(getPlayerName(), t, team);
    if (net.mode === "online") sendOnline({ type: "chat", text: t });
  }

  function enableMouseLook(x = mouse.lastX, y = mouse.lastY) {
    mouse.freeLook = true;
    mouse.lastX = x;
    mouse.lastY = y;
    renderer.domElement.focus?.();
  }

  function lockPointer() {
    if (document.pointerLockElement !== renderer.domElement) {
      const request = renderer.domElement.requestPointerLock?.();
      if (request?.catch) {
        request.catch(() => {
          enableMouseLook();
        });
      } else if (!renderer.domElement.requestPointerLock) {
        enableMouseLook();
      }
    }
  }

  function forwardDir() {
    return new THREE.Vector3(-Math.sin(player.yaw), 0, -Math.cos(player.yaw)).normalize();
  }

  function rightDir() {
    return new THREE.Vector3(Math.cos(player.yaw), 0, -Math.sin(player.yaw)).normalize();
  }

  function cameraDir() {
    const dir = new THREE.Vector3(
      -Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch)
    );
    return dir.normalize();
  }

  function footY(pos = player.position) {
    return pos.y - PLAYER_HEIGHT;
  }

  function insideWallXZ(pos, wall, radius = 0) {
    return Math.abs(pos.x - wall.x) < wall.halfX + radius && Math.abs(pos.z - wall.z) < wall.halfZ + radius;
  }

  function groundHeightAt(pos, radius = PLAYER_RADIUS) {
    let ground = 0;
    for (const wall of walls) {
      if (!wall.climbable) continue;
      if (insideWallXZ(pos, wall, Math.max(0.02, radius * 0.35))) {
        ground = Math.max(ground, wall.h);
      }
    }
    return ground;
  }

  function collides(pos, radius) {
    const currentFoot = footY(pos);
    for (const wall of walls) {
      if (insideWallXZ(pos, wall, radius)) {
        if (wall.climbable && currentFoot >= wall.h - CLIMB_EPSILON) continue;
        return true;
      }
    }
    return Math.abs(pos.x) > WORLD_W / 2 - radius || Math.abs(pos.z) > WORLD_D / 2 - radius;
  }

  function moveCircle(entity, dx, dz, radius) {
    const nextX = entity.position.clone();
    nextX.x += dx;
    if (!collides(nextX, radius)) entity.position.x = nextX.x;
    const nextZ = entity.position.clone();
    nextZ.z += dz;
    if (!collides(nextZ, radius)) entity.position.z = nextZ.z;
  }

  function rayAabb(origin, dir, wall) {
    const minX = wall.x - wall.halfX;
    const maxX = wall.x + wall.halfX;
    const minY = 0;
    const maxY = wall.h;
    const minZ = wall.z - wall.halfZ;
    const maxZ = wall.z + wall.halfZ;
    let tMin = -Infinity;
    let tMax = Infinity;

    for (const axis of ["x", "y", "z"]) {
      const min = axis === "x" ? minX : axis === "y" ? minY : minZ;
      const max = axis === "x" ? maxX : axis === "y" ? maxY : maxZ;
      const o = origin[axis];
      const d = dir[axis];
      if (Math.abs(d) < 0.00001) {
        if (o < min || o > max) return null;
      } else {
        let t1 = (min - o) / d;
        let t2 = (max - o) / d;
        if (t1 > t2) [t1, t2] = [t2, t1];
        tMin = Math.max(tMin, t1);
        tMax = Math.min(tMax, t2);
        if (tMin > tMax) return null;
      }
    }
    return tMax >= 0 ? Math.max(0, tMin) : null;
  }

  function raySphere(origin, dir, center, radius) {
    const oc = origin.clone().sub(center);
    const b = 2 * oc.dot(dir);
    const c = oc.dot(oc) - radius * radius;
    const disc = b * b - 4 * c;
    if (disc < 0) return null;
    const t = (-b - Math.sqrt(disc)) / 2;
    return t > 0 ? t : null;
  }

  function firstWallDistance(origin, dir, maxRange) {
    let best = maxRange;
    for (const wall of walls) {
      const t = rayAabb(origin, dir, wall);
      if (t !== null && t < best) best = t;
    }
    return best;
  }

  function hasLineOfSight(from, to) {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    dir.normalize();
    return firstWallDistance(from, dir, dist) >= dist - 0.2;
  }

  function withSpread(dir, spread) {
    if (spread <= 0) return dir.clone();
    const yaw = (Math.random() - 0.5) * spread;
    const pitch = (Math.random() - 0.5) * spread;
    const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
    return dir.clone().applyEuler(euler).normalize();
  }

  function shoot() {
    if (!player.alive) return;
    if (phase !== "live" && !(net.mode === "online" && phase === "warmup")) return;
    if (net.mode === "online") {
      shootOnline();
      return;
    }
    const w = weapon();
    const now = performance.now();
    if (player.reloading || now < player.fireCooldown) return;
    if (player.ammo <= 0) {
      reload();
      return;
    }

    player.fireCooldown = now + w.fireMs;
    player.ammo--;
    triggerMuzzleFlash();
    pulseCrosshair();

    const origin = player.position.clone();
    origin.y = player.position.y - 0.05;
    const baseDir = cameraDir();
    let hitSomething = false;
    for (let i = 0; i < w.pellets; i++) {
      const dir = withSpread(baseDir, w.spread);
      const wallDist = firstWallDistance(origin, dir, w.range);
      let hitDist = wallDist;
      let hitBot = null;
      for (const bot of bots) {
        if (!bot.alive) continue;
        const center = bot.position.clone();
        center.y = 1.15;
        const d = raySphere(origin, dir, center, BOT_RADIUS);
        if (d !== null && d < hitDist) {
          hitDist = d;
          hitBot = bot;
        }
      }
      if (hitBot) {
        hitSomething = true;
        damageBot(hitBot, w.damage);
      }
      createTracer(origin, origin.clone().addScaledVector(dir, hitDist), hitBot ? 0x9cff6d : 0xffdf72);
    }
    if (hitSomething) {
      pulseCrosshair(true);
      playHitSound();
    }
    if (player.ammo <= 0) reload();
    updateHud();
  }

  function shootOnline() {
    const w = weapon();
    const now = performance.now();
    if (!net.joined || player.reloading || now < player.fireCooldown) return;
    if (player.ammo <= 0) {
      reload();
      return;
    }

    player.fireCooldown = now + w.fireMs;
    player.ammo--;
    triggerMuzzleFlash();
    pulseCrosshair();

    const origin = player.position.clone();
    origin.y = player.position.y - 0.05;
    const dir = cameraDir();
    const endDist = firstWallDistance(origin, dir, w.range);
    createTracer(origin, origin.clone().addScaledVector(dir, endDist), net.team === "CT" ? 0x73b9ff : 0xf2b85b);

    sendOnline({
      type: "fire",
      weaponId: player.weaponId,
      yaw: player.yaw,
      pitch: player.pitch
    });

    if (player.ammo <= 0) reload();
    updateHud();
  }

  function createTracer(start, end, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    scene.add(line);
    tracers.push({ line, life: 0.09, maxLife: 0.09 });
    addImpact(end, color, true);
  }

  function addImpact(pos, color, sparks = false) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(sparks ? 0.055 : 0.08, 8, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 }));
    mesh.position.copy(pos);
    scene.add(mesh);
    particles.push({ mesh, life: sparks ? 0.22 : 0.35, maxLife: sparks ? 0.22 : 0.35, velocity: new THREE.Vector3(rand(-1, 1), rand(0.2, 1.5), rand(-1, 1)) });

    if (sparks) {
      const markMat = mats.impactMark.clone();
      const mark = new THREE.Mesh(new THREE.CircleGeometry(rand(0.09, 0.17), 14), markMat);
      mark.position.copy(pos);
      mark.position.addScaledVector(cameraDir(), -0.012);
      mark.lookAt(camera.position);
      scene.add(mark);
      impactMarks.push({ mesh: mark, life: 7, maxLife: 7 });

      for (let i = 0; i < 4; i++) {
        const spark = new THREE.Mesh(new THREE.SphereGeometry(rand(0.018, 0.035), 6, 4), mats.spark.clone());
        spark.position.copy(pos);
        scene.add(spark);
        particles.push({
          mesh: spark,
          life: rand(0.18, 0.34),
          maxLife: 0.34,
          velocity: new THREE.Vector3(rand(-2.4, 2.4), rand(0.6, 2.8), rand(-2.4, 2.4))
        });
      }

      while (impactMarks.length > 80) {
        const old = impactMarks.shift();
        scene.remove(old.mesh);
        old.mesh.geometry.dispose();
        old.mesh.material.dispose();
      }
    }
  }

  function damageBot(bot, amount) {
    bot.hp -= amount;
    addImpact(bot.position.clone().add(new THREE.Vector3(0, 1.2, 0)), 0xd93636);
    if (bot.hp <= 0 && bot.alive) {
      bot.alive = false;
      bot.mesh.visible = false;
      player.money += 300;
      player.kills++;
    }
  }

  function damagePlayer(amount) {
    if (!player.alive) return;
    if (player.armor > 0) {
      const absorbed = Math.min(player.armor, Math.round(amount * 0.5));
      player.armor = Math.max(0, player.armor - absorbed);
      amount = Math.max(0, amount - absorbed);
    }
    player.hp = Math.max(0, player.hp - amount);
    if (player.hp <= 0) {
      player.alive = false;
      if (gameMode === "bomb" && net.mode === "offline") endRound(true, "O atacante caiu antes de cumprir o objetivo.");
      else endRound(false);
    }
    updateHud();
  }

  function useHpKit() {
    if (!player.alive || player.hpKits <= 0 || player.hp >= 100) return;
    player.hp = Math.min(100, player.hp + 50);
    player.hpKits--;
    setMessage("Kit de Vida", "+" + Math.min(50, 100 - (player.hp - 50)) + " HP", 800);
    updateHud();
  }

  function useArmorKit() {
    if (!player.alive || player.armorKits <= 0 || player.armor >= 100) return;
    player.armor = Math.min(100, player.armor + 100);
    player.armorKits--;
    setMessage("Kit de Escudo", "+100 Escudo", 800);
    updateHud();
  }

  function reload() {
    const w = weapon();
    if (player.reloading || player.ammo >= w.mag) return;
    player.reloading = true;
    player.reloadEnd = performance.now() + w.reloadMs;
    updateHud();
  }

  function tryJump() {
    if (!canControlPlayer()) return;
    if (player.grounded) {
      player.velocityY = JUMP_SPEED;
      player.grounded = false;
      player.jumpHeld = true;
    }
  }

  function updateVerticalPhysics(dt) {
    const ground = groundHeightAt(player.position);
    const jumpActive = keys.Space || touchInput.jump;
    if (jumpActive && !player.jumpHeld) tryJump();
    if (!jumpActive) player.jumpHeld = false;

    if (!player.grounded || player.velocityY !== 0 || footY() > ground + 0.02) {
      player.velocityY = Math.max(player.velocityY - GRAVITY * dt, MAX_FALL_SPEED);
      player.position.y += player.velocityY * dt;
    }

    const nextGround = groundHeightAt(player.position);
    if (footY() <= nextGround) {
      player.position.y = PLAYER_HEIGHT + nextGround;
      player.velocityY = 0;
      player.grounded = true;
      player.groundY = nextGround;
    } else {
      player.grounded = false;
      player.groundY = nextGround;
    }
  }

  function updatePlayer(dt) {
    if (!canControlPlayer()) return;
    updateVerticalPhysics(dt);
    const f = forwardDir();
    const r = rightDir();
    let mx = 0;
    let mz = 0;
    if (keys.KeyW) { mx += f.x; mz += f.z; }
    if (keys.KeyS) { mx -= f.x; mz -= f.z; }
    if (keys.KeyD) { mx += r.x; mz += r.z; }
    if (keys.KeyA) { mx -= r.x; mz -= r.z; }
    if (Math.abs(touchInput.moveX) > 0.05 || Math.abs(touchInput.moveY) > 0.05) {
      const forward = -touchInput.moveY;
      const side = touchInput.moveX;
      mx += f.x * forward + r.x * side;
      mz += f.z * forward + r.z * side;
    }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      const speed = keys.ShiftLeft || keys.ShiftRight || touchInput.slow ? 3.0 : 6.1;
      moveCircle(player, mx * speed * dt, mz * speed * dt, PLAYER_RADIUS);
    }
    updateVerticalPhysics(dt);
    if (player.reloading && performance.now() >= player.reloadEnd) {
      player.reloading = false;
      player.ammo = weapon().mag;
      updateHud();
    }
  }

  function updateOnlineNetwork() {
    if (net.mode !== "online" || !net.joined || (phase !== "live" && phase !== "buy" && phase !== "warmup")) return;
    const now = performance.now();
    if (now - net.lastSend < ONLINE_SEND_MS) return;
    net.lastSend = now;
    sendOnline({
      type: "state",
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      yaw: player.yaw,
      pitch: player.pitch,
      weaponId: player.weaponId
    });
  }

  function updateBots(dt) {
    if (phase !== "live") return;
    const playerChest = player.position.clone();
    playerChest.y = 1.2;
    const objectiveTarget = gameMode === "bomb" && bomb.state === "planted" ? bombPosition().clone() : null;
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.think -= dt;
      const botEye = bot.position.clone();
      botEye.y = 1.35;
      const toPlayer = player.position.clone().sub(bot.position);
      const dist = toPlayer.length();
      const seen = player.alive && dist < 90 && hasLineOfSight(botEye, playerChest);
      let moveX = 0;
      let moveZ = 0;

      if (seen) {
        bot.yaw = Math.atan2(-toPlayer.x, -toPlayer.z);
        const dir = toPlayer.normalize();
        const side = new THREE.Vector3(dir.z, 0, -dir.x).multiplyScalar(bot.strafe);
        if (dist > 24) {
          moveX += dir.x;
          moveZ += dir.z;
        } else if (dist < 12) {
          moveX -= dir.x;
          moveZ -= dir.z;
        }
        moveX += side.x * 0.42;
        moveZ += side.z * 0.42;
        botShoot(bot, botEye, playerChest);
      } else {
        if (objectiveTarget) {
          bot.target = objectiveTarget.clone();
          bot.think = Math.max(bot.think, 0.25);
        } else if (bot.think <= 0) {
          bot.think = rand(0.8, 1.7);
          if (gameMode === "bomb") {
            bot.target = new THREE.Vector3(BOMB_SITE.x + rand(-10, 10), 0, BOMB_SITE.z + rand(-8, 8));
          } else {
            bot.target = new THREE.Vector3(rand(-55, 55), 0, rand(-55, 55));
          }
        }
        const target = bot.target || new THREE.Vector3(0, 0, 0);
        const d = target.clone().sub(bot.position);
        if (objectiveTarget && d.length() <= 2.4) {
          bot.yaw = Math.atan2(-d.x, -d.z);
        } else if (d.length() > 2) {
          d.normalize();
          moveX += d.x;
          moveZ += d.z;
          bot.yaw = Math.atan2(-d.x, -d.z);
        }
      }

      const mag = Math.hypot(moveX, moveZ);
      if (mag > 0) {
        moveX /= mag;
        moveZ /= mag;
        moveCircle(bot, moveX * 3.15 * dt, moveZ * 3.15 * dt, BOT_RADIUS);
      }
      bot.mesh.position.copy(bot.position);
      bot.mesh.rotation.y = bot.yaw;
    }
  }

  function botShoot(bot, origin, target) {
    const w = WEAPONS[bot.weaponId];
    const now = performance.now();
    if (now < bot.fireCooldown) return;
    bot.fireCooldown = now + w.fireMs * rand(1.25, 2.2);
    const dir = withSpread(target.clone().sub(origin).normalize(), 0.085 + round * 0.003);
    const wallDist = firstWallDistance(origin, dir, w.range);
    const playerCenter = player.position.clone();
    playerCenter.y = 1.15;
    const playerDist = raySphere(origin, dir, playerCenter, PLAYER_RADIUS);
    const endDist = playerDist !== null && playerDist < wallDist ? playerDist : wallDist;
    if (playerDist !== null && playerDist < wallDist) damagePlayer(w.damage * rand(0.7, 1));
    createTracer(origin, origin.clone().addScaledVector(dir, endDist), 0xff935c);
  }

  function updateTracers(dt) {
    for (const t of tracers) {
      t.life -= dt;
      t.line.material.opacity = clamp(t.life / (t.maxLife || 0.07), 0, 1);
      if (t.life <= 0) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
      }
    }
    for (let i = tracers.length - 1; i >= 0; i--) {
      if (tracers[i].life <= 0) tracers.splice(i, 1);
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.velocity.y -= 5 * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);
      p.mesh.material.opacity = clamp(p.life / (p.maxLife || 0.35), 0, 1);
      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }

    for (const mark of impactMarks) {
      mark.life -= dt;
      mark.mesh.material.opacity = 0.55 * clamp(mark.life / mark.maxLife, 0, 1);
      if (mark.life <= 0) {
        scene.remove(mark.mesh);
        mark.mesh.geometry.dispose();
        mark.mesh.material.dispose();
      }
    }
    for (let i = impactMarks.length - 1; i >= 0; i--) {
      if (impactMarks[i].life <= 0) impactMarks.splice(i, 1);
    }
  }

  function updateCamera() {
    camera.position.copy(player.position);
    camera.rotation.order = "YXZ";
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
    const bob = moving && canControlPlayer() ? Math.sin(performance.now() * 0.01) : 0;
    viewModel.rotation.z = viewModel.userData.baseRotation.z + bob * 0.012;
    viewModel.rotation.x += Math.abs(bob) * 0.012;
  }

  function updateBombMode(dt) {
    const aliveBots = bots.filter(bot => bot.alive);

    if (bomb.state === "carrying") {
      bomb.roundTimer = Math.max(0, bomb.roundTimer - dt);
      if (!aliveBots.length) {
        endRound(false, "Defesa eliminada.");
        return;
      }
      if (bomb.roundTimer <= 0) {
        endRound(true, "O tempo acabou.");
        return;
      }

      const planting = player.alive && playerInBombSite() && (keys.KeyE || touchInput.plant);
      if (planting) {
        bomb.plantProgress = Math.min(BOMB_PLANT_SECONDS, bomb.plantProgress + dt);
        if (bomb.plantProgress >= BOMB_PLANT_SECONDS) {
          const plantedPos = new THREE.Vector3(
            clamp(player.position.x, BOMB_SITE.x - BOMB_SITE.halfX + 1, BOMB_SITE.x + BOMB_SITE.halfX - 1),
            0,
            clamp(player.position.z, BOMB_SITE.z - BOMB_SITE.halfZ + 1, BOMB_SITE.z + BOMB_SITE.halfZ - 1)
          );
          bomb.state = "planted";
          bomb.explodeTimer = BOMB_EXPLODE_SECONDS;
          bomb.defuseProgress = 0;
          bomb.plantProgress = 0;
          setBombVisible(true, plantedPos);
          setMessage("Bomba plantada", "Defenda o site A ate explodir.", 1800);
        }
      } else {
        bomb.plantProgress = Math.max(0, bomb.plantProgress - dt * 1.8);
      }
      return;
    }

    if (bomb.state !== "planted") return;

    bomb.explodeTimer = Math.max(0, bomb.explodeTimer - dt);
    if (bomb.explodeTimer <= 0) {
      endRound(false, "Bomba explodiu.");
      return;
    }
    if (!aliveBots.length) {
      endRound(false, "Defensores eliminados.");
      return;
    }

    const bombPos = bombPosition();
    let defuser = null;
    let bestDist = Infinity;
    for (const bot of aliveBots) {
      const dist = bot.position.distanceTo(bombPos);
      if (dist < 3.2 && dist < bestDist) {
        defuser = bot;
        bestDist = dist;
      }
    }

    if (defuser) {
      const toBomb = bombPos.clone().sub(defuser.position);
      defuser.yaw = Math.atan2(-toBomb.x, -toBomb.z);
      bomb.defuseProgress = Math.min(BOMB_DEFUSE_SECONDS, bomb.defuseProgress + dt);
      if (bomb.defuseProgress >= BOMB_DEFUSE_SECONDS) {
        endRound(true, "Bomba desarmada.");
      }
    } else {
      bomb.defuseProgress = Math.max(0, bomb.defuseProgress - dt * 1.25);
    }
  }

  function updateRound(dt) {
    if (phase === "live") {
      if (gameMode === "bomb" && net.mode === "offline") updateBombMode(dt);
      else if (player.alive && bots.every(bot => !bot.alive)) endRound(true);
    }
    if (phase === "round_end") {
      roundEndTimer -= dt;
      if (roundEndTimer <= 0) {
        round++;
        startBuyPhase();
      }
    }
  }

  function updateBuyCountdown(dt) {
    if (net.mode !== "offline" || phase !== "buy" || buyCountdown <= 0) return;
    const before = Math.ceil(buyCountdown);
    buyCountdown = Math.max(0, buyCountdown - dt);
    const after = Math.ceil(buyCountdown);
    if (before !== after) renderBuy();
    if (buyCountdown <= 0) startRound();
  }

  function objectiveText() {
    if (net.mode === "online") return phase === "warmup" ? "Aquecimento" : phase === "buy" ? "Comprar" : "4x4";
    if (gameMode !== "bomb") return phase === "buy" ? "Comprar" : "Eliminar";
    if (phase === "buy") return "Comprar";
    if (phase === "round_end") return "Reset";
    if (bomb.state === "planted") {
      if (bomb.defuseProgress > 0) return "Defuse " + Math.ceil(BOMB_DEFUSE_SECONDS - bomb.defuseProgress) + "s";
      return "Bomba " + Math.ceil(bomb.explodeTimer) + "s";
    }
    if (bomb.plantProgress > 0) return "Plantando " + Math.ceil(BOMB_PLANT_SECONDS - bomb.plantProgress) + "s";
    return playerInBombSite() ? "Segure E" : "Site A";
  }

  function updateHud() {
    const hpVal = Math.ceil(player.hp);
    const armorVal = Math.ceil(player.armor);
    el("hp").textContent = hpVal;
    el("hpBar").style.width = player.hp + "%";
    el("armor").textContent = armorVal;
    el("armorBar").style.width = player.armor + "%";
    el("hpKits").textContent = player.hpKits;
    el("armorKits").textContent = player.armorKits;
    el("weapon").textContent = weapon().name;
    el("ammo").textContent = player.reloading ? "recarregando" : player.ammo + "/" + weapon().mag;
    el("money").textContent = "$" + player.money;
    const objective = el("objective");
    if (objective) objective.textContent = objectiveText();
    el("ctScore").textContent = "CT " + ctScore;
    el("trScore").textContent = trScore + " TR";
    el("roundLabel").textContent = net.mode === "online" ? "4x4" :
      phase === "buy" && buyCountdown > 0 ? Math.ceil(buyCountdown) + "s" :
      gameMode === "bomb" && phase === "live" && bomb.state === "planted" ? Math.ceil(bomb.explodeTimer) + "s" :
      gameMode === "bomb" && phase === "live" ? Math.ceil(bomb.roundTimer) + "s" :
      "R" + round;
    updateSessionBanner();
  }

  function drawMiniMap() {
    const c = el("miniMap");
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    const pad = 10;
    const teamColor = net.mode === "online" ? (net.team === "TR" ? "#f2b85b" : "#73b9ff") :
      gameMode === "bomb" ? "#f2b85b" : "#73b9ff";
    const scale = Math.min((w - pad * 2) / WORLD_W, (h - pad * 2) / WORLD_D);
    const worldLeft = -WORLD_W * scale / 2;
    const worldTop = -WORLD_D * scale / 2;
    const wallColor = wall => {
      const label = wall.label || "";
      if (label.includes("muro")) return "rgba(107, 115, 101, 0.95)";
      if (label.includes("caixa")) return "rgba(160, 113, 54, 0.92)";
      if (label.includes("container")) return "rgba(83, 133, 164, 0.95)";
      if (label.includes("barril")) return "rgba(76, 133, 103, 0.95)";
      if (label.includes("veiculo")) return "rgba(172, 91, 72, 0.95)";
      if (label.includes("casa") || label.includes("oficina") || label.includes("mercado")) return "rgba(166, 156, 129, 0.94)";
      return "rgba(196, 194, 174, 0.86)";
    };
    const mapX = x => x * scale;
    const mapZ = z => z * scale;
    const fillRectWorld = (x, z, width, depth, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(mapX(x - width / 2), mapZ(z - depth / 2), width * scale, depth * scale);
    };
    const drawPlayerBlip = (x, z, yaw, color, size = 5) => {
      ctx.save();
      ctx.translate(mapX(x), mapZ(z));
      ctx.rotate(-yaw);
      ctx.fillStyle = color;
      ctx.strokeStyle = "rgba(6, 8, 6, 0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, -size - 2);
      ctx.lineTo(size, size);
      ctx.lineTo(0, size * 0.48);
      ctx.lineTo(-size, size);
      ctx.closePath();
      ctx.stroke();
      ctx.fill();
      ctx.restore();
    };

    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);

    ctx.fillStyle = "rgba(9, 12, 9, 0.96)";
    ctx.fillRect(worldLeft - 5, worldTop - 5, WORLD_W * scale + 10, WORLD_D * scale + 10);
    fillRectWorld(0, 0, WORLD_W, WORLD_D, "rgba(54, 68, 45, 0.72)");
    fillRectWorld(0, 0, WORLD_W * 0.72, 18, "rgba(36, 40, 35, 0.82)");

    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1;
    for (let x = -60; x <= 60; x += 20) {
      ctx.beginPath();
      ctx.moveTo(mapX(x), worldTop);
      ctx.lineTo(mapX(x), worldTop + WORLD_D * scale);
      ctx.stroke();
    }
    for (let z = -40; z <= 40; z += 20) {
      ctx.beginPath();
      ctx.moveTo(worldLeft, mapZ(z));
      ctx.lineTo(worldLeft + WORLD_W * scale, mapZ(z));
      ctx.stroke();
    }

    fillRectWorld(42, 42, 18, 14, "rgba(255, 207, 76, 0.48)");
    fillRectWorld(0, 51, 40, 8, "rgba(116, 199, 255, 0.15)");
    fillRectWorld(0, -51, 40, 8, "rgba(242, 184, 91, 0.15)");

    if (gameMode === "bomb" && bomb.state === "planted" && bomb.mesh) {
      const pulse = 3.8 + Math.sin(performance.now() * 0.014) * 1.2;
      ctx.fillStyle = "rgba(255, 109, 93, 0.95)";
      ctx.beginPath();
      ctx.arc(mapX(bomb.mesh.position.x), mapZ(bomb.mesh.position.z), pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 215, 109, 0.82)";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (const wall of walls) {
      ctx.fillStyle = wallColor(wall);
      if ((wall.label || "").includes("barril")) {
        ctx.beginPath();
        ctx.arc(mapX(wall.x), mapZ(wall.z), Math.max(2.1, wall.halfX * scale), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(mapX(wall.x - wall.halfX), mapZ(wall.z - wall.halfZ), wall.halfX * 2 * scale, wall.halfZ * 2 * scale);
      }
    }

    ctx.strokeStyle = "rgba(245,242,232,0.26)";
    ctx.lineWidth = 2;
    ctx.strokeRect(worldLeft, worldTop, WORLD_W * scale, WORLD_D * scale);

    if (net.mode === "online") {
      for (const other of net.players) {
        if (!other.alive || other.id === net.id || other.team !== net.team) continue;
        drawPlayerBlip(other.x, other.z, other.yaw || 0, teamColor, 4);
      }
    }

    drawPlayerBlip(player.position.x, player.position.z, player.yaw, teamColor, 5);

    ctx.strokeStyle = teamColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mapX(player.position.x), mapZ(player.position.z));
    ctx.lineTo(mapX(player.position.x - Math.sin(player.yaw) * 10), mapZ(player.position.z - Math.cos(player.yaw) * 10));
    ctx.stroke();

    ctx.fillStyle = "rgba(245,242,232,0.72)";
    ctx.font = "900 9px Inter, Arial, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("A", mapX(42), mapZ(42) + 3);
    ctx.fillStyle = teamColor;
    ctx.fillText("TIME", worldLeft + 21, worldTop + 13);
    ctx.restore();
  }

  function updateTouchControls() {
    const shouldShow = canControlPlayer() && ("ontouchstart" in window || touchInput.used || matchMedia("(pointer: coarse)").matches);
    el("touchControls").hidden = !shouldShow;
    el("touchBuy").hidden = false;
    el("touchWalk").classList.toggle("active", touchInput.slow);
    el("touchJump").classList.toggle("active", touchInput.jump);
    const bombButton = el("touchBomb");
    if (bombButton) {
      bombButton.hidden = !(gameMode === "bomb" && phase === "live" && bomb.state === "carrying");
      bombButton.classList.toggle("active", touchInput.plant || bomb.plantProgress > 0);
    }
  }

  function resetTouchStick() {
    touchInput.moveId = null;
    touchInput.moveX = 0;
    touchInput.moveY = 0;
    el("touchKnob").style.transform = "translate(-50%, -50%)";
  }

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (phase === "live" || phase === "warmup" || phase === "round_end" || (net.mode === "online" && phase === "buy")) {
      updatePlayer(dt);
      if (net.mode === "online") {
        updateOnlineNetwork();
      } else {
        updateBots(dt);
        updateRound(dt);
      }
    }
    if ((phase === "live" || (net.mode === "online" && phase === "warmup")) && (mouse.down || touchInput.firing)) shoot();
    updateTracers(dt);
    updateParticles(dt);
    updateBuyCountdown(dt);
    updateViewEffects();
    updateBombVisual();
    updateCamera();
    updateHud();
    updateTouchControls();
    drawMiniMap();
    maybePing(performance.now());
    if (performance.now() > messageUntil) el("message").innerHTML = "";
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function bindEvents() {
    window.addEventListener("resize", onResize);
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    window.addEventListener("keydown", unlockAudio, { once: true });

    document.addEventListener("pointerlockchange", () => {
      if (document.pointerLockElement === renderer.domElement) {
        el("lockPrompt").hidden = true;
        intentionalExit = false;
      } else if (!intentionalExit && canControlPlayer() && !chatOpen) {
        el("lockPrompt").hidden = false;
      }
    });

    el("lockPrompt").addEventListener("click", () => {
      el("lockPrompt").hidden = true;
      intentionalExit = false;
      lockPointer();
    });

    el("chatForm").addEventListener("submit", event => {
      event.preventDefault();
      sendChat(el("chatInput").value);
      closeChat();
    });

    el("chatInput").addEventListener("keydown", event => {
      if (event.code === "Escape") { event.preventDefault(); closeChat(); }
    });

    el("sensSlider").addEventListener("input", event => setSensitivity(event.target.value));

    window.addEventListener("keydown", event => {
      const target = event.target;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      keys[event.code] = true;
      if (event.code === "Enter" && !typing && net.mode === "online" && net.joined) {
        event.preventDefault();
        activateSessionStart();
      }
      if (event.code === "Space") {
        event.preventDefault();
        tryJump();
      }
      if (event.code === "KeyR") reload();
      if (event.code === "KeyC") toggleQuickSettings();
      if (event.code === "KeyN") setTimeMode(worldTime === "night" ? "day" : "night");
      if (event.code === "Digit1") switchWeapon("pistol");
      if (event.code === "Digit2") switchWeapon("smg");
      if (event.code === "Digit3") switchWeapon("shotgun");
      if (event.code === "Digit4") switchWeapon("rifle");
      if (event.code === "Digit5") switchWeapon("sniper");
      if (event.code === "KeyV") useHpKit();
      if (event.code === "KeyB" && phase === "live") useArmorKit();
      if (event.code === "KeyL") showBuy(true);
      if (event.code === "Enter" && !chatOpen && canControlPlayer()) {
        openChat();
        event.preventDefault();
      }
      if (event.code === "Escape") {
        if (chatOpen) { closeChat(); return; }
        intentionalExit = true;
        mouse.freeLook = false;
        mouse.down = false;
        mouse.lookHeld = false;
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
        el("lockPrompt").hidden = true;
        toggleQuickSettings(false);
        if (phase === "buy") showBuy(true);
      }
    });
    window.addEventListener("keyup", event => {
      keys[event.code] = false;
      if (event.code === "Space") player.jumpHeld = false;
    });
    window.addEventListener("mousemove", event => {
      if (!canControlPlayer()) return;
      if (document.pointerLockElement === renderer.domElement) {
        aimByDelta(event.movementX, event.movementY);
      } else if (mouse.freeLook || (mouse.lookHeld && (event.buttons & 1))) {
        const dx = event.movementX || event.clientX - mouse.lastX;
        const dy = event.movementY || event.clientY - mouse.lastY;
        if (Math.abs(dx) < 160 && Math.abs(dy) < 160) {
          aimByDelta(dx, dy, 0.9);
        }
      }
      mouse.lastX = event.clientX;
      mouse.lastY = event.clientY;
    });
    renderer.domElement.addEventListener("pointerdown", event => {
      if (!canControlPlayer()) return;
      if (event.pointerType === "touch") {
        touchInput.used = true;
        touchInput.lookId = event.pointerId;
        touchInput.lastLookX = event.clientX;
        touchInput.lastLookY = event.clientY;
        renderer.domElement.setPointerCapture?.(event.pointerId);
        event.preventDefault();
        return;
      }
      if (event.button !== 0) return;
      enableMouseLook(event.clientX, event.clientY);
      lockPointer();
      mouse.down = true;
      mouse.lookHeld = true;
      mouse.lastX = event.clientX;
      mouse.lastY = event.clientY;
      shoot();
    });
    renderer.domElement.addEventListener("pointermove", event => {
      if (!canControlPlayer() || event.pointerType !== "touch" || event.pointerId !== touchInput.lookId) return;
      const dx = event.clientX - touchInput.lastLookX;
      const dy = event.clientY - touchInput.lastLookY;
      touchInput.lastLookX = event.clientX;
      touchInput.lastLookY = event.clientY;
      aimByDelta(dx, dy, 1.15);
      event.preventDefault();
    });
    window.addEventListener("pointerup", event => {
      if (event.pointerType === "touch" && event.pointerId === touchInput.lookId) {
        touchInput.lookId = null;
      }
      if (event.pointerType !== "touch") {
        mouse.down = false;
        mouse.lookHeld = false;
      }
    });
    window.addEventListener("pointercancel", event => {
      if (event.pointerId === touchInput.lookId) touchInput.lookId = null;
      if (event.pointerId === touchInput.moveId) resetTouchStick();
      if (event.pointerType !== "touch") {
        mouse.down = false;
        mouse.lookHeld = false;
      }
    });
    window.addEventListener("blur", () => {
      mouse.down = false;
      mouse.lookHeld = false;
      mouse.freeLook = false;
      touchInput.firing = false;
      touchInput.plant = false;
      resetTouchStick();
    });
    renderer.domElement.addEventListener("contextmenu", event => event.preventDefault());
    renderer.domElement.addEventListener("click", event => {
      if (canControlPlayer() && !touchInput.used) {
        enableMouseLook(event.clientX, event.clientY);
        lockPointer();
      }
    });
    el("startButton").addEventListener("click", startGame);
    el("bombModeButton").addEventListener("click", startBombGame);
    el("onlineButton").addEventListener("click", () => startOnlineGame("quick"));
    el("createRoomButton").addEventListener("click", () => startOnlineGame("create"));
    el("joinRoomButton").addEventListener("click", () => startOnlineGame("join"));
    el("roomCode").addEventListener("input", () => {
      el("roomCode").value = cleanRoomCode();
    });
    el("manualOn").addEventListener("click", () => setManual(true));
    el("manualOff").addEventListener("click", () => setManual(false));
    document.addEventListener("click", event => {
      const option = event.target.closest("[data-crosshair]");
      if (option) setCrosshairStyle(option.dataset.crosshair);
      const timeOption = event.target.closest("[data-time]");
      if (timeOption) setTimeMode(timeOption.dataset.time);
    });
    el("settingsButton").addEventListener("click", () => toggleQuickSettings());
    el("closeSettings").addEventListener("click", () => toggleQuickSettings(false));
    el("sessionStart").addEventListener("click", activateSessionStart);
    el("copyCode")?.addEventListener("click", () => {
      const code = net.room?.code;
      if (!code) return;
      navigator.clipboard?.writeText(code).then(() => setMessage("Codigo copiado!", code + " · Mande para seu amigo.", 1800));
    });
    el("refreshRooms").addEventListener("click", refreshPublicRooms);
    el("publicRooms").addEventListener("click", event => {
      const roomButton = event.target.closest("[data-join-room]");
      if (!roomButton) return;
      el("roomCode").value = roomButton.dataset.joinRoom || "";
      startOnlineGame("join", roomButton.dataset.joinRoom || "");
    });
    el("playRound").addEventListener("click", startRound);
    el("closeBuy").addEventListener("click", () => {
      if (net.mode === "offline" && phase === "buy") startRound();
      else showBuy(false);
    });
    el("buyButton").addEventListener("click", () => {
      if (phase === "buy") showBuy(true);
      else setMessage("Compra fechada", "So da para comprar antes da rodada.", 1100);
    });
    el("weaponCards").addEventListener("click", event => {
      const card = event.target.closest("[data-weapon]");
      if (card) buyWeapon(card.dataset.weapon);
    });
    el("itemCards").addEventListener("click", event => {
      const card = event.target.closest("[data-item]");
      if (card) buyItem(card.dataset.item);
    });

    const stick = el("touchMove");
    const knob = el("touchKnob");
    const setStick = event => {
      const rect = stick.getBoundingClientRect();
      const max = rect.width * 0.34;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rawX = event.clientX - cx;
      const rawY = event.clientY - cy;
      const len = Math.hypot(rawX, rawY);
      const scale = len > max ? max / len : 1;
      const x = rawX * scale;
      const y = rawY * scale;
      touchInput.moveX = clamp(x / max, -1, 1);
      touchInput.moveY = clamp(y / max, -1, 1);
      knob.style.transform = "translate(calc(-50% + " + x + "px), calc(-50% + " + y + "px))";
    };

    stick.addEventListener("pointerdown", event => {
      touchInput.used = true;
      touchInput.moveId = event.pointerId;
      stick.setPointerCapture?.(event.pointerId);
      setStick(event);
      event.preventDefault();
    });
    stick.addEventListener("pointermove", event => {
      if (event.pointerId !== touchInput.moveId) return;
      setStick(event);
      event.preventDefault();
    });
    stick.addEventListener("pointerup", event => {
      if (event.pointerId === touchInput.moveId) resetTouchStick();
    });
    stick.addEventListener("pointercancel", event => {
      if (event.pointerId === touchInput.moveId) resetTouchStick();
    });

    el("touchFire").addEventListener("pointerdown", event => {
      touchInput.used = true;
      touchInput.firing = true;
      el("touchFire").setPointerCapture?.(event.pointerId);
      shoot();
      event.preventDefault();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(type => {
      el("touchFire").addEventListener(type, () => {
        touchInput.firing = false;
      });
    });
    el("touchReload").addEventListener("click", reload);
    el("touchJump").addEventListener("pointerdown", event => {
      touchInput.used = true;
      touchInput.jump = true;
      tryJump();
      event.preventDefault();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(type => {
      el("touchJump").addEventListener(type, () => {
        touchInput.jump = false;
        player.jumpHeld = false;
      });
    });
    el("touchBuy").addEventListener("click", () => {
      if (phase === "buy") showBuy(true);
      else setMessage("Compra fechada", "So da para comprar antes da rodada.", 1100);
    });
    el("touchBomb").addEventListener("pointerdown", event => {
      touchInput.used = true;
      touchInput.plant = true;
      el("touchBomb").setPointerCapture?.(event.pointerId);
      event.preventDefault();
    });
    ["pointerup", "pointercancel", "pointerleave"].forEach(type => {
      el("touchBomb").addEventListener(type, () => {
        touchInput.plant = false;
      });
    });
    el("touchWalk").addEventListener("click", () => {
      touchInput.slow = !touchInput.slow;
    });
  }

  async function init() {
    await loadAssetPack();
    applyViewWeaponAsset();
    buildMap();
    bindEvents();
    el("playerName").value = localStorage.getItem("taticoName") || "";
    updateManualUi();
    setCrosshairStyle(crosshairStyle);
    setSensitivity(sensMult);
    setTimeMode(worldTime);
    refreshPublicRooms();
    window.setInterval(() => {
      if (!el("startScreen").classList.contains("hidden")) refreshPublicRooms();
    }, 4500);
    resetPlayer();
    updateHud();
    el("loading").style.display = "none";
    requestAnimationFrame(loop);
  }

  init().catch(error => {
    console.error(error);
    el("loading").textContent = "Nao foi possivel iniciar o jogo.";
  });
})();
