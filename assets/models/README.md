# TensorFlow.js Model Files

This directory should contain TensorFlow.js model files for MoveNet and BlazePose pose detection models.

## Directory Structure

```
models/
├── movenet/
│   ├── singlepose-lightning/
│   │   └── model.json (and weight files referenced in model.json)
│   ├── singlepose-thunder/
│   │   └── model.json (and weight files referenced in model.json)
│   └── multipose-lightning/
│       └── model.json (and weight files referenced in model.json)
└── blazepose/
    ├── lite/
    │   ├── detector/
    │   │   └── model.json (and weight files)
    │   └── landmark/
    │       └── model.json (and weight files)
    ├── full/
    │   ├── detector/
    │   │   └── model.json (and weight files)
    │   └── landmark/
    │       └── model.json (and weight files)
    └── heavy/
        ├── detector/
        │   └── model.json (and weight files)
        └── landmark/
            └── model.json (and weight files)
```

## Downloading Models

### MoveNet Models

MoveNet models can be downloaded from TensorFlow Hub:

1. **MoveNet Lightning (SinglePose)**:
   ```bash
   # Download the model
   curl -L "https://tfhub.dev/google/movenet/singlepose/lightning/4?tfjs-format=compressed" -o movenet-lightning.tar.gz
   
   # Extract to the correct directory
   mkdir -p assets/models/movenet/singlepose-lightning
   tar -xzf movenet-lightning.tar.gz -C assets/models/movenet/singlepose-lightning/
   ```

2. **MoveNet Thunder (SinglePose)**:
   ```bash
   curl -L "https://tfhub.dev/google/movenet/singlepose/thunder/4?tfjs-format=compressed" -o movenet-thunder.tar.gz
   mkdir -p assets/models/movenet/singlepose-thunder
   tar -xzf movenet-thunder.tar.gz -C assets/models/movenet/singlepose-thunder/
   ```

3. **MoveNet Lightning (MultiPose)**:
   ```bash
   curl -L "https://tfhub.dev/google/movenet/multipose/lightning/1?tfjs-format=compressed" -o movenet-multipose.tar.gz
   mkdir -p assets/models/movenet/multipose-lightning
   tar -xzf movenet-multipose.tar.gz -C assets/models/movenet/multipose-lightning/
   ```

### BlazePose Models

BlazePose models require downloading both detector and landmark models:

1. **BlazePose Lite**:
   ```bash
   # Detector model
   curl -L "https://tfhub.dev/mediapipe/blazepose_pose_estimator/lite/1?tfjs-format=compressed" -o blazepose-lite-detector.tar.gz
   mkdir -p assets/models/blazepose/lite/detector
   tar -xzf blazepose-lite-detector.tar.gz -C assets/models/blazepose/lite/detector/
   
   # Landmark model
   curl -L "https://tfhub.dev/mediapipe/blazepose_pose_estimator/landmark/lite/1?tfjs-format=compressed" -o blazepose-lite-landmark.tar.gz
   mkdir -p assets/models/blazepose/lite/landmark
   tar -xzf blazepose-lite-landmark.tar.gz -C assets/models/blazepose/lite/landmark/
   ```

2. **BlazePose Full**:
   ```bash
   # Detector model
   curl -L "https://tfhub.dev/mediapipe/blazepose_pose_estimator/full/1?tfjs-format=compressed" -o blazepose-full-detector.tar.gz
   mkdir -p assets/models/blazepose/full/detector
   tar -xzf blazepose-full-detector.tar.gz -C assets/models/blazepose/full/detector/
   
   # Landmark model
   curl -L "https://tfhub.dev/mediapipe/blazepose_pose_estimator/landmark/full/1?tfjs-format=compressed" -o blazepose-full-landmark.tar.gz
   mkdir -p assets/models/blazepose/full/landmark
   tar -xzf blazepose-full-landmark.tar.gz -C assets/models/blazepose/full/landmark/
   ```

3. **BlazePose Heavy**:
   ```bash
   # Detector model
   curl -L "https://tfhub.dev/mediapipe/blazepose_pose_estimator/heavy/1?tfjs-format=compressed" -o blazepose-heavy-detector.tar.gz
   mkdir -p assets/models/blazepose/heavy/detector
   tar -xzf blazepose-heavy-detector.tar.gz -C assets/models/blazepose/heavy/detector/
   
   # Landmark model
   curl -L "https://tfhub.dev/mediapipe/blazepose_pose_estimator/landmark/heavy/1?tfjs-format=compressed" -o blazepose-heavy-landmark.tar.gz
   mkdir -p assets/models/blazepose/heavy/landmark
   tar -xzf blazepose-heavy-landmark.tar.gz -C assets/models/blazepose/heavy/landmark/
   ```

## Model Format

Each model directory should contain:
- `model.json` - Model topology and weight manifest
- Weight files (`.bin` files) referenced in `model.json`

The application will automatically check if local models exist and use them if available. If local models are not found, it will fall back to loading from CDN.

## Verification

After downloading, verify the structure:
- Each `model.json` file should exist
- All weight files referenced in `model.json` should be present in the same directory
- The application console will log whether it's using local or CDN models

