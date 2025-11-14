'use client';

import React, { useState, useEffect } from 'react';
import { getFirebaseService, DeviceRole, ConnectedDevice, CameraInfo } from '@/lib/firebase';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export interface LobbyProps {
  onStartSession: (sessionId: string, role: DeviceRole) => void;
}

export function Lobby({ onStartSession }: LobbyProps) {
  const [sessionId, setSessionId] = useState('');
  const [selectedRole, setSelectedRole] = useState<DeviceRole>(DeviceRole.Start);
  const [connectedDevices, setConnectedDevices] = useState<ConnectedDevice[]>([]);
  const [isJoined, setIsJoined] = useState(false);
  const [cameras, setCameras] = useState<CameraInfo[]>([]);
  const [firebaseService] = useState(() => typeof window !== 'undefined' ? getFirebaseService() : null);

  // Get available cameras
  useEffect(() => {
    async function getCameras() {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((device) => device.kind === 'videoinput');
        const cameraList: CameraInfo[] = videoDevices.map((device) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.substring(0, 8)}`,
        }));
        setCameras(cameraList);
      } catch (err) {
        console.error('Error getting cameras:', err);
      }
    }

    getCameras();
  }, []);

  // Generate random session ID
  const generateSessionId = () => {
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    setSessionId(id);
  };

  useEffect(() => {
    generateSessionId();
  }, []);

  // Join session
  const handleJoinSession = () => {
    if (!sessionId.trim() || !firebaseService) return;

    firebaseService.joinSession(sessionId, cameras, selectedRole);
    setIsJoined(true);

    // Listen for presence updates
    firebaseService.listenForPresence(sessionId, (devices) => {
      setConnectedDevices(devices);
    });
  };

  // Leave session
  const handleLeaveSession = () => {
    if (!sessionId || !firebaseService) return;

    firebaseService.leaveSession(sessionId);
    setIsJoined(false);
    setConnectedDevices([]);
  };

  // Change role
  const handleRoleChange = (role: DeviceRole) => {
    setSelectedRole(role);
    if (isJoined && firebaseService) {
      firebaseService.updateDeviceRole(sessionId, firebaseService.getClientId(), role);
    }
  };

  // Start the sprint session
  const handleStartSprint = () => {
    if (!sessionId || !isJoined) return;
    onStartSession(sessionId, selectedRole);
  };

  const roleColors: Record<DeviceRole, string> = {
    [DeviceRole.Start]: 'bg-green-100 text-green-800 border-green-300',
    [DeviceRole.Split]: 'bg-blue-100 text-blue-800 border-blue-300',
    [DeviceRole.Finish]: 'bg-red-100 text-red-800 border-red-300',
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-4 flex items-center justify-center">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle className="text-3xl">Sprint Timing Lobby</CardTitle>
          <CardDescription>Set up your device for sprint timing detection</CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Session ID Input */}
          <div className="space-y-2">
            <Label htmlFor="sessionId">Session ID</Label>
            <div className="flex gap-2">
              <Input
                id="sessionId"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value.toUpperCase())}
                placeholder="Enter session ID"
                disabled={isJoined}
                className="font-mono text-lg"
              />
              {!isJoined && (
                <Button onClick={generateSessionId} variant="outline">
                  New ID
                </Button>
              )}
            </div>
          </div>

          {/* Role Selection */}
          <div className="space-y-2">
            <Label>Device Role</Label>
            <div className="grid grid-cols-3 gap-2">
              {Object.values(DeviceRole).map((role) => (
                <Button
                  key={role}
                  variant={selectedRole === role ? 'default' : 'outline'}
                  onClick={() => handleRoleChange(role)}
                  disabled={isJoined}
                  className="h-20 flex flex-col"
                >
                  <div className="text-lg font-bold">
                    {role === DeviceRole.Start && '🏁'}
                    {role === DeviceRole.Split && '⏱️'}
                    {role === DeviceRole.Finish && '🎯'}
                  </div>
                  <div className="text-xs mt-1">{role}</div>
                </Button>
              ))}
            </div>
          </div>

          {/* Join/Leave Button */}
          {!isJoined ? (
            <Button
              onClick={handleJoinSession}
              className="w-full h-12 text-lg"
              disabled={!sessionId.trim()}
            >
              Join Session
            </Button>
          ) : (
            <div className="space-y-2">
              <Button onClick={handleLeaveSession} variant="outline" className="w-full">
                Leave Session
              </Button>
            </div>
          )}

          {/* Connected Devices */}
          {isJoined && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Connected Devices ({connectedDevices.length})</Label>
                {connectedDevices.length > 0 && (
                  <Button onClick={handleStartSprint} className="ml-auto" size="lg">
                    Start Sprint Timer →
                  </Button>
                )}
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {connectedDevices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Waiting for devices to join...
                  </div>
                ) : (
                  connectedDevices.map((device) => (
                    <div
                      key={device.clientId}
                      className={`p-3 rounded-md border ${roleColors[device.role]}`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-mono text-sm">
                            {device.clientId.substring(0, 12)}
                            {firebaseService && device.clientId === firebaseService.getClientId() && (
                              <span className="ml-2 text-xs">(You)</span>
                            )}
                          </div>
                          <div className="text-xs mt-1">
                            Role: <strong>{device.role}</strong>
                          </div>
                        </div>
                        <div className="text-xl">
                          {device.role === DeviceRole.Start && '🏁'}
                          {device.role === DeviceRole.Split && '⏱️'}
                          {device.role === DeviceRole.Finish && '🎯'}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 text-sm text-blue-800">
            <strong>How it works:</strong>
            <ul className="list-disc ml-5 mt-2 space-y-1">
              <li>Create or join a session using the Session ID</li>
              <li>Select your device role (Start, Split, or Finish line)</li>
              <li>Wait for other devices to join</li>
              <li>Start the sprint timer when ready</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
