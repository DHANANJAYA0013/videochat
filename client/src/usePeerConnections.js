import { useRef, useCallback } from 'react';

// Public STUN servers + free TURN fallback
const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
  ],
  iceCandidatePoolSize: 10,
};

export function usePeerConnections({ socketRef, localStreamRef, onRemoteStream, onPeerLeft }) {
  // peerId → RTCPeerConnection
  const pcsRef = useRef({});
  // peerId → pending ICE queue (before remote desc is set)
  const iceCacheRef = useRef({});

  const createPC = useCallback(
    (peerId) => {
      if (pcsRef.current[peerId]) return pcsRef.current[peerId];

      const pc = new RTCPeerConnection(ICE_SERVERS);
      pcsRef.current[peerId] = pc;
      iceCacheRef.current[peerId] = [];

      // Add local tracks
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          pc.addTrack(track, stream);
        });
      }

      // Remote stream assembly
      const remoteStream = new MediaStream();
      pc.ontrack = (e) => {
        e.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
        onRemoteStream(peerId, remoteStream);
      };

      // ICE trickle
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          socketRef.current?.emit('ice-candidate', {
            targetId: peerId,
            candidate: e.candidate,
          });
        }
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (state === 'failed' || state === 'closed' || state === 'disconnected') {
          closePC(peerId);
          onPeerLeft(peerId);
        }
      };

      return pc;
    },
    [socketRef, localStreamRef, onRemoteStream, onPeerLeft]
  );

  const closePC = useCallback((peerId) => {
    const pc = pcsRef.current[peerId];
    if (pc) {
      pc.close();
      delete pcsRef.current[peerId];
      delete iceCacheRef.current[peerId];
    }
  }, []);

  const makeOffer = useCallback(
    async (peerId) => {
      const pc = createPC(peerId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socketRef.current?.emit('offer', { targetId: peerId, sdp: offer });
    },
    [createPC, socketRef]
  );

  const handleOffer = useCallback(
    async ({ fromId, sdp }) => {
      const pc = createPC(fromId);
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Flush cached ICE candidates
      for (const c of iceCacheRef.current[fromId] || []) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      iceCacheRef.current[fromId] = [];

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socketRef.current?.emit('answer', { targetId: fromId, sdp: answer });
    },
    [createPC, socketRef]
  );

  const handleAnswer = useCallback(async ({ fromId, sdp }) => {
    const pc = pcsRef.current[fromId];
    if (pc && pc.signalingState !== 'stable') {
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));
      // Flush ICE cache
      for (const c of iceCacheRef.current[fromId] || []) {
        await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {});
      }
      iceCacheRef.current[fromId] = [];
    }
  }, []);

  const handleIceCandidate = useCallback(async ({ fromId, candidate }) => {
    const pc = pcsRef.current[fromId];
    if (pc && pc.remoteDescription) {
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    } else {
      // Cache until remote desc is set
      if (!iceCacheRef.current[fromId]) iceCacheRef.current[fromId] = [];
      iceCacheRef.current[fromId].push(candidate);
    }
  }, []);

  const replaceTrack = useCallback((kind, newTrack) => {
    Object.values(pcsRef.current).forEach((pc) => {
      const sender = pc.getSenders().find((s) => s.track?.kind === kind);
      if (sender && newTrack) sender.replaceTrack(newTrack).catch(() => {});
    });
  }, []);

  const closeAll = useCallback(() => {
    Object.keys(pcsRef.current).forEach(closePC);
  }, [closePC]);

  return { makeOffer, handleOffer, handleAnswer, handleIceCandidate, replaceTrack, closeAll, closePC };
}
