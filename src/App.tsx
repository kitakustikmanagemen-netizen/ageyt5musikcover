import React, { useState, useEffect, useRef } from 'react';
import {
  Music,
  Upload,
  Settings,
  Play,
  Pause,
  Trash2,
  RefreshCw,
  Plus,
  X,
  Check,
  AlertCircle,
  Info,
  Sliders,
  Wand2,
  Sparkles,
  Mic2,
  FileAudio,
  RotateCcw,
  Volume2,
  Download,
  AudioLines,
  Activity,
  CheckCircle2,
  AlertTriangle,
  FlaskConical,
  HelpCircle,
  ExternalLink,
  BookOpen,
  MessageSquare,
  Key
} from 'lucide-react';

// Animated Neon Equalizer Component for active AI / DSP processing states
const EqualizerBars = () => (
  <div className="flex items-end justify-center gap-1.5 h-6 my-1.5">
    <span className="w-1 bg-cyan-400 rounded-full animate-[bounce_0.8s_infinite_100ms] h-full shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
    <span className="w-1 bg-purple-500 rounded-full animate-[bounce_0.8s_infinite_300ms] h-3/4 shadow-[0_0_8px_rgba(168,85,247,0.8)]" />
    <span className="w-1 bg-pink-500 rounded-full animate-[bounce_0.8s_infinite_200ms] h-full shadow-[0_0_8px_rgba(236,72,153,0.8)]" />
    <span className="w-1 bg-cyan-300 rounded-full animate-[bounce_0.8s_infinite_400ms] h-1/2 shadow-[0_0_8px_rgba(103,232,249,0.8)]" />
    <span className="w-1 bg-pink-400 rounded-full animate-[bounce_0.8s_infinite_150ms] h-5/6 shadow-[0_0_8px_rgba(244,114,182,0.8)]" />
  </div>
);

