"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { URL } = require("node:url");

const rootDir = __dirname;
const port = Number(process.env.PORT || 8080);
const WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";

const WORLD_W = 156;
const WORLD_D = 122;
const PLAYER_HEIGHT = 1.72;
const PLAYER_RADIUS = 0.55;
const BOT_RADIUS = 0.62;
const TICK_MS = 75;
const CLIMB_EPSILON = 0.32;
const ROOM_CAPACITY = 8;
const BUY_TIME_MS = 10000;
const WIN_REWARD = 3250;
const LOSS_REWARD = 1900;
const DRAW_REWARD = 2200;
const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const WEAPONS = {
  pistol: { price: 0, damage: 28, fireMs: 260, spread: 0, pellets: 1, range: 70 },
  smg: { price: 1000, damage: 18, fireMs: 88, spread: 0, pellets: 1, range: 60 },
  shotgun: { price: 1300, damage: 13, fireMs: 720, spread: 0.12, pellets: 8, range: 38 },
  rifle: { price: 2500, damage: 34, fireMs: 120, spread: 0, pellets: 1, range: 85 },
  sniper: { price: 4200, damage: 120, fireMs: 1350, spread: 0, pellets: 1, range: 115 }
};

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8"
};

const sockets = new Set();
const rooms = new Map();
const walls = [];
let nextPlayerId = 1;

const spawns = {
  CT: [
    { x: -10, z: 51, yaw: 0 },
    { x: -3, z: 51, yaw: 0 },
    { x: 4, z: 51, yaw: 0 },
    { x: 11, z: 51, yaw: 0 }
  ],
  TR: [
    { x: -10, z: -51, yaw: Math.PI },
    { x: -3, z: -51, yaw: Math.PI },
    { x: 4, z: -51, yaw: Math.PI },
    { x: 11, z: -51, yaw: Math.PI }
  ]
};

function send(res, status, body, type = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": status === 200 ? "public, max-age=60" : "no-store"
  });
  res.end(body);
}

function resolvePublicFile(requestUrl) {
  const parsed = new URL(requestUrl, "http://localhost");
  const cleanPath = decodeURIComponent(parsed.pathname);
  const requestedPath = cleanPath === "/" ? "/index.html" : cleanPath;
  const fullPath = path.normalize(path.join(rootDir, requestedPath));

  if (!fullPath.startsWith(rootDir)) return null;
  return fullPath;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function cleanName(value) {
  return String(value || "Jogador")
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim()
    .slice(0, 16) || "Jogador";
}

function normalizeRoomCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
}

function makeRoomCode() {
  for (let tries = 0; tries < 80; tries++) {
    let code = "";
    for (let i = 0; i < 5; i++) {
      code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
    }
    if (!rooms.has(code)) return code;
  }
  return String(Date.now()).slice(-6);
}

function roomSummary(room) {
  return {
    code: room.code,
    public: room.public,
    players: room.players.size,
    capacity: ROOM_CAPACITY
  };
}

function roomListSummary(room) {
  return {
    code: room.code,
    public: room.public,
    players: room.players.size,
    capacity: ROOM_CAPACITY,
    round: room.round,
    matchState: room.matchState,
    slots: { CT: teamCount(room, "CT"), TR: teamCount(room, "TR") }
  };
}

function createRoom(isPrivate = false) {
  const room = {
    code: makeRoomCode(),
    public: !isPrivate,
    sockets: new Set(),
    players: new Map(),
    scores: { CT: 0, TR: 0 },
    round: 1,
    matchState: "waiting",
    resetAt: 0,
    buyEndAt: 0,
    createdAt: Date.now()
  };
  rooms.set(room.code, room);
  return room;
}

function findPublicRoom() {
  let best = null;
  for (const room of rooms.values()) {
    if (!room.public || room.players.size >= ROOM_CAPACITY) continue;
    if (!best || room.players.size > best.players.size || (room.players.size === best.players.size && room.createdAt < best.createdAt)) {
      best = room;
    }
  }
  return best;
}

function addBox(x, z, w, d, h) {
  walls.push({ x, z, halfX: w / 2, halfZ: d / 2, h, climbable: h <= 2.25 });
}

function addCrate(x, z, size = 3, h = 2.1) {
  addBox(x, z, size, size, h);
  walls[walls.length - 1].climbable = true;
}

