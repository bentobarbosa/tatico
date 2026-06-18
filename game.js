(() => {
  "use strict";

  if (!window.THREE) {
    document.getElementById("loading").textContent = "Three.js nao carregou. Confira a internet ou publique no GitHub Pages.";
    return;
  }

  const el = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const WORLD_W = 120;
  const WORLD_D = 92;
  const PLAYER_HEIGHT = 1.72;
  const PLAYER_RADIUS = 0.55;
  const BOT_RADIUS = 0.62;
  const Y_UP = new THREE.Vector3(0, 1, 0);

  const WEAPONS = {
    pistol: { name: "Pistola", price: 0, damage: 28, mag: 12, fireMs: 260, reloadMs: 1200, spread: 0.015, pellets: 1, range: 70 },
    smg: { name: "SMG", price: 1000, damage: 18, mag: 30, fireMs: 88, reloadMs: 1700, spread: 0.045, pellets: 1, range: 60 },
    shotgun: { name: "Escopeta", price: 1300, damage: 13, mag: 8, fireMs: 720, reloadMs: 2400, spread: 0.13, pellets: 8, range: 38 },
    rifle: { name: "Fuzil", price: 2500, damage: 34, mag: 30, fireMs: 120, reloadMs: 2200, spread: 0.025, pellets: 1, range: 85 },
    sniper: { name: "Sniper", price: 4200, damage: 120, mag: 5, fireMs: 1350, reloadMs: 2800, spread: 0.004, pellets: 1, range: 115 }
  };
  const WEAPON_ORDER = ["pistol", "smg", "shotgun", "rifle", "sniper"];

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1d2118);
  scene.fog = new THREE.Fog(0x1d2118, 55, 132);

  const camera = new THREE.PerspectiveCamera(73, window.innerWidth / window.innerHeight, 0.05, 220);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.55));
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.body.appendChild(renderer.domElement);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xdde8ff, 0x394326, 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0ce, 2.05);
  sun.position.set(-24, 42, 18);
  sun.castShadow = true;
  sun.shadow.camera.left = -80;
  sun.shadow.camera.right = 80;
  sun.shadow.camera.top = 80;
  sun.shadow.camera.bottom = -80;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun);

  const clock = new THREE.Clock();
  const keys = {};
  const mouse = { down: false };
  const walls = [];
  const bots = [];
  const tracers = [];
  const particles = [];
  let phase = "menu";
  let round = 1;
  let ctScore = 0;
  let trScore = 0;
  let messageUntil = 0;
  let roundEndTimer = 0;

  const player = {
    position: new THREE.Vector3(0, PLAYER_HEIGHT, 36),
    yaw: 0,
    pitch: 0,
    hp: 100,
    money: 800,
    kills: 0,
    weaponId: "pistol",
    ammo: WEAPONS.pistol.mag,
    owned: new Set(["pistol"]),
    fireCooldown: 0,
    reloadEnd: 0,
    reloading: false,
    alive: true
  };

  function weapon() {
    return WEAPONS[player.weaponId];
  }

  function setMessage(title, sub, ms = 1700) {
    el("message").innerHTML = title + (sub ? "<small>" + sub + "</small>" : "");
    messageUntil = performance.now() + ms;
  }

  function makeMat(color, roughness = 0.85) {
    return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.05 });
  }

  const mats = {
    floor: makeMat(0x4b5a39),
    wall: makeMat(0x8c8a7e),
    darkWall: makeMat(0x55594f),
    brick: makeMat(0x8e5f4b),
    crate: makeMat(0x7b5a32),
    metal: makeMat(0x58606a, 0.55),
    site: makeMat(0xd6a23a),
    ct: makeMat(0x3f83c4),
    tr: makeMat(0xc49a42),
    black: makeMat(0x141414, 0.7),
    glass: new THREE.MeshStandardMaterial({ color: 0x8dc3d6, roughness: 0.22, metalness: 0.05, transparent: true, opacity: 0.42 })
  };

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

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.36, 10), mats.black);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0.02, 0.04, -0.98);
    group.add(barrel);

    group.userData.gun = gun;
    group.userData.top = top;
    group.userData.barrel = barrel;
    return group;
  }

  function updateViewModel() {
    const w = weapon();
    const longGun = w.range > 70 || w.mag >= 30;
    viewModel.position.set(longGun ? 0.34 : 0.42, longGun ? -0.52 : -0.54, longGun ? -1.02 : -0.92);
    viewModel.userData.gun.scale.set(longGun ? 0.86 : 1, longGun ? 0.92 : 1, longGun ? 1.55 : 1);
    viewModel.userData.top.scale.set(longGun ? 0.86 : 1, 1, longGun ? 1.45 : 1);
    viewModel.userData.barrel.position.z = longGun ? -1.28 : -0.98;
  }

  function addBox(x, z, w, d, h, mat, label = "parede") {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    walls.push({ x, z, halfX: w / 2, halfZ: d / 2, h, mesh, label });
    return mesh;
  }

  function addCrate(x, z, size = 3, h = 2.1) {
    const mesh = addBox(x, z, size, size, h, mats.crate, "caixa");
    const edge = new THREE.EdgesGeometry(mesh.geometry);
    const line = new THREE.LineSegments(edge, new THREE.LineBasicMaterial({ color: 0x312519, transparent: true, opacity: 0.55 }));
    line.position.copy(mesh.position);
    scene.add(line);
    mesh.userData.edge = line;
    return mesh;
  }

  function buildMap() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(WORLD_W, WORLD_D), mats.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    const grid = new THREE.GridHelper(120, 24, 0x252c20, 0x252c20);
    grid.position.y = 0.012;
    scene.add(grid);

    addBox(0, -WORLD_D / 2, WORLD_W, 2.4, 4.2, mats.darkWall, "muro");
    addBox(0, WORLD_D / 2, WORLD_W, 2.4, 4.2, mats.darkWall, "muro");
    addBox(-WORLD_W / 2, 0, 2.4, WORLD_D, 4.2, mats.darkWall, "muro");
    addBox(WORLD_W / 2, 0, 2.4, WORLD_D, 4.2, mats.darkWall, "muro");

    addBox(-38, -14, 4, 36, 5.3, mats.wall, "predio B");
    addBox(38, 10, 4, 42, 5.3, mats.wall, "predio A");
    addBox(-10, -29, 38, 4, 4.2, mats.brick, "corredor baixo");
    addBox(13, 28, 36, 4, 4.2, mats.brick, "corredor alto");
    addBox(0, 0, 18, 4, 3.2, mats.wall, "meio");
    addBox(-20, 12, 4, 18, 3.6, mats.wall, "janela");
    addBox(23, -14, 4, 18, 3.6, mats.wall, "porta");

    addCrate(-13, 5, 4, 2.7);
    addCrate(-5, 8, 4, 2.7);
    addCrate(14, -6, 4, 2.7);
    addCrate(7, -12, 3.6, 2.5);
    addCrate(-42, 24, 4.5, 2.8);
    addCrate(43, -24, 4.5, 2.8);
    addCrate(0, 17, 3.4, 2.4);
    addCrate(0, -19, 3.4, 2.4);

    const site = new THREE.Mesh(new THREE.BoxGeometry(18, 0.08, 14), mats.site);
    site.position.set(30, 0.05, 30);
    site.receiveShadow = true;
    scene.add(site);

    const siteText = makeSiteMarker();
    siteText.position.set(30, 0.12, 30);
    scene.add(siteText);

    for (let i = 0; i < 12; i++) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.8, 10), mats.black);
      lamp.position.set(rand(-52, 52), 1.9, rand(-39, 39));
      scene.add(lamp);
    }
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

  function createBotMesh(colorMat) {
    const group = new THREE.Group();

    const uniform = colorMat;
    const skin = makeMat(0xc99b72, 0.72);
    const boot = makeMat(0x171915, 0.78);
    const gear = makeMat(0x242822, 0.7);

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

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.31, 18, 14), skin);
    head.position.y = 1.98;
    head.castShadow = true;
    group.add(head);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.34, 18, 8, 0, Math.PI * 2, 0, Math.PI * 0.56), gear);
    helmet.position.y = 2.04;
    helmet.castShadow = true;
    group.add(helmet);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.08, 0.05), mats.glass);
    visor.position.set(0, 1.98, -0.29);
    group.add(visor);

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
    player.position.set(0, PLAYER_HEIGHT, 37);
    player.yaw = 0;
    player.pitch = 0;
    player.hp = 100;
    player.kills = 0;
    player.alive = true;
    player.reloading = false;
    player.fireCooldown = 0;
    player.reloadEnd = 0;
    equip(player.weaponId);
  }

  function spawnBots() {
    bots.forEach(bot => scene.remove(bot.mesh));
    bots.length = 0;
    const count = clamp(3 + Math.floor(round / 2), 3, 8);
    for (let i = 0; i < count; i++) {
      const bot = {
        position: new THREE.Vector3(-22 + i * 7, 0, -35 + (i % 2) * 5),
        yaw: 0,
        hp: 92 + round * 4,
        alive: true,
        fireCooldown: 0,
        reloadEnd: 0,
        ammo: round > 4 ? WEAPONS.rifle.mag : WEAPONS.smg.mag,
        weaponId: round > 4 ? "rifle" : "smg",
        strafe: i % 2 ? 1 : -1,
        think: rand(0, 1),
        mesh: createBotMesh(mats.tr)
      };
      bot.mesh.position.copy(bot.position);
      scene.add(bot.mesh);
      bots.push(bot);
    }
  }

  function equip(id) {
    player.weaponId = id;
    player.ammo = WEAPONS[id].mag;
    player.reloading = false;
    updateViewModel();
  }

  function startGame() {
    round = 1;
    ctScore = 0;
    trScore = 0;
    player.money = 800;
    player.owned = new Set(["pistol"]);
    player.weaponId = "pistol";
    el("startScreen").classList.add("hidden");
    startBuyPhase();
  }

  function startBuyPhase() {
    phase = "buy";
    resetPlayer();
    spawnBots();
    showBuy(true);
    setMessage("Rodada " + round, "Compre e entre no mapa.", 1300);
  }

  function startRound() {
    phase = "live";
    showBuy(false);
    lockPointer();
    setMessage("Rodada " + round, "Use cobertura e limpe o mapa.", 1300);
  }

  function endRound(ctWon) {
    if (phase === "round_end") return;
    phase = "round_end";
    roundEndTimer = 1.9;
    if (ctWon) {
      ctScore++;
      player.money += 2400 + player.kills * 150;
      setMessage("CT venceu", "+ dinheiro de rodada", 1800);
    } else {
      trScore++;
      player.money += 1200;
      setMessage("TR venceu", "Reagrupe e compre melhor.", 1800);
    }
  }

  function showBuy(open) {
    if (open && document.pointerLockElement === renderer.domElement) {
      document.exitPointerLock?.();
    }
    renderBuy();
    el("buyMenu").hidden = !open;
  }

  function renderBuy() {
    el("buyMoney").textContent = "$" + player.money;
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
  }

  function buyWeapon(id) {
    if (phase !== "buy") return;
    const w = WEAPONS[id];
    if (!w) return;
    if (!player.owned.has(id)) {
      if (player.money < w.price) return;
      player.money -= w.price;
      player.owned.add(id);
    }
    equip(id);
    renderBuy();
    updateHud();
  }

  function lockPointer() {
    if (document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock?.();
    }
  }

  function forwardDir() {
    return new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw) * -1).normalize();
  }

  function rightDir() {
    return new THREE.Vector3(Math.cos(player.yaw), 0, Math.sin(player.yaw)).normalize();
  }

  function cameraDir() {
    const dir = new THREE.Vector3(
      Math.sin(player.yaw) * Math.cos(player.pitch),
      Math.sin(player.pitch),
      -Math.cos(player.yaw) * Math.cos(player.pitch)
    );
    return dir.normalize();
  }

  function collides(pos, radius) {
    for (const wall of walls) {
      if (
        Math.abs(pos.x - wall.x) < wall.halfX + radius &&
        Math.abs(pos.z - wall.z) < wall.halfZ + radius
      ) {
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
    const yaw = (Math.random() - 0.5) * spread;
    const pitch = (Math.random() - 0.5) * spread;
    const euler = new THREE.Euler(pitch, yaw, 0, "YXZ");
    return dir.clone().applyEuler(euler).normalize();
  }

  function shoot() {
    if (phase !== "live" || !player.alive) return;
    const w = weapon();
    const now = performance.now();
    if (player.reloading || now < player.fireCooldown) return;
    if (player.ammo <= 0) {
      reload();
      return;
    }

    player.fireCooldown = now + w.fireMs;
    player.ammo--;

    const origin = player.position.clone();
    origin.y = PLAYER_HEIGHT - 0.05;
    const baseDir = cameraDir();
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
      if (hitBot) damageBot(hitBot, w.damage);
      createTracer(origin, origin.clone().addScaledVector(dir, hitDist), hitBot ? 0x9cff6d : 0xffdf72);
    }
    if (player.ammo <= 0) reload();
    updateHud();
  }

  function createTracer(start, end, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
    scene.add(line);
    tracers.push({ line, life: 0.07 });
  }

  function addImpact(pos, color) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color }));
    mesh.position.copy(pos);
    scene.add(mesh);
    particles.push({ mesh, life: 0.35, velocity: new THREE.Vector3(rand(-1, 1), rand(0.2, 1.5), rand(-1, 1)) });
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
    player.hp -= amount;
    if (player.hp <= 0) {
      player.hp = 0;
      player.alive = false;
      endRound(false);
    }
  }

  function reload() {
    const w = weapon();
    if (player.reloading || player.ammo >= w.mag) return;
    player.reloading = true;
    player.reloadEnd = performance.now() + w.reloadMs;
    updateHud();
  }

  function updatePlayer(dt) {
    if (!player.alive || phase !== "live") return;
    const f = forwardDir();
    const r = rightDir();
    let mx = 0;
    let mz = 0;
    if (keys.KeyW) { mx += f.x; mz += f.z; }
    if (keys.KeyS) { mx -= f.x; mz -= f.z; }
    if (keys.KeyD) { mx += r.x; mz += r.z; }
    if (keys.KeyA) { mx -= r.x; mz -= r.z; }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
      const speed = keys.ShiftLeft || keys.ShiftRight ? 3.0 : 6.1;
      moveCircle(player, mx * speed * dt, mz * speed * dt, PLAYER_RADIUS);
    }
    if (player.reloading && performance.now() >= player.reloadEnd) {
      player.reloading = false;
      player.ammo = weapon().mag;
      updateHud();
    }
  }

  function updateBots(dt) {
    if (phase !== "live") return;
    const playerChest = player.position.clone();
    playerChest.y = 1.2;
    for (const bot of bots) {
      if (!bot.alive) continue;
      bot.think -= dt;
      const botEye = bot.position.clone();
      botEye.y = 1.35;
      const toPlayer = player.position.clone().sub(bot.position);
      const dist = toPlayer.length();
      const seen = player.alive && dist < 68 && hasLineOfSight(botEye, playerChest);
      let moveX = 0;
      let moveZ = 0;

      if (seen) {
        bot.yaw = Math.atan2(toPlayer.x, -toPlayer.z);
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
        if (bot.think <= 0) {
          bot.think = rand(0.8, 1.7);
          bot.target = new THREE.Vector3(rand(-34, 34), 0, rand(-24, 24));
        }
        const target = bot.target || new THREE.Vector3(0, 0, 0);
        const d = target.clone().sub(bot.position);
        if (d.length() > 2) {
          d.normalize();
          moveX += d.x;
          moveZ += d.z;
          bot.yaw = Math.atan2(d.x, -d.z);
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
      t.line.material.opacity = clamp(t.life / 0.07, 0, 1);
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
      p.mesh.material.opacity = clamp(p.life / 0.35, 0, 1);
      if (p.life <= 0) {
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
      }
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      if (particles[i].life <= 0) particles.splice(i, 1);
    }
  }

  function updateCamera() {
    camera.position.copy(player.position);
    camera.rotation.order = "YXZ";
    camera.rotation.y = player.yaw;
    camera.rotation.x = player.pitch;
    const moving = keys.KeyW || keys.KeyA || keys.KeyS || keys.KeyD;
    const bob = moving && phase === "live" ? Math.sin(performance.now() * 0.01) : 0;
    viewModel.rotation.z = bob * 0.012;
    viewModel.rotation.x = -0.05 + Math.abs(bob) * 0.012;
  }

  function updateRound(dt) {
    if (phase === "live" && player.alive && bots.every(bot => !bot.alive)) endRound(true);
    if (phase === "round_end") {
      roundEndTimer -= dt;
      if (roundEndTimer <= 0) {
        round++;
        startBuyPhase();
      }
    }
  }

  function updateHud() {
    el("hp").textContent = Math.ceil(player.hp);
    el("weapon").textContent = weapon().name;
    el("ammo").textContent = player.reloading ? "recarregando" : player.ammo + "/" + weapon().mag;
    el("money").textContent = "$" + player.money;
    el("ctScore").textContent = "CT " + ctScore;
    el("trScore").textContent = trScore + " TR";
    el("roundLabel").textContent = "R" + round;
  }

  function drawMiniMap() {
    const c = el("miniMap");
    const ctx = c.getContext("2d");
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.fillStyle = "rgba(10, 13, 9, 0.95)";
    ctx.beginPath();
    ctx.arc(0, 0, w / 2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.clip();
    const sx = (w - 20) / WORLD_W;
    const sz = (h - 20) / WORLD_D;
    const scale = Math.min(sx, sz);
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.strokeRect(-WORLD_W * scale / 2, -WORLD_D * scale / 2, WORLD_W * scale, WORLD_D * scale);
    ctx.fillStyle = "rgba(190,190,170,0.65)";
    for (const wall of walls) {
      ctx.fillRect((wall.x - wall.halfX) * scale, (wall.z - wall.halfZ) * scale, wall.halfX * 2 * scale, wall.halfZ * 2 * scale);
    }
    ctx.fillStyle = "rgba(255, 207, 76, 0.55)";
    ctx.fillRect((30 - 9) * scale, (30 - 7) * scale, 18 * scale, 14 * scale);
    for (const bot of bots) {
      if (!bot.alive) continue;
      ctx.fillStyle = "#f2b85b";
      ctx.beginPath();
      ctx.arc(bot.position.x * scale, bot.position.z * scale, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#73b9ff";
    ctx.beginPath();
    ctx.arc(player.position.x * scale, player.position.z * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#73b9ff";
    ctx.beginPath();
    ctx.moveTo(player.position.x * scale, player.position.z * scale);
    ctx.lineTo((player.position.x + Math.sin(player.yaw) * 6) * scale, (player.position.z - Math.cos(player.yaw) * 6) * scale);
    ctx.stroke();
    ctx.restore();
  }

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (phase === "live" || phase === "round_end") {
      updatePlayer(dt);
      updateBots(dt);
      updateRound(dt);
    }
    if (phase === "live" && mouse.down) shoot();
    updateTracers(dt);
    updateParticles(dt);
    updateCamera();
    updateHud();
    drawMiniMap();
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
    window.addEventListener("keydown", event => {
      keys[event.code] = true;
      if (event.code === "KeyR") reload();
      if (event.code === "KeyB" && phase === "buy") showBuy(true);
      if (event.code === "Escape") {
        if (phase === "buy") showBuy(true);
      }
    });
    window.addEventListener("keyup", event => {
      keys[event.code] = false;
    });
    window.addEventListener("mousemove", event => {
      if (document.pointerLockElement !== renderer.domElement || phase !== "live") return;
      player.yaw -= event.movementX * 0.0022;
      player.pitch = clamp(player.pitch - event.movementY * 0.002, -1.18, 1.08);
    });
    window.addEventListener("mousedown", event => {
      if (event.button !== 0) return;
      if (phase === "live") {
        lockPointer();
        mouse.down = true;
        shoot();
      }
    });
    window.addEventListener("mouseup", () => {
      mouse.down = false;
    });
    renderer.domElement.addEventListener("click", () => {
      if (phase === "live") lockPointer();
    });
    el("startButton").addEventListener("click", startGame);
    el("playRound").addEventListener("click", startRound);
    el("closeBuy").addEventListener("click", () => showBuy(false));
    el("buyButton").addEventListener("click", () => {
      if (phase === "buy") showBuy(true);
      else setMessage("Compra fechada", "So da para comprar antes da rodada.", 1100);
    });
    el("weaponCards").addEventListener("click", event => {
      const card = event.target.closest("[data-weapon]");
      if (card) buyWeapon(card.dataset.weapon);
    });
  }

  function init() {
    buildMap();
    bindEvents();
    resetPlayer();
    updateHud();
    el("loading").style.display = "none";
    requestAnimationFrame(loop);
  }

  init();
})();