// Utility function to encode AudioBuffer to playable WAV Blob in client browser
function bufferToWav(buffer) {
  const numOfChan = buffer.numberOfChannels;
  const length = buffer.length * numOfChan * 2 + 44;
  const out = new DataView(new ArrayBuffer(length));
  let channels = [];
  let sampleRate = buffer.sampleRate;
  let offset = 0;
  let pos = 0;

  function writeString(str) {
    for (let i = 0; i < str.length; i++) {
      out.setUint8(pos++, str.charCodeAt(i));
    }
  }

  function setUint16(data) {
    out.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    out.setUint32(pos, data, true);
    pos += 4;
  }

  writeString('RIFF');
  setUint32(length - 8);
  writeString('WAVE');
  writeString('fmt ');
  setUint32(16);
  setUint16(1);
  setUint16(numOfChan);
  setUint32(sampleRate);
  setUint32(sampleRate * 2 * numOfChan);
  setUint16(numOfChan * 2);
  setUint16(16);

  writeString('data');
  setUint32(length - pos - 4);

  for (let i = 0; i < buffer.numberOfChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  while (offset < buffer.length) {
    for (let i = 0; i < numOfChan; i++) {
      let sample = Math.max(-1, Math.min(1, channels[i][offset]));
      sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0;
      out.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([out], { type: 'audio/wav' });
}

async function mixAudioTracks(vocalUrl, instrumentalUrl, onProgressUpdate = () => {}) {
  console.log('[DEBUG-Mix] Memulai proses penggabungan audio track...');
  onProgressUpdate(10, 'Membaca track vokal dan instrumen...');

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  onProgressUpdate(25, 'Mengunduh/membaca buffer vokal...');
  const vocalRes = await fetch(vocalUrl);
  const vocalArrayBuf = await vocalRes.arrayBuffer();

  onProgressUpdate(45, 'Mengunduh/membaca buffer instrumen...');
  const instRes = await fetch(instrumentalUrl);
  const instArrayBuf = await instRes.arrayBuffer();

  onProgressUpdate(60, 'Mengurai (decode) data audio...');
  console.log('[DEBUG-Mix] Decode vocal AudioBuffer...');
  const vocalBuf = await audioCtx.decodeAudioData(vocalArrayBuf);
  console.log('[DEBUG-Mix] Decode instrumental AudioBuffer...');
  const instBuf = await audioCtx.decodeAudioData(instArrayBuf);

  // Equalize duration: crop to shorter duration to avoid silence or length mismatch
  const minDuration = Math.min(vocalBuf.duration, instBuf.duration);
  const sampleRate = Math.max(vocalBuf.sampleRate, instBuf.sampleRate);
  const renderLength = Math.floor(minDuration * sampleRate);
  const numChannels = Math.max(vocalBuf.numberOfChannels, instBuf.numberOfChannels);

  console.log('[DEBUG-Mix] Durasi vokal:', vocalBuf.duration, 's, instrumen:', instBuf.duration, 's. Durasi mixing:', minDuration, 's');

  onProgressUpdate(75, 'Mencampur (mixing) vokal & instrumen via OfflineAudioContext...');
  const offlineCtx = new OfflineAudioContext(numChannels, renderLength, sampleRate);

  // Vocal Track Source & Gain (1.0 = 100% Volume for prominent vocals)
  const vocalSource = offlineCtx.createBufferSource();
  vocalSource.buffer = vocalBuf;
  const vocalGain = offlineCtx.createGain();
  vocalGain.gain.value = 1.0;
  vocalSource.connect(vocalGain);
  vocalGain.connect(offlineCtx.destination);

  // Instrumental Track Source & Gain (0.85 = 85% Volume so vocals cut through cleanly)
  const instSource = offlineCtx.createBufferSource();
  instSource.buffer = instBuf;
  const instGain = offlineCtx.createGain();
  instGain.gain.value = 0.85;
  instSource.connect(instGain);
  instGain.connect(offlineCtx.destination);

  vocalSource.start(0);
  instSource.start(0);

  console.log('[DEBUG-Mix] Start rendering mixed AudioBuffer...');
  onProgressUpdate(90, 'Merender audio final WAV...');
  const renderedBuffer = await offlineCtx.startRendering();

  console.log('[DEBUG-Mix] Rendering selesai. Mengonversi ke WAV blob...');
  const wavBlob = bufferToWav(renderedBuffer);
  const mixedUrl = URL.createObjectURL(wavBlob);

  onProgressUpdate(100, 'Penggabungan lagu selesai!');
  console.log('[DEBUG-Mix] Penggabungan audio berhasil!');

  return mixedUrl;
}

async function processLocalAudioSeparation(audioFileOrUrl, onProgressUpdate) {
  console.log('[DEBUG-Local] Memulai pemisahan audio DSP lokal...');
  onProgressUpdate(10, 'Membaca file audio...');

  let arrayBuffer;
  if (typeof audioFileOrUrl === 'string') {
    const res = await fetch(audioFileOrUrl);
    arrayBuffer = await res.arrayBuffer();
  } else {
    arrayBuffer = await audioFileOrUrl.arrayBuffer();
  }

  console.log('[DEBUG-Local] Mulai decodeAudioData...');
  onProgressUpdate(30, 'Mengurai buffer audio...');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  console.log('[DEBUG-Local] decodeAudioData selesai, durasi:', audioBuffer.duration, 'detik');

  console.log('[DEBUG-Local] Mulai render vocal track (bandpass)...');
  onProgressUpdate(55, 'Memisahkan pita frekuensi vokal...');
  const offlineVocalCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  const vocalSource = offlineVocalCtx.createBufferSource();
  vocalSource.buffer = audioBuffer;

  const biquadVocal = offlineVocalCtx.createBiquadFilter();
  biquadVocal.type = 'bandpass';
  biquadVocal.frequency.value = 1500;
  biquadVocal.Q.value = 0.9;

  vocalSource.connect(biquadVocal);
  biquadVocal.connect(offlineVocalCtx.destination);
  vocalSource.start(0);

  const renderedVocalBuffer = await offlineVocalCtx.startRendering();
  console.log('[DEBUG-Local] Vocal track selesai dirender');
  const vocalBlob = bufferToWav(renderedVocalBuffer);
  const vocalUrl = URL.createObjectURL(vocalBlob);

  console.log('[DEBUG-Local] Mulai render instrumental track (notch)...');
  onProgressUpdate(80, 'Memisahkan aransemen instrumen...');
  const offlineInstCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  const instSource = offlineInstCtx.createBufferSource();
  instSource.buffer = audioBuffer;

  const biquadInst = offlineInstCtx.createBiquadFilter();
  biquadInst.type = 'notch';
  biquadInst.frequency.value = 1500;
  biquadInst.Q.value = 1.2;

  instSource.connect(biquadInst);
  biquadInst.connect(offlineInstCtx.destination);
  instSource.start(0);

  const renderedInstBuffer = await offlineInstCtx.startRendering();
  console.log('[DEBUG-Local] Instrumental track selesai dirender');
  const instBlob = bufferToWav(renderedInstBuffer);
  const instrumentalUrl = URL.createObjectURL(instBlob);

  console.log('[DEBUG-Local] Pemisahan track lokal selesai dengan sukses!');
  onProgressUpdate(100, 'Pemisahan track lokal selesai dengan sukses!');

  return {
    vocalUrl,
    instrumentalUrl,
    isLocalFallback: true
  };
}

const STATIC_VOICE_MODELS = [
  { id: 'male-pop', name: 'Vokal Pria - Pop', description: 'Suara pria pop kontemporer dengan artikulasi bersih' },
  { id: 'female-jazz', name: 'Vokal Wanita - Jazz', description: 'Suara wanita bernuansa jazz hangat & lembut' },
  { id: 'robotic', name: 'Vokal Robotik', description: 'Efek vokal sintetis, resonansi cyberpunk & futuristik' },
  { id: 'child', name: 'Vokal Anak', description: 'Suara vokal anak-anak bernada tinggi & ceria' }
];

async function getUrlAsFile(url, fileName = 'vocal_stem.wav') {
  const res = await fetch(url);
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type || 'audio/wav' });
}

async function convertVoiceLocal(audioFileOrUrl, effectType, onProgressUpdate) {
  console.log('[DEBUG-VoiceConv] Memulai konversi vokal DSP lokal dengan efek:', effectType);
  onProgressUpdate(20, 'Membaca stem vokal untuk modulasi lokal...');

  let arrayBuffer;
  if (typeof audioFileOrUrl === 'string') {
    const res = await fetch(audioFileOrUrl);
    arrayBuffer = await res.arrayBuffer();
  } else {
    arrayBuffer = await audioFileOrUrl.arrayBuffer();
  }

  onProgressUpdate(45, 'Mengurai buffer audio & menerapkan modulasi nada...');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  if (effectType === 'child' || effectType === 'female-jazz') {
    source.playbackRate.value = 1.25;
  } else if (effectType === 'male-pop') {
    source.playbackRate.value = 0.82;
  } else if (effectType === 'robotic') {
    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = 1800;
    filter.Q.value = 8;
    filter.gain.value = 15;
    source.connect(filter);
    filter.connect(offlineCtx.destination);
  } else {
    source.playbackRate.value = 1.05;
  }

  if (effectType !== 'robotic') {
    source.connect(offlineCtx.destination);
  }

  source.start(0);

  onProgressUpdate(80, 'Merender audio vokal yang dimodifikasi...');
  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = bufferToWav(renderedBuffer);
  const convertedUrl = URL.createObjectURL(wavBlob);

  onProgressUpdate(100, 'Modulasi vokal lokal selesai!');
  console.log('[DEBUG-VoiceConv] Konversi vokal DSP lokal selesai dengan sukses!');

  return {
    convertedUrl,
    isLocalFallback: false
  };
}

async function applyLocalStyleEffect(audioFileOrUrl, genre, moodValue = 50, tempoValue = 1.0, pitchValue = 0, onProgressUpdate = () => {}) {
  console.log('[DEBUG-StyleLocal] Memulai efek gaya instrumen lokal:', { genre, moodValue, tempoValue, pitchValue });
  onProgressUpdate(20, 'Membaca stem instrumen...');

  let arrayBuffer;
  if (typeof audioFileOrUrl === 'string') {
    const res = await fetch(audioFileOrUrl);
    arrayBuffer = await res.arrayBuffer();
  } else {
    arrayBuffer = await audioFileOrUrl.arrayBuffer();
  }

  onProgressUpdate(40, 'Mengurai audio buffer & menerapkan efek EQ, tempo, & pitch...');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const targetDuration = audioBuffer.duration / Math.max(0.5, tempoValue);
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    Math.ceil(audioBuffer.sampleRate * targetDuration),
    audioBuffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = tempoValue;
  if (pitchValue !== 0) {
    source.detune.value = pitchValue * 100;
  }

  let lastNode = source;

  if (genre === 'lofi') {
    const lofiFilter = offlineCtx.createBiquadFilter();
    lofiFilter.type = 'lowpass';
    lofiFilter.frequency.value = 2200;
    lofiFilter.Q.value = 1.2;
    lastNode.connect(lofiFilter);
    lastNode = lofiFilter;
  } else if (genre === 'edm') {
    const bassFilter = offlineCtx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 100;
    bassFilter.gain.value = 6;

    const trebleFilter = offlineCtx.createBiquadFilter();
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 7000;
    trebleFilter.gain.value = 4;

    lastNode.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    lastNode = trebleFilter;
  } else if (genre === 'cyberpunk') {
    const cyberpunkFilter = offlineCtx.createBiquadFilter();
    cyberpunkFilter.type = 'bandpass';
    cyberpunkFilter.frequency.value = 1400;
    cyberpunkFilter.Q.value = 1.0;

    const delayNode = offlineCtx.createDelay();
    delayNode.delayTime.value = 0.18;

    const feedbackGain = offlineCtx.createGain();
    feedbackGain.gain.value = 0.35;

    lastNode.connect(cyberpunkFilter);
    cyberpunkFilter.connect(delayNode);
    delayNode.connect(feedbackGain);
    feedbackGain.connect(delayNode);

    const dryGain = offlineCtx.createGain();
    dryGain.gain.value = 0.8;
    cyberpunkFilter.connect(dryGain);

    dryGain.connect(offlineCtx.destination);
    delayNode.connect(offlineCtx.destination);
    lastNode = null;
  } else {
    const acousticFilter = offlineCtx.createBiquadFilter();
    acousticFilter.type = 'highpass';
    acousticFilter.frequency.value = 70;
    lastNode.connect(acousticFilter);
    lastNode = acousticFilter;
  }

  if (lastNode) {
    const moodFilter = offlineCtx.createBiquadFilter();
    moodFilter.type = 'peaking';
    moodFilter.frequency.value = 3000;
    moodFilter.gain.value = (moodValue - 50) / 10;
    lastNode.connect(moodFilter);
    moodFilter.connect(offlineCtx.destination);
  }

  source.start(0);

  onProgressUpdate(80, 'Merender audio instrumen dengan gaya baru...');
  const renderedBuffer = await offlineCtx.startRendering();
  const wavBlob = bufferToWav(renderedBuffer);
  const newInstrumentalUrl = URL.createObjectURL(wavBlob);

  onProgressUpdate(100, 'Efek gaya instrumen selesai!');
  console.log('[DEBUG-StyleLocal] Render instrumen gaya selesai!');

  return {
    newInstrumentalUrl,
    isLocalFallback: true
  };
}

async function regenerateInstrumentalApi(promptText, apiKey, onProgressUpdate) {
  console.log('[DEBUG-KieAI] Mengirim POST ke https://api.kie.ai/api/v1/generate...');
  onProgressUpdate(15, 'Mengirim prompt ke Kie.ai AI Music Generator...');

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 30000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request timeout (${Math.round(timeoutMs / 1000)}s)`);
      }
      throw err;
    }
  };

  try {
    const payload = {
      prompt: promptText,
      customMode: false,
      instrumental: true,
      model: "V4"
    };

    const response = await fetchWithTimeout('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    }, 30000);

    console.log('[DEBUG-KieAI] Response status:', response.status);

    if (!response.ok) {
      let bodyText = '';
      try { bodyText = await response.text(); } catch (e) { bodyText = 'Gagal membaca body'; }
      console.warn(`[DEBUG-KieAI] POST NOT OK (${response.status}):`, bodyText);
      throw new Error(`Kie.ai API Error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
    }

    const resJson = await response.json();
    console.log('[DEBUG-KieAI] Full response:', resJson);

    if (resJson && resJson.code !== 200 && resJson.code !== 0 && resJson.msg) {
      throw new Error(`Kie.ai error: ${resJson.msg}`);
    }

    const taskId = resJson?.data?.taskId || resJson?.data?.id || resJson?.taskId || resJson?.id;
    if (!taskId) {
      throw new Error('Gagal mendapatkan taskId dari response Kie.ai');
    }

    console.log('[DEBUG-KieAI] Task ID diterima:', taskId);
    onProgressUpdate(25, 'Task dibuat. Memulai polling musik AI (interval 8s)...');

    let completed = false;
    let pollCount = 0;
    const MAX_POLLS = 25;
    let resultData = null;

    while (!completed) {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        throw new Error('Polling musik AI melebihi batas waktu 25x (~3.5 menit)');
      }

      await new Promise(resolve => setTimeout(resolve, 8000));
      const currentProgress = Math.min(95, 25 + Math.floor((pollCount / MAX_POLLS) * 70));
      onProgressUpdate(currentProgress, `Memproduksi musik AI Kie.ai (Polling #${pollCount}/25)...`);

      console.log(`[DEBUG-KieAI] Polling ke-${pollCount}, mengirim GET...`);
      const statusRes = await fetchWithTimeout(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
      }, 30000);

      if (!statusRes.ok) {
        let errBody = '';
        try { errBody = await statusRes.text(); } catch (e) {}
        console.warn(`[DEBUG-KieAI] Polling ke-${pollCount} NOT OK:`, errBody);
        throw new Error(`Polling status Kie.ai gagal (HTTP ${statusRes.status})`);
      }

      const statusJson = await statusRes.json();
      console.log(`[DEBUG-KieAI] Polling ke-${pollCount}, status response:`, statusJson);

      const statusVal = statusJson?.data?.status || statusJson?.status || statusJson?.data?.state;

      if (statusVal === 'SUCCESS' || statusVal === 'COMPLETED' || statusVal === 'TEXT_SUCCESS') {
        const sunoData = statusJson?.data?.response?.sunoData || statusJson?.data?.sunoData || statusJson?.sunoData || statusJson?.data;
        let audioUrl = null;

        if (Array.isArray(sunoData) && sunoData.length > 0) {
          audioUrl = sunoData[0]?.audioUrl || sunoData[0]?.audio_url || sunoData[0]?.streamAudioUrl;
        } else if (typeof sunoData === 'object' && sunoData !== null) {
          audioUrl = sunoData.audioUrl || sunoData.audio_url;
        }

        if (audioUrl) {
          console.log('[DEBUG-KieAI] Audio URL berhasil didapatkan:', audioUrl);
          completed = true;
          resultData = audioUrl;
        } else if (statusVal === 'SUCCESS') {
          console.warn('[DEBUG-KieAI] Status SUCCESS tapi URL belum ditemukan, polling lagi...');
        }
      } else if (statusVal === 'CREATE_TASK_FAILED' || statusVal === 'FAILED' || statusVal === 'ERROR') {
        throw new Error(`Generasi musik Kie.ai gagal: ${statusVal}`);
      }
    }

    onProgressUpdate(100, 'Generasi musik AI Kie.ai selesai!');
    return {
      newInstrumentalUrl: resultData,
      isLocalFallback: false
    };
  } catch (err) {
    console.warn('[DEBUG-KieAI] Exception di regenerateInstrumentalApi:', err.name, err.message);
    throw err;
  }
}

