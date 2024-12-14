import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// Global variables
let camera, scene, renderer, world;  // Core components: Three.js camera, scene, renderer, and Cannon.js physics world
const originalBoxSize = 2;  // The initial width and depth of the first box in the stack
let stack = [];  // Array to store the stacked layers (each layer is an object containing its Three.js and Cannon.js representations)
let overhangs = [];  // Array to store falling or overhanging parts of the boxes
const boxHeight = 0.5;  // The uniform height of each box layer
let gameSTART = false;  // Boolean to track if the game has started (controls the animation loop)
let isPaused = false; // Pause game 
let boxSpeed = 0.09; // Default box movement speed
const initialBoxSpeed = 0.09; // Initial speed for resets
let animationId = null;

// Generates a box in the 3D world and physics engine
function generateBox(x, y, z, width, depth, falls) {
    // Create the geometry for the box in Three.js
    const boxGeometry = new THREE.BoxGeometry(width, boxHeight, depth);
    
    // Generate a dynamic color based on stack height using HSL (hue increases with each layer)
    const hue = Math.min(120, 30 + stack.length * 3); // Caps the hue at 120 for green
    const lightness = Math.min(50, 30 + stack.length * 0.5); // Caps lightness at 50%
    const color = new THREE.Color(`hsl(${hue}, 100%, ${lightness}%)`);
    
    // Create the material for the box using the computed color
    const boxMaterial = new THREE.MeshLambertMaterial({ color });

    // Create the Three.js mesh (visual representation) and set its position
    const box = new THREE.Mesh(boxGeometry, boxMaterial);
    box.position.set(x, y, z);
    scene.add(box);  // Add the box to the scene for rendering

    // Create the corresponding physics body in Cannon.js
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2));
    
    // If the box is an overhang (falls), assign a mass, otherwise set it to 0 (static)
    let mass = falls ? 5 : 0;
    
    // Create the physics body with the specified mass and shape
    const body = new CANNON.Body({ mass, shape });
    body.position.set(x, y, z);  // Set the position of the body
    world.addBody(body);  // Add the body to the physics simulation

    // Return both the Three.js mesh and Cannon.js body, along with the dimensions
    return {
        threejs: box,  // Visual representation in Three.js
        cannonjs: body,  // Physical representation in Cannon.js
        width,  // Width of the box
        depth,  // Depth of the box
    };
}

// Adds a new layer to the stack, either as the foundation or a moving layer
function addLayer(x, z, width, depth, direction) {
    // Calculate the vertical position based on the number of existing layers
    const y = boxHeight * stack.length;

    // Create the new layer using generateBox (falls is false because it's part of the stack)
    const layer = generateBox(x, y, z, width, depth, false);
    
    // Assign the movement direction for the new layer ('x' or 'z')
    layer.direction = direction;
    
    // Add the new layer to the stack array for tracking
    stack.push(layer);
}

// Adds an overhang to the scene when the top layer is partially cut off
function addOverhang(x, z, width, depth) {
    // Place the overhang at the height of the current top layer
    const y = boxHeight * (stack.length - 1);
    
    // Generate the overhanging box (falls is true since it should fall due to gravity)
    const overhang = generateBox(x, y, z, width, depth, true);
    
    // Add the overhang to the overhangs array to track falling pieces
    overhangs.push(overhang);
}

// Updates the physics simulation for overhanging boxes
function updatePhysics() {
    world.step(1 / 60);  // Step the physics simulation at 60 fps

    // Synchronize Cannon.js positions with Three.js meshes
    overhangs.forEach((element) => {
        element.threejs.position.copy(element.cannonjs.position);  // Sync position
        element.threejs.quaternion.copy(element.cannonjs.quaternion);  // Sync rotation
    });
}

// Cuts the box when it doesn't perfectly align with the previous layer
function cutBox(topLayer, overlap, size, delta) {
    const direction = topLayer.direction;  // Get the movement direction ('x' or 'z')

    // Calculate the new dimensions for the trimmed box
    const newWidth = direction === 'x' ? overlap : topLayer.width;  // Adjust width if moving along 'x'
    const newDepth = direction === 'z' ? overlap : topLayer.depth;  // Adjust depth if moving along 'z'

    // Update the Three.js properties to visually represent the cut
    topLayer.threejs.scale[direction === 'x' ? 'x' : 'z'] = overlap / size;  // Shrink the box
    topLayer.threejs.position[direction] -= delta / 2;  // Adjust position to center the cut

    // Update the Cannon.js physics body for the trimmed box
    topLayer.cannonjs.position[direction] -= delta / 2;  // Sync with Three.js position adjustment

    // Create a new shape with the updated dimensions for the physics engine
    const newShape = new CANNON.Box(new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2));
    
    topLayer.cannonjs.shapes = [];  // Clear existing shapes to replace with the new one
    topLayer.cannonjs.addShape(newShape);  // Add the new shape to the physics body

    // Update the metadata for the trimmed layer
    topLayer.width = newWidth;  // Update width
    topLayer.depth = newDepth;  // Update depth
}

