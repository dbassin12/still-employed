"""Render the game's music and sounds to files, using the real page in Chrome, then measure them.

  ~/projects/open-outcry/.venv/bin/python tools/render_audio.py [all|gameplay|music|effects|stems|phone]

Writes samples/*.wav and samples/*.mp3 (ignored by git) and prints loudness and peak for each clip.
These are for listening and for checking levels. The page itself ships no audio files.
"""
import base64
import re
import struct
import subprocess
import sys
import wave
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGE = (ROOT / 'dist' / 'index.html').resolve().as_uri()
OUT = ROOT / 'samples'
OUT.mkdir(exist_ok=True)
BAR = 240 / 72  # seconds in one bar at 72 beats a minute


def bars(n):
    return n * BAR


def gameplay():
    """What about 75 seconds of a real shift sounds like: paper, a few answers, a miss, a promotion."""
    ev = [{'t': 0, 'scene': 'work', 'level': 1}]
    t = 0.6
    def task(think, sfx, tail=2.6, steps=0):
        nonlocal t
        ev.append({'t': t, 'sfx': 'paper'})
        t += think
        for s in range(steps):
            ev.append({'t': t, 'sfx': 'check', 'o': {'step': s}})
            t += 1.6
        ev.append({'t': t, 'sfx': sfx})
        t += tail
    task(7.5, 'right')
    task(9.0, 'right')
    task(3.0, 'right', steps=3)
    task(8.0, 'miss', tail=4.5)
    ev.append({'t': t, 'sfx': 'paper'}); t += 2.2
    for _ in range(4):
        ev.append({'t': t, 'sfx': 'key'}); t += 0.38
    t += 0.8
    ev.append({'t': t, 'sfx': 'right'}); t += 2.6
    task(6.5, 'right')
    ev.append({'t': t, 'sfx': 'promoted', 'o': {'level': 2, 'tore': True}})
    ev.append({'t': t + 0.01, 'scene': 'work', 'level': 2})
    t += 9
    task(7.0, 'right')
    return {'seconds': t + 3, 'seed': 12, 'events': ev}


def music_tour():
    """The band as it builds through the ranks, then the Release."""
    ev, t = [], 0
    for scene, level, n in [('calm', 0, 8), ('work', 0, 8), ('work', 1, 8), ('work', 3, 8), ('work', 5, 8), ('release', 3, 8)]:
        ev.append({'t': t, 'scene': scene, 'level': level})
        t += bars(n)
    return {'seconds': t + 2, 'seed': 31, 'events': ev}


EFFECT_ORDER = ['paper', 'tap', 'key', 'check', 'right', 'miss', 'clock', 'knock', 'tear', 'reveal', 'steal', 'release', 'promoted', 'win', 'fired']


def effects_reel():
    ev, t = [{'t': 0, 'scene': 'none'}], 0.5
    for name in EFFECT_ORDER:
        o = {'level': 2} if name in ('promoted', 'release', 'win') else {}
        ev.append({'t': t, 'sfx': name, 'o': o})
        if name == 'key':
            for k in range(1, 4):
                ev.append({'t': t + k * 0.32, 'sfx': 'key'})
        if name == 'clock':
            for k in range(1, 3):
                ev.append({'t': t + k * 1.0, 'sfx': 'clock'})
        t += {'promoted': 4.0, 'win': 5.5, 'fired': 4.0, 'release': 3.2, 'clock': 3.2, 'key': 2.2}.get(name, 1.9)
    return {'seconds': t, 'seed': 5, 'music': False, 'events': ev}


def stem(name, level=4):
    gains = {'piano': 0, 'lead': 0, 'bass': 0, 'drums': 0, 'room': 0}
    gains[name] = 1
    return {'seconds': bars(8), 'seed': 77, 'stems': gains, 'events': [{'t': 0, 'scene': 'work', 'level': level}]}


