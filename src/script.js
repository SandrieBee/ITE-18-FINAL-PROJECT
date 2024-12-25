import * as THREE from 'three'
import * as CANNON from 'cannon-es'

// Global variables:
let camera, scene, renderer, world;
const originalBoxSize = 3.5;  //initial width and depth of the first box in the stack
let stack = [];  //store the stacked layers (each layer is an object containing its Three.js and Cannon.js representations)
let overhangs = [];  //store falling or overhanging parts of the boxes
const boxHeight = 1.2;  //height of each box layer
let gameSTART = false;  //boolean to track if the game has started (controls the animation loop)
let isPaused = false; //pausegame 
let boxSpeed = 0.09; //default box movement speed
const initialBoxSpeed = 0.095; //initial speed for resets
let score = 0;  //initialize the score
let animationId = null;


// Generates a box in the 3D world and physics engine
function generateBox(x, y, z, width, depth, falls) {
    // Create the geometry for the box in Three.js
    const boxGeometry = new THREE.BoxGeometry(width, boxHeight, depth);
    
    const hue = Math.min(120, 30 + stack.length * 3)
    const lightness = Math.min(50, 30 + stack.length * 0.5)
    const color = new THREE.Color(`hsl(${hue}, 100%, ${lightness}%)`)
    
    const boxMaterial = new THREE.MeshLambertMaterial({ color })

    const box = new THREE.Mesh(boxGeometry, boxMaterial)
    box.position.set(x, y, z);
    scene.add(box);  

    // corresponding physics body in Cannon.js
    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, boxHeight / 2, depth / 2));
    
    // If the box is an overhang (falls), assign a mass, otherwise set it to 0 (static)
    let mass = falls ? 5 : 0;
    
    // body with the specified mass and shape
    const body = new CANNON.Body({ mass, shape });
    body.position.set(x, y, z);  // Set the position of the body
    world.addBody(body);  // Add the body to the physics simulation

    // Return both the Three.js mesh and Cannon.js body, along with the dimensions
    return {
        threejs: box,  // Visual representation in Three.js
        cannonjs: body,  // Physical representation in Cannon.js
        width,  
        depth,  
    };
}

// Adds a new layer to the stack, either as the foundation or a moving layer
function addLayer(x, z, width, depth, direction, incrementScore = true) {
    // Calculate the vertical position based on the number of existing layers
    const y = boxHeight * stack.length;
    // Create the new layer using generateBox (falls is false because it’s part of the stack)
    const layer = generateBox(x, y, z, width, depth, false);
    // Assign the movement direction for the new layer ('x' or 'z')
    layer.direction = direction;
    // Add the new layer to the stack array for tracking
    stack.push(layer);

    if (incrementScore) {
        score++;
        updateScore();
    }
}

// Adds an overhang to the scene when the top layer is partially cut off
function addOverhang(x, z, width, depth) {
    // Place the overhang at the height of the current top layer
    const y = boxHeight * (stack.length - 1);
    // Generate the overhanging box (falls is true since it should fall due to gravity)
    const overhang = generateBox(x, y, z, width, depth, true)
    // Add the overhang to the overhangs array to track falling pieces
    overhangs.push(overhang)
}

// Updates the physics simulation for overhanging boxes
function updatePhysics() {
    world.step(1 / 60)  // Step the physics simulation at 60 fps

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
    const newWidth = direction === 'x' ? overlap : topLayer.width;
    const newDepth = direction === 'z' ? overlap : topLayer.depth; 

    //update the Three.js properties to visually represent the cut
    topLayer.threejs.scale[direction === 'x' ? 'x' : 'z'] = overlap / size;  //Shrink the box
    topLayer.threejs.position[direction] -= delta / 2;  //Adjust position to center the cut

    // Update the Cannon.js physics body for the trimmed box
    topLayer.cannonjs.position[direction] -= delta / 2;  //sync with Three.js position adjustment

    //Create a new shape with the updated dimensions for the physics engine
    const newShape = new CANNON.Box(new CANNON.Vec3(newWidth / 2, boxHeight / 2, newDepth / 2));
    
    topLayer.cannonjs.shapes = [];  //clear existing shapes to replace with the new one
    topLayer.cannonjs.addShape(newShape);  //add the new shape to the physics body

    // Update the metadata for the trimmed layer
    topLayer.width = newWidth; 
    topLayer.depth = newDepth;  
}


