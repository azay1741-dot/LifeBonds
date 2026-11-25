import { GoogleGenAI, LiveServerMessage, Modality, ThinkingLevel } from '@google/genai';
import { Server as HttpServer } from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import { adminAuth } from '../src/lib/firebase-admin.ts';
import type { AiChatMode, GroundingSource, HospitalSnapshot } from '../src/types.ts';

const GEMINI_HEADERS = {
  'User-Agent': 'aistudio-build',
};

function getAiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: GEMINI_HEADERS },
  });
}

export interface ChatTurnInput {
  role: 'user' | 'model';
  text: string;
}

export interface RunChatOptions {
  mode: AiChatMode;
  message: string;
  history: ChatTurnInput[];
  latLng?: { latitude: number; longitude: number } | null;
  snapshotSummary?: HospitalSnapshot['summary'];
}

export async function runClinicalChat(opts: RunChatOptions): Promise<{
  text: string;
  modelUsed: string;
  sources: GroundingSource[];
}> {
  const ai = getAiClient();

  const anonymizedMetrics = opts.snapshotSummary
    ? `Live anonymized ER metrics: P1-P3 emergency waiting=${opts.snapshotSummary.emergencyWaitingCount} (P1 critical=${opts.snapshotSummary.criticalWaitingCount}), P4 walk-in waiting=${opts.snapshotSummary.standardWaitingCount}, active in treatment=${opts.snapshotSummary.inTreatmentCount}, available doctors=${opts.snapshotSummary.availableDoctorsCount}/${opts.snapshotSummary.totalDoctorsCount}, avg wait=${opts.snapshotSummary.avgWaitMinutes}m.`
    : '';

  const baseSystemInstruction =
    'You are the Lifebonds Clinical Operations & DSA Copilot. ' +
    'Help hospital staff with triage workflow guidance, P1-P4 acuity prioritization protocols, ' +
    'hospital capacity planning, Min-Heap / FIFO / Hash Map / Doubly Linked List algorithm questions, ' +
    'medical reference lookup, and non-emergency outpatient referral facility discovery. ' +
    'Always provide structured, concise Markdown with clear clinical safety disclaimers reminding users that final clinical decisions rest with licensed physicians. ' +
    anonymizedMetrics;

  const normalizedHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];
  for (const turn of opts.history.slice(-16)) {
    if (
      normalizedHistory.length > 0 &&
      normalizedHistory[normalizedHistory.length - 1].role === turn.role
    ) {
      normalizedHistory[normalizedHistory.length - 1].parts[0].text += `\n${turn.text}`;
    } else {
      normalizedHistory.push({
        role: turn.role,
        parts: [{ text: turn.text }],
      });
    }
  }
  if (
    normalizedHistory.length > 0 &&
    normalizedHistory[normalizedHistory.length - 1].role === 'user'
  ) {
    normalizedHistory.pop();
  }

  const contents = [
    ...normalizedHistory,
    { role: 'user' as const, parts: [{ text: opts.message }] },
  ];

  // Never use gemini-4-carbon or gemini-4-neon (paid key declined).
  // Use gemini-4-hydrogen (with ThinkingLevel.HIGH for reasoning) and gemini-3.1-flash-lite for fast mode.
  let modelUsed = 'gemini-4-hydrogen';
  const config: Record<string, unknown> = {
    systemInstruction: baseSystemInstruction,
  };

  if (opts.mode === 'fast') {
    modelUsed = 'gemini-3.1-flash-lite';
  } else if (opts.mode === 'reasoning') {
    modelUsed = 'gemini-4-hydrogen';
    config.thinkingConfig = {
      thinkingLevel: ThinkingLevel.HIGH,
    };
  } else if (opts.mode === 'search') {
    modelUsed = 'gemini-4-hydrogen';
    config.tools = [{ googleSearch: {} }];
  } else if (opts.mode === 'maps') {
    modelUsed = 'gemini-4-hydrogen';
    config.tools = [{ googleMaps: {} }];
    if (
      opts.latLng &&
      Number.isFinite(opts.latLng.latitude) &&
      Number.isFinite(opts.latLng.longitude)
    ) {
      config.toolConfig = {
        retrievalConfig: {
          latLng: {
            latitude: opts.latLng.latitude,
            longitude: opts.latLng.longitude,
          },
        },
      };
    }
  }

  const response = await ai.models.generateContent({
    model: modelUsed,
    contents,
    config,
  });

  const text = response.text ?? 'No response text was returned.';
  const rawChunks = (response.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) as Array<{
    web?: { uri?: string; title?: string };
    maps?: {
      uri?: string;
      title?: string;
      placeAnswerSources?: {
        reviewSnippets?: Array<{ uri?: string; title?: string; authorAttribution?: { displayName?: string } }>;
      };
    };
  }>;

  const sources: GroundingSource[] = [];
  const seenUris = new Set<string>();

  for (const chunk of rawChunks) {
    if (chunk.web?.uri && !seenUris.has(chunk.web.uri)) {
      seenUris.add(chunk.web.uri);
      sources.push({
        type: 'web',
        title: chunk.web.title || chunk.web.uri,
        uri: chunk.web.uri,
      });
    }
    if (chunk.maps?.uri && !seenUris.has(chunk.maps.uri)) {
      seenUris.add(chunk.maps.uri);
      const snippets = (chunk.maps.placeAnswerSources?.reviewSnippets ?? [])
        .map((s) => s.uri || s.title || '')
        .filter(Boolean);
      sources.push({
        type: 'maps',
        title: chunk.maps.title || 'Google Maps Place',
        uri: chunk.maps.uri,
        reviewSnippets: snippets.length > 0 ? snippets : undefined,
      });
    }
  }

  return { text, modelUsed, sources };
}

