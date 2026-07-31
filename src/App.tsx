import React, { useState, useEffect, useRef } from 'react';
import { 
  Music, Music2, Upload, RefreshCw, Trash2, Settings, HelpCircle, 
  Sparkles, Download, AlertCircle, X, Activity, Layers, Sliders, Wand2, 
  AudioLines, CheckCircle2, Headphones, Disc3, Radio, AudioWaveform, SlidersHorizontal, ChevronRight
} from 'lucide-react';

const fontStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Sora:wght@400;600;700;800&display=swap');
  
  .font-sora { font-family: 'Sora', sans-serif; }
  .font-mono-studio { font-family: 'JetBrains Mono', monospace; }
  .font-sans-studio { font-family: 'Inter', sans-serif; }

  @keyframes eqBar {
    0%, 100% { height: 4px; }
    50% { height: 18px; }
  }
  .animate-eq-1 { animation: eqBar 0.8s ease-in-out infinite; }
  .animate-eq-2 { animation: eqBar 1.1s ease-in-out infinite 0.2s; }
  .animate-eq-3 { animation: eqBar 0.9s ease-in-out infinite 0.4s; }
  .animate-eq-4 { animation: eqBar 1.2s ease-in-out infinite 0.1s; }
`;

function audioBufferToWav(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1;
  const bitDepth = 16;
  
  let result;
  if (numChannels === 2) {
    const left = buffer.getChannelData(0);
    const right = buffer.getChannelData(1);
    const length = left.length + right.length;
    result = new Float32Array(length);
    let index = 0;
    for (let i = 0; i < buffer.length; i++) {
      result[index++] = left[i];
      result[index++] = right[i];
    }
  } else {
    result = buffer.getChannelData(0);
  }

  const dataLength = result.length * (bitDepth / 8);
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < result.length; i++) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

async function processLocalAudioSeparation(audioFile, onProgress) {
  onProgress(10, 'Membaca file audio...');
  const arrayBuffer = await audioFile.arrayBuffer();
  
  onProgress(30, 'Mendekode sinyal audio...');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  
  const sampleRate = decodedBuffer.sampleRate;
  const length = decodedBuffer.length;

  onProgress(50, 'Memisah frekuensi vokal (Bandpass)...');
  const offlineCtxVocal = new OfflineAudioContext(decodedBuffer.numberOfChannels, length, sampleRate);
  const srcVocal = offlineCtxVocal.createBufferSource();
  srcVocal.buffer = decodedBuffer;

  const bandpass = offlineCtxVocal.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1000;
  bandpass.Q.value = 0.8;

  srcVocal.connect(bandpass);
  bandpass.connect(offlineCtxVocal.destination);
  srcVocal.start(0);

  const renderedVocal = await offlineCtxVocal.startRendering();
  const vocalBlob = audioBufferToWav(renderedVocal);
  const vocalUrl = URL.createObjectURL(vocalBlob);

  onProgress(80, 'Memisah frekuensi instrumen (Notch)...');
  const offlineCtxInst = new OfflineAudioContext(decodedBuffer.numberOfChannels, length, sampleRate);
  const srcInst = offlineCtxInst.createBufferSource();
  srcInst.buffer = decodedBuffer;

  const notch = offlineCtxInst.createBiquadFilter();
  notch.type = 'notch';
  notch.frequency.value = 1000;
  notch.Q.value = 1.2;

  srcInst.connect(notch);
  notch.connect(offlineCtxInst.destination);
  srcInst.start(0);

  const renderedInst = await offlineCtxInst.startRendering();
  const instBlob = audioBufferToWav(renderedInst);
  const instUrl = URL.createObjectURL(instBlob);

  onProgress(100, 'Pemisahan DSP lokal selesai!');
  return { vocalBlob, instBlob, vocalUrl, instUrl };
}

async function convertVoiceLocal(audioBlobOrUrl, pitchPreset) {
  let blob = audioBlobOrUrl;
  if (typeof audioBlobOrUrl === 'string') {
    if (audioBlobOrUrl.startsWith('blob:')) {
      blob = await fetch(audioBlobOrUrl).then(r => r.blob());
    } else {
      const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(audioBlobOrUrl)}`;
      blob = await fetch(proxiedUrl).then(r => r.blob());
    }
  }

  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  let detuneCents = 0;
  let playbackRate = 1.0;

  switch (pitchPreset) {
    case 'up_light': detuneCents = 200; break;
    case 'down_light': detuneCents = -200; break;
    case 'chipmunk': detuneCents = 700; playbackRate = 1.1; break;
    case 'deep': detuneCents = -600; playbackRate = 0.95; break;
    case 'robotic': detuneCents = 0; break;
    default: detuneCents = 0; break;
  }

  const offlineCtx = new OfflineAudioContext(decodedBuffer.numberOfChannels, decodedBuffer.length, decodedBuffer.sampleRate);
  const src = offlineCtx.createBufferSource();
  src.buffer = decodedBuffer;
  src.detune.value = detuneCents;
  src.playbackRate.value = playbackRate;

  if (pitchPreset === 'robotic') {
    const filter = offlineCtx.createBiquadFilter();
    filter.type = 'peaking';
    filter.frequency.value = 1200;
    filter.gain.value = 15;
    src.connect(filter);
    filter.connect(offlineCtx.destination);
  } else {
    src.connect(offlineCtx.destination);
  }

  src.start(0);
  const rendered = await offlineCtx.startRendering();
  const resBlob = audioBufferToWav(rendered);
  const resUrl = URL.createObjectURL(resBlob);

  return { blob: resBlob, url: resUrl };
}

