import {World,Body,Box,Vec3,Material,ContactMaterial} from 'cannon-es';
export const faceAxes=[[1,0,0,1],[-1,0,0,6],[0,1,0,2],[0,-1,0,5],[0,0,1,3],[0,0,-1,4]];
export function topFace(q) {
  let top=-2,value=0;
  for(const [x,y,z,n] of faceAxes){const v=q.vmult(new Vec3(x,y,z));if(v.y>top){top=v.y;value=n;}}
  return {value,alignment:top};
}
export function simulateThrow(random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296) {
  const range=(a,b)=>a+(b-a)*random();
  const world=new World({gravity:new Vec3(0,-20,0),allowSleep:true});world.solver.iterations=16;
  const material=new Material();world.addContactMaterial(new ContactMaterial(material,material,{friction:.5,restitution:.35}));
  function box(size,pos,mass=0){const b=new Body({mass,material,shape:new Box(new Vec3(...size)),position:new Vec3(...pos)});world.addBody(b);return b;}
  box([3.4,.15,2.3],[0,-.15,0]);
  for(const side of [-1,1]){box([.15,2,2.3],[side*3.4,1.5,0]);box([3.4,2,.15],[0,1.5,side*2.3]);}
  const bodies=Array.from({length:3},(_,i)=>{
    const b=box([.58,.58,.58],[-1.7+i*1.7,range(2.5,4),range(-1.1,1.1)],1);
    b.quaternion.setFromEuler(range(0,Math.PI*2),range(0,Math.PI*2),range(0,Math.PI*2));
    b.velocity.set(range(-3,3),range(-2,1),range(-3,3));
    b.angularVelocity.set(range(-18,18),range(-18,18),range(-18,18));
    b.linearDamping=.25;b.angularDamping=.3;b.sleepSpeedLimit=.1;b.sleepTimeLimit=.35;return b;
  });
  const frames=[];const snapshot=()=>bodies.map(b=>[...b.position.toArray(),...b.quaternion.toArray()].map(v=>Math.round(v*10000)/10000));
  frames.push(snapshot());let steps=0;
  for(;steps<540;steps++){
    world.step(1/60);if(steps%2===1)frames.push(snapshot());
    if(steps>90&&bodies.every(b=>b.sleepState===Body.SLEEPING))break;
  }
  frames.push(snapshot());
  const faces=bodies.map(b=>topFace(b.quaternion));
  if(faces.some(f=>f.alignment<.97)||bodies.some(b=>b.sleepState!==Body.SLEEPING))return null;
  return {dice:faces.map(f=>f.value),frames,frameMs:1000/30,duration:(frames.length-1)*1000/30};
}
