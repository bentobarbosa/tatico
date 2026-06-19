(() => {
  "use strict";

  if (!window.THREE) {
    document.getElementById("loading").textContent = "Three.js nao carregou. Confira a internet ou publique no GitHub Pages.";
    return;
  }

  const el = id => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const rand = (min, max) => min + Math.random() * (max - min);
  const WORLD_W = 156;
  const WORLD_D = 122;
  const PLAYER_HEIGHT = 1.72;
  const PLAYER_RADIUS = 0.55;
  const BOT_RADIUS = 0.62;
  const Y_UP = new THREE.Vector3(0, 1, 0);
  const ONLINE_SEND_MS = 55;

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
  scene.fog = new THREE.Fog(0x1d2118, 70, 170);

  const camera = new THREE.PerspectiveCamera(73, window.innerWidth / window.innerHeight, 0.05, 220);
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.55));
  if ("outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  else renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.id = "gameCanvas";
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("aria-label", "Area do jogo Tatico 3D");
  document.body.appendChild(renderer.domElement);
  scene.add(camera);

  const hemi = new THREE.HemisphereLight(0xdde8ff, 0x394326, 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0ce, 2.05);
  sun.position.set(-34, 52, 26);
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

  const clock = new THREE.Clock();
  const keys = {};
  const mouse = { down: false, lookHeld: false, freeLook: false, lastX: 0, lastY: 0 };
  const walls = [];
  const bots = [];
  const remotePlayers = new Map();
  const tracers = [];
  const particles = [];
  let phase = "menu";
  let round = 1;
  let ctScore = 0;
  let trScore = 0;
  let messageUntil = 0;
  let roundEndTimer = 0;

  const player = {
    position: new THREE.Vector3(0, PLAYER_HEIGHT, 50),
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

  const net = {
    mode: "offline",
    ws: null,
    id: null,
    team: null,
    players: [],
    scores: { CT: 0, TR: 0 },
    slots: { CT: 0, TR: 0 },
    room: null,
    pendingRoomMode: "quick",
    pendingRoomCode: "",
    pendingPrivate: false,
    lastSend: 0,
    spawnId: -1,
    joined: false
  };

  let manualEnabled = localStorage.getItem("taticoManual") !== "off";
  const touchInput = {
    used: false,
    moveId: null,
    lookId: null,
    moveX: 0,
    moveY: 0,
    lastLookX: 0,
    lastLookY: 0,
    firing: false,
    slow: false
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
    asphalt: makeMat(0x2f332d, 0.88),
    containerBlue: makeMat(0x315e7e, 0.68),
    containerRed: makeMat(0x85483c, 0.68),
    barrel: makeMat(0x365b4a, 0.58),
    house: makeMat(0x9b8b72, 0.82),
    houseDark: makeMat(0x6f705e, 0.86),
    roof: makeMat(0x564337, 0.78),
    windowLit: makeMat(0xd9c06a, 0.35),
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

  function addContainer(x, z, rot = 0, colorMat = mats.containerBlue) {
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
    group.position.set(x, 1.65, z);
    group.rotation.y = rot;
    scene.add(group);
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
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.35, 18), mats.barrel);
    mesh.position.set(x, 0.68, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
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

    const door = new THREE.Mesh(new THREE.BoxGeometry(1.35, 2.1, 0.08), mats.black);
    door.position.set(-w * 0.24, 1.05, -d / 2 - 0.045);
    group.add(door);

    [-0.18, 0.24].forEach(offset => {
      const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.78, 0.09), mats.windowLit);
      windowMesh.position.set(w * offset, 2.62, -d / 2 - 0.055);
      group.add(windowMesh);
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

    const horizontal = Math.abs(Math.cos(rot)) > 0.7;
    walls.push({
      x,
      z,
      halfX: horizontal ? 2.4 : 1.12,
      halfZ: horizontal ? 1.12 : 2.4,
      h: 1.75,
      mesh: group,
      label: "veiculo"
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

    [-60, -30, 0, 30, 60].forEach(x => {
      addLightPost(x, -52);
      addLightPost(x, 52);
    });
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
    player.position.set(0, PLAYER_HEIGHT, 50);
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
        position: new THREE.Vector3(-25 + i * 7, 0, -50 + (i % 2) * 5),
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

  function clearRemotePlayers() {
    for (const remote of remotePlayers.values()) {
      scene.remove(remote.mesh);
    }
    remotePlayers.clear();
  }

  function disconnectOnline() {
    if (net.ws) {
      net.ws.onclose = null;
      net.ws.close();
    }
    net.ws = null;
    net.id = null;
    net.team = null;
    net.joined = false;
    net.players = [];
    net.slots = { CT: 0, TR: 0 };
    net.room = null;
    net.spawnId = -1;
    el("onlinePanel").hidden = true;
    clearRemotePlayers();
  }

  function startGame() {
    net.mode = "offline";
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

  function onlineSocketUrl() {
    if (location.protocol === "https:") return "wss://" + location.host + "/multiplayer";
    if (location.protocol === "http:") return "ws://" + location.host + "/multiplayer";
    return null;
  }

  function cleanRoomCode() {
    return (el("roomCode").value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
  }

  function startOnlineGame(roomMode = "quick") {
    const url = onlineSocketUrl();
    if (!url) {
      setMessage("Abra pelo servidor", "Use o Render ou rode npm start.", 3600);
      return;
    }

    const roomCode = cleanRoomCode();
    if (roomMode === "join" && roomCode.length < 4) {
      setMessage("Codigo da sala", "Digite o codigo que seu amigo recebeu.", 2600);
      return;
    }

    net.mode = "online";
    disconnectOnline();
    net.mode = "online";
    net.pendingRoomMode = roomMode;
    net.pendingRoomCode = roomCode;
    net.pendingPrivate = el("privateRoom").checked;
    phase = "connecting";
    player.money = 0;
    player.owned = new Set(WEAPON_ORDER);
    equip("rifle");
    localStorage.setItem("taticoName", getPlayerName());
    el("startScreen").classList.add("hidden");
    el("buyButton").hidden = true;
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
      if (net.mode !== "online") return;
      setMessage("Servidor desconectou", "Volte ao lobby e tente de novo.", 3600);
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
      net.joined = true;
      phase = "live";
      player.alive = true;
      player.hp = 100;
      player.position.set(data.spawn.x, PLAYER_HEIGHT, data.spawn.z);
      player.yaw = data.spawn.yaw || 0;
      player.pitch = 0;
      ctScore = data.scores?.CT || 0;
      trScore = data.scores?.TR || 0;
      const roomText = net.room?.code ? "Sala " + net.room.code : "Sala online";
      setMessage("Voce entrou no " + data.team, roomText + " · clique no jogo para mirar.", 3000);
      el("onlinePanel").hidden = false;
      updateOnlinePanel();
      return;
    }

    if (data.type === "state") {
      net.players = data.players || [];
      net.scores = data.scores || net.scores;
      net.slots = data.slots || net.slots;
      net.room = data.room || net.room;
      round = data.round || round;
      ctScore = net.scores.CT || 0;
      trScore = net.scores.TR || 0;

      const self = net.players.find(p => p.id === net.id);
      if (self) {
        player.hp = self.hp;
        player.alive = self.alive;
        if (!self.alive) {
          mouse.down = false;
          touchInput.firing = false;
        }
        if (self.spawnId !== net.spawnId) {
          net.spawnId = self.spawnId;
          player.position.set(self.x, PLAYER_HEIGHT, self.z);
          player.yaw = self.yaw;
          player.pitch = self.pitch || 0;
          player.alive = self.alive;
          player.hp = self.hp;
        }
      }

      syncRemotePlayers();
      updateOnlinePanel();
      return;
    }

    if (data.type === "shot") {
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

    if (data.type === "error") {
      setMessage("Nao entrou no online", data.message || "Tente de novo em alguns segundos.", 4200);
      phase = "menu";
      el("startScreen").classList.remove("hidden");
      el("buyButton").hidden = false;
      disconnectOnline();
      net.mode = "offline";
    }
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
      remote.mesh.position.set(info.x, 0, info.z);
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
    el("onlineTitle").textContent = "Sala " + code + " · " + privacy;
    el("onlineTeam").textContent = (net.team ? "Seu time: " + net.team : "Conectando") + " · CT " + (net.slots.CT || 0) + "/4 · TR " + (net.slots.TR || 0) + "/4";

    const dots = [];
    for (let i = 0; i < 4; i++) dots.push("<span class=\"slot-dot " + (i < (net.slots.CT || 0) ? "ct" : "") + "\"></span>");
    for (let i = 0; i < 4; i++) dots.push("<span class=\"slot-dot " + (i < (net.slots.TR || 0) ? "tr" : "") + "\"></span>");
    el("onlineSlots").innerHTML = dots.join("");
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
    if (net.mode === "online" && open) {
      setMessage("Online 4x4", "Equipamento fixo para deixar a partida justa.", 1500);
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

  function aimByDelta(dx, dy, sensitivity = 1) {
    player.yaw -= dx * 0.0022 * sensitivity;
    player.pitch = clamp(player.pitch - dy * 0.002 * sensitivity, -1.18, 1.08);
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

    const origin = player.position.clone();
    origin.y = PLAYER_HEIGHT - 0.05;
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
    if (player.reloading && performance.now() >= player.reloadEnd) {
      player.reloading = false;
      player.ammo = weapon().mag;
      updateHud();
    }
  }

  function updateOnlineNetwork() {
    if (net.mode !== "online" || phase !== "live" || !net.joined) return;
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
        if (bot.think <= 0) {
          bot.think = rand(0.8, 1.7);
          bot.target = new THREE.Vector3(rand(-58, 58), 0, rand(-44, 44));
        }
        const target = bot.target || new THREE.Vector3(0, 0, 0);
        const d = target.clone().sub(bot.position);
        if (d.length() > 2) {
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
    el("money").textContent = net.mode === "online" ? (net.team || "Online") : "$" + player.money;
    el("ctScore").textContent = "CT " + ctScore;
    el("trScore").textContent = trScore + " TR";
    el("roundLabel").textContent = net.mode === "online" ? "4x4" : "R" + round;
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
    ctx.fillRect((42 - 9) * scale, (42 - 7) * scale, 18 * scale, 14 * scale);
    if (net.mode === "online") {
      for (const other of net.players) {
        if (!other.alive || other.id === net.id) continue;
        ctx.fillStyle = other.team === "CT" ? "#73b9ff" : "#f2b85b";
        ctx.beginPath();
        ctx.arc(other.x * scale, other.z * scale, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      for (const bot of bots) {
        if (!bot.alive) continue;
        ctx.fillStyle = "#f2b85b";
        ctx.beginPath();
        ctx.arc(bot.position.x * scale, bot.position.z * scale, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = net.mode === "online" && net.team === "TR" ? "#f2b85b" : "#73b9ff";
    ctx.beginPath();
    ctx.arc(player.position.x * scale, player.position.z * scale, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = net.mode === "online" && net.team === "TR" ? "#f2b85b" : "#73b9ff";
    ctx.beginPath();
    ctx.moveTo(player.position.x * scale, player.position.z * scale);
    ctx.lineTo((player.position.x - Math.sin(player.yaw) * 6) * scale, (player.position.z - Math.cos(player.yaw) * 6) * scale);
    ctx.stroke();
    ctx.restore();
  }

  function updateTouchControls() {
    const shouldShow = phase === "live" && ("ontouchstart" in window || touchInput.used || matchMedia("(pointer: coarse)").matches);
    el("touchControls").hidden = !shouldShow;
    el("touchBuy").hidden = net.mode === "online";
    el("touchWalk").classList.toggle("active", touchInput.slow);
  }

  function resetTouchStick() {
    touchInput.moveId = null;
    touchInput.moveX = 0;
    touchInput.moveY = 0;
    el("touchKnob").style.transform = "translate(-50%, -50%)";
  }

  function loop() {
    const dt = Math.min(clock.getDelta(), 0.05);
    if (phase === "live" || phase === "round_end") {
      updatePlayer(dt);
      if (net.mode === "online") {
        updateOnlineNetwork();
      } else {
        updateBots(dt);
        updateRound(dt);
      }
    }
    if (phase === "live" && (mouse.down || touchInput.firing)) shoot();
    updateTracers(dt);
    updateParticles(dt);
    updateCamera();
    updateHud();
    updateTouchControls();
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
      if (event.code === "KeyB" && phase === "buy" && net.mode !== "online") showBuy(true);
      if (event.code === "Escape") {
        mouse.freeLook = false;
        mouse.down = false;
        mouse.lookHeld = false;
        if (document.pointerLockElement === renderer.domElement) document.exitPointerLock?.();
        if (phase === "buy") showBuy(true);
      }
    });
    window.addEventListener("keyup", event => {
      keys[event.code] = false;
    });
    window.addEventListener("mousemove", event => {
      if (phase !== "live") return;
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
      if (phase !== "live") return;
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
      if (phase !== "live" || event.pointerType !== "touch" || event.pointerId !== touchInput.lookId) return;
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
      resetTouchStick();
    });
    renderer.domElement.addEventListener("contextmenu", event => event.preventDefault());
    renderer.domElement.addEventListener("click", event => {
      if (phase === "live" && !touchInput.used) {
        enableMouseLook(event.clientX, event.clientY);
        lockPointer();
      }
    });
    el("startButton").addEventListener("click", startGame);
    el("onlineButton").addEventListener("click", () => startOnlineGame("quick"));
    el("createRoomButton").addEventListener("click", () => startOnlineGame("create"));
    el("joinRoomButton").addEventListener("click", () => startOnlineGame("join"));
    el("roomCode").addEventListener("input", () => {
      el("roomCode").value = cleanRoomCode();
    });
    el("manualOn").addEventListener("click", () => setManual(true));
    el("manualOff").addEventListener("click", () => setManual(false));
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
    el("touchBuy").addEventListener("click", () => {
      if (phase === "buy") showBuy(true);
      else setMessage("Compra fechada", "So da para comprar antes da rodada.", 1100);
    });
    el("touchWalk").addEventListener("click", () => {
      touchInput.slow = !touchInput.slow;
    });
  }

  function init() {
    buildMap();
    bindEvents();
    el("playerName").value = localStorage.getItem("taticoName") || "";
    updateManualUi();
    resetPlayer();
    updateHud();
    el("loading").style.display = "none";
    requestAnimationFrame(loop);
  }

  init();
})();
