# Asset sources

The source of this repository is published, so every asset must allow redistribution in a public source repository:
CC0, CC BY 4.0 with attribution, or made by us.
Licenses that only allow use inside a built product (Unity Asset Store, Mixkit, Envato, Sketchfab "Standard", Mixamo
files etc.) are not acceptable.

## Third-party assets

| File                                                                      | Source                                                                                                              | Author          | License                                                       | Changes                                                                 |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `dog/shiba-inu.glb`, `../../assets-src/dog/shiba-inu.glb`                 | "ShibaInu" from the [Ultimate Animated Animal Pack](https://quaternius.com/packs/ultimateanimatedanimals.html)      | Quaternius      | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | see [dog/README.md](dog/README.md)                                      |
| `sounds/dog-barking-twice.wav`                                            | [LBS_FX DOG Small Alert Bark001.wav](https://freesound.org/people/LittleBigSounds/sounds/163459/)                   | LittleBigSounds | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | trimmed to the two barks, mono, loudness matched (see [below](#sounds)) |
| `testing/guitar.glb`, ukulele in `testing/musician.glb`                   | [Ukulele 01](https://polyhaven.com/a/Ukulele_01) (Poly Haven)                                                       | Joseph Burgan   | [CC0 1.0](https://polyhaven.com/license)                      | optimized                                                               |
| `testing/sign-*.glb`, `../../assets-src/tracked/signs.blend`              | [Standing Chalkboard 01](https://polyhaven.com/a/standing_chalkboard_01) (Poly Haven)                               | ParzivalCG      | [CC0 1.0](https://polyhaven.com/license)                      | text added (font Viner Hand ITC, converted to geometry)                 |
| `testing/musician.glb`, `testing/runner.glb`, man in `testing/vendor.glb` | [Standing Man](https://sketchfab.com/3d-models/standing-man-8401da7cb2564fc08681836cbeff39bc) (Sketchfab)           | zhuoyi0904      | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)     | outfits recolored, posed, optimized                                     |
| `testing/apples.glb`, apples in `testing/vendor.glb`                      | [Burlap Apple Sack](https://sketchfab.com/3d-models/burlap-apple-sack-d663b73f8c7c4e18b49ffad0dbe21945) (Sketchfab) | Glowbox 3D      | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)     | optimized                                                               |

### Required attribution

- "[Standing Man](https://sketchfab.com/3d-models/standing-man-8401da7cb2564fc08681836cbeff39bc)" by zhuoyi0904,
  licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), modified.
- "[Burlap Apple Sack](https://sketchfab.com/3d-models/burlap-apple-sack-d663b73f8c7c4e18b49ffad0dbe21945)" by
  Glowbox 3D, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), modified.

## Made by us

- `arrow.glb`, `target_area.glb`, `himmelsrichtungen.glb` and their sources in `../../assets-src/tracked/`
- `testing/footprints *.glb` and `../../assets-src/tracked/footprints.blend`
  (the blend file also packs the textures and a shoe of "Standing Man", see attribution above)
- `sounds/error-click.wav` and `sounds/alarm-whoop.wav`, synthesized with ffmpeg (see [below](#sounds))

## Not cleared for publishing

- `../../assets-src/tracked/standing-man.blend` contains "Standing Man" rigged with Mixamo, including the Mixamo
  animation `Armature|mixamo.com|Layer0`. Adobe does not allow redistributing Mixamo characters or animations as raw
  files. The armature and the action have to be removed before publishing.
- `testing/shoes.glb`: source unknown. Its generic names (`Mesh_0`, `Material_0`) and smeared texture suggest an
  image-to-3D generator. Has to be cleared with its author or replaced.
- "Standing Man" was made with the Avatar SDK MetaPerson creator, whose terms for exported avatars we could not find,
  and may show a real person's face. Low risk, but worth knowing.

## Sounds

The three navigation sounds are mono WAVs whose loudness matches the sounds they replaced
(bark −14.5 LUFS, click −19 LUFS, alarm −20.5 LUFS).
They were generated with ffmpeg 8.0:

```bash
# Freesound only offers the original file after login; the CC0 license covers the high-quality preview as well.
curl -sL -o bark.mp3 https://cdn.freesound.org/previews/163/163459_2965892-hq.mp3

ffmpeg -i bark.mp3 \
  -af "pan=mono|c0=0.5*c0+0.5*c1,aresample=44100,atrim=start=0.27:end=1.27,asetpts=PTS-STARTPTS,afade=t=in:d=0.01,afade=t=out:st=0.85:d=0.15,volume=9.6dB,alimiter=limit=0.89:level=false:attack=1:release=20" \
  -c:a pcm_s16le dog-barking-twice.wav

# two short decaying tones, the second one lower
ffmpeg -f lavfi -i "aevalsrc='lt(t,0.15)*exp(-30*t)*(sin(2*PI*520*t)+0.3*sin(2*PI*1560*t)) + gte(t,0.15)*exp(-30*(t-0.15))*(sin(2*PI*440*(t-0.15))+0.3*sin(2*PI*1320*(t-0.15)))':s=44100:d=0.45" \
  -af volume=-5.1dB -c:a pcm_s16le error-click.wav

# two buzzy whoops rising from 400 to 800 Hz, so that it loops seamlessly when replayed every second
ffmpeg -f lavfi -i "aevalsrc='st(0,mod(t,0.5)); st(1,2*PI*(400*ld(0)+400*ld(0)*ld(0)/0.9)); 0.5*lt(ld(0),0.45)*min(1,ld(0)/0.01)*min(1,(0.45-ld(0))/0.03)*(sin(ld(1))+sin(2*ld(1))/2+sin(3*ld(1))/3+sin(4*ld(1))/4+sin(5*ld(1))/5)':s=44100:d=0.95" \
  -af volume=-12.7dB -c:a pcm_s16le alarm-whoop.wav
```