async function convertVoiceApi(vocalFile, voiceModelId, apiKey, onProgressUpdate) {
  console.log('[DEBUG-VoiceConv] Mengirim POST ke voice-conversions...');
  onProgressUpdate(15, 'Mengirim stem vokal ke Kits.AI...');

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 90000) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error(`Request timeout setelah ${Math.round(timeoutMs / 1000)}s`);
      }
      throw err;
    }
  };

  const formData = new FormData();
  formData.append('voiceModelId', voiceModelId);
  formData.append('soundFile', vocalFile);

  const response = await fetchWithTimeout('https://arpeggi.io/api/kits/v1/voice-conversions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
    body: formData
  }, 90000);

  if (!response.ok) {
    let bodyText = '';
    try { bodyText = await response.text(); } catch (e) { bodyText = 'Gagal membaca body'; }
    console.warn(`[DEBUG-VoiceConv] POST NOT OK (${response.status}):`, bodyText);
    throw new Error(`Voice conversion error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
  }

  const jobData = await response.json();
  const jobId = jobData.id || jobData.jobId;
  if (!jobId) throw new Error('Gagal mendapatkan Job ID konversi vokal dari Kits.AI');

  console.log('[DEBUG-VoiceConv] Job ID diterima:', jobId);
  onProgressUpdate(25, 'Job dibuat. Polling konversi vokal...');

  let completed = false;
  let pollCount = 0;
  const MAX_POLLS = 40;
  let resultData = null;

  while (!completed) {
    pollCount++;
    if (pollCount > MAX_POLLS) throw new Error('Polling konversi vokal melebihi batas waktu');

    await new Promise(resolve => setTimeout(resolve, 3000));
    const currentProgress = Math.min(95, 25 + Math.floor((pollCount / MAX_POLLS) * 70));
    onProgressUpdate(currentProgress, `Memproses konversi vokal (Polling #${pollCount})...`);

    const statusRes = await fetchWithTimeout(`https://arpeggi.io/api/kits/v1/voice-conversions/${jobId}`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
    }, 45000);

    if (!statusRes.ok) throw new Error(`Polling status konversi gagal (HTTP ${statusRes.status})`);

    const statusData = await statusRes.json();
    console.log('[DEBUG-VoiceConv] Full response statusData:', statusData);

    if (statusData.status === 'success') {
      completed = true;
      resultData = statusData;
    } else if (statusData.status === 'error' || statusData.status === 'cancelled') {
      throw new Error(`Konversi vokal gagal di server: ${statusData.status}`);
    }
  }

  onProgressUpdate(100, 'Konversi vokal AI selesai!');
  const convertedUrl = resultData.outputFileUrl || resultData.audioFileUrl || resultData.outputUrl;
  if (!convertedUrl) throw new Error('Response konversi vokal sukses tetapi URL hasil tidak ditemukan');

  return {
    convertedUrl,
    isLocalFallback: false
  };
}

