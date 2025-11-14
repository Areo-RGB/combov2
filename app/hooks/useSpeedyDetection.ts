'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Speedy from 'speedy-vision';

export interface DetectionZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpeedyDetectionConfig {
  sensitivityLevel: number; // 1-10
  detectionZone: DetectionZone | null;
  cooldown: number;
  cadence: number;
  debug?: boolean;
}

export interface SpeedyMotionResult {
  detected: boolean;
  intensity: number;
  velocity: number;
  direction: { x: number; y: number };
  confidence: number;
  timestamp: number;
}

export function useSpeedyDetection(
  videoElement: HTMLVideoElement | null,
  config: SpeedyDetectionConfig,
  onMotionDetected?: (result: SpeedyMotionResult) => void
) {
  const mediaRef = useRef<any>(null);
  const pipelineRef = useRef<any>(null);
  const [isActive, setIsActive] = useState(false);
  const [webGLSupported, setWebGLSupported] = useState(true);
  const [motionDetected, setMotionDetected] = useState(false);
  const [detectionCounter, setDetectionCounter] = useState(0);
  const [currentFPS, setCurrentFPS] = useState(0);
  const lastMotionTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  // Check WebGL support
  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2');
      setWebGLSupported(!!gl);
    } catch (e) {
      setWebGLSupported(false);
    }
  }, []);

  const calculateFeatureCapacity = (sensitivityLevel: number): number => {
    return 20 + (sensitivityLevel - 1) * 20;
  };

  const updateFPS = useCallback(() => {
    const now = performance.now();
    frameCountRef.current++;

    if (now - lastFrameTimeRef.current >= 1000) {
      setCurrentFPS(frameCountRef.current);
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }
  }, []);

  const analyzeOpticalFlow = useCallback(
    (keypoints: any[]): SpeedyMotionResult => {
      if (!config) {
        return {
          detected: false,
          intensity: 0,
          velocity: 0,
          direction: { x: 0, y: 0 },
          confidence: 0,
          timestamp: Date.now(),
        };
      }

      const movingKeypoints = keypoints.filter((kp) => {
        return kp.flow && (Math.abs(kp.flow.x) > 0.1 || Math.abs(kp.flow.y) > 0.1);
      });

      if (movingKeypoints.length === 0) {
        return {
          detected: false,
          intensity: 0,
          velocity: 0,
          direction: { x: 0, y: 0 },
          confidence: 0,
          timestamp: Date.now(),
        };
      }

      let totalFlowX = 0;
      let totalFlowY = 0;
      let totalMagnitude = 0;

      for (const kp of movingKeypoints) {
        const flowX = kp.flow.x;
        const flowY = kp.flow.y;
        const magnitude = Math.sqrt(flowX * flowX + flowY * flowY);

        totalFlowX += flowX;
        totalFlowY += flowY;
        totalMagnitude += magnitude;
      }

      const avgFlowX = totalFlowX / movingKeypoints.length;
      const avgFlowY = totalFlowY / movingKeypoints.length;
      const avgVelocity = totalMagnitude / movingKeypoints.length;
      const confidence = Math.min(100, (movingKeypoints.length / keypoints.length) * 100);
      const velocityThreshold = 11 - config.sensitivityLevel;
      const detected = avgVelocity > velocityThreshold;
      const intensity = Math.min(100, avgVelocity * 10);

      return {
        detected,
        intensity,
        velocity: avgVelocity,
        direction: { x: avgFlowX, y: avgFlowY },
        confidence,
        timestamp: Date.now(),
      };
    },
    [config]
  );

  const handleMotionDetected = useCallback(
    (motionData: SpeedyMotionResult) => {
      const now = Date.now();
      const lastMotion = lastMotionTimeRef.current;

      if (now - lastMotion < config.cooldown) {
        return;
      }

      setDetectionCounter((prev) => {
        const newCounter = prev + 1;

        if (newCounter >= config.cadence) {
          setMotionDetected(true);
          lastMotionTimeRef.current = now;

          if (onMotionDetected) {
            onMotionDetected(motionData);
          }

          setTimeout(() => setMotionDetected(false), 100);
          return 0;
        }

        return newCounter;
      });
    },
    [config.cooldown, config.cadence, onMotionDetected]
  );

  useEffect(() => {
    if (!videoElement || !Speedy.isSupported() || !webGLSupported) {
      return;
    }

    let isRunning = true;

    const initializePipeline = async () => {
      try {
        const media = await Speedy.load(videoElement);
        mediaRef.current = media;

        const pipeline = Speedy.Pipeline();
        const source = Speedy.Image.Source();
        source.media = media;

        const greyscale = Speedy.Filter.Greyscale();
        const blur = Speedy.Filter.GaussianBlur();
        blur.kernelSize = Speedy.Size(5, 5);

        const nightvision = Speedy.Filter.Nightvision();
        nightvision.gain = 0.5;
        nightvision.offset = 0.5;
        nightvision.decay = 0.0;

        const harris = Speedy.Keypoint.Detector.Harris();
        harris.quality = 0.1;
        harris.capacity = calculateFeatureCapacity(config.sensitivityLevel);

        const lk = Speedy.Keypoint.Tracker.LK();
        lk.windowSize = Speedy.Size(21, 21);
        lk.levels = 5;
        lk.discardThreshold = 0.0001;
        lk.epsilon = 0.01;
        lk.numberOfIterations = 30;

        const sink = Speedy.Keypoint.Sink();

        source.output().connectTo(greyscale.input());
        greyscale.output().connectTo(blur.input());
        blur.output().connectTo(nightvision.input());
        nightvision.output().connectTo(harris.input());
        harris.output().connectTo(lk.input());
        lk.output().connectTo(sink.input());

        pipeline.init(source, greyscale, blur, nightvision, harris, lk, sink);
        pipelineRef.current = pipeline;
        setIsActive(true);

        const processLoop = async () => {
          if (!isRunning || !pipelineRef.current) return;

          try {
            const result = await pipelineRef.current.run();
            const keypoints = result.keypoints;

            updateFPS();

            if (keypoints && keypoints.length > 0) {
              const motionData = analyzeOpticalFlow(keypoints);

              if (motionData.detected) {
                handleMotionDetected(motionData);
              }
            }
          } catch (error) {
            console.error('Speedy pipeline error:', error);
          }

          animationFrameRef.current = requestAnimationFrame(processLoop);
        };

        processLoop();
      } catch (error) {
        console.error('Failed to initialize speedy-vision:', error);
      }
    };

    initializePipeline();

    return () => {
      isRunning = false;

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      if (pipelineRef.current) {
        pipelineRef.current.release().catch(console.warn);
        pipelineRef.current = null;
      }

      if (mediaRef.current) {
        mediaRef.current.release().catch(console.warn);
        mediaRef.current = null;
      }

      setIsActive(false);
    };
  }, [
    videoElement,
    config,
    webGLSupported,
    analyzeOpticalFlow,
    handleMotionDetected,
    updateFPS,
  ]);

  return {
    isActive,
    webGLSupported,
    motionDetected,
    detectionCounter,
    currentFPS,
    detectionProgress: { current: detectionCounter, total: config.cadence },
    isSupported: Speedy.isSupported() && webGLSupported,
  };
}
