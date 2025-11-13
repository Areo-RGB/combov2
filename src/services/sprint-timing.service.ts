import { Injectable, signal } from '@angular/core';
import { initializeApp, getApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getDatabase,
  ref,
  set,
  onValue,
  off,
  Database,
  onDisconnect,
  push,
  remove,
  serverTimestamp,
} from 'firebase/database';
import { firebaseConfig } from '../firebase.config';

export enum DeviceRole {
  Start = 'START',
  Split = 'SPLIT',
  Finish = 'FINISH',
}

export enum MessageType {
  Start = 'START',
  Finish = 'FINISH',
  Reset = 'RESET',
  RequestState = 'REQUEST_STATE',
  StateUpdate = 'STATE_UPDATE',
  SetupStateUpdate = 'SETUP_STATE_UPDATE',
  StartSession = 'START_SESSION',
  ReturnToLobby = 'RETURN_TO_LOBBY',
}

export interface CameraInfo {
  deviceId: string;
  label: string;
}

export interface ConnectedDevice {
  clientId: string;
  role: DeviceRole;
  availableCameras?: CameraInfo[];
  selectedCameraId?: string;
  lastSeen: number;
}

export interface LapData {
  athleteId: string;
  athleteName: string;
  deviceRole: DeviceRole;
  time?: number;
}

export interface SprintMessage {
  type: MessageType;
  timestamp: number;
  clientId: string;
  data?: any;
}

@Injectable({
  providedIn: 'root',
})
export class SprintTimingService {
  private app: FirebaseApp;
  private db: Database;
  private clientId: string;
  private currentSessionId: string | null = null;
  private messageListeners: Map<string, (message: SprintMessage) => void> = new Map();

  constructor() {
    if (!getApps().length) {
      this.app = initializeApp(firebaseConfig);
    } else {
      this.app = getApp();
    }
    this.db = getDatabase(this.app);
    this.clientId = `sprint-client-${Math.random().toString(36).substring(2, 9)}`;
  }

  getClientId(): string {
    return this.clientId;
  }

  // PRESENCE MANAGEMENT
  joinSession(sessionId: string, cameras: CameraInfo[], role: DeviceRole): void {
    this.currentSessionId = sessionId;
    const presenceRef = ref(this.db, `sprint-sessions/${sessionId}/presence/${this.clientId}`);

    const deviceData: ConnectedDevice = {
      clientId: this.clientId,
      role,
      availableCameras: cameras,
      selectedCameraId: cameras.length > 0 ? cameras[0].deviceId : undefined,
      lastSeen: Date.now(),
    };

    set(presenceRef, deviceData);

    // Setup disconnect handler
    onDisconnect(presenceRef).remove();

    // Heartbeat every 5 seconds
    setInterval(() => {
      if (this.currentSessionId === sessionId) {
        set(
          ref(this.db, `sprint-sessions/${sessionId}/presence/${this.clientId}/lastSeen`),
          Date.now()
        );
      }
    }, 5000);
  }

  updateDeviceRole(sessionId: string, clientId: string, role: DeviceRole): void {
    const roleRef = ref(this.db, `sprint-sessions/${sessionId}/presence/${clientId}/role`);
    set(roleRef, role);
  }

  updateDeviceCamera(sessionId: string, clientId: string, cameraId: string): void {
    const cameraRef = ref(
      this.db,
      `sprint-sessions/${sessionId}/presence/${clientId}/selectedCameraId`
    );
    set(cameraRef, cameraId);
  }

  listenForPresence(sessionId: string, callback: (devices: ConnectedDevice[]) => void): void {
    const presenceRef = ref(this.db, `sprint-sessions/${sessionId}/presence`);

    onValue(presenceRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        const devices: ConnectedDevice[] = Object.values(data);
        // Filter out stale devices (not seen in last 15 seconds)
        const now = Date.now();
        const activeDevices = devices.filter((d) => now - d.lastSeen < 15000);
        callback(activeDevices);
      } else {
        callback([]);
      }
    });
  }

  leaveSession(sessionId: string): void {
    const presenceRef = ref(this.db, `sprint-sessions/${sessionId}/presence/${this.clientId}`);
    remove(presenceRef);
    this.currentSessionId = null;
  }

  // MESSAGE BROADCASTING
  publishMessage(sessionId: string, type: MessageType, data?: any): void {
    const messagesRef = ref(this.db, `sprint-sessions/${sessionId}/messages`);
    const messageRef = push(messagesRef);

    const message: SprintMessage = {
      type,
      timestamp: Date.now(),
      clientId: this.clientId,
      data,
    };

    set(messageRef, message);
  }

  listenForMessages(sessionId: string, callback: (message: SprintMessage) => void): void {
    const messagesRef = ref(this.db, `sprint-sessions/${sessionId}/messages`);

    const listener = (snapshot: any) => {
      snapshot.forEach((childSnapshot: any) => {
        const message = childSnapshot.val() as SprintMessage;
        // Only process messages from other clients
        if (message && message.clientId !== this.clientId) {
          callback(message);
        }
      });
    };

    onValue(messagesRef, listener);
    this.messageListeners.set(sessionId, callback);
  }

  cleanupSession(sessionId: string): void {
    this.leaveSession(sessionId);

    const messagesRef = ref(this.db, `sprint-sessions/${sessionId}/messages`);
    off(messagesRef, 'value');
    this.messageListeners.delete(sessionId);

    const presenceRef = ref(this.db, `sprint-sessions/${sessionId}/presence`);
    off(presenceRef, 'value');
  }

  // SESSION STATE
  updateSessionState(sessionId: string, state: any): void {
    const stateRef = ref(this.db, `sprint-sessions/${sessionId}/state`);
    set(stateRef, { ...state, timestamp: Date.now() });
  }

  listenForSessionState(sessionId: string, callback: (state: any) => void): void {
    const stateRef = ref(this.db, `sprint-sessions/${sessionId}/state`);
    onValue(stateRef, (snapshot) => {
      const state = snapshot.val();
      if (state) {
        callback(state);
      }
    });
  }
}