function gameOver() {
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    gameSTART = false;
    alert("Game Over! You missed the stack.");
}

function updateButtonVisibility() {
    const controls = document.getElementById("controls");
    if (isPaused || !gameSTART) {
        controls.style.display = "block";
    } else {
        controls.style.display = "none";
    }
}

function pauseGame() {
    isPaused = !isPaused;
    
    if (isPaused) {
        console.log("Game Paused");
        if (animationId !== null) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
    } else {
        console.log("Game Resumed");
        if (gameSTART) {
            animationId = requestAnimationFrame(animation);
        }
    }
    
    updateButtonVisibility();
}

function restartGame() {
    if (restartFlag || isRestarting) return;
    isRestarting = true;
    restartFlag = true;

    console.log("Restarting game...");
    
    // Stop the current animation loop
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    // Clear scene and physics world
    while (scene.children.length > 0) {
        const child = scene.children[0];
        scene.remove(child);
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
    }

    while (world.bodies.length > 0) {
        world.removeBody(world.bodies[0]);
    }

    // Reset game variables
    stack = [];
    overhangs = [];
    gameSTART = false;
    boxSpeed = initialBoxSpeed;
    isPaused = false;

    // Reset camera
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);

    // Reinitialize game
    init();

    // Set up a clean start
    setTimeout(() => {
        isRestarting = false;
        restartFlag = false;
        updateButtonVisibility();
    }, 500);
}

// Animation Loop
function animation() {
    if (isPaused || isRestarting || !gameSTART) {
        return;
    }

    const speed = boxSpeed;

    const topLayer = stack[stack.length - 1];
    topLayer.threejs.position[topLayer.direction] += speed;
    topLayer.cannonjs.position[topLayer.direction] += speed;

    const position = topLayer.threejs.position[topLayer.direction];
    if (Math.abs(position) > 10) {
        stack.pop();
        generateNewLayer();
    }

    if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
        camera.position.y += speed;
    }

    updatePhysics();
    renderer.render(scene, camera);

    // Only request next animation frame if game is running
    if (!isPaused && gameSTART) {
        animationId = requestAnimationFrame(animation);
    }
}

function generateNewLayer() {
    // Get the current top layer's width and depth
    const topLayer = stack[stack.length - 1];
    const width = topLayer.width;
    const depth = topLayer.depth;

    // Alternate movement direction for the new layer
    const direction = stack.length % 2 === 0 ? 'x' : 'z';

    // Set position for the new layer based on the direction and previous layer's position
    const x = direction === 'x' ? -10 : topLayer.threejs.position.x;
    const z = direction === 'z' ? -10 : topLayer.threejs.position.z;

    // Add the new layer using the same dimensions (width, depth) as the current layer
    addLayer(x, z, width, depth, direction);
}

// Initializes the game by setting up the scene, camera, renderer, and initial layers
function init() {
    // Initialize the Cannon.js physics world with gravity and a broadphase collision strategy
    world = new CANNON.World();
    world.gravity.set(0, -10, 0);  // Gravity pulls objects down along the Y-axis
    world.broadphase = new CANNON.NaiveBroadphase();  // Simple broadphase for performance
    world.solver.iterations = 40;  // Increase solver iterations for stable physics

    // Create the Three.js scene where objects will be rendered
    scene = new THREE.Scene();
    const canvas = document.querySelector('canvas.webgl');  // Get the canvas from the DOM

    // Add the initial foundation layer at the bottom (stationary)
    addLayer(0, 0, originalBoxSize, originalBoxSize);

    // Add the first moving layer, starting off-screen to the left (moving along 'x')
    addLayer(-10, 0, originalBoxSize, originalBoxSize, 'x');

    // Add ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add directional light to simulate sunlight (shadows, highlights)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(10, 20, 0);  // Position the light above and to the side
    scene.add(directionalLight);

    // Set up an orthographic camera to provide a flat, 2D-like perspective
    const width = 10;
    const height = width * (window.innerHeight / window.innerWidth);  // Maintain aspect ratio
    camera = new THREE.OrthographicCamera(
        width / -2, width / 2, height / 2, height / -2, 1, 100
    );
    camera.position.set(4, 4, 4);  // Position the camera above and to the side
    camera.lookAt(0, 0, 0);  // Make the camera look at the origin (0,0,0)

    // Initialize the WebGL renderer and link it to the canvas
    renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setSize(window.innerWidth, window.innerHeight);  // Fullscreen rendering
    renderer.render(scene, camera);  // Render the initial frame

    // Handle resizing the window by updating the camera and renderer
    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;  // Adjust aspect ratio
        camera.updateProjectionMatrix();  // Update the camera projection
        renderer.setSize(window.innerWidth, window.innerHeight);  // Resize renderer
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));  // Handle high-DPI displays
    });
}

