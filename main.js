import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

// ==========================================
// 1. CONFIGURACIÓN BASE Y LUCES
// ==========================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.Fog(0x050505, 0, 60);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// ALTURA DEL JUGADOR ACTUALIZADA (A la altura del zombi)
camera.position.set(0, 2.2, 0); 
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

scene.add(new THREE.AmbientLight(0xffffff, 1.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// ==========================================
// 2. SISTEMA DE NIVELES Y SALUD DEL JUGADOR
// ==========================================
let nivelActual = 1;
let zombisBase = 35;
const maxSaludJugador = 20;
let saludJugador = maxSaludJugador;
let ultimoDanioRecibido = 0;

const uiHealthBar = document.getElementById('health-bar');
const uiHealthText = document.getElementById('health-text');
const uiLevelDisplay = document.getElementById('level-display');

function recibirDanioJugador() {
    const tiempoActual = performance.now();
    if (tiempoActual - ultimoDanioRecibido > 1000) { 
        saludJugador--;
        ultimoDanioRecibido = tiempoActual;
        
        const porcentaje = (saludJugador / maxSaludJugador) * 100;
        uiHealthBar.style.width = porcentaje + "%";
        uiHealthText.innerText = `Salud: ${saludJugador} / ${maxSaludJugador}`;
        
        if (porcentaje <= 50) uiHealthBar.style.background = "yellow";
        if (porcentaje <= 20) uiHealthBar.style.background = "red";

        if (saludJugador <= 0) {
            gameOver = true;
            controls.unlock();
            document.getElementById('game-over-screen').style.display = 'flex';
        }
    }
}

// ==========================================
// 3. TEXTURAS, PAREDES Y SUELO SÓLIDO
// ==========================================
const textureLoader = new THREE.TextureLoader();
const paredesBox3 = [];

// --- PAREDES ---
const materialPared = new THREE.MeshStandardMaterial({ color: 0x888888 }); 
textureLoader.load('assets/textura_roca.jpg', (textura) => {
    textura.wrapS = THREE.RepeatWrapping; 
    textura.wrapT = THREE.RepeatWrapping;
    textura.repeat.set(4, 1); 
    materialPared.map = textura;
    materialPared.color.setHex(0xffffff);
    materialPared.needsUpdate = true;
});

// --- SUELO (Color sólido verde oscuro, optimizado) ---
const materialSuelo = new THREE.MeshStandardMaterial({ color: 0x1a4314 }); 
const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), materialSuelo);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

// --- ZONA DE EXTRACCIÓN ---
const zonaExtraccion = new THREE.Mesh(
    new THREE.BoxGeometry(10, 0.5, 10), 
    new THREE.MeshStandardMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 })
);
zonaExtraccion.position.set(0, 0.25, -90);
scene.add(zonaExtraccion);

function crearPared(x, z, ancho, prof) {
    const pared = new THREE.Mesh(new THREE.BoxGeometry(ancho, 6, prof), materialPared);
    pared.position.set(x, 3, z);
    scene.add(pared);
    paredesBox3.push(new THREE.Box3().setFromObject(pared));
}

crearPared(0, 10, 100, 2);    
crearPared(0, -100, 100, 2);  
crearPared(-50, -45, 2, 110); 
crearPared(50, -45, 2, 110);  
crearPared(-20, -20, 40, 2);  
crearPared(25, -40, 2, 40);  
crearPared(-10, -60, 60, 2); 

// ==========================================
// 4. ARMAS
// ==========================================
const loader = new GLTFLoader();
const armas = [];
let armaActiva = 0;
const municion = { 0: { clip: 30, maxClip: 30, reserva: 120 }, 1: { clip: 7, maxClip: 7, reserva: 28 } };
const danioArmas = { 0: 1, 1: 3 }; 

const uiAmmo = document.getElementById('ammo-display');
function actualizarUIMunicion() {
    const data = municion[armaActiva];
    uiAmmo.innerText = `Arma ${armaActiva + 1} | ${data.clip} / ${data.reserva}`;
}