function addContainer(x, z, rot = 0) {
  const horizontal = Math.abs(Math.cos(rot)) > 0.7;
  walls.push({
    x,
    z,
    halfX: horizontal ? 5 : 1.6,
    halfZ: horizontal ? 1.6 : 5,
    h: 3.3
  });
}

function addBarrel(x, z) {
  walls.push({ x, z, halfX: 0.62, halfZ: 0.62, h: 1.35 });
}

function addHouse(x, z, w, d, h) {
  addBox(x, z, w, d, h + 0.7);
}

function addVehicle(x, z, rot = 0) {
  const horizontal = Math.abs(Math.cos(rot)) > 0.7;
  walls.push({
    x,
    z,
    halfX: horizontal ? 2.4 : 1.12,
    halfZ: horizontal ? 1.12 : 2.4,
    h: 1.75,
    climbable: true
  });
}

function buildCollisionMap() {
  addBox(0, -WORLD_D / 2, WORLD_W, 2.4, 4.2);
  addBox(0, WORLD_D / 2, WORLD_W, 2.4, 4.2);
  addBox(-WORLD_W / 2, 0, 2.4, WORLD_D, 4.2);
  addBox(WORLD_W / 2, 0, 2.4, WORLD_D, 4.2);

  addBox(-50, -18, 4, 42, 5.3);
  addBox(50, 13, 4, 48, 5.3);
  addBox(-18, -39, 48, 4, 4.2);
  addBox(18, 40, 48, 4, 4.2);
  addBox(0, 0, 18, 4, 3.2);
  addBox(-20, 12, 4, 18, 3.6);
  addBox(23, -14, 4, 18, 3.6);
  addBox(-55, 26, 24, 3.4, 3.4);
  addBox(55, -30, 24, 3.4, 3.4);
  addBox(-5, 30, 4, 20, 3.2);
  addBox(5, -31, 4, 20, 3.2);

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

  addContainer(-36, 39, 0);
  addContainer(-27, 43, 0);
  addContainer(34, -42, 0);
  addContainer(46, -38, Math.PI / 2);
  addContainer(-61, 2, Math.PI / 2);
  addContainer(62, -2, Math.PI / 2);

  addHouse(-68, 34, 11, 10, 4.4);
  addHouse(-68, -43, 12, 9, 4.2);
  addHouse(68, 35, 10, 11, 4.5);
  addHouse(68, -44, 11, 10, 4.2);
  addHouse(-36, -26, 10, 8, 3.8);
  addHouse(36, 27, 10, 8, 3.8);

  addVehicle(-58, -9, Math.PI / 2);
  addVehicle(58, 9, Math.PI / 2);
  addVehicle(-38, -52, 0);
  addVehicle(38, 52, 0);

  addBox(-66, 13, 12, 1.2, 1.8);
  addBox(66, -15, 12, 1.2, 1.8);
  addBox(-38, 52, 18, 1.2, 1.6);
  addBox(38, -52, 18, 1.2, 1.6);

  [-24, -20, 20, 24].forEach(x => addBarrel(x, -8));
  [-46, -43, 43, 46].forEach(x => addBarrel(x, 18));
  addBarrel(-64, -24);
  addBarrel(64, 26);
}

function insideWallXZ(pos, wall, radius = 0) {
  return Math.abs(pos.x - wall.x) < wall.halfX + radius && Math.abs(pos.z - wall.z) < wall.halfZ + radius;
}

