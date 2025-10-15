// --- DOM ELEMENTS ---
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const livesDisplay = document.getElementById('lives-display');
const bombsDisplay = document.getElementById('bombs-display');
const rangeDisplay = document.getElementById('range-display');
const speedDisplay = document.getElementById('speed-display');
const messageDisplay = document.getElementById('message-display');
const gameOverScreen = document.getElementById('game-over-screen');
const gameOverMessage = document.getElementById('game-over-message');
const restartButton = document.getElementById('restart-button');

// --- GAME CONFIG ---
const TILE_SIZE_REF = 40; // Reference size for calculations
let TILE_SIZE = 40;
const MAP_COLS = 15;
const MAP_ROWS = 13;

const TILE_TYPE = { GROUND: 0, HARD_WALL: 1, SOFT_WALL: 2 };
const POWERUP_TYPE = { BOMB: 'bomb', FIRE: 'fire', SPEED: 'speed' };

let gameMap = [];
let powerUps = [];
let player;
let bombs = [];
let explosions = [];
let bots = [];
let keys = {};
let isGameOver = false;

// --- UTILITY ---
function isBoxColliding(box1, box2) { return (box1.x < box2.x + box2.width && box1.x + box1.width > box2.x && box1.y < box2.y + box2.height && box1.y + box1.height > box2.y); }
function scale(value) { return value * (TILE_SIZE / TILE_SIZE_REF); }

function calculateExplosionTiles(startCol, startRow, range) {
    let tiles = new Set([`${startCol},${startRow}`]);
    const directions = [[0, 1], [0, -1], [1, 0], [-1, 0]];
    for (const [dc, dr] of directions) {
        for (let i = 1; i <= range; i++) {
            const newCol = startCol + dc * i;
            const newRow = startRow + dr * i;
            if (newCol < 0 || newCol >= MAP_COLS || newRow < 0 || newRow >= MAP_ROWS) break;
            const tileType = gameMap[newRow][newCol];
            if (tileType === TILE_TYPE.HARD_WALL) break;
            tiles.add(`${newCol},${newRow}`);
            if (tileType === TILE_TYPE.SOFT_WALL) break;
        }
    }
    return tiles;
}

// --- GAME OBJECT CLASSES ---
class Character {
    constructor(x, y, color) {
        this.x = x; this.y = y; this.color = color;
        this.width = scale(TILE_SIZE_REF * 0.7); this.height = scale(TILE_SIZE_REF * 0.7);
        this.isDying = false; this.deathAnimTimer = 0;
        this.baseSpeed = 2;
        this.speed = scale(this.baseSpeed); 
        this.animFrame = 0; this.animTimer = 0;
    }

