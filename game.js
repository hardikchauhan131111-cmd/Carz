import DataManager from './data.js';
import Physics from './physics.js';
import Renderer from './renderer.js';
import audioManager from './audio-manager.js';

const Game = {
    state: 'MENU',
    car: null,
    terrainPoints: [],
    lastX: 0,
    coins: 0,
    distance: 0,
    fuel: 100,
    cameraX: 0,
    keys: {},
    items: [],
    selectedVehicle: 'car',
    selectedWorld: 'mountain',
    level: 1,
    level: 1,
    lastLevel: 1,
    airTime: 0,
    isGrounded: true,
    lastAirBonusTime: 0,
    jumpsRemaining: 2,
    jumpsRemaining: 2,
    canUseAbility: true, // Jump or Fly anytime
    boostTimer: 0, // Frames of boost remaining

    async init() {
        Physics.init();
        const user = await DataManager.init(); // Wait for sync!
        this.data = DataManager.getGameData();

        // Ensure minimum jumps and boost for fun
        if (!this.data.abilities) this.data.abilities = { jump: 2, boost: 1 };
        if (!this.data.abilities.jump || this.data.abilities.jump < 2) this.data.abilities.jump = 2;
        if (this.data.abilities.boost === undefined) this.data.abilities.boost = 1;

        DataManager.save('abilities', this.data.abilities);

        // Prioritize cloud selections
        this.selectedWorld = this.data.selectedWorld || 'mountain';
        this.selectedVehicle = this.data.selectedVehicle || 'car';

        await Renderer.init('gameCanvas', this.selectedWorld);
        this.setupEventListeners();

        // Ability Button
        this.abilityBtn = document.getElementById('ability-btn');
        if (this.abilityBtn) {
            const trigger = (e) => {
                e.preventDefault();
                e.stopPropagation();
                this.triggerAbility();
            };
            this.abilityBtn.addEventListener('mousedown', trigger);
            this.abilityBtn.addEventListener('touchstart', trigger);
        }

        // Boost Button
        const boostBtn = document.getElementById('boost-btn');
        if (boostBtn) {
            const startBoost = (e) => { e.preventDefault(); this.isBoostingTouch = true; };
            const endBoost = (e) => { e.preventDefault(); this.isBoostingTouch = false; };

            boostBtn.addEventListener('mousedown', startBoost);
            boostBtn.addEventListener('mouseup', endBoost);
            boostBtn.addEventListener('mouseleave', endBoost);
            boostBtn.addEventListener('touchstart', startBoost, { passive: false });
            boostBtn.addEventListener('touchend', endBoost, { passive: false });
        }

        this.setupCollisionHandlers();
        this.updateUI();
        this.showWorldHeader();
        this.startRace();
        this.loop();
    },

    showWorldHeader() {
        const header = document.createElement('div');
        header.style.position = 'fixed';
        header.style.top = '15%';
        header.style.left = '50%';
        header.style.transform = 'translate(-50%, -50%)';
        header.style.color = '#ff8c42';
        header.style.fontSize = '4rem';
        header.style.fontWeight = 'bold';
        header.style.textTransform = 'uppercase';
        header.style.letterSpacing = '10px';
        header.style.textShadow = '0 0 20px rgba(255, 140, 66, 0.5)';
        header.style.fontFamily = 'Outfit, sans-serif';
        header.style.zIndex = '1000';
        header.style.pointerEvents = 'none';
        header.style.animation = 'fadeOut 3s forwards';
        header.innerText = this.selectedWorld;
        document.body.appendChild(header);

        // Add keyframe if not exists
        if (!document.getElementById('game-animations')) {
            const style = document.createElement('style');
            style.id = 'game-animations';
            style.innerHTML = `
                @keyframes fadeOut {
                    0% { opacity: 0; transform: translate(-50%, -60%); }
                    20% { opacity: 1; transform: translate(-50%, -50%); }
                    80% { opacity: 1; transform: translate(-50%, -50%); }
                    100% { opacity: 0; transform: translate(-50%, -40%); }
                }
            `;
            document.head.appendChild(style);
        }
    },

    setupEventListeners() {
        window.addEventListener('keydown', e => this.keys[e.code] = true);
        window.addEventListener('keyup', e => this.keys[e.code] = false);
    },

    setupCollisionHandlers() {
        // Ground detection for Air Time
        Matter.Events.on(Physics.engine, 'collisionStart', event => {
            const pairs = event.pairs;
            pairs.forEach(pair => {
                const labels = [pair.bodyA.label, pair.bodyB.label];

                // Check for ground contact
                if ((labels.includes('wheel') || labels.includes('car_body')) && labels.includes('terrain')) {
                    if (!this.isGrounded) {
                        // Landed! Check for bonus
                        if (this.airTime > 1200) { // > 1.2 seconds air time
                            this.giveAirBonus(this.airTime);
                        }
                    }
                    this.isGrounded = true;
                    this.airTime = 0;
                }

                if (labels.includes('car_body') || labels.includes('wheel')) {
                    const otherBody = pair.bodyA.label === 'car_body' || pair.bodyA.label === 'wheel' ? pair.bodyB : pair.bodyA;
                    if (otherBody.label === 'coin') this.collectCoin(otherBody);
                    else if (otherBody.label === 'fuel') this.collectFuel(otherBody);
                    else if (otherBody.label === 'nitro') this.collectNitro(otherBody);
                }
                // Driver Crash Detection
                if (labels.includes('driver_head') && labels.includes('terrain')) {
                    this.gameOver('CRASHED');
                }
            });
        });

        Matter.Events.on(Physics.engine, 'collisionEnd', event => {
            const pairs = event.pairs;
            // Simple heuristic: if no wheel touching terrain, we are in air
            // This is imperfect but good enough for simple 2D car games
            // Better: track contact count
        });
    },

    giveAirBonus(duration) {
        const bonus = Math.floor(duration / 100) * 5; // 5 coins per 0.1s
        if (bonus > 0 && Date.now() - this.lastAirBonusTime > 1000) {
            this.coins += bonus;
            this.showGenericNotification(`AIR TIME! +${bonus}🪙`);
            this.lastAirBonusTime = Date.now();
        }
    },

    collectCoin(body) {
        this.coins += 10;
        Matter.World.remove(Physics.world, body);
        this.items = this.items.filter(i => i !== body);
    },

    collectFuel(body) {
        this.fuel = 100; // Tank Full!
        Matter.World.remove(Physics.world, body);
        this.items = this.items.filter(i => i !== body);
    },

    startRace() {
        this.state = 'PLAYING';
        this.coins = 0;
        this.distance = 0;
        this.fuel = 100;
        this.terrainPoints = [];
        this.items = [];
        this.lastX = 0;
        this.level = 1;
        this.lastLevel = 1;
        this.jumpsRemaining = 2;

        const worldConfigs = {
            mountain: { gravity: 1.4, roughness: 90, hilliness: 0.02, fuelDrain: 0.04, sky: '#b3e5fc' },
            desert: { gravity: 1.25, roughness: 40, hilliness: 0.01, fuelDrain: 0.06, sky: '#ffe0b2' },
            snow: { gravity: 1.35, roughness: 70, hilliness: 0.018, fuelDrain: 0.05, sky: '#f5f5f5' },
            moon: { gravity: 0.35, roughness: 110, hilliness: 0.035, fuelDrain: 0.03, sky: '#0a0a0d' },
            mars: { gravity: 0.7, roughness: 80, hilliness: 0.025, fuelDrain: 0.045, sky: '#2d1a0a' },
            volcano: { gravity: 1.6, roughness: 130, hilliness: 0.04, fuelDrain: 0.07, sky: '#4a1100' },
            jungle: { gravity: 1.3, roughness: 100, hilliness: 0.02, fuelDrain: 0.05, sky: '#1b5e20' },
            ocean: { gravity: 1.1, roughness: 60, hilliness: 0.015, fuelDrain: 0.08, sky: '#01579b' },
            cyber: { gravity: 1.4, roughness: 40, hilliness: 0.01, fuelDrain: 0.04, sky: '#1a0033' },
            cavern: { gravity: 1.5, roughness: 150, hilliness: 0.05, fuelDrain: 0.05, sky: '#212121' },
            void: { gravity: 0.1, roughness: 200, hilliness: 0.08, fuelDrain: 0.02, sky: '#000000' },
            titan: { gravity: 0.5, roughness: 90, hilliness: 0.03, fuelDrain: 0.04, sky: '#002f6c' },
            inferno: { gravity: 2.0, roughness: 180, hilliness: 0.06, fuelDrain: 0.1, sky: '#bf360c' },
            dream: { gravity: 0.8, roughness: 120, hilliness: 0.04, fuelDrain: 0.03, sky: '#4a148c' },
            godzilla: { gravity: 1.8, roughness: 250, hilliness: 0.1, fuelDrain: 0.15, sky: '#1a1a1a' }
        };
        this.worldConfig = worldConfigs[this.selectedWorld] || worldConfigs.mountain;

        Matter.World.clear(Physics.world);
        Physics.setGravity(this.worldConfig.gravity);
        this.car = Physics.createVehicle(200, 300, this.selectedVehicle);

        // Reset Air Time
        this.airTime = 0;
        this.isGrounded = true;

        // Improved Collision Detection for Air Time
        Matter.Events.on(Physics.engine, 'collisionActive', event => {
            const pairs = event.pairs;
            let onGround = false;
            pairs.forEach(pair => {
                const labels = [pair.bodyA.label, pair.bodyB.label];
                if ((labels.includes('wheel') || labels.includes('car_body')) && labels.includes('terrain')) {
                    onGround = true;
                }
            });
            this.isGrounded = onGround;
        });

        // Apply Upgrades
        const upgrades = DataManager.getVehicleUpgrades(this.selectedVehicle);
        // Scale engine power (Acceleration) by 10% per level
        this.car.powerLevel = 1.0 + (upgrades.engine - 1) * 0.1;
        // Scale suspension (we can adjust stiffness in physics or damping)
        // For now, let's keep it simple and just apply powerLevel to movement

        this.generateTerrain(0, 3000);
        Renderer.canvas.style.background = this.worldConfig.sky || '#fff3e0';
    },

    generateTerrain(start, end) {
        let x = start;
        const step = 80;
        if (this.terrainPoints.length === 0) {
            this.terrainPoints.push({ x: 0, y: 550 });
            x += step;
        }

        const mode = this.worldConfig;

        while (x < end) {
            const prev = this.terrainPoints[this.terrainPoints.length - 1];
            const y = prev.y + Math.sin(x * mode.hilliness) * 20 + (Math.random() - 0.5) * mode.roughness;
            const constrainedY = Math.max(350, Math.min(650, y));
            const newPoint = { x: x, y: constrainedY };

            // Craters for Space Worlds (Only Level 3+)
            const isSpace = ['moon', 'mars', 'titan', 'void', 'ufo', 'alien'].includes(this.selectedWorld);
            if (isSpace && this.level > 2 && Math.random() < 0.05) { // 5% chance, only after level 2
                // Creates a gap or deep dip
                Physics.createTerrainSegment(prev, { x: x + 10, y: 1200 }); // Down
                this.terrainPoints.push({ x: x + 10, y: 1200 }); // Visual point
                Physics.createTerrainSegment({ x: x + 10, y: 1200 }, { x: x + 250, y: 1200 }); // Bottom (Wider)
                this.terrainPoints.push({ x: x + 250, y: 1200 });
                // Next iteration will connect back up naturally or we force it up?
                // Let's force next point to be high to close the crater
                const exitY = prev.y;
                this.terrainPoints.push({ x: x + 260, y: exitY });
                Physics.createTerrainSegment({ x: x + 250, y: 1200 }, { x: x + 260, y: exitY });
                x += 160;
                continue;
            }

            this.terrainPoints.push(newPoint);
            Physics.createTerrainSegment(prev, newPoint);

            // Improved item spawning (More frequent fuel)
            if (Math.random() < 0.18) { // Increased total spawn chance
                const rand = Math.random();
                let type = 'coin';
                if (rand < 0.3) type = 'fuel';
                else if (rand < 0.35) type = 'nitro'; // 5% chance for Nitro

                const body = Physics.spawnItem(x, constrainedY - 60, type);
                this.items.push(body);
            }
            x += step;
        }
        this.lastX = x;
    },

    collectNitro(body) {
        if (!this.data.abilities) this.data.abilities = { jump: 2, boost: 1 };
        if (!this.data.abilities.boost) this.data.abilities.boost = 0;

        this.data.abilities.boost++;
        DataManager.save('abilities', this.data.abilities);

        this.showGenericNotification("NITRO FOUND! +1 ⚡");
        audioManager.playTone(800, 'square', 0.1);

        Matter.World.remove(Physics.world, body);
        this.items = this.items.filter(i => i !== body);
    },

    update() {
        if (this.state !== 'PLAYING') return;

        Matter.Engine.update(Physics.engine, 1000 / 60);

        // Audio Engine
        if (this.car && this.car.body) {
            audioManager.updateEngine(this.car.body.speed);
        }

        // Constant fuel depletion
        this.fuel -= this.worldConfig.fuelDrain;

        // Upgraded acceleration feel (Wheelies!)
        const powerLevel = (this.data.upgrades.engine || 1) * 0.15 + 0.6; // Increased base and scaling
        const wheelPower = powerLevel * 2.0; // Doubled multiplier for speed
        const tiltTorque = 0.005;

        if (this.keys['KeyD'] || this.keys['ArrowRight']) {
            if (this.fuel > 0) {
                Matter.Body.setAngularVelocity(this.car.wheelBack, wheelPower * 1.5);
                Matter.Body.setAngularVelocity(this.car.wheelFront, wheelPower);
                // Apply lifting torque for wheelie feel
                Matter.Body.applyForce(this.car.body, this.car.body.position, { x: 0, y: -0.001 });
                Matter.Body.setAngularVelocity(this.car.body, Matter.Body.getAngularVelocity(this.car.body) + 0.002);
                this.fuel -= 0.04; // Lowered depletion just a bit
            }
        }
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) {
            Matter.Body.setAngularVelocity(this.car.wheelBack, -wheelPower);
            Matter.Body.setAngularVelocity(this.car.wheelFront, -wheelPower);
            Matter.Body.setAngularVelocity(this.car.body, Matter.Body.getAngularVelocity(this.car.body) - 0.002);
            this.fuel -= 0.03;
        }



        // BOOST MECHANIC (Nitro)
        const isBoostingInput = this.keys['ArrowDown'] || this.isBoostingTouch;

        // Activate Boost if input detected, not currently boosting, and have stock
        if (isBoostingInput && this.boostTimer <= 0) {
            const abs = this.data.abilities || {};
            if (abs.boost > 0) {
                // Consume 1 Tank
                abs.boost--;
                this.data.abilities = abs;
                DataManager.save('abilities', abs);

                // Start 2-second boost
                this.boostTimer = 120;
                this.showGenericNotification(`NITRO! (${abs.boost} LEFT)`);
                audioManager.playTone(600, 'sawtooth', 0.2);
            } else {
                if (!this.lastLockedTime || Date.now() - this.lastLockedTime > 1000) {
                    this.showGenericNotification("NO NITRO TANKS!");
                    this.lastLockedTime = Date.now();
                }
            }
        }

        // Apply Boost Force if Active
        if (this.boostTimer > 0) {
            this.boostTimer--;

            // Stronger Forward Force
            Matter.Body.applyForce(this.car.body, this.car.body.position, {
                x: 0.003 * this.car.body.mass,
                y: 0
            });

            // Torque for stability
            Matter.Body.setAngularVelocity(this.car.wheelBack, wheelPower * 1.5);
            Matter.Body.setAngularVelocity(this.car.wheelFront, wheelPower * 1.5);

            // Visual feedback
            if (this.boostTimer % 5 === 0) this.createParticle(this.car.body.position.x - 40, this.car.body.position.y, 'orange');
        }

        // Air Time logic
        let currentlyTouching = false;

        // Manual check for "Air Control" effectiveness
        const airControlMult = this.selectedVehicle === 'luna' ? 3.0 : 1.0;

        // Mid-air Rotation (Turn)
        if (this.keys['KeyQ']) Matter.Body.setAngularVelocity(this.car.body, -0.05 * airControlMult);
        if (this.keys['KeyE']) Matter.Body.setAngularVelocity(this.car.body, 0.05 * airControlMult);

        if (!this.isGrounded) {
            this.airTime += 1000 / 60;
        }

        if (this.car.body.position.x > this.lastX - 2500) {
            this.generateTerrain(this.lastX, this.lastX + 2500);
        }

        this.distance = Math.floor(Math.max(this.distance, this.car.body.position.x / 20 - 10));
        this.cameraX = this.car.body.position.x - Renderer.canvas.width / 3;

        // Dynamic Leveling
        this.level = Math.floor(this.distance / 500) + 1;
        if (this.level > this.lastLevel) {
            this.handleLevelUp();
        }

        // Obstacle Detection & Ability Activation
        this.detectObstacle();

        // Handle Boost (2-second flight)
        if (this.boostTimer > 0) {
            this.boostTimer--;
            const mass = this.car.body.mass;
            // Tuned sustained force: 
            // Gravity is ~0.0012 * mass per frame.
            // We want to lift slightly faster than gravity.
            Matter.Body.applyForce(this.car.body, this.car.body.position, {
                x: 0.0005 * mass,
                y: -0.0018 * mass
            });

            // Limit Velocity during boost to prevent "Level 80" teleport
            const maxUp = -8;
            const maxFwd = 15;
            if (this.car.body.velocity.y < maxUp) Matter.Body.setVelocity(this.car.body, { x: this.car.body.velocity.x, y: maxUp });
            if (this.car.body.velocity.x > maxFwd) Matter.Body.setVelocity(this.car.body, { x: maxFwd, y: this.car.body.velocity.y });

            // Visual feedback (optional: particles)
            if (this.boostTimer % 10 === 0) {
                // Maybe create a trail later?
            }
        }

        // Ability Input (Jump / Fly)
        const abilities = this.data.abilities || { jump: 0, fly: false };

        // Update Button UI
        if (this.abilityBtn) {
            if (abilities.fly) {
                this.abilityBtn.style.display = 'flex';
                this.abilityBtn.querySelector('#ability-icon').innerText = '🛸';
                this.abilityBtn.querySelector('#ability-count').innerText = 'Fly';
            } else if (abilities.jump > 0) {
                this.abilityBtn.style.display = 'flex';
                this.abilityBtn.querySelector('#ability-icon').innerText = '🚀';
                this.abilityBtn.querySelector('#ability-count').innerText = abilities.jump;
            } else {
                this.abilityBtn.style.display = 'none';
            }
        }

        if (this.keys['ArrowUp']) {
            this.triggerAbility();
        }

        if (this.car.body.position.y > 1200) this.gameOver('FELL INTO VOID');
        if (this.fuel <= 0 && Math.abs(this.car.body.velocity.x) < 0.1) this.gameOver('OUT OF FUEL');
        this.updateUI();
    },

    triggerAbility() {
        // if (!this.canUseAbility) return; // Unrestricted now

        const abilities = this.data.abilities || { jump: 0, fly: false };

        if (this.selectedVehicle === 'luna') {
            // FLY Ability
            if (abilities.fly) {
                Matter.Body.applyForce(this.car.body, this.car.body.position, { x: 0.003, y: -0.005 });
                this.fuel -= 0.15;
            } else {
                this.showGenericNotification("ABILITY LOCKED!");
            }
        } else {
            // JUMP Ability (Consumable) - Removed isGrounded check
            if (abilities.jump > 0) {
                if (!this.lastJumpTime || Date.now() - this.lastJumpTime > 500) {
                    // Start 2-second boost (approx 120 frames at 60fps)
                    this.boostTimer = 120;

                    // Initial small liftoff kick
                    Matter.Body.applyForce(this.car.body, this.car.body.position, { x: 0.01 * this.car.body.mass, y: -0.05 * this.car.body.mass });

                    // CONSUME STOCK
                    abilities.jump--;
                    this.data.abilities.jump = abilities.jump; // Sync
                    DataManager.save('abilities', this.data.abilities); // Force Cloud Save

                    this.lastJumpTime = Date.now();
                    this.showGenericNotification(`JUMP USED! (${abilities.jump} LEFT)`);
                    audioManager.playTone(400, 'sine', 0.1);
                }
            } else {
                if (!this.lastLockedTime || Date.now() - this.lastLockedTime > 1000) {
                    this.showGenericNotification("OUT OF JUMPS!");
                    this.lastLockedTime = Date.now();
                }
            }
        }
    },

    detectObstacle() {
        const btn = document.getElementById('ability-btn');
        const abs = this.data.abilities || { jump: 0, fly: false };

        if (btn) {
            const icon = btn.querySelector('#ability-icon');
            const count = btn.querySelector('#ability-count');

            if (this.selectedVehicle === 'luna') {
                if (abs.fly) {
                    btn.style.display = 'flex';
                    icon.innerText = '🛸';
                    count.innerText = 'FLY';
                    btn.disabled = false;
                } else {
                    btn.style.display = 'none';
                }
            } else {
                if (abs.jump > 0) {
                    btn.style.display = 'flex';
                    btn.innerHTML = `<span id="ability-icon">🚀</span><span id="ability-count">JUMP (${abs.jump})</span>`;
                    btn.disabled = false;
                } else {
                    btn.style.display = 'flex';
                    const jumpCount = abs.jump || 0;
                    btn.innerHTML = `<span id="ability-icon">🚀</span><span id="ability-count">JUMP (${jumpCount})</span>`;
                    btn.disabled = true;
                }
            }
        }

        const boostBtn = document.getElementById('boost-btn');
        if (boostBtn) {
            const boostCount = abs.boost || 0;
            boostBtn.innerHTML = `<span class="icon">⚡</span><span>BOOST (${boostCount})</span>`;
            if (boostCount > 0) {
                boostBtn.classList.remove('disabled');
                boostBtn.style.opacity = '1';
            } else {
                boostBtn.classList.add('disabled');
                boostBtn.style.opacity = '0.5';
            }
        }
    },




    handleLevelUp() {
        this.lastLevel = this.level;
        this.showGenericNotification(`LEVEL ${this.level}`);

        // Scale difficulty
        Physics.setGravity(this.worldConfig.gravity + (this.level - 1) * 0.1);
        this.worldConfig.roughness += 5;
        this.worldConfig.fuelDrain += 0.005;
        this.jumpsRemaining = 2; // Reset jumps
    },

    showGenericNotification(text) {
        const header = document.createElement('div');
        header.style.position = 'fixed';
        header.style.top = '30%';
        header.style.left = '50%';
        header.style.transform = 'translate(-50%, -50%)';
        header.style.color = '#ff8c42';
        header.style.fontSize = '3rem';
        header.style.fontWeight = 'bold';
        header.style.textTransform = 'uppercase';
        header.style.letterSpacing = '5px';
        header.style.fontFamily = 'Outfit, sans-serif';
        header.style.zIndex = '1000';
        header.style.pointerEvents = 'none';
        header.style.animation = 'fadeOut 2s forwards';
        header.innerText = text;
        document.body.appendChild(header);
    },

    updateUI() {
        const coinEl = document.getElementById('coin-count');
        const distEl = document.getElementById('distanceCount');
        const fuelEl = document.getElementById('fuel-fill');

        if (coinEl) coinEl.innerText = this.coins + (this.data.coins || 0);
        if (distEl) distEl.innerText = this.distance + 'm';
        if (fuelEl) fuelEl.style.width = Math.max(0, this.fuel) + '%';
    },

    gameOver(reason = 'GAME OVER') {
        this.state = 'GAMEOVER';
        DataManager.saveGameProgress(this.coins, this.distance);
        this.data = DataManager.getGameData(); // Refresh coins
        document.getElementById('hud').classList.add('hidden');
        document.getElementById('gameover-screen').classList.remove('hidden');
        document.getElementById('out-reason').innerText = reason;
        document.getElementById('final-distance').innerText = this.distance + 'm';
        document.getElementById('final-coins').innerText = this.coins;
    },

    draw() {
        Renderer.clear();
        if (this.state === 'PLAYING' || this.state === 'GAMEOVER') {
            Renderer.drawParallax(this.selectedWorld, this.cameraX);
            Renderer.drawTerrain(this.terrainPoints, this.cameraX, this.selectedWorld);
            this.items.forEach(item => {
                Renderer.drawSprite(item.label, item.position.x, item.position.y, 0, 30, 30, this.cameraX);
            });
            // Draw Wheels (First, so they are behind body)
            Renderer.drawSprite('wheel', this.car.wheelBack.position.x, this.car.wheelBack.position.y, this.car.wheelBack.angle, 40, 40, this.cameraX);
            Renderer.drawSprite('wheel', this.car.wheelFront.position.x, this.car.wheelFront.position.y, this.car.wheelFront.angle, 40, 40, this.cameraX);

            // Draw Driver (Behind body window?) - Actually driver usually sits in middle, body covers bottom. 
            // Let's draw Driver then Body so Body covers driver's legs.
            const headPos = this.car.head.position;
            Renderer.drawSprite('driver', headPos.x, headPos.y, this.car.head.angle, 30, 40, this.cameraX);

            // Draw Car Body (Last, on top)
            const bodyPos = this.car.body.position;
            const sprite = `${this.selectedVehicle}_body`;
            Renderer.drawSprite(sprite, bodyPos.x, bodyPos.y, this.car.body.angle, 120, 60, this.cameraX);
        }
    },

    loop() {
        this.update();
        this.draw();
        requestAnimationFrame(() => this.loop());
    },
    createParticle(x, y, color) {
        // Simple visual log for now to avoid DOM flooding
        // console.log("Nitro Particle", x, y);
    }
};

export default Game;