function generateNewLayer(incrementScore = true) {
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
    addLayer(x, z, width, depth, direction, false);
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


    function addTexturedSphere() {
        // Add background image to the scene
        const textureLoader = new THREE.TextureLoader();
        const backgroundTexture = textureLoader.load('/background1.jpg'); // Replace with the path to your background image
        scene.background = backgroundTexture;

        // Create Earth sphere geometry
        const sphereGeometry = new THREE.SphereGeometry(100, 32, 32);
    
        // Load Earth texture
        const earthTexture = textureLoader.load('/earth.jpeg'); // Adjust path as needed
    
        // Create material for Earth
        const sphereMaterial = new THREE.MeshStandardMaterial({
            map: earthTexture,
        });
    
        // Create Earth mesh
        const earthSphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    
        // Position the Earth sphere
        earthSphere.rotation.x = Math.PI / 2; // Rotate 90 degrees around the X-axis
        earthSphere.rotation.y = Math.PI / 2.4;
        earthSphere.position.set(0, -105, 0);
    
        // Add Earth to the scene
        scene.add(earthSphere);
    
        // Create Moon sphere geometry
        const moonGeometry = new THREE.SphereGeometry(2, 32, 32); // Moon is smaller
        // Load Moon texture
        const moonTexture = textureLoader.load('/moon.jpg'); // Adjust path as needed
        // Create material for Moon
        const moonMaterial = new THREE.MeshStandardMaterial({
            map: moonTexture,
        });
        // Create Moon mesh
        const moonSphere = new THREE.Mesh(moonGeometry, moonMaterial);
        // Position the Moon relative to Earth
        moonSphere.position.set(-20, 9, -15); // Adjust distance and position relative to Earth
        // Add Moon to the scene
        scene.add(moonSphere);

        // Create Mars sphere geometry
        const marsGeometry = new THREE.SphereGeometry(4.2, 32, 32); // Mars is smaller
        const marsTexture = textureLoader.load('/mars.jpg'); // Adjust path as needed
        const marsMaterial = new THREE.MeshStandardMaterial({
            map: marsTexture,
        });
        const marsSphere = new THREE.Mesh(marsGeometry, marsMaterial);
        marsSphere.position.set(-40, 10, -47);
        scene.add(marsSphere);

        // Create Jupiter sphere geometry
        const jupiterGeometry = new THREE.SphereGeometry(0.3, 32, 32); // Jupiter is smaller
        const jupiterTexture = textureLoader.load('/jupiter.jpg'); // Adjust path as needed
        const jupiterMaterial = new THREE.MeshStandardMaterial({
            map: jupiterTexture,
        });
        const jupiterSphere = new THREE.Mesh(jupiterGeometry, jupiterMaterial);
        jupiterSphere.position.set(-25, 35, -17);
        scene.add(jupiterSphere);

        // Create Venus sphere geometry
        const venusGeometry = new THREE.SphereGeometry(0.1, 32, 32); // Venus is smaller
        const venusTexture = textureLoader.load('/venus.jpg'); // Adjust path as needed
        const venusMaterial = new THREE.MeshStandardMaterial({
            map: venusTexture,
        });
        const venusSphere = new THREE.Mesh(venusGeometry, venusMaterial);
        venusSphere.position.set(-24, -8, -30);
        scene.add(venusSphere);

    }
    
    addTexturedSphere();

    // Add the initial foundation layer at the bottom (stationary)
    addLayer(0, 0, originalBoxSize, originalBoxSize, false);

    // Add the first moving layer, starting off-screen to the left (moving along 'x')
    addLayer(-10, 0, originalBoxSize, originalBoxSize, 'x', false);

    // Add ambient light for overall illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    // Add directional light to simulate sunlight (shadows, highlights)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.6);
    directionalLight.position.set(10, 20, 0);  
    scene.add(directionalLight);

    const width = 15;
    const height = width * (window.innerHeight / window.innerWidth);  // Maintain aspect ratio
    camera = new THREE.OrthographicCamera(
        width / -2, width / 2, height / 2, height / -2, 1, 100
    );
    camera.position.set(6, 6, 6);  // Position the camera above and to the side
    camera.lookAt(0, 0, 0);  


    renderer = new THREE.WebGLRenderer({ canvas });
    renderer.setSize(window.innerWidth, window.innerHeight);  // Fullscreen rendering
    renderer.render(scene, camera);  // Render the initial frame

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;  // Adjust aspect ratio
        camera.updateProjectionMatrix();  // Update the camera projection
        renderer.setSize(window.innerWidth, window.innerHeight);  // Resize renderer
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));  // Handle high-DPI displays
    });
}

