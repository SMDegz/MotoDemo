const scene = new THREE.Scene();
scene.background = new THREE.Color(0x081018);
scene.fog = new THREE.Fog(0x081018, 38, 130);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(57, innerWidth / innerHeight, .1, 300);
const clock = new THREE.Clock();
const up = new THREE.Vector3(0, 1, 0);
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => keys[e.code] = false);

scene.add(new THREE.HemisphereLight(0x9bcde1, 0x18222a, 2.0));
const sun = new THREE.DirectionalLight(0xffeed6, 2.6); sun.position.set(-42, 56, -26); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -70; sun.shadow.camera.right = sun.shadow.camera.top = 70; scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(260, 260), new THREE.MeshStandardMaterial({ color: 0x263038, roughness: .92 }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const grid = new THREE.GridHelper(250, 50, 0x42616b, 0x344a52); grid.position.y = .012; scene.add(grid);

function box(w, h, d, color, x, z) { const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({ color, roughness: .75 })); m.position.set(x,h/2,z); m.castShadow = m.receiveShadow = true; scene.add(m); }
for (let i = -54; i <= 54; i += 18) { box(.7,.7,15,0xf1e0ae,i,-34); box(.7,.7,15,0xf1e0ae,i,34); }
for (let i = -34; i <= 34; i += 17) { box(15,.7,.7,0xf1e0ae,-54,i); box(15,.7,.7,0xf1e0ae,54,i); }
for (let i = 0; i < 20; i++) { const a = i * 2.4; const r = 73 + (i % 4) * 10; box(2 + i % 3, 4 + (i % 5) * 2, 2 + (i % 2), 0x17242c, Math.cos(a)*r, Math.sin(a)*r); }

const bike = new THREE.Group(); scene.add(bike);
const dark = new THREE.MeshStandardMaterial({ color: 0x111419, roughness: .5, metalness: .5 });
const red = new THREE.MeshStandardMaterial({ color: 0xdc3d2e, roughness: .35, metalness: .25 });
const chromeMat = new THREE.MeshStandardMaterial({ color: 0xaec7cf, roughness: .25, metalness: .8 });
function mesh(geo, mat, pos, parent = bike) { const o = new THREE.Mesh(geo, mat); o.position.copy(pos); o.castShadow = o.receiveShadow = true; parent.add(o); return o; }
const frame = new THREE.Group(); bike.add(frame);
mesh(new THREE.BoxGeometry(.52,.35,1.82), red, new THREE.Vector3(0,.87,0), frame).rotation.x = -.15;
mesh(new THREE.BoxGeometry(.42,.17,.82), dark, new THREE.Vector3(0,1.08,-.38), frame).rotation.x = -.17;
mesh(new THREE.CylinderGeometry(.23,.30,.65,12), red, new THREE.Vector3(0,.84,.68), frame).rotation.x = Math.PI/2;
const wheelGeo = new THREE.CylinderGeometry(.37,.37,.18,18); wheelGeo.rotateZ(Math.PI / 2);
function wheel(z) { const group = new THREE.Group(); group.position.set(0,.39,z); frame.add(group); mesh(wheelGeo, dark, new THREE.Vector3(), group); mesh(new THREE.CylinderGeometry(.13,.13,.195,12), chromeMat, new THREE.Vector3(), group).rotation.z = Math.PI/2; return group; }
const rearWheel = wheel(1.04);
const fork = new THREE.Group(); fork.position.set(0,.77,-1.00); frame.add(fork);
mesh(new THREE.BoxGeometry(.09,.72,.09), chromeMat, new THREE.Vector3(-.18,.05,-.08), fork).rotation.x = -.33;
mesh(new THREE.BoxGeometry(.09,.72,.09), chromeMat, new THREE.Vector3(.18,.05,-.08), fork).rotation.x = -.33;
const frontWheel = new THREE.Group(); frontWheel.position.set(0,-.28,-.27); fork.add(frontWheel); mesh(wheelGeo, dark, new THREE.Vector3(), frontWheel); mesh(new THREE.CylinderGeometry(.13,.13,.195,12), chromeMat, new THREE.Vector3(), frontWheel).rotation.z = Math.PI/2;
mesh(new THREE.BoxGeometry(.92,.06,.06), chromeMat, new THREE.Vector3(0,.47,-.16), fork);
mesh(new THREE.SphereGeometry(.14,12,8), new THREE.MeshStandardMaterial({ color: 0xffefb2, emissive: 0xffb72e, emissiveIntensity: 1 }), new THREE.Vector3(0,.18,-.62), fork);

const tireMarks = new THREE.Group(); scene.add(tireMarks);
const markGeo = new THREE.PlaneGeometry(.12, .8);
const markMat = new THREE.MeshBasicMaterial({ color: 0x101317, transparent: true, opacity: .43, depthWrite: false });
const smoke = [];
const smokeMat = new THREE.MeshBasicMaterial({ color: 0xc5d4d4, transparent: true, opacity: .32, depthWrite: false });
for (let i=0; i<45; i++) { const s = new THREE.Sprite(smokeMat.clone()); s.visible = false; s.scale.set(1,1,1); scene.add(s); smoke.push({ s, life: 0 }); }
let smokeCursor = 0, markTimer = 0;
function emitSmoke(pos) { const p = smoke[smokeCursor++ % smoke.length]; p.life = 1; p.s.visible = true; p.s.position.copy(pos).add(new THREE.Vector3((Math.random()-.5)*.28,.2,(Math.random()-.5)*.28)); p.s.scale.set(.25,.25,.25); }