function collides(pos, radius) {
  const footY = finiteNumber(pos.y, PLAYER_HEIGHT) - PLAYER_HEIGHT;
  for (const wall of walls) {
    if (insideWallXZ(pos, wall, radius)) {
      if (wall.climbable && footY >= wall.h - CLIMB_EPSILON) continue;
      return true;
    }
  }
  return Math.abs(pos.x) > WORLD_W / 2 - radius || Math.abs(pos.z) > WORLD_D / 2 - radius;
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
  const ox = origin.x - center.x;
  const oy = origin.y - center.y;
  const oz = origin.z - center.z;
  const b = 2 * (ox * dir.x + oy * dir.y + oz * dir.z);
  const c = ox * ox + oy * oy + oz * oz - radius * radius;
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

function dirFromAngles(yaw, pitch) {
  const cosPitch = Math.cos(pitch);
  return {
    x: -Math.sin(yaw) * cosPitch,
    y: Math.sin(pitch),
    z: -Math.cos(yaw) * cosPitch
  };
}

function teamCount(room, team) {
  let count = 0;
  for (const player of room.players.values()) {
    if (player.team === team) count++;
  }
  return count;
}

function teamsReady(room) {
  return teamCount(room, "CT") > 0 && teamCount(room, "TR") > 0;
}

function assignTeam(room) {
  const ct = teamCount(room, "CT");
  const tr = teamCount(room, "TR");
  if (ct >= 4 && tr >= 4) return null;
  if (ct >= 4) return "TR";
  if (tr >= 4) return "CT";
  return ct <= tr ? "CT" : "TR";
}

function spawnPlayer(room, player) {
  const teamPlayers = [...room.players.values()].filter(other => other.team === player.team);
  const index = Math.max(0, teamPlayers.findIndex(other => other.id === player.id));
  const spawn = spawns[player.team][index % spawns[player.team].length];
  player.x = spawn.x;
  player.y = PLAYER_HEIGHT;
  player.z = spawn.z;
  player.yaw = spawn.yaw;
  player.pitch = 0;
  player.hp = 100;
  player.alive = true;
  player.respawnAt = 0;
  player.fireUntil = 0;
  player.spawnId++;
}

function serializePlayers(room) {
  return [...room.players.values()].map(player => ({
    id: player.id,
    name: player.name,
    team: player.team,
    x: player.x,
    y: player.y,
    z: player.z,
    yaw: player.yaw,
    pitch: player.pitch,
    hp: player.hp,
    alive: player.alive,
    weaponId: player.weaponId,
    money: player.money,
    owned: [...player.owned],
    kills: player.kills,
    deaths: player.deaths,
    spawnId: player.spawnId
  }));
}

function encodeFrame(payload, opcode = 1) {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.from([0x80 | opcode, length]);
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x80 | opcode;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeUInt32BE(0, 2);
    header.writeUInt32BE(length, 6);
  }
  return Buffer.concat([header, payload]);
}

function wsSend(socket, message) {
  if (socket.destroyed) return;
  try {
    socket.write(encodeFrame(Buffer.from(JSON.stringify(message))));
  } catch {
    removeSocket(socket);
  }
}

function broadcast(room, message) {
  for (const socket of room.sockets) wsSend(socket, message);
}

function broadcastState(room) {
  if (!room.sockets.size) return;
  broadcast(room, {
    type: "state",
    players: serializePlayers(room),
    scores: room.scores,
    round: room.round,
    matchState: room.matchState,
    buyRemainingMs: room.matchState === "buy" ? Math.max(0, room.buyEndAt - Date.now()) : 0,
    room: roomSummary(room),
    slots: { CT: teamCount(room, "CT"), TR: teamCount(room, "TR") }
  });
}

function broadcastRound(room, title, sub) {
  broadcast(room, {
    type: "round",
    title,
    sub,
    round: room.round,
    scores: room.scores,
    room: roomSummary(room)
  });
}

function awardTeamMoney(room, winner) {
  for (const player of room.players.values()) {
    let amount = DRAW_REWARD;
    if (winner) amount = player.team === winner ? WIN_REWARD : LOSS_REWARD;
    player.money = Math.min(16000, player.money + amount);
  }
}

function startWarmup(room, title = "Aquecimento online", sub = "Aguardando outro time entrar.") {
  room.matchState = "waiting";
  room.buyEndAt = 0;
  room.resetAt = 0;
  for (const player of room.players.values()) {
    if (!player.alive) spawnPlayer(room, player);
  }
  broadcastRound(room, title, sub);
  broadcastState(room);
}

function startBuyPhase(room, title = "Fase de compra", sub = "Compre arma e prepare a rodada.") {
  room.matchState = teamsReady(room) ? "buy" : "waiting";
  room.buyEndAt = room.matchState === "buy" ? Date.now() + BUY_TIME_MS : 0;
  room.resetAt = 0;
  for (const player of room.players.values()) {
    spawnPlayer(room, player);
  }
  broadcastRound(room, title, sub);
  broadcastState(room);
}

function resetRound(room, title = "Nova rodada", sub = "Times reposicionados.") {
  room.round++;
  startBuyPhase(room, title, sub);
}

function aliveCount(room, team) {
  let count = 0;
  for (const player of room.players.values()) {
    if (player.team === team && player.alive) count++;
  }
  return count;
}

