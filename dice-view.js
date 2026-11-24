import * as THREE from 'three';
const faces=[1,6,2,5,3,4];
const dots={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
class SoftwareRenderer {
  constructor(){this.domElement=document.createElement('canvas');this.shadowMap={};this.ratio=1;}
  setPixelRatio(r){this.ratio=r;}
  setSize(w,h){this.w=w;this.h=h;this.domElement.width=w*this.ratio;this.domElement.height=h*this.ratio;}
  render(scene,camera){
    const ctx=this.domElement.getContext('2d'),w=this.w,h=this.h;ctx.setTransform(this.ratio,0,0,this.ratio,0,0);ctx.fillStyle='#252034';ctx.fillRect(0,0,w,h);camera.updateMatrixWorld();
    const project=v=>{const p=v.clone().project(camera);return [(p.x+1)*w/2,(1-p.y)*h/2]};
    const polygon=(points,fill,stroke)=>{ctx.beginPath();points.forEach((v,i)=>{const [x,y]=project(v);i?ctx.lineTo(x,y):ctx.moveTo(x,y)});ctx.closePath();ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke()}};
    polygon([[-3.4,0,-2.3],[3.4,0,-2.3],[3.4,0,2.3],[-3.4,0,2.3]].map(v=>new THREE.Vector3(...v)),'#49365c','#9474ae');
    const cubes=scene.children.filter(o=>o.isMesh&&Array.isArray(o.material));
    const polygons=[];
    for(const mesh of cubes){
      const shadow=[];for(let i=0;i<24;i++){const a=i*Math.PI/12;shadow.push(new THREE.Vector3(mesh.position.x+Math.cos(a)*.85,.01,mesh.position.z+Math.sin(a)*.6));}polygon(shadow,'#100d1b55');
      const defs=[[new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1),new THREE.Vector3(0,1,0)],[new THREE.Vector3(-1,0,0),new THREE.Vector3(0,0,-1),new THREE.Vector3(0,1,0)],[new THREE.Vector3(0,1,0),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,1)],[new THREE.Vector3(0,-1,0),new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,-1)],[new THREE.Vector3(0,0,1),new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0)],[new THREE.Vector3(0,0,-1),new THREE.Vector3(-1,0,0),new THREE.Vector3(0,1,0)]];
      defs.forEach(([n,u,v],i)=>{const center=n.clone().multiplyScalar(.58).applyQuaternion(mesh.quaternion).add(mesh.position),normal=n.clone().applyQuaternion(mesh.quaternion);if(normal.dot(camera.position.clone().sub(center))<=0)return;const local=(a,b)=>n.clone().multiplyScalar(.581).addScaledVector(u,a).addScaledVector(v,b).applyQuaternion(mesh.quaternion).add(mesh.position);polygons.push({distance:center.distanceToSquared(camera.position),normal,local,number:faces[i]});});
    }
    polygons.sort((a,b)=>b.distance-a.distance);
    for(const f of polygons){const shade=Math.max(0,f.normal.dot(new THREE.Vector3(-.3,.9,.4).normalize())),color=`rgb(${205+Math.round(shade*45)},${197+Math.round(shade*43)},${180+Math.round(shade*38)})`;polygon([[-.58,-.58],[.58,-.58],[.58,.58],[-.58,.58]].map(v=>f.local(...v)),color,'#c0ae8d');for(const [a,b] of dots[f.number]){const points=[];for(let i=0;i<16;i++){const t=i*Math.PI/8,r=f.number===1?.11:.083;points.push(f.local(a*.29+Math.cos(t)*r,b*.29+Math.sin(t)*r));}polygon(points,f.number===1?'#c73548':'#252337');}}
  }
}
function texture(n){
  const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');
  x.fillStyle='#fff5dd';x.fillRect(0,0,256,256);x.strokeStyle='#d6c6a0';x.lineWidth=12;x.strokeRect(3,3,250,250);
  const p={1:[[0,0]],2:[[-1,-1],[1,1]],3:[[-1,-1],[0,0],[1,1]],4:[[-1,-1],[1,-1],[-1,1],[1,1]],5:[[-1,-1],[1,-1],[0,0],[-1,1],[1,1]],6:[[-1,-1],[1,-1],[-1,0],[1,0],[-1,1],[1,1]]};
  x.fillStyle=n===1?'#cb3346':'#252337';for(const [a,b] of p[n]){x.beginPath();x.arc(128+a*65,128+b*65,n===1?26:19,0,Math.PI*2);x.fill();}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
}
export class DiceView {
  constructor(){
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#252034');
    try{this.renderer=new THREE.WebGLRenderer({antialias:true});}catch{this.renderer=new SoftwareRenderer();}this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    this.camera=new THREE.PerspectiveCamera(37,1,.1,80);this.camera.position.set(0,10.8,8.5);this.camera.lookAt(0,.6,0);
    this.scene.add(new THREE.HemisphereLight(0xfff5e6,0x433253,2.2));
    const light=new THREE.DirectionalLight(0xffffff,3);light.position.set(-3,8,4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.camera.left=-6;light.shadow.camera.right=6;light.shadow.camera.top=6;light.shadow.camera.bottom=-6;this.scene.add(light);
    const floor=new THREE.Mesh(new THREE.BoxGeometry(6.8,.3,4.6),new THREE.MeshStandardMaterial({color:0x48335c,roughness:1}));floor.position.y=-.15;floor.receiveShadow=true;this.scene.add(floor);
    const edge=new THREE.MeshStandardMaterial({color:0x89719d,roughness:.6});
    for(const side of [-1,1]){const a=new THREE.Mesh(new THREE.BoxGeometry(.25,.5,4.8),edge);a.position.set(side*3.4,.1,0);a.castShadow=true;this.scene.add(a);const b=new THREE.Mesh(new THREE.BoxGeometry(6.8,.5,.25),edge);b.position.set(0,.1,side*2.3);b.castShadow=true;this.scene.add(b);}
    const materials=faces.map(n=>new THREE.MeshStandardMaterial({map:texture(n),roughness:.45,metalness:0}));
    this.dice=Array.from({length:3},(_,i)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(1.16,1.16,1.16),materials);m.position.set((i-1)*1.6,.59,0);m.castShadow=true;m.receiveShadow=true;this.scene.add(m);return m;});
    this.q=new THREE.Quaternion();this.endQ=new THREE.Quaternion();
    this.renderer.domElement.setAttribute('aria-label','3Dサイコロの物理シミュレーション');this.renderer.domElement.setAttribute('role','img');
    this.resize=new ResizeObserver(()=>this.draw());
  }
  attach(target){if(this.target!==target){this.resize.disconnect();this.target=target;target.replaceChildren(this.renderer.domElement);this.resize.observe(target);}this.draw();}
  draw(){if(!this.target)return;const w=this.target.clientWidth,h=this.target.clientHeight;if(!w||!h)return;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.zoom=1;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();let maxX=0,maxY=0;for(const x of [-3.65,3.65])for(const y of [-.3,.85])for(const z of [-2.55,2.55]){const point=new THREE.Vector3(x,y,z).project(this.camera);maxX=Math.max(maxX,Math.abs(point.x));maxY=Math.max(maxY,Math.abs(point.y));}this.camera.zoom=Math.min(.9/maxX,.9/maxY);this.camera.updateProjectionMatrix();this.renderer.render(this.scene,this.camera);}
  frame(frames,index){const a=frames[Math.floor(index)],b=frames[Math.min(Math.floor(index)+1,frames.length-1)],t=index%1;if(!a)return;this.dice.forEach((m,i)=>{m.position.set(a[i][0]+(b[i][0]-a[i][0])*t,a[i][1]+(b[i][1]-a[i][1])*t,a[i][2]+(b[i][2]-a[i][2])*t);m.quaternion.fromArray(a[i],3);this.endQ.fromArray(b[i],3);m.quaternion.slerp(this.endQ,t)});this.draw();}
  show(shot,onDone){
    if(!shot||this.shotId===shot.id)return;this.shotId=shot.id;cancelAnimationFrame(this.raf);
    const elapsed=Math.max(0,Date.now()-shot.startedAt);const start=performance.now()-elapsed;
    const animate=now=>{const index=Math.min((now-start)/shot.frameMs,shot.frames.length-1);this.frame(shot.frames,index);if(index<shot.frames.length-1)this.raf=requestAnimationFrame(animate);else onDone?.()};this.raf=requestAnimationFrame(animate);
  }
  idle(){cancelAnimationFrame(this.raf);this.shotId=null;this.dice.forEach((m,i)=>{m.position.set((i-1)*1.6,.59,0);m.rotation.set(0,.2,0)});this.draw();}
}
