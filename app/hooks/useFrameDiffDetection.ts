'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export interface DetectionZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FrameDiffConfig {
  sensitivityLevel: number; // 1-10
  detectionZone: DetectionZone | null;
  cooldown: number;
  cadence: number;
  debug?: boolean;
}

export interface FrameDiffResult {
  detected: boolean;
  intensity: number;
  pixelsChanged: number;
  totalPixels: number;
  timestamp: number;
}

export function useFrameDiffDetection(
  videoElement: HTMLVideoElement | null,
  config: FrameDiffConfig,
  onMotionDetected?: (result: FrameDiffResult) => void
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const previousFrameRef = useRef<ImageData | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [detectionCounter, setDetectionCounter] = useState(0);
  const [currentFPS, setCurrentFPS] = useState(0);
  const lastMotionTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);
  const frameCountRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(0);

  const updateFPS = useCallback(() => {
    const now = performance.now();
    frameCountRef.current++;

    if (now - lastFrameTimeRef.current >= 1000) {
      setCurrentFPS(frameCountRef.current);
      frameCountRef.current = 0;
      lastFrameTimeRef.current = now;
    }
  }, []);

  const analyzeFrameDifference = useCallback(
    (currentFrame: ImageData, previousFrame: ImageData): FrameDiffResult => {
      const current = currentFrame.data;
      const previous = previousFrame.data;
      let changedPixels = 0;
      const totalPixels = currentFrame.width * currentFrame.height;

      // Calculate threshold based on sensitivity (1=high threshold, 10=low threshold)
      // Sensitivity 1: 50 threshold, Sensitivity 10: 5 threshold
      const pixelThreshold = 55 - (config.sensitivityLevel * 5);

      for (let i = 0; i < current.length; i += 4) {
        const rDiff = Math.abs(current[i] - previous[i]);
        const gDiff = Math.abs(current[i + 1] - previous[i + 1]);
        const bDiff = Math.abs(current[i + 2] - previous[i + 2]);
        const avgDiff = (rDiff + gDiff + bDiff) / 3;

        if (avgDiff > pixelThreshold) {
          changedPixels++;
        }
      }

      const changePercentage = (changedPixels / totalPixels) * 100;

      // Motion detected if more than threshold percentage of pixels changed
      // Sensitivity affects this: higher sensitivity = lower required percentage
      const motionThreshold = 0.5 - (config.sensitivityLevel * 0.03);
      const detected = changePercentage > motionThreshold;

      return {
        detected,
        intensity: Math.min(100, changePercentage * 10),
        pixelsChanged: changedPixels,
        totalPixels,
        timestamp: Date.now(),
      };
    },
    [config.sensitivityLevel]
  );

  const handleMotionDetected = useCallback(
    (motionData: FrameDiffResult) => {
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
    if (!videoElement) {
      return;
    }

    let isRunning = true;

    // Create canvas for frame capture
    const canvas = document.createElement('canvas');
    canvasRef.current = canvas;

    const initialize = () => {
      if (!videoElement.videoWidth || !videoElement.videoHeight) {
        console.log('Video dimensions not ready, retrying...');
        setTimeout(initialize, 100);
        return;
      }

      canvas.width = videoElement.videoWidth;
      canvas.height = videoElement.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (!ctx) {
        console.error('Failed to get canvas context');
        return;
      }

      console.log('Frame difference detection initialized:', canvas.width, 'x', canvas.height);
      setIsActive(true);

      const processLoop = () => {
        if (!isRunning) return;

        try {
          // Draw current frame
          ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
          const currentFrame = ctx.getImageData(0, 0, canvas.width, canvas.height);

          updateFPS();

          // Compare with previous frame
          if (previousFrameRef.current) {
            const motionData = analyzeFrameDifference(currentFrame, previousFrameRef.current);

            if (config.debug) {
              console.log('Motion:', motionData.detected, 'Changed:', motionData.pixelsChanged, 'Intensity:', motionData.intensity.toFixed(2));
            }

            if (motionData.detected) {
              handleMotionDetected(motionData);
            }
          }

          // Store current frame for next comparison
          previousFrameRef.current = currentFrame;
        } catch (error) {
          console.error('Frame difference error:', error);
        }

        animationFrameRef.current = requestAnimationFrame(processLoop);
      };

      processLoop();
    };

    initialize();

    return () => {
      isRunning = false;

      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      previousFrameRef.current = null;
      canvasRef.current = null;
      setIsActive(false);
    };
  }, [videoElement, config, analyzeFrameDifference, handleMotionDetected, updateFPS]);

  return {
    isActive,
    motionDetected,
    detectionCounter,
    currentFPS,
    detectionProgress: { current: detectionCounter, total: config.cadence },
    isSupported: true,
  };
}
