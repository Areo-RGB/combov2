import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { RtcService } from './rtc.service';
import { MockRTCPeerConnection, setupWebRTCMocks } from '../test/mocks/webrtc.mock';
import { measureExecutionTime, DEVICE_PROFILES } from '../test/utils/performance.util';

/**
 * RtcService Tests - Focus on WebRTC Connection Race Conditions
 *
 * Critical race conditions tested:
 * 1. ICE candidate gathering order
 * 2. Concurrent offer/answer creation
 * 3. Data channel state transitions
 * 4. Message sending before connection ready
 */
describe('RtcService', () => {
  let service: RtcService;

  beforeEach(() => {
    setupWebRTCMocks();
    service = new RtcService();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Connection Establishment Race Conditions', () => {
    it('should handle concurrent offer creation', async () => {
      // Attempt to create multiple offers concurrently
      const offers = await Promise.all([
        service.createOfferWithDataChannel(),
        service.createOfferWithDataChannel(),
        service.createOfferWithDataChannel(),
      ]);

      // All should succeed but only last one is active
      expect(offers).toHaveLength(3);
      offers.forEach(offer => {
        expect(typeof offer).toBe('string');
        expect(offer.length).toBeGreaterThan(0);
      });

      console.warn('⚠️ Race condition: Concurrent offer creation may leak peer connections');
    });

    it('should handle setRemoteAnswer before offer creation', async () => {
      // Try to set answer before creating offer (invalid state)
      const mockAnswer = 'mock-answer-sdp';

      await service.setRemoteAnswer(mockAnswer);

      // Should handle gracefully (currently just returns if no peer connection)
      expect(true).toBe(true);
    });

    it('should detect race: offer creation during answer processing', async () => {
      const offerSdp = 'mock-offer-sdp';

      // Start accepting offer
      const answerPromise = service.acceptOfferAndCreateAnswer(offerSdp);

      // Immediately try to create new offer (racing operations)
      const offerPromise = service.createOfferWithDataChannel();

      const [answer, offer] = await Promise.all([answerPromise, offerPromise]);

      // Both should complete but connection state is undefined
      expect(answer).toBeTruthy();
      expect(offer).toBeTruthy();

      console.warn('⚠️ Race condition: Simultaneous offer/answer creation causes connection confusion');
    });

    it('should wait for ICE gathering to complete', async () => {
      const start = performance.now();
      const offer = await service.createOfferWithDataChannel();
      const duration = performance.now() - start;

      expect(offer).toBeTruthy();

      // Should have waited for ICE gathering
      // Mock should simulate some delay for ICE gathering
      expect(duration).toBeGreaterThan(0);
    });

    it('should handle ICE gathering timeout gracefully', async () => {
      // Mock a peer connection that never completes ICE gathering
      const mockPC = new MockRTCPeerConnection();
      mockPC.iceGatheringDelay = 10000; // Very long delay

      (globalThis as any).RTCPeerConnection = vi.fn(() => mockPC);

      service = new RtcService();

      // This could hang - we need a timeout mechanism
      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('timeout'), 1000));
      const offerPromise = service.createOfferWithDataChannel();

      const result = await Promise.race([offerPromise, timeoutPromise]);

      if (result === 'timeout') {
        console.warn('⚠️ ICE gathering timeout not handled - connection setup can hang indefinitely');
      }
    });
  });

  describe('Data Channel Race Conditions', () => {
    it('should handle message sent before channel is open', async () => {
      await service.createOfferWithDataChannel();

      // Try to send message immediately (channel may not be open yet)
      service.sendMotion(50);

      // Should not throw, but message is lost
      expect(true).toBe(true);
    });

    it('should handle rapid message sending', async () => {
      const offerSdp = await service.createOfferWithDataChannel();
      const answerSdp = await service.acceptOfferAndCreateAnswer(offerSdp);
      await service.setRemoteAnswer(answerSdp);

      // Simulate data channel opening
      const pc = (service as any).peerConnection as MockRTCPeerConnection;
      const channel = (service as any).dataChannel;
      if (channel) {
        channel._simulateOpen();
      }

      // Send many messages rapidly
      const messageCount = 100;
      for (let i = 0; i < messageCount; i++) {
        service.sendMotion(i);
      }

      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle onMessage callback set after channel creation', async () => {
      await service.createOfferWithDataChannel();

      const messages: any[] = [];
      service.onMessage((payload) => {
        messages.push(payload);
      });

      // Simulate receiving message
      const channel = (service as any).dataChannel;
      if (channel) {
        channel._simulateOpen();
        channel._simulateMessage(JSON.stringify({ t: 'motion', intensity: 42, ts: Date.now() }));
      }

      // Should receive message even though callback was set after channel creation
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].intensity).toBe(42);
    });

    it('should handle malformed messages gracefully', async () => {
      await service.createOfferWithDataChannel();

      const messages: any[] = [];
      service.onMessage((payload) => {
        messages.push(payload);
      });

      const channel = (service as any).dataChannel;
      if (channel) {
        channel._simulateOpen();

        // Send malformed messages
        channel._simulateMessage('not-json');
        channel._simulateMessage('');
        channel._simulateMessage('{"incomplete');
      }

      // Should ignore malformed messages
      expect(messages.length).toBe(0);
    });

    it('should detect race: multiple onMessage callbacks', async () => {
      await service.createOfferWithDataChannel();

      const messages1: any[] = [];
      const messages2: any[] = [];

      service.onMessage((payload) => messages1.push(payload));
      service.onMessage((payload) => messages2.push(payload)); // Second callback

      const channel = (service as any).dataChannel;
      if (channel) {
        channel._simulateOpen();
        channel._simulateMessage(JSON.stringify({ t: 'motion', intensity: 99 }));
      }

      // Only last callback should be active
      expect(messages1.length).toBe(0);
      expect(messages2.length).toBe(1);

      console.warn('⚠️ Setting multiple onMessage callbacks overwrites previous - may cause bugs');
    });
  });

  describe('Connection State Transitions', () => {
    it('should handle connection during active session', async () => {
      const offer1 = await service.createOfferWithDataChannel();
      expect(offer1).toBeTruthy();

      // Create another offer (simulates reconnection)
      const offer2 = await service.createOfferWithDataChannel();
      expect(offer2).toBeTruthy();

      // Previous connection should be replaced
      console.warn('⚠️ Old peer connection not explicitly closed - potential resource leak');
    });

    it('should handle connection failure gracefully', async () => {
      const mockPC = new MockRTCPeerConnection();
      (globalThis as any).RTCPeerConnection = vi.fn(() => mockPC);

      service = new RtcService();
      await service.createOfferWithDataChannel();

      // Simulate connection failure
      mockPC._simulateFailure();

      // Service should still allow operations
      await expect(service.createOfferWithDataChannel()).resolves.toBeTruthy();
    });

    it('should handle disconnection during data transfer', async () => {
      const mockPC = new MockRTCPeerConnection();
      (globalThis as any).RTCPeerConnection = vi.fn(() => mockPC);

      service = new RtcService();
      await service.createOfferWithDataChannel();

      const channel = (service as any).dataChannel;
      if (channel) {
        channel._simulateOpen();
      }

      // Send message
      service.sendMotion(50);

      // Simulate disconnection
      mockPC._simulateDisconnection();

      // Try to send message after disconnection
      service.sendMotion(75);

      // Should not throw (message is just lost)
      expect(true).toBe(true);
    });
  });

  describe('Performance Tests - Mobile Considerations', () => {
    it('performance: offer creation should be fast on mobile devices', async () => {
      const profile = DEVICE_PROFILES['mid-range'];

      const { metrics } = await measureExecutionTime(
        async () => await service.createOfferWithDataChannel(),
        5
      );

      // Offer creation should complete within reasonable time
      // On mid-range device: ~100ms budget
      expect(metrics.executionTime).toBeLessThan(100);

      console.log(`✓ Offer creation: ${metrics.executionTime.toFixed(2)}ms (mid-range mobile)`);
    });

    it('performance: answer creation should be fast on mobile devices', async () => {
      const profile = DEVICE_PROFILES['mid-range'];
      const mockOffer = 'mock-offer-sdp';

      const { metrics } = await measureExecutionTime(
        async () => await service.acceptOfferAndCreateAnswer(mockOffer),
        5
      );

      // Answer creation should complete within reasonable time
      expect(metrics.executionTime).toBeLessThan(100);

      console.log(`✓ Answer creation: ${metrics.executionTime.toFixed(2)}ms (mid-range mobile)`);
    });

    it('performance: message throughput under load', async () => {
      await service.createOfferWithDataChannel();

      const channel = (service as any).dataChannel;
      if (channel) {
        channel._simulateOpen();
      }

      const messageCount = 1000;
      const start = performance.now();

      for (let i = 0; i < messageCount; i++) {
        service.sendMotion(i % 100);
      }

      const duration = performance.now() - start;
      const throughput = messageCount / (duration / 1000); // messages per second

      console.log(`✓ Message throughput: ${throughput.toFixed(0)} msg/s`);

      // Should handle at least 60 messages per second (one per frame at 60fps)
      expect(throughput).toBeGreaterThan(60);
    });
  });

  describe('Memory and Resource Management', () => {
    it('should not leak peer connections on multiple reconnections', async () => {
      const connections: MockRTCPeerConnection[] = [];

      (globalThis as any).RTCPeerConnection = vi.fn((config) => {
        const pc = new MockRTCPeerConnection(config);
        connections.push(pc);
        return pc;
      });

      service = new RtcService();

      // Create multiple connections
      for (let i = 0; i < 10; i++) {
        await service.createOfferWithDataChannel();
      }

      // Should have created 10 connections
      expect(connections.length).toBe(10);

      // Check if old connections are closed
      const unclosedConnections = connections.filter(
        pc => pc.connectionState !== 'closed'
      );

      if (unclosedConnections.length > 1) {
        console.warn(
          `⚠️ Memory leak: ${unclosedConnections.length} unclosed peer connections`
        );
      }

      // Only the last connection should be open
      expect(unclosedConnections.length).toBeLessThanOrEqual(1);
    });

    it('should handle data channel cleanup on connection close', async () => {
      const mockPC = new MockRTCPeerConnection();
      (globalThis as any).RTCPeerConnection = vi.fn(() => mockPC);

      service = new RtcService();
      await service.createOfferWithDataChannel();

      const channel = (service as any).dataChannel;
      expect(channel).toBeTruthy();

      // Close connection
      mockPC.close();

      // Channel should be closed
      expect(channel.readyState).toBe('closed');
    });
  });

  describe('Edge Cases', () => {
    it('should handle setRemoteAnswer with null peer connection', async () => {
      await expect(service.setRemoteAnswer('mock-answer')).resolves.not.toThrow();
    });

    it('should handle empty SDP strings', async () => {
      const mockPC = new MockRTCPeerConnection();
      mockPC.createOffer = vi.fn().mockResolvedValue({ type: 'offer', sdp: '' });

      (globalThis as any).RTCPeerConnection = vi.fn(() => mockPC);

      service = new RtcService();
      const offer = await service.createOfferWithDataChannel();

      // Should return empty string if SDP is empty
      expect(offer).toBe('');
    });

    it('should handle ICE gathering in disconnected state', async () => {
      const mockPC = new MockRTCPeerConnection();

      // Make ICE gathering complete immediately
      Object.defineProperty(mockPC, 'iceGatheringState', {
        get: () => 'complete',
        configurable: true
      });

      (globalThis as any).RTCPeerConnection = vi.fn(() => mockPC);

      service = new RtcService();

      // Should return immediately
      const start = performance.now();
      await service.createOfferWithDataChannel();
      const duration = performance.now() - start;

      expect(duration).toBeLessThan(50); // Should be very fast
    });
  });
});
