'use strict';
// Pure project/media adapters; neither reads paths nor grants filesystem access.
const VeyCutProjectInterop = (() => {
  const clone = value => JSON.parse(JSON.stringify(value));
  const allClips = document => document.timelines?.length
    ? document.timelines.flatMap(t => t.clips || []) : document.clips || [];
  function assertPreserved(original, restored, path = 'project', depth = 0) {
    if (depth > 64) throw Error('Project nesting exceeds the interchange limit.');
    if (original === null || typeof original !== 'object') {
      if (original !== restored) throw Error('Desktop property changed during import: '+path);
      return;
    }
    if (Array.isArray(original)) {
      if (!Array.isArray(restored) || original.length !== restored.length)
        throw Error('Desktop list changed during import: '+path);
      original.forEach((value,index) => assertPreserved(value,restored[index],path+'['+index+']',depth+1));
    } else {
      if (!restored || typeof restored !== 'object' || Array.isArray(restored))
        throw Error('Desktop property lost during import: '+path);
      for (const key of Object.keys(original)) {
        if (!Object.hasOwn(restored,key)) throw Error('Desktop property lost during import: '+path+'.'+key);
        assertPreserved(original[key],restored[key],path+'.'+key,depth+1);
      }
    }
  }
  function envelope(document) {
    if (!document || document.version !== 1 || !Array.isArray(document.media) ||
        !Array.isArray(document.clips) || !Array.isArray(document.tracks))
      throw Error('Unsupported desktop project format. Select the project JSON manifest.');
    const clips = allClips(document);
    const media = document.media.map(item => {
      if (!item || !['video','audio','image'].includes(item.kind) || typeof item.path !== 'string')
        throw Error('Desktop media kind or path is unsupported.');
      const name = item.path.split(/[\\/]/).pop();
      if (!name || !item.id) throw Error('Desktop media is missing a filename or identity.');
      const needed = clips.filter(c => c.mediaId === item.id)
        .map(c => (c.sourceStart || 0)+c.duration*(c.speed || 1));
      const duration = item.kind === 'image' ? 5 : item.duration;
      if (!Number.isFinite(duration) || duration < .05 || duration > 86400 || item.kind !== 'image' && needed.some(end => !Number.isFinite(end) || end > duration+.001))
        throw Error('Desktop media has invalid duration or source ranges.');
      return {id:item.id,name,kind:item.kind,size:0,sizeKnown:false,duration,
        width:item.width || 0,height:item.height || 0,desktopPath:item.path};
    });
    const canonical = c => ({...clone(c),in:c.sourceStart || 0,
      out:(c.sourceStart || 0)+c.duration*(['video','audio'].includes(c.kind)?c.speed || 1:1),
      timelineStart:c.start});
    const text = document.clips.filter(c => c.kind === 'text');
    return {format:'veycut-web',schema:1,engine:'wasm',engineDocument:clone(document),media,
      clips:document.clips.map(canonical),tracks:clone(document.tracks),video:clone(document.video),
      timelineCueIds:Object.fromEntries((document.timelines||[{id:document.activeTimelineId||'TL1',clips:document.clips}]).map(t=>[t.id,t.clips.filter(c=>c.kind==='text').map(c=>c.id)])),cueIds:text.map(c => c.id),cues:text.map(c => ({id:c.id,nativeId:c.id,start:c.start,
        end:c.start+c.duration,text:c.text?.content || '',style:clone(c.text || {})}))};
  }
  function cueScopes(envelope, document) {
    const supplied=envelope.timelineCueIds;
    if(supplied!==undefined && (!supplied || typeof supplied!=='object' || Array.isArray(supplied)))
      throw Error('Invalid timeline caption scope map.');
    if(!document){if(supplied&&Object.keys(supplied).length)throw Error('Timeline caption scopes require a native document.');return {};}
    const timelines=document.timelines||[{id:document.activeTimelineId||'TL1',clips:document.clips}];
    const entries=Object.entries(supplied||{[document.activeTimelineId||timelines[0].id]:envelope.cueIds||[]});
    for(const [id,ids] of entries){const timeline=timelines.find(t=>t.id===id);
      if(!timeline||!Array.isArray(ids)||new Set(ids).size!==ids.length||ids.some(cid=>typeof cid!=='string'||!timeline.clips.some(c=>c.id===cid&&c.kind==='text')))
        throw Error('Caption scope references a different or missing timeline/text clip.');
    }
    const active=entries.find(([id])=>id===(document.activeTimelineId||timelines[0].id))?.[1]||[];
    if(supplied&&(active.length!==(envelope.cueIds||[]).length||active.some(id=>!(envelope.cueIds||[]).includes(id))))
      throw Error('Active caption scope conflicts with the timeline map.');
    return Object.fromEntries(entries.map(([id,ids])=>[id,[...ids]]));
  }
  function canReconnect(original, replacement, document, localClips) {
    if (!original || original.name !== replacement.name || original.kind !== replacement.kind ||
        (original.sizeKnown !== false && original.size !== replacement.size)) return false;
    if (original.sizeKnown === false && original.kind !== 'audio' &&
        (original.width && original.width !== replacement.width || original.height && original.height !== replacement.height)) return false;
    const native = document ? allClips(document) : [];
    const ranges = native.length ? native.filter(c => c.mediaId === original.id).map(c =>
      (c.sourceStart || 0)+c.duration*(c.speed || 1)) : localClips.filter(c => c.mediaId === original.id).map(c => c.out);
    return original.kind === 'image' || ranges.every(end => Number.isFinite(end) && end <= replacement.duration+.001);
  }
  function desktopExport(document) {
    if (!document) throw Error('Desktop project export requires the shared Wasm engine.');
    const result=clone(document);
    if (result.media.some(m => typeof m.path !== 'string' || m.path.startsWith('browser:') || m.path.startsWith('blob:')))
      throw Error('Desktop export needs original desktop media paths. Save a Web project for browser-added media.');
    return result;
  }
  return Object.freeze({assertPreserved,envelope,cueScopes,canReconnect,desktopExport});
})();
if (typeof window !== 'undefined') window.VeyCutProjectInterop=VeyCutProjectInterop;
if (typeof module !== 'undefined') module.exports=VeyCutProjectInterop;
