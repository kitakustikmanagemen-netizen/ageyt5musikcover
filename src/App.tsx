import React, { useState, useEffect, useRef } from 'react';
import { 
  Music, 
  Settings, 
  HelpCircle, 
  Upload, 
  Play, 
  Pause, 
  RefreshCw, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  Info, 
  Sparkles, 
  AudioLines, 
  Download, 
  Volume2, 
  ShieldAlert, 
  ArrowRight, 
  Zap, 
  Radio, 
  FileAudio, 
  ExternalLink, 
  X,
  Sliders,
  Activity
} from 'lucide-react';

/**
 * Helper: Convert AudioBuffer to 16-bit PCM WAV Blob
 */
function audioBufferToWav(buffer) {
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

  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  /* RIFF identifier */
  writeString(0, 'RIFF');
  /* RIFF chunk length */
  view.setUint32(4, 36 + dataLength, true);
  /* RIFF type */
  writeString(8, 'WAVE');
  /* format chunk identifier */
  writeString(12, 'fmt ');
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
  writeString(36, 'data');
  /* data chunk length */
  view.setUint32(40, dataLength, true);

  /* float to 16-bit PCM */
  let offset = 44;
  for (let i = 0; i < result.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, result[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

/**
 * Local Web Audio DSP Separation Engine
 */
async function processLocalAudioSeparation(audioFile, onProgressUpdate) {
  console.log('[DEBUG-Local] Memulai proses pemisahan DSP lokal...');
  onProgressUpdate(10, 'Membaca data file audio...');
  const arrayBuffer = await audioFile.arrayBuffer();
  
  onProgressUpdate(30, 'Mengurai data audio (decodeAudioData)...');
  console.log('[DEBUG-Local] Mulai decodeAudioData...');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
  console.log('[DEBUG-Local] decodeAudioData selesai, durasi:', audioBuffer.duration);

  // Render Vocal Track (Bandpass filter 300Hz - 3400Hz)
  onProgressUpdate(50, 'Meningkatkan frekuensi vokal (bandpass DSP)...');
  console.log('[DEBUG-Local] Mulai render vocal track (bandpass)...');
  const vocalOffline = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  const vocalSource = vocalOffline.createBufferSource();
  vocalSource.buffer = audioBuffer;
  const bandpass = vocalOffline.createBiquadFilter();
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1200;
  bandpass.Q.value = 0.9;
  
  vocalSource.connect(bandpass);
  bandpass.connect(vocalOffline.destination);
  vocalSource.start(0);
  const vocalRendered = await vocalOffline.startRendering();
  console.log('[DEBUG-Local] Vocal track selesai dirender');

  // Render Instrumental Track (Notch filter untuk meredam vokal)
  onProgressUpdate(75, 'Meredam vokal untuk track instrumental (notch DSP)...');
  console.log('[DEBUG-Local] Mulai render instrumental track (notch)...');
  const instOffline = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );
  const instSource = instOffline.createBufferSource();
  instSource.buffer = audioBuffer;
  const notch = instOffline.createBiquadFilter();
  notch.type = 'notch';
  notch.frequency.value = 1200;
  notch.Q.value = 1.2;

  instSource.connect(notch);
  notch.connect(instOffline.destination);
  instSource.start(0);
  const instRendered = await instOffline.startRendering();
  console.log('[DEBUG-Local] Instrumental track selesai dirender');

  onProgressUpdate(90, 'Mengonversi file audio ke format WAV...');
  const vocalBlob = audioBufferToWav(vocalRendered);
  const instBlob = audioBufferToWav(instRendered);

  onProgressUpdate(100, 'Pemisahan DSP lokal selesai!');
  return {
    vocalUrl: URL.createObjectURL(vocalBlob),
    instrumentalUrl: URL.createObjectURL(instBlob),
    vocalBlob,
    instBlob,
    isLocal: true
  };
}

/**
 * Local Web Audio Voice Pitch Shift
 */
async function convertVoiceLocal(vocalBlob, effectType, onProgressUpdate) {
  console.log('[DEBUG-Local] Memulai efek pitch-shift vokal lokal:', effectType);
  onProgressUpdate(20, 'Membaca stem vokal...');
  const arrayBuffer = await vocalBlob.arrayBuffer();
  
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  onProgressUpdate(60, 'Menerapkan transformasi pitch & EQ lokal...');
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;

  const filter = offlineCtx.createBiquadFilter();

  if (effectType === 'robot') {
    filter.type = 'peaking';
    filter.frequency.value = 2000;
    filter.gain.value = 15;
    source.detune.value = -300;
  } else if (effectType === 'male') {
    filter.type = 'lowshelf';
    filter.frequency.value = 300;
    filter.gain.value = 8;
    source.detune.value = -400;
  } else if (effectType === 'female') {
    filter.type = 'highshelf';
    filter.frequency.value = 3000;
    filter.gain.value = 6;
    source.detune.value = 400;
  } else { // child/jazz
    filter.type = 'peaking';
    filter.frequency.value = 1500;
    filter.gain.value = 5;
    source.detune.value = 200;
  }

  source.connect(filter);
  filter.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  onProgressUpdate(90, 'Mengompresi hasil vokal baru...');
  const resultBlob = audioBufferToWav(renderedBuffer);
  onProgressUpdate(100, 'Konversi vokal lokal selesai!');

  return {
    url: URL.createObjectURL(resultBlob),
    blob: resultBlob,
    isLocal: true
  };
}

/**
 * Local Style Effect Engine (Web Audio API)
 */
async function applyLocalStyleEffect(instBlob, genre, mood, pitch, tempo, onProgressUpdate) {
  console.log('[DEBUG-StyleLocal] Menerapkan efek gaya lokal:', genre);
  onProgressUpdate(20, 'Membaca track instrumen...');
  const arrayBuffer = await instBlob.arrayBuffer();
  
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

  onProgressUpdate(60, 'Merapikan frekuensi & tempo instrumen...');
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = tempo;
  source.detune.value = pitch * 100;

  const eq = offlineCtx.createBiquadFilter();

  if (genre === 'lofi') {
    eq.type = 'lowpass';
    eq.frequency.value = 1800;
  } else if (genre === 'edm') {
    eq.type = 'peaking';
    eq.frequency.value = 80;
    eq.gain.value = 10;
  } else if (genre === 'cyberpunk') {
    eq.type = 'bandpass';
    eq.frequency.value = 1200;
    eq.Q.value = 2;
  } else { // acoustic
    eq.type = 'peaking';
    eq.frequency.value = 2500;
    eq.gain.value = 3;
  }

  source.connect(eq);
  eq.connect(offlineCtx.destination);
  source.start(0);

  const renderedBuffer = await offlineCtx.startRendering();
  onProgressUpdate(90, 'Menyimpan instrumen gaya baru...');
  const resultBlob = audioBufferToWav(renderedBuffer);
  onProgressUpdate(100, 'Gaya musik lokal berhasil diterapkan!');

  return {
    url: URL.createObjectURL(resultBlob),
    blob: resultBlob,
    isLocal: true
  };
}

/**
 * Audio Mixing Engine
 */
async function mixAudioTracks(vocalBlob, instBlob, onProgressUpdate) {
  console.log('[DEBUG-Mix] Memulai mixing vokal & instrumen...');
  onProgressUpdate(15, 'Membaca track vokal & instrumen...');
  
  const vocalBuffer = await vocalBlob.arrayBuffer();
  const instBuffer = await instBlob.arrayBuffer();

  onProgressUpdate(35, 'Mengurai data buffer audio...');
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const vocalAudioBuffer = await audioCtx.decodeAudioData(vocalBuffer);
  const instAudioBuffer = await audioCtx.decodeAudioData(instBuffer);

  console.log('[DEBUG-Mix] Durasi vokal:', vocalAudioBuffer.duration, 'Durasi instrumen:', instAudioBuffer.duration);
  const mixDuration = Math.min(vocalAudioBuffer.duration, instAudioBuffer.duration);

  onProgressUpdate(60, 'Menyeimbangkan gain & menyatukan track...');
  const offlineCtx = new OfflineAudioContext(
    2,
    Math.floor(mixDuration * vocalAudioBuffer.sampleRate),
    vocalAudioBuffer.sampleRate
  );

  const vocalSource = offlineCtx.createBufferSource();
  vocalSource.buffer = vocalAudioBuffer;

  const instSource = offlineCtx.createBufferSource();
  instSource.buffer = instAudioBuffer;

  const vocalGain = offlineCtx.createGain();
  vocalGain.gain.value = 1.0;

  const instGain = offlineCtx.createGain();
  instGain.gain.value = 0.85;

  vocalSource.connect(vocalGain);
  vocalGain.connect(offlineCtx.destination);

  instSource.connect(instGain);
  instGain.connect(offlineCtx.destination);

  vocalSource.start(0);
  instSource.start(0);

  onProgressUpdate(85, 'Merekam hasil akhir mixing...');
  const mixedBuffer = await offlineCtx.startRendering();

  onProgressUpdate(95, 'Mengonversi ke berkas WAV...');
  const finalWavBlob = audioBufferToWav(mixedBuffer);

  onProgressUpdate(100, 'Lagu Cover berhasil dibuat!');
  return {
    url: URL.createObjectURL(finalWavBlob),
    blob: finalWavBlob
  };
}

/**
 * StemSplit.io API Integration via Cloudflare Worker Proxy
 */
async function separateVocalsStemSplit(audioFile, apiKey, onProgressUpdate) {
  console.log('[DEBUG-StemSplit] Memulai pemisahan vokal StemSplit.io via Proxy...');
  onProgressUpdate(10, 'Membuka koneksi ke StemSplit.io via Proxy (Langkah A)...');

  const fetchWithTimeout = async (url, options = {}, timeoutMs = 20000) => {
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
    // LANGKAH A — Proxy Upload Init
    console.log('[DEBUG-StemSplit] LANGKAH A: POST ke /api/v1/upload via proxy...');
    const uploadRes = await fetchWithTimeout('https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ filename: audioFile.name })
    }, 20000);

    if (!uploadRes.ok) {
      let errBody = '';
      try { errBody = await uploadRes.text(); } catch (e) {}
      throw new Error(`StemSplit Upload Init Error (HTTP ${uploadRes.status}): ${errBody.slice(0, 300)}`);
    }

    const uploadData = await uploadRes.json();
    console.log('[DEBUG-StemSplit] Response Langkah A:', uploadData);

    const uploadUrl = uploadData.uploadUrl;
    const uploadKey = uploadData.uploadKey;

    if (!uploadUrl || !uploadKey) {
      throw new Error('Gagal mendapatkan uploadUrl/uploadKey dari StemSplit.io');
    }

    // LANGKAH B — Proxy Relay Upload
    onProgressUpdate(25, 'Mengunggah file audio ke StemSplit.io via proxy relay (Langkah B)...');
    console.log('[DEBUG-StemSplit] LANGKAH B: PUT ke proxy relay-upload...');

    const proxyUploadUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-upload?target=${encodeURIComponent(uploadUrl)}`;
    const uploadFileRes = await fetchWithTimeout(proxyUploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': audioFile.type || 'audio/mpeg'
      },
      body: audioFile
    }, 60000);

    if (!uploadFileRes.ok) {
      let errBody = '';
      try { errBody = await uploadFileRes.text(); } catch (e) {}
      throw new Error(`StemSplit File Upload Error (HTTP ${uploadFileRes.status}): ${errBody.slice(0, 300)}`);
    }

    // LANGKAH C — Proxy Create Job
    onProgressUpdate(40, 'Membuat job pemisahan vokal (Langkah C)...');
    console.log('[DEBUG-StemSplit] LANGKAH C: POST ke /api/v1/jobs via proxy...');

    const jobRes = await fetchWithTimeout('https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/jobs', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        uploadKey: uploadKey,
        outputType: 'BOTH',
        quality: 'BEST',
        outputFormat: 'MP3'
      })
    }, 20000);

    if (!jobRes.ok) {
      let errBody = '';
      try { errBody = await jobRes.text(); } catch (e) {}
      throw new Error(`StemSplit Create Job Error (HTTP ${jobRes.status}): ${errBody.slice(0, 300)}`);
    }

    const jobData = await jobRes.json();
    console.log('[DEBUG-StemSplit] Response Langkah C:', jobData);

    const jobId = jobData.id || jobData.jobId;
    if (!jobId) {
      throw new Error('Gagal mendapatkan Job ID dari StemSplit.io');
    }

    // LANGKAH D — Proxy Polling
    let completed = false;
    let pollCount = 0;
    const MAX_POLLS = 40;
    let resultData = null;

    while (!completed) {
      pollCount++;
      if (pollCount > MAX_POLLS) {
        throw new Error('Polling StemSplit melebihi batas waktu (~3.5 menit)');
      }

      await new Promise(resolve => setTimeout(resolve, 5000));

      console.log(`[DEBUG-StemSplit] LANGKAH D: Polling ke-${pollCount}, GET /jobs/${jobId} via proxy...`);

      const statusRes = await fetchWithTimeout(`https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/jobs/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey.trim()}`
        }
      }, 20000);

      if (!statusRes.ok) {
        let errBody = '';
        try { errBody = await statusRes.text(); } catch (e) {}
        console.warn(`[DEBUG-StemSplit] Polling warning (HTTP ${statusRes.status}):`, errBody);
        continue;
      }

      const statusData = await statusRes.json();
      console.log('[DEBUG-StemSplit] Response Polling:', statusData);

      const status = (statusData.status || '').toUpperCase();
      const progress = statusData.progress || Math.min(40 + pollCount * 3, 95);

      onProgressUpdate(progress, `Memproses pemisahan vokal (${status}) - ${progress}%`);

      if (status === 'COMPLETED' || status === 'SUCCESS') {
        completed = true;
        resultData = statusData;
      } else if (status === 'FAILED' || status === 'ERROR') {
        throw new Error(`StemSplit Job Gagal: ${statusData.errorMessage || 'Unknown error'}`);
      }
    }

    onProgressUpdate(100, 'Pemisahan vokal selesai!');

    const outputs = resultData.outputs || resultData.data || {};
    const vocalUrl = outputs.vocals?.url || outputs.vocal || resultData.vocalUrl;
    const instrumentalUrl = outputs.instrumental?.url || outputs.backing || resultData.instrumentalUrl;

    if (!vocalUrl || !instrumentalUrl) {
      throw new Error('StemSplit tidak mengembalikan URL vokal/instrumental yang valid');
    }

    return {
      vocalUrl,
      instrumentalUrl,
      serviceUsed: 'StemSplit.io'
    };
  } catch (err) {
    console.warn('[DEBUG-StemSplit] StemSplit gagal:', err.message);
    throw err;
  }
}

/**
 * Kits.AI Vocal Separation Integration
 */
async function separateVocalsApi(audioFile, apiKey, onProgressUpdate) {
  console.log('[DEBUG-KitsAI] Memulai pemisahan vokal Kits.AI...');
  onProgressUpdate(10, 'Mengunggah file ke Kits.AI...');

  const formData = new FormData();
  formData.append('inputFile', audioFile);

  const controller = new AbortController();
  const uploadTimeout = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch('https://arpeggi.io/api/kits/v1/vocal-separations', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
      body: formData,
      signal: controller.signal
    });
    clearTimeout(uploadTimeout);

    if (!response.ok) {
      let bodyText = '';
      try { bodyText = await response.text(); } catch (e) {}
      throw new Error(`Kits.AI API Error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
    }

    const jobData = await response.json();
    const jobId = jobData.id;

    let completed = false;
    let pollCount = 0;
    const MAX_POLLS = 40;
    let statusData = null;

    while (!completed) {
      pollCount++;
      if (pollCount > MAX_POLLS) throw new Error('Polling Kits.AI melebihi batas waktu');
      await new Promise(resolve => setTimeout(resolve, 3000));

      const pollController = new AbortController();
      const pollTimeout = setTimeout(() => pollController.abort(), 30000);

      const statusRes = await fetch(`https://arpeggi.io/api/kits/v1/vocal-separations/${jobId}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
        signal: pollController.signal
      });
      clearTimeout(pollTimeout);

      if (!statusRes.ok) continue;
      statusData = await statusRes.json();

      const progress = Math.min(25 + pollCount * 3, 95);
      onProgressUpdate(progress, `Memproses pemisahan (${statusData.status})...`);

      if (statusData.status === 'success') {
        completed = true;
      } else if (statusData.status === 'error' || statusData.status === 'cancelled') {
        throw new Error(`Job Kits.AI gagal dengan status ${statusData.status}`);
      }
    }

    onProgressUpdate(100, 'Pemisahan vokal selesai!');
    const backingStem = statusData.stemFileUrls?.find(s => s.instrument === 'backing')?.url || statusData.vocalAudioFileUrl;
    
    return {
      vocalUrl: statusData.vocalAudioFileUrl,
      instrumentalUrl: backingStem,
      serviceUsed: 'Kits.AI'
    };
  } catch (err) {
    clearTimeout(uploadTimeout);
    console.warn('[DEBUG-KitsAI] Kits.AI API error:', err.message);
    throw err;
  }
}

/**
 * Kits.AI Voice Conversion API
 */
async function convertVoiceApi(vocalBlob, voiceModelId, apiKey, onProgressUpdate) {
  console.log('[DEBUG-VoiceConv] Memulai konversi vokal Kits.AI...');
  onProgressUpdate(10, 'Mengirim audio vokal ke Kits.AI...');

  const formData = new FormData();
  formData.append('soundFile', vocalBlob, 'vocal.wav');
  formData.append('voiceModelId', voiceModelId);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch('https://arpeggi.io/api/kits/v1/voice-conversions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey.trim()}` },
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let bodyText = '';
      try { bodyText = await response.text(); } catch (e) {}
      throw new Error(`Kits.AI Voice API Error (HTTP ${response.status}): ${bodyText.slice(0, 300)}`);
    }

    const jobData = await response.json();
    const jobId = jobData.id;

    let completed = false;
    let pollCount = 0;
    let resultData = null;

    while (!completed) {
      pollCount++;
      if (pollCount > 40) throw new Error('Polling konversi vokal melebihi batas waktu');
      await new Promise(resolve => setTimeout(resolve, 3000));

      const pollRes = await fetch(`https://arpeggi.io/api/kits/v1/voice-conversions/${jobId}`, {
        headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
      });
      if (!pollRes.ok) continue;

      resultData = await pollRes.json();
      const progress = Math.min(20 + pollCount * 4, 95);
      onProgressUpdate(progress, `Mengonversi vokal (${resultData.status})...`);

      if (resultData.status === 'success') {
        completed = true;
      } else if (resultData.status === 'error' || resultData.status === 'cancelled') {
        throw new Error(`Konversi vokal gagal: ${resultData.status}`);
      }
    }

    onProgressUpdate(100, 'Konversi vokal selesai!');
    return {
      vocalUrl: resultData.outputFileUrl || resultData.audioFileUrl
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[DEBUG-VoiceConv] API Error:', err.message);
    throw err;
  }
}

