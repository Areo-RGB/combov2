'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { DeviceRole } from '@/lib/firebase';

const Lobby = dynamic(() => import('@/components/Lobby').then((mod) => ({ default: mod.Lobby })), {
  ssr: false,
});
const SprintTiming = dynamic(
  () => import('@/components/SprintTiming').then((mod) => ({ default: mod.SprintTiming })),
  { ssr: false }
);

type AppMode = 'lobby' | 'sprint';

export default function Home() {
  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<AppMode>('lobby');
  const [sessionId, setSessionId] = useState<string>('');
  const [deviceRole, setDeviceRole] = useState<DeviceRole>(DeviceRole.Start);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleStartSession = (sid: string, role: DeviceRole) => {
    setSessionId(sid);
    setDeviceRole(role);
    setMode('sprint');
  };

  const handleReturnToLobby = () => {
    setMode('lobby');
    setSessionId('');
  };

  if (!mounted) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div>Loading...</div>
      </main>
    );
  }

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
