import test from 'node:test';
import assert from 'node:assert/strict';
import {Rational as Q, RationalMap} from '../dist/index.js';
const q = Q.parse;
const encoded = s => ({first:s.firstTime.toString(),last:s.lastTime.toString(),
  count:s.entryCount.toString(),distinct:s.distinctCount,gap:s.maxGap.toString()});
function reference(entries, low, high, threshold, mode, options = {}) {
  const groups = [];
  for (const [key, weight] of entries) {
    const lc=key.compare(low), hc=key.compare(high);
    if(lc<0 || lc===0 && options.includeLower===false || hc>0 || hc===0 && !options.includeUpper) continue;
    const old=groups.at(-1);
    const anchor=mode==='neighbors'?old?.lastTime:old?.firstTime;
    if(old && key.sub(anchor).compare(threshold)<0) {
      old.maxGap=old.maxGap.max(key.sub(old.lastTime)); old.lastTime=key;
      old.entryCount+=weight; old.distinctCount++;
    } else groups.push({firstTime:key,lastTime:key,entryCount:weight,distinctCount:1,maxGap:Q.zero});
  }
  return groups.map(encoded);
}
test('canonical values, strict parsers, arithmetic, and explicit approximations',()=>{
  assert.equal(Q.from(-6n,-8n).toString(),'3/4');
  assert.equal(Q.from(0n,-999n).toString(),'0/1');
  assert.equal(Q.parseDecimal('0.1').add(Q.parseDecimal('0.2')).toString(),'3/10');
  assert.equal(Q.parseDecimal('-.125e+2').toString(),'-25/2');
  assert.equal(Q.parseDecimal('1e-1000').denominator,10n**1000n);
  assert.equal(q('-5/3').floor().toString(),'-2/1');
  assert.equal(q('-5/3').ceil().toString(),'-1/1');
  for(const bad of ['', '1/0', '1/2/3', '1/2\n', ' 1/2', '1/2\0', 'NaN']) assert.throws(()=>q(bad));
  for(const bad of ['', '1e', '.', '1.0\n', 'Infinity']) assert.throws(()=>Q.parseDecimal(bad));
  for(const bad of ['2/4','-0/1','01/2','1','1/2\n']) assert.throws(()=>Q.decodeCanonical(bad));
  assert.throws(()=>Q.from(1,2)); assert.throws(()=>q('1').div(Q.zero));
  assert.throws(()=>Number(q('1/2')));
  assert.equal(JSON.stringify({time:q('1/2')}),'{"time":"1/2"}');
  assert.equal(Q.from(10n**1000n+1n,10n**1000n).compare(Q.one),1);
  assert.equal(Q.from(10n**1000n,2n*10n**1000n+1n).toApproximateNumber(),0.5);
});
test('equivalent keys, weights, ordered bounds, and persistent clones',()=>{
  const m=new RationalMap(v=>v.weight);
  m.set(q('2/4'),{name:'a',weight:3n}).set(q('1/2'),{name:'b',weight:4n});
  m.set(q('0'),{weight:1n}).set(q('1'),{weight:2n});
  assert.equal(m.size,3); assert.equal(m.entryCount,7n);
  const snapshot=m.clone();
  m.delete(q('1/2')); m.set(q('10'),{weight:5n});
  assert.equal(snapshot.get(q('2/4')).name,'b');
  assert.equal(snapshot.countRange(q('0'),q('1')),5n);
  assert.equal(snapshot.countRange(q('0'),q('1'),{includeUpper:true}),7n);
  assert.equal(snapshot.countRange(q('1/2'),q('1/2'),{includeUpper:true}),4n);
  assert.deepEqual([...m.range(q('10'),q('0'))],[]);
  assert.equal(snapshot.successor(q('0'))[0].toString(),'1/2');
  assert.equal(snapshot.predecessor(q('1'))[0].toString(),'1/2');
  assert.throws(()=>m.set(q('20'),{weight:0n}));
});
test('both grouping modes, clipping, strict threshold equality, and zero threshold',()=>{
  const m=new RationalMap(v=>v);
  for(const [key,n] of [['0',1n],['9/10',2n],['9/5',3n]]) m.set(q(key),n);
  assert.equal(m.overview(q('0'),q('2'),Q.one,'neighbors').groups.length,1);
  assert.equal(m.overview(q('0'),q('2'),Q.one,'span').groups.length,2);
  for(const mode of ['neighbors','span']) {
    assert.equal(m.overview(q('0'),q('2'),Q.zero,mode).groups.length,3);
    assert.deepEqual(m.overview(q('9/10'),q('9/10'),Q.one,mode,{includeUpper:true}).groups.map(encoded),
      [{first:'9/10',last:'9/10',count:'2',distinct:1,gap:'0/1'}]);
    assert.equal(m.overview(q('0'),q('9/10'),Q.one,mode).groups[0].entryCount,1n);
  }
  const equality=new RationalMap().set(q('0'),0).set(q('1'),1);
  for(const mode of ['neighbors','span']) assert.equal(equality.overview(q('0'),q('2'),Q.one,mode).groups.length,2);
});
test('random insert, replace, move, and delete sequences match a scan oracle',()=>{
  let seed=1731;
  const random=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
  const m=new RationalMap(v=>v), values=new Map();
  for(let i=0;i<1000;i++) {
    const key=Q.from(BigInt(random(200)-100),BigInt(random(9)+1)), text=key.toString();
    if(random(4)===0) {m.delete(key);values.delete(text);}
    else {const weight=BigInt(random(4)+1);m.set(key,weight);values.set(text,weight);}
    const entries=[...values].map(([s,w])=>[q(s),w]).sort((a,b)=>a[0].compare(b[0]));
    assert.equal(m.size,values.size);
    assert.deepEqual([...m].map(([k,w])=>[k.toString(),w]),entries.map(([k,w])=>[k.toString(),w]));
    const low=q('-5/2'), high=q('7/3'), threshold=Q.from(BigInt(random(6)),3n);
    const options={includeLower:random(2)===0,includeUpper:random(2)===0};
    for(const mode of ['neighbors','span']) assert.deepEqual(m.overview(low,high,threshold,mode,options).groups.map(encoded),
      reference(entries,low,high,threshold,mode,options));
    const total=entries.reduce((a,[,w])=>a+w,0n);
    assert.equal(m.entryCount,total);
    assert.ok(m.height<2*Math.log2(m.size+2));
  }
});
test('dense overviews skip hidden coordinates and huge offsets retain tiny gaps',()=>{
  const m=new RationalMap();
  for(let i=0;i<10000;i++) m.set(Q.from(BigInt(i),1000000n),i);
  const chain=m.overview(q('-1'),q('1'),q('1/1000'),'neighbors');
  assert.equal(chain.groups[0].entryCount,10000n); assert.equal(chain.stats.visitedNodes,1);
  const span=m.overview(q('-1'),q('1'),q('1/1000'),'span');
  assert.equal(span.groups.length,10); assert.ok(span.stats.visitedNodes<2000);
  const huge=Q.from(10n**1000n), tiny=Q.from(1n,10n**1000n), close=new RationalMap();
  for(let i=0;i<100;i++) close.set(huge.add(tiny.mul(Q.from(BigInt(i)))),i);
  assert.equal(close.overview(huge,huge.add(tiny.mul(Q.from(100n))),tiny.mul(Q.from(2n)),'neighbors').groups[0].entryCount,100n);
});