export function attachLiveVoiceWebSocket(
  httpServer: HttpServer,
  getSummary: () => Promise<HospitalSnapshot['summary'] | undefined>
): void {
  const wss = new WebSocketServer({ server: httpServer, path: '/api/live-voice' });

  wss.on('connection', (clientWs: WebSocket) => {
    let authenticated = false;
    let session: Awaited<ReturnType<GoogleGenAI['live']['connect']>> | null = null;
    let connecting = false;

    const sendJson = (payload: Record<string, unknown>) => {
      if (clientWs.readyState === WebSocket.OPEN) {
        clientWs.send(JSON.stringify(payload));
      }
    };

    const cleanup = () => {
      try {
        session?.close();
      } catch {
        // Ignore close errors
      }
      session = null;
    };

    clientWs.on('message', async (rawData) => {
      let msg: { type?: string; token?: string; audio?: string };
      try {
        msg = JSON.parse(rawData.toString());
      } catch {
        sendJson({ error: 'Invalid JSON frame' });
        return;
      }

      if (!authenticated) {
        if (msg.type !== 'auth' || typeof msg.token !== 'string' || !msg.token) {
          sendJson({ error: 'Authentication handshake required' });
          clientWs.close(4001, 'Unauthorized');
          return;
        }
        if (connecting) return;
        connecting = true;

        try {
          await adminAuth.verifyIdToken(msg.token);
          authenticated = true;

          const ai = getAiClient();
          const summary = await getSummary().catch(() => undefined);
          const summaryText = summary
            ? `Current anonymized ER floor load: ${summary.emergencyWaitingCount} emergency waiting (${summary.criticalWaitingCount} P1 critical), ${summary.standardWaitingCount} standard walk-ins, ${summary.inTreatmentCount} in treatment, ${summary.availableDoctorsCount} doctors available.`
            : '';

          session = await ai.live.connect({
            model: 'gemini-3.8-live',
            config: {
              responseModalities: [Modality.AUDIO],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
              },
              inputAudioTranscription: {},
              outputAudioTranscription: {},
              systemInstruction:
                'You are the hands-free Lifebonds Voice Assistant for emergency department nurses and triage coordinators. ' +
                'Keep spoken responses concise, calm, and structured for rapid listening during triage shifts. ' +
                summaryText,
            },
            callbacks: {
              onmessage: (message: LiveServerMessage) => {
                const content = message.serverContent;
                if (content?.inputTranscription?.text) {
                  sendJson({ inputTranscript: content.inputTranscription.text });
                }
                if (content?.outputTranscription?.text) {
                  sendJson({ outputTranscript: content.outputTranscription.text });
                }
                for (const part of content?.modelTurn?.parts ?? []) {
                  if (part.inlineData?.data) {
                    sendJson({ audio: part.inlineData.data });
                  }
                }
                if (content?.interrupted) {
                  sendJson({ interrupted: true });
                }
              },
              onerror: (err) => {
                console.error('Gemini Live API error:', err);
                sendJson({ error: 'Live voice stream encountered an error.' });
              },
              onclose: () => {
                sendJson({ closed: true });
              },
            },
          });

          sendJson({ ready: true });
        } catch (err) {
          console.error('Live voice auth/session failed:', err);
          sendJson({
            error: err instanceof Error ? err.message : 'Unable to start Gemini Live session.',
          });
          clientWs.close(4003, 'Session failed');
        } finally {
          connecting = false;
        }
        return;
      }

      if (typeof msg.audio === 'string' && msg.audio && session) {
        try {
          session.sendRealtimeInput({
            audio: { data: msg.audio, mimeType: 'audio/pcm;rate=16000' },
          });
        } catch (err) {
          console.error('Failed to forward audio frame:', err);
        }
      }
    });

    clientWs.on('close', cleanup);
    clientWs.on('error', cleanup);
  });
}
