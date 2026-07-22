const scene = new THREE.Scene();
scene.background = new THREE.Color(0xaaa18d);
scene.fog = new THREE.Fog(0xaaa18d, 30, 145);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(57, innerWidth / innerHeight, .1, 300);
const clock = new THREE.Clock();
const up = new THREE.Vector3(0, 1, 0);
const keys = {};
addEventListener('keydown', e => { keys[e.code] = true; if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight'].includes(e.code)) e.preventDefault(); });
addEventListener('keyup', e => keys[e.code] = false);

scene.add(new THREE.HemisphereLight(0xc7c0ad, 0x3c3124, 2.1));
const sun = new THREE.DirectionalLight(0xffe6bd, 2.0); sun.position.set(-42, 56, -26); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = sun.shadow.camera.bottom = -70; sun.shadow.camera.right = sun.shadow.camera.top = 70; scene.add(sun);

function makeTexture(size, draw) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d'); draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}
const sandTexture = makeTexture(256, (ctx, s) => {
  ctx.fillStyle = '#806649'; ctx.fillRect(0,0,s,s);
  for (let i=0;i<4200;i++) { const c=80+Math.random()*65, a=.08+Math.random()*.22; ctx.fillStyle=`rgba(${c+35},${c},${Math.max(20,c-30)},${a})`; ctx.fillRect(Math.random()*s,Math.random()*s,1+Math.random()*2,1); }
  for (let i=0;i<45;i++) { ctx.strokeStyle='rgba(55,42,28,.16)'; ctx.lineWidth=1+Math.random()*2; ctx.beginPath(); ctx.moveTo(Math.random()*s,Math.random()*s); ctx.lineTo(Math.random()*s,Math.random()*s); ctx.stroke(); }
}); sandTexture.repeat.set(42,42);
const asphaltTexture = makeTexture(256, (ctx, s) => {
  ctx.fillStyle='#292724'; ctx.fillRect(0,0,s,s);
  for (let i=0;i<6200;i++) { const c=35+Math.random()*35; ctx.fillStyle=`rgba(${c},${c},${c-2},${.15+Math.random()*.25})`; ctx.fillRect(Math.random()*s,Math.random()*s,1,1); }
  ctx.strokeStyle='rgba(7,7,6,.42)'; ctx.lineWidth=1.2; for(let i=0;i<22;i++){const x=Math.random()*s,y=Math.random()*s;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.random()*30-15,y+Math.random()*26-13);ctx.stroke();}
}); asphaltTexture.repeat.set(1,72);
const textureLoader = new THREE.TextureLoader();
function loadMaterialTexture(path, repeatX, repeatY, isColor = false) {
  const texture = textureLoader.load(path);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  if (isColor) texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
const terrainMap = loadMaterialTexture('./assets/textures/ground_rock_diff_1k.jpg', 42, 42, true);
const terrainNormal = loadMaterialTexture('./assets/textures/ground_rock_normal_1k.jpg', 42, 42);
const roadMap = loadMaterialTexture('./assets/textures/asphalt_diff_1k.jpg', 1, 1, true);
const roadNormal = loadMaterialTexture('./assets/textures/asphalt_normal_1k.jpg', 1, 1);

// 同一套高度函数同时驱动地形与车辆离地高度，形成可驾驶的起伏山地。
// 长距离闭环：从峡谷出发，经连续发卡弯登上山脊，再沿另一侧下山回到起点。
const loopPoints = [
  [0, 3, 8], [-4, 10, -45], [-37, 25, -96], [-89, 46, -121], [-133, 65, -72],
  [-142, 78, -4], [-116, 88, 70], [-61, 92, 125], [13, 80, 146], [80, 58, 124],
  [129, 35, 70], [143, 16, -7], [117, 5, -72], [66, 2, -116], [84, 2, -59],
  [58, 2, -10], [20, 3, 10]
].map(([x, y, z]) => new THREE.Vector3(x, y, z));
const roadCurve = new THREE.CatmullRomCurve3(loopPoints, true, 'centripetal');
const trackLength = roadCurve.getLength();
const trackGuide = Array.from({ length: 480 }, (_, i) => roadCurve.getPointAt(i / 480));
function validateTrackClearance() {
  const minimumGap = 25;
  for (let i = 0; i < trackGuide.length; i++) for (let j = i + 15; j < trackGuide.length; j++) {
    const aroundLoop = Math.min(j - i, trackGuide.length - (j - i));
    if (aroundLoop < 30) continue;
    const dx = trackGuide[i].x - trackGuide[j].x, dz = trackGuide[i].z - trackGuide[j].z;
    if (dx*dx + dz*dz < minimumGap*minimumGap) console.warn('Track sections are too close:', i, j);
  }
}
validateTrackClearance();
function nearestRoad(x, z) {
  let bestD2 = Infinity, bestT = 0;
  for (let i = 0; i < trackGuide.length; i++) {
    const a = trackGuide[i], b = trackGuide[(i + 1) % trackGuide.length];
    const abx = b.x - a.x, abz = b.z - a.z, len2 = abx*abx + abz*abz;
    const u = Math.max(0, Math.min(1, ((x-a.x)*abx + (z-a.z)*abz) / len2));
    const qx = a.x + abx*u, qz = a.z + abz*u, dx = x-qx, dz = z-qz, d2 = dx*dx + dz*dz;
    if (d2 < bestD2) { bestD2 = d2; bestT = (i + u) / trackGuide.length; }
  }
  return { point: roadCurve.getPointAt(bestT % 1), distance: Math.sqrt(bestD2), t: bestT % 1 };
}
// 路旁先急速坠入峡谷，再在远处抬升成戈壁山脉。
function terrainHeight(x, z) {
  const near = nearestRoad(x, z), d = near.distance;
  if (d < 8.5) return near.point.y - .18;
  const cliff = -Math.pow(Math.min(d - 8.5, 22) / 22, 1.1) * 28;
  const mountain = Math.pow(Math.max(0, d - 25) / 58, 1.13) * 55;
  const strata = Math.sin(x*.075 + z*.028) * 2.4 + Math.cos(z*.09 - x*.02) * 1.8;
  return near.point.y + cliff + Math.min(mountain, 72) + strata;
}
const terrainGeo = new THREE.PlaneGeometry(430, 430, 120, 120);
const terrainPos = terrainGeo.attributes.position;
const terrainColors = [];
for (let i = 0; i < terrainPos.count; i++) {
  const x = terrainPos.getX(i), z = -terrainPos.getY(i);
  const h = terrainHeight(x, z); terrainPos.setZ(i, h);
  const rock = THREE.MathUtils.clamp((h - 18) / 70, 0, 1);
  terrainColors.push(.86 - rock*.25, .68 - rock*.20, .45 - rock*.15);
}
terrainGeo.computeVertexNormals();
terrainGeo.setAttribute('color', new THREE.Float32BufferAttribute(terrainColors, 3));
const ground = new THREE.Mesh(terrainGeo, new THREE.MeshStandardMaterial({ map: terrainMap, normalMap: terrainNormal, normalScale: new THREE.Vector2(.55,.55), vertexColors: true, roughness: .98, flatShading: true }));
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

const roadMat = new THREE.MeshStandardMaterial({ map: roadMap, normalMap: roadNormal, normalScale: new THREE.Vector2(.72,.72), color: 0xc9c5ba, roughness: .83, metalness: .04 });
const roadVerts = [], roadUVs = [], roadIndices = [], samples = 560, roadWidth = 11;
for (let i = 0; i <= samples; i++) {
  const t = i / samples, p = roadCurve.getPointAt(t), tangent = roadCurve.getTangentAt(t).normalize();
  const side = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();
  const left = p.clone().addScaledVector(side, roadWidth / 2); left.y += .055;
  const right = p.clone().addScaledVector(side, -roadWidth / 2); right.y += .055;
  roadVerts.push(left.x,left.y,left.z,right.x,right.y,right.z);
  roadUVs.push(0, t * 72, 1, t * 72);
  if (i < samples) roadIndices.push(i*2,i*2+1,i*2+2, i*2+1,i*2+3,i*2+2);
}
const roadGeo = new THREE.BufferGeometry(); roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadVerts, 3)); roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUVs, 2)); roadGeo.setIndex(roadIndices); roadGeo.computeVertexNormals();
const road = new THREE.Mesh(roadGeo, roadMat); road.receiveShadow = true; scene.add(road);
const lineMat = new THREE.MeshBasicMaterial({ color: 0xd0a63f });
for (let t = 0; t < 1; t += .017) {
  const p = roadCurve.getPointAt(t), tan = roadCurve.getTangentAt(t).normalize();
  const dash = new THREE.Mesh(new THREE.BoxGeometry(.20, .035, 5.2), lineMat);
  const side = new THREE.Vector3(tan.z, 0, -tan.x).normalize();
  const normal = new THREE.Vector3().crossVectors(tan, side).normalize();
  dash.position.copy(p).addScaledVector(normal, .07);
  dash.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
  scene.add(dash);
}
const railMat = new THREE.MeshStandardMaterial({ color: 0x7b6544, roughness: .8, metalness: .25 });
for (let t = 0; t < 1; t += .032) {
  const p = roadCurve.getPointAt(t), tan = roadCurve.getTangentAt(t).normalize(), side = new THREE.Vector3(tan.z,0,-tan.x).normalize();
  for (const sign of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(.11,.6,.11), railMat); post.position.copy(p).addScaledVector(side,sign*(roadWidth/2+.35)); post.position.y+=.34; post.castShadow=true; scene.add(post); }
}
function envBox(w,h,d,color,x,z,y=0) { const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), new THREE.MeshStandardMaterial({color,roughness:.9})); m.position.set(x,y+h/2,z); m.castShadow=m.receiveShadow=true; scene.add(m); return m; }
function mountain(x,z,scale) { const g = new THREE.IcosahedronGeometry(scale,1); const m = new THREE.Mesh(g,new THREE.MeshStandardMaterial({color:0x665544,roughness:1,flatShading:true})); m.position.set(x,terrainHeight(x,z)+scale*.35,z); m.scale.y=.72; m.castShadow=true; scene.add(m); }
for (let i=0;i<52;i++) { const a=i*2.399, r=155+(i%5)*13; mountain(Math.cos(a)*r,Math.sin(a)*r,10+(i%5)*6); }
for (let i=0;i<65;i++) { const a=Math.random()*Math.PI*2, r=22+Math.random()*175, x=Math.cos(a)*r, z=Math.sin(a)*r; const rock=envBox(.5+Math.random()*1.8,.35+Math.random()*1.1,.5+Math.random()*1.4,0x5c4c3b,x,z,terrainHeight(x,z)); rock.rotation.y=Math.random()*3; }
// 废弃车辆、风化路牌与补丁护栏，让赛道有末日叙事感。
for (let i=0;i<15;i++) {
  const t=(i*.067+.035)%1, p=roadCurve.getPointAt(t), tan=roadCurve.getTangentAt(t).normalize();
  const side=new THREE.Vector3(tan.z,0,-tan.x).normalize(), sign=i%2?1:-1;
  const prop=envBox(1.7,.7,3.1,i%3?0x4a4035:0x6e3429,p.x+side.x*(roadWidth/2+2.2)*sign,p.z+side.z*(roadWidth/2+2.2)*sign,p.y-.12);
  prop.rotation.y=Math.atan2(tan.x,tan.z)+(i%2?.25:-.35); prop.rotation.z=(i%3-1)*.15;
  if (i%3===0) { const post=envBox(.12,2.5,.12,0x574b3a,p.x-side.x*(roadWidth/2+1)*sign,p.z-side.z*(roadWidth/2+1)*sign,p.y); const plate=envBox(1.3,.72,.08,0x866537,post.position.x,post.position.z,p.y+2.25); plate.rotation.y=Math.atan2(tan.x,tan.z); }
}
// 断裂高架：两段倾斜的残骸横跨沙漠公路。
for (const x of [-16,16]) for (const z of [-68,-42]) envBox(1.7,11,1.7,0x60574b,x,z);
const overpassA=envBox(19,1.4,6,0x4d4941,-8,-55,10); overpassA.rotation.z=-.08;
const overpassB=envBox(14,1.4,6,0x4d4941,13,-55,12); overpassB.rotation.z=.17;
for (const x of [-23,23]) envBox(.5,2.2,8,0x916f3b,x,-56,1.2);