let isEndingTriggered = false;

function animation() {
    if (isRestarting && gameSTART) {
        
        return;
    } else {
        let speed = boxSpeed; 

        const topLayer = stack[stack.length - 1];
        topLayer.threejs.position[topLayer.direction] += speed;
        topLayer.cannonjs.position[topLayer.direction] += speed;

        const position = topLayer.threejs.position[topLayer.direction];
        if (Math.abs(position) > 10) {
            stack.pop();
            generateNewLayer(false); // Do not increment score when generating a new layer on a miss
        }

        if (camera.position.y < boxHeight * (stack.length - 2) + 4) {
            camera.position.y += speed;
        }

       
            // Stop the game after stacking 50 blocks
        if (score === 50 && !isEndingTriggered) {
            isEndingTriggered = true; // Prevent further triggers
            showEndingImage(); // Show the ending image
            playCongratulationsSound(); // Play the sound once
        
            setTimeout(() => {
                let userchoice = confirm(
                    "HURRAY! Zyck finally made it back to his home planet. Thank you, fellow player, for helping him stack 50 boxes! Press OK to go back to the main menu."
                );
                if (userchoice) {
                    goToMainMenu();
                }
                else{
                    restartGame();
                    isEndingTriggered = false;
                    isRestarting = true;
                }
            }, 500); // Optional: Adjust the delay for better visuals
        }
        
        updatePhysics();
        renderer.render(scene, camera);


        animationId = requestAnimationFrame(animation);
    }
}

function gameOver() {
    if (!gameSTART) {
        console.warn("gameOver() called, but gameSTART is false. Ignoring.");
        return;
    }

    console.log("Game Over!");

    // Stop the animation
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    // Reset the game state
    gameSTART = false;

    const userChoice = confirm("Game Over! Do you want to go back to the main menu? (Press 'Cancel' to restart the game)");
    if (userChoice) {
        goToMainMenu();
    } else {
        restartGame();
    }
}

