import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { 
  Play, Pause, Download, Music, Sliders, RefreshCw, Trash2, Key, HelpCircle, 
  CheckCircle2, AlertCircle, Info, Sparkles, Volume2, Mic, Radio, Headphones, 
  Disc, AudioWaveform, Settings, X, Plus, ChevronDown, ChevronRight, Zap, RefreshCcw, SlidersHorizontal, Music2
} from 'lucide-react';

/**
 * Encodes an AudioBuffer into an uncompressed 16-bit PCM WAV Blob.
 */
function bufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  let result;
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const interleaved = new Float32Array(left.length + right.length);
    for (let src = 0, dst = 0; src < left.length; src++, dst += 2) {
      interleaved[dst] = left[src];
      interleaved[dst + 1] = right[src];
    }
    result = interleaved;
  } else {
    result = buffer.getChannelData(0);
  }

  const dataLength = result.length * (bitDepth / 8);
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + dataLength, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (raw) */
  view.setUint16(20, format, true);
  /* channel count */
  view.setUint16(22, numChannels, true);
  /* sample rate */
  view.setUint32(24, sampleRate, true);
  /* byte rate (sample rate * block align) */
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  /* block align (channel count * bytes per sample) */
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  /* bits per sample */
  view.setUint16(34, bitDepth, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, dataLength, true);

  /* Write 16-bit PCM samples */
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Client-side Web Audio DSP separation fallback.
 */
async function processLocalAudioSeparation(audioFile, onProgress) {
  console.log('[DEBUG-Local] Mulai pemisahan vokal lokal...');
  onProgress(20, 'Membaca file audio...');
  
  const arrayBuffer = await audioFile.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  onProgress(40, 'Mendekode data audio...');
  console.log('[DEBUG-Local] Mulai decodeAudioData...');
  const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  console.log('[DEBUG-Local] decodeAudioData selesai, durasi:', decodedBuffer.duration);

  const duration = decodedBuffer.duration;
  const sampleRate = decodedBuffer.sampleRate;

  // Process Vocal Track (Bandpass filter focusing on 300Hz - 3400Hz)
  onProgress(60, 'Mengekstrak trek vokal...');
  console.log('[DEBUG-Local] Mulai render vocal track...');
  const offlineCtxVocal = new OfflineAudioContext(decodedBuffer.numberOfChannels, duration * sampleRate, sampleRate);
  const srcVocal = offlineCtxVocal.createBufferSource();
  srcVocal.buffer = decodedBuffer;

  const bandpass = offlineCtxVocal.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1200;
  bandpass.Q.value = 0.8;

  srcVocal.connect(bandpass);
  bandpass.connect(offlineCtxVocal.destination);
  srcVocal.start(0);

  const renderedVocal = await offlineCtxVocal.startRendering();
  console.log('[DEBUG-Local] Vocal track selesai dirender');

  // Process Instrumental Track (Notch filter cutting vocals)
  onProgress(85, 'Mengekstrak trek instrumen...');
  console.log('[DEBUG-Local] Mulai render instrumental track...');
  const offlineCtxInst = new OfflineAudioContext(decodedBuffer.numberOfChannels, duration * sampleRate, sampleRate);
  const srcInst = offlineCtxInst.createBufferSource();
  srcInst.buffer = decodedBuffer;

  const notch = offlineCtxInst.createBiquadFilter();
  notch.type = 'notch';
  notch.frequency.value = 1200;
  notch.Q.value = 1.2;

  srcInst.connect(notch);
  notch.connect(offlineCtxInst.destination);
  srcInst.start(0);

  const renderedInst = await offlineCtxInst.startRendering();
  console.log('[DEBUG-Local] Instrumental track selesai dirender');

  onProgress(100, 'Pemisahan DSP lokal selesai!');
  
  const vocalBlob = bufferToWav(renderedVocal);
  const instBlob = bufferToWav(renderedInst);

  return {
    vocalUrl: URL.createObjectURL(vocalBlob),
    instrumentalUrl: URL.createObjectURL(instBlob)
  };
}

/**
 * Local Web Audio DSP Pitch Modification.
 */
async function convertVoiceLocal(vocalAudioSource, preset, onProgress) {
  console.log('[DEBUG-LocalVoice] Modifikasi pitch lokal:', preset);
  onProgress(30, 'Mempersiapkan efek pitch...');

  let arrayBuffer;
  if (typeof vocalAudioSource === 'string') {
    const res = await fetch(vocalAudioSource);
    arrayBuffer = await res.arrayBuffer();
  } else {
    arrayBuffer = await vocalAudioSource.arrayBuffer();
  }

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  onProgress(60, 'Mendekode vokal...');
  const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const duration = decodedBuffer.duration;
  const sampleRate = decodedBuffer.sampleRate;
  const offlineCtx = new OfflineAudioContext(decodedBuffer.numberOfChannels, duration * sampleRate, sampleRate);
  
  const src = offlineCtx.createBufferSource();
  src.buffer = decodedBuffer;

  /* Configure pitch detune / playback rate based on preset */
  switch (preset) {
    case 'up':
      src.detune.value = 300; // +3 semitones
      break;
    case 'down':
      src.detune.value = -300; // -3 semitones
      break;
    case 'chipmunk':
      src.detune.value = 700; // +7 semitones
      break;
    case 'deep':
      src.detune.value = -600; // -6 semitones
      break;
    case 'robot':
      src.detune.value = 0;
      break;
    default:
      src.detune.value = 0;
      break;
  }

  src.connect(offlineCtx.destination);
  src.start(0);

  onProgress(85, 'Menerapkan efek pitch...');
  const rendered = await offlineCtx.startRendering();
  onProgress(100, 'Efek pitch selesai diterapkan!');

  const blob = bufferToWav(rendered);
  return URL.createObjectURL(blob);
}

/**
 * Applies local genre/EQ DSP effects to instrumental audio.
 */
async function applyLocalStyleEffect(instAudioSource, genre, mood, tempo, pitch, onProgress) {
  onProgress(30, 'Mempersiapkan efek instrumen lokal...');

  let arrayBuffer;
  if (typeof instAudioSource === 'string') {
    const res = await fetch(instAudioSource);
    arrayBuffer = await res.arrayBuffer();
  } else {
    arrayBuffer = await instAudioSource.arrayBuffer();
  }

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const duration = decodedBuffer.duration;
  const sampleRate = decodedBuffer.sampleRate;
  const offlineCtx = new OfflineAudioContext(decodedBuffer.numberOfChannels, duration * sampleRate, sampleRate);

  const src = offlineCtx.createBufferSource();
  src.buffer = decodedBuffer;

  /* Playback Rate / Pitch adjustments */
  if (pitch) {
    src.detune.value = (pitch - 50) * 10; // -500 to +500 cents
  }

  const filter = offlineCtx.createBiquadFilter();
  if (genre === 'lofi') {
    filter.type = 'lowpass';
    filter.frequency.value = 2500;
  } else if (genre === 'edm') {
    filter.type = 'highshelf';
    filter.frequency.value = 4000;
    filter.gain.value = 4;
  } else if (genre === 'cyberpunk') {
    filter.type = 'bandpass';
    filter.frequency.value = 1500;
    filter.Q.value = 1.0;
  } else {
    filter.type = 'allpass';
  }

  src.connect(filter);
  filter.connect(offlineCtx.destination);
  src.start(0);

  onProgress(80, 'Menerapkan gaya instrumen...');
  const rendered = await offlineCtx.startRendering();
  onProgress(100, 'Efek instrumen selesai!');

  const blob = bufferToWav(rendered);
  return URL.createObjectURL(blob);
}

