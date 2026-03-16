import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Mic, MicOff, Send, Terminal, Cpu, Database, 
  Settings, Activity, MessageSquare, Code, 
  Zap, Globe, Volume2, VolumeX, History,
  Maximize2, Minimize2, Power, Monitor, HardDrive
} from 'lucide-react';
import { processJarvisInput, JarvisResponse } from './services/geminiService';
import ReactMarkdown from 'react-markdown';
import { cn } from './lib/utils';

// --- Types ---
interface Message {
  id: string;
  role: 'user' | 'jarvis';
  content: string;
  type?: JarvisResponse['type'];
  data?: any;
  timestamp: Date;
}

// --- Voice Service ---
const useVoice = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [audioLevel, setAudioLevel] = useState(0);
  const recognitionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = true;
      recognitionRef.current.interimResults = true;
      
      recognitionRef.current.onresult = (event: any) => {
        let final = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        if (final) {
          setTranscript(final);
          setInterimTranscript('');
        } else {
          setInterimTranscript(interim);
        }
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
        stopAudioAnalysis();
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error', event.error);
        setIsListening(false);
        stopAudioAnalysis();
        
        if (event.error === 'not-allowed') {
          window.dispatchEvent(new CustomEvent('jarvis-error', { detail: 'MIC PERMISSION DENIED' }));
        } else if (event.error === 'no-speech') {
          // Silent error for no speech
        } else {
          window.dispatchEvent(new CustomEvent('jarvis-error', { detail: `ERROR: ${event.error.toUpperCase()}` }));
        }
      };
    }

    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      stopAudioAnalysis();
    };
  }, []);

  const startAudioAnalysis = async () => {
    try {
      // Check if API is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('BROWSER_NOT_SUPPORTED');
      }

      // Check for available devices first
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasMic = devices.some(device => device.kind === 'audioinput');
      if (!hasMic) {
        const err = new Error('Requested device not found');
        err.name = 'NotFoundError';
        throw err;
      }

      // Request stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Handle AudioContext state
      if (audioContextRef.current?.state === 'closed') {
        audioContextRef.current = null;
      }
      
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContextClass();
      }

      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      source.connect(analyserRef.current);

      const bufferLength = analyserRef.current.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateLevel = () => {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        setAudioLevel(average / 128);
        animationFrameRef.current = requestAnimationFrame(updateLevel);
      };

      updateLevel();
    } catch (err: any) {
      console.error('JARVIS Audio Diagnostic:', err.name, err.message);
      
      let errorDetail = 'SYSTEM ERROR';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorDetail = 'MIC PERMISSION DENIED';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorDetail = 'NO MICROPHONE FOUND';
      } else if (err.message === 'BROWSER_NOT_SUPPORTED') {
        errorDetail = 'BROWSER NOT SUPPORTED';
      }

      window.dispatchEvent(new CustomEvent('jarvis-error', { detail: errorDetail }));
      throw err; // Re-throw to stop recognition if needed
    }
  };

  const stopAudioAnalysis = () => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    if (audioContextRef.current && audioContextRef.current.state === 'running') {
      audioContextRef.current.suspend();
    }
    setAudioLevel(0);
  };

  const startListening = async () => {
    if (!recognitionRef.current) {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        window.dispatchEvent(new CustomEvent('jarvis-error', { detail: 'SPEECH API NOT SUPPORTED' }));
        return;
      }
    }

    try {
      // Always try to start audio analysis first to trigger permission prompt
      await startAudioAnalysis();
      
      setTranscript('');
      setInterimTranscript('');
      setIsListening(true);
      recognitionRef.current.start();
    } catch (err: any) {
      console.error('JARVIS Recognition Start Failure:', err);
      setIsListening(false);
      // Error event already dispatched by startAudioAnalysis
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      stopAudioAnalysis();
    }
  };

  const speak = (text: string, lang: string = 'en-US') => {
    const utterance = new SpeechSynthesisUtterance(text);
    // Basic language mapping
    if (lang === 'hi') utterance.lang = 'hi-IN';
    else if (lang === 'bho') utterance.lang = 'hi-IN';
    else utterance.lang = 'en-US';
    
    window.speechSynthesis.speak(utterance);
  };

  return { isListening, transcript, interimTranscript, audioLevel, startListening, stopListening, speak };
};