async function applyLocalStyleEffect(audioBlobOrUrl, genre, moodValue, tempoValue) {
  let blob = audioBlobOrUrl;
  if (typeof audioBlobOrUrl === 'string') {
    if (audioBlobOrUrl.startsWith('blob:')) {
      blob = await fetch(audioBlobOrUrl).then(r => r.blob());
    } else {
      const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(audioBlobOrUrl)}`;
      blob = await fetch(proxiedUrl).then(r => r.blob());
    }
  }

  const arrayBuffer = await blob.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  const offlineCtx = new OfflineAudioContext(decodedBuffer.numberOfChannels, decodedBuffer.length, decodedBuffer.sampleRate);
  const src = offlineCtx.createBufferSource();
  src.buffer = decodedBuffer;

  let rate = 1.0;
  if (tempoValue === 'slow') rate = 0.85;
  if (tempoValue === 'fast') rate = 1.15;
  if (tempoValue === 'very_fast') rate = 1.3;
  src.playbackRate.value = rate;

  const filter = offlineCtx.createBiquadFilter();
  if (genre === 'Lofi') {
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
  } else if (genre === 'EDM') {
    filter.type = 'peaking';
    filter.frequency.value = 100;
    filter.gain.value = 6;
  } else if (genre === 'Cyberpunk') {
    filter.type = 'bandpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1.5;
  } else {
    filter.type = 'allpass';
  }

  src.connect(filter);
  filter.connect(offlineCtx.destination);
  src.start(0);

  const rendered = await offlineCtx.startRendering();
  const resBlob = audioBufferToWav(rendered);
  const resUrl = URL.createObjectURL(resBlob);

  return { blob: resBlob, url: resUrl };
}

async function mixAudioTracks(vocalBlobOrUrl, instBlobOrUrl, onProgress) {
  onProgress(20, 'Mengunduh sinyal vokal dan instrumen...');

  let vBlob = vocalBlobOrUrl;
  if (typeof vocalBlobOrUrl === 'string') {
    if (vocalBlobOrUrl.startsWith('blob:')) {
      vBlob = await fetch(vocalBlobOrUrl).then(r => r.blob());
    } else {
      const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(vocalBlobOrUrl)}`;
      vBlob = await fetch(proxiedUrl).then(r => r.blob());
    }
  }

  let iBlob = instBlobOrUrl;
  if (typeof instBlobOrUrl === 'string') {
    if (instBlobOrUrl.startsWith('blob:')) {
      iBlob = await fetch(instBlobOrUrl).then(r => r.blob());
    } else {
      const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(instBlobOrUrl)}`;
      iBlob = await fetch(proxiedUrl).then(r => r.blob());
    }
  }

  onProgress(40, 'Mendekode audio untuk mixing...');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const vBuffer = await audioCtx.decodeAudioData(await vBlob.arrayBuffer());
  const iBuffer = await audioCtx.decodeAudioData(await iBlob.arrayBuffer());

  const minDuration = Math.min(vBuffer.duration, iBuffer.duration);
  const sampleRate = vBuffer.sampleRate;
  const frameCount = Math.floor(minDuration * sampleRate);

  onProgress(70, 'Menggabungkan jalur vokal dan instrumen...');
  const offlineCtx = new OfflineAudioContext(2, frameCount, sampleRate);

  const vSrc = offlineCtx.createBufferSource();
  vSrc.buffer = vBuffer;
  const vGain = offlineCtx.createGain();
  vGain.gain.value = 1.0;
  vSrc.connect(vGain);
  vGain.connect(offlineCtx.destination);

  const iSrc = offlineCtx.createBufferSource();
  iSrc.buffer = iBuffer;
  const iGain = offlineCtx.createGain();
  iGain.gain.value = 0.85;
  iSrc.connect(iGain);
  iGain.connect(offlineCtx.destination);

  vSrc.start(0);
  iSrc.start(0);

  onProgress(90, 'Merekam file final WAV...');
  const rendered = await offlineCtx.startRendering();
  const finalBlob = audioBufferToWav(rendered);
  const finalUrl = URL.createObjectURL(finalBlob);

  onProgress(100, 'Mixing Selesai!');
  return { blob: finalBlob, url: finalUrl };
}

async function separateVocalsStemSplit(audioFile, apiKey, onProgress) {
  onProgress(10, 'Menghubungi StemSplit.io proxy...');
  const uploadRes = await fetch('https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ filename: audioFile.name })
  });

  if (!uploadRes.ok) {
    const text = await uploadRes.text();
    throw new Error(`StemSplit Upload Error (HTTP ${uploadRes.status}): ${text.slice(0, 200)}`);
  }

  const uploadData = await uploadRes.json();
  const { uploadUrl, uploadKey } = uploadData;

  onProgress(25, 'Mengunggah file audio ke storage...');
  const proxiedUploadUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-upload?target=${encodeURIComponent(uploadUrl)}`;
  const putRes = await fetch(proxiedUploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': audioFile.type || 'audio/mpeg' },
    body: audioFile
  });

  if (!putRes.ok) {
    throw new Error(`StemSplit Upload File Gagal (HTTP ${putRes.status})`);
  }

  onProgress(40, 'Membuat job pemisahan StemSplit...');
  const jobRes = await fetch('https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/jobs', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      uploadKey,
      outputType: 'BOTH',
      quality: 'BEST',
      outputFormat: 'MP3'
    })
  });

  if (!jobRes.ok) {
    const text = await jobRes.text();
    throw new Error(`StemSplit Job Create Error (HTTP ${jobRes.status}): ${text.slice(0, 200)}`);
  }

  const jobData = await jobRes.json();
  const jobId = jobData.id;

  let completed = false;
  let attempts = 0;
  let resultVocalsUrl = null;
  let resultInstUrl = null;

  while (!completed && attempts < 40) {
    attempts++;
    await new Promise(r => setTimeout(r, 5000));

    const pollRes = await fetch(`https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/jobs/${jobId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    const progressVal = pollData.progress || Math.min(40 + attempts * 2, 95);
    onProgress(progressVal, `Pemisahan StemSplit berjalan... (${progressVal}%)`);

    if (pollData.status === 'COMPLETED') {
      completed = true;
      resultVocalsUrl = pollData.outputs?.vocals?.url || pollData.outputs?.vocal?.url;
      resultInstUrl = pollData.outputs?.instrumental?.url || pollData.outputs?.backing?.url;
    } else if (pollData.status === 'FAILED') {
      throw new Error(`StemSplit Job Gagal: ${pollData.errorMessage || 'Unknown Error'}`);
    }
  }

  if (!completed || !resultVocalsUrl || !resultInstUrl) {
    throw new Error('StemSplit polling timeout atau URL hasil tidak lengkap.');
  }

  onProgress(95, 'Mengunduh stem vokal dan instrumen...');
  const vProxy = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(resultVocalsUrl)}`;
  const iProxy = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(resultInstUrl)}`;

  const vocalBlob = await fetch(vProxy).then(r => r.blob());
  const instBlob = await fetch(iProxy).then(r => r.blob());

  return {
    vocalBlob,
    instBlob,
    vocalUrl: URL.createObjectURL(vocalBlob),
    instUrl: URL.createObjectURL(instBlob)
  };
}

async function convertVoiceElevenLabs(vocalStemBlobOrUrl, voiceId, apiKey, onProgress) {
  onProgress(20, 'Menyiapkan stem vokal...');
  let blob = vocalStemBlobOrUrl;
  if (typeof vocalStemBlobOrUrl === 'string') {
    if (vocalStemBlobOrUrl.startsWith('blob:')) {
      blob = await fetch(vocalStemBlobOrUrl).then(r => r.blob());
    } else {
      const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(vocalStemBlobOrUrl)}`;
      blob = await fetch(proxiedUrl).then(r => r.blob());
    }
  }

  onProgress(40, 'Mengirim ke ElevenLabs Speech-to-Speech API...');
  const formData = new FormData();
  formData.append('audio', blob, 'vocal.wav');
  formData.append('model_id', 'eleven_multilingual_sts_v2');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  const res = await fetch(`https://stemsplit-proxy.kitakustik-managemen.workers.dev/elevenlabs/v1/speech-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey },
    body: formData,
    signal: controller.signal
  });
  clearTimeout(timer);

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`ElevenLabs Error (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }

  onProgress(90, 'Menerima hasil konversi suara...');
  const resultBlob = await res.blob();
  const resultUrl = URL.createObjectURL(resultBlob);

  onProgress(100, 'Konversi vokal selesai!');
  return { blob: resultBlob, url: resultUrl };
}

