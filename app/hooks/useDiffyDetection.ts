'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { create, DiffyInstance } from 'diffyjs';

export interface DetectionZone {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiffyDetectionConfig {
  sensitivityLevel: number; // 1-10
  detectionZone: DetectionZone | null;
  cooldown: number;
  cadence: number;
  debug?: boolean;
}

export interface MotionResult {
  detected: boolean;
  intensity: number;
  timestamp: number;
}

const MATRIX_WIDTH = 40;
const MATRIX_HEIGHT = 30;

export function useDiffyDetection(
  videoElement: HTMLVideoElement | null,
  config: DiffyDetectionConfig,
  onMotionDetected?: (result: MotionResult) => void
) {
  const diffyRef = useRef<DiffyInstance | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [motionDetected, setMotionDetected] = useState(false);
  const [detectionCounter, setDetectionCounter] = useState(0);
  const lastMotionTimeRef = useRef<number>(0);

  const mapSensitivityToParams = (level: number): { sensitivity: number; threshold: number } => {
    const clampedLevel = Math.max(1, Math.min(10, level));
    const sensitivity = 0.1 + ((clampedLevel - 1) / 9) * 0.4;
    const threshold = 10 + ((clampedLevel - 1) / 9) * 40;
    return { sensitivity, threshold };
  };

  const calculateMotionInZone = useCallback(
    (matrix: number[][], zone: DetectionZone | null): number => {
      const matrixHeight = matrix.length;
      const matrixWidth = matrix[0]?.length || 0;

      if (matrixHeight === 0 || matrixWidth === 0) return 0;

      if (!zone || zone.width === 0 || zone.height === 0) {
        let total = 0;
        let count = 0;
        for (let y = 0; y < matrixHeight; y++) {
          for (let x = 0; x < matrixWidth; x++) {
            total += matrix[y][x];
            count++;
          }
        }
        return count > 0 ? (total / count) * (100 / 255) : 0;
      }

      const CANVAS_WIDTH = 160;
      const CANVAS_HEIGHT = 120;
      const scaleX = matrixWidth / CANVAS_WIDTH;
      const scaleY = matrixHeight / CANVAS_HEIGHT;

      const startX = Math.floor(zone.x * scaleX);
      const startY = Math.floor(zone.y * scaleY);
      const endX = Math.min(matrixWidth, Math.ceil((zone.x + zone.width) * scaleX));
      const endY = Math.min(matrixHeight, Math.ceil((zone.y + zone.height) * scaleY));

      let total = 0;
      let count = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          if (matrix[y] && matrix[y][x] !== undefined) {
            total += matrix[y][x];
            count++;
          }
        }
      }

      return count > 0 ? (total / count) * (100 / 255) : 0;
    },
    []
  );

  const handleMotionDetected = useCallback(
    (intensity: number) => {
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

          const result: MotionResult = {
            detected: true,
            intensity,
            timestamp: now,
          };

          if (onMotionDetected) {
            onMotionDetected(result);
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
    if (!videoElement) return;

    const { sensitivity, threshold } = mapSensitivityToParams(config.sensitivityLevel);

    const diffyInstance = create({
      resolution: {
        x: MATRIX_WIDTH,
        y: MATRIX_HEIGHT,
      },
      sensitivity,
      threshold,
      debug: config.debug || false,
      onFrame: (matrix: number[][]) => {
        const motionAmount = calculateMotionInZone(matrix, config.detectionZone);
        const detectionThreshold = 11 - config.sensitivityLevel;

        if (motionAmount > detectionThreshold) {
          handleMotionDetected(motionAmount);
        }
      },
    });

    diffyRef.current = diffyInstance;
    setIsActive(true);

    return () => {
      if (diffyInstance) {
        diffyInstance.stop();
      }
      diffyRef.current = null;
      setIsActive(false);
    };
  }, [videoElement, config, calculateMotionInZone, handleMotionDetected]);

  return {
    isActive,
    motionDetected,
    detectionCounter,
    detectionProgress: { current: detectionCounter, total: config.cadence },
  };
}