function cargarArma(ruta, index, config) {
    loader.load(ruta, (gltf) => {
        const modelo = gltf.scene;
        modelo.scale.set(config.escala, config.escala, config.escala);
        modelo.position.set(config.pos.x, config.pos.y, config.pos.z);
        modelo.rotation.set(config.rot.x, config.rot.y, config.rot.z);
        
        modelo.visible = (index === 0);
        armas[index] = modelo;
        camera.add(modelo);
    });
}
// Arma 1 grande
cargarArma('assets/arma1.glb', 0, { pos: {x: 1.2, y: -0.8, z: -1.5}, escala: 6.0, rot: {x: 0, y: Math.PI, z: 0} }); 
// Arma 2
cargarArma('assets/arma2.glb', 1, { pos: {x: 1.2, y: -0.8, z: -1.5}, escala: 4.0, rot: {x: 0, y: Math.PI, z: 0} });

// ==========================================
// 5. ZOMBIS CLONADOS
// ==========================================
let zombisActivos = [];
let zombieBaseScene = null;
let zombieAnimations = null;

function crearBarraSaludZombi() {
    const fondo = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xff0000 }));
    fondo.scale.set(1.5, 0.15, 1);
    const frente = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x00ff00 }));
    frente.scale.set(1.5, 0.15, 1);
    frente.position.z = 0.01; 
    
    const grupoBarra = new THREE.Group();
    grupoBarra.add(fondo); grupoBarra.add(frente);
    grupoBarra.position.y = 2.5; 
    return { grupo: grupoBarra, barraVerde: frente };
}

loader.load('assets/zombi.glb', (gltf) => {
    zombieBaseScene = gltf.scene;
    zombieAnimations = gltf.animations;
    zombieBaseScene.scale.set(1.5, 1.5, 1.5); 
    generarOleada(zombisBase); 
});

function generarOleada(cantidad) {
    if (!zombieBaseScene) return; 

    zombisActivos.forEach(z => scene.remove(z.grupo));
    zombisActivos = [];

    for(let i = 0; i < cantidad; i++) {
        const modeloClonado = SkeletonUtils.clone(zombieBaseScene);
        
        const rX = (Math.random() - 0.5) * 80;
        const rZ = (Math.random() * -80) - 10; 
        modeloClonado.position.set(rX, 0, rZ);

        const hpUI = crearBarraSaludZombi();
        modeloClonado.add(hpUI.grupo);
        scene.add(modeloClonado);

        let mixer = null;
        if (zombieAnimations && zombieAnimations.length > 0) {
            mixer = new THREE.AnimationMixer(modeloClonado);
            mixer.clipAction(zombieAnimations[0]).play();
        }

        zombisActivos.push({
            grupo: modeloClonado,
            mixer: mixer,
            saludMax: 3, 
            salud: 3,
            activo: false,
            barraVerde: hpUI.barraVerde
        });
    }
}

// ==========================================
// 6. EVENTOS Y DISPAROS
// ==========================================
let gameStarted = false; let gameOver = false; let gameWon = false;
const controls = new PointerLockControls(camera, document.body);

document.getElementById('btn-start').addEventListener('click', () => { gameStarted = true; controls.lock(); });
document.getElementById('btn-resume').addEventListener('click', () => controls.lock());
document.getElementById('btn-next-level').addEventListener('click', () => avanzarNivel());

