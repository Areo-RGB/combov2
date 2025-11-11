import { vi } from 'vitest';

/**
 * Mock RTCPeerConnection for testing WebRTC functionality
 */
export class MockRTCPeerConnection {
  localDescription: RTCSessionDescription | null = null;
  remoteDescription: RTCSessionDescription | null = null;
  iceConnectionState: RTCIceConnectionState = 'new';
  connectionState: RTCPeerConnectionState = 'new';
  signalingState: RTCSignalingState = 'stable';

  private dataChannels: MockRTCDataChannel[] = [];
  private iceCandidates: RTCIceCandidate[] = [];
  private eventListeners: Map<string, Set<Function>> = new Map();

  public iceGatheringDelay = 0; // Simulate ICE gathering delay
  public connectionDelay = 0; // Simulate connection establishment delay

  constructor(public configuration?: RTCConfiguration) {}

  async createOffer(options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> {
    await this.simulateDelay(10);
    return {
      type: 'offer',
      sdp: 'mock-offer-sdp-' + Date.now(),
    };
  }

  async createAnswer(options?: RTCAnswerOptions): Promise<RTCSessionDescriptionInit> {
    await this.simulateDelay(10);
    return {
      type: 'answer',
      sdp: 'mock-answer-sdp-' + Date.now(),
    };
  }

  async setLocalDescription(description: RTCSessionDescriptionInit): Promise<void> {
    await this.simulateDelay(5);
    this.localDescription = description as RTCSessionDescription;
    this.signalingState = description.type === 'offer' ? 'have-local-offer' : 'stable';

    // Simulate ICE candidate gathering
    if (this.iceGatheringDelay > 0) {
      await this.simulateDelay(this.iceGatheringDelay);
    }
    this.generateMockIceCandidates();
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    await this.simulateDelay(5);
    this.remoteDescription = description as RTCSessionDescription;
    this.signalingState = description.type === 'offer' ? 'have-remote-offer' : 'stable';

    // Simulate connection establishment
    if (this.connectionDelay > 0) {
      await this.simulateDelay(this.connectionDelay);
    }
    this.updateConnectionState('connected');
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    await this.simulateDelay(5);
    this.iceCandidates.push(candidate as RTCIceCandidate);
  }

  createDataChannel(label: string, options?: RTCDataChannelInit): MockRTCDataChannel {
    const channel = new MockRTCDataChannel(label, options);
    this.dataChannels.push(channel);
    return channel;
  }

  close(): void {
    this.dataChannels.forEach(dc => dc.close());
    this.updateConnectionState('closed');
  }

  addEventListener(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  removeEventListener(event: string, listener: Function): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  private generateMockIceCandidates(): void {
    const candidates = [
      { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.1 54321 typ host', sdpMid: '0', sdpMLineIndex: 0 },
      { candidate: 'candidate:2 1 UDP 1694498815 203.0.113.1 54321 typ srflx', sdpMid: '0', sdpMLineIndex: 0 },
    ];

    candidates.forEach(candidate => {
      setTimeout(() => {
        this.emit('icecandidate', { candidate });
      }, Math.random() * 100); // Random timing to simulate race conditions
    });

    // Signal end of candidates
    setTimeout(() => {
      this.emit('icecandidate', { candidate: null });
    }, 150);
  }

  private updateConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    if (state === 'connected') {
      this.iceConnectionState = 'connected';
      this.dataChannels.forEach(dc => dc._simulateOpen());
    }
    this.emit('connectionstatechange', {});
    this.emit('iceconnectionstatechange', {});
  }

  private emit(event: string, data: any): void {
    this.eventListeners.get(event)?.forEach(listener => listener(data));
  }

  private async simulateDelay(ms: number): Promise<void> {
    if (ms > 0) {
      await new Promise(resolve => setTimeout(resolve, ms));
    }
  }

  // Helper for testing
  _simulateDisconnection(): void {
    this.updateConnectionState('disconnected');
  }

  _simulateFailure(): void {
    this.updateConnectionState('failed');
  }
}

/**
 * Mock RTCDataChannel
 */
export class MockRTCDataChannel {
  readyState: RTCDataChannelState = 'connecting';
  bufferedAmount = 0;
  private eventListeners: Map<string, Set<Function>> = new Map();
  public messageDelay = 0; // Simulate message transmission delay

  constructor(
    public label: string,
    public options?: RTCDataChannelInit
  ) {}

  send(data: string | ArrayBuffer): void {
    if (this.readyState !== 'open') {
      throw new Error('DataChannel is not open');
    }

    // Simulate message transmission
    setTimeout(() => {
      this.emit('message', { data });
    }, this.messageDelay);
  }

  close(): void {
    this.readyState = 'closed';
    this.emit('close', {});
  }

  addEventListener(event: string, listener: Function): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, new Set());
    }
    this.eventListeners.get(event)!.add(listener);
  }

  removeEventListener(event: string, listener: Function): void {
    this.eventListeners.get(event)?.delete(listener);
  }

  private emit(event: string, data: any): void {
    this.eventListeners.get(event)?.forEach(listener => listener(data));
  }

  // Helper for testing
  _simulateOpen(): void {
    this.readyState = 'open';
    this.emit('open', {});
  }

  _simulateMessage(data: string | ArrayBuffer): void {
    this.emit('message', { data });
  }
}

// Mock RTCSessionDescription
export const mockRTCSessionDescription = (type: 'offer' | 'answer') => ({
  type,
  sdp: `mock-${type}-sdp`,
  toJSON: vi.fn(),
});

// Global WebRTC mocks
export function setupWebRTCMocks() {
  (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
  (globalThis as any).RTCSessionDescription = mockRTCSessionDescription;
}