    draw() {
        if (this.isDying) { this.drawDeath(); return; }
        const headSize = this.width * 0.8;
        const bodySize = this.width * 0.9;
        const eyeSize = scale(5);
        this.animTimer++;
        if (this.animTimer > 15) { this.animFrame = (this.animFrame + 1) % 2; this.animTimer = 0; }
        const bob = this.animFrame * scale(-2);
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x + (this.width - bodySize) / 2, this.y + (this.height - bodySize) / 2 + bob, bodySize, bodySize);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(this.x + (this.width - headSize) / 2, this.y - scale(5) + bob, headSize, headSize);
        ctx.fillStyle = 'black';
        ctx.fillRect(this.x + this.width * 0.3 - scale(2), this.y - scale(2) + bob, eyeSize, eyeSize);
        ctx.fillRect(this.x + this.width * 0.7 - scale(2), this.y - scale(2) + bob, eyeSize, eyeSize);
    }
    
    drawDeath() { this.deathAnimTimer++; const t = this.deathAnimTimer; const centerX = this.x + this.width/2; const centerY = this.y + this.height/2; if (t > 60) return; ctx.globalAlpha = 1 - t/60; ctx.fillStyle = '#fef3c7'; ctx.beginPath(); ctx.arc(centerX, centerY, t * scale(0.8), 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(centerX, centerY, t * scale(0.5), 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1; }

    canMove(targetX, targetY) {
        const targetBox = { x: targetX, y: targetY, width: this.width, height: this.height };
        for (let row = 0; row < MAP_ROWS; row++) { for (let col = 0; col < MAP_COLS; col++) { if (gameMap[row][col] !== TILE_TYPE.GROUND) { const wallBox = { x: col * TILE_SIZE, y: row * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }; if (isBoxColliding(targetBox, wallBox)) return false; } } }
        for (const bomb of bombs) { const bombBox = { x: bomb.col * TILE_SIZE, y: bomb.row * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }; if (isBoxColliding(targetBox, bombBox)) { const currentBox = { x: this.x, y: this.y, width: this.width, height: this.height }; if (!isBoxColliding(currentBox, bombBox)) return false; } }
        return true;
    }
    
    die() { if (this.isDying) return; this.isDying = true; }
}

class Player extends Character {
    constructor(x, y) {
        super(x, y, '#3b82f6');
        this.lives = 3; this.maxBombs = 1; this.bombRange = 2;
    }

    update() { if (this.isDying) return; let nextX = this.x, nextY = this.y; if (keys['ArrowUp']) nextY -= this.speed; if (keys['ArrowDown']) nextY += this.speed; if (keys['ArrowLeft']) nextX -= this.speed; if (keys['ArrowRight']) nextX += this.speed; if (this.x !== nextX && this.canMove(nextX, this.y)) this.x = nextX; if (this.y !== nextY && this.canMove(this.x, nextY)) this.y = nextY; this.checkPowerUpCollision(); }
    placeBomb() { if (this.isDying || bombs.filter(b => b.owner === this).length >= this.maxBombs) return; const gridCol = Math.floor((this.x + this.width / 2) / TILE_SIZE); const gridRow = Math.floor((this.y + this.height / 2) / TILE_SIZE); if (bombs.some(b => b.col === gridCol && b.row === gridRow)) return; bombs.push(new Bomb(gridCol, gridRow, this.bombRange, this)); }
    checkPowerUpCollision() { powerUps = powerUps.filter(p => { if (isBoxColliding(this, p)) { p.apply(this); return false; } return true; }); }
    die() { super.die(); setTimeout(() => { this.lives--; if (this.lives <= 0) { endGame(false); } else { this.x = TILE_SIZE * 1.1; this.y = TILE_SIZE * 1.1; this.isDying = false; this.deathAnimTimer=0;} updateInfoPanel();}, 1000); }
}

class Bot extends Character {
    constructor(x, y) { super(x, y, '#ef4444'); this.moveTimer = 0; this.direction = { x: 0, y: 0 }; this.canPlaceBomb = true; }
    update(dangerMap) { if (this.isDying) return; this.currentTile = { col: Math.floor((this.x + this.width / 2) / TILE_SIZE), row: Math.floor((this.y + this.height / 2) / TILE_SIZE) }; const currentTileKey = `${this.currentTile.col},${this.currentTile.row}`; if (dangerMap.has(currentTileKey)) { this.flee(dangerMap); } else { this.wanderAndAct(); } }
    flee(dangerMap) { const safeMoves = this.getPossibleMoves().filter(move => !dangerMap.has(`${move.col},${move.row}`)); if (safeMoves.length > 0) { this.moveTowards(safeMoves[0].col, safeMoves[0].row); } }
    wanderAndAct() { if (this.canPlaceBomb && Math.random() < 0.01) { const { col, row } = this.currentTile; const potentialDangerZone = calculateExplosionTiles(col, row, 2); const safeEscapeMoves = this.getPossibleMoves().filter(move => !potentialDangerZone.has(`${move.col},${move.row}`)); if (safeEscapeMoves.length > 0) { this.placeBomb(); this.moveTowards(safeEscapeMoves[0].col, safeEscapeMoves[0].row); return; } } this.moveTimer--; if (this.moveTimer <= 0) { const possibleMoves = this.getPossibleMoves(); this.direction = possibleMoves.length > 0 ? possibleMoves[Math.floor(Math.random() * possibleMoves.length)].dir : { x: 0, y: 0 }; this.moveTimer = Math.random() * 60 + 30; } const nextX = this.x + this.direction.x * this.speed; const nextY = this.y + this.direction.y * this.speed; if (this.canMove(nextX, nextY)) { this.x = nextX; this.y = nextY; } else { this.moveTimer = 0; } }
    moveTowards(targetCol, targetRow) { const targetX = targetCol * TILE_SIZE + (TILE_SIZE - this.width) / 2; const targetY = targetRow * TILE_SIZE + (TILE_SIZE - this.height) / 2; const dirX = Math.sign(targetX - this.x); const dirY = Math.sign(targetY - this.y); if (dirX !== 0 && this.canMove(this.x + dirX * this.speed, this.y)) { this.x += dirX * this.speed; } else if (dirY !== 0 && this.canMove(this.x, this.y + dirY * this.speed)) { this.y += dirY * this.speed; } }
    getPossibleMoves() { let moves = []; const { col, row } = this.currentTile; const directions = [{ dir: { x: 0, y: -1 }, col: col, row: row - 1 },{ dir: { x: 0, y: 1 }, col: col, row: row + 1 },{ dir: { x: -1, y: 0 }, col: col - 1, row: row },{ dir: { x: 1, y: 0 }, col: col + 1, row: row }]; for (const move of directions) { if (move.col > 0 && move.col < MAP_COLS - 1 && move.row > 0 && move.row < MAP_ROWS - 1 && gameMap[move.row][move.col] === TILE_TYPE.GROUND) { moves.push(move); } } return moves; }
    placeBomb() { if (!this.canPlaceBomb || this.isDying) return; const gridCol = Math.floor((this.x + this.width / 2) / TILE_SIZE); const gridRow = Math.floor((this.y + this.height / 2) / TILE_SIZE); if (bombs.some(b => b.col === gridCol && b.row === gridRow)) return; bombs.push(new Bomb(gridCol, gridRow, 2, this)); this.canPlaceBomb = false; setTimeout(() => { this.canPlaceBomb = true; }, 3500); }
    die() { super.die(); setTimeout(() => { bots = bots.filter(b => b !== this); updateInfoPanel(); if (bots.length === 0 && !isGameOver) { endGame(true); } }, 1000); }
}

class Bomb {
    constructor(col, row, range, owner) { this.col = col; this.row = row; this.range = range; this.owner = owner; this.timer = 3000; this.startTime = Date.now(); }
    draw() { const timePassed = Date.now() - this.startTime; const blink = Math.floor(timePassed / 250) % 2 === 0; const centerX = this.col * TILE_SIZE + TILE_SIZE / 2; const centerY = this.row * TILE_SIZE + TILE_SIZE / 2; ctx.fillStyle = blink ? '#1e293b' : '#475569'; ctx.beginPath(); ctx.arc(centerX, centerY, TILE_SIZE * 0.4, 0, Math.PI * 2); ctx.fill(); const fuseLength = 1 - (timePassed / this.timer); ctx.strokeStyle = '#fef3c7'; ctx.lineWidth = scale(3); ctx.beginPath(); ctx.moveTo(centerX, centerY - TILE_SIZE * 0.3); ctx.lineTo(centerX, centerY - TILE_SIZE * (0.3 + fuseLength * 0.2)); ctx.stroke(); }
    update(deltaTime) { this.timer -= deltaTime; if (this.timer <= 0) { this.explode(); } }
    explode() { if (!bombs.includes(this)) return; explosions.push(new Explosion(this.col, this.row, this.range)); bombs = bombs.filter(b => b !== this); }
}

class Explosion {
    constructor(col, row, range) { this.duration = 400; this.tiles = this.processExplosion(calculateExplosionTiles(col, row, range)); }
    processExplosion(tileKeys) { return Array.from(tileKeys).map(key => { const [col, row] = key.split(',').map(Number); if(gameMap[row][col] === TILE_TYPE.SOFT_WALL) { gameMap[row][col] = TILE_TYPE.GROUND; if(Math.random() < 0.4) { spawnPowerUp(col, row); } } return { col, row }; }); }
    draw() { this.tiles.forEach(tile => { const timeRatio = this.duration / 400; const color = timeRatio > 0.5 ? '#fef08a' : '#f97316'; ctx.fillStyle = color; ctx.globalAlpha = timeRatio; ctx.fillRect(tile.col * TILE_SIZE, tile.row * TILE_SIZE, TILE_SIZE, TILE_SIZE); ctx.globalAlpha = 1.0; }); }
    update(deltaTime) { this.duration -= deltaTime; if (this.duration <= 0) { explosions = explosions.filter(e => e !== this); } }
    checkCollision(entity) { if (entity.isDying) return false; return this.tiles.some(tile => { const tileBox = { x: tile.col * TILE_SIZE, y: tile.row * TILE_SIZE, width: TILE_SIZE, height: TILE_SIZE }; return isBoxColliding(entity, tileBox); }); }
}

class PowerUp {
    constructor(col, row, type) { this.col = col; this.row = row; this.type = type; this.size = TILE_SIZE * 0.8; this.x = col * TILE_SIZE + (TILE_SIZE - this.size) / 2; this.y = row * TILE_SIZE + (TILE_SIZE - this.size) / 2; this.width=this.size; this.height=this.size;}
    draw() { const colors = { [POWERUP_TYPE.BOMB]: '#60a5fa', [POWERUP_TYPE.FIRE]: '#f87171', [POWERUP_TYPE.SPEED]: '#4ade80' }; ctx.fillStyle = '#1e293b'; ctx.beginPath(); ctx.arc(this.x + this.size/2, this.y + this.size/2, this.size/2, 0, Math.PI*2); ctx.fill(); ctx.fillStyle = colors[this.type]; ctx.font = `${this.size * 0.6}px "Press Start 2P"`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; const text = { [POWERUP_TYPE.BOMB]: 'B', [POWERUP_TYPE.FIRE]: 'F', [POWERUP_TYPE.SPEED]: 'S' }[this.type]; ctx.fillText(text, this.x + this.size/2, this.y + this.size/2 + scale(2)); }
    apply(player) { if (this.type === POWERUP_TYPE.BOMB) player.maxBombs++; if (this.type === POWERUP_TYPE.FIRE) player.bombRange++; if (this.type === POWERUP_TYPE.SPEED) { player.baseSpeed = Math.min(player.baseSpeed + 0.5, 4); } updateInfoPanel(); }
}

function spawnPowerUp(col, row) { const types = Object.values(POWERUP_TYPE); const type = types[Math.floor(Math.random() * types.length)]; powerUps.push(new PowerUp(col, row, type));}
function generateMap() { gameMap = Array.from({ length: MAP_ROWS }, (_, r) => Array.from({ length: MAP_COLS }, (_, c) => { if (r === 0 || r === MAP_ROWS - 1 || c === 0 || c === MAP_COLS - 1 || (r % 2 === 0 && c % 2 === 0)) return TILE_TYPE.HARD_WALL; if ((r <= 2 && c <= 2) || (r >= MAP_ROWS - 3 && c >= MAP_COLS - 3) || (r <= 2 && c >= MAP_COLS - 3) || (r >= MAP_ROWS - 3 && c <= 2)) return TILE_TYPE.GROUND; return Math.random() > 0.3 ? TILE_TYPE.SOFT_WALL : TILE_TYPE.GROUND; })); }
function drawMap() { for (let r = 0; r < MAP_ROWS; r++) { for (let c = 0; c < MAP_COLS; c++) { const x = c * TILE_SIZE; const y = r * TILE_SIZE; ctx.fillStyle = '#4a752c'; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE); if (gameMap[r][c] === TILE_TYPE.HARD_WALL) { ctx.fillStyle = '#78716c'; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE); ctx.fillStyle = '#a8a29e'; ctx.fillRect(x + scale(2), y + scale(2), TILE_SIZE - scale(4), TILE_SIZE - scale(4)); } else if (gameMap[r][c] === TILE_TYPE.SOFT_WALL) { ctx.fillStyle = '#a16207'; ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE); ctx.fillStyle = '#facc15'; ctx.fillRect(x + scale(2), y + scale(2), TILE_SIZE - scale(4), TILE_SIZE - scale(4)); } } } }

