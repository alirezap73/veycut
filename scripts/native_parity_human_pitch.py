"""GitHub-only, model-free voiced F0 retention on documented human recordings.

Compare each native/Web output independently with ORIGINAL source PCM at the
shared integrated speed-curve time. High-confidence stable source voicing avoids
interpreting consonants, unvoiced noise or rapidly varying prosody as pitch.
No output time shifting, octave folding, fixture synthesis or human listening.
Insufficient reliable source evidence is inconclusive and fails the gate.
"""
import hashlib
import json
import math
import os
import subprocess
from pathlib import Path

import numpy as np

RATE = 8000
ROOT = Path('output/native-parity')
CRITERIA = dict(
    f0RangeHz=[65, 400], windowSeconds=.080, sourceStabilityRadiusSeconds=.060,
    sourceStabilityMaximumRangeCents=80, samplingStepSeconds=.100,
    minimumRMS=.005, maximumYinCMND=.15, minimumNormalizedAutocorrelation=.70,
    maximumEstimatorDisagreementCents=80,
    minimumReliableSourceSamples=20, minimumDistinctSourceSecondBins=5,
    minimumOutputVoicedRetention=.90, maximumMedianAbsoluteErrorCents=50,
    maximumP90AbsoluteErrorCents=125, minimumWithin100CentsFraction=.80,
    maximumOctaveErrorFraction=.05,
)


def decode(path):
    raw = subprocess.check_output(
        ['ffmpeg', '-v', 'error', '-xerror', '-threads', '1', '-i', str(path),
         '-vn', '-ac', '1', '-ar', str(RATE), '-f', 'f32le', '-'], timeout=90)
    data = np.frombuffer(raw, '<f4').astype(np.float64)
    if not np.isfinite(data).all():
        raise RuntimeError('Non-finite PCM samples')
    return data


def cents(hz, reference):
    return 1200 * math.log2(hz / reference)


def estimate(pcm, at):
    size = round(CRITERIA['windowSeconds'] * RATE)
    begin = round(at * RATE) - size // 2
    if begin < 0 or begin + size > len(pcm):
        return dict(valid=False, reason='window outside recording')
    data = pcm[begin:begin + size].copy()
    data -= np.mean(data)
    rms = float(np.sqrt(np.mean(data * data)))
    if rms < CRITERIA['minimumRMS']:
        return dict(valid=False, reason='low energy', rms=rms)
    lower = math.floor(RATE / CRITERIA['f0RangeHz'][1])
    upper = math.ceil(RATE / CRITERIA['f0RangeHz'][0])
    # Fixed common support gives all YIN differences the same number of samples.
    length = len(data) - upper
    base = data[:length]
    difference = np.zeros(upper + 1)
    acf = np.zeros(upper + 1)
    for lag in range(1, upper + 1):
        shifted = data[lag:lag + length]
        difference[lag] = np.dot(base - shifted, base - shifted)
        denominator = math.sqrt(float(np.dot(base, base) * np.dot(shifted, shifted)))
        acf[lag] = float(np.dot(base, shifted)) / denominator if denominator else 0
    cumulative = np.cumsum(difference[1:])
    cmnd = np.ones(upper + 1)
    cmnd[1:] = difference[1:] * np.arange(1, upper + 1) / np.maximum(cumulative, 1e-18)
    candidates = [lag for lag in range(lower, upper)
                  if cmnd[lag] < CRITERIA['maximumYinCMND']
                  and cmnd[lag] <= cmnd[lag - 1] and cmnd[lag] <= cmnd[lag + 1]]
    if not candidates:
        return dict(valid=False, reason='no confident YIN period', rms=rms,
                    minimumCMND=float(np.min(cmnd[lower:upper + 1])))
    lag = candidates[0]
    # Refine the period by its parabolic minimum; never fold octave errors.
    denominator = cmnd[lag - 1] - 2 * cmnd[lag] + cmnd[lag + 1]
    correction = .5 * (cmnd[lag - 1] - cmnd[lag + 1]) / denominator if abs(denominator) > 1e-12 else 0
    correction = float(np.clip(correction, -.5, .5))
    hz = RATE / (lag + correction)
    peaks = [i for i in range(lower, upper)
             if acf[i] >= acf[i - 1] and acf[i] >= acf[i + 1]]
    if not peaks:
        return dict(valid=False, reason='no autocorrelation peak', rms=rms)
    best_peak = max(peaks, key=lambda i: acf[i])
    acf_hz = RATE / best_peak
    disagreement = abs(cents(acf_hz, hz))
    valid = (CRITERIA['f0RangeHz'][0] <= hz <= CRITERIA['f0RangeHz'][1]
             and acf[lag] >= CRITERIA['minimumNormalizedAutocorrelation']
             and disagreement <= CRITERIA['maximumEstimatorDisagreementCents'])
    return dict(valid=bool(valid), reason='confident voiced F0' if valid else 'ambiguous/noisy period',
                hz=float(hz), rms=rms, yinCMND=float(cmnd[lag]),
                normalizedAutocorrelation=float(acf[lag]), autocorrelationHz=float(acf_hz),
                estimatorDisagreementCents=disagreement)


