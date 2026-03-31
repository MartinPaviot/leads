# Monaco Feature Videos - Download & Frame Extraction Summary

Generated: 2026-03-30

## Source

All videos downloaded from `https://cdn.monaco.com/landing/public/pages/home/features/`

## Video Details

### Theme 1: "Everything you need"

| File | Duration | Resolution | FPS | Codec | File Size | Frames Extracted |
|------|----------|------------|-----|-------|-----------|-----------------|
| feature-1-1.webm | 10.00s | 700x700 | 60 | VP9 | 321 KB | 5 |
| feature-1-2.webm | 10.00s | 696x696 | 60 | VP9 | 950 KB | 5 |
| feature-1-3.webm | 10.00s | 696x696 | 60 | VP9 | 507 KB | 5 |

### Theme 2: "Time to value"

| File | Duration | Resolution | FPS | Codec | File Size | Frames Extracted |
|------|----------|------------|-----|-------|-----------|-----------------|
| feature-2-1.webm | 10.00s | 700x700 | 60 | VP9 | 720 KB | 5 |
| feature-2-2.webm | 10.00s | 696x696 | 60 | VP9 | 738 KB | 5 |
| feature-2-3.webm | 10.00s | 700x700 | 60 | VP9 | 264 KB | 5 |

### Theme 3: "Agents working for you"

| File | Duration | Resolution | FPS | Codec | File Size | Frames Extracted |
|------|----------|------------|-----|-------|-----------|-----------------|
| feature-3-1.webm | 10.00s | 696x696 | 60 | VP9 | 1,995 KB | 5 |
| feature-3-2.webm | 10.00s | 696x696 | 60 | VP9 | 1,476 KB | 5 |
| feature-3-3.webm | 10.00s | 696x696 | 60 | VP9 | 1,577 KB | 5 |

## Extraction Settings

- Frame extraction rate: 1 frame every 2 seconds (fps=0.5)
- Output format: PNG
- Frames per video: 5 (at timestamps 0s, 2s, 4s, 6s, 8s)

## Totals

- **Total videos**: 9
- **Total duration**: 90 seconds (9 x 10s)
- **Total frames extracted**: 45
- **Total video file size**: ~8.5 MB

## Directory Structure

```
teardown-monaco/
  feature-1-1.webm
  feature-1-1-frames/
    frame_0001.png  (t=0s)
    frame_0002.png  (t=2s)
    frame_0003.png  (t=4s)
    frame_0004.png  (t=6s)
    frame_0005.png  (t=8s)
  feature-1-2.webm
  feature-1-2-frames/
    ...
  (same pattern for all 9 videos)
```

## Notes

- All videos are square aspect ratio (1:1), either 700x700 or 696x696
- All encoded with VP9 codec via libvpx-vp9, 60fps
- Theme 3 videos are noticeably larger in file size, suggesting more visual complexity/motion
- No audio streams in any video
- Frame content analysis pending (separate step)