function enemyBike(x,z,color=0x303137) { const g=new THREE.Group(); g.position.set(x,terrainHeight(x,z)+.1,z); const body=new THREE.Mesh(new THREE.BoxGeometry(.45,.26,1.35),new THREE.MeshStandardMaterial({color,roughness:.5})); body.position.y=.62; body.rotation.x=-.18; body.castShadow=true; g.add(body); const rider=new THREE.Mesh(new THREE.CapsuleGeometry(.18,.55,4,8),new THREE.MeshStandardMaterial({color:0x1c2020,roughness:.8})); rider.position.set(0,1.05,.08); rider.rotation.x=.35; rider.castShadow=true; g.add(rider); for (const wz of [-.72,.72]) { const w=new THREE.Mesh(new THREE.CylinderGeometry(.26,.26,.14,12),new THREE.MeshStandardMaterial({color:0x151515})); w.rotation.z=Math.PI/2; w.position.set(0,.3,wz); g.add(w); } const sword=new THREE.Mesh(new THREE.BoxGeometry(.04,.04,1.25),new THREE.MeshStandardMaterial({color:0xc5c5b6,metalness:.8,roughness:.2})); sword.position.set(.52,1.15,-.15); sword.rotation.z=-.65; sword.rotation.x=.6; g.add(sword); scene.add(g); return g; }
const enemyBikes=[enemyBike(-3,-19,0x7e3028),enemyBike(3,-34,0x302c2b),enemyBike(-2.2,-53,0x5a543b),enemyBike(3.4,-77,0x46373b)];
enemyBikes.forEach((bike, i) => { bike.userData.t = (nearestRoad(bike.position.x, bike.position.z).t + i*.018) % 1; bike.userData.speed = .010 + i*.0018; });

