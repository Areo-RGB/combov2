import { ChangeDetectionStrategy, Component, input, output, signal, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SprintTimingService, DeviceRole, MessageType, ConnectedDevice, CameraInfo } from '../../services/sprint-timing.service';

export interface MultiDeviceConfig {
  sessionId: string;
  deviceRole: DeviceRole;
  startMode: 'manual' | 'flying';
  minDetectionDelay: number;
  selectedCameraId: string | null;
  connectedDevices: ConnectedDevice[];
}

@Component({
  selector: 'app-sprint-multi-setup',
  templateUrl: './sprint-multi-setup.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
})
export class SprintMultiSetupComponent implements OnInit, OnDestroy {
  initialSessionId = input<string | null>(null);
  goBack = output<void>();
  startSession = output<MultiDeviceConfig>();

  private sprintService = inject(SprintTimingService);

  sessionId = signal('');
  isHost = signal(false);
  startMode = signal<'manual' | 'flying'>('manual');
  minDetectionDelay = signal(2000);
  connectedDevices = signal<ConnectedDevice[]>([]);
  myRole = signal<DeviceRole>(DeviceRole.Start);
  availableCameras = signal<CameraInfo[]>([]);

  readonly DeviceRole = DeviceRole;
  readonly deviceRoles = [DeviceRole.Start, DeviceRole.Split, DeviceRole.Finish];

  ngOnInit(): void {
    const initialId = this.initialSessionId();
    if (initialId) {
      // Joining existing session
      this.sessionId.set(initialId);
      this.isHost.set(false);
      this.myRole.set(DeviceRole.Split); // Non-host defaults to Split
    } else {
      // Creating new session (host)
      this.sessionId.set(this.generateSessionId());
      this.isHost.set(true);
      this.myRole.set(DeviceRole.Start); // Host is always Start
    }

    this.initializeCamera();
  }

  ngOnDestroy(): void {
    const sid = this.sessionId();
    if (sid) {
      this.sprintService.cleanupSession(sid);
    }
  }

  private async initializeCamera(): Promise<void> {
    try {
      // Request camera permission to get meaningful labels
      await navigator.mediaDevices.getUserMedia({ video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');

      const cameras: CameraInfo[] = videoDevices.map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
      }));

      this.availableCameras.set(cameras);

      // Join session with camera info
      const sid = this.sessionId();
      if (sid) {
        this.sprintService.joinSession(sid, cameras, this.myRole());

        // Listen for presence updates
        this.sprintService.listenForPresence(sid, (devices) => {
          this.connectedDevices.set(devices);

          // Find my role from the updated devices list
          const myDevice = devices.find(d => d.clientId === this.sprintService.getClientId());
          if (myDevice) {
            this.myRole.set(myDevice.role);
          }
        });

        // Listen for messages if not host
        if (!this.isHost()) {
          this.sprintService.listenForMessages(sid, (message) => {
            this.handleMessage(message);
          });
        }
      }
    } catch (error) {
      console.error('Error initializing camera:', error);
      alert('Could not access camera. Please check permissions.');
    }
  }

  private handleMessage(message: any): void {
    if (message.type === MessageType.SetupStateUpdate && !this.isHost()) {
      const { startMode, minDetectionDelay } = message.data;
      if (startMode) this.startMode.set(startMode);
      if (minDetectionDelay !== undefined) this.minDetectionDelay.set(minDetectionDelay);
    }

    if (message.type === MessageType.StartSession) {
      const config = message.data.config;
      const myDevice = config.connectedDevices.find((d: ConnectedDevice) => d.clientId === this.sprintService.getClientId());

      if (myDevice) {
        const finalConfig: MultiDeviceConfig = {
          sessionId: config.sessionId,
          deviceRole: myDevice.role,
          startMode: config.startMode,
          minDetectionDelay: config.minDetectionDelay,
          selectedCameraId: myDevice.selectedCameraId || null,
          connectedDevices: config.connectedDevices,
        };
        this.startSession.emit(finalConfig);
      }
    }
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  regenerateSessionId(): void {
    if (this.isHost()) {
      this.sessionId.set(this.generateSessionId());
    }
  }

  onStartModeChange(event: Event): void {
    if (!this.isHost()) return;

    const value = (event.target as HTMLSelectElement).value as 'manual' | 'flying';
    this.startMode.set(value);
    this.broadcastSetupState();
  }

  onMinDelayChange(event: Event): void {
    if (!this.isHost()) return;

    const value = (event.target as HTMLInputElement).value;
    this.minDetectionDelay.set(Number(value));
    this.broadcastSetupState();
  }

  onRoleChange(clientId: string, event: Event): void {
    if (!this.isHost()) return;

    const newRole = (event.target as HTMLSelectElement).value as DeviceRole;
    const sid = this.sessionId();

    if (sid) {
      this.sprintService.updateDeviceRole(sid, clientId, newRole);
    }
  }

  onCameraChange(clientId: string, event: Event): void {
    if (!this.isHost()) return;

    const newCameraId = (event.target as HTMLSelectElement).value;
    const sid = this.sessionId();

    if (sid) {
      this.sprintService.updateDeviceCamera(sid, clientId, newCameraId);
    }
  }

  private broadcastSetupState(): void {
    if (!this.isHost()) return;

    const sid = this.sessionId();
    if (sid) {
      this.sprintService.publishMessage(sid, MessageType.SetupStateUpdate, {
        startMode: this.startMode(),
        minDetectionDelay: this.minDetectionDelay(),
      });
    }
  }

  handleStartSession(): void {
    if (!this.isHost()) return;

    const sid = this.sessionId();
    if (!sid) return;

    const configForBroadcast = {
      sessionId: sid,
      startMode: this.startMode(),
      minDetectionDelay: this.minDetectionDelay(),
      connectedDevices: this.connectedDevices(),
    };

    // Broadcast to other devices
    this.sprintService.publishMessage(sid, MessageType.StartSession, {
      config: configForBroadcast,
    });

    // Start session for this device (host)
    const myDevice = this.connectedDevices().find(d => d.clientId === this.sprintService.getClientId());
    if (myDevice) {
      const finalConfig: MultiDeviceConfig = {
        sessionId: sid,
        deviceRole: myDevice.role,
        startMode: this.startMode(),
        minDetectionDelay: this.minDetectionDelay(),
        selectedCameraId: myDevice.selectedCameraId || null,
        connectedDevices: this.connectedDevices(),
      };
      this.startSession.emit(finalConfig);
    }
  }

  onGoBack(): void {
    const sid = this.sessionId();
    if (sid) {
      this.sprintService.cleanupSession(sid);
    }
    this.goBack.emit();
  }

  getShortClientId(fullId: string): string {
    return fullId.replace('sprint-client-', '');
  }

  isMyDevice(clientId: string): boolean {
    return clientId === this.sprintService.getClientId();
  }
}
