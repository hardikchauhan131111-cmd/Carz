class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterVolume = 0.3;
        this.enabled = false;
        this.musicStep = parseInt(sessionStorage.getItem('music_step') || '0');
        this.musicInterval = null;

        // Engine Sound Nodes
        this.engineOsc = null;
        this.engineGain = null;
        this.isEngineRunning = false;

        // Load Settings
        const settings = JSON.parse(localStorage.getItem('carz_settings') || '{"audio":true,"graphics":"high"}');
        this.enabled = settings.audio;

        if (this.enabled) {
            // Try to auto-resume on load if allowed
            if (this.ctx.state === 'running') this.startMusic();

            // Or wait for interaction
            const unlock = () => {
                if (this.ctx.state === 'suspended') this.ctx.resume();
                this.startMusic();
                document.removeEventListener('click', unlock);
                document.removeEventListener('keydown', unlock);
            };
            document.addEventListener('click', unlock);
            document.addEventListener('keydown', unlock);
        }
    }

    playTone(freq, type, duration, vol = 1) {
        if (!this.enabled || !this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(this.masterVolume * vol, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playClick() { this.playTone(600, 'sine', 0.1); }
    playAlert() {
        this.playTone(300, 'sawtooth', 0.2);
        setTimeout(() => this.playTone(250, 'sawtooth', 0.3), 150);
    }
    playReset() {
        this.playTone(100, 'square', 0.5);
        setTimeout(() => this.playTone(50, 'square', 0.8), 200);
    }

    // --- Music System ---
    startMusic() {
        if (this.musicInterval || !this.enabled) return;

        // Pentatonic Scale
        const scale = [164.81, 196.00, 220.00, 246.94, 293.66];
        const bass = [82.41, 73.42];

        this.musicInterval = setInterval(() => {
            if (!this.enabled) return;

            // Save state for cross-page continuity
            sessionStorage.setItem('music_step', this.musicStep);

            // Bass (Every 4 beats)
            if (this.musicStep % 8 === 0) {
                const note = bass[Math.floor(Math.random() * bass.length)];
                this.playTone(note, 'triangle', 2.0, 0.4);
            }

            // Melody
            if (Math.random() > 0.4) {
                const note = scale[Math.floor(Math.random() * scale.length)];
                const freq = Math.random() > 0.7 ? note * 2 : note;
                this.playTone(freq, 'sine', 0.8, 0.15);
            }

            this.musicStep++;
        }, 300);
    }

    stopMusic() {
        if (this.musicInterval) clearInterval(this.musicInterval);
        this.musicInterval = null;
    }

    // --- Engine Sound System ---
    startEngine() {
        if (!this.enabled || this.isEngineRunning) return;

        this.engineOsc = this.ctx.createOscillator();
        this.engineGain = this.ctx.createGain();

        // Low rumble
        this.engineOsc.type = 'sawtooth';
        this.engineOsc.frequency.value = 50;

        this.engineGain.gain.value = 0; // Start silent

        this.engineOsc.connect(this.engineGain);
        this.engineGain.connect(this.ctx.destination);
        this.engineOsc.start();
        this.isEngineRunning = true;
    }

    updateEngine(speed) {
        if (!this.isEngineRunning || !this.engineOsc) return;

        // Speed is usually 0-20ish
        // Map speed to pitch (50Hz - 200Hz)
        const baseFreq = 60;
        const pitchMod = Math.min(speed * 8, 150);
        this.engineOsc.frequency.setTargetAtTime(baseFreq + pitchMod, this.ctx.currentTime, 0.1);

        // Map speed to volume (idle = quiet, fast = loud)
        // Idle volume 0.05, max volume 0.2
        const vol = Math.min(0.05 + (speed * 0.01), 0.2);
        this.engineGain.gain.setTargetAtTime(vol * this.masterVolume, this.ctx.currentTime, 0.1);
    }

    stopEngine() {
        if (this.engineOsc) {
            try {
                this.engineOsc.stop();
                this.engineOsc.disconnect();
                this.engineGain.disconnect();
            } catch (e) { }
            this.engineOsc = null;
            this.engineGain = null;
            this.isEngineRunning = false;
        }
    }

    toggle(enabled) {
        this.enabled = enabled;
        const settings = JSON.parse(localStorage.getItem('carz_settings') || '{}');
        settings.audio = enabled;
        localStorage.setItem('carz_settings', JSON.stringify(settings));

        if (enabled) {
            if (this.ctx.state === 'suspended') this.ctx.resume();
            this.startMusic();
        } else {
            this.stopMusic();
            this.stopEngine();
        }
    }
}

const audioManager = new AudioManager();
window.audioManager = audioManager;
export default audioManager;