function checkRoundEnd(room) {
  if (!teamsReady(room) || room.matchState === "resetting") return;
  const ctAlive = aliveCount(room, "CT");
  const trAlive = aliveCount(room, "TR");
  if (ctAlive > 0 && trAlive > 0) {
    room.matchState = "live";
    return;
  }
  if (ctAlive === 0 && trAlive === 0) {
    awardTeamMoney(room, null);
    room.matchState = "resetting";
    room.resetAt = Date.now() + 3200;
    broadcastRound(room, "Rodada empatada", "Todo mundo caiu. Resetando...");
    return;
  }

  const winner = ctAlive > 0 ? "CT" : "TR";
  room.scores[winner]++;
  awardTeamMoney(room, winner);
  room.matchState = "resetting";
  room.resetAt = Date.now() + 3200;
  broadcastRound(room, winner + " venceu", "Vencedores receberam $" + WIN_REWARD + ". Perdedores receberam $" + LOSS_REWARD + ".");
}

function getRoomForJoin(data) {
  const mode = data.roomMode === "create" || data.roomMode === "join" ? data.roomMode : "quick";
  if (mode === "create") return createRoom(data.private === true);
  if (mode === "join") return rooms.get(normalizeRoomCode(data.roomCode)) || null;
  return findPublicRoom() || createRoom(false);
}

function handleJoin(socket, data) {
  if (socket.playerId || socket.roomCode) return;
  const room = getRoomForJoin(data);
  if (!room) {
    wsSend(socket, { type: "error", message: "Sala nao encontrada. Confira o codigo." });
    socket.end();
    return;
  }
  if (room.players.size >= ROOM_CAPACITY) {
    wsSend(socket, { type: "error", message: "Sala cheia: limite de 4x4 atingido." });
    socket.end();
    return;
  }

  const team = assignTeam(room);
  if (!team) {
    wsSend(socket, { type: "error", message: "Sala cheia: limite de 4x4 atingido." });
    socket.end();
    return;
  }

  const id = String(nextPlayerId++);
  const player = {
    id,
    name: cleanName(data.name),
    team,
    x: 0,
    y: PLAYER_HEIGHT,
    z: 0,
    yaw: 0,
    pitch: 0,
    hp: 100,
    alive: true,
    weaponId: "pistol",
    money: 800,
    owned: new Set(["pistol"]),
    kills: 0,
    deaths: 0,
    fireUntil: 0,
    respawnAt: 0,
    spawnId: 0
  };

  socket.playerId = id;
  socket.roomCode = room.code;
  room.sockets.add(socket);
  room.players.set(id, player);
  spawnPlayer(room, player);

  if (teamsReady(room) && room.matchState === "waiting") {
    startBuyPhase(room, "Partida 4x4 liberada", "Compre armas antes do combate.");
  }

  wsSend(socket, {
    type: "joined",
    id,
    team,
    spawn: { x: player.x, y: player.y, z: player.z, yaw: player.yaw },
    scores: room.scores,
    round: room.round,
    matchState: room.matchState,
    buyRemainingMs: room.matchState === "buy" ? Math.max(0, room.buyEndAt - Date.now()) : 0,
    room: roomSummary(room)
  });

  broadcastRound(room, player.name + " entrou", "Sala " + room.code + " · " + team + " agora tem " + teamCount(room, team) + "/4 jogadores.");
  broadcastState(room);
}

function roomFromSocket(socket) {
  return socket.roomCode ? rooms.get(socket.roomCode) : null;
}

function handleState(socket, data) {
  const room = roomFromSocket(socket);
  const player = room?.players.get(socket.playerId);
  if (!room || !player || !player.alive || room.matchState === "resetting") return;

  const next = {
    x: clamp(finiteNumber(data.x, player.x), -WORLD_W / 2 + PLAYER_RADIUS, WORLD_W / 2 - PLAYER_RADIUS),
    y: clamp(finiteNumber(data.y, player.y), PLAYER_HEIGHT, PLAYER_HEIGHT + 3),
    z: clamp(finiteNumber(data.z, player.z), -WORLD_D / 2 + PLAYER_RADIUS, WORLD_D / 2 - PLAYER_RADIUS)
  };

  if (!collides(next, PLAYER_RADIUS)) {
    player.x = next.x;
    player.z = next.z;
  }

  player.y = next.y;
  player.yaw = finiteNumber(data.yaw, player.yaw);
  player.pitch = clamp(finiteNumber(data.pitch, player.pitch), -1.18, 1.08);
  if (WEAPONS[data.weaponId] && player.owned.has(data.weaponId)) player.weaponId = data.weaponId;
}