function resizeCanvas() {
    const wrapper = document.querySelector('.canvas-wrapper');
    const newSize = Math.min(wrapper.clientWidth, wrapper.clientHeight / (MAP_ROWS / MAP_COLS));
    canvas.style.width = `${newSize}px`;
    canvas.style.height = `${newSize * (MAP_ROWS / MAP_COLS)}px`;

    TILE_SIZE = newSize / MAP_COLS;
}

function init() { isGameOver = false; resizeCanvas(); generateMap(); powerUps = []; player = new Player(TILE_SIZE * 1.1, TILE_SIZE * 1.1); bombs = []; explosions = []; bots = [new Bot(TILE_SIZE * (MAP_COLS - 2.1), TILE_SIZE * 1.1), new Bot(TILE_SIZE * 1.1, TILE_SIZE * (MAP_ROWS - 2.1)), new Bot(TILE_SIZE * (MAP_COLS - 2.1), TILE_SIZE * (MAP_ROWS - 2.1)),]; keys = {}; updateInfoPanel(); gameOverScreen.classList.add('hidden'); gameLoop(); }
function update(deltaTime) { if (isGameOver) return; const dangerMap = new Set(); bombs.forEach(bomb => { calculateExplosionTiles(bomb.col, bomb.row, bomb.range).forEach(tileKey => dangerMap.add(tileKey)); }); player.update(); bots.forEach(bot => bot.update(dangerMap)); bombs.forEach(bomb => bomb.update(deltaTime)); explosions.forEach(exp => exp.update(deltaTime)); explosions.forEach(exp => { if (exp.checkCollision(player)) player.die(); bots.forEach(bot => { if (exp.checkCollision(bot)) bot.die(); }); }); player.speed = scale(player.baseSpeed); bots.forEach(b => b.speed = scale(b.baseSpeed)); }
function draw() { if (isGameOver) return; ctx.clearRect(0, 0, canvas.width, canvas.height); drawMap(); powerUps.forEach(p => p.draw()); bombs.forEach(b => b.draw()); explosions.forEach(e => e.draw()); player.draw(); bots.forEach(b => b.draw()); }

