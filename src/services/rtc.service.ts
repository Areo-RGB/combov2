import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class RtcService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private onMessageCallback: ((payload: any) => void) | null = null;

  async createOfferWithDataChannel(): Promise<string> {
    this.peerConnection = new RTCPeerConnection({ iceServers: [] });
    this.dataChannel = this.peerConnection.createDataChannel('motion', { ordered: true });
    this.attachDataChannelHandlers();
    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    await this.waitForIceGatheringComplete(this.peerConnection);
    return this.peerConnection.localDescription?.sdp ?? '';
  }

  async acceptOfferAndCreateAnswer(offerSdp: string): Promise<string> {
    this.peerConnection = new RTCPeerConnection({ iceServers: [] });
    this.peerConnection.ondatachannel = (e) => {
      this.dataChannel = e.channel;
      this.attachDataChannelHandlers();
    };
    await this.peerConnection.setRemoteDescription({ type: 'offer', sdp: offerSdp });
    const answer = await this.peerConnection.createAnswer();
    await this.peerConnection.setLocalDescription(answer);
    await this.waitForIceGatheringComplete(this.peerConnection);
    return this.peerConnection.localDescription?.sdp ?? '';
  }

  async setRemoteAnswer(answerSdp: string): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  onMessage(callback: (payload: any) => void): void {
    this.onMessageCallback = callback;
    // attach immediately if channel already exists
    if (this.dataChannel) {
      this.attachDataChannelHandlers();
    }
  }

  sendMotion(intensity: number): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      const message = { t: 'motion', intensity, ts: Date.now() };
      this.dataChannel.send(JSON.stringify(message));
    }
  }

  private attachDataChannelHandlers(): void {
    if (!this.dataChannel) return;
    this.dataChannel.onmessage = (ev) => {
      if (!this.onMessageCallback) return;
      try {
        const parsed = JSON.parse(ev.data);
        this.onMessageCallback(parsed);
      } catch {
        // ignore malformed data
      }
    };
  }

  private waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      const listener = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', listener);
          resolve();
        }
      };
      pc.addEventListener('icegatheringstatechange', listener);
    });
  }
}


