import * as THREE from 'three'

/**
 * Low-poly models of the games, built from simple shapes only. Sizes are in
 * metres: in the games one world unit is one metre.
 */

const material = (color, options = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true, ...options })

function part(geometry, mat, x = 0, y = 0, z = 0) {
    const mesh = new THREE.Mesh(geometry, mat)
    mesh.position.set(x, y, z)
    mesh.castShadow    = true
    mesh.receiveShadow = true
    return mesh
}

/** A joint: a pivot group holding a box that hangs below it. */
function limb(parent, width, length, mat, x, y, z = 0) {
    const pivot = new THREE.Group()
    pivot.position.set(x, y, z)
    pivot.add(part(new THREE.BoxGeometry(width, length, width), mat, 0, -length / 2, 0))
    parent.add(pivot)
    return pivot
}

/**
 * A small runner (1.8 m) with a hoodie and a backpack, facing −Z.
 * `animate()` blends idle, walk, run, jump and the super jump crouch.
 */
export function createRunner() {
    const skin   = material(0xf1c7a3)
    const hoodie = material(0xe8563a)
    const pants  = material(0x2f4c7a)
    const shoes  = material(0xf4f1ea)
    const hair   = material(0x3a2a20)
    const pack   = material(0xf2b134)

    const object = new THREE.Group()
    object.name = 'Runner'
    const body = new THREE.Group()
    object.add(body)

    body.add(part(new THREE.BoxGeometry(0.46, 0.56, 0.28), hoodie, 0, 1.27, 0))
    body.add(part(new THREE.BoxGeometry(0.4, 0.14, 0.26), pants, 0, 0.98, 0))
    body.add(part(new THREE.BoxGeometry(0.34, 0.42, 0.16), pack, 0, 1.3, 0.21))
    body.add(part(new THREE.IcosahedronGeometry(0.17, 1), skin, 0, 1.73, 0))
    body.add(part(new THREE.SphereGeometry(0.185, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hair, 0, 1.76, 0.01))
    body.add(part(new THREE.BoxGeometry(0.2, 0.05, 0.14), hair, 0, 1.79, -0.16))   // cap visor

    const legs = [-1, 1].map(side => {
        const hip  = limb(body, 0.15, 0.44, pants, side * 0.11, 0.95)
        const knee = limb(hip, 0.13, 0.42, pants, 0, -0.44)
        knee.add(part(new THREE.BoxGeometry(0.15, 0.09, 0.26), shoes, 0, -0.45, -0.05))
        return { hip, knee }
    })
    const arms = [-1, 1].map(side => {
        const shoulder = limb(body, 0.12, 0.3, hoodie, side * 0.3, 1.5)
        const elbow    = limb(shoulder, 0.11, 0.27, hoodie, 0, -0.3)
        elbow.add(part(new THREE.IcosahedronGeometry(0.07, 0), skin, 0, -0.3, 0))
        shoulder.rotation.z = side * 0.08
        return { shoulder, elbow }
    })

    let phase = 0
    let time  = 0
    return {
        object,
        /**
         * @param {number} dt
         * @param {{ speed: number, grounded: boolean, charge: number, verticalSpeed: number }} state
         */
        animate(dt, { speed, grounded, charge, verticalSpeed }) {
            time += dt
            const moving = grounded ? Math.min(speed / 10, 1) : 0
            phase += dt * (3 + speed * 1.1)
            const swing = Math.sin(phase)
            const legAmp = 0.25 + moving * 0.75
            const armAmp = 0.2 + moving * 0.9

            legs.forEach(({ hip, knee }, i) => {
                const s = i === 0 ? swing : -swing
                let hipX  = speed > 0.3 ? s * legAmp : 0
                let kneeX = speed > 0.3 ? Math.max(0, -Math.sin(phase + (i === 0 ? 0 : Math.PI))) * (0.4 + moving) : 0
                if (!grounded) { hipX = i === 0 ? -0.9 : 0.3; kneeX = i === 0 ? 1.2 : 0.4 }
                if (charge > 0) { hipX = -0.9 * charge - 0.2; kneeX = 1.7 * charge + 0.3 }
                hip.rotation.x  = THREE.MathUtils.damp(hip.rotation.x, hipX, 18, dt)
                knee.rotation.x = THREE.MathUtils.damp(knee.rotation.x, kneeX, 18, dt)
            })
            arms.forEach(({ shoulder, elbow }, i) => {
                const s = i === 0 ? -swing : swing
                let armX   = speed > 0.3 ? s * armAmp : Math.sin(time * 1.6 + i) * 0.04
                let elbowX = -0.3 - moving * 0.9
                if (!grounded) { armX = verticalSpeed > 0 ? -2.6 : -1.6; elbowX = -0.2 }
                if (charge > 0) { armX = 0.9 * charge; elbowX = -1.2 }
                shoulder.rotation.x = THREE.MathUtils.damp(shoulder.rotation.x, armX, 16, dt)
                elbow.rotation.x    = THREE.MathUtils.damp(elbow.rotation.x, elbowX, 16, dt)
            })

            // Bounce while running, breathe while idle, crouch while charging a super jump.
            const bob = grounded ? Math.abs(Math.cos(phase)) * 0.06 * moving + Math.sin(time * 2) * 0.008 : 0
            body.position.y = THREE.MathUtils.damp(body.position.y, bob - charge * 0.35, 20, dt)
            body.rotation.x = THREE.MathUtils.damp(body.rotation.x, -moving * 0.18 - charge * 0.3, 10, dt)
        },
    }
}

/**
 * A little propeller plane (7 m long, 11 m wingspan) facing −Z, with a
 * spinning propeller and markers at the wing tips for the trails.
 */
export function createPlane() {
    const white = material(0xf4f1ea)
    const red   = material(0xd9412b)
    const dark  = material(0x2b2f3a)
    const glass = material(0x9fdcff, { transparent: true, opacity: 0.55, roughness: 0.1, metalness: 0.4 })

    const object = new THREE.Group()
    object.name = 'Plane'

    const fuselage = new THREE.CylinderGeometry(0.75, 0.45, 7, 10).rotateX(Math.PI / 2)
    object.add(part(fuselage, white))
    object.add(part(new THREE.ConeGeometry(0.75, 1.4, 10).rotateX(-Math.PI / 2), red, 0, 0, -4.2))
    object.add(part(new THREE.BoxGeometry(1.52, 0.2, 7.02), red, 0, -0.15, 0))                    // stripe
    const canopy = part(new THREE.SphereGeometry(0.62, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), glass, 0, 0.45, -1.1)
    canopy.scale.z = 1.8
    object.add(canopy)
    object.add(part(new THREE.BoxGeometry(11, 0.16, 1.7), white, 0, -0.2, -0.6))                  // wings
    object.add(part(new THREE.BoxGeometry(1.2, 0.18, 1.72), red, 5.0, -0.2, -0.6))
    object.add(part(new THREE.BoxGeometry(1.2, 0.18, 1.72), red, -5.0, -0.2, -0.6))
    object.add(part(new THREE.BoxGeometry(3.8, 0.12, 0.9), white, 0, 0.1, 3.1))                   // tail plane
    object.add(part(new THREE.BoxGeometry(0.12, 1.5, 1.1), red, 0, 0.8, 3.2))                     // fin
    object.add(part(new THREE.BoxGeometry(0.16, 0.9, 0.16), dark, 1.2, -0.9, -1.2))               // wheels
    object.add(part(new THREE.BoxGeometry(0.16, 0.9, 0.16), dark, -1.2, -0.9, -1.2))

    const propeller = new THREE.Group()
    propeller.position.z = -4.95
    propeller.add(part(new THREE.ConeGeometry(0.28, 0.5, 8).rotateX(-Math.PI / 2), dark))
    propeller.add(part(new THREE.BoxGeometry(0.2, 3.1, 0.06), dark))
    propeller.add(part(new THREE.BoxGeometry(3.1, 0.2, 0.06), dark))
    object.add(propeller)

    const wingTips = [-5.6, 5.6].map(x => {
        const tip = new THREE.Object3D()
        tip.position.set(x, -0.2, -0.3)
        object.add(tip)
        return tip
    })
    return { object, propeller, wingTips }
}

/** Shared geometry and material of the coins (1 m wide, standing up). */
export function createCoinAssets() {
    return {
        geometry: new THREE.CylinderGeometry(0.45, 0.45, 0.1, 18).rotateX(Math.PI / 2),
        material: new THREE.MeshStandardMaterial({
            color: 0xffc233, emissive: 0xb86b00, emissiveIntensity: 0.6, metalness: 0.6, roughness: 0.3,
        }),
    }
}