controls.addEventListener('lock', () => document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'));
controls.addEventListener('unlock', () => {
    if (gameStarted && !gameOver && !gameWon) document.getElementById('pause-screen').style.display = 'flex';
});

const moveState = { w: false, a: false, s: false, d: false };
const velocity = new THREE.Vector3(); const direction = new THREE.Vector3();
const playerBox = new THREE.Box3(); 

document.addEventListener('keydown', (e) => {
    if(!controls.isLocked) return;
    if(e.code === 'KeyW') moveState.w = true; if(e.code === 'KeyA') moveState.a = true;
    if(e.code === 'KeyS') moveState.s = true; if(e.code === 'KeyD') moveState.d = true;
    
    if (armas[0] && armas[1]) {
        if (e.code === 'Digit1' && armaActiva !== 0) { armas[0].visible = true; armas[1].visible = false; armaActiva = 0; actualizarUIMunicion(); }
        if (e.code === 'Digit2' && armaActiva !== 1) { armas[0].visible = false; armas[1].visible = true; armaActiva = 1; actualizarUIMunicion(); }
    }
    if (e.code === 'KeyR') {
        const data = municion[armaActiva];
        const faltantes = data.maxClip - data.clip;
        if (faltantes > 0 && data.reserva > 0) {
            const recarga = Math.min(faltantes, data.reserva);
            data.clip += recarga; data.reserva -= recarga;
            actualizarUIMunicion();
        }
    }
});
document.addEventListener('keyup', (e) => {
    if(e.code === 'KeyW') moveState.w = false; if(e.code === 'KeyA') moveState.a = false;
    if(e.code === 'KeyS') moveState.s = false; if(e.code === 'KeyD') moveState.d = false;
});

const raycaster = new THREE.Raycaster();
document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !controls.isLocked) return; 
    
    const data = municion[armaActiva];
    if (data.clip > 0) {
        data.clip--; actualizarUIMunicion();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
        
        const meshesZombis = zombisActivos.map(z => z.grupo);
        const intersects = raycaster.intersectObjects(meshesZombis, true);
        
        if (intersects.length > 0) {
            const impactado = intersects[0].object;
            const z = zombisActivos.find(z => z.grupo === impactado || z.grupo.children.includes(impactado) || impactado.parent?.parent === z.grupo);
            
            if (z) {
                z.salud -= danioArmas[armaActiva];
                const hpPorcentaje = Math.max(0, z.salud / z.saludMax);
                z.barraVerde.scale.x = 1.5 * hpPorcentaje;

                if (z.salud <= 0) {
                    scene.remove(z.grupo); 
                    zombisActivos = zombisActivos.filter(zombi => zombi !== z); 
                }
            }
        }
    }
});

function avanzarNivel() {
    nivelActual++;
    uiLevelDisplay.innerText = `Nivel: ${nivelActual}`;
    // Restablece la posición y la altura a 2.2
    camera.position.set(0, 2.2, 0); 
    velocity.set(0,0,0);
    generarOleada(zombisBase + (10 * (nivelActual - 1)));
    
    municion[0].reserva = 120; municion[0].clip = 30;
    municion[1].reserva = 28;  municion[1].clip = 7;
    actualizarUIMunicion();

    gameWon = false;
    document.getElementById('next-level-screen').style.display = 'none';
    controls.lock();
}

// ==========================================
// 7. BUCLE PRINCIPAL
// ==========================================
let prevTime = performance.now();

function animate() {
    requestAnimationFrame(animate);
    if (gameOver || gameWon || !gameStarted) return; 

    const time = performance.now();
    const delta = (time - prevTime) / 1000;
    
    zombisActivos.forEach(z => { if (z.mixer) z.mixer.update(delta); });

    if (controls.isLocked) {
        const posAnterior = camera.position.clone();
        velocity.x -= velocity.x * 10.0 * delta; velocity.z -= velocity.z * 10.0 * delta;
        direction.z = Number(moveState.w) - Number(moveState.s);
        direction.x = Number(moveState.d) - Number(moveState.a);
        direction.normalize();
        
        if (moveState.w || moveState.s) velocity.z -= direction.z * 20.0 * delta;
        if (moveState.a || moveState.d) velocity.x -= direction.x * 20.0 * delta;

        controls.moveRight(-velocity.x * delta); controls.moveForward(-velocity.z * delta);

        // Aumentada la altura de la caja de colisión para coincidir con la nueva altura de cámara
        playerBox.setFromCenterAndSize(camera.position, new THREE.Vector3(1.0, 2.5, 1.0));
        for (let i = 0; i < paredesBox3.length; i++) {
            if (playerBox.intersectsBox(paredesBox3[i])) { camera.position.copy(posAnterior); break; }
        }

        const playerPos = camera.position;
        zombisActivos.forEach((z) => {
            const dist = playerPos.distanceTo(z.grupo.position);
            if (dist < 25) z.activo = true; 
            if (z.activo) {
                z.grupo.lookAt(playerPos.x, z.grupo.position.y, playerPos.z);
                z.grupo.translateZ(3.0 * delta);
                if (dist < 2.0) recibirDanioJugador();
            }
        });

        if (playerPos.distanceTo(zonaExtraccion.position) < 5) {
            gameWon = true;
            controls.unlock();
            const proxZombis = zombisBase + (10 * nivelActual);
            document.getElementById('next-level-text').innerText = `Sobreviviste. El Nivel ${nivelActual + 1} tendrá ${proxZombis} zombis.`;
            document.getElementById('next-level-screen').style.display = 'flex';
        }
    }
    renderer.render(scene, camera);
    prevTime = time;
}
animate();