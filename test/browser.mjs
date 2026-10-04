import {chromium,firefox,webkit} from 'playwright';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source=await readFile(new URL('../dist/browser.js',import.meta.url),'utf8');
const paths=process.env.RATIONAL_BROWSER_PATHS?JSON.parse(process.env.RATIONAL_BROWSER_PATHS):{};
const engines={chromium,firefox,webkit};
const selected=process.env.RATIONAL_BROWSER_ENGINES?.split(',')??Object.keys(engines);
for(const name of selected) {
  if(!Object.hasOwn(engines,name)) throw new Error('Unknown browser engine: '+name);
  const engine=engines[name];
  let phase='launch';
  const deadline=setTimeout(()=>{
    console.error(name+': timed out during '+phase);
    process.exit(1);
  },45000);
  deadline.unref();
  const browser=await engine.launch({headless:true,...(paths[name]?{executablePath:paths[name]}:{})});
  try {
    phase='page setup';
    const page=await browser.newPage();
    phase='module import and exact queries';
    const result=await page.evaluate(async source=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      try {
        const {Rational:Q,RationalMap}=await import(url),m=new RationalMap();
        m.set(Q.parse('2/4'),'half');m.set(Q.parse('0'),'zero');m.set(Q.parse('1'),'one');
        const huge=Q.from(10n**1000n+1n,10n**1000n);
        return {equal:m.get(Q.parse('1/2')),range:[...m.range(Q.zero,Q.one)].map(([k])=>k.toString()),
          count:m.countRange(Q.zero,Q.one).toString(),groups:m.overview(Q.zero,Q.from(2n),Q.one,'span').groups.length,
          huge:huge.compare(Q.one),decimal:Q.parseDecimal('0.1').add(Q.parseDecimal('0.2')).toString()};
      } finally {URL.revokeObjectURL(url);}
    },source);
    assert.deepEqual(result,{equal:'half',range:['0/1','1/2'],count:'2',groups:2,huge:1,decimal:'3/10'});
    console.log(name+': browser arithmetic, ordered bounds, and summaries passed');
  } finally {phase='browser shutdown';await browser.close();clearTimeout(deadline);}
}
