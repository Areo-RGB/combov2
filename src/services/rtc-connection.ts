/**
 * Reusable WebRTC connection class for peer-to-peer data channels.
 * Based on RtcService but designed to be instantiated multiple times.
 * Used by LocalLobbyService for managing multiple simultaneous connections.
 */
export class RtcConnection {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private onMessageCallback: ((payload: any) => void) | null = null;
  private onOpenCallback: (() => void) | null = null;
  private onCloseCallback: (() => void) | null = null;

  /**
   * Create offer (host side) with data channel
   */
  async createOfferWithDataChannel(channelName: string = 'lobby'): Promise<string> {
    this.peerConnection = new RTCPeerConnection({ iceServers: [] });
    this.dataChannel = this.peerConnection.createDataChannel(channelName, { ordered: true });
    this.attachDataChannelHandlers();

    const offer = await this.peerConnection.createOffer();
    await this.peerConnection.setLocalDescription(offer);
    await this.waitForIceGatheringComplete(this.peerConnection);

    return this.peerConnection.localDescription?.sdp ?? '';
  }

  /**
   * Accept offer and create answer (client side)
   */
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

  /**
   * Set remote answer (host side after receiving answer from client)
   */
  async setRemoteAnswer(answerSdp: string): Promise<void> {
    if (!this.peerConnection) return;
    await this.peerConnection.setRemoteDescription({ type: 'answer', sdp: answerSdp });
  }

  /**
   * Register message callback
   */
  onMessage(callback: (payload: any) => void): void {
    this.onMessageCallback = callback;
    if (this.dataChannel) {
      this.attachDataChannelHandlers();
    }
  }

  /**
   * Register data channel open callback
   */
  onOpen(callback: () => void): void {
    this.onOpenCallback = callback;
  }

  /**
   * Register data channel close callback
   */
  onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  /**
   * Send message through data channel
   */
  send(message: any): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message));
    } else {
      console.warn('Data channel not open, message not sent:', message);
    }
  }

  /**
   * Get data channel ready state
   */
  isReady(): boolean {
    return this.dataChannel?.readyState === 'open';
  }

  /**
   * Close connection and clean up resources
   */
  close(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
    this.onMessageCallback = null;
    this.onOpenCallback = null;
    this.onCloseCallback = null;
  }

  private attachDataChannelHandlers(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('RTC data channel opened');
      if (this.onOpenCallback) {
        this.onOpenCallback();
      }
    };

    this.dataChannel.onclose = () => {
      console.log('RTC data channel closed');
      if (this.onCloseCallback) {
        this.onCloseCallback();
      }
    };

    this.dataChannel.onmessage = (ev) => {
      if (!this.onMessageCallback) return;
      try {
        const parsed = JSON.parse(ev.data);
        this.onMessageCallback(parsed);
      } catch {
        // ignore malformed data
      }
    };

    this.dataChannel.onerror = (err) => {
      console.error('RTC data channel error:', err);
    };
  }

  private waitForIceGatheringComplete(pc: RTCPeerConnection): Promise<void> {
    if (pc.iceGatheringState === 'complete') {
      return Promise.resolve();
    }

    return new Promise<void>((resolve, reject) => {
      const listener = () => {
        if (pc.iceGatheringState === 'complete') {
          pc.removeEventListener('icegatheringstatechange', listener);
          clearTimeout(timeout);
          resolve();
        }
      };

      // Add timeout to prevent hanging
      const timeout = setTimeout(() => {
        pc.removeEventListener('icegatheringstatechange', listener);
        reject(new Error('ICE gathering timeout after 10 seconds'));
      }, 10000);

      pc.addEventListener('icegatheringstatechange', listener);
    });
  }
}