let lastTime = 0;
function gameLoop(timestamp = 0) { if (isGameOver) return; const deltaTime = timestamp - lastTime; lastTime = timestamp; update(deltaTime); draw(); requestAnimationFrame(gameLoop); }

function updateInfoPanel() { if (!player) return; livesDisplay.textContent = player.lives; bombsDisplay.textContent = player.maxBombs; rangeDisplay.textContent = player.bombRange; speedDisplay.textContent = player.baseSpeed.toFixed(1); messageDisplay.textContent = `Bots Remaining: ${bots.length}`; }
function endGame(playerWon) { if (isGameOver) return; isGameOver = true; gameOverMessage.textContent = playerWon ? "VICTORY!" : "DEFEAT!"; gameOverMessage.style.color = playerWon ? '#84cc16' : '#dc2626'; gameOverScreen.classList.remove('hidden'); }

// --- Event Listeners ---
window.addEventListener('keydown', (e) => { if (!isGameOver) keys[e.key] = true; if (e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); player.placeBomb(); } });
window.addEventListener('keyup', (e) => { keys[e.key] = false; });
restartButton.addEventListener('click', init);
window.addEventListener('resize', resizeCanvas);

// --- Mobile Controls ---
function setupMobileControls() {
    const controls = {
        'dpad-up': 'ArrowUp',
        'dpad-down': 'ArrowDown',
        'dpad-left': 'ArrowLeft',
        'dpad-right': 'ArrowRight'
    };
    for (const [id, key] of Object.entries(controls)) {
        const btn = document.getElementById(id);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); if(!isGameOver) keys[key] = true; }, { passive: false });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); keys[key] = false; }, { passive: false });
    }
    const bombBtn = document.getElementById('bomb-btn');
    bombBtn.addEventListener('touchstart', (e) => { e.preventDefault(); if(!isGameOver) player.placeBomb(); }, { passive: false });
}

init();
setupMobileControls();