function handleBuy(socket, data) {
  const room = roomFromSocket(socket);
  const player = room?.players.get(socket.playerId);
  const id = String(data.weaponId || "");
  const w = WEAPONS[id];
  if (!room || !player || !w || room.matchState !== "buy") return;

  if (!player.owned.has(id)) {
    if (player.money < w.price) {
      wsSend(socket, { type: "error", message: "Dinheiro insuficiente para comprar essa arma." });
      return;
    }
    player.money -= w.price;
    player.owned.add(id);
  }
  player.weaponId = id;
  broadcastState(room);
}

function handleFire(socket, data) {
  const room = roomFromSocket(socket);
  const player = room?.players.get(socket.playerId);
  if (!room || !player || !player.alive || (room.matchState !== "live" && room.matchState !== "waiting")) return;
  if (WEAPONS[data.weaponId]) player.weaponId = data.weaponId;
  player.yaw = finiteNumber(data.yaw, player.yaw);
  player.pitch = clamp(finiteNumber(data.pitch, player.pitch), -1.18, 1.08);

  const w = WEAPONS[player.weaponId] || WEAPONS.rifle;
  const now = Date.now();
  const damageEnabled = room.matchState === "live";
  if (now < player.fireUntil) return;
  player.fireUntil = now + w.fireMs;

  const origin = { x: player.x, y: player.y - 0.05, z: player.z };
  const shotEvents = [];

  for (let i = 0; i < w.pellets; i++) {
    const yaw = player.yaw + (Math.random() - 0.5) * w.spread;
    const pitch = player.pitch + (Math.random() - 0.5) * w.spread;
    const dir = dirFromAngles(yaw, pitch);
    const wallDist = firstWallDistance(origin, dir, w.range);
    let hitDist = wallDist;
    let hitPlayer = null;

    for (const target of room.players.values()) {
      if (!target.alive || target.team === player.team || target.id === player.id) continue;
      const center = { x: target.x, y: target.y - PLAYER_HEIGHT + 1.15, z: target.z };
      const distance = raySphere(origin, dir, center, BOT_RADIUS);
      if (distance !== null && distance < hitDist) {
        hitDist = distance;
        hitPlayer = target;
      }
    }

    if (hitPlayer && damageEnabled) {
      hitPlayer.hp = Math.max(0, hitPlayer.hp - w.damage);
      if (hitPlayer.hp <= 0 && hitPlayer.alive) {
        hitPlayer.alive = false;
        hitPlayer.deaths++;
        hitPlayer.respawnAt = Date.now() + 4500;
        player.kills++;
        player.money = Math.min(16000, player.money + 300);
      }
    }

    shotEvents.push({
      type: "shot",
      shooterId: player.id,
      team: player.team,
      start: origin,
      end: {
        x: origin.x + dir.x * hitDist,
        y: origin.y + dir.y * hitDist,
        z: origin.z + dir.z * hitDist
      },
      hitId: hitPlayer ? hitPlayer.id : null
    });
  }

  for (const event of shotEvents) broadcast(room, event);
  if (damageEnabled) checkRoundEnd(room);
  broadcastState(room);
}

function handleSocketMessage(socket, message) {
  let data;
  try {
    data = JSON.parse(message);
  } catch {
    return;
  }

  if (data.type === "join") handleJoin(socket, data);
  else if (data.type === "state") handleState(socket, data);
  else if (data.type === "fire") handleFire(socket, data);
  else if (data.type === "buy") handleBuy(socket, data);
}

function readFrames(socket, chunk) {
  socket.buffer = Buffer.concat([socket.buffer || Buffer.alloc(0), chunk]);

  while (socket.buffer.length >= 2) {
    const first = socket.buffer[0];
    const second = socket.buffer[1];
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    let length = second & 0x7f;
    let offset = 2;

    if (length === 126) {
      if (socket.buffer.length < 4) return;
      length = socket.buffer.readUInt16BE(2);
      offset = 4;
    } else if (length === 127) {
      socket.end();
      return;
    }

    let mask = null;
    if (masked) {
      if (socket.buffer.length < offset + 4) return;
      mask = socket.buffer.slice(offset, offset + 4);
      offset += 4;
    }

    if (socket.buffer.length < offset + length) return;
    let payload = socket.buffer.slice(offset, offset + length);
    socket.buffer = socket.buffer.slice(offset + length);

    if (masked && mask) {
      payload = Buffer.from(payload.map((byte, index) => byte ^ mask[index % 4]));
    }

    if (opcode === 0x8) {
      socket.end();
      return;
    }

    if (opcode === 0x9) {
      socket.write(encodeFrame(payload, 0xA));
      continue;
    }

    if (opcode === 0x1) handleSocketMessage(socket, payload.toString("utf8"));
  }
}

