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
} from 'firebase/database';

const firebaseConfig = {
  apiKey: 'AIzaSyD-WdiDLQAHeHg9UYrZxJnnJadPz33_1m8',
  authDomain: 'db-motion-1.firebaseapp.com',
  databaseURL: 'https://db-motion-1-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'db-motion-1',
  storageBucket: 'db-motion-1.appspot.com',
  messagingSenderId: '611585824193',
  appId: '1:611585824193:web:567fc857724dd1ffcb8b40',
};

// Initialize Firebase
let app: FirebaseApp;
let db: Database;

if (typeof window !== 'undefined') {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApp();
  }
  db = getDatabase(app);
}

export { db };

// Types
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

export interface SprintMessage {
  type: MessageType;
  timestamp: number;
  clientId: string;
  data?: any;
}

// Firebase Service Class
export class FirebaseService {
  private clientId: string;
  private currentSessionId: string | null = null;

  constructor() {
    this.clientId = `sprint-client-${Math.random().toString(36).substring(2, 9)}`;
  }

  getClientId(): string {
    return this.clientId;
  }

  // PRESENCE MANAGEMENT
  joinSession(sessionId: string, cameras: CameraInfo[], role: DeviceRole): void {
    if (!db) return;

    this.currentSessionId = sessionId;
    const presenceRef = ref(db, `sprint-sessions/${sessionId}/presence/${this.clientId}`);

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
    const heartbeatInterval = setInterval(() => {
      if (this.currentSessionId === sessionId) {
        set(
          ref(db, `sprint-sessions/${sessionId}/presence/${this.clientId}/lastSeen`),
          Date.now()
        );
      } else {
        clearInterval(heartbeatInterval);
      }
    }, 5000);
  }

  updateDeviceRole(sessionId: string, clientId: string, role: DeviceRole): void {
    if (!db) return;
    const roleRef = ref(db, `sprint-sessions/${sessionId}/presence/${clientId}/role`);
    set(roleRef, role);
  }

  updateDeviceCamera(sessionId: string, clientId: string, cameraId: string): void {
    if (!db) return;
    const cameraRef = ref(
      db,
      `sprint-sessions/${sessionId}/presence/${clientId}/selectedCameraId`
    );
    set(cameraRef, cameraId);
  }

  listenForPresence(sessionId: string, callback: (devices: ConnectedDevice[]) => void): void {
    if (!db) return;
    const presenceRef = ref(db, `sprint-sessions/${sessionId}/presence`);

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
    if (!db) return;
    const presenceRef = ref(db, `sprint-sessions/${sessionId}/presence/${this.clientId}`);
    remove(presenceRef);
    this.currentSessionId = null;
  }

  // MESSAGE BROADCASTING
  publishMessage(sessionId: string, type: MessageType, data?: any): void {
    if (!db) return;
    const messagesRef = ref(db, `sprint-sessions/${sessionId}/messages`);
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
    if (!db) return;
    const messagesRef = ref(db, `sprint-sessions/${sessionId}/messages`);

    onValue(messagesRef, (snapshot) => {
      snapshot.forEach((childSnapshot) => {
        const message = childSnapshot.val() as SprintMessage;
        // Only process messages from other clients
        if (message && message.clientId !== this.clientId) {
          callback(message);
        }
      });
    });
  }

  cleanupSession(sessionId: string): void {
    if (!db) return;
    this.leaveSession(sessionId);

    const messagesRef = ref(db, `sprint-sessions/${sessionId}/messages`);
    off(messagesRef, 'value');

    const presenceRef = ref(db, `sprint-sessions/${sessionId}/presence`);
    off(presenceRef, 'value');
  }

  // SESSION STATE
  updateSessionState(sessionId: string, state: any): void {
    if (!db) return;
    const stateRef = ref(db, `sprint-sessions/${sessionId}/state`);
    set(stateRef, { ...state, timestamp: Date.now() });
  }

  listenForSessionState(sessionId: string, callback: (state: any) => void): void {
    if (!db) return;
    const stateRef = ref(db, `sprint-sessions/${sessionId}/state`);
    onValue(stateRef, (snapshot) => {
      const state = snapshot.val();
      if (state) {
        callback(state);
      }
    });
  }
}

// Singleton instance
let firebaseService: FirebaseService | null = null;

export function getFirebaseService(): FirebaseService {
  if (!firebaseService) {
    firebaseService = new FirebaseService();
  }
  return firebaseService;
}
