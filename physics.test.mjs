import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Quaternion} from 'cannon-es';
import {simulateThrow,topFace} from './physics.mjs';
const rng=seed=>()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
test('100投の停止姿勢と出目が一致し、位置と回転が実際に変化する',()=>{
  let valid=0;const seen=new Set();
  for(let seed=1;seed<=100;seed++){
    const shot=simulateThrow(rng(seed));if(!shot)continue;valid++;
    const last=shot.frames.at(-1);assert.ok(shot.frames.length>30);
    assert.notDeepEqual(shot.frames[0],last);
    for(let i=0;i<3;i++){
      const face=topFace(new Quaternion(...last[i].slice(3)));
      assert.equal(face.value,shot.dice[i]);assert.ok(face.alignment>.97);
      assert.ok(Math.abs(last[i][0])<3.4&&Math.abs(last[i][2])<2.3);
      seen.add(shot.dice[i]);
    }
  }
  assert.ok(valid>=75);assert.equal(seen.size,6);
});
test('同じ初期乱数から同じ衝突軌跡を再現できる',()=>{
  assert.deepEqual(simulateThrow(rng(7)),simulateThrow(rng(7)));
});