// --- Audio Visualizer Component ---
const AudioVisualizer = ({ level, isListening }: { level: number, isListening: boolean }) => {
  return (
    <div className="flex items-center gap-1 h-8">
      {[...Array(8)].map((_, i) => (
        <motion.div
          key={i}
          animate={{ 
            height: isListening ? `${Math.max(4, level * 32 * (1 - Math.abs(i - 3.5) / 4))}px` : '4px' 
          }}
          className="w-1 bg-[#00f2ff] rounded-full opacity-60"
        />
      ))}
    </div>
  );
};

// --- Troubleshooting Guide ---
const TroubleshootingGuide = ({ error, onClose }: { error: string, onClose: () => void }) => {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="p-8 bg-[#0a0a0a] border border-red-500/30 rounded-3xl max-w-md w-full text-center space-y-6 shadow-[0_0_50px_rgba(239,68,68,0.2)]"
      >
        <div className="flex justify-center">
          <div className="p-4 bg-red-500/20 rounded-full animate-pulse">
            <MicOff className="w-10 h-10 text-red-500" />
          </div>
        </div>
        
        <div>
          <h3 className="text-xl font-bold text-red-500 uppercase tracking-widest mb-2">{error}</h3>
          <p className="text-xs opacity-50 uppercase tracking-tighter">System Diagnostic Required</p>
        </div>

        <div className="text-sm opacity-80 space-y-4 text-left bg-black/40 p-4 rounded-xl border border-white/5">
          {error === 'MIC PERMISSION DENIED' ? (
            <>
              <div className="flex gap-3">
                <span className="text-red-500 font-bold">01</span>
                <p>Click the <strong>lock icon</strong> (🔒) in your browser's address bar.</p>
              </div>
              <div className="flex gap-3">
                <span className="text-red-500 font-bold">02</span>
                <p>Ensure <strong>Microphone</strong> is set to <strong>Allow</strong>.</p>
              </div>
              <div className="flex gap-3">
                <span className="text-red-500 font-bold">03</span>
                <p>If you are in an <strong>iframe</strong>, ensure the parent site allows mic access.</p>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-3">
                <span className="text-red-500 font-bold">01</span>
                <p>Ensure your microphone is <strong>plugged in</strong> correctly.</p>
              </div>
              <div className="flex gap-3">
                <span className="text-red-500 font-bold">02</span>
                <p>Check <strong>System Settings</strong> to verify the device is active.</p>
              </div>
              <div className="flex gap-3">
                <span className="text-red-500 font-bold">03</span>
                <p>Try a different browser or check for hardware mute switches.</p>
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <button 
            onClick={onClose}
            className="py-3 border border-[#00f2ff]/20 text-[#00f2ff]/60 rounded-xl font-bold hover:bg-[#00f2ff]/5 transition-colors text-xs uppercase"
          >
            Use Text Only
          </button>
          <button 
            onClick={() => window.location.reload()}
            className="py-3 bg-red-500 text-white rounded-xl font-bold hover:bg-red-600 transition-all shadow-[0_0_20px_rgba(239,68,68,0.3)] text-xs uppercase"
          >
            Re-Initialize
          </button>
        </div>
      </motion.div>
    </div>
  );
};

// --- System Access Component ---
const SystemAccess = () => {
  const [isBridgeActive, setIsBridgeActive] = useState(false);
  const [systemStats, setSystemStats] = useState({
    cpu: 12,
    ram: 45,
    temp: 42,
    disk: 68
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setSystemStats({
        cpu: Math.floor(Math.random() * 20) + 5,
        ram: Math.floor(Math.random() * 10) + 40,
        temp: Math.floor(Math.random() * 5) + 40,
        disk: 68
      });
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex-1 p-8 space-y-8 overflow-y-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-widest uppercase">System Access Bridge</h2>
          <p className="text-xs opacity-50 mt-1">ESTABLISHING LOCAL PC CONNECTION PROTOCOL</p>
        </div>
        <button 
          onClick={() => setIsBridgeActive(!isBridgeActive)}
          className={cn(
            "px-6 py-2 rounded-full font-bold text-xs tracking-widest transition-all",
            isBridgeActive 
              ? "bg-green-500 text-black shadow-[0_0_20px_rgba(34,197,94,0.4)]" 
              : "bg-[#00f2ff]/10 border border-[#00f2ff]/30 text-[#00f2ff]"
          )}
        >
          {isBridgeActive ? 'BRIDGE_ACTIVE' : 'INITIALIZE_BRIDGE'}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'CPU LOAD', value: `${systemStats.cpu}%`, icon: Cpu, color: 'text-blue-400' },
          { label: 'MEMORY', value: `${systemStats.ram}%`, icon: Database, color: 'text-purple-400' },
          { label: 'CORE TEMP', value: `${systemStats.temp}°C`, icon: Zap, color: 'text-orange-400' },
          { label: 'DISK SPACE', value: `${systemStats.disk}%`, icon: Database, color: 'text-green-400' },
        ].map((stat, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 bg-black/40 border border-[#00f2ff]/10 rounded-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <stat.icon className={cn("w-5 h-5", stat.color)} />
              <span className="text-[10px] font-mono opacity-40 uppercase">{stat.label}</span>
            </div>
            <div className="text-3xl font-bold font-mono tracking-tighter">{stat.value}</div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                animate={{ width: stat.value }}
                className={cn("h-full", stat.color.replace('text', 'bg'))}
              />
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 bg-black/40 border border-[#00f2ff]/10 rounded-3xl space-y-6">
            <h3 className="text-sm font-bold uppercase tracking-widest flex items-center gap-2">
              <Terminal className="w-4 h-4 text-[#00f2ff]" />
              Local Command Terminal
            </h3>
            <div className="space-y-4">
              {[
                { cmd: 'open chrome --search "latest ai news"', status: 'SUCCESS', time: '10:24:05' },
                { cmd: 'system_check --deep', status: 'SUCCESS', time: '10:23:12' },
                { cmd: 'launch_app "spotify"', status: 'PENDING', time: '10:22:45' },
              ].map((log, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-white/5 rounded-xl text-[11px] font-mono">
                  <div className="flex items-center gap-3">
                    <span className="opacity-30">[{log.time}]</span>
                    <span className="text-[#00f2ff]">$ {log.cmd}</span>
                  </div>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[9px]",
                    log.status === 'SUCCESS' ? "bg-green-500/10 text-green-400" : "bg-yellow-500/10 text-yellow-400"
                  )}>{log.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-6 bg-[#00f2ff]/5 border border-[#00f2ff]/20 rounded-3xl space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-widest">Bridge Setup</h3>
            <p className="text-xs opacity-60 leading-relaxed">
              To allow JARVIS to access your local PC (files, apps, system), you must run the JARVIS Local Bridge script on your machine.
            </p>
            <div className="p-3 bg-black/60 rounded-xl border border-white/5 font-mono text-[10px] text-green-400/80">
              pip install jarvis-bridge<br/>
              jarvis-bridge --connect {window.location.hostname}
            </div>
            <button className="w-full py-3 bg-[#00f2ff] text-black rounded-xl font-bold text-xs uppercase hover:scale-[1.02] transition-all">
              Download Bridge Script
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Main Component ---
export default function App() {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [systemStatus, setSystemStatus] = useState('ONLINE');
  const [activeTab, setActiveTab] = useState<'chat' | 'logs' | 'memory' | 'code' | 'system'>('chat');
  const [logs, setLogs] = useState<any[]>([]);
  const [memory, setMemory] = useState<any[]>([]);
  
  const { isListening, transcript, interimTranscript, audioLevel, startListening, stopListening, speak } = useVoice();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleJarvisError = (e: any) => {
      setSystemStatus(e.detail);
      // Don't clear if it's a critical error that needs troubleshooting
      if (e.detail !== 'MIC PERMISSION DENIED' && e.detail !== 'NO MICROPHONE FOUND') {
        setTimeout(() => setSystemStatus('ONLINE'), 5000);
      }
    };
    window.addEventListener('jarvis-error', handleJarvisError);
    return () => window.removeEventListener('jarvis-error', handleJarvisError);
  }, []);

  // Auto-submit transcript when it's final
  useEffect(() => {
    if (transcript) {
      handleSend(transcript);
    }
  }, [transcript]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const fetchLogs = async () => {
    const res = await fetch('/api/logs');
    const data = await res.json();
    setLogs(data);
  };

  const fetchMemory = async () => {
    const res = await fetch('/api/memory');
    const data = await res.json();
    setMemory(data);
  };

  useEffect(() => {
    fetchLogs();
    fetchMemory();
  }, []);

  const handleSend = async (text: string = input) => {
    if (!text.trim()) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsProcessing(true);
    setSystemStatus('PROCESSING');

    try {
      const response = await processJarvisInput(text);
      
      const jarvisMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'jarvis',
        content: response.text,
        type: response.type,
        data: response.data,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, jarvisMsg]);
      
      if (response.type === 'automation' || response.type === 'system') {
        setLogs(prev => [{
          id: Date.now(),
          type: response.type.toUpperCase(),
          command: text,
          timestamp: new Date()
        }, ...prev]);
      }

      // Handle Spotify Playback
      if (response.type === 'system' && response.action === 'spotify_play') {
        const query = encodeURIComponent(response.data || '');
        const spotifyUrl = `https://open.spotify.com/search/${query}`;
        window.open(spotifyUrl, '_blank');
        setSystemStatus(`PLAYING ON SPOTIFY: ${response.data}`);
        setTimeout(() => setSystemStatus('ONLINE'), 3000);
      }

      if (!isMuted) {
        speak(response.text, response.language);
      }

      // Log to backend
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: text,
          response: response.text,
          type: response.type
        })
      });

      // If it's a command, simulate it
      if (response.type === 'command') {
        setSystemStatus(`EXECUTING: ${response.action}`);
        setTimeout(() => setSystemStatus('ONLINE'), 2000);
      }

      fetchLogs();
      fetchMemory();

    } catch (error) {
      console.error(error);
    } finally {
      setIsProcessing(false);
      if (systemStatus === 'PROCESSING') setSystemStatus('ONLINE');
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-[#00f2ff] font-mono selection:bg-[#00f2ff]/30 overflow-hidden flex flex-col">
      {/* --- HUD Header --- */}
      <header className="h-16 border-b border-[#00f2ff]/20 flex items-center justify-between px-6 bg-[#0a0a0a]/80 backdrop-blur-md z-50">
        <div className="flex items-center gap-4">
          <div className="relative">
            <motion.div 
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
              className="w-10 h-10 border-2 border-dashed border-[#00f2ff] rounded-full flex items-center justify-center"
            >
              <Cpu className="w-5 h-5" />
            </motion.div>
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse border-2 border-[#050505]" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-widest uppercase">JARVIS Core</h1>
            <div className="flex items-center gap-2 text-[10px] opacity-60">
              <Activity className="w-3 h-3" />
              <span>SYSTEM STATUS: {systemStatus}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="hidden md:flex flex-col items-end">
            <span className="text-[10px] opacity-50 uppercase">Neural Network</span>
            <span className="text-xs">GEMINI-3-FLASH</span>
          </div>
          <div className="h-8 w-[1px] bg-[#00f2ff]/20" />
          <button 
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 hover:bg-[#00f2ff]/10 rounded-full transition-colors"
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button className="p-2 hover:bg-red-500/10 rounded-full transition-colors text-red-500">
            <Power className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* --- Main Content --- */}
      <main className="flex-1 flex overflow-hidden">
        {/* Sidebar Nav */}
        <nav className="w-16 border-r border-[#00f2ff]/20 flex flex-col items-center py-8 gap-8 bg-[#0a0a0a]/40">
          <NavButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} icon={<MessageSquare />} label="Chat" />
          <NavButton active={activeTab === 'system'} onClick={() => setActiveTab('system')} icon={<Monitor />} label="System" />
          <NavButton active={activeTab === 'code'} onClick={() => setActiveTab('code')} icon={<Code />} label="Code" />
          <NavButton active={activeTab === 'memory'} onClick={() => setActiveTab('memory')} icon={<Database />} label="Memory" />
          <NavButton active={activeTab === 'logs'} onClick={() => setActiveTab('logs')} icon={<History />} label="Logs" />
          <div className="mt-auto">
            <NavButton active={false} onClick={() => {}} icon={<Settings />} label="Config" />
          </div>
        </nav>

        {/* Workspace */}
        <div className="flex-1 flex flex-col relative">
          {/* Background Grid */}
          <div className="absolute inset-0 pointer-events-none opacity-5" 
            style={{ backgroundImage: 'radial-gradient(#00f2ff 1px, transparent 1px)', backgroundSize: '32px 32px' }} 
          />

          {/* Content Area */}
          <div className="flex-1 overflow-hidden flex">
            {/* Chat View */}
            <div className={cn("flex-1 flex flex-col", activeTab !== 'chat' && 'hidden md:flex opacity-40 pointer-events-none')}>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-[#00f2ff]/20">
                <AnimatePresence initial={false}>
                  {messages.length === 0 && (
                    <motion.div 
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      className="h-full flex flex-col items-center justify-center text-center space-y-4"
                    >
                      <Zap className="w-12 h-12 animate-pulse" />
                      <p className="max-w-xs text-sm opacity-60">
                        Awaiting commands, sir. I am ready to assist with automation, coding, or conversation.
                      </p>
                    </motion.div>
                  )}
                  {messages.map((msg) => (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={cn(
                        "flex flex-col max-w-[85%]",
                        msg.role === 'user' ? "ml-auto items-end" : "items-start"
                      )}
                    >
                      <div className="flex items-center gap-2 mb-1 opacity-40 text-[10px] uppercase tracking-tighter">
                        {msg.role === 'user' ? 'User' : 'JARVIS'} • {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className={cn(
                        "p-4 rounded-lg border backdrop-blur-sm",
                        msg.role === 'user' 
                          ? "bg-[#00f2ff]/5 border-[#00f2ff]/30 text-white" 
                          : "bg-[#0a0a0a] border-[#00f2ff]/20"
                      )}>
                        <div className="prose prose-invert prose-sm max-w-none">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        
                        {msg.type === 'code' && msg.data && (
                          <div className="mt-4 p-3 bg-black/50 rounded border border-[#00f2ff]/10 font-mono text-[11px] overflow-x-auto">
                            <pre>{JSON.stringify(msg.data, null, 2)}</pre>
                          </div>
                        )}
                        
                        {msg.type === 'automation' && (
                          <div className="mt-4 flex items-center gap-3 p-2 bg-green-500/10 border border-green-500/30 rounded text-green-400 text-xs">
                            <Terminal className="w-4 h-4" />
                            <span>Automation script generated for {msg.data?.recipient || 'system'}</span>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                
                {isProcessing && (
                  <div className="flex items-center gap-2 text-xs opacity-50 animate-pulse">
                    <div className="w-1 h-1 bg-[#00f2ff] rounded-full" />
                    <div className="w-1 h-1 bg-[#00f2ff] rounded-full" />
                    <div className="w-1 h-1 bg-[#00f2ff] rounded-full" />
                    <span>Analyzing neural patterns...</span>
                  </div>
                )}
              </div>

              {/* Troubleshooting Modal */}
              {(systemStatus === 'MIC PERMISSION DENIED' || systemStatus === 'NO MICROPHONE FOUND') && (
                <TroubleshootingGuide 
                  error={systemStatus} 
                  onClose={() => setSystemStatus('ONLINE')} 
                />
              )}

              {/* Input Bar */}
              <div className="p-6 border-t border-[#00f2ff]/10 bg-[#0a0a0a]/60 backdrop-blur-xl">
                <div className="max-w-4xl mx-auto relative">
                  {/* Interim Transcript Overlay */}
                  <AnimatePresence>
                    {isListening && interimTranscript && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="absolute -top-12 left-6 text-sm text-[#00f2ff]/60 italic"
                      >
                        "{interimTranscript}..."
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <input 
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder={isListening ? "Listening..." : "Type a command or speak..."}
                    className="w-full bg-black/40 border border-[#00f2ff]/20 rounded-full py-4 pl-6 pr-44 focus:outline-none focus:border-[#00f2ff]/50 transition-all placeholder:opacity-30"
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-2">
                    {isListening && <AudioVisualizer level={audioLevel} isListening={isListening} />}
                    <button 
                      onClick={isListening ? stopListening : startListening}
                      className={cn(
                        "p-3 rounded-full transition-all",
                        isListening ? "bg-red-500 text-white animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.5)]" : "hover:bg-[#00f2ff]/10"
                      )}
                    >
                      {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>
                    <button 
                      onClick={() => handleSend()}
                      disabled={!input.trim() || isProcessing}
                      className="p-3 bg-[#00f2ff] text-black rounded-full hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
                    >
                      <Send className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Side Panels */}
            {activeTab === 'system' && <SystemAccess />}
            <AnimatePresence>
              {activeTab !== 'chat' && activeTab !== 'system' && (
                <motion.div 
                  initial={{ x: 300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: 300, opacity: 0 }}
                  className="w-full md:w-96 border-l border-[#00f2ff]/20 bg-[#0a0a0a]/90 flex flex-col"
                >
                  <div className="p-4 border-b border-[#00f2ff]/10 flex items-center justify-between">
                    <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                      {activeTab === 'logs' && <History className="w-4 h-4" />}
                      {activeTab === 'memory' && <Database className="w-4 h-4" />}
                      {activeTab === 'code' && <Code className="w-4 h-4" />}
                      {activeTab}
                    </h2>
                    <button onClick={() => setActiveTab('chat')} className="p-1 hover:bg-[#00f2ff]/10 rounded">
                      <Minimize2 className="w-4 h-4" />
                    </button>
                  </div>
                  
                  <div className="flex-1 overflow-y-auto p-4 space-y-4 text-[11px]">
                    {activeTab === 'logs' && logs.map((log: any) => (
                      <div key={log.id} className="p-3 border border-[#00f2ff]/10 rounded bg-black/20">
                        <div className="flex justify-between opacity-40 mb-1">
                          <span>{log.type}</span>
                          <span>{new Date(log.timestamp).toLocaleTimeString()}</span>
                        </div>
                        <div className="text-[#00f2ff]/80 truncate">{log.command}</div>
                      </div>
                    ))}
                    
                    {activeTab === 'memory' && memory.map((mem: any) => (
                      <div key={mem.id} className="p-3 border border-[#00f2ff]/10 rounded bg-black/20">
                        <div className="font-bold text-[#00f2ff]">{mem.key}</div>
                        <div className="opacity-60 mt-1">{mem.value}</div>
                      </div>
                    ))}

                    {activeTab === 'code' && (
                      <div className="h-full flex flex-col items-center justify-center opacity-40 text-center">
                        <Code className="w-12 h-12 mb-4" />
                        <p>Code generation artifacts will appear here when requested.</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* --- Footer Status Bar --- */}
      <footer className="h-8 border-t border-[#00f2ff]/10 bg-[#0a0a0a] flex items-center justify-between px-6 text-[10px] opacity-50">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
            <span>CORE: STABLE</span>
          </div>
          <div className="flex items-center gap-1">
            <Globe className="w-3 h-3" />
            <span>LOC: CLOUD_RUN_ASIA</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span>LATENCY: 42ms</span>
          <span>MEM: 128MB / 512MB</span>
          <span>V1.0.4-STARK</span>
        </div>
      </footer>
    </div>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "group relative p-3 rounded-xl transition-all",
        active ? "bg-[#00f2ff] text-black shadow-[0_0_15px_rgba(0,242,255,0.4)]" : "text-[#00f2ff]/40 hover:text-[#00f2ff] hover:bg-[#00f2ff]/10"
      )}
    >
      {icon}
      <span className="absolute left-full ml-4 px-2 py-1 bg-[#00f2ff] text-black text-[10px] font-bold rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none uppercase tracking-widest z-50">
        {label}
      </span>
    </button>
  );
}