function removeSocket(socket) {
  sockets.delete(socket);
  const room = roomFromSocket(socket);
  if (!room) return;

  room.sockets.delete(socket);
  if (socket.playerId && room.players.has(socket.playerId)) {
    const player = room.players.get(socket.playerId);
    room.players.delete(socket.playerId);
    if (room.players.size === 0) {
      rooms.delete(room.code);
    } else {
      broadcastRound(room, player.name + " saiu", "Sala " + room.code + " ficou com " + room.players.size + "/" + ROOM_CAPACITY + " jogadores.");
      if (!teamsReady(room)) startWarmup(room);
      broadcastState(room);
    }
  }
  socket.playerId = null;
  socket.roomCode = null;
}

function handleUpgrade(req, socket) {
  const parsed = new URL(req.url || "/", "http://localhost");
  if (parsed.pathname !== "/multiplayer") {
    socket.destroy();
    return;
  }

  const key = req.headers["sec-websocket-key"];
  if (!key) {
    socket.destroy();
    return;
  }

  const accept = crypto.createHash("sha1").update(key + WS_GUID).digest("base64");
  socket.write([
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    "Sec-WebSocket-Accept: " + accept,
    "",
    ""
  ].join("\r\n"));

  socket.buffer = Buffer.alloc(0);
  sockets.add(socket);
  socket.on("data", chunk => readFrames(socket, chunk));
  socket.on("close", () => removeSocket(socket));
  socket.on("error", () => removeSocket(socket));
}

const server = http.createServer((req, res) => {
  if (!req.url || req.method !== "GET") {
    send(res, 405, "Metodo nao permitido");
    return;
  }

  if (req.url.startsWith("/health")) {
    let playerCount = 0;
    for (const room of rooms.values()) playerCount += room.players.size;
    send(res, 200, JSON.stringify({
      ok: true,
      game: "tatico-3d",
      multiplayer: true,
      rooms: rooms.size,
      players: playerCount
    }), "application/json; charset=utf-8");
    return;
  }

  if (req.url.startsWith("/rooms")) {
    const publicRooms = [...rooms.values()]
      .filter(room => room.public && room.players.size < ROOM_CAPACITY)
      .sort((a, b) => b.players.size - a.players.size || a.createdAt - b.createdAt)
      .map(roomListSummary);
    send(res, 200, JSON.stringify({
      ok: true,
      rooms: publicRooms
    }), "application/json; charset=utf-8");
    return;
  }

  const filePath = resolvePublicFile(req.url);
  if (!filePath) {
    send(res, 403, "Caminho bloqueado");
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Arquivo nao encontrado");
      return;
    }

    const type = mimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
    send(res, 200, data, type);
  });
});

buildCollisionMap();

setInterval(() => {
  const now = Date.now();

  for (const room of rooms.values()) {
    if (room.players.size === 0) {
      rooms.delete(room.code);
      continue;
    }

    if (room.matchState === "buy" && room.buyEndAt && now >= room.buyEndAt) {
      room.matchState = teamsReady(room) ? "live" : "waiting";
      room.buyEndAt = 0;
      broadcastRound(room, "Combate liberado", "Elimine a equipe adversaria.");
    }

    if (room.matchState === "resetting" && room.resetAt && now >= room.resetAt) {
      resetRound(room);
    } else if (!teamsReady(room)) {
      if (room.matchState !== "waiting") {
        startWarmup(room);
      } else {
        room.buyEndAt = 0;
        for (const player of room.players.values()) {
          if (!player.alive) spawnPlayer(room, player);
        }
      }
    }

    broadcastState(room);
  }
}, TICK_MS);

server.on("upgrade", handleUpgrade);

server.listen(port, () => {
  console.log(`Tatico 3D rodando em http://localhost:${port}`);
  console.log("Multiplayer 4x4 com salas ativo em /multiplayer");
});
