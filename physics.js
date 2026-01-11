const Physics = {
    engine: null,
    world: null,

    init() {
        this.engine = Matter.Engine.create();
        this.world = this.engine.world;
        this.setGravity(1.2);
    },

    setGravity(y) {
        this.world.gravity.y = y;
    },

    createVehicle(x, y, type = 'car') {
        const { Body, Bodies, Composite, Constraint } = Matter;

        const configs = {
            car: { mass: 0.0025, friction: 0.05, wheelRadius: 20, stiffness: 0.2, damping: 0.1, driverPos: { x: 0, y: -15 } },
            truck: { mass: 0.006, friction: 0.08, wheelRadius: 24, stiffness: 0.05, damping: 0.08, driverPos: { x: 5, y: -25 } },
            walker: { mass: 0.004, friction: 0.06, wheelRadius: 22, stiffness: 0.15, damping: 0.12, driverPos: { x: -10, y: -30 } },
            rally: { mass: 0.003, friction: 0.04, wheelRadius: 16, stiffness: 0.09, damping: 0.15, driverPos: { x: 0, y: -15 } },
            hover: { mass: 0.0015, friction: 0.02, wheelRadius: 14, stiffness: 0.2, damping: 0.05, driverPos: { x: 0, y: -10 } },
            tank: { mass: 0.012, friction: 0.15, wheelRadius: 26, stiffness: 0.03, damping: 0.2, driverPos: { x: 0, y: -20 } },
            buggy: { mass: 0.002, friction: 0.07, wheelRadius: 20, stiffness: 0.12, damping: 0.1, driverPos: { x: 0, y: -15 } },
            spider: { mass: 0.0035, friction: 0.05, wheelRadius: 18, stiffness: 0.25, damping: 0.15, driverPos: { x: 0, y: -25 } },
            dragster: { mass: 0.002, friction: 0.03, wheelRadius: 14, stiffness: 0.1, damping: 0.05, driverPos: { x: -20, y: -10 } },
            crawler: { mass: 0.005, friction: 0.1, wheelRadius: 24, stiffness: 0.08, damping: 0.12, driverPos: { x: 0, y: -30 } },
            moto: { mass: 0.0018, friction: 0.04, wheelRadius: 16, stiffness: 0.15, damping: 0.1, driverPos: { x: 0, y: -15 } },
            ufo: { mass: 0.001, friction: 0.01, wheelRadius: 12, stiffness: 0.3, damping: 0.02, driverPos: { x: 0, y: -10 } },
            alpha: { mass: 0.01, friction: 0.1, wheelRadius: 22, stiffness: 0.1, damping: 0.1, driverPos: { x: 0, y: -20 } },
            luna: { mass: 0.0012, friction: 0.05, wheelRadius: 20, stiffness: 0.1, damping: 0.1, driverPos: { x: 0, y: -20 } } // Low mass for high jumps
        };
        const config = configs[type] || configs.car;

        let body;
        if (type === 'luna') {
            // Circular body for Luna
            body = Bodies.circle(x, y, 45, {
                collisionFilter: { group: -1 },
                friction: config.friction,
                density: config.mass,
                label: `${type}_body`,
                restitution: 0.5 // Bouncy
            });
        } else {
            // Rectangular body for others
            body = Bodies.rectangle(x, y, 90, 35, {
                chamfer: { radius: 5 },
                collisionFilter: { group: -1 },
                friction: config.friction,
                density: config.mass,
                label: `${type}_body`,
                centerOfMass: { x: 0, y: 10 }
            });
        }

        // Disable auto-balancing if possible or just rely on torque
        body.torque = 0;

        // Driver Head (Physics sensor for tilt effect)
        // For Luna, we either don't create a head or make it internal and non-colliding with terrain (though collisionFilter handles that usually)
        // To make it uncrashable, we just won't attach a "vulnerable" head sensor that triggers game over, 
        // OR we give it a specific label that the game loop ignores for crashes.

        let head, neck;
        if (type === 'luna') {
            // Internal dummy head for stability/mass but no crash detection label
            head = Bodies.circle(x, y, 5, {
                collisionFilter: { group: -1 },
                density: 0.001,
                label: 'luna_inner' // Safe label
            });
            neck = Constraint.create({
                bodyA: body,
                bodyB: head,
                stiffness: 1,
                length: 0
            });
        } else {
            head = Bodies.circle(x + config.driverPos.x, y + config.driverPos.y - 15, 8, {
                collisionFilter: { group: -1 },
                density: 0.001,
                label: 'driver_head' // Dangerous label
            });
            neck = Constraint.create({
                bodyA: body,
                pointA: config.driverPos,
                bodyB: head,
                stiffness: 0.2,
                damping: 0.1,
                length: 15
            });
        }

        const wheelOptions = {
            friction: 2.5,
            restitution: 0.1,
            collisionFilter: { group: -1 },
            density: config.mass * 2,
            label: 'wheel'
        };

        const wheelBack = Bodies.circle(x - 35, y + 30, config.wheelRadius, wheelOptions);
        const wheelFront = Bodies.circle(x + 35, y + 30, config.wheelRadius, wheelOptions);

        const springBack = Constraint.create({
            bodyA: body,
            pointA: { x: -35, y: 15 },
            bodyB: wheelBack,
            stiffness: config.stiffness,
            damping: config.damping,
            length: 15
        });

        const springFront = Constraint.create({
            bodyA: body,
            pointA: { x: 35, y: 15 },
            bodyB: wheelFront,
            stiffness: config.stiffness,
            damping: config.damping,
            length: 15
        });

        const car = Composite.create();
        Composite.add(car, [body, head, neck, wheelBack, wheelFront, springBack, springFront]);
        Composite.add(this.world, car);

        return { composite: car, body, head, wheelBack, wheelFront, config };
    },

    createTerrainSegment(p1, p2) {
        const { Bodies, World } = Matter;
        const width = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);

        const segment = Bodies.rectangle((p1.x + p2.x) / 2, (p1.y + p2.y) / 2, width + 2, 20, {
            isStatic: true,
            angle: angle,
            friction: 1.0,
            label: 'terrain'
        });

        World.add(this.world, segment);
        return segment;
    },

    spawnItem(x, y, type) {
        const { Bodies, World } = Matter;
        const item = Bodies.circle(x, y, 15, {
            isStatic: true,
            isSensor: true,
            label: type // 'coin' or 'fuel'
        });
        World.add(this.world, item);
        return item;
    }
};

export default Physics;