function showEndingImage() {
    const endingImage = document.getElementById('ending-image');

    if (endingImage) {
        endingImage.style.display = 'block'; // Make the image visible
    }

    console.log("Congratulations! You've completed the stack!");
    
    // Stop the animation if it's already running
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }

    gameSTART = false; // Stop the game

    // Animate the image
    let angle = 0; // start angle for the shake effect
    const shakeSpeed = 0.05; //speed of shaking (smaller value for slower shake)
    const shakeAmplitude = 5; //maximum shaking distance in pixels

    function animateImage() {
        // Update the shake angle
        angle += shakeSpeed;
        
        // Calculate the displacement
        const offsetX = Math.sin(angle) * shakeAmplitude; // Horizontal shake
        const offsetY = Math.cos(angle) * shakeAmplitude * 0.5; // Vertical shake

        // Apply the transformation to shake the image
        endingImage.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px)`; 

        // Continue animation
        if (!gameSTART) {
            requestAnimationFrame(animateImage);
        }
    }

    // Start the shake animation
    animateImage();

}
// Function to handle going back to the main menu
function goToMainMenu() {
    console.log("Returning to the main menu...");
    window.location.reload();
}

function updateButtonVisibility() {
  
    const infoIcon = document.getElementById("toggle-info");
    const startBtn = document.getElementById('start-btn');
    const volumeBtn = document.getElementById('volume-btn');

    // Check if the buttons exist before accessing their properties
    if (infoIcon) infoIcon.style.display = 'none';
    if (startBtn) startBtn.style.display = 'none';
    if (volumeBtn) volumeBtn.style.display = 'none';

    console.log("Button visibility updated.");
}

let restartFlag = false;
let isRestarting = false;

function restartGame() {
    if (restartFlag && isRestarting) return; // Prevent restarting if already in progress
    isRestarting = true;
    restartFlag = true;

    // Stop the animation loop completely
    if (animationId !== null) {
        cancelAnimationFrame(animationId);
        animationId = null;
    }
    renderer.setAnimationLoop(null);
    const endingImage = document.getElementById('ending-image');
        if (endingImage) {
            endingImage.style.display = 'none'; // Make the image visible
    }

    console.log("Resetting game state and Three.js objects...");
    // Reset game variables and state
    stack = [];
    score = 0;
    updateScore();
    overhangs = [];
    gameSTART = false;
    boxSpeed = initialBoxSpeed;
    isPaused = false;

   while (scene.children.length > 0) {
    const child = scene.children[0];
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
        if (Array.isArray(child.material)) {
            child.material.forEach(mat => mat.dispose());
        } else {
            child.material.dispose();
        }
    }
    scene.remove(child);
}

    while (world.bodies.length > 0) {
        world.removeBody(world.bodies[0]);
    }

    // Reset camera position
    camera.position.set(4, 4, 4);
    camera.lookAt(0, 0, 0);

    // Reinitialize game state
    init();

    // Restart the animation loop after a brief delay
    setTimeout(() => {
        isRestarting = false;
        restartFlag = false;
        gameSTART = true; // Set gameSTART to true to begin the game immediately
        animationId = requestAnimationFrame(animation); // Start the animation loop
        console.log("Game Restarted Successfully");
    }, 500);
}

//BUTTONS: 
document.getElementById('score').style.display = 'none'; // Hide the score initially


// Function to update the score
function updateScore() {
    const scoreElement = document.getElementById('score');
    if (scoreElement.style.display !== 'none') {
        scoreElement.innerText = `${score} / 50`; // Update the score text
    }
    playSoundEffect(score) 
}

//info
const infoModal = document.getElementById('info-modal');
const infoIcon = document.getElementById("toggle-info");
const stars = document.getElementById("starry-sky")
// Toggle the modal visibility when the icon is clicked
infoIcon.addEventListener("click", (event) => {
    event.stopPropagation()
    if (infoModal.style.display === "none" || infoModal.style.display === "") {
        infoModal.style.display = "block";
    } else {
        infoModal.style.display = "none";
    }
});

const startBtn = document.getElementById('start-btn');
const volumeBtn = document.getElementById('volume-btn');
const menuMusic = document.getElementById("menu-music");
// Start Game Event
startBtn.addEventListener('click', (event) => {
    event.stopPropagation()
    document.getElementById('main-menu').style.display = 'none';
   stars.style.display = 'none';
    infoIcon.style.display = 'none';
    infoModal.style.display = 'none';
    menuMusic.pause();
    menuMusic.currentTime = 0; // Reset to start
    
    startGame(); 
});

// Toggle Volume Event
volumeBtn.addEventListener("click", (event) => {
    event.stopPropagation()
    if (menuMusic.paused) {
        menuMusic.play();
    } else {
        menuMusic.pause();
    }
});

// Placeholder Game Start Function
function startGame() {
    console.log("Game Started");

    gameSTART = true;
    const scoreElement = document.getElementById('score');
    scoreElement.style.display = 'block';

    window.removeEventListener('click', handleInput);
    window.addEventListener('click', handleInput);
    // Initialize game components
    init();
    updateButtonVisibility();
    animationId = requestAnimationFrame(animation); // Start the animation loop
}

const stackingSound = new Audio("/soundEffect.mp3");
const soundffect2 = new Audio("/soundeffect2.mp3");

function playStackingSound() {
    stackingSound.currentTime = 0; // Reset sound to the beginning
    stackingSound.play().catch((error) => {
        console.error("Error playing stacking sound:", error);
    });
}

function playCongratulationsSound() {
    const congratulationsSound = new Audio("/congratulatorymusic.mp3");
    console.log("congratulatorymusic started")
    congratulationsSound.currentTime = 0; // Reset sound to the beginning
    congratulationsSound.play().catch((error) => {
        console.error("Error playing congratulations sound:", error);
    });
}

function playSoundEffect(score) {
    if (score === 10 || score === 20 || score === 30 || score === 40) {
        soundffect2.currentTime = 0; // Reset sound to the beginning
        soundffect2.play().catch((error) => {
        console.error("Error playing stacking sound:", error);
    });
    }
}

function handleInput() {
    if (!gameSTART) {
        gameSTART = true;
        animationId = requestAnimationFrame(animation);
        return;
    
    }else if (gameSTART){
        const topLayer = stack[stack.length - 1];
        const previousLayer = stack[stack.length - 2];

        const direction = topLayer.direction;
        const delta = topLayer.threejs.position[direction] - previousLayer.threejs.position[direction];

        const overhangSize = Math.abs(delta);
        const size = direction === 'x' ? topLayer.width : topLayer.depth;
        const overlap = size - overhangSize;

        if (overlap > 0) {

            playStackingSound()
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
            gameOver();
            gameSTART = false;
            updatePhysics();
            restartGame()
        }
    }
}

// Add event listeners for both click and spacebar key press
window.addEventListener('click', handleInput);

window.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
        handleInput();
        event.preventDefault();  // Prevent page scrolling when spacebar is pressed
    }
});