'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useDiffyDetection } from '@/hooks/useDiffyDetection';
import { useFrameDiffDetection } from '@/hooks/useFrameDiffDetection';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

type DetectionMode = 'diffy' | 'framediff';

export interface DetectorProps {
  sessionId: string;
  onMotionDetected: () => void;
  detectionMode?: DetectionMode;
  sensitivityLevel?: number;
}

export function Detector({
  sessionId,
  onMotionDetected,
  detectionMode = 'framediff',
  sensitivityLevel = 5,
}: DetectorProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>('');

  const detectionConfig = {
    sensitivityLevel,
    detectionZone: null,
    cooldown: 100,
    cadence: 1,
    debug: false,
  };

  const diffyDetection = useDiffyDetection(
    detectionMode === 'diffy' && isVideoReady ? videoRef.current : null,
    detectionConfig,
    (result) => {
      if (result.detected) {
        onMotionDetected();
      }
    }
  );

  const frameDiffDetection = useFrameDiffDetection(
    detectionMode === 'framediff' && isVideoReady ? videoRef.current : null,
    detectionConfig,
    (result) => {
      if (result.detected) {
        onMotionDetected();
      }
    }
  );

  const currentDetection = detectionMode === 'diffy' ? diffyDetection : frameDiffDetection;

  // Get available cameras
  useEffect(() => {
    async function getCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const cameras = devices.filter((device) => device.kind === 'videoinput');
        setCameraDevices(cameras);
        if (cameras.length > 0 && !selectedCameraId) {
          setSelectedCameraId(cameras[0].deviceId);
        }
      } catch (err) {
        console.error('Error getting cameras:', err);
      }
    }

    getCameras();
  }, [selectedCameraId]);

  // Initialize camera
  useEffect(() => {
    if (!selectedCameraId) return;

    // Reset video ready state immediately when camera changes
    setIsVideoReady(false);
    setIsLoading(true);

    async function startCamera() {
      try {
        // Stop existing stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }

        // Clear video source
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }

        const constraints: MediaStreamConstraints = {
          video: {
            deviceId: selectedCameraId ? { exact: selectedCameraId } : undefined,
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        };

        console.log('Requesting camera access...', constraints);
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('Camera stream obtained:', stream.getVideoTracks()[0]?.getSettings());
        streamRef.current = stream;

        if (videoRef.current) {
          const video = videoRef.current;
          video.srcObject = stream;

          // Wait for metadata to load
          console.log('Waiting for video metadata...');
          await new Promise<void>((resolve, reject) => {
            const onLoadedMetadata = () => {
              console.log('Video metadata loaded:', video.videoWidth, 'x', video.videoHeight);
              video.removeEventListener('loadedmetadata', onLoadedMetadata);
              video.removeEventListener('error', onError);
              resolve();
            };
            const onError = (e: Event) => {
              console.error('Video error event:', e);
              video.removeEventListener('loadedmetadata', onLoadedMetadata);
              video.removeEventListener('error', onError);
              reject(new Error('Video failed to load'));
            };
            video.addEventListener('loadedmetadata', onLoadedMetadata);
            video.addEventListener('error', onError);
          });

          // Play the video
          console.log('Playing video...');
          await video.play();
          console.log('Video playing successfully');
          setIsVideoReady(true);
          setIsLoading(false);
          setError(null);
        }
      } catch (err) {
        console.error('Error accessing camera:', err);
        setError(`Failed to access camera: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setIsVideoReady(false);
        setIsLoading(false);
      }
    }

    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setIsVideoReady(false);
    };
  }, [selectedCameraId]);

  const handleCameraChange = (deviceId: string) => {
    setSelectedCameraId(deviceId);
  };

  return (
    <Card className="w-full max-w-2xl">
      <CardContent className="p-6">
        <div className="space-y-4">
          {/* Camera Selection */}
          {cameraDevices.length > 1 && (
            <div className="space-y-2">
              <Label>Camera</Label>
              <select
                className="w-full p-2 border rounded-md"
                value={selectedCameraId}
                onChange={(e) => handleCameraChange(e.target.value)}
              >
                {cameraDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.substring(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Video Preview */}
          <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
            <video
              ref={videoRef}
              className="w-full h-full object-cover"
              playsInline
              muted
              autoPlay
            />

            {/* Loading Indicator */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-white text-center space-y-2">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto"></div>
                  <div>Loading camera...</div>
                </div>
              </div>
            )}

            {/* Detection Status Overlay */}
            {isVideoReady && (
              <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
                <div className="bg-black/70 text-white px-3 py-2 rounded-md text-sm space-y-1">
                  <div>Mode: {detectionMode === 'framediff' ? 'Frame Difference' : 'Diffy JS'}</div>
                  <div>
                    Status: {currentDetection.isActive ? '🟢 Active' : '🔴 Inactive'}
                  </div>
                  <div>
                    Detection: {currentDetection.detectionProgress.current}/
                    {currentDetection.detectionProgress.total}
                  </div>
                </div>

                {/* Motion Indicator */}
                {currentDetection.motionDetected && (
                  <div className="bg-green-500 text-white px-4 py-2 rounded-md font-bold animate-pulse">
                    MOTION!
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          {/* Session Info */}
          <div className="text-sm text-muted-foreground">
            Session ID: <span className="font-mono">{sessionId}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