def area(curve, fraction):
    points = sorted(curve, key=lambda p: p['at'])
    if not points or points[0]['at'] != 0 or points[-1]['at'] != 1:
        raise RuntimeError('Curve must cover normalized timeline 0 through 1')
    result = 0.0
    for left, right in zip(points, points[1:]):
        if right['at'] <= left['at'] or min(left['speed'], right['speed']) <= 0:
            raise RuntimeError('Invalid curve segment')
        width = max(0, min(fraction, right['at']) - left['at'])
        if width:
            slope = (right['speed'] - left['speed']) / (right['at'] - left['at'])
            result += left['speed'] * width + .5 * slope * width * width
    return result


def analyse_case(case, metadata):
    fixture = metadata[case['fixtureId']]
    path = Path(case['source'])
    with path.open('rb') as f:
        digest = hashlib.file_digest(f, 'sha256').hexdigest()
    if digest != fixture['derivative']['sha256']:
        raise RuntimeError('Original human PCM derivative SHA-256 mismatch')
    source = decode(path)
    project = json.loads((ROOT / (case['name'] + '.json')).read_text())
    clip = project['clips'][0]
    duration = clip['duration']
    if abs(duration * area(case['curve'], 1) - (case['sourceOut'] - case['sourceIn'])) > .001:
        raise RuntimeError('Shared curve integral does not match original source span')
    output = {kind: decode(ROOT / f"{kind}-{case['name']}.mp4") for kind in ['native', 'web']}
    rows = []
    rejected = {}
    for at in np.arange(.25, duration - .25, CRITERIA['samplingStepSeconds']):
        source_at = case['sourceIn'] + duration * area(case['curve'], float(at / duration))
        estimates = [estimate(source, source_at + delta) for delta in [-.06, -.03, 0, .03, .06]]
        if not all(item['valid'] for item in estimates):
            rejected['low confidence/ambiguous source'] = rejected.get('low confidence/ambiguous source', 0) + 1
            continue
        center = estimates[2]['hz']
        variation = max(cents(item['hz'], center) for item in estimates) - min(cents(item['hz'], center) for item in estimates)
        if variation > CRITERIA['sourceStabilityMaximumRangeCents']:
            rejected['source pitch changes too quickly'] = rejected.get('source pitch changes too quickly', 0) + 1
            continue
        row = dict(outputTimeSeconds=float(at), sourceTimeSeconds=source_at,
                   source=estimates[2], stableSourceRangeCents=variation, outputs={})
        for kind, pcm in output.items():
            measured = estimate(pcm, float(at))
            if measured['valid']:
                measured['errorCents'] = cents(measured['hz'], center)
                measured['octaveError'] = 1000 <= abs(measured['errorCents']) <= 1400
            row['outputs'][kind] = measured
        rows.append(row)
    bins = len({int(row['sourceTimeSeconds']) for row in rows})
    sufficient = (len(rows) >= CRITERIA['minimumReliableSourceSamples']
                  and bins >= CRITERIA['minimumDistinctSourceSecondBins'])
    measurements = {}
    for kind in output:
        matched = [row['outputs'][kind] for row in rows if row['outputs'][kind]['valid']]
        errors = [abs(item['errorCents']) for item in matched]
        fraction = len(matched) / len(rows) if rows else 0
        median = float(np.median(errors)) if errors else None
        p90 = float(np.percentile(errors, 90)) if errors else None
        within = sum(error <= 100 for error in errors) / len(errors) if errors else 0
        octaves = sum(item['octaveError'] for item in matched) / len(matched) if matched else 0
        passed = (sufficient and fraction >= CRITERIA['minimumOutputVoicedRetention']
                  and median is not None and median <= CRITERIA['maximumMedianAbsoluteErrorCents']
                  and p90 <= CRITERIA['maximumP90AbsoluteErrorCents']
                  and within >= CRITERIA['minimumWithin100CentsFraction']
                  and octaves <= CRITERIA['maximumOctaveErrorFraction'])
        measurements[kind] = dict(passed=bool(passed), status='inconclusive source F0 evidence' if not sufficient else 'passed' if passed else 'F0 retention failed',
            matchedVoicedSamples=len(matched), outputVoicedRetention=fraction,
            medianAbsoluteErrorCents=median, p90AbsoluteErrorCents=p90,
            within100CentsFraction=within, octaveErrorFraction=octaves,
            decodedSeconds=len(output[kind])/RATE)
    return dict(name=case['name'], fixtureId=case['fixtureId'], sourceDerivativePCMSHA256=digest,
                unchangedPublisherFLACSHA256=fixture['sha256'],
                curve=case['curve'], timelineSeconds=duration, reliableSourceSamples=len(rows),
                distinctSourceSecondBins=bins, sourceEvidenceSufficient=sufficient,
                rejectedSourceWindows=rejected, measurements=measurements, windows=rows)