//BUTTONS: 
const startBtn = document.getElementById('start-btn');
const volumeBtn = document.getElementById('volume-btn');
const infoModal = document.getElementById('info-modal');

const menuMusic = document.getElementById("menu-music");

//pause & restart
document.getElementById("pause-btn").addEventListener("click", pauseGame);

let restartFlag = false;
let isRestarting = false;

const restartButton = document.getElementById('restart-btn')
let isRestartButtonClicked = false;

restartButton.addEventListener('click', function() {
    if (isRestartButtonClicked) return;
    isRestartButtonClicked = true;
    restartGame();

    // Reset button click flag after a small delay
    setTimeout(() => {
        isRestartButtonClicked = false;
    }, 1000); // Adjust this delay if needed
});

//info
const infoIcon = document.getElementById("toggle-info");

// Toggle the modal visibility when the icon is clicked
infoIcon.addEventListener("click", () => {
    if (infoModal.style.display === "none" || infoModal.style.display === "") {
        infoModal.style.display = "block";
    } else {
        infoModal.style.display = "none";
    }
});

// Start Game Event
startBtn.addEventListener('click', () => {
    document.getElementById('main-menu').style.display = 'none';
    menuMusic.pause();
    menuMusic.currentTime = 0; // Reset to start
    
    startGame(); // Placeholder function to start the Three.js game
});

// Toggle Volume Event
volumeBtn.addEventListener("click", () => {
    if (menuMusic.paused) {
        menuMusic.play();
    } else {
        menuMusic.pause();
    }
});

// Placeholder Game Start Function
function startGame() {
    console.log("Game Started");
    init();
    gameSTART = true;
    isPaused = false;
    animationId = requestAnimationFrame(animation);
    updateButtonVisibility();
}

function handleInput() {
    if (!gameSTART || isPaused) return;

    const topLayer = stack[stack.length - 1];
    const previousLayer = stack[stack.length - 2];

    const direction = topLayer.direction;
    const delta = topLayer.threejs.position[direction] - previousLayer.threejs.position[direction];

    const overhangSize = Math.abs(delta);
    const size = direction === 'x' ? topLayer.width : topLayer.depth;
    const overlap = size - overhangSize;

    if (overlap > 0) {
        // Successful stack: cut the box and add a new layer
        cutBox(topLayer, overlap, size, delta);

            const overhangShift = (overlap / 2 + overhangSize / 2) * Math.sign(delta);
            const overhangX = direction === 'x'
                ? topLayer.threejs.position.x + overhangShift
                : topLayer.threejs.position.x;
            const overhangZ = direction === 'x'
                ? topLayer.threejs.position.z
                : topLayer.threejs.position.z + overhangShift;
            const overhangWidth = direction === 'x' ? overhangSize : topLayer.width;
            const overhangDepth = direction === 'z' ? overhangSize : topLayer.depth;

            addOverhang(overhangX, overhangZ, overhangWidth, overhangDepth);

            // Add the next layer
            const nextX = direction === 'x' ? topLayer.threejs.position.x : -10;
            const nextZ = direction === 'z' ? topLayer.threejs.position.z : -10;
            const newDirection = direction === 'x' ? 'z' : 'x';

            addLayer(nextX, nextZ, topLayer.width, topLayer.depth, newDirection);
    } else {
        // Missed stack, game over
        gameOver();
    }
    updatePhysics();
}

// Add event listeners for both click and spacebar key press
window.addEventListener('click', handleInput);

window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
        handleInput();
    }
});