/**
 * Mixes two audio sources into a single WAV audio track.
 */
async function mixAudioTracks(vocalSource, instSource, onProgress) {
  console.log('[DEBUG-Mix] Mulai mixing trek vokal dan instrumen...');
  onProgress(20, 'Membaca trek vokal dan instrumen...');

  /* Fetch vocal buffer */
  let vocalBuf;
  if (typeof vocalSource === 'string') {
    const res = await fetch(vocalSource);
    const ab = await res.arrayBuffer();
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    vocalBuf = await actx.decodeAudioData(ab);
  } else {
    const ab = await vocalSource.arrayBuffer();
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    vocalBuf = await actx.decodeAudioData(ab);
  }

  /* Fetch instrumental buffer */
  let instBuf;
  if (typeof instSource === 'string') {
    const res = await fetch(instSource);
    const ab = await res.arrayBuffer();
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    instBuf = await actx.decodeAudioData(ab);
  } else {
    const ab = await instSource.arrayBuffer();
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    instBuf = await actx.decodeAudioData(ab);
  }

  onProgress(50, 'Menyesuaikan durasi dan volume...');
  const finalDuration = Math.min(vocalBuf.duration, instBuf.duration);
  const sampleRate = vocalBuf.sampleRate;

  const offlineCtx = new OfflineAudioContext(2, finalDuration * sampleRate, sampleRate);

  /* Vocal Source Node */
  const vocalSrcNode = offlineCtx.createBufferSource();
  vocalSrcNode.buffer = vocalBuf;
  const vocalGainNode = offlineCtx.createGain();
  vocalGainNode.gain.value = 1.0; // Vocal prominent
  vocalSrcNode.connect(vocalGainNode);
  vocalGainNode.connect(offlineCtx.destination);

  /* Instrumental Source Node */
  const instSrcNode = offlineCtx.createBufferSource();
  instSrcNode.buffer = instBuf;
  const instGainNode = offlineCtx.createGain();
  instGainNode.gain.value = 0.85; // Slightly lower instrumental
  instSrcNode.connect(instGainNode);
  instGainNode.connect(offlineCtx.destination);

  vocalSrcNode.start(0);
  instSrcNode.start(0);

  onProgress(80, 'Menggabungkan kedua trek...');
  const rendered = await offlineCtx.startRendering();
  console.log('[DEBUG-Mix] Mixing selesai, durasi:', rendered.duration);

  onProgress(100, 'Cover lagu selesai digabungkan!');
  const wavBlob = bufferToWav(rendered);
  return URL.createObjectURL(wavBlob);
}

/**
 * StemSplit.io Vocal Separation via Cloudflare Worker Proxy.
 */
