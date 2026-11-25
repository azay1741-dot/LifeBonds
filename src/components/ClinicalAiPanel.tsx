import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Bot,
  Brain,
  ExternalLink,
  Globe,
  MapPin,
  Mic,
  MicOff,
  NotebookPen,
  PhoneOff,
  Pin,
  Send,
  Sparkles,
  Trash2,
  Volume2,
  Zap,
} from 'lucide-react';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
import { sendAiChatApi } from '../api';
import { useAuth } from '../context/AuthContext';
import { OperationType, db, handleFirestoreError } from '../lib/firebase';
import { AiChatMessage, AiChatMode, ShiftNote } from '../types';

const MODE_OPTIONS: Array<{
  id: AiChatMode;
  label: string;
  modelNote: string;
  icon: typeof Bot;
}> = [
  { id: 'general', label: 'Clinical Chat', modelNote: 'Gemini 4 Hydrogen', icon: Bot },
  { id: 'reasoning', label: 'Deep Reasoning', modelNote: 'Gemini 4 Hydrogen · High Thinking', icon: Brain },
  { id: 'fast', label: 'Rapid Triage', modelNote: 'Gemini 3.1 Flash Lite', icon: Zap },
  { id: 'search', label: 'Medical Web Search', modelNote: 'Google Search Grounding', icon: Globe },
  { id: 'maps', label: 'Nearby Clinics AI', modelNote: 'Google Maps Grounding', icon: MapPin },
];

const QUICK_PROMPTS: Array<{ label: string; mode: AiChatMode; text: string }> = [
  {
    label: 'Analyze ER Queue & Bottlenecks',
    mode: 'reasoning',
    text: 'Evaluate the current ER waiting load and recommend staffing allocation between Emergency Min-Heap and Standard FIFO queues.',
  },
  {
    label: 'Latest AHA Sepsis / Chest Pain Guidelines',
    mode: 'search',
    text: 'Summarize latest evidence-based emergency triage protocols for suspected acute coronary syndrome with low SpO2.',
  },
  {
    label: 'Find Nearby 24h Pharmacies & Clinics',
    mode: 'maps',
    text: 'Find well-rated 24-hour pharmacies and outpatient urgent care clinics nearby for post-discharge referrals.',
  },
];

function float32ToPcm16Base64(input: Float32Array): string {
  const buf = new ArrayBuffer(input.length * 2);
  const view = new DataView(buf);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length / 2;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    const low = binary.charCodeAt(i * 2);
    const high = binary.charCodeAt(i * 2 + 1);
    let val = (high << 8) | low;
    if (val >= 0x8000) val -= 0x10000;
    out[i] = val / 32768;
  }
  return out;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
      return (
        <code
          key={idx}
          className="px-1 py-0.5 rounded bg-slate-200/70 font-mono text-[11px] text-slate-900"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
      return (
        <em key={idx} className="italic">
          {token.slice(1, -1)}
        </em>
      );
    }
    return token;
  });
}