export default function App() {
  // Page Animation State
  const [loaded, setLoaded] = useState(false);

  // Modal Dialog States
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [helpTab, setHelpTab] = useState('keys'); // 'keys' | 'workflow' | 'faq'

  // Toast Notifications State
  const [toasts, setToasts] = useState([]);

  const addToast = (type, title, message) => {
    const id = Date.now() + Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { id, type, title, message }]);

    // Auto-dismiss after 6 seconds
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // Audio Upload State
  const [uploadedFile, setUploadedFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [isGeneratingSample, setIsGeneratingSample] = useState(false);
  const fileInputRef = useRef(null);

  // API Key Management State
  const [apiKeys, setApiKeys] = useState({
    kitsai: [],
    elevenlabs: [],
    lalal: [],
    kieai: []
  });

  const [newKeyInput, setNewKeyInput] = useState({
    service: 'kitsai',
    key: '',
    label: ''
  });

  // Sample Audio Generator for Testing
  const handleLoadSampleAudio = async () => {
    setIsGeneratingSample(true);
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const sampleRate = 44100;
      const duration = 3; // 3 seconds sample
      const offlineCtx = new OfflineAudioContext(1, sampleRate * duration, sampleRate);

      // Play a short synth C-major arpeggio
      const osc = offlineCtx.createOscillator();
      const gain = offlineCtx.createGain();
      osc.type = 'sine';

      const now = 0;
      osc.frequency.setValueAtTime(261.63, now);       // C4
      osc.frequency.setValueAtTime(329.63, now + 0.75); // E4
      osc.frequency.setValueAtTime(392.00, now + 1.50); // G4
      osc.frequency.setValueAtTime(523.25, now + 2.25); // C5

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, duration - 0.05);

      osc.connect(gain);
      gain.connect(offlineCtx.destination);
      osc.start(0);
      osc.stop(duration);

      const renderedBuffer = await offlineCtx.startRendering();
      const wavBlob = bufferToWav(renderedBuffer);
      const sampleFile = new File([wavBlob], 'Sample_Lagu_Tes_3s.wav', { type: 'audio/wav' });

      processSelectedFile(sampleFile);
      addToast('info', 'Lagu Contoh Dimuat', 'Lagu sintesis contoh 3 detik berhasil dibuat untuk pengujian cepat.');
    } catch (err) {
      console.warn('Gagal membuat lagu contoh:', err);
      addToast('error', 'Gagal Membuat Sample', 'Sistem browser gagal merender nada contoh.');
    } finally {
      setIsGeneratingSample(false);
    }
  };

  // Vocal Separation State
  const [isSeparating, setIsSeparating] = useState(false);
  const [separationProgress, setSeparationProgress] = useState(0);
  const [separationStep, setSeparationStep] = useState('');
  const [separatedVocalsUrl, setSeparatedVocalsUrl] = useState(null);
  const [separatedInstUrl, setSeparatedInstUrl] = useState(null);
  const [separationError, setSeparationError] = useState(null);
  const [isUsingLocalFallback, setIsUsingLocalFallback] = useState(false);

  // Voice Conversion & Models State
  const [voiceModels, setVoiceModels] = useState(STATIC_VOICE_MODELS);
  const [selectedVoiceModel, setSelectedVoiceModel] = useState(STATIC_VOICE_MODELS[0].id);
  const [isLoadingVoiceModels, setIsLoadingVoiceModels] = useState(false);
  const [isVoiceModelFallback, setIsVoiceModelFallback] = useState(true);
  const [isConvertingVoice, setIsConvertingVoice] = useState(false);
  const [voiceConversionProgress, setVoiceConversionProgress] = useState(0);
  const [voiceConversionStep, setVoiceConversionStep] = useState('');
  const [convertedVocalUrl, setConvertedVocalUrl] = useState(null);
  const [voiceConversionError, setVoiceConversionError] = useState(null);
  const [isVoiceLocalFallback, setIsVoiceLocalFallback] = useState(false);

  // Style & Instrumental Regeneration State
  const [styleMode, setStyleMode] = useState('fast');
  const [selectedGenre, setSelectedGenre] = useState('lofi');
  const [selectedMood, setSelectedMood] = useState(50);
  const [tempoSpeed, setTempoSpeed] = useState(1.0);
  const [pitchOffset, setPitchOffset] = useState(0);
  const [aiPrompt, setAiPrompt] = useState('jazz santai dengan piano dan brush drum');
  const [isRegeneratingInst, setIsRegeneratingInst] = useState(false);
  const [instRegenProgress, setInstRegenProgress] = useState(0);
  const [instRegenStep, setInstRegenStep] = useState('');
  const [newInstrumentalUrl, setNewInstrumentalUrl] = useState(null);
  const [instRegenError, setInstRegenError] = useState(null);
  const [isInstLocalFallback, setIsInstLocalFallback] = useState(false);

  // Final Cover Mixing State
  const [isMixing, setIsMixing] = useState(false);
  const [mixProgress, setMixProgress] = useState(0);
  const [mixStep, setMixStep] = useState('');
  const [finalMixedCoverUrl, setFinalMixedCoverUrl] = useState(null);
  const [mixError, setMixError] = useState(null);

  useEffect(() => {
    setLoaded(true);

    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (separatedVocalsUrl) URL.revokeObjectURL(separatedVocalsUrl);
      if (separatedInstUrl) URL.revokeObjectURL(separatedInstUrl);
      if (convertedVocalUrl) URL.revokeObjectURL(convertedVocalUrl);
      if (newInstrumentalUrl && newInstrumentalUrl.startsWith('blob:')) URL.revokeObjectURL(newInstrumentalUrl);
      if (finalMixedCoverUrl) URL.revokeObjectURL(finalMixedCoverUrl);
    };
  }, []);

  const loadKitsVoiceModels = async () => {
    setIsLoadingVoiceModels(true);
    let loadedModels = null;

    const availableKeys = (apiKeys.kitsai || []).filter(k => k.status !== 'failed');
    if (availableKeys.length > 0) {
      for (const keyObj of availableKeys) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000);
          const res = await fetch('https://arpeggi.io/api/kits/v1/voice-models', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${keyObj.key.trim()}` },
            signal: controller.signal
          });
          clearTimeout(timeoutId);

          if (res.ok) {
            const json = await res.json();
            if (json && Array.isArray(json.data) && json.data.length > 0) {
              loadedModels = json.data.map(m => ({
                id: m.id,
                name: m.name || `Model #${m.id}`,
                description: m.description || 'Kits.AI Voice Model'
              }));
              break;
            }
          }
        } catch (e) {
          console.warn('[DEBUG-VoiceModels] Gagal mengambil voice models dari Kits.AI:', e.message);
        }
      }
    }

    if (loadedModels) {
      setVoiceModels(loadedModels);
      setSelectedVoiceModel(loadedModels[0].id);
      setIsVoiceModelFallback(false);
    } else {
      setVoiceModels(STATIC_VOICE_MODELS);
      setSelectedVoiceModel(STATIC_VOICE_MODELS[0].id);
      setIsVoiceModelFallback(true);
    }
    setIsLoadingVoiceModels(false);
  };

  useEffect(() => {
    if (separatedVocalsUrl) {
      loadKitsVoiceModels();
    }
  }, [separatedVocalsUrl, apiKeys.kitsai]);

  const checkCredit = async (service, keyObj) => {
    const keyToTest = keyObj.key.trim();
    let updatedQuotaInfo = '';
    let statusFlag = 'ok';

    try {
      if (service === 'elevenlabs') {
        const response = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
          method: 'GET',
          headers: { 'xi-api-key': keyToTest }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const limit = data.character_limit || 0;
        const used = data.character_count || 0;
        const remaining = Math.max(0, limit - used);

        updatedQuotaInfo = `${remaining.toLocaleString()} / ${limit.toLocaleString()} karakter`;
        if (remaining <= 0) statusFlag = 'failed';
        else if (remaining < limit * 0.2) statusFlag = 'warning';
      } else if (service === 'kieai') {
        const response = await fetch('https://api.kie.ai/api/v1/chat/credit', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${keyToTest}` }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const resData = await response.json();

        if (resData && resData.code === 200 && typeof resData.data === 'number') {
          const creditVal = resData.data;
          updatedQuotaInfo = `${creditVal.toLocaleString()} kredit`;
          if (creditVal <= 0) statusFlag = 'failed';
          else if (creditVal < 20) statusFlag = 'warning';
        } else if (resData && resData.msg) {
          throw new Error(resData.msg);
        } else {
          throw new Error('Format response Kie.ai tidak sesuai');
        }
      } else {
        updatedQuotaInfo = 'Tidak tersedia via API — cek manual di dashboard';
        statusFlag = 'manual';
      }
    } catch (err) {
      statusFlag = 'failed';
      updatedQuotaInfo = err.message || 'Gagal memeriksa kredit';
    }

    setApiKeys(prev => ({
      ...prev,
      [service]: prev[service].map(k =>
        k.key === keyObj.key
          ? {
              ...k,
              remainingCredit: updatedQuotaInfo,
              status: statusFlag,
              lastChecked: new Date().toLocaleTimeString()
            }
          : k
      )
    }));
  };

  const markKeyAsFailed = (service, keyString, reasonMessage) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: prev[service].map(k =>
        k.key === keyString
          ? {
              ...k,
              status: 'failed',
              remainingCredit: reasonMessage || '🔴 Gagal / Key Error',
              lastChecked: new Date().toLocaleTimeString()
            }
          : k
      )
    }));
  };

  const handleAddKey = async () => {
    if (!newKeyInput.key.trim()) return;

    const newKeyObj = {
      key: newKeyInput.key.trim(),
      label: newKeyInput.label.trim() || `Key ${apiKeys[newKeyInput.service].length + 1}`,
      remainingCredit: 'Memeriksa...',
      status: 'pending',
      lastChecked: 'Baru ditambahkan'
    };

    const targetService = newKeyInput.service;

    setApiKeys(prev => ({
      ...prev,
      [targetService]: [...prev[targetService], newKeyObj]
    }));

    setNewKeyInput(prev => ({ ...prev, key: '', label: '' }));

    await checkCredit(targetService, newKeyObj);
  };

  const handleDeleteKey = (service, keyToDelete) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: prev[service].filter(k => k.key !== keyToDelete)
    }));
  };

  const processSelectedFile = (file) => {
    setFileError(null);

    if (!file) return;

    const validExtensions = ['mp3', 'wav'];
    const fileExtension = file.name.split('.').pop().toLowerCase();
    const isValidType = file.type.includes('audio') || validExtensions.includes(fileExtension);

    if (!isValidType) {
      setFileError('Format file tidak didukung! Mohon upload file bertipe .mp3 atau .wav.');
      return;
    }

    const MAX_SIZE_MB = 50;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;
    if (file.size > MAX_SIZE_BYTES) {
      setFileError(`Ukuran file terlalu besar! Maksimal ukuran file adalah ${MAX_SIZE_MB}MB.`);
      return;
    }

    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
    }

    setUploadedFile(file);
    const newUrl = URL.createObjectURL(file);
    setAudioUrl(newUrl);

    setSeparatedVocalsUrl(null);
    setSeparatedInstUrl(null);
    setConvertedVocalUrl(null);
    setNewInstrumentalUrl(null);
    setFinalMixedCoverUrl(null);
    setSeparationError(null);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files && e.target.files[0];
    processSelectedFile(file);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    const file = e.dataTransfer.files && e.dataTransfer.files[0];
    processSelectedFile(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleRemoveFile = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setUploadedFile(null);
    setAudioUrl(null);
    setFileError(null);
    setSeparatedVocalsUrl(null);
    setSeparatedInstUrl(null);
    setConvertedVocalUrl(null);
    setNewInstrumentalUrl(null);
    setFinalMixedCoverUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const formatFileSize = (bytes) => {
    if (!bytes) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const maskApiKey = (keyStr) => {
    if (!keyStr || keyStr.length < 8) return '••••••••';
    return `${keyStr.slice(0, 4)}...${keyStr.slice(-4)}`;
  };

  const separateVocalsApi = async (audioFile, apiKey, onProgressUpdate) => {
    console.log('[DEBUG-KitsAI] Mengirim POST ke vocal-separations...');
    onProgressUpdate(15, 'Mengirim audio ke Kits.AI...');

    const fetchWithTimeout = async (url, options = {}, timeoutMs = 90000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (err) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error(`Request timeout setelah ${Math.round(timeoutMs / 1000)}s`);
        }
        throw err;
      }
    };

    try {
      const formData = new FormData();
      formData.append('inputFile', audioFile);

      const response = await fetchWithTimeout('https://arpeggi.io/api/kits/v1/vocal-separations', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
        body: formData
      }, 90000);

      console.log('[DEBUG-KitsAI] Response status:', response.status);

      if (!response.ok) {
        let bodyText = '';
        try { bodyText = await response.text(); } catch (e) { bodyText = 'Gagal membaca body'; }
        console.warn(`[DEBUG-KitsAI] POST NOT OK (${response.status}):`, bodyText);

        if (response.status === 403) {
          throw new Error('🔴 HTTP 403: Key Tidak Valid / Akses Ditolak');
        }
        throw new Error(`Kits.AI API Error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
      }

      const jobData = await response.json();
      console.log('[DEBUG-KitsAI] Response jobData:', jobData);
      const jobId = jobData.id || jobData.jobId;

      if (!jobId) {
        throw new Error('Gagal mendapatkan Job ID dari Kits.AI');
      }

      console.log('[DEBUG-KitsAI] Job ID diterima:', jobId);
      onProgressUpdate(25, 'Job dibuat. Memulai polling status pemisahan...');

      let completed = false;
      let pollCount = 0;
      const MAX_POLLS = 40;
      let resultData = null;

      while (!completed) {
        pollCount++;
        if (pollCount > MAX_POLLS) {
          throw new Error('Polling melebihi batas waktu, job kemungkinan macet di server Kits.AI');
        }

        await new Promise(resolve => setTimeout(resolve, 3000));
        const currentProgress = Math.min(95, 25 + Math.floor((pollCount / MAX_POLLS) * 70));
        onProgressUpdate(currentProgress, `Memproses pemisahan vokal AI (Polling #${pollCount})...`);

        console.log(`[DEBUG-KitsAI] Polling ke-${pollCount}, mengirim GET...`);
        const statusRes = await fetchWithTimeout(`https://arpeggi.io/api/kits/v1/vocal-separations/${jobId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
        }, 45000);

        if (!statusRes.ok) {
          let errBody = '';
          try { errBody = await statusRes.text(); } catch (e) {}
          console.warn(`[DEBUG-KitsAI] Polling ke-${pollCount} NOT OK:`, errBody);
          throw new Error(`Polling status gagal (HTTP ${statusRes.status})`);
        }

        const statusData = await statusRes.json();
        console.log(`[DEBUG-KitsAI] Polling ke-${pollCount}, status server:`, statusData.status);

        if (statusData.status === 'success') {
          console.log('[DEBUG-KitsAI] Job selesai dengan sukses!');
          completed = true;
          resultData = statusData;
        } else if (statusData.status === 'error' || statusData.status === 'cancelled') {
          throw new Error(`Pemisahan vokal gagal di server: ${statusData.status}`);
        }
      }

      onProgressUpdate(100, 'Pemisahan vokal AI selesai!');

      const vocalUrl = resultData.vocalAudioFileUrl;
      let instrumentalUrl = null;

      if (Array.isArray(resultData.stemFileUrls)) {
        const instStem = resultData.stemFileUrls.find(s => s.instrument === 'backing');
        if (instStem) instrumentalUrl = instStem.url;
      }

      if (!vocalUrl || !instrumentalUrl) {
        throw new Error('Response sukses tetapi URL stem tidak ditemukan');
      }

      return {
        vocalUrl,
        instrumentalUrl,
        isLocalFallback: false
      };
    } catch (err) {
      console.warn('[DEBUG-KitsAI] Handled exception in separateVocalsApi:', err.name, err.message);

      if (
        err.name === 'TypeError' ||
        err.name === 'AbortError' ||
        err.message.includes('Failed to fetch') ||
        err.message.includes('CORS') ||
        err.message.includes('timeout') ||
        err.message.includes('NetworkError') ||
        err.message.includes('HTTP')
      ) {
        console.warn('[DEBUG-KitsAI] Mengalihkan ke Engine DSP Pemisah Lokal...');
        onProgressUpdate(20, 'Koneksi API Kits.AI tidak dapat dijangkau. Mengalihkan ke Engine DSP Lokal...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        return await processLocalAudioSeparation(audioFile, onProgressUpdate);
      }
      throw err;
    }
  };

  const handleStartVocalSeparation = async () => {
    if (!uploadedFile) {
      setSeparationError('Silakan upload file lagu terlebih dahulu di Panel 1.');
      addToast('error', 'Lagu Belum Ada', 'Upload file lagu sumber sebelum memisah vokal.');
      return;
    }

    setIsSeparating(true);
    setSeparationError(null);
    setSeparationProgress(5);
    setSeparationStep('Menyiapkan file audio...');
    setIsUsingLocalFallback(false);

    let success = false;

    try {
      const availableKeys = [
        ...(apiKeys.kitsai || []).filter(k => k.status !== 'failed'),
        ...(apiKeys.lalal || []).filter(k => k.status !== 'failed')
      ];

      if (availableKeys.length > 0) {
        for (const keyObj of availableKeys) {
          try {
            setSeparationStep(`Memproses vokal dengan Kits.AI (${keyObj.label})...`);

            const result = await separateVocalsApi(uploadedFile, keyObj.key, (progress, stepMsg) => {
              setSeparationProgress(progress);
              setSeparationStep(stepMsg);
            });

            setSeparatedVocalsUrl(result.vocalUrl);
            setSeparatedInstUrl(result.instrumentalUrl);
            setIsUsingLocalFallback(!!result.isLocalFallback);
            success = true;

            if (!result.isLocalFallback) {
              checkCredit('kitsai', keyObj);
              addToast('info', 'Pemisahan Selesai', 'Vokal dan instrumen berhasil dipisahkan via AI API.');
            }
            break;
          } catch (err) {
            console.warn(`Handling API separation error for key ${keyObj.label}:`, err.message);
            markKeyAsFailed('kitsai', keyObj.key, err.message.slice(0, 40));
          }
        }
      }

      if (!success) {
        setSeparationStep('Mengalihkan ke Engine Pemisah Audio DSP Lokal (Client Browser)...');
        setIsUsingLocalFallback(true);

        const localResult = await processLocalAudioSeparation(uploadedFile, (progress, stepMsg) => {
          setSeparationProgress(progress);
          setSeparationStep(stepMsg);
        });

        setSeparatedVocalsUrl(localResult.vocalUrl);
        setSeparatedInstUrl(localResult.instrumentalUrl);
        success = true;
        addToast('warning', 'Modus DSP Lokal Aktif', 'API eksternal tidak dapat dijangkau. Pemisahan dilakukan via DSP Browser.');
      }
    } catch (err) {
      console.warn('Fatal error during audio separation:', err);
      const errMsg = 'Semua API key Kits.AI gagal/kredit habis. Tools memakai DSP lokal sebagai gantinya.';
      setSeparationError(errMsg);
      addToast('error', 'Gagal Pemisahan Vokal', errMsg);
    }

    setIsSeparating(false);
  };

  const handleStartVoiceConversion = async () => {
    if (!separatedVocalsUrl) {
      const msg = 'Silakan pisahkan vokal lagu terlebih dahulu di Panel 3.';
      setVoiceConversionError(msg);
      addToast('error', 'Stem Vokal Belum Ada', msg);
      return;
    }

    setIsConvertingVoice(true);
    setVoiceConversionError(null);
    setVoiceConversionProgress(5);
    setVoiceConversionStep('Menyiapkan file stem vokal...');
    setIsVoiceLocalFallback(false);

    let success = false;
    let usedKeyObj = null;

    try {
      const vocalFile = await getUrlAsFile(separatedVocalsUrl, 'vocal_stem.wav');

      const kitsKeys = (apiKeys.kitsai || []).filter(k => k.status !== 'failed');
      for (const keyObj of kitsKeys) {
        try {
          usedKeyObj = keyObj;
          setVoiceConversionStep(`Memproses konversi vokal dengan Kits.AI (${keyObj.label})...`);

          const result = await convertVoiceApi(vocalFile, selectedVoiceModel, keyObj.key, (progress, stepMsg) => {
            setVoiceConversionProgress(progress);
            setVoiceConversionStep(stepMsg);
          });

          setConvertedVocalUrl(result.convertedUrl);
          setIsVoiceLocalFallback(!!result.isLocalFallback);
          success = true;
          addToast('info', 'Konversi Vokal Sukses', 'Karakter suara berhasil diubah.');
          break;
        } catch (err) {
          console.warn(`Handling API conversion error for key ${keyObj.label}:`, err.message);
          markKeyAsFailed('kitsai', keyObj.key, '🔴 Gagal/Key Error saat konversi');
        }
      }

      if (!success) {
        setVoiceConversionStep('Mengalihkan ke efek nada & pitch vokal lokal (Client Browser)...');
        setIsVoiceLocalFallback(true);
        const localResult = await convertVoiceLocal(vocalFile, selectedVoiceModel, (progress, stepMsg) => {
          setVoiceConversionProgress(progress);
          setVoiceConversionStep(stepMsg);
        });
        setConvertedVocalUrl(localResult.convertedUrl);
        success = true;
        addToast('warning', 'Pitch Vokal Lokal Aktif', 'API Voice Conversion tidak dapat dijangkau. Memakai modulasi pitch browser.');
      }

      if (usedKeyObj && !isVoiceLocalFallback) {
        checkCredit('kitsai', usedKeyObj);
      }
    } catch (err) {
      console.warn('Handling exception in handleStartVoiceConversion:', err);
      const errMsg = 'Gagal memproses konversi vokal. Coba ulangi dengan tombol Coba Lagi.';
      setVoiceConversionError(errMsg);
      addToast('error', 'Konversi Vokal Gagal', errMsg);
    }

    setIsConvertingVoice(false);
  };

  const handleStartStyleRegeneration = async () => {
    const sourceAudioUrl = separatedInstUrl || audioUrl;
    if (!sourceAudioUrl && styleMode === 'fast') {
      const msg = 'Silakan upload lagu atau pisahkan instrumen terlebih dahulu.';
      setInstRegenError(msg);
      addToast('error', 'Lagu Sumber Belum Ada', msg);
      return;
    }

    setIsRegeneratingInst(true);
    setInstRegenError(null);
    setInstRegenProgress(5);
    setInstRegenStep('Menyiapkan instrumen...');
    setIsInstLocalFallback(false);

    let success = false;

    if (styleMode === 'fast') {
      try {
        setInstRegenStep('Menerapkan efek EQ, pitch, & mood secara instan...');
        const localRes = await applyLocalStyleEffect(
          sourceAudioUrl,
          selectedGenre,
          selectedMood,
          tempoSpeed,
          pitchOffset,
          (prog, step) => {
            setInstRegenProgress(prog);
            setInstRegenStep(step);
          }
        );
        setNewInstrumentalUrl(localRes.newInstrumentalUrl);
        setIsInstLocalFallback(false);
        success = true;
        addToast('info', 'Efek Gaya Diterapkan', 'Efek EQ, pitch, & tempo lokal berhasil diterapkan secara gratis.');
      } catch (err) {
        console.warn('Gagal memproses efek gaya instrumen lokal:', err);
        const errMsg = 'Gagal memproses efek gaya: ' + err.message;
        setInstRegenError(errMsg);
        addToast('error', 'Gagal Menerapkan Gaya', errMsg);
      }
    } else {
      let usedKeyObj = null;
      const kieKeys = (apiKeys.kieai || []).filter(k => k.status !== 'failed');

      if (kieKeys.length > 0) {
        for (const keyObj of kieKeys) {
          try {
            usedKeyObj = keyObj;
            setInstRegenStep(`Generating musik AI via Kie.ai (${keyObj.label})...`);

            const apiRes = await regenerateInstrumentalApi(aiPrompt, keyObj.key, (prog, step) => {
              setInstRegenProgress(prog);
              setInstRegenStep(step);
            });

            setNewInstrumentalUrl(apiRes.newInstrumentalUrl);
            setIsInstLocalFallback(false);
            success = true;
            addToast('info', 'Musik AI Selesai', 'Regenerasi instrumen musik via Kie.ai berhasil dirender.');
            break;
          } catch (err) {
            console.warn(`Handling Kie.ai API error for key ${keyObj.label}:`, err.message);
            markKeyAsFailed('kieai', keyObj.key, '🔴 Gagal/Key Error saat generate');
          }
        }
      }

      if (!success) {
        setInstRegenStep('Mengalihkan ke Mode Efek Cepat lokal (Client Browser)...');
        setIsInstLocalFallback(true);

        if (sourceAudioUrl) {
          try {
            const localFallbackRes = await applyLocalStyleEffect(
              sourceAudioUrl,
              selectedGenre,
              selectedMood,
              tempoSpeed,
              pitchOffset,
              (prog, step) => {
                setInstRegenProgress(prog);
                setInstRegenStep(step);
              }
            );
            setNewInstrumentalUrl(localFallbackRes.newInstrumentalUrl);
            success = true;
            addToast('warning', 'Gaya AI Beralih ke Efek Cepat', 'Koneksi ke Kie.ai timeout setelah 30 detik. Memakai Efek Cepat browser.');
          } catch (locErr) {
            console.warn('Fallback lokal juga gagal:', locErr);
            setInstRegenError('Gagal memproses gaya instrumen.');
            addToast('error', 'Gagal Proses Gaya', 'Gagal memproses instrumen.');
          }
        } else {
          const errMsg = 'Kie.ai gagal dan tidak ada audio lokal untuk diproses.';
          setInstRegenError(errMsg);
          addToast('error', 'Audio Sumber Kosong', errMsg);
        }
      }

      if (usedKeyObj && !isInstLocalFallback) {
        checkCredit('kieai', usedKeyObj);
      }
    }

    setIsRegeneratingInst(false);
  };

  const handleStartFinalMixing = async () => {
    if (!convertedVocalUrl || !newInstrumentalUrl) {
      const msg = 'Silakan buat Vokal Baru dan Instrumen Baru terlebih dahulu.';
      setMixError(msg);
      addToast('error', 'Track Belum Lengkap', msg);
      return;
    }

    setIsMixing(true);
    setMixError(null);
    setMixProgress(5);
    setMixStep('Menyiapkan track vokal & instrumen...');

    try {
      const resultUrl = await mixAudioTracks(
        convertedVocalUrl,
        newInstrumentalUrl,
        (progress, stepMsg) => {
          setMixProgress(progress);
          setMixStep(stepMsg);
        }
      );

      setFinalMixedCoverUrl(resultUrl);
      addToast('info', 'Cover Lagu Selesai!', 'Lagu cover akhir siap didengarkan dan diunduh.');
    } catch (err) {
      console.warn('[DEBUG-Mix] Fatal error during audio mixing:', err);
      const errMsg = 'Gagal menggabungkan audio, coba ulangi tahap sebelumnya.';
      setMixError(errMsg);
      addToast('error', 'Mixing Gagal', errMsg);
    } finally {
      setIsMixing(false);
    }
  };

  const handleDownloadCover = () => {
    if (!finalMixedCoverUrl) return;
    const rawName = uploadedFile ? uploadedFile.name.replace(/\.[^/.]+$/, "") : "Remix";
    const downloadFileName = `AGE-YT5-Cover-${rawName}.wav`;

    const link = document.createElement('a');
    link.href = finalMixedCoverUrl;
    link.download = downloadFileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className={`min-h-screen bg-slate-950 text-slate-100 flex flex-col transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* Floating Toast Notification Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3.5 rounded-xl border backdrop-blur-md shadow-2xl flex items-start justify-between gap-3 animate-[slideIn_0.3s_ease-out] ${
              toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500/40 text-rose-100 shadow-rose-950/50'
                : toast.type === 'warning'
                ? 'bg-amber-950/90 border-amber-500/40 text-amber-100 shadow-amber-950/50'
                : 'bg-slate-900/90 border-cyan-500/40 text-cyan-100 shadow-cyan-950/50'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {toast.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />}
              {toast.type === 'warning' && <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />}
              {toast.type === 'info' && <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />}
              <div>
                <h5 className="font-bold text-xs">{toast.title}</h5>
                <p className="text-[11px] opacity-90 leading-tight mt-0.5">{toast.message}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="text-slate-400 hover:text-white p-0.5 rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Background Neon Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl" />
        <div className="absolute top-1/3 -right-40 w-96 h-96 bg-cyan-500/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 left-1/3 w-96 h-96 bg-pink-500/15 rounded-full blur-3xl" />
      </div>

      {/* Header Bar */}
      <header className="relative z-10 border-b border-white/10 backdrop-blur-md bg-slate-950/60 sticky top-0 px-4 lg:px-8 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-tr from-purple-600 via-cyan-400 to-pink-500 shadow-lg shadow-purple-500/30 hover:shadow-cyan-400/50 transition-shadow duration-300">
              <AudioLines className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-cyan-300 flex items-center gap-2">
                AGE YT#5 Musik Cover
                <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 hidden sm:inline-block">
                  AI Studio
                </span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">AI Audio Remixer & Cover Generator Studio</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsHelpOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-900/80 border border-slate-700/60 hover:border-pink-400/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-all duration-200 cursor-pointer shadow-sm hover:shadow-[0_0_15px_rgba(236,72,153,0.25)] group"
            >
              <HelpCircle className="w-4 h-4 text-pink-400 group-hover:scale-110 transition-transform duration-300" />
              <span className="hidden sm:inline">❓ Bantuan</span>
            </button>

            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-700/60 hover:border-cyan-400/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold transition-all duration-200 cursor-pointer shadow-sm hover:shadow-[0_0_15px_rgba(34,211,238,0.25)] group"
            >
              <Settings className="w-4 h-4 text-cyan-400 group-hover:rotate-45 transition-transform duration-300" />
              <span className="hidden sm:inline">⚙️ API Key</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid Content */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {}
        {/* Panel 1: Upload Lagu */}
        <section className="lg:col-span-4 flex flex-col rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-white/10 p-6 shadow-xl shadow-purple-950/20 hover:border-cyan-500/40 hover:shadow-[0_0_25px_rgba(6,182,212,0.15)] transition-all duration-300 group">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:border-purple-400/50 transition-colors">
                <Upload className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-100">1. Upload Lagu</h3>
                <p className="text-xs text-slate-400">Pilih atau Drag File Audio</p>
              </div>
            </div>
            <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full border transition-all ${
              uploadedFile ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-800 text-slate-400 border-white/5'
            }`}>
              {uploadedFile ? 'Uploaded' : 'Step 01'}
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-between">
            {!uploadedFile ? (
              <div className="space-y-3">
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  className="border-2 border-dashed border-slate-700 group-hover:border-purple-500/60 rounded-xl p-6 text-center bg-slate-950/40 hover:bg-slate-900/40 transition-all duration-300 flex flex-col items-center justify-center min-h-[200px] cursor-pointer hover:shadow-[0_0_20px_rgba(168,85,247,0.1)]"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".mp3,.wav,audio/mpeg,audio/wav"
                    className="hidden"
                  />
                  <div className="p-3.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20 mb-3 group-hover:scale-110 transition-transform duration-300 shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                    <FileAudio className="w-7 h-7" />
                  </div>
                  <p className="text-sm font-semibold text-slate-200">Tarik & Lepas File Audio di Sini</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">Mendukung format .MP3 dan .WAV (Maksimal 50MB)</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (fileInputRef.current) fileInputRef.current.click();
                    }}
                    className="px-4 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold shadow-lg shadow-purple-600/30 hover:shadow-[0_0_20px_rgba(168,85,247,0.5)] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer"
                  >
                    Pilih File Audio
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleLoadSampleAudio}
                  disabled={isGeneratingSample}
                  className="w-full py-2 px-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-purple-500/40 text-slate-400 hover:text-purple-300 text-[11px] font-semibold transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <FlaskConical className="w-3.5 h-3.5 text-purple-400" />
                  {isGeneratingSample ? 'Membuat Sample...' : '🧪 Tes dengan lagu contoh (Sintesis 3s)'}
                </button>
              </div>
            ) : (
              <div className="space-y-4 animate-[fadeIn_0.3s_ease-out]">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-white/10 space-y-3 shadow-inner">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="p-2.5 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shrink-0">
                        <Music className="w-5 h-5" />
                      </div>
                      <div className="overflow-hidden">
                        <p className="text-xs font-bold text-slate-200 truncate">{uploadedFile.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono mt-0.5">{formatFileSize(uploadedFile.size)}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                      title="Hapus / Ganti File"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {audioUrl && (
                    <div className="pt-2 border-t border-white/5">
                      <p className="text-[10px] text-slate-400 mb-1.5 font-medium flex items-center gap-1">
                        <Volume2 className="w-3 h-3 text-cyan-400" /> Pemutar Lagu Asli
                      </p>
                      <audio controls src={audioUrl} className="w-full h-8 accent-purple-500" />
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  className="w-full py-2 px-3 rounded-xl bg-slate-900 border border-slate-700 text-slate-300 hover:text-white hover:border-purple-500/50 hover:bg-slate-800 text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Ganti File Audio
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".mp3,.wav,audio/mpeg,audio/wav"
                  className="hidden"
                />
              </div>
            )}

            {fileError && (
              <div className="mt-3 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <span>{fileError}</span>
              </div>
            )}
          </div>
        </section>

        {}
        {/* Panel 2: Pengaturan Suara & Gaya */}
        <section className="lg:col-span-4 flex flex-col rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-white/10 p-6 shadow-xl shadow-purple-950/20 hover:border-cyan-500/40 hover:shadow-[0_0_25px_rgba(6,182,212,0.15)] transition-all duration-300 group">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:border-cyan-400/50 transition-colors">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-100">2. Suara & Gaya</h3>
                <p className="text-xs text-slate-400">Atur Vokal, Genre & Mood AI</p>
              </div>
            </div>
            <span className={`text-xs font-mono px-2.5 py-0.5 rounded-full border transition-all ${
              convertedVocalUrl || newInstrumentalUrl ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : 'bg-slate-800 text-slate-400 border-white/5'
            }`}>
              {convertedVocalUrl || newInstrumentalUrl ? 'Ready' : 'Step 02'}
            </span>
          </div>

          <div className="flex-1 flex flex-col justify-between space-y-6">
            {/* Sub-bagian A: Ubah Vokal */}
            <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4 space-y-4 hover:border-white/10 transition-colors">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Mic2 className="w-3.5 h-3.5 text-cyan-400" /> 1. Model Suara Penyanyi
                  </label>
                  {isVoiceModelFallback && (
                    <span className="text-[10px] text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20 font-mono">
                      Preset Lokal
                    </span>
                  )}
                </div>

                <select
                  value={selectedVoiceModel}
                  onChange={(e) => setSelectedVoiceModel(e.target.value)}
                  disabled={isLoadingVoiceModels || isConvertingVoice}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 cursor-pointer disabled:opacity-50 transition-colors"
                >
                  {voiceModels.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Voice Conversion Progress State */}
              {isConvertingVoice && (
                <div className="space-y-2 p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30">
                  <EqualizerBars />
                  <div className="flex justify-between text-[11px] font-mono text-cyan-300">
                    <span>{voiceConversionStep}</span>
                    <span>{voiceConversionProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-cyan-400 to-purple-500 transition-all duration-300"
                      style={{ width: `${voiceConversionProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Retry Button & Error Banner for Voice Conversion */}
              {voiceConversionError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{voiceConversionError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartVoiceConversion}
                    className="w-full py-1.5 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-rose-500/30"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> 🔄 Coba Lagi Ubah Vokal
                  </button>
                </div>
              )}

              {convertedVocalUrl && (
                <div className="p-3 rounded-xl bg-slate-900 border border-cyan-500/30 space-y-2">
                  <p className="text-[11px] font-bold text-cyan-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-cyan-400" /> Vokal Baru Hasil Konversi
                  </p>
                  <audio controls src={convertedVocalUrl} className="w-full h-8 accent-cyan-400" />
                </div>
              )}

              <button
                type="button"
                onClick={handleStartVoiceConversion}
                disabled={!separatedVocalsUrl || isConvertingVoice}
                className={`w-full py-2.5 px-3 rounded-xl font-bold text-xs transition-all duration-300 flex items-center justify-center gap-2 shadow-md ${
                  separatedVocalsUrl && !isConvertingVoice
                    ? 'bg-gradient-to-r from-cyan-500 via-purple-600 to-pink-500 hover:from-cyan-400 hover:via-purple-500 hover:to-pink-400 text-white shadow-cyan-950/40 hover:shadow-[0_0_20px_rgba(34,211,238,0.4)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                    : 'bg-slate-800 text-slate-400 border border-white/5 cursor-not-allowed opacity-60'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5 text-cyan-300" />
                {isConvertingVoice
                  ? 'Memproses Vokal...'
                  : (apiKeys.kitsai.length === 0 && apiKeys.elevenlabs.length === 0)
                  ? 'Ubah Vokal (Akan Memakai Pitch Lokal)'
                  : 'Ubah Vokal dengan Model AI'}
              </button>
            </div>

            {/* Sub-bagian B: Ubah Gaya Musik */}
            <div className="rounded-xl border border-white/5 bg-slate-950/40 p-4 space-y-4 hover:border-white/10 transition-colors">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Music className="w-3.5 h-3.5 text-pink-400" /> 2. Ubah Gaya Musik (Instrumen)
                </label>
              </div>

              {/* Mode Switcher */}
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setStyleMode('fast')}
                  className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    styleMode === 'fast'
                      ? 'bg-gradient-to-r from-cyan-500 to-purple-600 text-white shadow-md shadow-cyan-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <span>⚡ Efek Cepat (Gratis)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStyleMode('ai')}
                  className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    styleMode === 'ai'
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-md shadow-pink-500/20'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5 text-pink-300" />
                  <span>Regenerasi AI</span>
                </button>
              </div>

              {styleMode === 'fast' ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">Genre EQ</label>
                      <select
                        value={selectedGenre}
                        onChange={(e) => setSelectedGenre(e.target.value)}
                        disabled={isRegeneratingInst}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 cursor-pointer"
                      >
                        <option value="lofi">Lo-fi (Warm Lowpass)</option>
                        <option value="edm">EDM (Punchy Bass & Treble)</option>
                        <option value="acoustics">Akustik (Clean Warm)</option>
                        <option value="cyberpunk">Cyberpunk (Bandpass Echo)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-semibold text-slate-300 block mb-1">Tempo Speed ({tempoSpeed}x)</label>
                      <input
                        type="range"
                        min="0.8"
                        max="1.2"
                        step="0.05"
                        value={tempoSpeed}
                        onChange={(e) => setTempoSpeed(parseFloat(e.target.value))}
                        disabled={isRegeneratingInst}
                        className="w-full accent-cyan-400 cursor-pointer mt-1"
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-[11px] font-semibold text-slate-300 block">Deskripsikan Gaya Musik AI</label>
                  <textarea
                    rows={2}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder="jazz santai dengan piano dan brush drum"
                    disabled={isRegeneratingInst}
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-pink-400 resize-none"
                  />
                  <p className="text-[10px] text-slate-400 italic">
                    ℹ️ Memakai Kie.ai API. Proses butuh 1-3 menit untuk merender aransemen baru.
                  </p>
                </div>
              )}

              {/* Style Progress State */}
              {isRegeneratingInst && (
                <div className="space-y-2 p-3 rounded-xl bg-pink-950/30 border border-pink-500/30">
                  <EqualizerBars />
                  <div className="flex justify-between text-[11px] font-mono text-pink-300">
                    <span>{instRegenStep}</span>
                    <span>{instRegenProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-pink-500 to-purple-500 transition-all duration-300"
                      style={{ width: `${instRegenProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Retry Button & Error Banner for Style Regeneration */}
              {instRegenError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{instRegenError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartStyleRegeneration}
                    className="w-full py-1.5 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-rose-500/30"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> 🔄 Coba Lagi Ubah Gaya
                  </button>
                </div>
              )}

              {newInstrumentalUrl && (
                <div className="p-3 rounded-xl bg-slate-900 border border-pink-500/30 space-y-2">
                  <p className="text-[11px] font-bold text-pink-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-pink-400" /> Instrumen Baru
                  </p>
                  <audio controls src={newInstrumentalUrl} className="w-full h-8 accent-pink-500" />
                </div>
              )}

              <button
                type="button"
                onClick={handleStartStyleRegeneration}
                disabled={isRegeneratingInst}
                className="w-full py-2.5 px-3 rounded-xl font-bold text-xs transition-all duration-300 flex items-center justify-center gap-2 shadow-md bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-500 hover:from-purple-500 hover:via-pink-500 hover:to-cyan-400 text-white hover:shadow-[0_0_20px_rgba(236,72,153,0.4)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
              >
                <Wand2 className="w-3.5 h-3.5 text-pink-300" />
                {isRegeneratingInst
                  ? 'Memproses Gaya...'
                  : styleMode === 'fast'
                  ? 'Terapkan Efek Gaya Cepat'
                  : apiKeys.kieai.length === 0
                  ? 'Regenerasi AI (Akan Beralih ke Efek Cepat)'
                  : 'Regenerasi Musik via AI (Kie.ai)'}
              </button>
            </div>
          </div>
        </section>

        {}
        {/* Panel 3: Proses & Hasil */}
        <section className="lg:col-span-4 flex flex-col rounded-2xl bg-slate-900/50 backdrop-blur-xl border border-white/10 p-6 shadow-xl shadow-purple-950/20 hover:border-pink-500/40 hover:shadow-[0_0_25px_rgba(236,72,153,0.15)] transition-all duration-300 group">
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-white/5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20 group-hover:border-pink-400/50 transition-colors">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg text-slate-100">3. Proses & Hasil</h3>
                <p className="text-xs text-slate-400">Pemisahan Track & Pemutaran Cover</p>
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col justify-between rounded-xl border border-white/5 bg-slate-950/40 p-5 min-h-[260px] space-y-4">
            
            {/* Pipeline Status Indicator */}
            <div className="p-3 rounded-xl bg-slate-900 border border-white/10 text-[11px] font-mono leading-relaxed space-y-1">
              <div className="flex items-center gap-1.5 text-cyan-400 font-bold">
                <Activity className="w-3.5 h-3.5 animate-pulse" />
                <span>Status Studio Remixer:</span>
              </div>
              <p className="text-slate-300">
                {finalMixedCoverUrl
                  ? '✅ Upload → ✅ Pisah Vokal → ✅ Ubah Vokal → ✅ Ubah Gaya → ✅ Gabungkan — Cover Siap Diunduh!'
                  : convertedVocalUrl && newInstrumentalUrl
                  ? '✅ Upload → ✅ Pisah Vokal → ✅ Ubah Vokal → ✅ Ubah Gaya → ⏳ Siap Menggabungkan'
                  : separatedVocalsUrl
                  ? '✅ Upload → ✅ Pisah Vokal → ⏳ Menunggu Konversi Vokal & Gaya'
                  : uploadedFile
                  ? '✅ Upload → ⏳ Siap Memisah Vokal & Instrumen'
                  : '⏳ Menunggu File Audio Upload'}
              </p>
            </div>

            {/* Vocal Separation Section */}
            <div className="space-y-3">
              <button
                type="button"
                onClick={handleStartVocalSeparation}
                disabled={!uploadedFile || isSeparating}
                className={`w-full py-2.5 px-4 rounded-xl font-bold text-xs transition-all duration-300 flex items-center justify-center gap-2 shadow-lg ${
                  uploadedFile && !isSeparating
                    ? 'bg-gradient-to-r from-purple-600 via-pink-600 to-cyan-500 hover:from-purple-500 hover:via-pink-500 hover:to-cyan-400 text-white shadow-purple-950/50 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                    : 'bg-slate-800 text-slate-400 border border-white/5 cursor-not-allowed opacity-60'
                }`}
              >
                <Wand2 className="w-4 h-4 text-cyan-300" />
                {isSeparating
                  ? 'Sedang Memisah Audio...'
                  : (apiKeys.kitsai.length === 0 && apiKeys.lalal.length === 0)
                  ? 'Pisahkan Vokal (Akan Memakai DSP Lokal)'
                  : 'Pisahkan Vokal & Instrumen'}
              </button>

              {/* Separation Progress State */}
              {isSeparating && (
                <div className="space-y-2 p-3 rounded-xl bg-purple-950/30 border border-purple-500/30">
                  <EqualizerBars />
                  <div className="flex justify-between text-[11px] font-mono text-purple-300">
                    <span>{separationStep}</span>
                    <span>{separationProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-400 transition-all duration-300"
                      style={{ width: `${separationProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Retry Button & Error Banner for Separation */}
              {separationError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs space-y-2">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                    <span>{separationError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartVocalSeparation}
                    className="w-full py-1.5 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-rose-500/30"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> 🔄 Coba Lagi Pemisahan Audio
                  </button>
                </div>
              )}

              {/* Separated Audio Track Players */}
              {separatedVocalsUrl && separatedInstUrl && (
                <div className="space-y-3 pt-2">
                  {isUsingLocalFallback && (
                    <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] flex items-center gap-2">
                      <Info className="w-4 h-4 shrink-0 text-amber-400" />
                      <span>ℹ️ Diproses via Engine DSP Lokal (kualitas standar) — API eksternal tidak dapat dijangkau dari sandbox preview ini.</span>
                    </div>
                  )}

                  <div className="p-3 rounded-xl bg-slate-900 border border-purple-500/30 space-y-1.5">
                    <p className="text-[11px] font-bold text-purple-300 flex items-center gap-1">
                      <Mic2 className="w-3.5 h-3.5 text-purple-400" /> Vokal Saja
                    </p>
                    <audio controls src={separatedVocalsUrl} className="w-full h-8 accent-purple-500" />
                  </div>

                  <div className="p-3 rounded-xl bg-slate-900 border border-cyan-500/30 space-y-1.5">
                    <p className="text-[11px] font-bold text-cyan-300 flex items-center gap-1">
                      <Music className="w-3.5 h-3.5 text-cyan-400" /> Instrumental Saja
                    </p>
                    <audio controls src={separatedInstUrl} className="w-full h-8 accent-cyan-400" />
                  </div>
                </div>
              )}
            </div>

            {/* Final Audio Mixing Section */}
            <div className="pt-4 border-t border-white/10 space-y-3">
              <button
                type="button"
                onClick={handleStartFinalMixing}
                disabled={!convertedVocalUrl || !newInstrumentalUrl || isMixing}
                className={`w-full py-3 px-4 rounded-xl font-bold text-xs transition-all duration-300 flex items-center justify-center gap-2 shadow-xl ${
                  convertedVocalUrl && newInstrumentalUrl && !isMixing
                    ? 'bg-gradient-to-r from-emerald-500 via-cyan-500 to-purple-600 hover:from-emerald-400 hover:via-cyan-400 hover:to-purple-500 text-white shadow-emerald-950/50 hover:shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:scale-[1.01] active:scale-[0.99] cursor-pointer'
                    : 'bg-slate-800 text-slate-500 border border-white/5 cursor-not-allowed opacity-60'
                }`}
              >
                <Wand2 className="w-4 h-4 text-emerald-300" />
                {isMixing ? 'Menggabungkan Track Audio...' : 'Gabungkan & Buat Cover'}
              </button>

              {/* Mixing Progress State */}
              {isMixing && (
                <div className="space-y-2 p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/30">
                  <EqualizerBars />
                  <div className="flex justify-between text-[11px] font-mono text-emerald-300">
                    <span>{mixStep}</span>
                    <span>{mixProgress}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-300"
                      style={{ width: `${mixProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Retry Button & Error Banner for Mixing */}
              {mixError && (
                <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs space-y-2">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    <span>{mixError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleStartFinalMixing}
                    className="w-full py-1.5 px-3 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer border border-rose-500/30"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> 🔄 Coba Lagi Mixing Cover
                  </button>
                </div>
              )}

              {/* Final Mixed Cover Result Player & Download Button */}
              {finalMixedCoverUrl && (
                <div className="p-4 rounded-xl bg-gradient-to-br from-slate-900 to-purple-950/60 border border-emerald-500/40 space-y-3 shadow-lg shadow-emerald-950/30 animate-[fadeIn_0.5s_ease-out]">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-emerald-400" /> Hasil Cover Lagu Anda
                    </p>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                      WAV Final
                    </span>
                  </div>

                  <audio controls src={finalMixedCoverUrl} className="w-full h-9 accent-emerald-400" />

                  <button
                    type="button"
                    onClick={handleDownloadCover}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all duration-200 flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 hover:shadow-[0_0_20px_rgba(16,185,129,0.5)] cursor-pointer"
                  >
                    <Download className="w-4 h-4 stroke-[2.5]" /> Download Cover (.wav)
                  </button>
                </div>
              )}
            </div>

          </div>
        </section>
      </main>

      {/* Footer Disclaimer */}
      <footer className="relative z-10 border-t border-white/5 py-6 px-6 text-center text-xs text-slate-400 bg-slate-950/80">
        <div className="max-w-4xl mx-auto space-y-2">
          <p className="leading-relaxed">
            AGE YT#5 Musik Cover — biaya penggunaan API sepenuhnya ditanggung pengguna lewat API key masing-masing. Beberapa fitur (regenerasi genre AI) memakai layanan pihak ketiga yang bisa berubah sewaktu-waktu. Gunakan hasil cover sesuai ketentuan lisensi/hak cipta yang berlaku di platform Anda.
          </p>
          <p className="text-[11px] text-slate-500">© 2026 AGE YT#5 Musik Cover Studio — Powered by Web Audio DSP & AI Engines</p>
        </div>
      </footer>

      {}
      {/* Help & Guide Modal */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-100">Bantuan & Panduan Studio</h3>
                  <p className="text-xs text-slate-400">Petunjuk API Key Gratis, Alur Kerja & FAQ</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsHelpOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Help Navigation Tabs */}
            <div className="flex gap-2 border-b border-white/10 pb-3">
              <button
                type="button"
                onClick={() => setHelpTab('keys')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  helpTab === 'keys'
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Key className="w-3.5 h-3.5" /> API Key Gratis
              </button>
              <button
                type="button"
                onClick={() => setHelpTab('workflow')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  helpTab === 'workflow'
                    ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" /> Alur Kerja 5 Langkah
              </button>
              <button
                type="button"
                onClick={() => setHelpTab('faq')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  helpTab === 'faq'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <MessageSquare className="w-3.5 h-3.5" /> FAQ
              </button>
            </div>

            {/* Tab 1: Panduan API Key Gratis */}
            {helpTab === 'keys' && (
              <div className="space-y-3 animate-[fadeIn_0.2s_ease-out]">
                <p className="text-xs text-slate-300 leading-relaxed">
                  Semua layanan AI yang didukung menyediakan pendaftaran akun gratis dengan kredit/kuota awal yang bisa dipakai tanpa harus bayar:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Kits.AI */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1.5 hover:border-cyan-500/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-cyan-300">Kits.AI</h4>
                      <a href="https://kits.ai" target="_blank" rel="noopener noreferrer" className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1">
                        kits.ai <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Daftar akun gratis, masuk ke Dashboard, klik menu <strong>API</strong> di sidebar kiri, lalu buat token baru via tombol <strong>New Token</strong>.
                    </p>
                  </div>

                  {/* ElevenLabs */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1.5 hover:border-purple-500/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-purple-300">ElevenLabs</h4>
                      <a href="https://elevenlabs.io" target="_blank" rel="noopener noreferrer" className="text-[10px] text-purple-400 hover:underline flex items-center gap-1">
                        elevenlabs.io <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Daftar akun gratis (dapat 10.000 karakter/bulan), buka foto profil di pojok kanan bawah → <strong>Profile / Settings</strong> untuk melihat API key.
                    </p>
                  </div>

                  {/* LALAL.AI */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1.5 hover:border-pink-500/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-pink-300">LALAL.AI</h4>
                      <a href="https://lalal.ai" target="_blank" rel="noopener noreferrer" className="text-[10px] text-pink-400 hover:underline flex items-center gap-1">
                        lalal.ai <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Menyediakan tier Starter gratis tanpa perlu memasukkan kartu kredit untuk pemisahan vokal & instrumen.
                    </p>
                  </div>

                  {/* Kie.ai */}
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1.5 hover:border-emerald-500/30 transition-colors">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-emerald-300">Kie.ai</h4>
                      <a href="https://kie.ai" target="_blank" rel="noopener noreferrer" className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1">
                        kie.ai <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Mendapatkan kredit gratis saat pendaftaran awal. Salin API key di menu <strong>API Keys</strong> pada dashboard pengembang.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Alur Kerja 5 Langkah */}
            {helpTab === 'workflow' && (
              <div className="space-y-3 animate-[fadeIn_0.2s_ease-out]">
                <p className="text-xs text-slate-300">
                  Proses pembuatan cover lagu dapat dilakukan hanya dalam 5 langkah sederhana:
                </p>

                <div className="space-y-2">
                  {[
                    { step: '1', title: 'Upload Lagu Asli', desc: 'Pilih file lagu (.mp3 atau .wav) yang ingin Anda ubah menjadi versi cover.' },
                    { step: '2', title: 'Pisahkan Vokal & Instrumen', desc: 'Tekan tombol Pisahkan untuk memecah lagu menjadi track vokal saja dan instrumen saja.' },
                    { step: '3', title: 'Pilih & Ubah Model Suara Vokal', desc: 'Pilih karakter penyanyi baru (pria, wanita, jazz, dll.) lalu konversi suara vokal lagu tersebut.' },
                    { step: '4', title: 'Ubah Gaya / Genre Musik', desc: 'Gunakan Efek Cepat (Lo-fi, EDM, Cyberpunk) atau masukkan instruksi teks untuk regenerasi musik AI.' },
                    { step: '5', title: 'Gabungkan & Download Cover', desc: 'Campur track vokal baru dan instrumen baru menjadi satu file WAV utuh yang siap diunduh.' }
                  ].map((s) => (
                    <div key={s.step} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 flex items-start gap-3">
                      <span className="w-6 h-6 rounded-lg bg-gradient-to-tr from-cyan-500 to-purple-600 text-slate-950 font-black text-xs flex items-center justify-center shrink-0">
                        {s.step}
                      </span>
                      <div>
                        <h5 className="text-xs font-bold text-slate-200">{s.title}</h5>
                        <p className="text-[11px] text-slate-400 mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Tab 3: FAQ */}
            {helpTab === 'faq' && (
              <div className="space-y-3 animate-[fadeIn_0.2s_ease-out]">
                <div className="space-y-3">
                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
                    <h5 className="text-xs font-bold text-cyan-300">❓ Kenapa hasilnya kadang pakai "DSP Lokal" bukan AI asli?</h5>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Jika koneksi ke server API eksternal mengalami timeout atau terkena batasan sandbox browser, tools secara otomatis beralih ke engine pemroses sinyal audio browser (DSP lokal) agar Anda tetap mendapatkan hasil lagu tanpa error.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
                    <h5 className="text-xs font-bold text-pink-300">❓ Apakah aman memasukkan API key saya di sini?</h5>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Sangat aman. API key Anda hanya disimpan sementara di dalam memori sesi browser Anda sendiri dan tidak pernah disimpan di database atau dikirim ke server pihak ketiga selain penyedia API resmi terkait.
                    </p>
                  </div>

                  <div className="p-3.5 rounded-xl bg-slate-950/60 border border-white/5 space-y-1">
                    <h5 className="text-xs font-bold text-purple-300">❓ Kenapa proses regenerasi genre AI butuh waktu lebih lama?</h5>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Proses generasi musik AI (Kie.ai) memerlukan waktu 1 hingga 3 menit karena server sedang merender dan menggubah komposisi instrumen musik penuh secara eksplisit dari prompt teks Anda.
                    </p>
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>
      )}

      {}
      {/* Settings Modal (API Key Management) */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-[fadeIn_0.2s_ease-out]">
          <div className="bg-slate-900 border border-white/10 rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
                  <Settings className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-slate-100">Pengaturan API Key</h3>
                  <p className="text-xs text-slate-400">Kelola Kunci Akses Layanan AI</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Tambah API Key */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-white/5 space-y-3">
              <h4 className="text-xs font-bold text-slate-300">Tambah API Key Baru</h4>
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <select
                  value={newKeyInput.service}
                  onChange={(e) => setNewKeyInput(prev => ({ ...prev, service: e.target.value }))}
                  className="sm:col-span-4 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                >
                  <option value="kitsai">Kits.AI</option>
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="lalal">LALAL.AI</option>
                  <option value="kieai">Kie.ai</option>
                </select>

                <input
                  type="text"
                  placeholder="Label Opsional (misal: Key Cadangan)"
                  value={newKeyInput.label}
                  onChange={(e) => setNewKeyInput(prev => ({ ...prev, label: e.target.value }))}
                  className="sm:col-span-8 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400"
                />

                <input
                  type="password"
                  placeholder="Masukkan API Key..."
                  value={newKeyInput.key}
                  onChange={(e) => setNewKeyInput(prev => ({ ...prev, key: e.target.value }))}
                  className="sm:col-span-9 px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:border-cyan-400 font-mono"
                />

                <button
                  type="button"
                  onClick={handleAddKey}
                  disabled={!newKeyInput.key.trim()}
                  className="sm:col-span-3 px-3 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" /> Simpan
                </button>
              </div>
            </div>

            {/* List API Keys per Service */}
            <div className="space-y-4">
              {[
                { id: 'kitsai', name: 'Kits.AI', desc: 'Model vokal AI & pemisahan stem' },
                { id: 'elevenlabs', name: 'ElevenLabs', desc: 'Sintesis suara vokal manusia' },
                { id: 'lalal', name: 'LALAL.AI', desc: 'Pemisah musik & vokal' },
                { id: 'kieai', name: 'Kie.ai', desc: 'AI Music Generator Studio' }
              ].map((svc) => (
                <div key={svc.id} className="p-3.5 rounded-xl border border-white/5 bg-slate-950/40 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-slate-200">{svc.name}</h5>
                      <p className="text-[10px] text-slate-400">{svc.desc}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono bg-slate-900 px-2 py-0.5 rounded border border-white/5">
                      {apiKeys[svc.id].length} key tersimpan
                    </span>
                  </div>

                  {apiKeys[svc.id].length === 0 ? (
                    <p className="text-[11px] text-slate-400 italic">Belum ada key yang dimasukkan.</p>
                  ) : (
                    <div className="space-y-1.5 pt-1">
                      {apiKeys[svc.id].map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                          <div className="flex items-center gap-2 overflow-hidden">
                            <span className="font-semibold text-slate-300 shrink-0">{item.label}:</span>
                            <span className="font-mono text-slate-400 truncate">{maskApiKey(item.key)}</span>
                            
                            {/* Status Quota Badge */}
                            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono flex items-center gap-1 shrink-0 ${
                              item.status === 'failed'
                                ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                                : item.status === 'warning'
                                ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                                : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${
                                item.status === 'failed' ? 'bg-rose-400' : item.status === 'warning' ? 'bg-amber-400' : 'bg-emerald-400'
                              } animate-ping`} />
                              {item.remainingCredit}
                            </span>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => checkCredit(svc.id, item)}
                              className="p-1 rounded text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                              title="Refresh Kuota"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteKey(svc.id, item.key)}
                              className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Hapus Key"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-white/5 text-[11px] text-slate-400 flex items-start gap-2">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <span>API key Anda hanya disimpan sementara di sesi browser ini dan tidak dikirim ke server manapun selain penyedia API terkait.</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}