async function separateVocalsStemSplit(audioFile, apiKey, onProgress) {
  console.log('[DEBUG-StemSplit] LANGKAH A: Request upload URL via proxy...');
  onProgress(10, 'Meminta permission upload ke StemSplit...');

  const uploadRes = await fetch('https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ filename: audioFile.name })
  });

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    throw new Error(`StemSplit Upload Error (HTTP ${uploadRes.status}): ${errText.slice(0, 200)}`);
  }

  const uploadData = await uploadRes.json();
  const { uploadUrl, uploadKey } = uploadData;

  console.log('[DEBUG-StemSplit] LANGKAH B: Uploading audio file via proxy...');
  onProgress(30, 'Mengunggah file audio ke StemSplit...');

  const proxyUploadUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-upload?target=${encodeURIComponent(uploadUrl)}`;
  const putRes = await fetch(proxyUploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': audioFile.type || 'audio/mpeg'
    },
    body: audioFile
  });

  if (!putRes.ok) {
    throw new Error(`Gagal mengunggah file ke StemSplit (HTTP ${putRes.status})`);
  }

  console.log('[DEBUG-StemSplit] LANGKAH C: Membuat job pemisahan...');
  onProgress(50, 'Mendaftarkan job pemisahan audio...');

  const jobRes = await fetch('https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/jobs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      uploadKey: uploadKey,
      outputType: 'BOTH',
      quality: 'BEST',
      outputFormat: 'MP3'
    })
  });

  if (!jobRes.ok) {
    const errText = await jobRes.text();
    throw new Error(`StemSplit Job Error (HTTP ${jobRes.status}): ${errText.slice(0, 200)}`);
  }

  const jobData = await jobRes.json();
  const jobId = jobData.id;

  console.log('[DEBUG-StemSplit] LANGKAH D: Polling status job ID:', jobId);
  let completed = false;
  let attempts = 0;
  let resultUrls = null;

  while (!completed && attempts < 40) {
    attempts++;
    await new Promise(r => setTimeout(r, 5000)); // Poll every 5s

    const pollRes = await fetch(`https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/jobs/${jobId}`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    console.log('[DEBUG-StemSplit] Polling response:', pollData);

    const progress = pollData.progress || 50;
    onProgress(50 + Math.floor((progress / 100) * 45), `Memisahkan trek (${progress}%)...`);

    if (pollData.status === 'COMPLETED') {
      completed = true;
      resultUrls = {
        vocalUrl: pollData.outputs?.vocals?.url || pollData.outputs?.vocal?.url,
        instrumentalUrl: pollData.outputs?.instrumental?.url || pollData.outputs?.backing?.url
      };
    } else if (pollData.status === 'FAILED') {
      throw new Error(`StemSplit Job Gagal: ${pollData.errorMessage || 'Unknown Error'}`);
    }
  }

  if (!resultUrls?.vocalUrl || !resultUrls?.instrumentalUrl) {
    throw new Error('StemSplit polling melebihi batas waktu (3 menit).');
  }

  onProgress(100, 'StemSplit selesai memisahkan trek!');
  return resultUrls;
}

/**
 * ElevenLabs Speech-to-Speech Voice Conversion via Proxy.
 */
async function convertVoiceElevenLabs(vocalAudioSource, voiceId, apiKey, onProgress) {
  console.log('[DEBUG-ElevenLabs] Memulai konversi vokal via proxy...');
  onProgress(20, 'Mengambil data file vokal...');

  let vocalBlob;
  if (typeof vocalAudioSource === 'string') {
    console.log('[DEBUG-ElevenLabs] Mengambil file vokal via proxy relay-fetch...');
    const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(vocalAudioSource)}`;
    const res = await fetch(proxiedUrl);
    vocalBlob = await res.blob();
  } else {
    vocalBlob = vocalAudioSource;
  }

  onProgress(40, 'Mengirim file vokal ke ElevenLabs...');
  const formData = new FormData();
  formData.append('audio', vocalBlob, 'vocal.wav');
  formData.append('model_id', 'eleven_multilingual_sts_v2');

  const res = await fetch(`https://stemsplit-proxy.kitakustik-managemen.workers.dev/elevenlabs/v1/speech-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey
    },
    body: formData
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs API Error (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }

  onProgress(90, 'Memproses audio hasil ElevenLabs...');
  const audioBlob = await res.blob();
  onProgress(100, 'Konversi vokal ElevenLabs selesai!');
  return URL.createObjectURL(audioBlob);
}

/**
 * Kie.ai AI Music Regeneration API (Model V4).
 */
async function regenerateInstrumentalApi(prompt, styleString, negativeTags, vocalGender, apiKey, onProgress) {
  console.log('[DEBUG-KieAI] Menghubungi Kie.ai API...');
  onProgress(15, 'Menghubungi Kie.ai API (Model V4)...');

  const promptText = prompt && prompt.trim() !== '' ? prompt : 'Custom instrumental cover track';

  /* Explicitly include model: "V4" in payload to prevent HTTP 422 null error */
  const payload = {
    customMode: true,
    model: 'V4',
    prompt: promptText,
    style: styleString || 'Acoustic, Calm',
    negativeTags: Array.isArray(negativeTags) ? negativeTags.join(', ') : (negativeTags || ''),
    title: 'Custom Style Cover',
    instrumental: true
  };

  if (vocalGender && vocalGender !== 'none') {
    payload.vocalGender = vocalGender;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  let res;
  try {
    res = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Request ke Kie.ai timeout setelah 30 detik.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Kie.ai API Error (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }

  const json = await res.json();

  /* Validate response code explicitly */
  if (json.code !== undefined && json.code !== 200) {
    throw new Error(`Kie.ai menolak: ${json.msg || `Terjadi kesalahan (Code ${json.code})`}`);
  }

  const taskId = json.data?.taskId || json.data?.id;
  if (!taskId) {
    throw new Error('Kie.ai tidak mengembalikan Task ID.');
  }

  let completed = false;
  let attempts = 0;
  let audioResultUrl = null;

  while (!completed && attempts < 25) {
    attempts++;
    onProgress(15 + Math.floor((attempts / 25) * 80), `Memproses musik AI (${attempts}/25)...`);
    
    await new Promise(r => setTimeout(r, 8000)); // Poll every 8s

    const pollController = new AbortController();
    const pollTimeout = setTimeout(() => pollController.abort(), 30000);
    
    let pollRes;
    try {
      pollRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        signal: pollController.signal
      });
    } catch (err) {
      console.warn('[DEBUG-KieAI] Polling timeout/error:', err);
      continue;
    } finally {
      clearTimeout(pollTimeout);
    }

    if (!pollRes.ok) continue;

    const pollJson = await pollRes.json();
    console.log('[DEBUG-KieAI] Polling response:', pollJson);

    const status = pollJson.data?.status || pollJson.status;
    
    if (status === 'SUCCESS') {
      completed = true;
      audioResultUrl = pollJson.data?.response?.sunoData?.[0]?.audioUrl 
        || pollJson.data?.audioUrl 
        || pollJson.data?.sunoData?.[0]?.audioUrl
        || pollJson.data?.response?.[0]?.audioUrl;
    } else if (status === 'CREATE_TASK_FAILED' || status === 'FAILED') {
      throw new Error(`Kie.ai pemrosesan gagal: ${pollJson.data?.failReason || 'Task Failed'}`);
    }
  }

  if (!audioResultUrl) {
    throw new Error('Polling Kie.ai melebihi batas waktu (3.5 menit).');
  }

  onProgress(100, 'Musik AI berhasil dibuat!');
  return audioResultUrl;
}

/**
 * Builds Suno Style string formatted for Kie.ai / Suno model.
 */
function buildSunoStyleString(genre, mood, instruments, tempo) {
  const parts = [];
  if (genre) parts.push(genre);
  if (mood) parts.push(mood);
  if (instruments && instruments.length > 0) parts.push(instruments.join(', '));
  if (tempo) parts.push(tempo);
  parts.push('high quality production');
  return parts.join(', ').slice(0, 200);
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [modalServiceTab, setModalServiceTab] = useState('stemsplit');

  /* Toast Notification state */
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((type, message) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 4);
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  /* Audio Upload State */
  const [audioFile, setAudioFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioDuration, setAudioDuration] = useState(0);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  /* Stem Separation State */
  const [isSeparating, setIsSeparating] = useState(false);
  const [separationProgress, setSeparationProgress] = useState(0);
  const [separationStatus, setSeparationStatus] = useState('');
  const [originalVocalUrl, setOriginalVocalUrl] = useState(null);
  const [originalInstrumentalUrl, setOriginalInstrumentalUrl] = useState(null);
  const [vocalSeparationEngine, setVocalSeparationEngine] = useState('stemsplit');

  /* Voice Conversion State (Panel 2A) */
  const [vocalMode, setVocalMode] = useState('pitch'); // 'pitch' or 'aivoice'
  const [pitchPreset, setPitchPreset] = useState('up');
  const [aiVoiceModel, setAiVoiceModel] = useState('');
  const [aiVoiceList, setAiVoiceList] = useState([
    { voice_id: 'preset_m_pop', name: 'Vokal Pria - Pop' },
    { voice_id: 'preset_f_jazz', name: 'Vokal Wanita - Jazz' },
    { voice_id: 'preset_m_robot', name: 'Vokal Robotik' },
    { voice_id: 'preset_child', name: 'Vokal Anak' }
  ]);
  const [convertedVocalUrl, setConvertedVocalUrl] = useState(null);
  const [isConvertingVoice, setIsConvertingVoice] = useState(false);
  const [voiceConversionProgress, setVoiceConversionProgress] = useState(0);
  const [voiceConversionStatus, setVoiceConversionStatus] = useState('');

  /* Style Adaptation State (Panel 2B) */
  const [styleMode, setStyleMode] = useState('fast'); // 'fast' or 'ai'
  const [fastGenre, setFastGenre] = useState('lofi');
  const [fastMood, setFastMood] = useState(50);
  const [fastTempo, setFastTempo] = useState(50);
  const [fastPitch, setFastPitch] = useState(50);

  /* AI Style Options */
  const [aiGenre, setAiGenre] = useState('Lo-Fi');
  const [aiMood, setAiMood] = useState('Calm');
  const [aiInstruments, setAiInstruments] = useState(['Piano']);
  const [aiVocalGender, setAiVocalGender] = useState('none');
  const [aiTempo, setAiTempo] = useState('Sedang (90-110 BPM)');
  const [aiNegativeTags, setAiNegativeTags] = useState([]);
  const [aiFreePrompt, setAiFreePrompt] = useState('');

  const [newInstrumentalUrl, setNewInstrumentalUrl] = useState(null);
  const [isRegeneratingStyle, setIsRegeneratingStyle] = useState(false);
  const [styleProgress, setStyleProgress] = useState(0);
  const [styleStatus, setStyleStatus] = useState('');

  /* Final Mixing State (Panel 3) */
  const [finalCoverUrl, setFinalCoverUrl] = useState(null);
  const [isMixing, setIsMixing] = useState(false);
  const [mixProgress, setMixProgress] = useState(0);
  const [mixStatusText, setMixStatusText] = useState('');

  /* API Keys State */
  const [apiKeys, setApiKeys] = useState({
    stemsplit: [],
    elevenlabs: [],
    kitsai: [],
    lalal: [],
    kieai: []
  });

  const [tempKeyInputs, setTempKeyInputs] = useState({
    stemsplit: '',
    elevenlabs: '',
    kitsai: '',
    lalal: '',
    kieai: ''
  });

  const [localFallbackInfo, setLocalFallbackInfo] = useState(null);

  useEffect(() => {
    setLoaded(true);
  }, []);

  /* Key Rotation & Availability Helpers */
  const getNextAvailableKey = useCallback((service) => {
    const serviceKeys = apiKeys[service] || [];
    return serviceKeys.find(k => k.status !== 'failed' && k.key.trim() !== '');
  }, [apiKeys]);

  const markKeyAsFailed = useCallback((service, keyString) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: (prev[service] || []).map(k => k.key === keyString ? { ...k, status: 'failed' } : k)
    }));
  }, []);

  /* Realtime Credit Verification */
  const checkCredit = useCallback(async (service, apiKey) => {
    if (!apiKey) return;
    try {
      if (service === 'elevenlabs') {
        const res = await fetch('https://stemsplit-proxy.kitakustik-managemen.workers.dev/elevenlabs/v1/user/subscription', {
          headers: { 'xi-api-key': apiKey }
        });
        if (res.ok) {
          const data = await res.json();
          const remaining = (data.character_limit || 10000) - (data.character_count || 0);
          const formatted = `${remaining.toLocaleString()} / ${(data.character_limit || 10000).toLocaleString()} char`;
          setApiKeys(prev => ({
            ...prev,
            elevenlabs: (prev.elevenlabs || []).map(k => k.key === apiKey ? { ...k, remainingCredit: formatted, lastChecked: new Date().toLocaleTimeString() } : k)
          }));
        }
      } else if (service === 'kieai') {
        const res = await fetch('https://api.kie.ai/api/v1/chat/credit', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (res.ok) {
          const resData = await res.json();
          if (resData.code === 200) {
            const creditNum = Number(resData.data);
            setApiKeys(prev => ({
              ...prev,
              kieai: (prev.kieai || []).map(k => k.key === apiKey ? { ...k, remainingCredit: `${creditNum} Kredit`, lastChecked: new Date().toLocaleTimeString() } : k)
            }));
          }
        }
      }
    } catch (err) {
      console.warn(`[DEBUG-Credit] Error checking credit for ${service}:`, err);
    }
  }, []);

  const handleSaveKey = (service) => {
    const val = tempKeyInputs[service]?.trim();
    if (!val) return;

    const newKeyObj = {
      id: Date.now().toString(),
      key: val,
      label: `Key ${ (apiKeys[service]?.length || 0) + 1 }`,
      status: 'standby',
      remainingCredit: null,
      lastChecked: null
    };

    setApiKeys(prev => ({
      ...prev,
      [service]: [...(prev[service] || []), newKeyObj]
    }));

    setTempKeyInputs(prev => ({ ...prev, [service]: '' }));
    addToast('info', 'Key berhasil disimpan!');
    checkCredit(service, val);
  };

  const handleDeleteKey = (service, keyId) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: (prev[service] || []).filter(k => k.id !== keyId)
    }));
  };

  const handleFileSelect = (file) => {
    if (!file) return;

    if (!file.type.includes('audio') && !file.name.endsWith('.mp3') && !file.name.endsWith('.wav')) {
      setUploadError('File harus berformat MP3 atau WAV!');
      addToast('error', 'Format file tidak didukung!');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setUploadError('Ukuran file melebihi batas maksimal 50MB!');
      addToast('error', 'Ukuran file terlalu besar!');
      return;
    }

    setUploadError(null);
    setAudioFile(file);

    if (audioUrl) URL.revokeObjectURL(audioUrl);
    const newUrl = URL.createObjectURL(file);
    setAudioUrl(newUrl);

    const tempAudio = new Audio(newUrl);
    tempAudio.onloadedmetadata = () => {
      setAudioDuration(tempAudio.duration);
    };

    addToast('info', `File "${file.name}" berhasil dimuat!`);
  };

  const generateSampleAudio = () => {
    const actx = new (window.AudioContext || window.webkitAudioContext)();
    const sampleRate = actx.sampleRate;
    const duration = 3;
    const buffer = actx.createBuffer(1, duration * sampleRate, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      data[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * Math.exp(-3 * (i / (sampleRate * duration)));
    }

    const wavBlob = bufferToWav(buffer);
    const file = new File([wavBlob], 'Sample-Audio-Demo.wav', { type: 'audio/wav' });
    handleFileSelect(file);
  };

  /* 1. Track Separation Handler */
  const handleStartVocalSeparation = async () => {
    if (!audioFile) return;

    setIsSeparating(true);
    setSeparationProgress(10);
    setSeparationStatus('Memulai pemisahan trek...');
    setLocalFallbackInfo(null);

    /* Priority 1: StemSplit.io */
    const stemSplitKey = getNextAvailableKey('stemsplit');
    if (stemSplitKey) {
      try {
        setVocalSeparationEngine('stemsplit');
        const res = await separateVocalsStemSplit(audioFile, stemSplitKey.key, (pct, msg) => {
          setSeparationProgress(pct);
          setSeparationStatus(msg);
        });
        setOriginalVocalUrl(res.vocalUrl);
        setOriginalInstrumentalUrl(res.instrumentalUrl);
        setIsSeparating(false);
        addToast('info', 'Pemisahan trek via StemSplit.io berhasil!');
        return;
      } catch (err) {
        console.warn('[DEBUG-Separation] StemSplit failed, rotating key/falling back...', err);
        markKeyAsFailed('stemsplit', stemSplitKey.key);
      }
    }

    /* Priority 2: Local DSP Fallback */
    try {
      setVocalSeparationEngine('local');
      setLocalFallbackInfo('ℹ️ Diproses via Engine DSP Lokal — API eksternal tidak dapat dijangkau.');
      const res = await processLocalAudioSeparation(audioFile, (pct, msg) => {
        setSeparationProgress(pct);
        setSeparationStatus(msg);
      });
      setOriginalVocalUrl(res.vocalUrl);
      setOriginalInstrumentalUrl(res.instrumentalUrl);
      addToast('warning', 'Diproses via DSP Lokal (Kualitas Standar).');
    } catch (err) {
      console.error('[DEBUG-Separation] Fatal DSP error:', err);
      addToast('error', 'Gagal memisahkan trek audio!');
    } finally {
      setIsSeparating(false);
    }
  };

  /* 2A. Voice Conversion Handler */
  const handleStartVoiceConversion = async () => {
    const sourceVocal = originalVocalUrl || audioUrl;
    if (!sourceVocal) return;

    setIsConvertingVoice(true);
    setVoiceConversionProgress(10);
    setVoiceConversionStatus('Memulai konversi vokal...');

    if (vocalMode === 'pitch') {
      try {
        const resUrl = await convertVoiceLocal(sourceVocal, pitchPreset, (pct, msg) => {
          setVoiceConversionProgress(pct);
          setVoiceConversionStatus(msg);
        });
        setConvertedVocalUrl(resUrl);
        addToast('info', 'Efek Pitch vokal berhasil diterapkan!');
      } catch (err) {
        console.warn('[DEBUG-Voice] Local Pitch Error:', err);
        addToast('error', 'Gagal menerapkan efek pitch vokal.');
      } finally {
        setIsConvertingVoice(false);
      }
      return;
    }

    /* AI Voice Conversion via ElevenLabs */
    const elKey = getNextAvailableKey('elevenlabs');
    if (elKey) {
      try {
        const targetVoiceId = aiVoiceModel || '21m00Tcm4TlvDq8ikWAM';
        const resUrl = await convertVoiceElevenLabs(sourceVocal, targetVoiceId, elKey.key, (pct, msg) => {
          setVoiceConversionProgress(pct);
          setVoiceConversionStatus(msg);
        });
        setConvertedVocalUrl(resUrl);
        addToast('info', 'Konversi vokal AI ElevenLabs berhasil!');
        setIsConvertingVoice(false);
        return;
      } catch (err) {
        console.warn('[DEBUG-Voice] ElevenLabs failed, applying local fallback:', err);
        markKeyAsFailed('elevenlabs', elKey.key);
      }
    }

    /* Fallback to local pitch */
    try {
      addToast('warning', 'Provider API menolak request (butuh langganan) — memakai Efek Pitch.');
      const resUrl = await convertVoiceLocal(sourceVocal, pitchPreset, (pct, msg) => {
        setVoiceConversionProgress(pct);
        setVoiceConversionStatus(msg);
      });
      setConvertedVocalUrl(resUrl);
    } catch (err) {
      console.error('[DEBUG-Voice] Fatal voice conversion error:', err);
      addToast('error', 'Gagal memproses vokal.');
    } finally {
      setIsConvertingVoice(false);
    }
  };

  /* 2B. Style Adaptation Handler */
  const handleStartStyleRegeneration = async () => {
    const sourceInst = originalInstrumentalUrl || audioUrl;

    setIsRegeneratingStyle(true);
    setStyleProgress(10);
    setStyleStatus('Mempersiapkan gaya instrumen...');

    if (styleMode === 'fast') {
      try {
        const resUrl = await applyLocalStyleEffect(sourceInst, fastGenre, fastMood, fastTempo, fastPitch, (pct, msg) => {
          setStyleProgress(pct);
          setStyleStatus(msg);
        });
        setNewInstrumentalUrl(resUrl);
        addToast('info', 'Efek Gaya instrumen instan berhasil diterapkan!');
      } catch (err) {
        console.warn('[DEBUG-Style] Fast Local Style Error:', err);
        addToast('error', 'Gagal menerapkan gaya instrumen.');
      } finally {
        setIsRegeneratingStyle(false);
      }
      return;
    }

    /* Mode B: Kie.ai AI Music Generation */
    const kieKey = getNextAvailableKey('kieai');
    if (kieKey) {
      try {
        const styleString = buildSunoStyleString(aiGenre, aiMood, aiInstruments, aiTempo);
        const resUrl = await regenerateInstrumentalApi(
          aiFreePrompt,
          styleString,
          aiNegativeTags,
          aiVocalGender,
          kieKey.key,
          (pct, msg) => {
            setStyleProgress(pct);
            setStyleStatus(msg);
          }
        );
        setNewInstrumentalUrl(resUrl);
        addToast('info', 'Musik AI Kie.ai berhasil dibuat!');
        setIsRegeneratingStyle(false);
        return;
      } catch (err) {
        console.warn('[DEBUG-Style] Kie.ai failed, falling back to local effect:', err);
        markKeyAsFailed('kieai', kieKey.key);
      }
    }

    /* Fallback to Fast Local Mode */
    try {
      addToast('warning', 'Regenerasi AI tidak dapat dijangkau, memakai Efek Cepat.');
      const resUrl = await applyLocalStyleEffect(sourceInst, fastGenre, fastMood, fastTempo, fastPitch, (pct, msg) => {
        setStyleProgress(pct);
        setStyleStatus(msg);
      });
      setNewInstrumentalUrl(resUrl);
    } catch (err) {
      console.error('[DEBUG-Style] Fatal style regeneration error:', err);
      addToast('error', 'Gagal memproses gaya instrumen.');
    } finally {
      setIsRegeneratingStyle(false);
    }
  };

  /* 3. Final Audio Mixing Handler */
  const handleStartFinalMixing = async () => {
    const vocalSource = convertedVocalUrl || originalVocalUrl || audioUrl;
    const instSource = newInstrumentalUrl || originalInstrumentalUrl || audioUrl;

    if (!vocalSource || !instSource) {
      addToast('error', 'Membutuhkan trek vokal dan instrumen untuk digabungkan!');
      return;
    }

    setIsMixing(true);
    setMixProgress(10);
    setMixStatusText('Mulai proses penggabungan cover...');

    try {
      const mixedUrl = await mixAudioTracks(vocalSource, instSource, (pct, msg) => {
        setMixProgress(pct);
        setMixStatusText(msg);
      });
      setFinalCoverUrl(mixedUrl);
      addToast('info', 'Cover lagu final siap diunduh!');
    } catch (err) {
      console.error('[DEBUG-Mix] Mix Error:', err);
      addToast('error', 'Gagal menggabungkan audio, coba ulangi tahap sebelumnya.');
    } finally {
      setIsMixing(false);
    }
  };

  /* Generated Suno Style String Preview */
  const liveStylePreview = useMemo(() => {
    return buildSunoStyleString(aiGenre, aiMood, aiInstruments, aiTempo);
  }, [aiGenre, aiMood, aiInstruments, aiTempo]);

  return (
    <div className={`min-h-screen bg-[#0a0118] text-slate-100 font-sans transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* Background Studio Grid & Waveform Ambient Overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-5 bg-[radial-gradient(#22d3ee_1px,transparent_1px)] [background-size:24px_24px]" />

      {/* Floating Toast Notification Stack */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`p-3 rounded-xl border backdrop-blur-md shadow-lg flex items-center justify-between text-sm transition-all ${
              t.type === 'error' ? 'bg-red-900/80 border-red-500/50 text-red-200' :
              t.type === 'warning' ? 'bg-amber-900/80 border-amber-500/50 text-amber-200' :
              'bg-cyan-950/80 border-cyan-500/50 text-cyan-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {t.type === 'error' ? <AlertCircle className="w-4 h-4 text-red-400" /> :
               t.type === 'warning' ? <AlertCircle className="w-4 h-4 text-amber-400" /> :
               <Info className="w-4 h-4 text-cyan-400" />}
              <span>{t.message}</span>
            </div>
            <button onClick={() => removeToast(t.id)} className="text-slate-400 hover:text-white p-1">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Header Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-xl bg-[#0a0118]/80 border-b border-cyan-500/20 px-4 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-pink-500 p-0.5 shadow-[0_0_15px_rgba(34,211,238,0.3)]">
              <div className="w-full h-full bg-slate-950 rounded-[10px] flex items-center justify-center">
                <AudioWaveform className="w-5 h-5 text-cyan-400 animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="font-display font-bold text-lg md:text-xl tracking-tight bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400 bg-clip-text text-transparent">
                AGE YT#5 Musik Cover
              </h1>
              <p className="text-xs text-slate-400 font-mono hidden sm:block">AI Music Remixer & Voice Studio</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowHelpModal(true)}
              className="p-2 rounded-xl bg-slate-900/80 border border-slate-700/60 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-400 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
            >
              <HelpCircle className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">Bantuan</span>
            </button>

            <button 
              onClick={() => setShowApiKeyModal(true)}
              className="p-2 rounded-xl bg-slate-900/80 border border-slate-700/60 hover:border-pink-500/50 text-slate-300 hover:text-pink-400 text-xs font-medium flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Settings className="w-4 h-4 text-pink-400" />
              <span className="hidden sm:inline">API Key</span>
            </button>
          </div>

        </div>
      </header>

      {/* Main Studio Body */}
      <main className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {}
        {/* PANEL 1: Upload Lagu */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 md:p-5 backdrop-blur-xl shadow-xl transition-all hover:border-slate-700">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                <Music className="w-5 h-5" />
              </div>
              <h2 className="font-display font-semibold text-base md:text-lg text-slate-100">1. Upload Lagu Sumber</h2>
            </div>
            {audioFile && (
              <span className="text-xs font-mono px-2.5 py-1 rounded-full bg-cyan-950 border border-cyan-500/30 text-cyan-300">
                {(audioFile.size / (1024 * 1024)).toFixed(2)} MB
              </span>
            )}
          </div>

          {!audioFile ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-700 hover:border-cyan-500/60 rounded-xl p-8 text-center cursor-pointer bg-slate-950/40 hover:bg-slate-900/40 transition-all group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={e => handleFileSelect(e.target.files?.[0])}
                accept="audio/mp3,audio/wav"
                className="hidden" 
              />
              <Headphones className="w-10 h-10 mx-auto mb-3 text-slate-500 group-hover:text-cyan-400 transition-colors" />
              <p className="text-sm font-medium text-slate-200">Tarik & Lepas File Audio (.mp3, .wav) di Sini</p>
              <p className="text-xs text-slate-500 mt-1">Maksimal ukuran file 50MB</p>
              
              <div className="mt-4 flex items-center justify-center gap-3">
                <button type="button" className="px-4 py-2 rounded-xl bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 text-xs font-semibold hover:bg-cyan-500/30 transition-all">
                  Pilih File Audio
                </button>
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); generateSampleAudio(); }}
                  className="px-3 py-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40 text-xs font-semibold hover:bg-purple-500/30 transition-all flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> 🧪 Tes Lagu Contoh
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-slate-950/60 rounded-xl p-4 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 overflow-hidden">
                  <Disc className="w-8 h-8 text-pink-400 animate-spin-slow flex-shrink-0" />
                  <div className="truncate">
                    <p className="text-sm font-semibold text-slate-200 truncate">{audioFile.name}</p>
                    <p className="text-xs font-mono text-slate-400">Durasi: {Math.floor(audioDuration / 60)}:{(Math.floor(audioDuration % 60)).toString().padStart(2, '0')}s</p>
                  </div>
                </div>

                <button 
                  onClick={() => { setAudioFile(null); setAudioUrl(null); }}
                  className="px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-xs hover:bg-red-500/20 transition-all flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Ganti
                </button>
              </div>

              {audioUrl && (
                <audio controls src={audioUrl} className="w-full h-9 rounded-lg opacity-90" />
              )}
            </div>
          )}

          {uploadError && (
            <p className="mt-2 text-xs text-red-400 flex items-center gap-1">
              <AlertCircle className="w-3.5 h-3.5" /> {uploadError}
            </p>
          )}
        </section>

        {}
        {/* PANEL 2: Pemisahan Trek & Pengaturan */}
        <section className={`bg-slate-900/60 border border-slate-800 rounded-2xl p-4 md:p-5 backdrop-blur-xl shadow-xl transition-all ${!audioFile ? 'opacity-50 pointer-events-none' : ''}`}>
          
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400">
              <SlidersHorizontal className="w-5 h-5" />
            </div>
            <h2 className="font-display font-semibold text-base md:text-lg text-slate-100">2. Pemisahan Trek & Pengaturan Suara</h2>
          </div>

          {/* Step 2A: Pemisahan Trek */}
          <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 mb-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-cyan-300 flex items-center gap-2">
                <AudioWaveform className="w-4 h-4" /> Langkah Awal: Pisahkan Trek Audio
              </h3>
              {vocalSeparationEngine === 'local' && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-950 border border-amber-500/30 text-amber-300">
                  DSP Lokal Active
                </span>
              )}
            </div>

            <button
              onClick={handleStartVocalSeparation}
              disabled={isSeparating || !audioFile}
              className="w-full py-3 px-4 rounded-xl font-semibold text-sm bg-gradient-to-r from-cyan-500 to-pink-500 hover:from-cyan-400 hover:to-pink-400 text-slate-950 shadow-[0_0_20px_rgba(34,211,238,0.25)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSeparating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" /> {separationStatus} ({separationProgress}%)
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Pisahkan Vokal & Instrumen
                </>
              )}
            </button>

            {/* Explanatory Info Box */}
            <div className="p-3 rounded-lg bg-cyan-950/30 border border-cyan-500/20 text-xs text-cyan-200/80 flex items-start gap-2">
              <Info className="w-4 h-4 text-cyan-400 flex-shrink-0 mt-0.5" />
              <p>
                <strong>Kenapa harus dipisah dulu?</strong> Lagu asli Anda berisi vokal dan instrumen yang menyatu. Supaya cover akhir bersih, vokal perlu dicabut dari lagu asli.
              </p>
            </div>

            {/* Audio Stem Players */}
            {(originalVocalUrl || originalInstrumentalUrl) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <p className="text-xs font-semibold text-cyan-300 mb-2 flex items-center gap-1.5">
                    <Mic className="w-3.5 h-3.5" /> Vokal Asli Saja
                  </p>
                  <audio controls src={originalVocalUrl} className="w-full h-8" />
                </div>

                <div className="bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                  <p className="text-xs font-semibold text-pink-300 mb-2 flex items-center gap-1.5">
                    <Radio className="w-3.5 h-3.5" /> Instrumental Asli Saja
                  </p>
                  <audio controls src={originalInstrumentalUrl} className="w-full h-8" />
                </div>
              </div>
            )}
          </div>

          {/* Sub-panels 2A & 2B */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            
            {/* Panel 2A: Ubah Karakter Vokal */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <Mic className="w-4 h-4 text-cyan-400" /> 2A. Ubah Karakter Vokal
                </h3>

                {/* Mode Toggle */}
                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                  <button 
                    onClick={() => setVocalMode('pitch')}
                    className={`px-2.5 py-1 rounded-md transition-all ${vocalMode === 'pitch' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400'}`}
                  >
                    🎚️ Pitch (Gratis)
                  </button>
                  <button 
                    onClick={() => setVocalMode('aivoice')}
                    className={`px-2.5 py-1 rounded-md transition-all ${vocalMode === 'aivoice' ? 'bg-pink-500 text-slate-950 font-semibold' : 'text-slate-400'}`}
                  >
                    ✨ AI Voice
                  </button>
                </div>
              </div>

              {vocalMode === 'pitch' ? (
                <div className="space-y-3">
                  <label className="text-xs text-slate-300 block">Pilihan Preset Pitch:</label>
                  <select 
                    value={pitchPreset} 
                    onChange={e => setPitchPreset(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="up">Pitch Naik (Ringan)</option>
                    <option value="down">Pitch Turun (Ringan)</option>
                    <option value="chipmunk">Nada Tinggi (Chipmunk)</option>
                    <option value="deep">Nada Rendah (Berat)</option>
                    <option value="robot">Robotik / Netral</option>
                  </select>
                  <p className="text-[11px] text-slate-500">
                    Mode ini mengubah pitch vokal instan di browser tanpa memerlukan API key.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="p-2.5 rounded-lg bg-amber-950/30 border border-amber-500/20 text-[11px] text-amber-200/80">
                    ⚠️ Fitur AI Voice membutuhkan API Key ElevenLabs / Kits.AI yang valid.
                  </div>

                  <label className="text-xs text-slate-300 block">Pilih Model Suara AI:</label>
                  <select 
                    value={aiVoiceModel} 
                    onChange={e => setAiVoiceModel(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-slate-200 focus:border-pink-500 focus:outline-none"
                  >
                    {aiVoiceList.map(v => (
                      <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <button
                onClick={handleStartVoiceConversion}
                disabled={isConvertingVoice || (!originalVocalUrl && !audioUrl)}
                className="w-full py-2.5 rounded-lg text-xs font-semibold bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isConvertingVoice ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                Proses Ubah Vokal
              </button>

              {convertedVocalUrl && (
                <div className="pt-2">
                  <p className="text-xs font-semibold text-cyan-300 mb-1">Vokal Baru (Hasil Modifikasi):</p>
                  <audio controls src={convertedVocalUrl} className="w-full h-8" />
                </div>
              )}
            </div>

            {/* Panel 2B: Ubah Gaya Musik */}
            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <Radio className="w-4 h-4 text-pink-400" /> 2B. Ubah Gaya Musik
                </h3>

                <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800 text-[11px]">
                  <button 
                    onClick={() => setStyleMode('fast')}
                    className={`px-2.5 py-1 rounded-md transition-all ${styleMode === 'fast' ? 'bg-cyan-500 text-slate-950 font-semibold' : 'text-slate-400'}`}
                  >
                    ⚡ Gratis
                  </button>
                  <button 
                    onClick={() => setStyleMode('ai')}
                    className={`px-2.5 py-1 rounded-md transition-all ${styleMode === 'ai' ? 'bg-pink-500 text-slate-950 font-semibold' : 'text-slate-400'}`}
                  >
                    🤖 AI Kie.ai
                  </button>
                </div>
              </div>

              {styleMode === 'fast' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] text-slate-400">Genre:</label>
                      <select 
                        value={fastGenre} 
                        onChange={e => setFastGenre(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200"
                      >
                        <option value="lofi">Lo-Fi</option>
                        <option value="edm">EDM</option>
                        <option value="acoustic">Acoustic</option>
                        <option value="cyberpunk">Cyberpunk</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] text-slate-400">Pitch Shift:</label>
                      <input 
                        type="range" min="0" max="100" value={fastPitch} 
                        onChange={e => setFastPitch(Number(e.target.value))}
                        className="w-full accent-cyan-400" 
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-slate-400 block mb-1">Genre:</label>
                      <select value={aiGenre} onChange={e => setAiGenre(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-slate-200">
                        {['Pop', 'Rock', 'Jazz', 'Hip-Hop', 'Electronic/EDM', 'Classical', 'Lo-Fi', 'Acoustic', 'R&B'].map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-slate-400 block mb-1">Mood:</label>
                      <select value={aiMood} onChange={e => setAiMood(e.target.value)} className="w-full bg-slate-900 border border-slate-700 rounded p-1 text-slate-200">
                        {['Calm', 'Energetic', 'Happy', 'Sad', 'Dreamy', 'Dark', 'Epic'].map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-400 block mb-1">Deskripsi Tambahan (Prompt):</label>
                    <textarea 
                      value={aiFreePrompt} 
                      onChange={e => setAiFreePrompt(e.target.value)}
                      placeholder="e.g. Acoustic guitar cover with soft drum brush..."
                      className="w-full h-14 bg-slate-900 border border-slate-700 rounded p-1.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500"
                    />
                  </div>

                  <div className="p-2 rounded bg-slate-900 border border-slate-800 text-[10px] font-mono text-cyan-300">
                    Preview: {liveStylePreview}
                  </div>
                </div>
              )}

              <button
                onClick={handleStartStyleRegeneration}
                disabled={isRegeneratingStyle || (!originalInstrumentalUrl && !audioUrl)}
                className="w-full py-2.5 rounded-lg text-xs font-semibold bg-pink-500/20 border border-pink-500/40 text-pink-300 hover:bg-pink-500/30 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isRegeneratingStyle ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                Proses Ubah Gaya
              </button>

              {newInstrumentalUrl && (
                <div className="pt-2">
                  <p className="text-xs font-semibold text-pink-300 mb-1">Instrumental Baru:</p>
                  <audio controls src={newInstrumentalUrl} className="w-full h-8" />
                </div>
              )}
            </div>

          </div>
        </section>

        {}
        {/* PANEL 3: Mix & Hasil Cover Final */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 md:p-5 backdrop-blur-xl shadow-xl transition-all">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400">
              <Disc className="w-5 h-5" />
            </div>
            <h2 className="font-display font-semibold text-base md:text-lg text-slate-100">3. Mix & Hasil Cover Final</h2>
          </div>

          {/* Pipeline Tracker Indicator */}
          <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-slate-800 mb-4 text-xs font-mono">
            <span className={audioFile ? 'text-cyan-400' : 'text-slate-600'}>1. Upload</span>
            <span className="text-slate-600">→</span>
            <span className={originalVocalUrl ? 'text-cyan-400' : 'text-slate-600'}>2. Pisah Trek</span>
            <span className="text-slate-600">→</span>
            <span className={convertedVocalUrl || newInstrumentalUrl ? 'text-pink-400' : 'text-slate-600'}>3. Vokal & Gaya</span>
            <span className="text-slate-600">→</span>
            <span className={finalCoverUrl ? 'text-emerald-400' : 'text-slate-600'}>4. Mix Cover</span>
          </div>

          <button
            onClick={handleStartFinalMixing}
            disabled={isMixing || (!originalVocalUrl && !convertedVocalUrl && !audioUrl)}
            className="w-full py-3.5 px-4 rounded-xl font-bold text-sm bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:opacity-90 text-slate-950 shadow-[0_0_25px_rgba(236,72,153,0.3)] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isMixing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" /> {mixStatusText} ({mixProgress}%)
              </>
            ) : (
              <>
                <Music2 className="w-4 h-4" /> Gabungkan & Buat Cover Final
              </>
            )}
          </button>

          <p className="text-[11px] text-slate-500 text-center mt-2">
            Bagian yang belum diproses akan memakai versi asli lagu Anda secara otomatis.
          </p>

          {/* Final Cover Output Player & Download Button */}
          {finalCoverUrl && (
            <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 to-pink-950/40 border border-cyan-500/40 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-cyan-300 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Hasil Cover Lagu Anda (.WAV)
                </span>
                
                <a 
                  href={finalCoverUrl} 
                  download={`AGE-YT5-Cover-${audioFile?.name || 'Track'}.wav`}
                  className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 font-bold text-xs hover:bg-cyan-400 transition-all flex items-center gap-1.5 shadow-[0_0_15px_rgba(34,211,238,0.4)]"
                >
                  <Download className="w-4 h-4" /> Download WAV
                </a>
              </div>

              <audio controls src={finalCoverUrl} className="w-full h-10" />
            </div>
          )}
        </section>

      </main>

      {}
      {/* API KEY SETTINGS MODAL */}
      {showApiKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-display font-semibold text-base text-slate-100 flex items-center gap-2">
                <Settings className="w-5 h-5 text-pink-400" /> Pengaturan API Key
              </h3>
              <button onClick={() => setShowApiKeyModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Service Tabs */}
            <div className="flex gap-1 overflow-x-auto pb-1 text-xs border-b border-slate-800">
              {[
                { id: 'stemsplit', name: 'StemSplit.io' },
                { id: 'elevenlabs', name: 'ElevenLabs' },
                { id: 'kitsai', name: 'Kits.AI' },
                { id: 'lalal', name: 'LALAL.AI' },
                { id: 'kieai', name: 'Kie.ai' }
              ].map(s => (
                <button 
                  key={s.id}
                  onClick={() => setModalServiceTab(s.id)}
                  className={`px-3 py-1.5 rounded-lg whitespace-nowrap font-medium transition-all ${modalServiceTab === s.id ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {s.name}
                </button>
              ))}
            </div>

            {/* Tab Body */}
            <div className="space-y-3 py-2">
              <div className="flex items-center gap-2">
                <input 
                  type="password"
                  placeholder={`Masukkan ${modalServiceTab.toUpperCase()} API Key...`}
                  value={tempKeyInputs[modalServiceTab] || ''}
                  onChange={e => setTempKeyInputs(prev => ({ ...prev, [modalServiceTab]: e.target.value }))}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:border-pink-500 focus:outline-none font-mono"
                />
                <button 
                  onClick={() => handleSaveKey(modalServiceTab)}
                  className="px-4 py-2 rounded-xl bg-pink-500 text-slate-950 font-semibold text-xs hover:bg-pink-400 transition-all"
                >
                  💾 Simpan
                </button>
              </div>

              {/* Saved Key List */}
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {(apiKeys[modalServiceTab] || []).map((k, idx) => (
                  <div key={k.id} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${idx === 0 && k.status !== 'failed' ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/30' : k.status === 'failed' ? 'bg-red-950 text-red-400 border border-red-500/30' : 'bg-slate-800 text-slate-400'}`}>
                        {idx === 0 && k.status !== 'failed' ? '🟢 AKTIF' : k.status === 'failed' ? '🔴 Gagal' : '⚪ Standby'}
                      </span>
                      <span className="text-slate-300">{k.key.slice(0, 6)}...{k.key.slice(-4)}</span>
                      {k.remainingCredit && <span className="text-cyan-400">({k.remainingCredit})</span>}
                    </div>

                    <button onClick={() => handleDeleteKey(modalServiceTab, k.id)} className="text-slate-500 hover:text-red-400">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-slate-500">
              API key disimpan sementara di browser Anda dan tidak dikirim ke server luar selain penyedia API terkait.
            </p>

          </div>
        </div>
      )}

      {/* HELP MODAL */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-xl w-full p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-display font-semibold text-base text-slate-100 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-cyan-400" /> Panduan & FAQ
              </h3>
              <button onClick={() => setShowHelpModal(false)} className="text-slate-400 hover:text-white p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <h4 className="font-semibold text-cyan-300">Cara Mendapatkan API Key Gratis:</h4>
              <ul className="list-disc pl-4 space-y-1 text-slate-400">
                <li><strong>StemSplit.io:</strong> Daftar gratis untuk mendapat 5 menit kredit pemisahan vokal.</li>
                <li><strong>ElevenLabs:</strong> 10.000 karakter gratis/bulan di elevenlabs.io.</li>
                <li><strong>Kie.ai:</strong> Kredit gratis awal untuk generasi musik AI di kie.ai.</li>
              </ul>

              <h4 className="font-semibold text-cyan-300 pt-2">Alur Kerja 4 Langkah:</h4>
              <p className="text-slate-400">1. Upload Lagu → 2. Pisahkan Trek → 3. Modifikasi Vokal & Gaya → 4. Mix Cover Final.</p>
            </div>

          </div>
        </div>
      )}

      {/* Footer Disclaimer */}
      <footer className="max-w-6xl mx-auto px-4 py-8 border-t border-slate-900 text-center text-[11px] text-slate-600 space-y-1">
        <p>AGE YT#5 Musik Cover — Studio Remixer AI & DSP Lokal</p>
        <p>Biaya penggunaan API sepenuhnya ditanggung pengguna lewat API Key masing-masing. Gunakan hasil cover sesuai lisensi/hak cipta platform Anda.</p>
      </footer>

    </div>
  );
}