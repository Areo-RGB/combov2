'use client';

import { useState } from 'react';
import { Lobby } from '@/components/Lobby';
import { SprintTiming } from '@/components/SprintTiming';
import { DeviceRole } from '@/lib/firebase';

type AppMode = 'lobby' | 'sprint';

export default function Home() {
  const [mode, setMode] = useState<AppMode>('lobby');
  const [sessionId, setSessionId] = useState<string>('');
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(DeviceRole.Start);

  const handleStartSession = (sid: string, role: DeviceRole) => {
    setSessionId(sid);
    setDeviceRole(role);
    setMode('sprint');
  };

  const handleReturnToLobby = () => {
    setMode('lobby');
    setSessionId('');
  };

  return (
    <main>
      {mode === 'lobby' && <Lobby onStartSession={handleStartSession} />}
      {mode === 'sprint' && (
        <SprintTiming
          sessionId={sessionId}
          role={deviceRole}
          onReturnToLobby={handleReturnToLobby}
        />
      )}
    </main>
  );
}
