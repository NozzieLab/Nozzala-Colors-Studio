# Rhythm game sources and music

Tap grades, combo, accuracy and the one-million-point score formula are adapted from osu!mania (lazer), using the MIT-licensed implementation at commit `b8657755ae09bad891ddb5786d8cd9b978b6ae23`. The display uses Nozzala's physical two-row, three-column layout; each key has its own falling-note area. Timing and note selection have been made more forgiving for this keyboard:

- [ManiaHitWindows.cs](https://github.com/ppy/osu/blob/b8657755ae09bad891ddb5786d8cd9b978b6ae23/osu.Game.Rulesets.Mania/Scoring/ManiaHitWindows.cs)
- [ManiaScoreProcessor.cs](https://github.com/ppy/osu/blob/b8657755ae09bad891ddb5786d8cd9b978b6ae23/osu.Game.Rulesets.Mania/Scoring/ManiaScoreProcessor.cs)
- [ScoreProcessor.cs](https://github.com/ppy/osu/blob/b8657755ae09bad891ddb5786d8cd9b978b6ae23/osu.Game/Rulesets/Scoring/ScoreProcessor.cs)
- [Judgement documentation](https://osu.ppy.sh/wiki/en/Gameplay/Judgement/osu!mania)

This is an independent implementation for Nozzala's six keys, not an official osu! client. It uses tap notes only, generated deterministically from MIDI note onsets. No osu! artwork, skins or beatmaps are bundled. The original lazer windows remain in the archived source and reference function; gameplay uses the following project-specific windows, in milliseconds before or after a note:

| Difficulty | PERFECT | GREAT | GOOD | OK | MEH |
| --- | ---: | ---: | ---: | ---: | ---: |
| Easy | 80 | 125 | 175 | 225 | 270 |
| Normal | 60 | 100 | 145 | 190 | 230 |
| Hard | 40 | 75 | 110 | 150 | 190 |

Hits choose the nearest pending note on that physical key; ties choose the earlier note. Skipped earlier notes become misses exactly once. Presses outside the early hit window do not consume future notes as misses; overdue notes expire after the final hit window. Holding a key cannot score repeatedly. These are usability choices, not measured hardware latency limits. Hit rings, particles, per-key miss feedback and 25-combo milestones are original visuals. Reduced-motion preference disables particles, expanding rings and scaling animations while retaining the essential falling notes and static feedback.

## Music

- **The Entertainer** — Scott Joplin, 1902. [Mutopia 263](https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=263), typeset by Chris Sawer, Mutopia-2016/11/25-263. Mutopia marks the composition and engraving/MIDI as Public Domain. Nozzie Lab restored the score's `p`, `f`, `fz`, crescendo and diminuendo markings, which the original LilyPond MIDI block omitted, then balanced the melody and accompaniment. Pitches, onsets, note lengths and the score export's steady 72 BPM are unchanged. This edited MIDI and its derived note timeline remain public domain (Nozzie Lab waives any rights in these MIDI edits under [CC0](https://creativecommons.org/publicdomain/zero/1.0/)).

  The accompanying piano audio is rendered by Nozzie Lab using **Salamander Grand Piano by Alexander Holm**, as distributed by [Tone.js](https://github.com/Tonejs/audio/tree/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander), pinned at `efd8296360f9526e379bfbe5c1698ff54d6a1d34`. The [original sample licence and author credit](https://github.com/Tonejs/audio/blob/efd8296360f9526e379bfbe5c1698ff54d6a1d34/salamander/README) specify **[CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)**. This rendered audio is also offered under CC BY 3.0. Changes to samples: leading silence trimmed, nearest sampled pitch shifted at most one semitone, MIDI velocity applied, short release envelopes, global gain, and stereo MP3 encoding. This is a sampled rendering, not a live pianist recording or the full 16-layer Salamander instrument. Sample snapshots, hashes and the reproducible Python render script are kept in the engineering repository.
- **Für Elise** — Ludwig van Beethoven, 1810. MIDI interpretation and accompanying piano audio by **Bernd Krueger**, [Classical Piano MIDI Page](http://piano-midi.de/beeth.htm), MIDI dated 2012-08-30. [MIDI source](http://piano-midi.de/midis/beethoven/elise.mid), [MP3 source](http://piano-midi.de/mp3/beethoven/elise.mp3), [publisher's licence notice](http://piano-midi.de/copy.htm). Licensed **[Creative Commons Attribution-ShareAlike 3.0 Germany](https://creativecommons.org/licenses/by-sa/3.0/de/)**. The MIDI and MP3 are distributed unmodified. The derived Für Elise timeline in `music-data.js` and generated game charts are also offered under this same licence, with attribution to Bernd Krueger. Adaptations: the timeline starts at the first note, pedal extends note durations, and notes are mapped to six game lanes with difficulty-dependent density. The audio is played from 0.894 seconds to align its first attack with the timeline; no tempo stretching is applied. The composition is public domain; **this interpretation and audio are licensed, not public domain**.

Krueger describes his work as carefully authored step-sequenced interpretations, **not live pianist recordings** ([FAQ](http://piano-midi.de/faq.htm)). The bundled version has 1041 notes, velocities 17–82, 923 tempo events and 154 pedal events. Its accompanying piano audio retains that expression and is scheduled on the same Web Audio clock as the game. The audio, MIDI and derived musical material retain their CC BY-SA licence independently of the surrounding application code. Full source and modification details are provided here; no additional restrictions are imposed on those assets.

Both bundled songs use their accompanying piano audio, aligned to the MIDI chart on the same audio clock. Locally imported MIDI uses a basic browser synthesiser which preserves note timing, velocity and channel-specific sustain pedal. Instrument changes and half-pedal are not rendered. The former mechanical Mutopia Für Elise is retained only as engineering comparison evidence, not offered as the game's default. Source snapshots and checksums are retained in the engineering repository.

Mr. Sandman is not bundled. Users may load their own appropriately licensed MIDI locally; imported files are not uploaded or stored by the site. Charts are generated by this project, with different note density and overall difficulty at each level. Physical key positions are 01 / 02 / 03 on the top row and 04 / 05 / 06 on the bottom row. Each note falls to the line inside its own key area.

## osu! MIT licence

Copyright (c) 2025 ppy Pty Ltd <contact@ppy.sh>.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
