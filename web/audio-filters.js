'use strict';
// Browser counterparts for selected native sound filters. The native export
// chain uses FFmpeg, so this Web Audio path is deliberately described as an
// approximation rather than a sample-identical implementation.
window.VeyCutAudioFilters = (() => {
  const catalog = Object.freeze([
    Object.freeze({id:'concat.bass', name:'Bass', frequency:110, type:'lowshelf', defaultGain:5}),
    Object.freeze({id:'concat.treble', name:'Treble', frequency:9000, type:'highshelf', defaultGain:4}),
    Object.freeze({id:'concat.echo', name:'Echo', type:'echo', defaultDelay:.25, defaultDecay:.4}),
    Object.freeze({id:'concat.telephone', name:'Telephone', type:'telephone', defaultDrive:3})
  ]);
  const entries = new Map(catalog.map(item => [item.id,item]));
  function active(filters=[]) {
    if (!Array.isArray(filters)) throw new Error('Invalid audio filter chain.');
    return filters.filter(filter => filter.enabled !== false).map(filter => {
      const entry = entries.get(filter.id);
      const allowed=entry?.type==='echo'?['delay','decay']:entry?.type==='telephone'?['drive']:['gain'];
      if (!entry || Object.keys(filter.params || {}).some(key => !allowed.includes(key)) ||
          Object.values(filter.keys || {}).some(keys => Array.isArray(keys) && keys.length))
        throw new Error('This audio filter is not yet available in browser preview or export.');
      if(entry.type==='echo'){
        const delay=filter.params?.delay??entry.defaultDelay,decay=filter.params?.decay??entry.defaultDecay;
        if(!Number.isFinite(delay)||delay<.05||delay>1||!Number.isFinite(decay)||decay<.1||decay>.9)
          throw new Error('Echo delay or decay is outside the supported range.');
        return {id:entry.id,type:entry.type,delay,decay};
      }
      if(entry.type==='telephone'){
        const drive=filter.params?.drive??entry.defaultDrive;
        if(!Number.isFinite(drive)||drive<0||drive>10)throw new Error('Telephone drive must be between 0 and 10.');
        return {id:entry.id,type:entry.type,drive};
      }
      const gain = filter.params?.gain ?? entry.defaultGain;
      if (!Number.isFinite(gain) || gain < 0 || gain > 12)
        throw new Error('Audio tone gain must be between 0 and 12 dB.');
      return {id:entry.id, type:entry.type, frequency:entry.frequency, gain};
    });
  }
  function rewire(audio, pair, filters=[]) {
    const plan = active(filters);
    const signature = JSON.stringify(plan);
    if (pair.filterSignature === signature) return;
    pair.source.disconnect();
    for (const node of pair.filterNodes || []) node.disconnect();
    const nodes = [];
    let output = pair.source;
    for (const item of plan) {
      if(item.type==='echo'){
        const dry=audio.createGain(),delay=audio.createDelay(1),wet=audio.createGain(),mix=audio.createGain();
        dry.gain.value=.8*.85;delay.delayTime.value=item.delay;wet.gain.value=item.decay*.85;
        output.connect(dry);dry.connect(mix);output.connect(delay);delay.connect(wet);wet.connect(mix);
        output=mix;nodes.push(dry,delay,wet,mix);continue;
      }
      if(item.type==='telephone'){
        for(const [type,frequency,q,gain] of [['highpass',400,0,0],['lowpass',3400,0,0],['peaking',1600,1.4,3+item.drive/2]]){
          const filter=audio.createBiquadFilter();filter.type=type;filter.frequency.value=frequency;
          if(q)filter.Q.value=q;if(gain)filter.gain.value=gain;
          output.connect(filter);output=filter;nodes.push(filter);
        }
        continue;
      }
      const tone = audio.createBiquadFilter();
      tone.type = item.type;
      tone.frequency.value = item.frequency;
      tone.gain.value = item.gain;
      output.connect(tone);
      output = tone;
      nodes.push(tone);
    }
    if (plan.length) {
      const limiter = audio.createDynamicsCompressor();
      limiter.threshold.value = -1;
      limiter.knee.value = 0;
      limiter.ratio.value = 20;
      limiter.attack.value = .003;
      limiter.release.value = .05;
      output.connect(limiter);
      output = limiter;
      nodes.push(limiter);
    }
    output.connect(pair.gain);
    pair.filterNodes = nodes;
    pair.filterSignature = signature;
  }
  return Object.freeze({catalog, active, rewire});
})();
if (typeof module !== 'undefined') module.exports = window.VeyCutAudioFilters;
