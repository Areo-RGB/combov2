import { Injectable } from '@angular/core';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface Message {
  type: string;
  payload: any;
}

@Injectable()
export class WebRTCService {
  private peerConnections = new Map<string, RTCPeerConnection>();
  private dataChannels = new Map<string, RTCDataChannel>();
  private messageQueue = new Map<string, Message[]>();
  private earlyIceCandidates = new Map<string, RTCIceCandidate[]>();

  // Callbacks for signaling
  onSdpOffer: (targetId: string, sdp: RTCSessionDescription) => void = () => {};
  onSdpAnswer: (targetId: string, sdp: RTCSessionDescription) => void = () => {};
  onIceCandidate: (targetId: string, candidate: RTCIceCandidate) => void = () => {};
  
  // Callbacks for application logic
  onMessageReceived: (peerId: string, message: Message) => void = () => {};
  onConnectionStateChange: (peerId: string, state: RTCPeerConnectionState) => void = () => {};
  onDataChannelOpen: (peerId: string) => void = () => {};

  async createConnectionAndOffer(peerId: string): Promise<void> {
    const pc = this.createPeerConnection(peerId);
    
    const channel = pc.createDataChannel('game-data');
    this.setupDataChannel(peerId, channel);
    this.dataChannels.set(peerId, channel);

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    
    if (pc.localDescription) {
      this.onSdpOffer(peerId, pc.localDescription);
    }
  }

  async handleOfferAndCreateAnswer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
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
          console.error('Error adding early ICE candidate in handleOfferAndCreateAnswer', e);
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

      // Process any queued candidates now that remote description is set
      const earlyCandidates = this.earlyIceCandidates.get(peerId);
      if (earlyCandidates) {
        console.log(`Processing ${earlyCandidates.length} early ICE candidates for ${peerId}`);
        for (const candidate of earlyCandidates) {
          try {
            await pc.addIceCandidate(candidate);
          } catch (e) {
            console.error('Error adding early ICE candidate in handleAnswer', e);
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
        console.error('Error adding received ice candidate', e);
      }
    } else {
      if (!this.earlyIceCandidates.has(peerId)) {
        this.earlyIceCandidates.set(peerId, []);
      }
      this.earlyIceCandidates.get(peerId)!.push(candidate);
      console.warn(`Queued ICE candidate for ${peerId} because remote description is not set.`);
    }
  }

  sendMessage(peerId: string, message: Message): void {
    const channel = this.dataChannels.get(peerId);
    if (channel && channel.readyState === 'open') {
      channel.send(JSON.stringify(message));
    } else {
      console.warn(`Data channel for ${peerId} is not open. State: ${channel?.readyState}. Queuing message.`);
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

  private createPeerConnection(peerId: string): RTCPeerConnection {
    if (this.peerConnections.has(peerId)) {
        this.peerConnections.get(peerId)?.close();
    }
    const pc = new RTCPeerConnection(ICE_SERVERS);
    
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.onIceCandidate(peerId, event.candidate);
      }
    };
    
    pc.onconnectionstatechange = () => {
        if (this.peerConnections.has(peerId)) { // Avoid callback on closed connections
            this.onConnectionStateChange(peerId, pc.connectionState);
            if (pc.connectionState === 'connected') {
                this.logSelectedCandidatePair(pc, peerId);
            }
        }
    };

    this.peerConnections.set(peerId, pc);
    return pc;
  }
  
  private async logSelectedCandidatePair(pc: RTCPeerConnection, peerId: string): Promise<void> {
    // This helper provides debug information to the console about the connection path.
    // It helps verify if a direct local network connection ('host' to 'host') was established.
    if (typeof pc.getStats !== 'function') {
        console.log('getStats() is not supported in this browser.');
        return;
    }
    try {
        const stats = await pc.getStats();
        let activePair: any;
        // The 'transport' report gives us the ID of the selected candidate pair.
        stats.forEach(report => {
            if (report.type === 'transport' && report.selectedCandidatePairId) {
                activePair = stats.get(report.selectedCandidatePairId);
            }
        });

        if (activePair && activePair.localCandidateId && activePair.remoteCandidateId) {
            const localCandidate = stats.get(activePair.localCandidateId);
            const remoteCandidate = stats.get(activePair.remoteCandidateId);
            if (localCandidate && remoteCandidate) {
                let connectionType = 'Unknown';
                if (localCandidate.candidateType === 'host' && remoteCandidate.candidateType === 'host') {
                    connectionType = 'Direct LAN connection. Ideal for local networks.';
                } else if (localCandidate.candidateType.includes('flx') || remoteCandidate.candidateType.includes('flx')) {
                    connectionType = 'NAT traversal (STUN). Connection over the internet.';
                } else if (localCandidate.candidateType === 'relay' || remoteCandidate.candidateType === 'relay') {
                    connectionType = 'Relayed (TURN). Connection is not peer-to-peer.';
                }

                console.log(
`%cWebRTC Connection with ${peerId} Established%c
-> Path: %c${localCandidate.candidateType}%c (local) to %c${remoteCandidate.candidateType}%c (remote)
-> Type: %c${connectionType}%c
-> Local Address: ${localCandidate.address}:${localCandidate.port}
-> Remote Address: ${remoteCandidate.address}:${remoteCandidate.port}`,
'font-weight: bold; color: #22c55e;', '',
'font-weight: bold;', '',
'font-weight: bold;', '',
'font-weight: bold;', ''
                );
            }
        }
    } catch (error) {
        console.warn('Could not retrieve WebRTC connection stats:', error);
    }
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
      channel.onopen = () => {
          console.log(`Data channel with ${peerId} is open`);
          const queue = this.messageQueue.get(peerId);
          if (queue && queue.length > 0) {
            console.log(`Sending ${queue.length} queued messages to ${peerId}.`);
            queue.forEach(msg => channel.send(JSON.stringify(msg)));
            this.messageQueue.delete(peerId);
          }
          this.onDataChannelOpen(peerId);
      };

      channel.onclose = () => {
          console.log(`Data channel with ${peerId} is closed`);
      };

      channel.onmessage = (event) => {
          try {
              const message: Message = JSON.parse(event.data);
              this.onMessageReceived(peerId, message);
          } catch(e) {
              console.error("Failed to parse message from peer", peerId, event.data, e);
          }
      };
  }

  closeConnection(peerId: string): void {
    this.peerConnections.get(peerId)?.close();
    this.peerConnections.delete(peerId);
    this.dataChannels.delete(peerId);
    this.messageQueue.delete(peerId);
    this.earlyIceCandidates.delete(peerId);
  }

  closeAllConnections(): void {
    this.peerConnections.forEach(pc => pc.close());
    this.peerConnections.clear();
    this.dataChannels.clear();
    this.messageQueue.clear();
    this.earlyIceCandidates.clear();
  }
}