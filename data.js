import { auth, db } from './firebase-config.js';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, collection, query, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const DataManager = {
    user: null,
    cloudData: null,

    async init() {
        // Simulation of Project Jan: Use sessionStorage instead of Firebase Auth SDK state
        const sessionUser = sessionStorage.getItem('loggedInUser');
        if (sessionUser) {
            this.user = JSON.parse(sessionUser);
            await this.syncWithCloud();
            this.migrateUpgrades();

            await this.syncWithCloud();
            this.migrateUpgrades();

            // Ensure abilities schema (Load from local first!)
            let savedAbilities = this.loadLocal('abilities', null);

            if (!savedAbilities) {
                // No data found, set default
                savedAbilities = { jump: 0, fly: false };
            } else {
                // Data exists, check for migration (bool -> int)
                if (typeof savedAbilities.jump === 'boolean') {
                    savedAbilities.jump = 0; // Migrate
                }
            }

            // Save the validated/migrated data back
            this.saveLocal('abilities', savedAbilities);
            // Also update this.user.abilities to keep it in sync (optional but good practice if used elsewhere)
            if (this.user) this.user.abilities = savedAbilities;

            this.validateAchievements();
        }
        return this.user;
    },

    migrateUpgrades() {
        const data = this.getGameData();
        // If upgrades is the old flat format, migrate it to the current vehicle
        if (data.upgrades && typeof data.upgrades.engine === 'number') {
            const oldUpgrades = { engine: data.upgrades.engine, suspension: data.upgrades.suspension, tires: data.upgrades.tires };
            const vehicle = data.selectedVehicle || 'car';
            const newUpgrades = { [vehicle]: oldUpgrades };

            // Save locally and to cloud (force replace the upgrades key)
            this.save('upgrades', newUpgrades);
            console.log("Migrated legacy global upgrades to vehicle:", vehicle);
        }
    },

    validateAchievements() {
        // Fix for "Collector" achievement being incorrectly unlocked
        const data = this.getGameData();
        let changed = false;

        if (data.achievements.allVehicles && data.unlockedVehicles.length < 14) {
            data.achievements.allVehicles = false;
            changed = true;
            console.log("Fixed incorrect COLLECTOR achievement state.");
        }

        if (changed) {
            this.save('achievements', data.achievements);
        }
    },

    async syncWithCloud() {
        if (!this.user || !this.user.userId) return;
        const userDoc = doc(db, "players", this.user.userId);
        const snap = await getDoc(userDoc);
        if (snap.exists()) {
            this.cloudData = snap.data();
            if (this.cloudData.selectedVehicle) this.saveLocal('selectedVehicle', this.cloudData.selectedVehicle);
            if (this.cloudData.selectedWorld) this.saveLocal('selectedWorld', this.cloudData.selectedWorld);

            // Also update any other cloud keys to local storage
            Object.keys(this.cloudData).forEach(key => {
                this.saveLocal(key, this.cloudData[key]);
            });
        } else {
            const initialData = this.getGameData();
            await setDoc(userDoc, initialData);
        }
    },

    async getLeaderboard() {
        try {
            const q = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(20));
            const snap = await getDocs(q);
            return snap.docs.map(doc => doc.data());
        } catch (e) {
            console.error("Leaderboard fetch failed", e);
            return [];
        }
    },

    async submitScore(score) {
        if (!this.user || !this.user.userId) return;
        try {
            const leaderDoc = doc(db, "leaderboard", this.user.userId);
            await setDoc(leaderDoc, {
                uid: this.user.userId,
                name: this.user.email.split('@')[0],
                score: score,
                timestamp: Date.now()
            }, { merge: true });
        } catch (e) {
            console.error("Score submission failed", e);
        }
    },

    async resetGameData() {
        const emptyData = {
            coins: 0,
            vehicles: ['car'],
            worlds: ['grass_world'],
            highScore: 0,
            upgrades: { 'car': { engine: 1, suspension: 1, tires: 1 } },
            achievements: {},
            abilities: { jump: 0, fly: false },
            unlockedVehicles: ['car'],
            unlockedWorlds: ['grass_world']
        };

        if (this.user && this.user.userId) {
            try {
                // 1. Reset User Data
                const userRef = doc(db, "players", this.user.userId);
                await setDoc(userRef, {
                    ...emptyData,
                    email: this.user.email,
                    uid: this.user.userId,
                    lastUpdated: Date.now()
                });

                // 2. Remove from Leaderboard
                const leaderRef = doc(db, "leaderboard", this.user.userId);
                await deleteDoc(leaderRef);

                console.log("Cloud data reset confirmed.");
            } catch (e) {
                console.error("Error resetting cloud data:", e);
                // Continue to local wipe even if cloud fails
            }
        }

        // 3. Wipe Local
        localStorage.clear();
        sessionStorage.clear();
        return true;
    },

    saveLocal(key, val) {
        localStorage.setItem(`carz_${key}`, JSON.stringify(val));
    },

    loadLocal(key, defaultVal) {
        const item = localStorage.getItem(`carz_${key}`);
        if (item === null) return defaultVal;
        try {
            return JSON.parse(item);
        } catch (e) {
            return defaultVal;
        }
    },

    save(key, val) {
        this.saveLocal(key, val);
        if (this.user && this.user.userId) {
            try {
                const userDoc = doc(db, "players", this.user.userId);
                const updateData = {
                    [key]: val,
                    lastUpdated: Date.now()
                };
                // Use updateDoc to replace the top-level key entirely, preventing deep-merge loops
                return updateDoc(userDoc, updateData).catch(e => {
                    console.error(`Cloud save failed for key: ${key}`, e);
                });
            } catch (e) {
                console.error("Firebase Doc Ref Error:", e);
            }
        }
        return Promise.resolve();
    },

    getGameData() {
        const selectedVehicle = this.loadLocal('selectedVehicle', 'car');
        return {
            coins: this.loadLocal('coins', 0),
            highScore: this.loadLocal('highScore', 0),
            upgrades: this.loadLocal('upgrades', { [selectedVehicle]: { engine: 1, suspension: 1, tires: 1 } }),
            unlockedVehicles: this.loadLocal('unlockedVehicles', ['car']),
            unlockedWorlds: this.loadLocal('unlockedWorlds', ['mountain']),
            unlockedWorlds: this.loadLocal('unlockedWorlds', ['mountain']),
            abilities: this.loadLocal('abilities', { jump: 0, fly: false }), // Jump is Stock (Int), Fly is Unlock (Bool)
            selectedVehicle: selectedVehicle,
            selectedWorld: this.loadLocal('selectedWorld', 'mountain'),
            achievements: this.loadLocal('achievements', {
                distance1k: false, distance5k: false, distance10k: false,
                coins1k: false, coins10k: false, coins50k: false,
                allVehicles: false, allWorlds: false, maxUpgrade: false,
                fullGarage: false, worldTraveler: false, wealthy: false,
                speedDemon: false
            }),
            settings: this.loadLocal('settings', { audio: true, graphics: 'high' })
        };
    },

    getVehicleUpgrades(vehicleId) {
        const data = this.getGameData();
        if (!data.upgrades[vehicleId]) {
            data.upgrades[vehicleId] = { engine: 1, suspension: 1, tires: 1 };
        }
        return data.upgrades[vehicleId];
    },

    async updateVehicleUpgrade(vehicleId, type, level) {
        const data = this.getGameData();
        if (!data.upgrades[vehicleId]) data.upgrades[vehicleId] = { engine: 1, suspension: 1, tires: 1 };
        data.upgrades[vehicleId][type] = level;
        return await this.save('upgrades', data.upgrades);
    },

    async unlockItem(type, id) {
        const key = type === 'vehicle' ? 'unlockedVehicles' : 'unlockedWorlds';
        const unlocked = this.loadLocal(key, type === 'vehicle' ? ['car'] : ['mountain']);
        if (!unlocked.includes(id)) {
            unlocked.push(id);
            await this.save(key, unlocked);
            return true;
        }
        return false;
    },

    async saveAbilities(abilities) {
        return await this.save('abilities', abilities);
    },

    async saveGameProgress(coins, distance, abilities = null) {
        const data = this.getGameData();
        data.coins += coins;
        if (abilities) data.abilities = abilities; // Update consumed stock

        if (distance > data.highScore) {
            data.highScore = distance;
            await this.submitScore(distance);
        }

        // Check Achievements
        if (!data.achievements.distance1k && distance >= 1000) data.achievements.distance1k = true;
        if (!data.achievements.distance5k && distance >= 5000) data.achievements.distance5k = true;
        if (!data.achievements.distance10k && distance >= 10000) data.achievements.distance10k = true;

        if (!data.achievements.coins1k && data.coins >= 1000) data.achievements.coins1k = true;
        if (!data.achievements.coins10k && data.coins >= 10000) data.achievements.coins10k = true;
        if (!data.achievements.coins50k && data.coins >= 50000) data.achievements.coins50k = true;

        if (!data.achievements.wealthy && data.coins >= 100000) data.achievements.wealthy = true;

        if (!data.achievements.allVehicles && data.unlockedVehicles.length >= 14) data.achievements.allVehicles = true;
        if (!data.achievements.allWorlds && data.unlockedWorlds.length >= 15) data.achievements.allWorlds = true;
        if (!data.achievements.allWorlds && data.unlockedWorlds.length >= 15) data.achievements.allWorlds = true;
        if (!data.achievements.worldTraveler && data.unlockedWorlds.length >= 10) data.achievements.worldTraveler = true;

        // Specialized Checks
        let maxUpgradeReached = false;
        let fullyUpgradedCount = 0;
        Object.keys(data.upgrades).forEach(vId => {
            const u = data.upgrades[vId];
            if (u.engine >= 10 || u.suspension >= 10 || u.tires >= 10) maxUpgradeReached = true;
            if (u.engine >= 10 && u.suspension >= 10 && u.tires >= 10) fullyUpgradedCount++;
        });

        if (!data.achievements.maxUpgrade && maxUpgradeReached) data.achievements.maxUpgrade = true;
        if (!data.achievements.fullGarage && fullyUpgradedCount >= 3) data.achievements.fullGarage = true;

        const sonicBoltUpgrades = data.upgrades['dragster'] || {};
        if (!data.achievements.speedDemon && sonicBoltUpgrades.engine >= 20) data.achievements.speedDemon = true;

        await this.save('coins', data.coins);
        await this.save('highScore', data.highScore);
        await this.save('achievements', data.achievements);
        await this.save('abilities', data.abilities); // Persist consumed jumps
    }
};

export default DataManager;
window.DataManager = DataManager;