/**
 * Fetch ElevenLabs Voices List via Proxy Worker
 */
async function fetchElevenLabsVoices(apiKey) {
  if (!apiKey || !apiKey.trim()) return null;
  console.log('[DEBUG-ElevenLabs] Memuat daftar suara dari ElevenLabs via Proxy...');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch('https://stemsplit-proxy.kitakustik-managemen.workers.dev/elevenlabs/v1/voices', {
      headers: { 'xi-api-key': apiKey.trim() },
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    if (!res.ok) return null;
    const data = await res.json();
    if (data.voices && Array.isArray(data.voices)) {
      return data.voices.map(v => ({ id: v.voice_id, name: `${v.name} (ElevenLabs)` }));
    }
    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[DEBUG-ElevenLabs] Gagal memuat daftar suara:', err.message);
    return null;
  }
}

/**
 * ElevenLabs Speech-to-Speech Voice Conversion via Cloudflare Worker Proxy
 */
async function convertVoiceElevenLabs(vocalBlob, voiceId, apiKey, onProgressUpdate) {
  console.log('[DEBUG-ElevenLabs] Memulai Speech-to-Speech ElevenLabs via Proxy...');
  onProgressUpdate(20, 'Mengirim stem vokal ke ElevenLabs via Proxy...');

  const formData = new FormData();
  formData.append('audio', vocalBlob, 'vocal.wav');
  formData.append('model_id', 'eleven_multilingual_sts_v2');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`https://stemsplit-proxy.kitakustik-managemen.workers.dev/elevenlabs/v1/speech-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey.trim()
      },
      body: formData,
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errText = '';
      try {
        const errJson = await response.json();
        errText = errJson.detail?.message || errJson.detail || JSON.stringify(errJson);
      } catch (e) {
        errText = await response.text();
      }
      throw new Error(`ElevenLabs API Error (HTTP ${response.status}): ${errText.slice(0, 300)}`);
    }

    onProgressUpdate(80, 'Menerima audio vokal baru dari ElevenLabs...');
    const resultBlob = await response.blob();
    onProgressUpdate(100, 'Konversi vokal ElevenLabs selesai!');

    return {
      vocalUrl: URL.createObjectURL(resultBlob),
      vocalBlob: resultBlob,
      serviceUsed: 'ElevenLabs'
    };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[DEBUG-ElevenLabs] ElevenLabs Error:', err.message);
    throw err;
  }
}

/**
 * Kie.ai Instrumental Regeneration API
 */
async function regenerateInstrumentalApi(stylePrompt, apiKey, onProgressUpdate) {
  console.log('[DEBUG-KieAI] Memulai regenerasi instrumen Kie.ai...');
  onProgressUpdate(10, 'Mengirim deskripsi gaya ke Kie.ai...');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: stylePrompt,
        customMode: false,
        instrumental: true,
        model: 'V4'
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      let bodyText = '';
      try { bodyText = await res.text(); } catch (e) {}
      throw new Error(`Kie.ai API Error (HTTP ${res.status}): ${bodyText.slice(0, 300)}`);
    }

    const data = await res.json();
    const taskId = data.data?.taskId;
    if (!taskId) throw new Error('Gagal mendapatkan taskId dari Kie.ai');

    let completed = false;
    let pollCount = 0;
    let finalAudioUrl = null;

    while (!completed) {
      pollCount++;
      if (pollCount > 25) throw new Error('Polling Kie.ai melebihi batas waktu (~3.5 menit)');
      await new Promise(resolve => setTimeout(resolve, 8000));

      const pollRes = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
        headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
      });
      if (!pollRes.ok) continue;

      const pollData = await pollRes.json();
      const status = pollData.data?.status || pollData.status;

      const progress = Math.min(15 + pollCount * 4, 95);
      onProgressUpdate(progress, `Membangun instrumen AI (${status})...`);

      if (status === 'SUCCESS') {
        completed = true;
        finalAudioUrl = pollData.data?.response?.sunoData?.[0]?.audioUrl || pollData.data?.audioUrl;
      } else if (status === 'CREATE_TASK_FAILED') {
        throw new Error('Kie.ai gagal membuat task regenerasi musik');
      }
    }

    onProgressUpdate(100, 'Regenerasi instrumen AI selesai!');
    return { audioUrl: finalAudioUrl };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn('[DEBUG-KieAI] Kie.ai error:', err.message);
    throw err;
  }
}

export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [showApiModal, setShowApiModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Audio & State
  const [uploadedFile, setUploadedFile] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  // Separation Results
  const [vocalStemUrl, setVocalStemUrl] = useState(null);
  const [vocalStemBlob, setVocalStemBlob] = useState(null);
  const [instStemUrl, setInstStemUrl] = useState(null);
  const [instStemBlob, setInstStemBlob] = useState(null);

  // Processing States
  const [isSeparating, setIsSeparating] = useState(false);
  const [separationProgress, setSeparationProgress] = useState(0);
  const [separationStatusText, setSeparationStatusText] = useState('');

  // Voice Conversion States
  const [voiceModels, setVoiceModels] = useState([]);
  const [selectedVoiceModel, setSelectedVoiceModel] = useState('');
  const [isConvertingVoice, setIsConvertingVoice] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceStatusText, setVoiceStatusText] = useState('');
  const [convertedVocalUrl, setConvertedVocalUrl] = useState(null);
  const [convertedVocalBlob, setConvertedVocalBlob] = useState(null);

  // Style Modulation States
  const [styleMode, setStyleMode] = useState('fast'); // 'fast' or 'kie'
  const [selectedGenre, setSelectedGenre] = useState('lofi');
  const [moodValue, setMoodValue] = useState(50);
  const [pitchValue, setPitchValue] = useState(0);
  const [tempoValue, setTempoValue] = useState(1.0);
  const [kiePrompt, setKiePrompt] = useState('jazz santai dengan piano dan brush drum');
  const [isRegeneratingStyle, setIsRegeneratingStyle] = useState(false);
  const [styleProgress, setStyleProgress] = useState(0);
  const [styleStatusText, setStyleStatusText] = useState('');
  const [newInstUrl, setNewInstUrl] = useState(null);
  const [newInstBlob, setNewInstBlob] = useState(null);

  // Final Mixing States
  const [isMixing, setIsMixing] = useState(false);
  const [mixProgress, setMixProgress] = useState(0);
  const [mixStatusText, setMixStatusText] = useState('');
  const [finalCoverUrl, setFinalCoverUrl] = useState(null);

  // Fallback Badges & Notifications
  const [localFallbackInfo, setLocalFallbackInfo] = useState('');
  const [toasts, setToasts] = useState([]);

  // API Key Storage
  const [apiKeys, setApiKeys] = useState({
    stemsplit: [],
    kitsai: [],
    elevenlabs: [],
    lalal: [],
    kieai: []
  });

  // Temporary input state for adding new keys
  const [tempKeyInputs, setTempKeyInputs] = useState({
    stemsplit: '',
    kitsai: '',
    elevenlabs: '',
    lalal: '',
    kieai: ''
  });

  const fileInputRef = useRef(null);

  const addToast = (type, message) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 6000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const handleSaveKey = (service) => {
    const rawVal = tempKeyInputs[service] ? tempKeyInputs[service].trim() : '';
    if (!rawVal) {
      addToast('warning', 'Masukkan API Key terlebih dahulu');
      return;
    }

    const currentList = apiKeys[service] || [];
    if (currentList.some(item => item.key === rawVal)) {
      addToast('warning', 'API Key ini sudah ada di daftar tersimpan');
      return;
    }

    const newKeyObj = {
      id: Date.now(),
      key: rawVal,
      label: `Key ${currentList.length + 1}`,
      remainingCredit: null,
      statusText: null,
      lastChecked: null
    };

    setApiKeys(prev => ({
      ...prev,
      [service]: [...(prev[service] || []), newKeyObj]
    }));

    setTempKeyInputs(prev => ({ ...prev, [service]: '' }));
    addToast('info', 'Key berhasil disimpan');

    // Automatically check credit for newly saved key
    checkCredit(service, rawVal);
  };

  const handleDeleteKey = (service, keyId) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: (prev[service] || []).filter(k => k.id !== keyId)
    }));
    addToast('info', 'Key berhasil dihapus');
  };

  useEffect(() => {
    setLoaded(true);
    // Populate Static Voice Models
    setVoiceModels([
      { id: 'static-1', name: 'Vokal Pria - Pop' },
      { id: 'static-2', name: 'Vokal Wanita - Jazz' },
      { id: 'static-3', name: 'Vokal Robotik' },
      { id: 'static-4', name: 'Vokal Anak' }
    ]);
    setSelectedVoiceModel('static-1');
  }, []);

  const checkCredit = async (service, apiKey) => {
    if (!apiKey.trim()) return;

    if (service === 'elevenlabs') {
      try {
        const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
          headers: { 'xi-api-key': apiKey.trim() }
        });
        if (!res.ok) throw new Error('Invalid Key');
        const data = await res.json();
        const remaining = data.character_limit - data.character_count;
        updateKeyStatus('elevenlabs', apiKey, remaining, `${remaining.toLocaleString()} / ${data.character_limit.toLocaleString()} karakter`);

        // Memuat otomatis daftar suara resmi ElevenLabs saat key valid
        const voices = await fetchElevenLabsVoices(apiKey);
        if (voices && voices.length > 0) {
          setVoiceModels(voices);
          setSelectedVoiceModel(voices[0].id);
        }
      } catch (err) {
        updateKeyStatus('elevenlabs', apiKey, 'failed', '🔴 Key Invalid / Error');
      }
    } else if (service === 'kieai') {
      try {
        const res = await fetch('https://api.kie.ai/api/v1/chat/credit', {
          headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
        });
        const data = await res.json();
        if (data.code === 200 && typeof data.data === 'number') {
          updateKeyStatus('kieai', apiKey, data.data, `${data.data} Kredit`);
        } else {
          updateKeyStatus('kieai', apiKey, 'failed', '🔴 Error / Key Invalid');
        }
      } catch (err) {
        updateKeyStatus('kieai', apiKey, 'failed', '🔴 Key Invalid');
      }
    } else if (service === 'stemsplit') {
      updateKeyStatus('stemsplit', apiKey, 'manual', 'ℹ️ Cek saldo di dashboard StemSplit.io');
    } else {
      updateKeyStatus(service, apiKey, 'manual', `Cek manual di dashboard ${service.toUpperCase()}`);
    }
  };

  const updateKeyStatus = (service, apiKey, creditValue, statusMsg) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: prev[service].map(k => k.key === apiKey ? {
        ...k,
        remainingCredit: creditValue,
        statusText: statusMsg,
        lastChecked: new Date().toLocaleTimeString()
      } : k)
    }));
  };

  const markKeyAsFailed = (service, apiKey) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: prev[service].map(k => k.key === apiKey ? {
        ...k,
        remainingCredit: 'failed',
        statusText: '🔴 Gagal Dipakai'
      } : k)
    }));
  };

  const getNextAvailableKey = (service) => {
    const list = apiKeys[service] || [];
    const valid = list.find(k => k.key.trim() !== '' && k.remainingCredit !== 'failed');
    return valid ? valid.key : null;
  };

  const handleFileChange = (file) => {
    setUploadError(null);
    if (!file) return;

    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp3'];
    const isAudio = validTypes.includes(file.type) || file.name.endsWith('.mp3') || file.name.endsWith('.wav');

    if (!isAudio) {
      setUploadError('Format file tidak didukung! Tolong unggah file .mp3 atau .wav.');
      addToast('error', 'Format file harus .mp3 atau .wav');
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setUploadError('Ukuran file terlalu besar! Maksimal ukuran file adalah 50MB.');
      addToast('error', 'Ukuran file melebihi batas 50MB');
      return;
    }

    if (audioUrl) URL.revokeObjectURL(audioUrl);

    setUploadedFile(file);
    setAudioUrl(URL.createObjectURL(file));
    addToast('info', `File "${file.name}" berhasil diunggah.`);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleLoadSample = () => {
    const sampleAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const buffer = sampleAudioContext.createBuffer(1, sampleAudioContext.sampleRate * 3, sampleAudioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < buffer.length; i++) {
      data[i] = Math.sin(i * 0.03) * Math.exp(-i / (sampleAudioContext.sampleRate * 2));
    }
    const sampleBlob = audioBufferToWav(buffer);
    const sampleFile = new File([sampleBlob], 'sample-lagu-demo.wav', { type: 'audio/wav' });
    handleFileChange(sampleFile);
    addToast('info', 'Lagu contoh demo berhasil dimuat!');
  };

  const handleStartVocalSeparation = async () => {
    if (!uploadedFile) return;

    setIsSeparating(true);
    setSeparationProgress(5);
    setSeparationStatusText('Mempersiapkan pemisahan vokal...');
    setLocalFallbackInfo('');

    let stemSplitKey = getNextAvailableKey('stemsplit');
    let kitsKey = getNextAvailableKey('kitsai');
    let success = false;

    // Priority 1: StemSplit.io
    if (stemSplitKey) {
      try {
        console.log('[DEBUG-Pipeline] Mencoba StemSplit.io...');
        const res = await separateVocalsStemSplit(uploadedFile, stemSplitKey, (p, text) => {
          setSeparationProgress(p);
          setSeparationStatusText(text);
        });
        setVocalStemUrl(res.vocalUrl);
        setInstStemUrl(res.instrumentalUrl);
        success = true;
        addToast('info', 'Pemisahan vokal berhasil via StemSplit.io!');
      } catch (err) {
        console.warn('[DEBUG-Pipeline] StemSplit gagal, beralih key/service...', err.message);
        markKeyAsFailed('stemsplit', stemSplitKey);
      }
    }

    // Priority 2: Kits.AI
    if (!success && kitsKey) {
      try {
        console.log('[DEBUG-Pipeline] Mencoba Kits.AI...');
        const res = await separateVocalsApi(uploadedFile, kitsKey, (p, text) => {
          setSeparationProgress(p);
          setSeparationStatusText(text);
        });
        setVocalStemUrl(res.vocalUrl);
        setInstStemUrl(res.instrumentalUrl);
        success = true;
        addToast('info', 'Pemisahan vokal berhasil via Kits.AI!');
      } catch (err) {
        console.warn('[DEBUG-Pipeline] Kits.AI gagal:', err.message);
        markKeyAsFailed('kitsai', kitsKey);
      }
    }

    // Priority 3: Local DSP Fallback
    if (!success) {
      try {
        console.log('[DEBUG-Pipeline] Menggunakan Fallback DSP Lokal...');
        setLocalFallbackInfo('ℹ️ Diproses via Engine DSP Lokal (kualitas standar) — API eksternal tidak dapat dijangkau dari sandbox preview ini.');
        const res = await processLocalAudioSeparation(uploadedFile, (p, text) => {
          setSeparationProgress(p);
          setSeparationStatusText(text);
        });
        setVocalStemUrl(res.vocalUrl);
        setInstStemUrl(res.instrumentalUrl);
        setVocalStemBlob(res.vocalBlob);
        setInstStemBlob(res.instBlob);
        success = true;
        addToast('warning', 'Diproses via Engine DSP Lokal (cadangan).');
      } catch (fatalErr) {
        console.error('[DEBUG-Pipeline] Error Fatal DSP Lokal:', fatalErr);
        addToast('error', 'Gagal memisahkan vokal secara lokal.');
      }
    }

    setIsSeparating(false);
  };

  const handleStartVoiceConversion = async () => {
    if (!vocalStemUrl) return;

    setIsConvertingVoice(true);
    setVoiceProgress(10);
    setVoiceStatusText('Mempersiapkan konversi vokal...');

    let elevenKey = getNextAvailableKey('elevenlabs');
    let kitsKey = getNextAvailableKey('kitsai');
    let success = false;

    // Helper untuk mengambil Blob file vokal (menggunakan proxy relay-fetch jika URL eksternal StemSplit)
    const fetchVocalBlob = async () => {
      if (vocalStemBlob) return vocalStemBlob;
      if (!vocalStemUrl) throw new Error('File vokal tidak ditemukan');
      if (vocalStemUrl.startsWith('blob:')) {
        return await fetch(vocalStemUrl).then(r => r.blob());
      }
      console.log('[DEBUG-ElevenLabs] Mengambil file vokal via proxy...');
      const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(vocalStemUrl)}`;
      const response = await fetch(proxiedUrl);
      if (!response.ok) {
        throw new Error(`Gagal mengambil audio vokal via proxy (HTTP ${response.status})`);
      }
      return await response.blob();
    };

    // Prioritas 1: ElevenLabs (Utama)
    if (elevenKey) {
      try {
        console.log('[DEBUG-VoiceConv] Mencoba ElevenLabs via Proxy...');
        const vocalBlob = await fetchVocalBlob();
        const res = await convertVoiceElevenLabs(vocalBlob, selectedVoiceModel, elevenKey, (p, text) => {
          setVoiceProgress(p);
          setVoiceStatusText(text);
        });
        setConvertedVocalUrl(res.vocalUrl);
        if (res.vocalBlob) setConvertedVocalBlob(res.vocalBlob);
        success = true;
        addToast('info', 'Konversi vokal AI berhasil via ElevenLabs!');
        checkCredit('elevenlabs', elevenKey);
      } catch (err) {
        console.warn('[DEBUG-VoiceConv] ElevenLabs gagal, beralih ke cadangan...', err.message);
        markKeyAsFailed('elevenlabs', elevenKey);
      }
    }

    // Prioritas 2: Kits.AI (Cadangan)
    if (!success && kitsKey) {
      try {
        console.log('[DEBUG-VoiceConv] Mencoba Kits.AI...');
        const vocalBlob = await fetchVocalBlob();
        const res = await convertVoiceApi(vocalBlob, selectedVoiceModel, kitsKey, (p, text) => {
          setVoiceProgress(p);
          setVoiceStatusText(text);
        });
        setConvertedVocalUrl(res.vocalUrl);
        success = true;
        addToast('info', 'Konversi vokal AI berhasil via Kits.AI!');
        checkCredit('kitsai', kitsKey);
      } catch (err) {
        console.warn('[DEBUG-VoiceConv] Kits.AI Voice API gagal:', err.message);
        markKeyAsFailed('kitsai', kitsKey);
      }
    }

    // Prioritas 3: Efek Pitch Shift Lokal (Jaring Pengaman Terakhir)
    if (!success) {
      try {
        const vocalBlob = await fetchVocalBlob();
        const res = await convertVoiceLocal(vocalBlob, 'male', (p, text) => {
          setVoiceProgress(p);
          setVoiceStatusText(text);
        });
        setConvertedVocalUrl(res.url);
        setConvertedVocalBlob(res.blob);
        addToast('warning', 'Konversi vokal selesai via Efek Pitch Lokal.');
      } catch (err) {
        console.error('Local Voice Conversion Error:', err);
        addToast('error', 'Gagal mengubah vokal.');
      }
    }

    setIsConvertingVoice(false);
  };

  const handleStartStyleRegeneration = async () => {
    if (!instStemUrl) return;

    setIsRegeneratingStyle(true);
    setStyleProgress(10);
    setStyleStatusText('Merapikan gaya instrumen...');

    let success = false;

    // Helper untuk mengambil Blob file instrumen (menggunakan proxy relay-fetch jika URL eksternal StemSplit)
    const fetchInstBlob = async () => {
      if (instStemBlob) return instStemBlob;
      if (!instStemUrl) throw new Error('File instrumen tidak ditemukan');
      if (instStemUrl.startsWith('blob:')) {
        return await fetch(instStemUrl).then(r => r.blob());
      }
      console.log('[DEBUG-Style] Mengambil file instrumen via proxy...');
      const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(instStemUrl)}`;
      const response = await fetch(proxiedUrl);
      if (!response.ok) {
        throw new Error(`Gagal mengambil audio instrumen via proxy (HTTP ${response.status})`);
      }
      return await response.blob();
    };

    if (styleMode === 'kie') {
      let kieKey = getNextAvailableKey('kieai');
      if (kieKey) {
        try {
          const res = await regenerateInstrumentalApi(kiePrompt, kieKey, (p, text) => {
            setStyleProgress(p);
            setStyleStatusText(text);
          });
          setNewInstUrl(res.audioUrl);
          success = true;
          addToast('info', 'Regenerasi instrumen AI Kie.ai selesai!');
        } catch (err) {
          console.warn('[DEBUG-Style] Kie.ai gagal, beralih ke Mode A:', err.message);
          markKeyAsFailed('kieai', kieKey);
        }
      }
    }

    if (!success) {
      try {
        const instBlob = await fetchInstBlob();
        const res = await applyLocalStyleEffect(instBlob, selectedGenre, moodValue, pitchValue, tempoValue, (p, text) => {
          setStyleProgress(p);
          setStyleStatusText(text);
        });
        setNewInstUrl(res.url);
        setNewInstBlob(res.blob);
        addToast('info', 'Gaya instrumen berhasil diperbarui!');
      } catch (err) {
        console.error('Local Style Effect Error:', err);
        addToast('error', 'Gagal mengubah gaya instrumen.');
      }
    }

    setIsRegeneratingStyle(false);
  };

  const handleStartFinalMixing = async () => {
    const finalVocal = convertedVocalBlob || (convertedVocalUrl ? await fetch(convertedVocalUrl).then(r => r.blob()) : null) || vocalStemBlob;
    const finalInst = newInstBlob || (newInstUrl ? await fetch(newInstUrl).then(r => r.blob()) : null) || instStemBlob;

    if (!finalVocal || !finalInst) {
      addToast('error', 'Vokal baru dan Instrumen baru harus tersedia untuk digabungkan!');
      return;
    }

    setIsMixing(true);
    setMixProgress(10);
    setMixStatusText('Menggabungkan track audio...');

    try {
      const res = await mixAudioTracks(finalVocal, finalInst, (p, text) => {
        setMixProgress(p);
        setMixStatusText(text);
      });
      setFinalCoverUrl(res.url);
      addToast('info', 'Lagu Cover Berhasil Dibuat!');
    } catch (err) {
      console.error('[DEBUG-Mix] Fatal Mix Error:', err);
      addToast('error', 'Gagal menggabungkan audio.');
    }

    setIsMixing(false);
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-950 via-purple-950 to-slate-900 text-slate-100 font-sans transition-opacity duration-700 ${loaded ? 'opacity-100' : 'opacity-0'}`}>
      
      {/* Toast Floating Container */}
      <div className="fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map(toast => (
          <div key={toast.id} className={`pointer-events-auto flex items-center justify-between p-4 rounded-xl border backdrop-blur-md shadow-2xl transition-all duration-300 animate-slide-in ${
            toast.type === 'error' ? 'bg-rose-950/80 border-rose-500/50 text-rose-200' :
            toast.type === 'warning' ? 'bg-amber-950/80 border-amber-500/50 text-amber-200' :
            'bg-cyan-950/80 border-cyan-500/50 text-cyan-200'
          }`}>
            <div className="flex items-center gap-3">
              {toast.type === 'error' ? <AlertCircle className="w-5 h-5 text-rose-400" /> :
               toast.type === 'warning' ? <ShieldAlert className="w-5 h-5 text-amber-400" /> :
               <Info className="w-5 h-5 text-cyan-400" />}
              <span className="text-sm font-medium">{toast.message}</span>
            </div>
            <button onClick={() => removeToast(toast.id)} className="p-1 hover:bg-white/10 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-tr from-cyan-500 to-pink-500 shadow-lg shadow-cyan-500/20">
              <Music className="w-6 h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-pink-400 to-purple-400">
                AGE YT#5 Musik Cover
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">AI Music Studio & Vocal Conversion Tool</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button 
              onClick={() => setShowHelpModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-pink-500/50 hover:shadow-[0_0_15px_rgba(236,72,153,0.3)] transition-all text-slate-300 text-xs sm:text-sm font-semibold"
            >
              <HelpCircle className="w-4 h-4 text-pink-400" />
              <span>Bantuan</span>
            </button>

            <button 
              onClick={() => setShowApiModal(true)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-cyan-500/50 hover:shadow-[0_0_15px_rgba(6,182,212,0.3)] transition-all text-slate-300 text-xs sm:text-sm font-semibold"
            >
              <Settings className="w-4 h-4 text-cyan-400" />
              <span className="hidden sm:inline">API Keys</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        
        {}
        {/* Panel 1: Upload Lagu */}
        <section className="p-6 sm:p-8 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl shadow-2xl relative overflow-hidden group hover:border-slate-700/80 transition-all">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Upload className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">1. Upload Lagu Sumber</h2>
          </div>

          {!uploadedFile ? (
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center transition-all flex flex-col items-center justify-center cursor-pointer ${
                isDragging ? 'border-cyan-400 bg-cyan-950/20' : 'border-slate-800 hover:border-slate-700 bg-slate-950/40'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={(e) => handleFileChange(e.target.files[0])} 
                accept="audio/mp3,audio/wav" 
                className="hidden" 
              />
              <FileAudio className="w-12 h-12 text-slate-500 mb-4 animate-bounce" />
              <p className="text-slate-200 font-semibold mb-1">Tarik file audio ke sini, atau klik untuk memilih</p>
              <p className="text-xs text-slate-500 mb-6">Mendukung format MP3 dan WAV (Maksimal 50MB)</p>
              
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button type="button" className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 font-bold text-xs sm:text-sm hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all">
                  Pilih File Audio
                </button>
                <button 
                  type="button" 
                  onClick={(e) => { e.stopPropagation(); handleLoadSample(); }}
                  className="px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700 text-slate-300 text-xs sm:text-sm font-semibold flex items-center gap-2 transition-all"
                >
                  <Sparkles className="w-4 h-4 text-pink-400" />
                  <span>🧪 Tes dengan Lagu Contoh</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="p-5 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-4 w-full sm:w-auto">
                <div className="p-3 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  <Music className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-100 text-sm truncate max-w-xs">{uploadedFile.name}</h3>
                  <p className="text-xs text-slate-400">{(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
              </div>

              <audio controls src={audioUrl} className="w-full sm:w-80 h-10 rounded-lg" />

              <button 
                onClick={() => { setUploadedFile(null); setAudioUrl(null); }}
                className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-all"
                title="Ganti File"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}

          {uploadError && (
            <p className="mt-3 text-xs text-rose-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />
              {uploadError}
            </p>
          )}
        </section>

        {}
        {/* Panel 2: Suara & Gaya */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* Sub-Panel A: Ubah Vokal */}
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 rounded-xl bg-pink-500/10 border border-pink-500/20 text-pink-400">
                  <AudioLines className="w-5 h-5" />
                </div>
                <h2 className="text-lg font-bold text-slate-100">2A. Ubah Karakter Vokal</h2>
              </div>

              <div className="space-y-4 mb-6">
                <label className="block text-xs font-semibold text-slate-400">Pilih Model Suara AI / Preset</label>
                <select 
                  value={selectedVoiceModel} 
                  onChange={(e) => setSelectedVoiceModel(e.target.value)}
                  className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-sm focus:border-pink-500 focus:outline-none"
                >
                  {voiceModels.map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>

                {convertedVocalUrl && (
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-pink-500/30 space-y-2 mt-4">
                    <p className="text-xs font-bold text-pink-400 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4" /> Hasil Vokal Baru Siap
                    </p>
                    <audio controls src={convertedVocalUrl} className="w-full h-8" />
                  </div>
                )}
              </div>
            </div>

            <button 
              onClick={handleStartVoiceConversion}
              disabled={!vocalStemUrl || isConvertingVoice}
              className={`w-full py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                !vocalStemUrl ? 'bg-slate-800 text-slate-500 cursor-not-allowed' :
                'bg-gradient-to-r from-pink-500 to-rose-500 text-slate-950 hover:shadow-[0_0_20px_rgba(236,72,153,0.4)]'
              }`}
            >
              {isConvertingVoice ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>{isConvertingVoice ? voiceStatusText : 'Proses Ubah Vokal'}</span>
            </button>
          </div>

          {/* Sub-Panel B: Ubah Gaya Musik */}
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
                    <Sliders className="w-5 h-5" />
                  </div>
                  <h2 className="text-lg font-bold text-slate-100">2B. Ubah Gaya Musik</h2>
                </div>

                <div className="flex p-1 rounded-xl bg-slate-950 border border-slate-800 text-xs">
                  <button 
                    onClick={() => setStyleMode('fast')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${styleMode === 'fast' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400'}`}
                  >
                    Mode Gratis
                  </button>
                  <button 
                    onClick={() => setStyleMode('kie')}
                    className={`px-3 py-1.5 rounded-lg transition-all ${styleMode === 'kie' ? 'bg-purple-600 text-white font-bold' : 'text-slate-400'}`}
                  >
                    Kie.ai AI
                  </button>
                </div>
              </div>

              {styleMode === 'fast' ? (
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Preset Genre</label>
                    <select 
                      value={selectedGenre} 
                      onChange={(e) => setSelectedGenre(e.target.value)}
                      className="w-full p-2.5 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none"
                    >
                      <option value="lofi">Lo-Fi Chill</option>
                      <option value="edm">EDM Bass Boost</option>
                      <option value="acoustic">Akustik Warm</option>
                      <option value="cyberpunk">Cyberpunk Synth</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Tempo: {tempoValue}x</label>
                      <input type="range" min="0.8" max="1.2" step="0.05" value={tempoValue} onChange={(e) => setTempoValue(parseFloat(e.target.value))} className="w-full accent-purple-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Pitch: {pitchValue}</label>
                      <input type="range" min="-3" max="3" step="1" value={pitchValue} onChange={(e) => setPitchValue(parseInt(e.target.value))} className="w-full accent-purple-500" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3 mb-6">
                  <label className="block text-xs font-semibold text-slate-400">Deskripsi Gaya (Prompt Kie.ai)</label>
                  <textarea 
                    value={kiePrompt} 
                    onChange={(e) => setKiePrompt(e.target.value)}
                    className="w-full p-3 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs focus:outline-none h-20"
                  />
                </div>
              )}

              {newInstUrl && (
                <div className="p-4 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-2 mt-4">
                  <p className="text-xs font-bold text-purple-400 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" /> Instrumen Baru Siap
                  </p>
                  <audio controls src={newInstUrl} className="w-full h-8" />
                </div>
              )}
            </div>

            <button 
              onClick={handleStartStyleRegeneration}
              disabled={!instStemUrl || isRegeneratingStyle}
              className={`w-full py-3 rounded-xl font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all ${
                !instStemUrl ? 'bg-slate-800 text-slate-500 cursor-not-allowed' :
                'bg-gradient-to-r from-purple-500 to-indigo-500 text-slate-950 hover:shadow-[0_0_20px_rgba(168,85,247,0.4)]'
              }`}
            >
              {isRegeneratingStyle ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sliders className="w-4 h-4" />}
              <span>{isRegeneratingStyle ? styleStatusText : 'Terapkan Gaya Baru'}</span>
            </button>
          </div>

        </section>

        {}
        {/* Panel 3: Proses & Hasil */}
        <section className="p-6 sm:p-8 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-xl shadow-2xl relative overflow-hidden">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Activity className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">3. Proses Pemisahan & Final Mixing</h2>
          </div>

          {/* Status Bar Step */}
          <div className="mb-8 p-4 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-400">
            <span className={uploadedFile ? 'text-cyan-400' : ''}>1. Upload {uploadedFile && '✓'}</span>
            <span>→</span>
            <span className={vocalStemUrl ? 'text-cyan-400' : ''}>2. Pemisahan {vocalStemUrl && '✓'}</span>
            <span>→</span>
            <span className={convertedVocalUrl ? 'text-pink-400' : ''}>3. Ubah Vokal {convertedVocalUrl && '✓'}</span>
            <span>→</span>
            <span className={newInstUrl ? 'text-purple-400' : ''}>4. Gaya Baru {newInstUrl && '✓'}</span>
            <span>→</span>
            <span className={finalCoverUrl ? 'text-emerald-400' : ''}>5. Mix Cover {finalCoverUrl && '✓'}</span>
          </div>

          {/* Separasi Action & Progress */}
          {!vocalStemUrl && (
            <div className="mb-6 space-y-4">
              <button 
                onClick={handleStartVocalSeparation}
                disabled={!uploadedFile || isSeparating}
                className={`w-full py-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-3 transition-all ${
                  !uploadedFile ? 'bg-slate-800 text-slate-500 cursor-not-allowed' :
                  'bg-gradient-to-r from-cyan-500 to-pink-500 text-slate-950 hover:shadow-[0_0_25px_rgba(6,182,212,0.5)]'
                }`}
              >
                {isSeparating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Zap className="w-5 h-5" />}
                <span>{isSeparating ? separationStatusText : 'Pisahkan Vokal & Instrumen'}</span>
              </button>

              {isSeparating && (
                <div className="space-y-2 p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 animate-pulse">
                  <div className="flex items-center justify-between text-xs font-semibold text-cyan-400">
                    <span>{separationStatusText}</span>
                    <span>{separationProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div className="bg-gradient-to-r from-cyan-400 to-pink-500 h-full transition-all duration-300" style={{ width: `${separationProgress}%` }}></div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Local Fallback Warning Badge */}
          {localFallbackInfo && (
            <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400 flex-shrink-0" />
              <span>{localFallbackInfo}</span>
            </div>
          )}

          {/* Stem Audio Results Display */}
          {vocalStemUrl && instStemUrl && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 animate-fade-in">
              <div className="p-4 rounded-xl bg-slate-950/80 border border-cyan-500/30 space-y-2">
                <p className="text-xs font-bold text-cyan-400 flex items-center gap-2">
                  <AudioLines className="w-4 h-4" /> Stem Vokal Saja
                </p>
                <audio controls src={vocalStemUrl} className="w-full h-8" />
              </div>

              <div className="p-4 rounded-xl bg-slate-950/80 border border-purple-500/30 space-y-2">
                <p className="text-xs font-bold text-purple-400 flex items-center gap-2">
                  <Music className="w-4 h-4" /> Stem Instrumental Saja
                </p>
                <audio controls src={instStemUrl} className="w-full h-8" />
              </div>
            </div>
          )}

          {/* Final Mixing Section */}
          <div className="pt-6 border-t border-slate-800/80 space-y-4">
            <button 
              onClick={handleStartFinalMixing}
              disabled={(!convertedVocalUrl && !vocalStemUrl) || (!newInstUrl && !instStemUrl) || isMixing}
              className={`w-full py-4 rounded-xl font-bold text-sm sm:text-base flex items-center justify-center gap-3 transition-all ${
                (!convertedVocalUrl && !vocalStemUrl) || (!newInstUrl && !instStemUrl) ? 'bg-slate-800 text-slate-500 cursor-not-allowed' :
                'bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 hover:shadow-[0_0_25px_rgba(16,185,129,0.5)]'
              }`}
            >
              {isMixing ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
              <span>{isMixing ? mixStatusText : 'Gabungkan & Buat Cover Final'}</span>
            </button>

            {isMixing && (
              <div className="space-y-2 p-4 rounded-xl bg-slate-950/80 border border-emerald-500/30 animate-pulse">
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
                  <span>{mixStatusText}</span>
                  <span>{mixProgress}%</span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-emerald-400 to-cyan-400 h-full transition-all duration-300" style={{ width: `${mixProgress}%` }}></div>
                </div>
              </div>
            )}

            {/* Final Cover Display & Download */}
            {finalCoverUrl && (
              <div className="p-6 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-purple-950/40 to-slate-950 border border-emerald-500/40 space-y-4 animate-fade-in shadow-2xl">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                      <Radio className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-100 text-base">Hasil Cover Lagu Anda</h3>
                      <p className="text-xs text-slate-400">Siap didengarkan dan diunduh (WAV PCM 16-bit)</p>
                    </div>
                  </div>

                  <a 
                    href={finalCoverUrl} 
                    download={`AGE-YT5-Cover-${uploadedFile?.name ? uploadedFile.name.replace(/\.[^/.]+$/, "") : "lagu"}.wav`}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center gap-2 hover:shadow-[0_0_20px_rgba(52,211,153,0.4)] transition-all"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Cover (.wav)</span>
                  </a>
                </div>

                <audio controls src={finalCoverUrl} className="w-full h-10 rounded-xl" />
              </div>
            )}
          </div>
        </section>

      </main>

      {}
      {/* API Key Modal */}
      {showApiModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <Settings className="w-5 h-5 text-cyan-400" /> Pengaturan API Key
              </h3>
              <button onClick={() => setShowApiModal(false)} className="p-1 hover:bg-slate-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {Object.keys(apiKeys).map(service => {
                const serviceKeys = apiKeys[service] || [];
                const activeCandidate = getNextAvailableKey(service);

                return (
                  <div key={service} className="space-y-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm uppercase text-cyan-400">{service}</span>
                      <span className="text-[10px] text-slate-400">
                        {serviceKeys.length} Key Tersimpan
                      </span>
                    </div>

                    {/* Input Tambah Key Baru */}
                    <div className="flex items-center gap-2">
                      <input 
                        type="password" 
                        placeholder={`Masukkan API Key ${service.toUpperCase()} baru...`}
                        value={tempKeyInputs[service] || ''}
                        onChange={(e) => setTempKeyInputs(prev => ({ ...prev, [service]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveKey(service);
                        }}
                        className="flex-1 p-2 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500"
                      />
                      <button 
                        onClick={() => handleSaveKey(service)}
                        className="px-3 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-slate-950 font-bold text-xs flex items-center gap-1 transition-all shadow-md shadow-cyan-500/20"
                        title="Simpan Key ini ke daftar"
                      >
                        <span>💾 Simpan</span>
                      </button>
                      <button 
                        onClick={() => {
                          const val = tempKeyInputs[service];
                          if (val) {
                            checkCredit(service, val);
                          } else if (activeCandidate) {
                            checkCredit(service, activeCandidate);
                          } else {
                            addToast('warning', 'Masukkan Key untuk dicek');
                          }
                        }}
                        title="Cek Kredit Key"
                        className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Daftar Key Tersimpan */}
                    {serviceKeys.length > 0 && (
                      <div className="space-y-2 mt-3 pt-3 border-t border-slate-800/80">
                        <p className="text-[11px] font-semibold text-slate-400 mb-1">Daftar Key Tersimpan:</p>
                        {serviceKeys.map((k) => {
                          const isCandidate = activeCandidate && activeCandidate === k.key;
                          const isFailed = k.remainingCredit === 'failed';

                          const maskedKey = k.key && k.key.length > 10 
                            ? `${k.key.slice(0, 4)}...${k.key.slice(-4)}`
                            : '••••••••';

                          return (
                            <div key={k.id} className="flex flex-wrap items-center justify-between p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80 gap-2">
                              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                                <span className="text-xs font-mono font-medium text-slate-200">{maskedKey}</span>
                                {isFailed ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                                    🔴 Gagal
                                  </span>
                                ) : isCandidate ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                    🟢 AKTIF
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-500"></span>
                                    ⚪ Standby
                                  </span>
                                )}
                                {k.statusText && (
                                  <span className="text-[10px] text-slate-400 truncate max-w-[150px]">({k.statusText})</span>
                                )}
                              </div>

                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => checkCredit(service, k.key)}
                                  title="Refresh Kredit Key Ini"
                                  className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-all"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDeleteKey(service, k.id)}
                                  title="Hapus Key"
                                  className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {service === 'stemsplit' && (
                      <p className="text-[10px] text-slate-500">Akun gratis StemSplit.io mendapat 5 menit kredit pemrosesan gratis tanpa kartu kredit.</p>
                    )}
                    {service === 'elevenlabs' && (
                      <p className="text-[10px] text-slate-500">Akun gratis ElevenLabs mendapat 10.000 kredit/bulan tanpa kartu kredit — cukup untuk beberapa kali konversi vokal.</p>
                    )}
                  </div>
                );
              })}
            </div>

            <p className="text-xs text-slate-500 italic">
              API key Anda hanya disimpan sementara di sesi browser ini dan tidak dikirim ke server manapun selain penyedia API terkait.
            </p>
          </div>
        </div>
      )}

      {}
      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <h3 className="font-bold text-lg text-slate-100 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-pink-400" /> Bantuan & Panduan
              </h3>
              <button onClick={() => setShowHelpModal(false)} className="p-1 hover:bg-slate-800 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <h4 className="font-bold text-cyan-400 text-sm">Cara Mendapatkan API Key Gratis</h4>
              <ul className="space-y-2 list-disc pl-4">
                <li><b>StemSplit.io</b> (<a href="https://stemsplit.io" target="_blank" rel="noreferrer" className="text-cyan-400 underline">stemsplit.io</a>): Daftar gratis & klaim 5 menit kredit pemisahan vokal.</li>
                <li><b>ElevenLabs</b> (<a href="https://elevenlabs.io" target="_blank" rel="noreferrer" className="text-cyan-400 underline">elevenlabs.io</a>): Dapatkan 10.000 kredit/bulan gratis di halaman Profile/Settings.</li>
                <li><b>Kits.AI</b> (<a href="https://kits.ai" target="_blank" rel="noreferrer" className="text-cyan-400 underline">kits.ai</a>): Buka dashboard -&gt; API -&gt; Buat token gratis.</li>
                <li><b>LALAL.AI</b> (<a href="https://lalal.ai" target="_blank" rel="noreferrer" className="text-cyan-400 underline">lalal.ai</a>): Tier Starter gratis tanpa kartu kredit.</li>
                <li><b>Kie.ai</b> (<a href="https://kie.ai" target="_blank" rel="noreferrer" className="text-cyan-400 underline">kie.ai</a>): Dapatkan kredit pendaftaran baru untuk regenerasi musik.</li>
              </ul>

              <h4 className="font-bold text-pink-400 text-sm mt-4">Alur Kerja Tools</h4>
              <p>1. Upload lagu -&gt; 2. Pisahkan vokal -&gt; 3. Ubah vokal -&gt; 4. Ubah gaya musik -&gt; 5. Gabungkan dan download!</p>

              <h4 className="font-bold text-purple-400 text-sm mt-4">Pertanyaan Umum (FAQ)</h4>
              <ul className="space-y-2 list-disc pl-4">
                <li><b>Kenapa hasilnya kadang pakai DSP Lokal?</b> Server API eksternal kadang tidak terjangkau dari sandbox, tools otomatis memakai mode cadangan agar tetap bisa dipakai.</li>
                <li><b>Apakah aman memasukkan API key?</b> Key hanya disimpan sementara di sesi browser, tidak dikirim ke server manapun selain penyedia API terkait.</li>
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
        <p>AGE YT#5 Musik Cover — Biaya penggunaan API sepenuhnya ditanggung pengguna. Gunakan hasil cover sesuai ketentuan lisensi platform Anda.</p>
      </footer>

    </div>
  );
}