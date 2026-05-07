import { useState, useEffect, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

export function useTerminal() {
  const socketRef = useRef(null);
  const isRunningRef = useRef(false);
  const lastRunRef = useRef(0);
  const lastRunPayloadRef = useRef(null);
  const onCompleteRef = useRef(null);

  const [output, setOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [executionTime, setExecutionTime] = useState(null);
  const [executionPhase, setExecutionPhase] = useState(null);
  const [backendStatus, setBackendStatus] = useState('connecting');
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showColdStart, setShowColdStart] = useState(false);
  const [showRerunToast, setShowRerunToast] = useState(false);
  const [queuePosition, setQueuePosition] = useState(null);

  useEffect(() => {
    const socket = io(BASE_URL || window.location.origin, {
      autoConnect: false,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    socketRef.current = socket;
    socket.connect();

    socket.on('connect', () => {
      setBackendStatus('online');
      setIsReconnecting(false);
    });

    socket.on('connect_error', () => setBackendStatus('offline'));

    socket.on('disconnect', () => setBackendStatus('offline'));

    socket.on('reconnecting', () => {
      setIsReconnecting(true);
      setBackendStatus('connecting');
    });

    socket.on('reconnect', () => {
      setIsReconnecting(false);
      setBackendStatus('online');
      if (isRunningRef.current) {
        setIsRunning(false);
        setExecutionPhase(null);
        setShowRerunToast(true);
      }
    });

    socket.on('output', (data) => {
      setOutput(prev => {
        const next = prev + data;
        return next.length > 10000 ? next.slice(-10000) : next;
      });
    });

    socket.on('stderr', (data) => {
      setOutput(prev => {
        const next = prev + '[STDERR]' + data;
        return next.length > 10000 ? next.slice(-10000) : next;
      });
    });

    socket.on('exit', ({ code, time, message }) => {
      setExecutionTime(time);
      setExecutionPhase(null);
      isRunningRef.current = false;
      setIsRunning(false);
      setQueuePosition(null);
      if (message) {
        setOutput(prev => prev + message);
      }
      if (onCompleteRef.current) {
        onCompleteRef.current({ exitCode: code, time, message });
        onCompleteRef.current = null;
      }
    });

    socket.on('queued', ({ position }) => {
      setQueuePosition(position);
      setOutput(prev => prev + `\n\u23f3 Queued \u2014 position ${position}. Waiting for a free slot...\n`);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (backendStatus !== 'online') setShowColdStart(true);
    }, 4000);
    if (backendStatus === 'online') setShowColdStart(false);
    return () => clearTimeout(timer);
  }, [backendStatus]);

  const runCode = useCallback((code, language, onComplete) => {
    if (Date.now() - lastRunRef.current < 600) return;
    if (isRunningRef.current) {
      socketRef.current?.emit('stop');
      isRunningRef.current = false;
      setIsRunning(false);
      setExecutionPhase(null);
      return;
    }
    lastRunRef.current = Date.now();
    lastRunPayloadRef.current = { code, language };
    onCompleteRef.current = onComplete || null;
    isRunningRef.current = true;
    setIsRunning(true);
    setOutput('');
    setExecutionTime(null);
    setQueuePosition(null);
    setShowRerunToast(false);
    const needsCompile = ['cpp', 'c', 'java'].includes(language);
    setExecutionPhase(needsCompile ? 'Compiling...' : 'Running...');
    socketRef.current?.emit('run', { code, language });
  }, []);

  const stopCode = useCallback(() => {
    socketRef.current?.emit('stop');
    isRunningRef.current = false;
    setIsRunning(false);
    setExecutionPhase(null);
  }, []);

  const sendStdin = useCallback((data) => {
    socketRef.current?.emit('stdin', data);
  }, []);

  const clearOutput = useCallback(() => {
    setOutput('');
    setExecutionTime(null);
  }, []);

  const getLastRunPayload = useCallback(() => lastRunPayloadRef.current, []);

  return {
    output,
    isRunning,
    backendStatus,
    executionTime,
    executionPhase,
    isReconnecting,
    showColdStart,
    showRerunToast,
    setShowRerunToast,
    queuePosition,
    setOutput,
    runCode,
    stopCode,
    sendStdin,
    clearOutput,
    getLastRunPayload
  };
}