def render(page, spec, name):
    page.evaluate('''async (spec) => {
      const buf = await window.SE_AUDIO.renderClip(spec);
      const l = buf.getChannelData(0), r = buf.numberOfChannels > 1 ? buf.getChannelData(1) : l;
      let bad = 0, peak = 0;
      for (let i = 0; i < l.length; i++) { if (!Number.isFinite(l[i]) || !Number.isFinite(r[i])) bad++; peak = Math.max(peak, Math.abs(l[i]), Math.abs(r[i])); }
      window.__clip = { l, r, sr: buf.sampleRate, bad, peak };
    }''', spec)
    info = page.evaluate('({ sr: window.__clip.sr, n: window.__clip.l.length, bad: window.__clip.bad, peak: window.__clip.peak })')
    if info['bad']:
        raise SystemExit(f'{name}: {info["bad"]} bad samples')
    path = OUT / f'{name}.wav'
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(info['sr'])
        step = info['sr'] * 8
        for start in range(0, info['n'], step):
            b64 = page.evaluate('''([from, to]) => {
              const { l, r } = window.__clip, end = Math.min(to, l.length), out = new Int16Array((end - from) * 2);
              for (let i = from, j = 0; i < end; i++) {
                out[j++] = Math.max(-1, Math.min(1, l[i])) * 32767;
                out[j++] = Math.max(-1, Math.min(1, r[i])) * 32767;
              }
              let s = ''; const u = new Uint8Array(out.buffer);
              for (let i = 0; i < u.length; i += 32766) s += String.fromCharCode.apply(null, u.subarray(i, i + 32766));
              return btoa(s);
            }''', [start, start + step])
            w.writeframes(base64.b64decode(b64))
    return path, info


def measure(path, label=None, extra=''):
    """Integrated loudness, loudness range, and true peak, from ffmpeg."""
    af = (extra + ',' if extra else '') + 'ebur128=peak=true'
    run = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af', af, '-f', 'null', '-'], capture_output=True, text=True)
    tail = run.stderr[run.stderr.rfind('Summary:'):]
    grab = lambda key: (re.search(key + r':\s+(-?[\d.]+|-inf)', tail) or [None, '?'])[1]
    print(f'  {label or path.stem:<28} {grab("I"):>6} LUFS   range {grab("LRA"):>5} LU   true peak {grab("Peak"):>6} dBFS')


def mp3(path):
    out = path.with_suffix('.mp3')
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(path), '-codec:a', 'libmp3lame', '-b:a', '192k', str(out)], check=True)
    return out


def picture(path):
    out = path.with_name(path.stem + '-spectrum.png')
    subprocess.run(['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', str(path), '-lavfi', 'showspectrumpic=s=1500x600:legend=1:scale=log:fscale=log:color=viridis:stop=16000', str(out)], check=True)
    return out


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else 'all'
    with sync_playwright() as p:
        b = p.chromium.launch(channel='chrome')
        page = b.new_page()
        page.goto(PAGE)
        if mode in ('all', 'gameplay'):
            path, info = render(page, gameplay(), 'still-employed-gameplay')
            print(f'gameplay: {info["n"] / info["sr"]:.0f}s, sample peak {info["peak"]:.3f}')
            measure(path); mp3(path); picture(path)
        if mode in ('all', 'music'):
            path, info = render(page, music_tour(), 'still-employed-music')
            print(f'music tour: {info["n"] / info["sr"]:.0f}s, sample peak {info["peak"]:.3f}')
            measure(path); mp3(path); picture(path)
        if mode in ('all', 'effects'):
            path, info = render(page, effects_reel(), 'still-employed-effects')
            print(f'effects: {info["n"] / info["sr"]:.0f}s, sample peak {info["peak"]:.3f}. Order: {", ".join(EFFECT_ORDER)}')
            measure(path); mp3(path); picture(path)
        if mode in ('all', 'stems'):
            print('stems, band at level 4:')
            for name in ('piano', 'bass', 'drums', 'lead', 'room'):
                path, info = render(page, stem(name), f'stem-{name}')
                measure(path, name)
            print('each scene alone:')
            for label, scene, level in [('calm', 'calm', 0), ('work 0', 'work', 0), ('work 1', 'work', 1), ('work 2', 'work', 2), ('work 3', 'work', 3), ('work 5', 'work', 5), ('release', 'release', 3)]:
                path, info = render(page, {'seconds': bars(8), 'seed': 19, 'events': [{'t': 0, 'scene': scene, 'level': level}]}, f'scene-{scene}-{level}')
                measure(path, label)
                measure(path, label + ' on a phone', 'highpass=f=300:p=2,highpass=f=300:p=2')
        if mode in ('all', 'phone'):
            path = OUT / 'still-employed-gameplay.wav'
            if path.exists():
                print('gameplay through a phone-speaker filter:')
                measure(path, 'gameplay on a phone', 'highpass=f=300:p=2,highpass=f=300:p=2')
        b.close()


if __name__ == '__main__':
    main()
