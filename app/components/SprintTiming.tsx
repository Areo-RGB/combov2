'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { getFirebaseService, DeviceRole, MessageType, SprintMessage } from '@/lib/firebase';
import { Detector } from '@/components/Detector';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export interface SprintTimingProps {
  sessionId: string;
  role: DeviceRole;
  onReturnToLobby: () => void;
}

interface TimingData {
  startTime: number | null;
  splitTime: number | null;
  finishTime: number | null;
}

export function SprintTiming({ sessionId, role, onReturnToLobby }: SprintTimingProps) {
  const [timingData, setTimingData] = useState<TimingData>({
    startTime: null,
    splitTime: null,
    finishTime: null,
  });
  const [isRunning, setIsRunning] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const firebaseService = getFirebaseService();

  // Calculate elapsed time
  useEffect(() => {
    if (!timingData.startTime || timingData.finishTime) return;

    const interval = setInterval(() => {
      setElapsedTime(Date.now() - timingData.startTime!);
    }, 10);

    return () => clearInterval(interval);
  }, [timingData.startTime, timingData.finishTime]);

  // Listen for messages from other devices
  useEffect(() => {
    const handleMessage = (message: SprintMessage) => {
      switch (message.type) {
        case MessageType.Start:
          setTimingData((prev) => ({ ...prev, startTime: message.timestamp }));
          setIsRunning(true);
          break;

        case MessageType.Finish:
          setTimingData((prev) => ({ ...prev, finishTime: message.timestamp }));
          setIsRunning(false);
          break;

        case MessageType.Reset:
          handleReset();
          break;

        case MessageType.ReturnToLobby:
          onReturnToLobby();
          break;
      }
    };

    firebaseService.listenForMessages(sessionId, handleMessage);

    return () => {
      firebaseService.cleanupSession(sessionId);
    };
  }, [sessionId, firebaseService, onReturnToLobby]);

  // Handle motion detection
  const handleMotionDetected = useCallback(() => {
    const now = Date.now();

    if (role === DeviceRole.Start && !isRunning && !timingData.startTime) {
      // Start the timer
      setTimingData({ startTime: now, splitTime: null, finishTime: null });
      setIsRunning(true);
      firebaseService.publishMessage(sessionId, MessageType.Start, { time: now });
    } else if (role === DeviceRole.Split && isRunning && timingData.startTime) {
      // Record split time (not stopping the race)
      setTimingData((prev) => ({ ...prev, splitTime: now }));
    } else if (role === DeviceRole.Finish && isRunning && timingData.startTime) {
      // Finish the timer
      setTimingData((prev) => ({ ...prev, finishTime: now }));
      setIsRunning(false);
      firebaseService.publishMessage(sessionId, MessageType.Finish, { time: now });
    }
  }, [role, isRunning, timingData.startTime, sessionId, firebaseService]);

  // Reset timing
  const handleReset = () => {
    setTimingData({ startTime: null, splitTime: null, finishTime: null });
    setIsRunning(false);
    setElapsedTime(0);
  };

  const handleResetClick = () => {
    handleReset();
    firebaseService.publishMessage(sessionId, MessageType.Reset);
  };

  const handleReturnToLobby = () => {
    firebaseService.publishMessage(sessionId, MessageType.ReturnToLobby);
    onReturnToLobby();
  };

  // Format time to mm:ss.SSS
  const formatTime = (ms: number): string => {
    if (!ms || ms <= 0) return '00:00.000';

    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;

    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
  };

  const roleInfo = {
    [DeviceRole.Start]: {
      emoji: '🏁',
      title: 'Start Line',
      description: 'Detect motion to start the timer',
      color: 'bg-green-500',
    },
    [DeviceRole.Split]: {
      emoji: '⏱️',
      title: 'Split Time',
      description: 'Record intermediate time',
      color: 'bg-blue-500',
    },
    [DeviceRole.Finish]: {
      emoji: '🎯',
      title: 'Finish Line',
      description: 'Detect motion to stop the timer',
      color: 'bg-red-500',
    },
  };

  const currentRole = roleInfo[role];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4">
      <div className="max-w-6xl mx-auto space-y-4">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-2xl flex items-center gap-2">
                  <span className="text-3xl">{currentRole.emoji}</span>
                  {currentRole.title}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{currentRole.description}</p>
              </div>
              <div className="text-right space-y-1">
                <div className="text-xs text-muted-foreground">Session</div>
                <div className="font-mono font-bold">{sessionId}</div>
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Detector */}
          <div>
            <Detector
              sessionId={sessionId}
              onMotionDetected={handleMotionDetected}
              detectionMode="speedy"
              sensitivityLevel={5}
            />
          </div>

          {/* Timing Display */}
          <div className="space-y-4">
            {/* Timer Display */}
            <Card>
              <CardContent className="p-8">
                <div className="text-center space-y-6">
                  <div className="text-sm text-muted-foreground uppercase tracking-wide">
                    Elapsed Time
                  </div>
                  <div className="text-6xl font-mono font-bold tabular-nums">
                    {timingData.startTime ? formatTime(elapsedTime) : '00:00.000'}
                  </div>

                  {/* Status Indicator */}
                  <div className="flex justify-center">
                    {!timingData.startTime && (
                      <div className="px-4 py-2 bg-gray-200 text-gray-700 rounded-full text-sm font-medium">
                        Waiting for start...
                      </div>
                    )}
                    {isRunning && (
                      <div className="px-4 py-2 bg-green-500 text-white rounded-full text-sm font-medium animate-pulse">
                        Running
                      </div>
                    )}
                    {timingData.finishTime && (
                      <div className="px-4 py-2 bg-red-500 text-white rounded-full text-sm font-medium">
                        Finished
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Split Times */}
            {timingData.startTime && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Split Times</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center p-2 bg-green-50 rounded">
                      <span className="text-sm">🏁 Start</span>
                      <span className="font-mono">00:00.000</span>
                    </div>

                    {timingData.splitTime && (
                      <div className="flex justify-between items-center p-2 bg-blue-50 rounded">
                        <span className="text-sm">⏱️ Split</span>
                        <span className="font-mono">
                          {formatTime(timingData.splitTime - timingData.startTime)}
                        </span>
                      </div>
                    )}

                    {timingData.finishTime && (
                      <div className="flex justify-between items-center p-2 bg-red-50 rounded">
                        <span className="text-sm">🎯 Finish</span>
                        <span className="font-mono font-bold">
                          {formatTime(timingData.finishTime - timingData.startTime)}
                        </span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Controls */}
            <div className="space-y-2">
              <Button
                onClick={handleResetClick}
                variant="outline"
                className="w-full"
                disabled={!timingData.startTime}
              >
                Reset Timer
              </Button>
              <Button onClick={handleReturnToLobby} variant="secondary" className="w-full">
                Return to Lobby
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
