"""GitHub-only pitch retention and bounded prototype PCM windows."""
import array,json,math
from pathlib import Path
root=Path('output/playwright');report=json.loads((root/'pitch-prototype-report.json').read_text());results=[]
for entry in report['results']:
    data=array.array('f');data.frombytes((root/('pitch-'+str(entry['tempo']).removesuffix('.0')+'.f32')).read_bytes());assert len(data)==entry['frames']*2,(entry,len(data))
    assert all(math.isfinite(value) for value in data)
    derivative=max(abs(data[i+2]-data[i]) for i in range(0,len(data)-2,2));assert derivative<.2,(entry['tempo'],derivative)
    tail=data[-12000*2::2];assert math.sqrt(sum(value*value for value in tail)/len(tail))>.05
    rate=48000
    def peak(channel,expected):
        values=data[round(.5*rate)*2+channel:round(1.5*rate)*2:2];assert len(values)==rate
        rms=math.sqrt(sum(v*v for v in values)/len(values));assert rms>.05,rms
        # Decimate for a bounded one-second DFT; these tones lie well below Nyquist.
        values=values[::6];hz=rate/6
        energies=[(abs(sum(value*complex(math.cos(2*math.pi*f*i/hz),math.sin(2*math.pi*f*i/hz)) for i,value in enumerate(values))),f) for f in range(expected-8,expected+9)]
        _,found=max(energies);assert abs(found-expected)<=2,(entry['tempo'],expected,found);return found
    left,right=peak(0,880),peak(1,660)
    assert entry['peakCachedBytes']<8*1024*1024 and entry['peakBufferedFrames']<rate
    results.append({'tempo':entry['tempo'],'seconds':entry['seconds'],'frames':entry['frames'],'leftPitch':left,'rightPitch':right,'maxAdjacentLeftDifference':derivative,'peakCachedBytes':entry['peakCachedBytes'],'peakBufferedFrames':entry['peakBufferedFrames']})
result={'status':'passed','prototype':True,'results':results,'checks':report['checks'],'scope':report['scope']}
(root/'pitch-prototype-decoder-report.json').write_text(json.dumps(result,indent=2));print(json.dumps(result))
