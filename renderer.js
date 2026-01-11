const Renderer = {
    canvas: null,
    ctx: null,
    assets: {},

    async init(canvasId, worldType = 'mountain') {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        document.body.setAttribute('data-world', worldType);
        this.resize();
        window.addEventListener('resize', () => this.resize());
        await this.loadAssets();
    },

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    },

    async loadAssets() {
        const assetsToLoad = {
            'car_body': 'car.svg',
            'truck_body': 'truck.svg',
            'walker_body': 'walker.svg',
            'rally_body': 'rally.svg',
            'hover_body': 'hover.svg',
            'tank_body': 'tank.svg',
            'buggy_body': 'buggy.svg',
            'spider_body': 'spider.svg',
            'dragster_body': 'dragster.svg',
            'crawler_body': 'crawler.svg',
            'moto_body': 'moto.svg',
            'ufo_body': 'ufo.svg',
            'alpha_body': 'alpha.svg',
            'luna_body': 'luna.svg',
            'wheel': 'wheel.svg',
            'coin': 'coin.svg',
            'fuel': 'fuel.svg',
            'driver': 'driver.svg',
            // Terrain Textures (kept for detail)
            'tex_grass': 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=512&q=80',
            'tex_sand': 'https://images.unsplash.com/photo-1509316785289-025f5b846b35?auto=format&fit=crop&w=512&q=80',
            'tex_snow': 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1920&q=80', // Reliable Mountain URL
            'tex_moon': 'https://images.unsplash.com/photo-1541447271487-09612b3f49f7?auto=format&fit=crop&w=512&q=80',
            'tex_mars': 'https://images.unsplash.com/photo-1534067783941-51c9c23ecefd?auto=format&fit=crop&w=512&q=80'
        };

        for (const [name, url] of Object.entries(assetsToLoad)) {
            const img = await this.loadImage(url);
            if (img) {
                this.assets[name] = img;
            } else if (name.startsWith('tex_')) {
                // Create a fallback solid color texture if Unsplash fails
                const fallbackColors = {
                    'tex_grass': '#4ade80',
                    'tex_sand': '#fbbf24',
                    'tex_snow': '#f8fafc',
                    'tex_moon': '#94a3b8',
                    'tex_mars': '#f87171'
                };
                const color = fallbackColors[name] || '#888';
                const canvas = document.createElement('canvas');
                canvas.width = 64; canvas.height = 64;
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = color;
                ctx.fillRect(0, 0, 64, 64);
                this.assets[name] = canvas;
            }

            if (this.assets[name] && name.startsWith('tex_')) {
                this.assets[`${name}_pattern`] = this.ctx.createPattern(this.assets[name], 'repeat');
            }
        }
    },

    loadImage(url) {
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => {
                console.warn(`Failed to load asset: ${url}`);
                resolve(null);
            };
            img.src = url;
        });
    },

    clear() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    },

    drawParallax(worldType, camX) {
        document.body.setAttribute('data-world', worldType);

        // 2D Stylized Background System
        const config = {
            mountain: { sky: ['#e0f2fe', '#bae6fd'], layers: ['#ffc8a2', '#ff8c42'], type: 'peaks' },
            desert: { sky: ['#fef3c7', '#fde68a'], layers: ['#f59e0b', '#d97706'], type: 'dunes' },
            snow: { sky: ['#f1f5f9', '#e2e8f0'], layers: ['#94a3b8', '#64748b'], type: 'peaks' },
            moon: { sky: ['#0f172a', '#020617'], layers: ['#334155', '#1e293b'], type: 'craters' },
            mars: { sky: ['#2d1102', '#451a03'], layers: ['#ff8c42', '#cc7035'], type: 'hills' },
            volcano: { sky: ['#424242', '#212121'], layers: ['#b71c1c', '#4a148c'], type: 'peaks' },
            jungle: { sky: ['#e8f5e9', '#c8e6c9'], layers: ['#2e7d32', '#1b5e20'], type: 'hills' },
            ocean: { sky: ['#e1f5fe', '#01579b'], layers: ['#0288d1', '#01579b'], type: 'dunes' },
            cyber: { sky: ['#311b92', '#1a0033'], layers: ['#7b1fa2', '#4a148c'], type: 'hills' },
            cavern: { sky: ['#212121', '#000000'], layers: ['#424242', '#212121'], type: 'peaks' },
            void: { sky: ['#000000', '#1a0033'], layers: ['#212121', '#0d021f'], type: 'hills' },
            titan: { sky: ['#002f6c', '#001933'], layers: ['#4fc3f7', '#0288d1'], type: 'peaks' },
            inferno: { sky: ['#ff3d00', '#bf360c'], layers: ['#dd2c00', '#3e2723'], type: 'peaks' },
            dream: { sky: ['#f3e5f5', '#ce93d8'], layers: ['#ab47bc', '#7b1fa2'], type: 'dunes' },
            godzilla: { sky: ['#263238', '#212121'], layers: ['#546e7a', '#263238'], type: 'peaks' }
        };

        const theme = config[worldType] || config.mountain;

        // 1. Draw Sky
        const skyGrad = this.ctx.createLinearGradient(0, 0, 0, this.canvas.height);
        skyGrad.addColorStop(0, theme.sky[0]);
        skyGrad.addColorStop(1, theme.sky[1]);
        this.ctx.fillStyle = skyGrad;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // 2. Draw Parallax Layers (2D Silhouettes)
        this.drawStylizedLayer(theme.layers[0], 0.1, camX, theme.type, 300);
        this.drawStylizedLayer(theme.layers[1], 0.2, camX, theme.type, 200);

        // Standard darker overlay for space
        if (worldType === 'moon' || worldType === 'mars') {
            this.ctx.fillStyle = 'rgba(0,0,0,0.3)';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        }
    },

    drawStylizedLayer(color, speed, camX, type, height) {
        this.ctx.fillStyle = color;
        this.ctx.beginPath();
        const offset = -(camX * speed);
        const wavelength = 400;

        this.ctx.moveTo(0, this.canvas.height);
        for (let i = 0; i <= this.canvas.width + wavelength; i += 20) {
            let y;
            const x = i + (offset % wavelength);

            if (type === 'peaks') {
                // Sharper, more jagged peaks
                y = this.canvas.height - height - Math.abs(Math.sin((i + offset) / 60)) * 180 - Math.sin((i + offset) / 20) * 30;
            } else if (type === 'dunes') {
                // Smooth wide dunes with a sharp "crest" feel
                const duneVal = Math.sin((i + offset) / 250);
                y = this.canvas.height - height - Math.abs(duneVal) * 120;
            } else if (type === 'craters') {
                // Jagged lunar horizon with "crater" dips
                y = this.canvas.height - height - Math.sin((i + offset) / 100) * 40 - (Math.random() > 0.95 ? 50 : 0);
                // Draw a simple crater if we are at certain points
                if (Math.sin((i + offset) / 300) > 0.8) y += 40;
            } else { // hills
                y = this.canvas.height - height - Math.sin((i + offset) / 150) * 80 - Math.cos((i + offset) / 70) * 40;
            }

            this.ctx.lineTo(x, y);
        }
        this.ctx.lineTo(this.canvas.width + wavelength, this.canvas.height);
        this.ctx.fill();
    },

    drawSprite(assetName, x, y, angle, w, h, camX) {
        const asset = this.assets[assetName];
        this.ctx.save();
        this.ctx.translate(x - camX, y);
        this.ctx.rotate(angle);
        if (asset) {
            this.ctx.drawImage(asset, -w / 2, -h / 2, w, h);
        } else {
            // Fallback visuals
            if (assetName.includes('body')) {
                const colors = {
                    car: '#ff4757', truck: '#2e86de', walker: '#95afc0',
                    rally: '#ffa502', hover: '#70a1ff', tank: '#2f3542',
                    buggy: '#7bed9f', spider: '#5352ed', dragster: '#ff6b81',
                    crawler: '#57606f', moto: '#eccc68', ufo: '#a29bfe',
                    alpha: '#ff7f50'
                };
                const type = assetName.split('_')[0];
                this.ctx.fillStyle = colors[type] || '#ff4757';
                this.ctx.fillRect(-w / 2, -h / 2, w, h);
            } else if (assetName === 'wheel') {
                this.ctx.fillStyle = '#1e272e';
                this.ctx.beginPath();
                this.ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
                this.ctx.fill();
                this.ctx.strokeStyle = '#485e67';
                this.ctx.lineWidth = 2;
                this.ctx.stroke();
            } else if (assetName === 'coin') {
                this.ctx.fillStyle = '#f9ca24';
                this.ctx.beginPath();
                this.ctx.arc(0, 0, w / 2, 0, Math.PI * 2);
                this.ctx.fill();
            } else if (assetName === 'fuel') {
                this.ctx.fillStyle = '#eb4d4b';
                this.ctx.fillRect(-w / 2, -h / 2, w, h);
            } else if (assetName === 'driver') {
                this.ctx.fillStyle = '#f0932b';
                this.ctx.beginPath();
                this.ctx.arc(0, 0, 8, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        this.ctx.restore();
    },

    drawTerrain(points, camX, worldType = 'mountain') {
        if (points.length < 2) return;

        const textures = {
            mountain: { top: '#2ed573', fill: 'tex_grass_pattern', edge: '#4b2e12' },
            desert: { top: '#f1c40f', fill: 'tex_sand_pattern', edge: '#d4ac0d' },
            snow: { top: '#ffffff', fill: 'tex_snow_pattern', edge: '#bdc3c7' },
            moon: { top: '#bdc3c7', fill: 'tex_moon_pattern', edge: '#7f8c8d' },
            mars: { top: '#e67e22', fill: 'tex_mars_pattern', edge: '#ba4a00' }
        };
        const theme = textures[worldType] || textures.mountain;

        // Fill area under terrain with texture
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.moveTo(points[0].x - camX, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x - camX, points[i].y);
        }
        this.ctx.lineTo(points[points.length - 1].x - camX, this.canvas.height + 1000);
        this.ctx.lineTo(points[0].x - camX, this.canvas.height + 1000);
        this.ctx.closePath();

        const pattern = this.assets[theme.fill];
        if (pattern) {
            this.ctx.fillStyle = pattern;
            // Align pattern with camera
            this.ctx.translate(-camX % 200, 0);
            this.ctx.fill();
        } else {
            this.ctx.fillStyle = '#654321';
            this.ctx.fill();
        }
        this.ctx.restore();

        // Edge/Path
        this.ctx.beginPath();
        this.ctx.lineWidth = 12;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.strokeStyle = theme.edge;
        this.ctx.moveTo(points[0].x - camX, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x - camX, points[i].y);
        }
        this.ctx.stroke();

        // Grass/Top layer
        this.ctx.beginPath();
        this.ctx.lineWidth = 6;
        this.ctx.strokeStyle = theme.top;
        this.ctx.moveTo(points[0].x - camX, points[0].y);
        for (let i = 1; i < points.length; i++) {
            this.ctx.lineTo(points[i].x - camX, points[i].y);
        }
        this.ctx.stroke();
    }
};

export default Renderer;
