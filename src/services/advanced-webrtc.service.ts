import { Injectable } from '@angular/core';

export interface WebRTCConfig {
  iceServers?: RTCIceServer[];
  channelName?: string;
}

export interface Message {
  type: string;
  payload: any;
}

/**
 * Production-ready WebRTC service with full feature set.
 * Based on team-duels implementation but configurable for local-only or internet use.
 */
@Injectable({
  providedIn: 'root',
})
export class AdvancedWebRTCService {
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private messageQueue = new Map<string, Message[]>();
  private earlyIceCandidates = new Map<string, RTCIceCandidate[]>();
  private config: WebRTCConfig;

  // Callbacks for signaling
  onSdpOffer: (targetId: string, sdp: RTCSessionDescription) => void = () => {};
  onSdpAnswer: (targetId: string, sdp: RTCSessionDescription) => void = () => {};
  onIceCandidate: (targetId: string, candidate: RTCIceCandidate) => void = () => {};

  // Callbacks for application logic
  onMessageReceived: (peerId: string, message: Message) => void = () => {};
  onConnectionStateChange: (peerId: string, state: RTCPeerConnectionState) => void = () => {};
  onDataChannelOpen: (peerId: string) => void = () => {};

  constructor() {
    // Default to local-only (no ICE servers)
    this.config = { iceServers: [], channelName: 'lobby' };
  }

  configure(config: WebRTCConfig): void {
    this.config = { ...this.config, ...config };
  }

  async createConnectionAndOffer(peerId: string): Promise<void> {
    const pc = this.createPeerConnection(peerId);

    const channel = pc.createDataChannel(this.config.channelName || 'lobby');
    this.setupDataChannel(peerId, channel);
    this.dataChannels.set(peerId, channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (pc.localDescription) {
      this.onSdpOffer(peerId, pc.localDescription);
    }
  }

  async handleOfferAndCreateAnswer(
    peerId: string,
    offer: RTCSessionDescriptionInit
  ): Promise<void> {
    const pc = this.createPeerConnection(peerId);

    pc.ondatachannel = (event) => {
      const channel = event.channel;
      this.setupDataChannel(peerId, channel);
      this.dataChannels.set(peerId, channel);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    // Process any queued candidates now that remote description is set
    const earlyCandidates = this.earlyIceCandidates.get(peerId);
    if (earlyCandidates) {
      console.log(`Processing ${earlyCandidates.length} early ICE candidates for ${peerId}`);
      for (const candidate of earlyCandidates) {
        try {
          await pc.addIceCandidate(candidate);
        } catch (e) {
          console.error('Error adding early ICE candidate', e);
        }
      }
      this.earlyIceCandidates.delete(peerId);
    }

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (pc.localDescription) {
      this.onSdpAnswer(peerId, pc.localDescription);
    }
  }

  async handleAnswer(peerId: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      await pc.setRemoteDescription(new RTCSessionDescription(answer));

      // Process any queued candidates
      const earlyCandidates = this.earlyIceCandidates.get(peerId);
      if (earlyCandidates) {
        console.log(`Processing ${earlyCandidates.length} early ICE candidates for ${peerId}`);
        for (const candidate of earlyCandidates) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (e) {
            console.error('Error adding early ICE candidate', e);
          }
        }
        this.earlyIceCandidates.delete(peerId);
      }
    }
  }

  async addIceCandidate(peerId: string, candidateInit: RTCIceCandidateInit): Promise<void> {
    const pc = this.peerConnections.get(peerId);
    const candidate = new RTCIceCandidate(candidateInit);

    if (pc && pc.remoteDescription) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (e) {
        console.error('Error adding ICE candidate', e);
      }
    } else {
      // Queue for later
      if (!this.earlyIceCandidates.has(peerId)) {
        this.earlyIceCandidates.set(peerId, []);
      }
      this.earlyIceCandidates.get(peerId)!.push(candidate);
      console.warn(`Queued ICE candidate for ${peerId} (no remote description yet)`);
    }
  }

  sendMessage(peerId: string, message: Message): void {
    const channel = this.dataChannels.get(peerId);

    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(message));
    } else {
      console.warn(`Data channel for ${peerId} not open. Queuing message.`);
      if (!this.messageQueue.has(peerId)) {
        this.messageQueue.set(peerId, []);
      }
      this.messageQueue.get(peerId)!.push(message);
    }
  }

  broadcastMessage(message: Message): void {
    for (const peerId of this.dataChannels.keys()) {
      this.sendMessage(peerId, message);
    }
  }

  closeConnection(peerId: string): void {
    const dc = this.dataChannels.get(peerId);
    if (dc) {
      dc.close();
      this.dataChannels.delete(peerId);
    }

    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
    }

    this.messageQueue.delete(peerId);
    this.earlyIceCandidates.delete(peerId);
  }

  cleanup(): void {
    for (const peerId of this.peerConnections.keys()) {
      this.closeConnection(peerId);
    }
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    // Close existing connection if any
    if (this.peerConnections.has(peerId)) {
      this.peerConnections.get(peerId)?.close();
    }

    const pc = new RTCPeerConnection({
      iceServers: this.config.iceServers || [],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate(peerId, event.candidate);
      }
    };

    pc.onconnectionstatechange = () => {
      if (this.peerConnections.has(peerId)) {
        this.onConnectionStateChange(peerId, pc.connectionState);

        if (pc.connectionState === 'connected') {
          console.log(`✅ WebRTC connection established with ${peerId}`);
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          console.warn(`❌ WebRTC connection ${pc.connectionState} for ${peerId}`);
        }
      }
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    channel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`);

      // Send queued messages
      const queue = this.messageQueue.get(peerId);
      if (queue && queue.length > 0) {
        console.log(`Sending ${queue.length} queued messages to ${peerId}`);
        queue.forEach((msg) => channel.send(JSON.stringify(msg)));
        this.messageQueue.delete(peerId);
      }

      this.onDataChannelOpen(peerId);
    };

    channel.onclose = () => {
      console.log(`Data channel closed with ${peerId}`);
    };

    channel.onmessage = (event) => {
      try {
        const message: Message = JSON.parse(event.data);
        this.onMessageReceived(peerId, message);
      } catch (e) {
        console.error(`Failed to parse message from ${peerId}`, event.data, e);
      }
    };

    channel.onerror = (error) => {
      console.error(`Data channel error with ${peerId}:`, error);
    };
  }
}
