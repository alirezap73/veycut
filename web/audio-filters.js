'use strict';
// Browser counterparts for the two native tone controls. The native export
// chain uses FFmpeg, so this Web Audio path is deliberately described as an
// approximation rather than a sample-identical implementation.
window.VeyCutAudioFilters = (() => {
  const catalog = Object.freeze([
    Object.freeze({id:'concat.bass', name:'Bass', frequency:110, type:'lowshelf', defaultGain:5}),
    Object.freeze({id:'concat.treble', name:'Treble', frequency:9000, type:'highshelf', defaultGain:4})
  ]);
  const entries = new Map(catalog.map(item => [item.id,item]));
  function active(filters=[]) {
    if (!Array.isArray(filters)) throw new Error('Invalid audio filter chain.');
    return filters.filter(filter => filter.enabled !== false).map(filter => {
      const entry = entries.get(filter.id);
      if (!entry || Object.keys(filter.params || {}).some(key => key !== 'gain') ||
          Object.values(filter.keys || {}).some(keys => Array.isArray(keys) && keys.length))
        throw new Error('This audio filter is not yet available in browser preview or export.');
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