def main():
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise SystemExit('Human speech media decoding is restricted to GitHub Actions.')
    source_report = json.loads((ROOT / 'human-speech-source-report.json').read_text())
    if not source_report['archive']['fullCompressedArchiveHashed'] or source_report['archive']['md5'] != '32fa31d27d2e1cad72775fee3f4849a9':
        raise RuntimeError('Authoritative human-source archive identity mismatch')
    if len(source_report['fixtures']) != 2 or len({fixture['speakerId'] for fixture in source_report['fixtures']}) != 2:
        raise RuntimeError('Two distinct documented human readers are required')
    native_report = json.loads((ROOT / 'native-audio-report.json').read_text())
    native_source = '9082f2686b7896e49561d2c531fd3ec105e456eb'
    if native_report['nativeSource'] != native_source:
        raise RuntimeError('Released native reference identity mismatch')
    metadata = {fixture['id']: fixture for fixture in source_report['fixtures']}
    cases = [case for case in json.loads((ROOT / 'audio-cases.json').read_text())
             if case.get('fixtureId') in metadata and case['name'].startswith('speech-')]
    results = []; errors = []
    for case in cases:
        try:
            results.append(analyse_case(case, metadata))
        except Exception as error:
            errors.append(dict(name=case['name'], error=str(error)))
    web_pass = len(results) >= 4 and not errors and all(row['measurements']['web']['passed'] for row in results)
    native_pass = len(results) >= 4 and not errors and all(row['measurements']['native']['passed'] for row in results)
    report = dict(status='passed' if web_pass else 'failed or inconclusive', webPassed=web_pass,
                  nativeBaselineMeetsSamePitchChecks=native_pass, nativeSource=native_source,
                  criteria=CRITERIA, results=results, errors=errors,
                  method='YIN cumulative normalized difference plus normalized autocorrelation agreement; 80ms windows, original source stable across +/-60ms; mapped only by integrated timeline speed curve. No output lag search or octave folding used for acceptance.',
                  scope='Numerical voiced fundamental-frequency retention on two documented human readers and two speed ramps per reader. Reference is the verified 20-second fractional PCM derivative supplied to both applications; unchanged publisher FLAC membership hashes are retained. Missing reliable evidence fails. Native/Web assessed independently. No listening, timbre, full speech intelligibility, semantic fidelity or general perceptual equivalence is claimed.')
    (ROOT / 'human-pitch-report.json').write_text(json.dumps(report, indent=2))
    print(json.dumps({key:value for key,value in report.items() if key!='results'}, indent=2))
    for row in results:
        print(json.dumps({key:value for key,value in row.items() if key!='windows'}), flush=True)
    if not web_pass:
        raise SystemExit('Human voiced F0 retention failed or lacked sufficient reliable evidence; report saved.')


if __name__ == '__main__':
    main()