function SafeMarkdownBlock({ text }: { text: string }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-xs leading-relaxed text-slate-800">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={i} className="font-semibold text-slate-900 pt-1">
              {renderInlineMarkdown(trimmed.slice(4))}
            </h4>
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={i} className="font-semibold text-sm text-slate-900 pt-1">
              {renderInlineMarkdown(trimmed.slice(3))}
            </h3>
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h3 key={i} className="font-semibold text-sm text-slate-900 pt-1">
              {renderInlineMarkdown(trimmed.slice(2))}
            </h3>
          );
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-teal-700 font-bold shrink-0">•</span>
              <span>{renderInlineMarkdown(trimmed.slice(2))}</span>
            </div>
          );
        }
        const orderedMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
        if (orderedMatch) {
          return (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-teal-700 font-semibold font-mono shrink-0">
                {orderedMatch[1]}.
              </span>
              <span>{renderInlineMarkdown(orderedMatch[2])}</span>
            </div>
          );
        }
        return <p key={i}>{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

export function ClinicalAiPanel() {
  const { user, getToken } = useAuth();
  const [subTab, setSubTab] = useState<'chat' | 'voice' | 'notes'>('chat');

  // Chat state
  const [mode, setMode] = useState<AiChatMode>('general');
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      mode: 'general',
      text: 'Lifebonds Clinical Copilot ready. Ask about live ER queue balancing, P1–P4 prioritization protocols, DSA heap mechanics, medical guidelines via Google Search, or nearby outpatient referral clinics via Google Maps.',
      timestamp: Date.now(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [userLatLng, setUserLatLng] = useState<{ latitude: number; longitude: number } | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);

  // Live Voice state
  const [voiceActive, setVoiceActive] = useState(false);
  const [voiceConnecting, setVoiceConnecting] = useState(false);
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceTranscripts, setVoiceTranscripts] = useState<
    Array<{ id: string; speaker: 'You' | 'Copilot'; text: string }>
  >([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const activeSourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const mutedRef = useRef(false);
  const stoppingVoiceRef = useRef(false);

  // Shift Notes (Firestore)
  const [notes, setNotes] = useState<ShiftNote[]>([]);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [noteCategory, setNoteCategory] = useState<ShiftNote['category']>('Shift Handoff');
  const [savingNote, setSavingNote] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  useEffect(() => {
    chatScrollRef.current?.scrollTo({
      top: chatScrollRef.current.scrollHeight,
      behavior: 'smooth',
    });
  }, [messages, sending]);

  useEffect(() => {
    mutedRef.current = voiceMuted;
  }, [voiceMuted]);

  // Firestore real-time shift notes listener
  useEffect(() => {
    if (!user) {
      setNotes([]);
      return;
    }
    const notesPath = `users/${user.uid}/triageNotes`;
    const q = query(collection(db, notesPath), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ShiftNote[] = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ownerId: String(data.ownerId ?? user.uid),
              title: String(data.title ?? ''),
              body: String(data.body ?? ''),
              category: (data.category as ShiftNote['category']) ?? 'Shift Handoff',
              pinned: Boolean(data.pinned),
            };
          })
          .sort((a, b) => Number(b.pinned) - Number(a.pinned));
        setNotes(list);
      },
      (err) => {
        setNotesError('Unable to sync shift notes from Firestore.');
        handleFirestoreError(err, OperationType.GET, notesPath);
      }
    );
    return () => unsub();
  }, [user]);

  const stopVoiceSession = () => {
    if (stoppingVoiceRef.current) return;
    stoppingVoiceRef.current = true;
    try {
      processorRef.current?.disconnect();
      streamRef.current?.getTracks().forEach((t) => t.stop());
      void inputCtxRef.current?.close();
      activeSourcesRef.current.forEach((s) => {
        try {
          s.stop();
        } catch {
          // ignore
        }
      });
      activeSourcesRef.current = [];
      void outputCtxRef.current?.close();
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        ws.close();
      }
    } finally {
      processorRef.current = null;
      streamRef.current = null;
      inputCtxRef.current = null;
      outputCtxRef.current = null;
      nextStartTimeRef.current = 0;
      setVoiceActive(false);
      setVoiceConnecting(false);
      stoppingVoiceRef.current = false;
    }
  };

  useEffect(() => {
    return () => {
      stopVoiceSession();
    };
  }, []);

  async function requestGeoIfMapsMode(targetMode: AiChatMode) {
    if (targetMode !== 'maps' || userLatLng || !navigator.geolocation) return userLatLng;
    return new Promise<{ latitude: number; longitude: number } | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
          setUserLatLng(coords);
          resolve(coords);
        },
        () => resolve(null),
        { timeout: 4000 }
      );
    });
  }

  async function submitChat(promptText: string, overrideMode?: AiChatMode) {
    const trimmed = promptText.trim();
    if (!trimmed || sending) return;
    const chosenMode = overrideMode ?? mode;

    const userMsg: AiChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      mode: chosenMode,
      timestamp: Date.now(),
    };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInputText('');
    setChatError(null);
    setSending(true);

    try {
      const latLng = await requestGeoIfMapsMode(chosenMode);
      const rawHistory = nextMessages
        .filter((m) => m.id !== 'welcome')
        .slice(-12, -1);
      const historyPayload: Array<{ role: 'user' | 'model'; text: string }> = [];
      for (const m of rawHistory) {
        if (historyPayload.length > 0 && historyPayload[historyPayload.length - 1].role === m.role) {
          historyPayload[historyPayload.length - 1] = {
            role: m.role,
            text: `${historyPayload[historyPayload.length - 1].text}\n${m.text}`,
          };
        } else {
          historyPayload.push({ role: m.role, text: m.text });
        }
      }
      if (
        historyPayload.length > 0 &&
        historyPayload[historyPayload.length - 1].role === 'user'
      ) {
        historyPayload.pop();
      }

      const res = await sendAiChatApi({
        mode: chosenMode,
        message: trimmed,
        history: historyPayload,
        latLng,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: res.text,
          mode: chosenMode,
          sources: res.sources,
          timestamp: Date.now(),
        },
      ]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Unable to reach Gemini Copilot.');
    } finally {
      setSending(false);
    }
  }

  function handleFormSubmit(e: FormEvent) {
    e.preventDefault();
    void submitChat(inputText);
  }

  async function startVoiceSession() {
    if (voiceActive || voiceConnecting) return;
    setVoiceError(null);
    setVoiceConnecting(true);

    try {
      const token = await getToken();
      if (!token) throw new Error('Please sign in first.');

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      await inputCtx.resume();
      await outputCtx.resume();
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/api/live-voice`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token }));
      };

      ws.onmessage = (event) => {
        let msg: {
          ready?: boolean;
          audio?: string;
          interrupted?: boolean;
          inputTranscript?: string;
          outputTranscript?: string;
          error?: string;
          closed?: boolean;
        };
        try {
          msg = JSON.parse(event.data);
        } catch {
          return;
        }

        if (msg.error) {
          setVoiceError(msg.error);
          stopVoiceSession();
          return;
        }

        if (msg.ready) {
          setVoiceConnecting(false);
          setVoiceActive(true);
          const source = inputCtx.createMediaStreamSource(stream);
          const processor = inputCtx.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;
          source.connect(processor);
          processor.connect(inputCtx.destination);

          processor.onaudioprocess = (ev) => {
            if (mutedRef.current || ws.readyState !== WebSocket.OPEN) return;
            const pcmBase64 = float32ToPcm16Base64(ev.inputBuffer.getChannelData(0));
            ws.send(JSON.stringify({ audio: pcmBase64 }));
          };
          return;
        }

        if (msg.interrupted) {
          activeSourcesRef.current.forEach((src) => {
            try {
              src.stop();
            } catch {
              // ignore
            }
          });
          activeSourcesRef.current = [];
          if (outputCtxRef.current) {
            nextStartTimeRef.current = outputCtxRef.current.currentTime;
          }
          return;
        }

        if (msg.audio && outputCtxRef.current) {
          const outCtx = outputCtxRef.current;
          const samples = base64Pcm16ToFloat32(msg.audio);
          if (samples.length > 0) {
            const audioBuffer = outCtx.createBuffer(1, samples.length, 24000);
            audioBuffer.copyToChannel(new Float32Array(samples), 0);

            const srcNode = outCtx.createBufferSource();
            srcNode.buffer = audioBuffer;
            srcNode.connect(outCtx.destination);

            const startAt = Math.max(nextStartTimeRef.current, outCtx.currentTime);
            srcNode.start(startAt);
            nextStartTimeRef.current = startAt + audioBuffer.duration;
            activeSourcesRef.current.push(srcNode);
            srcNode.onended = () => {
              activeSourcesRef.current = activeSourcesRef.current.filter((n) => n !== srcNode);
            };
          }
        }

        if (msg.inputTranscript) {
          setVoiceTranscripts((prev) => [
            ...prev.slice(-24),
            { id: `in-${Date.now()}-${Math.random()}`, speaker: 'You', text: msg.inputTranscript! },
          ]);
        }
        if (msg.outputTranscript) {
          setVoiceTranscripts((prev) => [
            ...prev.slice(-24),
            { id: `out-${Date.now()}-${Math.random()}`, speaker: 'Copilot', text: msg.outputTranscript! },
          ]);
        }
        if (msg.closed) {
          stopVoiceSession();
        }
      };

      ws.onerror = () => {
        setVoiceError('WebSocket connection error during Live Voice session.');
        stopVoiceSession();
      };

      ws.onclose = () => {
        if (wsRef.current === ws) {
          stopVoiceSession();
        }
      };
    } catch (err) {
      setVoiceError(err instanceof Error ? err.message : 'Unable to initialize microphone/voice session.');
      stopVoiceSession();
    }
  }

  async function handleCreateNote(e: FormEvent) {
    e.preventDefault();
    if (!user) return;
    const cleanTitle = noteTitle.trim().slice(0, 120);
    const cleanBody = noteBody.trim().slice(0, 1000);
    if (cleanTitle.length < 2) {
      setNotesError('Note title must be at least 2 characters.');
      return;
    }
    if (cleanBody.length < 1) {
      setNotesError('Please enter operational details for the shift note.');
      return;
    }
    const noteId = `note_${Date.now()}`;
    const notePath = `users/${user.uid}/triageNotes/${noteId}`;
    setSavingNote(true);
    setNotesError(null);
    try {
      await setDoc(doc(db, 'users', user.uid, 'triageNotes', noteId), {
        ownerId: user.uid,
        title: cleanTitle,
        body: cleanBody,
        category: noteCategory,
        pinned: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setNoteTitle('');
      setNoteBody('');
    } catch (err) {
      setNotesError('Unable to save shift note to Firestore. Please retry.');
      handleFirestoreError(err, OperationType.CREATE, notePath);
    } finally {
      setSavingNote(false);
    }
  }

  async function togglePinNote(note: ShiftNote) {
    if (!user) return;
    const notePath = `users/${user.uid}/triageNotes/${note.id}`;
    setNotesError(null);
    try {
      await updateDoc(doc(db, 'users', user.uid, 'triageNotes', note.id), {
        pinned: !note.pinned,
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      setNotesError('Unable to update shift note pin status.');
      handleFirestoreError(err, OperationType.UPDATE, notePath);
    }
  }

  async function deleteNote(noteId: string) {
    if (!user) return;
    const notePath = `users/${user.uid}/triageNotes/${noteId}`;
    setNotesError(null);
    try {
      await deleteDoc(doc(db, 'users', user.uid, 'triageNotes', noteId));
    } catch (err) {
      setNotesError('Unable to delete shift note.');
      handleFirestoreError(err, OperationType.DELETE, notePath);
    }
  }

  return (
    <div className="space-y-4">
      {/* Sub-Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Clinical AI Copilot &amp; Shift Workspace
          </h2>
          <p className="text-xs text-slate-500">
            Powered by Gemini 4 Hydrogen (Reasoning, Search &amp; Maps Grounding), Gemini 3.1 Flash Lite, and Gemini 3.8 Live Voice
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
          <button
            type="button"
            onClick={() => setSubTab('chat')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer ${
              subTab === 'chat' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-700" />
            <span>Multi-Turn Chat</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('voice')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer ${
              subTab === 'voice' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Volume2 className="w-3.5 h-3.5 text-teal-700" />
            <span>Live Voice</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('notes')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md inline-flex items-center gap-1.5 cursor-pointer ${
              subTab === 'notes' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <NotebookPen className="w-3.5 h-3.5 text-teal-700" />
            <span>Shift Notes ({notes.length})</span>
          </button>
        </div>
      </div>

      {subTab === 'chat' && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden flex flex-col h-[580px]">
          {/* Mode Selector */}
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 bg-slate-50/70">
            <div className="flex flex-wrap items-center gap-1.5">
              {MODE_OPTIONS.map((opt) => {
                const Icon = opt.icon;
                const active = mode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setMode(opt.id)}
                    className={`px-2.5 py-1.5 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                      active
                        ? 'bg-teal-700 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{opt.label}</span>
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] font-mono text-slate-500">
              {MODE_OPTIONS.find((m) => m.id === mode)?.modelNote}
            </span>
          </div>

          {/* Scrollable Message Thread */}
          <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-teal-700 text-white text-xs'
                      : 'bg-slate-50 border border-slate-200 text-slate-900'
                  }`}
                >
                  {msg.role === 'user' ? (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  ) : (
                    <SafeMarkdownBlock text={msg.text} />
                  )}

                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-slate-200 space-y-1.5">
                      <div className="text-[11px] font-semibold text-slate-700">
                        Verified Sources &amp; Places:
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.sources.map((src, idx) => (
                          <a
                            key={`${src.uri}-${idx}`}
                            href={src.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-teal-800 bg-white border border-teal-200 hover:bg-teal-50 rounded-md"
                          >
                            {src.type === 'maps' ? (
                              <MapPin className="w-3 h-3 shrink-0" />
                            ) : (
                              <Globe className="w-3 h-3 shrink-0" />
                            )}
                            <span className="truncate max-w-[210px]">{src.title}</span>
                            <ExternalLink className="w-3 h-3 shrink-0" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start">
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-500">
                  Generating clinical response...
                </div>
              </div>
            )}
          </div>

          {/* Quick Prompts + Composer */}
          <div className="p-3 border-t border-slate-200 bg-white space-y-2.5">
            <div className="flex flex-wrap gap-1.5">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  disabled={sending}
                  onClick={() => {
                    setMode(qp.mode);
                    void submitChat(qp.text, qp.mode);
                  }}
                  className="px-2.5 py-1 text-[11px] font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md cursor-pointer disabled:opacity-50"
                >
                  {qp.label}
                </button>
              ))}
            </div>

            {chatError && (
              <div className="px-3 py-1.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                {chatError}
              </div>
            )}

            <form onSubmit={handleFormSubmit} className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder="Ask about triage capacity, clinical protocols, DSA tracing, or nearby clinics..."
                className="flex-1 px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:border-teal-600"
              />
              <button
                type="submit"
                disabled={sending || !inputText.trim()}
                className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {subTab === 'voice' && (
        <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Hands-Free Live Voice Triage (Gemini 3.8 Live)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Real-time bidirectional 16kHz / 24kHz PCM voice conversation over WebSocket for hands-free ER coordination.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!voiceActive ? (
                <button
                  type="button"
                  disabled={voiceConnecting}
                  onClick={() => void startVoiceSession()}
                  className="px-4 py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <Mic className="w-4 h-4" />
                  <span>{voiceConnecting ? 'Connecting Audio...' : 'Start Voice Session'}</span>
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setVoiceMuted((m) => !m)}
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer border ${
                      voiceMuted
                        ? 'bg-amber-50 border-amber-300 text-amber-800'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {voiceMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    <span>{voiceMuted ? 'Mic Muted' : 'Mute Mic'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={stopVoiceSession}
                    className="px-3.5 py-2 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <PhoneOff className="w-4 h-4" />
                    <span>End Call</span>
                  </button>
                </>
              )}
            </div>
          </div>

          {voiceError && (
            <div className="px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800">
              {voiceError}
            </div>
          )}

          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 h-72 overflow-y-auto space-y-2.5">
            {voiceTranscripts.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-500 text-center">
                {voiceActive
                  ? 'Listening at 16kHz PCM... Speak naturally about triage capacity or emergency workflows.'
                  : 'Click "Start Voice Session" and grant microphone permission to speak directly with Gemini 3.8 Live.'}
              </div>
            ) : (
              voiceTranscripts.map((t) => (
                <div key={t.id} className="text-xs">
                  <span
                    className={`font-semibold mr-2 ${
                      t.speaker === 'You' ? 'text-slate-900' : 'text-teal-700'
                    }`}
                  >
                    {t.speaker}:
                  </span>
                  <span className="text-slate-700">{t.text}</span>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {subTab === 'notes' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <form
            onSubmit={handleCreateNote}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-semibold text-slate-900">
              Add Staff Shift Note (Firestore)
            </h3>
            <p className="text-[11px] text-slate-500">
              Operational checklists &amp; DSA observations only (no patient PII/PHI).
            </p>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Category</label>
              <select
                value={noteCategory}
                onChange={(e) => setNoteCategory(e.target.value as ShiftNote['category'])}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              >
                <option value="Shift Handoff">Shift Handoff</option>
                <option value="Surge Protocol">Surge Protocol</option>
                <option value="DSA Observation">DSA Observation</option>
                <option value="Equipment Check">Equipment Check</option>
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Title</label>
              <input
                type="text"
                required
                minLength={2}
                maxLength={120}
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                placeholder="e.g., Trauma Bay 2 Oxygen Check"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-700 mb-1">Details</label>
              <textarea
                required
                rows={4}
                maxLength={1000}
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                placeholder="Operational instructions for incoming shift..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
            {notesError && (
              <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
                {notesError}
              </div>
            )}
            <button
              type="submit"
              disabled={savingNote}
              className="w-full py-2 text-xs font-medium text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer disabled:opacity-50"
            >
              {savingNote ? 'Saving Note...' : 'Save to Firestore'}
            </button>
          </form>

          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">
                My Shift Checklists ({notes.length})
              </h3>
              <span className="text-[11px] text-slate-500">Owner-Isolated Rules</span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[440px] overflow-y-auto">
              {notes.length === 0 ? (
                <div className="p-6 text-xs text-slate-500">
                  No shift notes yet. Create an operational checklist on the left.
                </div>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="p-4 text-xs flex items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900">{n.title}</span>
                        <span className="px-2 py-0.5 text-[10px] font-medium rounded bg-slate-100 text-slate-700">
                          {n.category}
                        </span>
                      </div>
                      <p className="text-slate-600 whitespace-pre-wrap">{n.body}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => void togglePinNote(n)}
                        aria-label="Pin note"
                        className={`p-1.5 rounded cursor-pointer ${
                          n.pinned ? 'text-teal-700 bg-teal-50' : 'text-slate-400 hover:text-slate-700'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteNote(n.id)}
                        aria-label="Delete note"
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