const bike = new THREE.Group(); scene.add(bike);
const detailedBike = new THREE.Group(); detailedBike.visible = false; bike.add(detailedBike);
function installDetailedBike(gltf) {
  const model = gltf.scene;
  model.traverse(node => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
  model.scale.setScalar(2.35 / Math.max(size.x, size.z)); model.updateMatrixWorld(true);
  const scaledBounds = new THREE.Box3().setFromObject(model), center = scaledBounds.getCenter(new THREE.Vector3());
  model.position.x -= center.x; model.position.z -= center.z; model.position.y -= scaledBounds.min.y;
  // glTF 已是 Y-up；只将模型的 X-forward 朝向转换为场景使用的 -Z-forward。
  const headingFix = new THREE.Group();
  headingFix.rotation.y = Math.PI / 2;
  headingFix.add(model); detailedBike.add(headingFix); detailedBike.visible = true;
  frame.visible = false;
  document.querySelector('#loading').classList.add('done');
}
function loadDetailedModel() {
  const loader = new window.GLTFLoader();
  loader.load('./assets/models/motorcycle.glb', installDetailedBike, undefined, error => {
    console.warn('Could not load motorcycle model:', error);
    frame.visible = true;
    document.querySelector('#loading').textContent = 'Model loading failed — using fallback bike.';
    document.querySelector('#loading').classList.add('done');
  });
}
if (window.GLTFLoader) loadDetailedModel();
else window.addEventListener('gltf-loader-ready', loadDetailedModel, { once: true });
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
mesh(new THREE.SphereGeometry(.10,10,8), new THREE.MeshStandardMaterial({ color: 0xff3a2f, emissive: 0xcc180f, emissiveIntensity: 1.5 }), new THREE.Vector3(0,.83,1.17), frame);
// 程序化骑手：前倾骑姿会随漂移和速度摆动，后续可直接替换为 GLTF 骨骼角色。
const playerRider = new THREE.Group(); playerRider.position.set(0,1.04,.08); frame.add(playerRider);
const riderMat = new THREE.MeshStandardMaterial({ color:0x202327, roughness:.78 });
const jacketMat = new THREE.MeshStandardMaterial({ color:0x384146, roughness:.72 });
mesh(new THREE.CapsuleGeometry(.23,.55,5,10), jacketMat, new THREE.Vector3(0,.30,.10), playerRider).rotation.x=.42;
mesh(new THREE.SphereGeometry(.205,14,10), dark, new THREE.Vector3(0,.79,-.25), playerRider);
mesh(new THREE.SphereGeometry(.15,12,8), new THREE.MeshStandardMaterial({color:0x202b2e,metalness:.5,roughness:.2}), new THREE.Vector3(0,.78,-.42), playerRider);
for (const x of [-.22,.22]) { const arm=mesh(new THREE.CapsuleGeometry(.065,.38,4,8),riderMat,new THREE.Vector3(x,.43,-.28),playerRider); arm.rotation.x=.9; arm.rotation.z=-x*1.9; }
mesh(new THREE.BoxGeometry(.25,.25,.35), dark, new THREE.Vector3(0,.23,.48), playerRider);
// 开始阶段只显示加载遮罩，避免旧程序化车型在新模型到达前闪现。
frame.visible = false;

const tireMarks = new THREE.Group(); scene.add(tireMarks);
const markGeo = new THREE.PlaneGeometry(.12, .8);
const markMat = new THREE.MeshBasicMaterial({ color: 0x101317, transparent: true, opacity: .43, depthWrite: false });
const smoke = [];
const smokeMat = new THREE.MeshBasicMaterial({ color: 0xd4b68a, transparent: true, opacity: .32, depthWrite: false });
for (let i=0; i<45; i++) { const s = new THREE.Sprite(smokeMat.clone()); s.visible = false; s.scale.set(1,1,1); scene.add(s); smoke.push({ s, life: 0 }); }
let smokeCursor = 0, markTimer = 0;
function emitSmoke(pos) { const p = smoke[smokeCursor++ % smoke.length]; p.life = 1; p.s.visible = true; p.s.position.copy(pos).add(new THREE.Vector3((Math.random()-.5)*.28,.2,(Math.random()-.5)*.28)); p.s.scale.set(.25,.25,.25); }

// 模型的车头位于局部 -Z；动力学、镜头和模型统一使用这一朝向。
const state = { x: 0, z: 8, yaw: 0, pitch: 0, v: 0, lateral: 0, yawRate: 0, steer: 0 };
const LF = .92, LR = .98, MASS = 230, IZZ = 260, maxSteer = .48;
function clamp(v,a,b) { return Math.max(a, Math.min(b,v)); }
function damp(v, target, rate, dt) { return THREE.MathUtils.damp(v, target, rate, dt); }

function updatePhysics(dt) {
  let throttle = keys.ArrowUp ? 1 : 0, brake = keys.ArrowDown ? 1 : 0;
  let steerInput = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
  const autoDriving = !keys.ArrowUp && !keys.ArrowDown && !keys.ArrowLeft && !keys.ArrowRight && !keys.ShiftLeft && !keys.ShiftRight;
  if (autoDriving) {
    const onRoad = nearestRoad(state.x, state.z);
    const lookAhead = THREE.MathUtils.clamp(9 + Math.abs(state.v) * .58, 10, 31);
    const target = roadCurve.getPointAt((onRoad.t + lookAhead / trackLength) % 1);
    const targetDir = new THREE.Vector3(target.x - state.x, 0, target.z - state.z).normalize();
    const autoForward = new THREE.Vector3(-Math.sin(state.yaw), 0, -Math.cos(state.yaw));
    const autoRight = new THREE.Vector3(Math.cos(state.yaw), 0, -Math.sin(state.yaw));
    const turnDemand = targetDir.dot(autoRight);
    steerInput = clamp(turnDemand * 2.6, -1, 1);
    const bend = 1 - clamp(autoForward.dot(targetDir), -1, 1);
    const cruiseSpeed = 26 - bend * 15;
    throttle = state.v < cruiseSpeed - .6 ? 1 : 0;
    brake = state.v > cruiseSpeed + 1.5 ? 1 : 0;
  }
  const drifting = !autoDriving && (keys.ShiftLeft || keys.ShiftRight) && Math.abs(state.v) > 5;
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
  // 悬崖边缘的粗略道路约束：冲出柏油路会急剧失速并被坡面推回。
  const nearest = nearestRoad(state.x, state.z), roadEdge = roadWidth * .5 - .35;
  if (nearest.distance > roadEdge) {
    const pull = Math.min(1, (nearest.distance - roadEdge) * dt * 1.7);
    state.x += (nearest.point.x - state.x) * pull;
    state.z += (nearest.point.z - state.z) * pull;
    state.v *= Math.max(0, 1 - dt * 2.8);
    state.lateral *= Math.max(0, 1 - dt * 3.5);
  }
  // 在道路范围内贴合连续道路样条，而不是读取有网格误差的地形高度。
  const roadSurface = nearestRoad(state.x, state.z);
  const slopeProbe = 1.15;
  const frontSurface = nearestRoad(state.x + forward.x * slopeProbe, state.z + forward.z * slopeProbe);
  const rearSurface = nearestRoad(state.x - forward.x * slopeProbe, state.z - forward.z * slopeProbe);
  state.pitch = damp(state.pitch, Math.atan2(frontSurface.point.y - rearSurface.point.y, slopeProbe * 2), 12, dt);
  bike.position.set(state.x, roadSurface.point.y + .10, state.z);
  bike.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  fork.rotation.y = state.steer;
  rearWheel.rotation.x -= state.v * dt / .37; frontWheel.rotation.x -= state.v * dt / .37;
  const lean = clamp(-state.steer * Math.abs(state.v) * .095 - state.lateral * .018, -.58, .58);
  frame.rotation.z = damp(frame.rotation.z, lean, 8, dt);
  detailedBike.rotation.z = frame.rotation.z;
  playerRider.rotation.z = damp(playerRider.rotation.z, -lean*.38 + (drifting ? -.08*direction : 0), 9, dt);
  playerRider.rotation.x = damp(playerRider.rotation.x, -.10 - Math.min(Math.abs(state.v)/80,.16), 7, dt);
  const slipAngle = Math.atan2(state.lateral, Math.max(1, Math.abs(state.v))) * direction;
  return { drifting, slipAngle, autoDriving };
}

const speedEl = document.querySelector('#speed'), slipEl = document.querySelector('#slip'), driftEl = document.querySelector('#drift-state');
function updateRivals(dt) {
  for (const rival of enemyBikes) {
    rival.userData.t = (rival.userData.t + rival.userData.speed * dt) % 1;
    const p = roadCurve.getPointAt(rival.userData.t), tan = roadCurve.getTangentAt(rival.userData.t).normalize();
    const pitch = Math.atan2(tan.y, Math.hypot(tan.x, tan.z));
    const yaw = Math.atan2(-tan.x, -tan.z);
    rival.position.copy(p).add(new THREE.Vector3(0,.1,0)); rival.rotation.set(pitch, yaw, 0, 'YXZ');
    rival.rotation.z = Math.sin(performance.now()*.0018 + rival.userData.t*19) * .08;
  }
}
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), .033);
  const { drifting, slipAngle, autoDriving } = updatePhysics(dt);
  updateRivals(dt);
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
  driftEl.textContent = autoDriving ? 'AUTO' : energetic ? 'DRIFT' : 'GRIP'; driftEl.classList.toggle('active', energetic);
  renderer.render(scene,camera);
}
addEventListener('resize', () => { camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth,innerHeight); });
animate();