async function regenerateInstrumentalApi(prompt, styleString, negativeTags, vocalGender, apiKey, onProgress) {
  onProgress(15, 'Menghubungi Kie.ai API (Model V4)...');

  const payload = {
    customMode: true,
    prompt: prompt || 'Cover instrumental audio',
    style: styleString || 'Acoustic, Calm',
    negativeTags: negativeTags ? negativeTags.join(', ') : '',
    title: 'Custom Style Cover'
  };

  if (vocalGender && vocalGender !== 'none') {
    payload.vocalGender = vocalGender;
  }

  const res = await fetch('https://api.kie.ai/api/v1/generate', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Kie.ai API Error (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }

  const json = await res.json();
  const taskId = json.data?.taskId || json.data?.id;

  if (!taskId) throw new Error('Kie.ai tidak mengembalikan Task ID.');

  let completed = false;
  let attempts = 0;
  let audioResultUrl = null;

  while (!completed && attempts < 25) {
    attempts++;
    await new Promise(r => setTimeout(r, 8000));

    const pollRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` }
    });

    if (!pollRes.ok) continue;

    const pollData = await pollRes.json();
    const status = pollData.data?.status || pollData.status;

    onProgress(20 + attempts * 3, `AI sedang meregenerasi musik... (${status || 'PROCESSING'})`);

    if (status === 'SUCCESS') {
      completed = true;
      const records = pollData.data?.response?.sunoData || pollData.data?.records || [];
      audioResultUrl = records[0]?.audioUrl || records[0]?.audio_url;
    } else if (status === 'CREATE_TASK_FAILED') {
      throw new Error('Kie.ai Task Generation Gagal.');
    }
  }

  if (!completed || !audioResultUrl) {
    throw new Error('Regenerasi Kie.ai timeout.');
  }

  const resultBlob = await fetch(audioResultUrl).then(r => r.blob());
  return { blob: resultBlob, url: URL.createObjectURL(resultBlob) };
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [showApiSettingsModal, setShowApiSettingsModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [activeApiKeyTab, setActiveApiKeyTab] = useState('stemsplit');
  const [toasts, setToasts] = useState([]);

  // File Upload State
  const [uploadedFile, setUploadedFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const fileInputRef = useRef(null);

  // API Key Storage
  const [apiKeys, setApiKeys] = useState({
    stemsplit: [],
    kitsai: [],
    elevenlabs: [],
    lalal: [],
    kieai: []
  });
  const [tempKeyInputs, setTempKeyInputs] = useState({
    stemsplit: '',
    kitsai: '',
    elevenlabs: '',
    lalal: '',
    kieai: ''
  });

  // Process & Separation States
  const [vocalStemUrl, setVocalStemUrl] = useState(null);
  const [vocalStemBlob, setVocalStemBlob] = useState(null);
  const [instStemUrl, setInstStemUrl] = useState(null);
  const [instStemBlob, setInstStemBlob] = useState(null);
  const [isSeparating, setIsSeparating] = useState(false);
  const [sepProgress, setSepProgress] = useState(0);
  const [sepStatusText, setSepStatusText] = useState('');

  // Voice Mode & Options
  const [voiceMode, setVoiceMode] = useState('pitch');
  const [selectedPitchPreset, setSelectedPitchPreset] = useState('up_light');
  const [selectedVoiceModel, setSelectedVoiceModel] = useState('');
  const [convertedVocalUrl, setConvertedVocalUrl] = useState(null);
  const [convertedVocalBlob, setConvertedVocalBlob] = useState(null);
  const [isConvertingVoice, setIsConvertingVoice] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceStatusText, setVoiceStatusText] = useState('');

  // Style & Genre Options
  const [genreMode, setGenreMode] = useState('fast');
  const [selectedGenre, setSelectedGenre] = useState('Lofi');
  const [selectedMood, setSelectedMood] = useState('Calm');
  const [selectedTempo, setSelectedTempo] = useState('medium');
  const [vocalGender, setVocalGender] = useState('none');
  const [selectedInstruments, setSelectedInstruments] = useState(['Piano', 'Acoustic Guitar']);
  const [selectedNegativeTags, setSelectedNegativeTags] = useState([]);
  const [customStylePrompt, setCustomStylePrompt] = useState('');
  const [newInstUrl, setNewInstUrl] = useState(null);
  const [newInstBlob, setNewInstBlob] = useState(null);
  const [isGeneratingGenre, setIsGeneratingGenre] = useState(false);
  const [genreProgress, setGenreProgress] = useState(0);
  const [genreStatusText, setGenreStatusText] = useState('');

  // Mixing & Cover Final
  const [isMixing, setIsMixing] = useState(false);
  const [mixProgress, setMixProgress] = useState(0);
  const [mixStatusText, setMixStatusText] = useState('');
  const [finalCoverUrl, setFinalCoverUrl] = useState(null);

  const [localFallbackInfo, setLocalFallbackInfo] = useState(null);

  useEffect(() => {
    setLoaded(true);
  }, []);

  const addToast = (type, text) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, text }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  const removeToast = id => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const getNextAvailableKey = service => {
    const list = apiKeys[service] || [];
    return list.find(k => k.status !== 'failed');
  };

  const markKeyAsFailed = (service, keyVal) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: (prev[service] || []).map(k => k.key === keyVal ? { ...k, status: 'failed' } : k)
    }));
  };

  const checkCredit = async (service, apiKey) => {
    try {
      if (service === 'elevenlabs') {
        const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
          headers: { 'xi-api-key': apiKey }
        });
        if (res.ok) {
          const data = await res.json();
          const rem = data.character_limit - data.character_count;
          return { remainingCredit: rem, labelInfo: `${rem.toLocaleString()} karakter` };
        }
      } else if (service === 'kieai') {
        const res = await fetch('https://api.kie.ai/api/v1/chat/credit', {
          headers: { 'Authorization': `Bearer ${apiKey}` }
        });
        if (res.ok) {
          const data = await res.json();
          if (data.code === 200) {
            return { remainingCredit: data.data, labelInfo: `${data.data} kredit` };
          }
        }
      }
    } catch (e) {
      console.warn(`[Credit Check Error] ${service}:`, e);
    }
    return { remainingCredit: null, labelInfo: 'Tersimpan' };
  };

  const handleSaveKey = async service => {
    const val = tempKeyInputs[service]?.trim();
    if (!val) return;

    const creditInfo = await checkCredit(service, val);
    const newEntry = {
      key: val,
      label: `Key ${apiKeys[service].length + 1}`,
      remainingCredit: creditInfo.remainingCredit,
      labelInfo: creditInfo.labelInfo,
      status: 'active'
    };

    setApiKeys(prev => ({
      ...prev,
      [service]: [...(prev[service] || []), newEntry]
    }));
    setTempKeyInputs(prev => ({ ...prev, [service]: '' }));
    addToast('info', `Key ${service.toUpperCase()} berhasil disimpan!`);
  };

  const handleDeleteKey = (service, index) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: prev[service].filter((_, i) => i !== index)
    }));
    addToast('info', 'Key dihapus.');
  };

  const handleFileSelect = file => {
    setUploadError(null);
    if (!file) return;

    const validTypes = ['audio/mp3', 'audio/mpeg', 'audio/wav', 'audio/x-wav'];
    const ext = file.name.split('.').pop().toLowerCase();

    if (!validTypes.includes(file.type) && !['mp3', 'wav'].includes(ext)) {
      setUploadError('Hanya file format .MP3 dan .WAV yang diperbolehkan!');
      addToast('error', 'Format file ditolak! Gunakan MP3 atau WAV.');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setUploadError('Ukuran file terlalu besar! Maksimal 50MB.');
      addToast('error', 'File terlalu besar (>50MB).');
      return;
    }

    setUploadedFile(file);
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    addToast('info', 'Lagu berhasil diunggah!');
  };

  const handleLoadSampleSong = () => {
    const sampleRate = 44100;
    const duration = 4;
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = audioCtx.createBuffer(1, sampleRate * duration, sampleRate);
    const data = buffer.getChannelData(0);

    for (let i = 0; i < buffer.length; i++) {
      data[i] = Math.sin(2 * Math.PI * 440 * (i / sampleRate)) * Math.exp(-3 * (i / (sampleRate * duration)));
    }

    const wavBlob = audioBufferToWav(buffer);
    const sampleFile = new File([wavBlob], 'Sample-Lagu-4s.wav', { type: 'audio/wav' });
    handleFileSelect(sampleFile);
  };

  const handleStartVocalSeparation = async () => {
    if (!uploadedFile) return;
    setIsSeparating(true);
    setSepProgress(10);
    setSepStatusText('Memulai pemisahan audio...');
    setLocalFallbackInfo(null);

    const stemSplitKey = getNextAvailableKey('stemsplit');
    if (stemSplitKey) {
      try {
        const res = await separateVocalsStemSplit(uploadedFile, stemSplitKey.key, (p, text) => {
          setSepProgress(p);
          setSepStatusText(text);
        });
        setVocalStemBlob(res.vocalBlob);
        setVocalStemUrl(res.vocalUrl);
        setInstStemBlob(res.instBlob);
        setInstStemUrl(res.instUrl);
        setIsSeparating(false);
        addToast('info', 'Pemisahan Vokal & Instrumen Sukses (StemSplit.io)!');
        return;
      } catch (err) {
        console.warn('[StemSplit Error]', err);
        markKeyAsFailed('stemsplit', stemSplitKey.key);
      }
    }

    setSepStatusText('Beralih ke Engine DSP Lokal...');
    setLocalFallbackInfo('ℹ️ Diproses via Engine DSP Lokal — server API eksternal tidak dapat dijangkau.');
    try {
      const res = await processLocalAudioSeparation(uploadedFile, (p, text) => {
        setSepProgress(p);
        setSepStatusText(text);
      });
      setVocalStemBlob(res.vocalBlob);
      setVocalStemUrl(res.vocalUrl);
      setInstStemBlob(res.instBlob);
      setInstStemUrl(res.instUrl);
      addToast('warn', 'Diproses via Engine DSP Lokal.');
    } catch (err) {
      console.error('Fatal DSP Error:', err);
      addToast('error', 'Gagal memproses audio lokal.');
    }

    setIsSeparating(false);
  };

  const handleStartVoiceConversion = async () => {
    const inputAudio = vocalStemUrl || audioUrl;
    if (!inputAudio) return;

    setIsConvertingVoice(true);
    setVoiceProgress(10);
    setVoiceStatusText('Memulai konversi vokal...');

    if (voiceMode === 'pitch') {
      try {
        const res = await convertVoiceLocal(inputAudio, selectedPitchPreset);
        setConvertedVocalBlob(res.blob);
        setConvertedVocalUrl(res.url);
        addToast('info', 'Efek Pitch Vokal Berhasil Diterapkan!');
      } catch (err) {
        console.warn('Pitch local error:', err);
        addToast('error', 'Gagal mengubah pitch vokal.');
      }
      setIsConvertingVoice(false);
      return;
    }

    // AI Voice Mode
    const elKey = getNextAvailableKey('elevenlabs');
    if (elKey && selectedVoiceModel) {
      try {
        const res = await convertVoiceElevenLabs(inputAudio, selectedVoiceModel, elKey.key, (p, text) => {
          setVoiceProgress(p);
          setVoiceStatusText(text);
        });
        setConvertedVocalBlob(res.blob);
        setConvertedVocalUrl(res.url);
        setIsConvertingVoice(false);
        addToast('info', 'AI Voice ElevenLabs Berhasil!');
        return;
      } catch (err) {
        console.warn('ElevenLabs Error:', err);
        markKeyAsFailed('elevenlabs', elKey.key);
      }
    }

    // Fallback to pitch
    setVoiceStatusText('Memakai Efek Pitch Lokal sebagai cadangan...');
    try {
      const res = await convertVoiceLocal(inputAudio, 'up_light');
      setConvertedVocalBlob(res.blob);
      setConvertedVocalUrl(res.url);
      addToast('warn', 'AI Voice ditolak/gagal. Otomatis memakai Efek Pitch.');
    } catch (err) {
      addToast('error', 'Gagal memproses konversi vokal.');
    }

    setIsConvertingVoice(false);
  };

  const buildSunoStyleString = () => {
    const parts = [selectedGenre, selectedMood, selectedInstruments.join(', ')];
    if (selectedTempo === 'slow') parts.push('70 BPM');
    if (selectedTempo === 'fast') parts.push('130 BPM');
    if (selectedTempo === 'very_fast') parts.push('150 BPM');
    return parts.join(', ').slice(0, 200);
  };

  const handleStartStyleRegeneration = async () => {
    const inputAudio = instStemUrl || audioUrl;
    if (!inputAudio) return;

    setIsGeneratingGenre(true);
    setGenreProgress(10);
    setGenreStatusText('Memulai pengubahan gaya instrumen...');

    if (genreMode === 'fast') {
      try {
        const res = await applyLocalStyleEffect(inputAudio, selectedGenre, selectedMood, selectedTempo);
        setNewInstBlob(res.blob);
        setNewInstUrl(res.url);
        addToast('info', 'Efek Gaya Musik Cepat Berhasil!');
      } catch (err) {
        console.warn('Local style error:', err);
        addToast('error', 'Gagal menerapkan gaya musik.');
      }
      setIsGeneratingGenre(false);
      return;
    }

    // AI Mode Kie.ai
    const kieKey = getNextAvailableKey('kieai');
    if (kieKey) {
      try {
        const styleStr = buildSunoStyleString();
        const res = await regenerateInstrumentalApi(
          customStylePrompt,
          styleStr,
          selectedNegativeTags,
          vocalGender,
          kieKey.key,
          (p, text) => {
            setGenreProgress(p);
            setGenreStatusText(text);
          }
        );
        setNewInstBlob(res.blob);
        setNewInstUrl(res.url);
        setIsGeneratingGenre(false);
        addToast('info', 'Regenerasi Musik AI Kie.ai Berhasil!');
        return;
      } catch (err) {
        console.warn('Kie.ai Error:', err);
        markKeyAsFailed('kieai', kieKey.key);
      }
    }

    // Fallback
    setGenreStatusText('Beralih ke Efek Cepat Gratis...');
    try {
      const res = await applyLocalStyleEffect(inputAudio, selectedGenre, selectedMood, selectedTempo);
      setNewInstBlob(res.blob);
      setNewInstUrl(res.url);
      addToast('warn', 'Kie.ai tidak dapat dijangkau. Memakai Efek Cepat.');
    } catch (err) {
      addToast('error', 'Gagal mengubah gaya musik.');
    }

    setIsGeneratingGenre(false);
  };

  const handleStartFinalMixing = async () => {
    setIsMixing(true);
    setMixProgress(10);
    setMixStatusText('Menggabungkan track audio...');

    try {
      const finalVocal = convertedVocalBlob || vocalStemBlob;
      const finalInst = newInstBlob || instStemBlob;

      if (!finalVocal || !finalInst) {
        addToast('error', 'Vokal dan instrumen (baru atau asli) harus tersedia untuk digabungkan!');
        setIsMixing(false);
        return;
      }

      const res = await mixAudioTracks(finalVocal, finalInst, (p, text) => {
        setMixProgress(p);
        setMixStatusText(text);
      });

      setFinalCoverUrl(res.url);
      addToast('info', 'Lagu Cover Final Berhasil Dibuat!');
    } catch (err) {
      console.error('[DEBUG-Mix] Fatal Error:', err);
      addToast('error', 'Gagal menggabungkan audio.');
    }

    setIsMixing(false);
  };

  const hasVocal = Boolean(convertedVocalUrl || vocalStemUrl);
  const hasInst = Boolean(newInstUrl || instStemUrl);
  const canMix = hasVocal && hasInst;

  return (
    <div className={`min-h-screen bg-[#0a0118] text-slate-100 font-sans-studio antialiased selection:bg-cyan-500 selection:text-slate-950 transition-opacity duration-700 relative overflow-x-hidden ${loaded ? 'opacity-100' : 'opacity-0'}`}>
      <style>{fontStyles}</style>

      {/* Decorative Waveform & Grid Background Overlay */}
      <div className="fixed inset-0 pointer-events-none opacity-5 bg-[radial-gradient(#ec4899_1px,transparent_1px),radial-gradient(#22d3ee_1px,transparent_1px)] [background-size:24px_24px] [background-position:0_0,12px_12px]" />
      <div className="fixed -top-40 -left-40 w-96 h-96 bg-purple-600/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed -bottom-40 -right-40 w-96 h-96 bg-cyan-600/20 rounded-full blur-[120px] pointer-events-none" />

      {/* Toast Notification Container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
        {toasts.map(t => (
          <div 
            key={t.id} 
            className={`p-3 rounded-xl border backdrop-blur-xl shadow-2xl flex items-center justify-between gap-3 text-xs font-mono-studio font-semibold animate-in fade-in slide-in-from-top-2 ${
              t.type === 'error' ? 'bg-red-950/80 border-red-500/50 text-red-200' :
              t.type === 'warn' ? 'bg-amber-950/80 border-amber-500/50 text-amber-200' :
              'bg-cyan-950/80 border-cyan-500/50 text-cyan-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <AudioWaveform className="w-4 h-4 shrink-0 text-cyan-400" />
              <span>{t.text}</span>
            </div>
            <button onClick={() => removeToast(t.id)} className="p-1 rounded-md hover:bg-slate-800/50">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-purple-900/30 bg-[#0a0118]/85 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative p-2 rounded-xl bg-gradient-to-tr from-purple-600 via-cyan-500 to-pink-500 shadow-[0_0_20px_rgba(34,211,238,0.3)]">
              <Disc3 className="w-6 h-6 text-slate-950 animate-spin-slow" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-sora text-lg sm:text-xl font-black tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-100 via-cyan-200 to-pink-400">
                  AGE YT#5 Musik Cover
                </h1>
                {/* Header Animated EQ Indicator */}
                <div className="hidden sm:flex items-end gap-0.5 h-4 px-1.5 py-0.5 bg-purple-950/60 rounded border border-purple-500/30">
                  <span className="w-1 bg-cyan-400 rounded-full animate-eq-1" />
                  <span className="w-1 bg-pink-400 rounded-full animate-eq-2" />
                  <span className="w-1 bg-cyan-400 rounded-full animate-eq-3" />
                  <span className="w-1 bg-pink-400 rounded-full animate-eq-4" />
                </div>
              </div>
              <p className="text-[11px] text-slate-400 font-medium hidden sm:block">
                AI Audio Creator Studio • Remixer Edition
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelpModal(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 text-slate-300 hover:text-cyan-400 transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Bantuan</span>
            </button>
            <button
              onClick={() => setShowApiSettingsModal(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-800 hover:border-pink-500/50 text-slate-300 hover:text-pink-400 transition-all flex items-center gap-1.5 text-xs font-semibold"
            >
              <Settings className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">API Keys</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Studio Console Layout */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        
        {/* Panel 1: Upload Lagu Sumber */}
        <section className="p-4 sm:p-5 rounded-2xl bg-[#0f0b2e]/60 border border-purple-900/40 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-400">
                <Upload className="w-4 h-4" />
              </div>
              <h2 className="font-sora text-base font-bold text-slate-100">1. Upload Lagu Sumber</h2>
            </div>
          </div>

          {!uploadedFile ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-purple-900/60 hover:border-cyan-500/50 rounded-xl p-6 sm:p-8 text-center bg-slate-950/40 hover:bg-slate-900/40 transition-all cursor-pointer group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept="audio/mp3,audio/wav"
                onChange={e => handleFileSelect(e.target.files?.[0])}
              />
              <div className="p-3 rounded-full bg-purple-500/10 text-pink-400 w-12 h-12 mx-auto mb-3 flex items-center justify-center group-hover:scale-110 transition-transform shadow-[0_0_15px_rgba(236,72,153,0.2)]">
                <Music2 className="w-6 h-6" />
              </div>
              <h3 className="font-sora font-bold text-slate-200 text-xs sm:text-sm mb-1">
                Tarik & Lepas File Audio MP3 / WAV
              </h3>
              <p className="text-[11px] text-slate-400 mb-3">Ukuran maksimal file: 50MB</p>
              <button type="button" className="px-4 py-2 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-slate-100 font-bold text-xs transition-all shadow-[0_0_15px_rgba(236,72,153,0.3)]">
                Pilih File Audio
              </button>
            </div>
          ) : (
            /* Streamlined Single-Row Audio Header */
            <div className="p-3 sm:p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shrink-0">
                    <Headphones className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-sora font-bold text-xs sm:text-sm text-slate-200 truncate">{uploadedFile.name}</p>
                    <p className="text-[10px] font-mono-studio text-slate-400">{(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-slate-300 flex items-center gap-1 transition-all"
                  >
                    <RefreshCw className="w-3 h-3" /> Ganti
                  </button>
                  <button 
                    onClick={() => { setUploadedFile(null); setAudioUrl(null); }}
                    className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <input type="file" ref={fileInputRef} className="hidden" accept="audio/mp3,audio/wav" onChange={e => handleFileSelect(e.target.files?.[0])} />
                </div>
              </div>

              <audio controls src={audioUrl} className="w-full h-8 rounded-lg" />
            </div>
          )}

          {uploadError && (
            <p className="mt-2.5 text-xs text-red-400 font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5" /> {uploadError}
            </p>
          )}

          <div className="mt-2.5 flex justify-end">
            <button 
              onClick={handleLoadSampleSong}
              className="text-[11px] font-mono-studio text-slate-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
            >
              🧪 Tes dengan lagu contoh (4s)
            </button>
          </div>
        </section>

        {/* Panel 2: Pemisahan Trek & Pengaturan Vokal/Gaya */}
        <div className="space-y-6">
          
          {/* Section 2-Top: Langkah Awal: Pisahkan Trek */}
          <section className="p-4 sm:p-5 rounded-2xl bg-[#0f0b2e]/60 border border-purple-900/40 backdrop-blur-xl shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <Layers className="w-4 h-4" />
              </div>
              <div>
                <h2 className="font-sora text-base font-bold text-slate-100">2. Langkah Awal: Pisahkan Trek</h2>
                <p className="text-[11px] text-slate-400">Pisahkan file vokal dan instrumen sebelum mengubah karakter suara & gaya musik</p>
              </div>
            </div>

            <button 
              onClick={handleStartVocalSeparation}
              disabled={!uploadedFile || isSeparating}
              className={`w-full py-3 rounded-xl font-sora font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                !uploadedFile || isSeparating 
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 via-blue-600 to-purple-600 text-slate-950 font-black shadow-[0_0_20px_rgba(34,211,238,0.3)] hover:brightness-110'
              }`}
            >
              {isSeparating ? <RefreshCw className="w-4 h-4 animate-spin text-slate-950" /> : <Layers className="w-4 h-4 text-slate-950" />}
              <span>{isSeparating ? sepStatusText : 'Pisahkan Vokal & Instrumen (StemSplit)'}</span>
            </button>

            <div className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 text-blue-200/90 text-xs flex items-start gap-2">
              <span className="text-sm leading-none">💡</span>
              <p className="leading-relaxed text-[11px]">
                <strong className="font-semibold text-blue-100">Kenapa harus dipisah dulu?</strong> Lagu asli Anda berisi vokal dan instrumental yang menyatu. Supaya cover akhir bersih, sistem memisahkan vokal dari musik asli untuk memproses vokal dan instrumen baru secara terisolasi.
              </p>
            </div>

            {localFallbackInfo && (
              <div className="p-2.5 rounded-xl bg-slate-950 border border-amber-500/30 text-amber-300 text-xs font-mono-studio">
                {localFallbackInfo}
              </div>
            )}

            {/* Stem Players */}
            {(vocalStemUrl || instStemUrl) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-purple-900/30 animate-in fade-in slide-in-from-top-2">
                {vocalStemUrl && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                    <p className="text-[11px] font-sora font-bold text-pink-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 🎤 Vokal Asli (Stem)
                    </p>
                    <audio controls src={vocalStemUrl} className="w-full h-8" />
                  </div>
                )}
                {instStemUrl && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                    <p className="text-[11px] font-sora font-bold text-cyan-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> 🎸 Instrumen Asli (Stem)
                    </p>
                    <audio controls src={instStemUrl} className="w-full h-8" />
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Grid 2A & 2B */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Panel 2A: Ubah Karakter Vokal */}
            <section className="p-4 sm:p-5 rounded-2xl bg-[#0f0b2e]/60 border border-purple-900/40 backdrop-blur-xl shadow-2xl flex flex-col justify-between space-y-5">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-pink-500/10 border border-pink-500/20 text-pink-400">
                      <Wand2 className="w-4 h-4" />
                    </div>
                    <h2 className="font-sora text-sm sm:text-base font-bold text-slate-100">2A. Ubah Karakter Vokal</h2>
                  </div>

                  <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px] font-semibold">
                    <button 
                      onClick={() => setVoiceMode('pitch')}
                      className={`px-2.5 py-1 rounded-md transition-all ${voiceMode === 'pitch' ? 'bg-pink-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      🎚️ Pitch (Gratis)
                    </button>
                    <button 
                      onClick={() => setVoiceMode('ai')}
                      className={`px-2.5 py-1 rounded-md transition-all ${voiceMode === 'ai' ? 'bg-pink-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      ✨ AI Voice
                    </button>
                  </div>
                </div>

                {voiceMode === 'pitch' ? (
                  <div className="space-y-3">
                    <label className="block text-xs font-semibold text-slate-300">Preset Pitch Vokal</label>
                    <select 
                      value={selectedPitchPreset}
                      onChange={e => setSelectedPitchPreset(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:border-pink-500 outline-none"
                    >
                      <option value="up_light">Pitch Naik (Ringan)</option>
                      <option value="down_light">Pitch Turun (Ringan)</option>
                      <option value="chipmunk">Nada Tinggi (Chipmunk)</option>
                      <option value="deep">Nada Rendah (Berat)</option>
                      <option value="robotic">Robotik / Metallic</option>
                    </select>
                    <p className="text-[10px] text-slate-400">💡 Mengubah nada vokal secara instan di browser tanpa kuota API.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs">
                      ⚠️ Membutuhkan API Key ElevenLabs / Kits.AI valid pada Pengaturan.
                    </div>
                    <label className="block text-xs font-semibold text-slate-300">ElevenLabs Voice ID</label>
                    <input 
                      type="text"
                      placeholder="Masukkan Voice ID"
                      value={selectedVoiceModel}
                      onChange={e => setSelectedVoiceModel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 font-mono-studio focus:border-pink-500 outline-none"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-3 border-t border-purple-900/30">
                <button 
                  onClick={handleStartVoiceConversion}
                  disabled={isConvertingVoice || (!vocalStemUrl && !audioUrl)}
                  className={`w-full py-3 rounded-xl font-sora font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                    isConvertingVoice || (!vocalStemUrl && !audioUrl)
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-pink-500 to-purple-600 text-slate-100 shadow-[0_0_15px_rgba(236,72,153,0.3)] hover:brightness-110'
                  }`}
                >
                  {isConvertingVoice ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>{isConvertingVoice ? voiceStatusText : 'Proses Ubah Vokal'}</span>
                </button>

                {convertedVocalUrl && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-pink-500/30 space-y-1.5">
                    <p className="text-[11px] font-sora font-bold text-pink-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Vokal Baru Siap
                    </p>
                    <audio controls src={convertedVocalUrl} className="w-full h-8 rounded-lg" />
                  </div>
                )}
              </div>
            </section>

            {/* Panel 2B: Ubah Gaya Musik */}
            <section className="p-4 sm:p-5 rounded-2xl bg-[#0f0b2e]/60 border border-purple-900/40 backdrop-blur-xl shadow-2xl flex flex-col justify-between space-y-5">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                      <SlidersHorizontal className="w-4 h-4" />
                    </div>
                    <h2 className="font-sora text-sm sm:text-base font-bold text-slate-100">2B. Ubah Gaya Musik</h2>
                  </div>

                  <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 text-[11px] font-semibold">
                    <button 
                      onClick={() => setGenreMode('fast')}
                      className={`px-2.5 py-1 rounded-md transition-all ${genreMode === 'fast' ? 'bg-cyan-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      ⚡ Efek Cepat
                    </button>
                    <button 
                      onClick={() => setGenreMode('ai')}
                      className={`px-2.5 py-1 rounded-md transition-all ${genreMode === 'ai' ? 'bg-cyan-600 text-slate-100' : 'text-slate-400 hover:text-slate-200'}`}
                    >
                      🤖 AI (Kie.ai)
                    </button>
                  </div>
                </div>

                {genreMode === 'fast' ? (
                  <div className="grid grid-cols-2 gap-2.5 text-xs">
                    <div>
                      <label className="block mb-1 font-semibold text-slate-400">Genre</label>
                      <select value={selectedGenre} onChange={e => setSelectedGenre(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200">
                        <option value="Lofi">Lo-Fi</option>
                        <option value="EDM">EDM</option>
                        <option value="Acoustic">Acoustic</option>
                        <option value="Cyberpunk">Cyberpunk</option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 font-semibold text-slate-400">Tempo</label>
                      <select value={selectedTempo} onChange={e => setSelectedTempo(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2 text-slate-200">
                        <option value="slow">Lambat (80 BPM)</option>
                        <option value="medium">Sedang (100 BPM)</option>
                        <option value="fast">Cepat (130 BPM)</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5 text-xs">
                    <input 
                      type="text"
                      placeholder="Deskripsi gaya (misal: Jazz piano santai)"
                      value={customStylePrompt}
                      onChange={e => setCustomStylePrompt(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:border-cyan-500 outline-none"
                    />
                    <p className="text-[10px] font-mono-studio text-slate-400">Preview: {buildSunoStyleString()}</p>
                    <p className="text-[10px] text-amber-300/80 italic">
                      ℹ️ Mode ini menghasilkan instrumental baru dari deskripsi teks, bukan mengubah instrumental asli lagu Anda.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-3 pt-3 border-t border-purple-900/30">
                <button 
                  onClick={handleStartStyleRegeneration}
                  disabled={isGeneratingGenre || (!instStemUrl && !audioUrl)}
                  className={`w-full py-3 rounded-xl font-sora font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                    isGeneratingGenre || (!instStemUrl && !audioUrl)
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-cyan-400 to-blue-500 text-slate-950 font-black shadow-[0_0_15px_rgba(34,211,238,0.3)] hover:brightness-110'
                  }`}
                >
                  {isGeneratingGenre ? <RefreshCw className="w-4 h-4 animate-spin text-slate-950" /> : <Sparkles className="w-4 h-4 text-slate-950" />}
                  <span>{isGeneratingGenre ? genreStatusText : 'Proses Ubah Gaya'}</span>
                </button>

                {newInstUrl && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-1.5">
                    <p className="text-[11px] font-sora font-bold text-cyan-400 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Instrumen Baru Siap
                    </p>
                    <audio controls src={newInstUrl} className="w-full h-8 rounded-lg" />
                  </div>
                )}
              </div>
            </section>
          </div>

        </div>

        {/* Panel 3: Mix & Hasil Cover Final */}
        <section className="p-4 sm:p-5 rounded-2xl bg-[#0f0b2e]/60 border border-purple-900/40 backdrop-blur-xl shadow-2xl space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-sora text-base font-bold text-slate-100">3. Mix & Hasil Cover Final</h2>
              <p className="text-[11px] text-slate-400">Gabungkan track vokal dan instrumen untuk mendownload lagu cover final</p>
            </div>
          </div>

          {/* Compact Pipeline Status Bar */}
          <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 flex flex-wrap items-center justify-center gap-1.5 text-[11px] font-mono-studio text-slate-300 text-center">
            <span className={uploadedFile ? 'text-emerald-400 font-bold' : 'text-slate-500'}>1. Upload</span>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className={(vocalStemUrl || instStemUrl) ? 'text-emerald-400 font-bold' : 'text-slate-500'}>2. Pisah Trek</span>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className={(convertedVocalUrl || newInstUrl) ? 'text-emerald-400 font-bold' : 'text-slate-400'}>3. Vokal & Gaya</span>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className={finalCoverUrl ? 'text-emerald-400 font-bold' : 'text-slate-500'}>4. Mix Cover</span>
          </div>

          <div className="space-y-2">
            <button 
              onClick={handleStartFinalMixing}
              disabled={!canMix || isMixing}
              className={`w-full py-3.5 rounded-xl font-sora font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                !canMix || isMixing
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-400 via-cyan-400 to-pink-500 text-slate-950 font-black shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:brightness-110'
              }`}
            >
              {isMixing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-slate-950" />}
              <span>{isMixing ? mixStatusText : 'Gabungkan & Buat Cover Final'}</span>
            </button>
            <p className="text-[10px] text-slate-400 text-center">
              💡 Bagian yang belum diproses akan memakai versi asli lagu Anda secara otomatis.
            </p>
          </div>

          {/* Final Result Player */}
          {finalCoverUrl && (
            <div className="p-4 sm:p-5 rounded-xl bg-gradient-to-r from-emerald-950/60 via-slate-950 to-cyan-950/60 border border-emerald-500/40 space-y-3 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <AudioLines className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-sora font-extrabold text-xs sm:text-sm text-emerald-200">Hasil Cover Lagu Final</h3>
                </div>
                <a 
                  href={finalCoverUrl} 
                  download={`AGE-YT5-Cover-${uploadedFile ? uploadedFile.name.replace(/\.[^/.]+$/, '') : 'Song'}.wav`}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-sora font-black text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.4)] transition-all"
                >
                  <Download className="w-3.5 h-3.5" /> Download (.wav)
                </a>
              </div>
              <audio controls src={finalCoverUrl} className="w-full h-9 rounded-lg" />
            </div>
          )}
        </section>

      </main>

      {/* Footer */}
      <footer className="mt-8 border-t border-purple-900/30 py-4 px-4 text-center text-[11px] text-slate-500 font-mono-studio">
        <p>AGE YT#5 Musik Cover — Remixer Studio Edition</p>
      </footer>

      {/* Compact Tabbed API Settings Modal */}
      {showApiSettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f0b2e] border border-purple-900/50 rounded-2xl max-w-lg w-full p-5 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-purple-900/30 pb-3">
              <h3 className="font-sora font-bold text-sm text-slate-100 flex items-center gap-2">
                <Settings className="w-4 h-4 text-pink-400" /> Pengaturan API Key
              </h3>
              <button onClick={() => setShowApiSettingsModal(false)} className="p-1 text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Service Tabs Header */}
            <div className="flex overflow-x-auto gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-xs font-semibold scrollbar-none">
              {['stemsplit', 'elevenlabs', 'kitsai', 'lalal', 'kieai'].map(srv => (
                <button
                  key={srv}
                  onClick={() => setActiveApiKeyTab(srv)}
                  className={`px-3 py-1.5 rounded-lg capitalize whitespace-nowrap transition-all ${
                    activeApiKeyTab === srv ? 'bg-purple-600 text-slate-100 font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {srv}
                </button>
              ))}
            </div>

            {/* Active Service Tab Body */}
            <div className="space-y-3 pt-1">
              <label className="block text-xs font-sora font-bold text-slate-300 capitalize">
                API Key {activeApiKeyTab.toUpperCase()}
              </label>
              
              <div className="flex gap-2">
                <input 
                  type="password"
                  placeholder={`Masukkan API Key ${activeApiKeyTab}`}
                  value={tempKeyInputs[activeApiKeyTab] || ''}
                  onChange={e => setTempKeyInputs({ ...tempKeyInputs, [activeApiKeyTab]: e.target.value })}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5 text-xs font-mono-studio text-slate-200 focus:border-pink-500 outline-none"
                />
                <button onClick={() => handleSaveKey(activeApiKeyTab)} className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-xs font-bold rounded-xl text-slate-100 transition-all">
                  💾 Simpan
                </button>
              </div>

              <div className="space-y-1.5">
                {(apiKeys[activeApiKeyTab] || []).length === 0 ? (
                  <p className="text-[11px] text-slate-500 italic p-2 bg-slate-950/50 rounded-lg text-center">Belum ada API key tersimpan.</p>
                ) : (
                  (apiKeys[activeApiKeyTab] || []).map((k, idx) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                      <span className="font-mono-studio text-slate-400 text-[11px]">{k.key.slice(0, 6)}...{k.key.slice(-4)}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono-studio text-slate-400">{k.labelInfo}</span>
                        <button onClick={() => handleDeleteKey(activeApiKeyTab, idx)} className="text-red-400 hover:text-red-300">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f0b2e] border border-purple-900/50 rounded-2xl max-w-lg w-full p-5 space-y-3 max-h-[85vh] overflow-y-auto text-xs text-slate-300">
            <div className="flex items-center justify-between border-b border-purple-900/30 pb-3">
              <h3 className="font-sora font-bold text-sm text-slate-100 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-cyan-400" /> Bantuan Studio Remixer
              </h3>
              <button onClick={() => setShowHelpModal(false)} className="p-1 text-slate-400 hover:text-slate-200">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p>1. <strong>StemSplit.io</strong>: Pemisahan stem vokal & instrumen utama.</p>
            <p>2. <strong>ElevenLabs</strong>: Speech-to-speech voice conversion AI.</p>
            <p>3. <strong>Kie.ai</strong>: AI Music Generation Suno V4.</p>
            <p>4. <strong>DSP Lokal</strong>: Mode cadangan otomatis jika API eksternal tidak dapat dijangkau.</p>
          </div>
        </div>
      )}

    </div>
  );
}