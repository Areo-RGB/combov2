# Model Assets

This directory contains locally hosted model files for pose detection.

## MediaPipe Models

### WASM Files (`mediapipe/wasm/`)
- `vision_wasm_internal.js` - MediaPipe Vision WASM JavaScript wrapper
- `vision_wasm_internal.wasm` - MediaPipe Vision WASM binary
- `vision_wasm_simd_internal.js` - MediaPipe Vision WASM SIMD JavaScript wrapper
- `vision_wasm_simd_internal.wasm` - MediaPipe Vision WASM SIMD binary

**Source:** Downloaded from `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.0/wasm/`

### Model Files (`mediapipe/models/`)
- `pose_landmarker_lite.task` - Lite model (fastest, least accurate)
- `pose_landmarker_full.task` - Full model (balanced speed and accuracy)
- `pose_landmarker_heavy.task` - Heavy model (slowest, most accurate)

**Source:** Downloaded from Google Cloud Storage:
- `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_{variant}/float16/1/pose_landmarker_{variant}.task`

## TensorFlow.js Models

The TensorFlow.js models (MoveNet and BlazePose) are currently loaded from CDN by default. To use local models, you would need to:

1. Download the model files from TensorFlow Hub:
   - MoveNet Lightning: `https://tfhub.dev/google/movenet/singlepose/lightning/4`
   - MoveNet Thunder: `https://tfhub.dev/google/movenet/singlepose/thunder/4`
   - BlazePose: `https://tfhub.dev/mediapipe/models/blazepose_pose_estimator`

2. Place them in the appropriate directories:
   - `models/movenet/singlepose-lightning/`
   - `models/movenet/singlepose-thunder/`
   - `models/blazepose/{variant}/`

3. Configure TensorFlow.js IO handlers to load from local paths.

## Usage

The application is configured to load MediaPipe models from these local paths:
- WASM files: `/assets/mediapipe/wasm`
- Model files: `/assets/mediapipe/models/pose_landmarker_{variant}.task`

Make sure these files are accessible via your web server when the application runs.