// 模型的车头位于局部 -Z；动力学、镜头和模型统一使用这一朝向。
const state = { x: 0, z: 4, yaw: 0, v: 0, lateral: 0, yawRate: 0, steer: 0 };
const LF = .92, LR = .98, MASS = 230, IZZ = 260, maxSteer = .48;
function clamp(v,a,b) { return Math.max(a, Math.min(b,v)); }
function damp(v, target, rate, dt) { return THREE.MathUtils.damp(v, target, rate, dt); }

function updatePhysics(dt) {
  const throttle = keys.ArrowUp ? 1 : 0, brake = keys.ArrowDown ? 1 : 0;
  const steerInput = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
  const drifting = (keys.ShiftLeft || keys.ShiftRight) && Math.abs(state.v) > 5;
  const steerLimit = maxSteer * (1 - clamp(Math.abs(state.v) / 52, 0, .40));
  state.steer = damp(state.steer, steerInput * steerLimit, 10, dt);
  const direction = Math.sign(state.v || 1);
  let longitudinal = throttle * 16 - brake * (state.v * direction > .5 ? 27 * direction : 9);
  longitudinal -= state.v * Math.abs(state.v) * .0105 + state.v * .27;
  if (!throttle && !brake && Math.abs(state.v) < .12) state.v = 0;
  const safeV = Math.max(1.8, Math.abs(state.v));
  const af = Math.atan2(state.lateral + LF * state.yawRate, safeV) - state.steer * direction;
  const ar = Math.atan2(state.lateral - LR * state.yawRate, safeV);
  const cf = 5300, cr = drifting ? 1150 : 6400;
  const frontFy = clamp(-cf * af, -MASS*15, MASS*15);
  const rearFy = clamp(-cr * ar, -MASS*(drifting ? 4.1 : 15), MASS*(drifting ? 4.1 : 15));
  state.v += (longitudinal + state.yawRate * state.lateral) * dt;
  state.v = clamp(state.v, -12, 53);
  state.lateral += ((frontFy + rearFy) / MASS - state.yawRate * state.v) * dt;
  state.yawRate += (LF * frontFy - LR * rearFy) / IZZ * dt;
  state.lateral = clamp(state.lateral, -22, 22);
  state.yaw += state.yawRate * dt;
  const forward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
  const right = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
  state.x += (forward.x * state.v + right.x * state.lateral) * dt;
  state.z += (forward.z * state.v + right.z * state.lateral) * dt;
  bike.position.set(state.x, .02, state.z); bike.rotation.y = state.yaw;
  fork.rotation.y = state.steer;
  rearWheel.rotation.x -= state.v * dt / .37; frontWheel.rotation.x -= state.v * dt / .37;
  const lean = clamp(-state.steer * Math.abs(state.v) * .095 - state.lateral * .018, -.58, .58);
  frame.rotation.z = damp(frame.rotation.z, lean, 8, dt);
  const slipAngle = Math.atan2(state.lateral, Math.max(1, Math.abs(state.v))) * direction;
  return { drifting, slipAngle };
}

const speedEl = document.querySelector('#speed'), slipEl = document.querySelector('#slip'), driftEl = document.querySelector('#drift-state');
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .033);
  const { drifting, slipAngle } = updatePhysics(dt);
  const rear = new THREE.Vector3(0,.03,1.05).applyMatrix4(bike.matrixWorld);
  const energetic = drifting && Math.abs(state.v) > 9 && Math.abs(slipAngle) > .10;
  markTimer -= dt;
  if (energetic && markTimer <= 0) { markTimer = .075; const m = new THREE.Mesh(markGeo, markMat.clone()); m.position.copy(rear); m.position.y = .025; m.rotation.x = -Math.PI/2; m.rotation.z = -state.yaw; tireMarks.add(m); if (tireMarks.children.length > 420) tireMarks.remove(tireMarks.children[0]); emitSmoke(rear); }
  for (const p of smoke) if (p.life > 0) { p.life -= dt * .75; if (p.life <= 0) p.s.visible = false; else { p.s.position.y += dt*.5; p.s.scale.addScalar(dt*.8); p.s.material.opacity = p.life * .26; } }
  const forward = new THREE.Vector3(-Math.sin(state.yaw),0,-Math.cos(state.yaw));
  const right = new THREE.Vector3(Math.cos(state.yaw),0,-Math.sin(state.yaw));
  const camTarget = bike.position.clone().add(new THREE.Vector3(0, .7, 0));
  const desiredCam = bike.position.clone().addScaledVector(forward, -8.5 - Math.abs(state.v)*.065).addScaledVector(right, -state.lateral*.08).add(new THREE.Vector3(0,4.3,0));
  camera.position.lerp(desiredCam, 1 - Math.exp(-dt*4)); camera.lookAt(camTarget);
  speedEl.textContent = String(Math.round(Math.abs(state.v)*3.6)).padStart(3,'0'); slipEl.textContent = (slipAngle * 180 / Math.PI).toFixed(1);
  driftEl.textContent = energetic ? 'DRIFT' : 'GRIP'; driftEl.classList.toggle('active', energetic);
  renderer.render(scene,camera);
}
addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
document.querySelector('#loading').classList.add('done');
animate();
