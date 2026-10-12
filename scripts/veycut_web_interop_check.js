'use strict';
const assert=require('node:assert/strict');
const api=require('../web/project-interop.js');
const fixture={version:1,name:'Desktop',concat:'0.1.0',video:{width:720,height:1280,rateNum:30,rateDen:1},
  media:[{id:'m1',name:'Display name',path:'/original/movie.mp4',kind:'video',duration:20,width:720,height:1280}],
  tracks:[{id:'T1',visible:true,muted:false}],
  clips:[{id:'c1',trackId:'T1',mediaId:'m1',kind:'video',start:2,duration:3,sourceStart:4,speed:2,
    videoEffects:[{id:'unknown.effect',params:{keep:7}}],extension:{nested:[1,2]}}]};
const copy=x=>JSON.parse(JSON.stringify(x));
const wrapped=api.envelope(fixture);
assert.equal(wrapped.media[0].name,'movie.mp4');
assert.equal(wrapped.media[0].sizeKnown,false);
assert.equal(wrapped.clips[0].out,10);
assert.deepEqual(wrapped.engineDocument,fixture);
assert.deepEqual(api.desktopExport(fixture),fixture);
api.assertPreserved(fixture,{...copy(fixture),defaultsAdded:true});
for(const change of [d=>delete d.clips[0].extension,d=>d.clips[0].videoEffects.pop(),d=>d.clips[0].sourceStart=5]){
 const changed=copy(fixture);change(changed);assert.throws(()=>api.assertPreserved(fixture,changed));
}
const item=wrapped.media[0],replacement={name:'movie.mp4',kind:'video',size:500,duration:20,width:720,height:1280};
assert(api.canReconnect(item,replacement,fixture,[]));
for(const patch of [{name:'other.mp4'},{kind:'audio'},{width:1080},{duration:9.5}])
 assert.equal(api.canReconnect(item,{...replacement,...patch},fixture,[]),false);
assert.equal(api.canReconnect({...item,sizeKnown:true,size:499},replacement,fixture,[]),false);
const multi=copy(fixture);multi.timelines=[{clips:multi.clips},{clips:[{...multi.clips[0],sourceStart:17,duration:2}]}];
assert.equal(api.canReconnect(item,replacement,multi,[]),false);
const browser=copy(fixture);browser.media[0].path='browser:m1';assert.throws(()=>api.desktopExport(browser));
const future=copy(fixture);future.version=2;assert.throws(()=>api.envelope(future));
const image=copy(fixture);image.media[0]={id:'m1',path:'C:\\images\\still.png',kind:'image',width:640,height:480};image.clips[0]={...image.clips[0],kind:'image',duration:90,sourceStart:0};
assert.equal(api.envelope(image).media[0].name,'still.png');
console.log('Desktop interoperability: preservation, reconnect, all-timeline bounds and safe-refusal checks passed.');
const scoped=copy(fixture);scoped.activeTimelineId='TL1';scoped.timelines=[{id:'TL1',clips:[{id:'a',kind:'text'}]},{id:'TL2',clips:[{id:'b',kind:'text'}]}];
assert.deepEqual(api.cueScopes({cueIds:['a'],timelineCueIds:{TL1:['a'],TL2:['b']}},scoped),{TL1:['a'],TL2:['b']});
assert.throws(()=>api.cueScopes({cueIds:['a'],timelineCueIds:{TL1:['a'],TL2:['a']}},scoped));
assert.throws(()=>api.cueScopes({cueIds:[],timelineCueIds:{TL1:['a']}},scoped));
assert.throws(()=>api.cueScopes({cueIds:['a'],timelineCueIds:{TL1:['a','a']}},scoped));
console.log('Timeline scope ownership and invalid-scope refusal checks passed.');
