import React, { useState, useEffect, useRef } from 'react';
import {
  Music2, AudioWaveform, Disc3, Radio, Headphones, SlidersHorizontal,
  Play, Pause, Download, RefreshCw, Key, HelpCircle, CheckCircle2,
  AlertCircle, Info, Sparkles, Volume2, ShieldCheck, Zap, X, Trash2,
  RotateCcw, FileAudio, ExternalLink, ChevronDown, ChevronUp
} from 'lucide-react';

/**
 * Helper to generate a 3-second synth sine wave placeholder for fast UI testing.
 */
function createTestSampleAudioBuffer() {
  const sampleRate = 44100;
  const duration = 3;
  const numSamples = sampleRate * duration;
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const buffer = ctx.createBuffer(2, numSamples, sampleRate);
  
  for (let channel = 0; channel < 2; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      // 440Hz sine wave with smooth attack/release
      const envelope = Math.sin((i / numSamples) * Math.PI);
      channelData[i] = Math.sin(2 * Math.PI * 440 * t) * 0.3 * envelope;
    }
  }
  
  return bufferToWavBlob(buffer);
}

function bufferToWavBlob(buffer) {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  
  const length = buffer.length * blockAlign;
  const arrayBuffer = new ArrayBuffer(44 + length);
  const view = new DataView(arrayBuffer);
  
  const writeString = (offset, string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };
  
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + length, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, length, true);
  
  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = Math.max(-1, Math.min(1, buffer.getChannelData(channel)[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

async function checkStemSplitCredit(apiKey) {
  try {
    const res = await fetch('https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/account', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    console.log('[DEBUG-StemSplit] Credit info:', data);

    if (data.balance_formatted) return data.balance_formatted;

    let seconds = null;
    if (typeof data.balance === 'number') seconds = data.balance;
    else if (typeof data.credits === 'number') seconds = data.credits;
    else if (typeof data.remaining === 'number') seconds = data.remaining;
    else if (data.data && typeof data.data.balance === 'number') seconds = data.data.balance;
    else if (data.data && typeof data.data.credits === 'number') seconds = data.data.credits;

    if (seconds !== null) {
      const mins = Math.floor(seconds / 60);
      const secs = Math.floor(seconds % 60);
      return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }

    if (typeof data.balance === 'string') return data.balance;
    return null;
  } catch (e) {
    console.warn('[DEBUG-StemSplit] Error checking credit:', e.message);
    return null;
  }
}

async function checkKieAiCredit(apiKey) {
  try {
    const res = await fetch('https://api.kie.ai/api/v1/chat/credit', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    if (!res.ok) return null;
    const data = await res.json();
    console.log('[DEBUG-KieAI] Credit info:', data);
    if (data.code === 200 && data.data !== undefined) {
      return `${data.data} kredit`;
    }
    return null;
  } catch (e) {
    console.warn('[DEBUG-KieAI] Error checking credit:', e.message);
    return null;
  }
}

async function fetchKeyCredit(service, apiKey) {
  if (service === 'stemsplit') {
    return await checkStemSplitCredit(apiKey);
  } else if (service === 'kie') {
    return await checkKieAiCredit(apiKey);
  } else if (service === 'elevenlabs') {
    try {
      const res = await fetch('https://stemsplit-proxy.kitakustik-managemen.workers.dev/elevenlabs/v1/user/subscription', {
        headers: { 'xi-api-key': apiKey }
      });
      if (res.ok) {
        const d = await res.json();
        if (d.character_count !== undefined && d.character_limit !== undefined) {
          const remaining = d.character_limit - d.character_count;
          return `${remaining.toLocaleString()} karakter`;
        }
      }
    } catch (e) {}
  }
  return null;
}

/**
 * Translates raw technical error messages into friendly Indonesian messages.
 */
function translateErrorToUserMessage(rawError, serviceName) {
  const serviceLabel = serviceName === 'stemsplit' ? 'StemSplit.io'
    : serviceName === 'kie' ? 'Kie.ai'
    : serviceName === 'elevenlabs' ? 'ElevenLabs'
    : serviceName === 'local' ? 'Proses Lokal (Browser)'
    : serviceName || 'Layanan';

  const rawMsg = typeof rawError === 'string' ? rawError : (rawError?.message || String(rawError || ''));

  if (!rawMsg) {
    return `Terjadi kendala teknis saat memproses permintaan ke ${serviceLabel}.`;
  }

  const lowerMsg = rawMsg.toLowerCase();

  if (rawMsg.includes('Semua API key')) {
    return rawMsg;
  }

  if (
    lowerMsg.includes('insufficient_credits') ||
    lowerMsg.includes('402') ||
    lowerMsg.includes('payment required') ||
    lowerMsg.includes('kredit habis') ||
    lowerMsg.includes('out of credit') ||
    lowerMsg.includes('balance')
  ) {
    return `Kredit API ${serviceLabel} kamu sudah habis. Tambahkan API key baru di menu ⚙️ Pengaturan API Key, atau tunggu jika layanan punya reset kredit berkala.`;
  }

  if (
    lowerMsg.includes('401') ||
    lowerMsg.includes('403') ||
    lowerMsg.includes('unauthorized') ||
    lowerMsg.includes('invalid api key') ||
    lowerMsg.includes('invalid_api_key') ||
    lowerMsg.includes('forbidden')
  ) {
    return `API key ${serviceLabel} tidak valid atau sudah kadaluarsa. Periksa kembali key kamu di menu ⚙️ Pengaturan API Key.`;
  }

  if (
    lowerMsg.includes('matches an existing recording') ||
    lowerMsg.includes('existing recording in our catalog') ||
    lowerMsg.includes('catalog')
  ) {
    return `Lagu ini terdeteksi cocok dengan rekaman komersial yang sudah terdaftar di database ${serviceLabel} (perlindungan hak cipta). Mode audio-referensi tidak bisa dipakai untuk lagu ini — otomatis dialihkan ke mode generate biasa (hasil mungkin tidak sinkron sempurna dengan lagu asli).`;
  }

  if (
    lowerMsg.includes('timeout') ||
    lowerMsg.includes('aborterror') ||
    lowerMsg.includes('dihentikan')
  ) {
    return `Proses memakan waktu terlalu lama dan dihentikan otomatis. Coba lagi, atau gunakan file audio yang lebih pendek.`;
  }

  const shortDetail = rawMsg.length > 100 ? rawMsg.slice(0, 100) + '...' : rawMsg;
  return `Terjadi kendala teknis saat memproses permintaan ke ${serviceLabel}. Detail teknis: ${shortDetail}`;
}

async function separateVocalsStemSplit(audioFile, apiKey, onProgress) {
  console.log('[DEBUG-StemSplit] Langkah A: Minta URL upload...');
  onProgress(10, 'Langkah 1/4: Meminta URL upload StemSplit.io...');

  const controllerA = new AbortController();
  const timeoutA = setTimeout(() => controllerA.abort(), 20000);

  const initRes = await fetch('https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/upload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ filename: audioFile.name || 'uploaded_track.mp3' }),
    signal: controllerA.signal
  });
  clearTimeout(timeoutA);

  if (!initRes.ok) {
    const errText = await initRes.text();
    throw new Error(`StemSplit Upload Init Error (${initRes.status}): ${errText.slice(0, 150)}`);
  }

  const initData = await initRes.json();
  const { uploadUrl, uploadKey } = initData;

  if (!uploadUrl || !uploadKey) {
    throw new Error('StemSplit tidak mengembalikan uploadUrl atau uploadKey');
  }

  console.log('[DEBUG-StemSplit] Langkah B: Uploading audio via proxy...');
  onProgress(25, 'Langkah 2/4: Mengunggah file audio ke server StemSplit...');

  const proxiedUploadUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-upload?target=${encodeURIComponent(uploadUrl)}`;
  const controllerB = new AbortController();
  const timeoutB = setTimeout(() => controllerB.abort(), 60000);

  const uploadRes = await fetch(proxiedUploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': audioFile.type || 'audio/mpeg'
    },
    body: audioFile,
    signal: controllerB.signal
  });
  clearTimeout(timeoutB);

  if (!uploadRes.ok) {
    throw new Error(`Gagal mengunggah audio ke StemSplit (HTTP ${uploadRes.status})`);
  }

  console.log('[DEBUG-StemSplit] Langkah C: Membuat job pemisahan...');
  onProgress(40, 'Langkah 3/4: Memulai tugas pemisahan vokal...');

  const controllerC = new AbortController();
  const timeoutC = setTimeout(() => controllerC.abort(), 20000);

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
    }),
    signal: controllerC.signal
  });
  clearTimeout(timeoutC);

  if (!jobRes.ok) {
    const errText = await jobRes.text();
    throw new Error(`Gagal membuat job StemSplit (${jobRes.status}): ${errText.slice(0, 150)}`);
  }

  const jobData = await jobRes.json();
  const jobId = jobData.id || jobData.jobId;

  if (!jobId) {
    throw new Error('ID Job tidak ditemukan dari StemSplit');
  }

  console.log(`[DEBUG-StemSplit] Langkah D: Polling status job ${jobId}...`);
  return await pollStemSplitJob(jobId, apiKey, onProgress);
}

async function pollStemSplitJob(jobId, apiKey, onProgress) {
  const maxAttempts = 40;
  const delayMs = 5000;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, delayMs));

    try {
      const res = await fetch(`https://stemsplit-proxy.kitakustik-managemen.workers.dev/api/v1/jobs/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!res.ok) continue;

      const statusData = await res.json();
      console.log(`[DEBUG-StemSplit] Polling #${attempt}:`, statusData);

      const status = statusData.status;
      const progress = statusData.progress || Math.min(40 + attempt * 2, 95);

      onProgress(progress, `Langkah 4/4: Memproses vokal & musik... (${progress}%)`);

      if (status === 'COMPLETED') {
        const vocalsUrl = statusData.outputs?.vocals?.url || statusData.vocalsUrl || statusData.outputs?.vocalUrl;
        const instrumentalUrl = statusData.outputs?.instrumental?.url || statusData.instrumentalUrl || statusData.outputs?.accompanimentUrl;

        if (!vocalsUrl || !instrumentalUrl) {
          throw new Error('Hasil pemisahan vokal/instrumental tidak ditemukan di response');
        }

        onProgress(100, 'Pemisahan StemSplit.io Selesai!');
        return { vocalsUrl, instrumentalUrl };
      }

      if (status === 'FAILED') {
        throw new Error(statusData.errorMessage || 'Pemisahan audio StemSplit gagal');
      }
    } catch (err) {
      if (err.message.includes('Hasil pemisahan') || err.message.includes('gagal')) {
        throw err;
      }
      console.warn(`[DEBUG-StemSplit] Error polling #${attempt}: ${err.message}`);
    }
  }

  throw new Error('StemSplit polling timeout (melewati batas 3.5 menit)');
}

async function convertVoiceElevenLabs(vocalStemUrl, voiceId, apiKey, onProgress) {
  console.log('[DEBUG-ElevenLabs] Mengambil file vokal via proxy...');
  onProgress(20, 'Mengunduh stem vokal asli untuk konversi...');

  let blob;
  if (typeof vocalStemUrl === 'string' && vocalStemUrl.startsWith('http')) {
    const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(vocalStemUrl)}`;
    const response = await fetch(proxiedUrl);
    if (!response.ok) {
      throw new Error(`Gagal mengambil audio vokal via proxy (HTTP ${response.status})`);
    }
    blob = await response.blob();
  } else if (vocalStemUrl instanceof Blob) {
    blob = vocalStemUrl;
  } else if (typeof vocalStemUrl === 'string' && vocalStemUrl.startsWith('blob:')) {
    const response = await fetch(vocalStemUrl);
    blob = await response.blob();
  } else {
    throw new Error('Format file vokal tidak valid');
  }

  onProgress(40, 'Mengirim audio vokal ke ElevenLabs Speech-to-Speech...');

  const formData = new FormData();
  formData.append('audio', blob, 'vocal_stem.wav');
  formData.append('model_id', 'eleven_multilingual_sts_v2');

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  const res = await fetch(`https://stemsplit-proxy.kitakustik-managemen.workers.dev/elevenlabs/v1/speech-to-speech/${voiceId || '21m00Tcm4TlvDq8ikWAM'}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey
    },
    body: formData,
    signal: controller.signal
  });
  clearTimeout(timeoutId);

  if (!res.ok) {
    let errText = 'Gagal konversi vokal';
    try {
      const errJson = await res.json();
      errText = errJson.detail?.message || errJson.detail || JSON.stringify(errJson);
    } catch (e) {
      errText = await res.text();
    }
    throw new Error(`ElevenLabs Error (${res.status}): ${errText.slice(0, 200)}`);
  }

  onProgress(90, 'Memproses output audio ElevenLabs...');
  const resultBlob = await res.blob();
  onProgress(100, 'Konversi ElevenLabs Berhasil!');
  return URL.createObjectURL(resultBlob);
}

async function fetchElevenLabsVoices(apiKey) {
  try {
    const res = await fetch('https://stemsplit-proxy.kitakustik-managemen.workers.dev/elevenlabs/v1/voices', {
      headers: { 'xi-api-key': apiKey }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.voices || null;
  } catch (e) {
    console.warn('[DEBUG-ElevenLabs] Gagal mengambil daftar voice:', e.message);
    return null;
  }
}

async function regenerateInstrumentalApi(prompt, styleString, negativeTags, vocalGender, apiKey, onProgress) {
  console.log('[DEBUG-KieAI] Menghubungi Kie.ai API...');
  onProgress(15, 'Menghubungi Kie.ai API (Model V4)...');

  const promptText = prompt && prompt.trim() !== '' ? prompt : `A high quality instrumental cover arrangement in the style of ${styleString || 'acoustic, calm'}. Rich, polished studio production with clear rhythm, full instrumentation, and smooth dynamics that complement a vocal performance from start to finish.`;

  const payload = {
    customMode: true,
    model: 'V4',
    prompt: promptText,
    style: styleString || 'Acoustic, Calm',
    negativeTags: Array.isArray(negativeTags) ? negativeTags.join(', ') : (negativeTags || ''),
    title: 'Custom Style Cover',
    instrumental: true,
    callBackUrl: 'https://cover.andriage.my.id/kie-callback-placeholder'
  };

  if (vocalGender && vocalGender !== 'none') {
    payload.vocalGender = vocalGender;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch('https://api.kie.ai/api/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Kie.ai API Error (HTTP ${res.status}): ${errText.slice(0, 200)}`);
    }

    const resJson = await res.json();
    console.log('[DEBUG-KieAI] Response:', resJson);

    if (resJson.code !== 200) {
      throw new Error(`Kie.ai Error: ${resJson.msg || 'Gagal membuat task'}`);
    }

    const taskId = resJson.data?.taskId || resJson.data;
    if (!taskId) {
      throw new Error('Task ID tidak ditemukan dari Kie.ai');
    }

    return await pollKieAiStatus(taskId, apiKey, onProgress);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Kie.ai request timeout (30 detik)');
    }
    throw err;
  }
}

/**
 * Upload file audio (dari blob URL lokal) ke R2 bucket lewat worker stemsplit-proxy,
 * mengembalikan URL publik permanen yang bisa diakses server pihak ketiga (mis. Kie.ai).
 */
async function uploadAudioToPublicUrl(blobUrl, filename, onProgress) {
  onProgress && onProgress('Menyiapkan file audio untuk diunggah...');

  let audioBlob;
  if (typeof blobUrl === 'string' && blobUrl.startsWith('http')) {
    // URL remote (mis. presigned URL dari storage StemSplit) tidak mengizinkan fetch()
    // lintas origin langsung dari browser (CORS) — harus lewat proxy relay-fetch.
    const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(blobUrl)}`;
    const sourceRes = await fetch(proxiedUrl);
    if (!sourceRes.ok) {
      throw new Error(`Gagal membaca file audio sumber via proxy (HTTP ${sourceRes.status})`);
    }
    audioBlob = await sourceRes.blob();
  } else if (blobUrl instanceof Blob) {
    audioBlob = blobUrl;
  } else if (typeof blobUrl === 'string' && blobUrl.startsWith('blob:')) {
    const sourceRes = await fetch(blobUrl);
    if (!sourceRes.ok) {
      throw new Error('Gagal membaca file audio sumber untuk diunggah ke penyimpanan publik');
    }
    audioBlob = await sourceRes.blob();
  } else {
    throw new Error('Format file audio sumber tidak valid');
  }

  if (!audioBlob || audioBlob.size === 0) {
    throw new Error('File audio sumber kosong (0 byte), tidak bisa diunggah');
  }

  // PENTING: deteksi ekstensi file dari MIME type ASLI blob, jangan pakai ekstensi
  // hardcode dari pemanggil — mismatch ekstensi vs isi file (mis. isinya MP3 tapi
  // diberi nama .wav) bisa membuat server pihak ketiga gagal membaca/parsing audio.
  const mimeToExt = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/wave': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'audio/x-m4a': 'm4a',
    'audio/flac': 'flac'
  };
  const detectedExt = mimeToExt[audioBlob.type] || (filename || '').split('.').pop() || 'mp3';
  const baseName = (filename || 'instrumental').replace(/\.[a-zA-Z0-9]+$/, '');
  const finalFilename = `${baseName}.${detectedExt}`;

  console.log(`[DEBUG-Upload] Blob type asli: "${audioBlob.type}", size: ${audioBlob.size} bytes, nama file final: ${finalFilename}`);

  onProgress && onProgress('Mengunggah instrumental ke penyimpanan publik...');

  const safeFilename = finalFilename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const uploadRes = await fetch(
      `https://stemsplit-proxy.kitakustik-managemen.workers.dev/r2-upload?filename=${encodeURIComponent(safeFilename)}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': audioBlob.type || 'application/octet-stream' },
        body: audioBlob,
        signal: controller.signal
      }
    );
    clearTimeout(timeoutId);

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Gagal mengunggah audio ke R2 (HTTP ${uploadRes.status}): ${errText.slice(0, 150)}`);
    }

    const uploadJson = await uploadRes.json();
    if (!uploadJson.url) {
      throw new Error('Server tidak mengembalikan URL publik setelah upload');
    }

    console.log('[DEBUG-Upload] URL publik hasil upload:', uploadJson.url);
    return uploadJson.url;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new Error('Upload audio ke penyimpanan publik timeout (60 detik)');
    }
    throw err;
  }
}

/**
 * Kie.ai AI Music Cover API (Model V4) — mode audio-to-audio.
 * Menerima instrumental ASLI sebagai referensi (uploadUrl) sehingga hasil regenerasi
 * gaya musik baru TETAP mempertahankan melodi, tempo, dan durasi lagu asli
 * (berbeda dari mode text-to-music biasa yang menghasilkan komposisi independen).
 */
async function regenerateInstrumentalCoverApi(instrumentalBlobUrl, prompt, styleString, negativeTags, vocalGender, apiKey, onProgress) {
  console.log('[DEBUG-KieAI] Mengunggah instrumental asli sebagai referensi cover...');
  onProgress(5, 'Mengunggah instrumental asli sebagai referensi...');

  const publicUploadUrl = await uploadAudioToPublicUrl(instrumentalBlobUrl, 'instrumental_source', (msg) => {
    onProgress(10, msg);
  });

  console.log('[DEBUG-KieAI] Instrumental berhasil diunggah:', publicUploadUrl);
  onProgress(15, 'Menghubungi Kie.ai API (Upload & Cover)...');

  // Prompt fallback dibuat lebih panjang & deskriptif (bukan cuma 4 kata) karena
  // Kie.ai pernah menolak dengan alasan "lyrics are empty, too short, or malformed"
  // saat prompt terlalu pendek/generik.
  const defaultPromptFallback = `A high quality instrumental cover arrangement in the style of ${styleString || 'acoustic, calm'}. Rich, polished studio production with clear rhythm, full instrumentation, and smooth dynamics that complement a vocal performance from start to finish.`;
  const promptText = prompt && prompt.trim() !== '' ? prompt : defaultPromptFallback;

  const payload = {
    uploadUrl: publicUploadUrl,
    customMode: true,
    model: 'V4',
    prompt: promptText,
    style: styleString || 'Acoustic, Calm',
    negativeTags: Array.isArray(negativeTags) ? negativeTags.join(', ') : (negativeTags || ''),
    title: 'Custom Style Cover',
    instrumental: true,
    // Nilai default Kie.ai yang sudah terverifikasi berhasil. Pernah dicoba dinaikkan
    // (audioWeight 0.85, weirdnessConstraint 0.25) tapi itu TIDAK memperbaiki masalah
    // dan sempat diduga jadi penyebab GENERATE_AUDIO_FAILED — namun setelah di-revert
    // ke default pun error serupa masih muncul, jadi parameter ini BUKAN akar masalah.
    // Root cause sebenarnya kemungkinan besar prompt yang terlalu pendek (lihat di atas).
    styleWeight: 0.65,
    weirdnessConstraint: 0.65,
    audioWeight: 0.65,
    callBackUrl: 'https://cover.andriage.my.id/kie-callback-placeholder'
  };

  if (vocalGender && vocalGender !== 'none') {
    payload.vocalGender = vocalGender;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch('https://api.kie.ai/api/v1/generate/upload-cover', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Kie.ai Upload-Cover API Error (HTTP ${res.status}): ${errText.slice(0, 200)}`);
    }

    const resJson = await res.json();
    console.log('[DEBUG-KieAI] Upload-Cover Response:', resJson);

    if (resJson.code !== 200) {
      throw new Error(`Kie.ai Error: ${resJson.msg || 'Gagal membuat task cover'}`);
    }

    const taskId = resJson.data?.taskId || resJson.data;
    if (!taskId) {
      throw new Error('Task ID tidak ditemukan dari Kie.ai');
    }

    return await pollKieAiStatus(taskId, apiKey, onProgress);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Kie.ai request timeout (30 detik)');
    }
    throw err;
  }
}

async function pollKieAiStatus(taskId, apiKey, onProgress) {
  console.log(`[DEBUG-KieAI] Memulai polling task: ${taskId}`);
  // Mode upload-cover (audio-to-audio) butuh waktu analisis audio referensi tambahan,
  // sehingga bisa memakan waktu lebih lama dari mode generate biasa. Timeout diperpanjang
  // dari 3.5 menit menjadi ~9 menit untuk mengakomodasi ini.
  const maxAttempts = 108;
  const delayMs = 5000;
  let shortDurationRetries = 0;
  const maxShortDurationRetries = 6; // tambahan ~30 detik toleransi kalau file masih difinalisasi

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const progressPct = Math.min(20 + Math.floor((attempt / maxAttempts) * 75), 95);
    onProgress(progressPct, `Memproses AI Instrumental... (${attempt}/${maxAttempts})`);

    await new Promise(r => setTimeout(r, delayMs));

    try {
      const res = await fetch(`https://api.kie.ai/api/v1/generate/record-info?taskId=${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) {
        console.warn(`[DEBUG-KieAI] Polling HTTP error status ${res.status}, mencoba lagi...`);
        continue;
      }

      const resJson = await res.json();
      console.log(`[DEBUG-KieAI] Polling status #${attempt}:`, resJson);

      if (resJson.code !== 200) {
        continue;
      }

      const taskData = resJson.data;
      const status = taskData?.status || taskData?.state;
      console.log(`[DEBUG-KieAI] Status task saat ini: "${status}"`);

      if (status === 'SUCCESS' || status === 'COMPLETED' || status === 'SUCCESSFUL') {
        onProgress(98, 'Mengunduh hasil instrumental AI...');
        
        let audioUrl = null;
        let pickedDuration = null;

        const candidateList = Array.isArray(taskData.response?.sunoData)
          ? taskData.response.sunoData
          : (Array.isArray(taskData.sunoData) ? taskData.sunoData : null);

        if (candidateList && candidateList.length > 0) {
          console.log('[DEBUG-KieAI] Daftar kandidat track hasil:', candidateList.map(t => ({
            duration: t.duration, audioUrl: t.audioUrl ? 'ada' : 'tidak ada', streamAudioUrl: t.streamAudioUrl ? 'ada' : 'tidak ada'
          })));

          // Pilih kandidat dengan durasi TERPANJANG (bukan asal index 0), karena Kie.ai/Suno
          // kadang mengembalikan lebih dari satu varian dan varian pertama belum tentu yang
          // paling lengkap/final durasinya.
          const bestCandidate = candidateList.reduce((best, current) => {
            const currentDur = typeof current.duration === 'number' ? current.duration : 0;
            const bestDur = best && typeof best.duration === 'number' ? best.duration : 0;
            return currentDur > bestDur ? current : (best || current);
          }, null);

          audioUrl = bestCandidate?.audioUrl || bestCandidate?.streamAudioUrl;
          pickedDuration = bestCandidate?.duration;
        } else if (taskData.audioUrl) {
          audioUrl = taskData.audioUrl;
          pickedDuration = taskData.duration;
        }

        console.log(`[DEBUG-KieAI] Track terpilih — durasi menurut metadata Kie.ai: ${pickedDuration ?? 'tidak diketahui'} detik`);

        // Antisipasi race condition: status sudah SUCCESS tapi file audio penuh masih
        // difinalisasi di CDN Kie.ai (durasi metadata masih sangat pendek, mis. <20 detik).
        // Tunggu sebentar dan cek ulang sebelum menganggap ini hasil final.
        if (
          typeof pickedDuration === 'number' &&
          pickedDuration > 0 &&
          pickedDuration < 20 &&
          shortDurationRetries < maxShortDurationRetries
        ) {
          shortDurationRetries++;
          console.warn(`[DEBUG-KieAI] Durasi hasil masih sangat pendek (${pickedDuration}s), kemungkinan file belum final. Menunggu dan cek ulang (${shortDurationRetries}/${maxShortDurationRetries})...`);
          onProgress(96, `Durasi hasil masih pendek, menunggu finalisasi file (${shortDurationRetries}/${maxShortDurationRetries})...`);
          await new Promise(r => setTimeout(r, 5000));
          continue;
        }

        if (!audioUrl) {
          throw new Error('Audio URL tidak ditemukan pada hasil Kie.ai');
        }

        const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(audioUrl)}`;
        const audioRes = await fetch(proxiedUrl);
        if (!audioRes.ok) {
          throw new Error(`Gagal mengunduh audio hasil Kie.ai (HTTP ${audioRes.status})`);
        }

        const audioBlob = await audioRes.blob();
        console.log(`[DEBUG-KieAI] Audio hasil diunduh — ukuran blob: ${audioBlob.size} bytes, type: ${audioBlob.type}`);
        onProgress(100, 'Instrumental AI siap!');
        return URL.createObjectURL(audioBlob);
      }

      const knownFailedStatuses = [
        'FAILED', 'ERROR', 'GENERATE_AUDIO_FAILED', 'CREATE_TASK_FAILED',
        'CALLBACK_EXCEPTION', 'SENSITIVE_WORD_ERROR'
      ];
      if (typeof status === 'string' && knownFailedStatuses.includes(status.toUpperCase())) {
        throw new Error(`Generasi Kie.ai gagal (${status}): ${taskData.errorMessage || taskData.failReason || taskData.msg || 'Tidak ada detail alasan dari Kie.ai'}`);
      }
    } catch (err) {
      if (err.message.includes('Gagal mengunduh audio') || err.message.includes('Generasi Kie.ai gagal')) {
        throw err;
      }
      console.warn(`[DEBUG-KieAI] Error saat polling #${attempt}: ${err.message}`);
    }
  }

  throw new Error('Kie.ai polling timeout (melewati batas waktu 9 menit)');
}

async function convertVoiceLocal(vocalStemSource, pitchPreset, onProgress) {
  onProgress(20, 'Menyiapkan Web Audio Engine DSP...');
  const ctx = new (window.AudioContext || window.webkitAudioContext)();

  let arrayBuffer;
  if (typeof vocalStemSource === 'string') {
    const res = await fetch(vocalStemSource.startsWith('http') ? `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(vocalStemSource)}` : vocalStemSource);
    arrayBuffer = await res.arrayBuffer();
  } else if (vocalStemSource instanceof Blob) {
    arrayBuffer = await vocalStemSource.arrayBuffer();
  } else {
    throw new Error('Sumber audio vokal tidak valid');
  }

  onProgress(50, 'Menganalisis & menggeser pitch audio...');
  const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

  let shiftSemitones = 0;
  if (pitchPreset === 'pitch_up') shiftSemitones = 2;
  else if (pitchPreset === 'pitch_down') shiftSemitones = -2;
  else if (pitchPreset === 'chipmunk') shiftSemitones = 6;
  else if (pitchPreset === 'deep') shiftSemitones = -5;
  else if (pitchPreset === 'robotic') shiftSemitones = 0;

  const pitchRatio = Math.pow(2, shiftSemitones / 12);
  const offlineCtx = new OfflineAudioContext(
    audioBuffer.numberOfChannels,
    audioBuffer.length,
    audioBuffer.sampleRate
  );

  const source = offlineCtx.createBufferSource();
  source.buffer = audioBuffer;
  source.playbackRate.value = pitchRatio;

  source.connect(offlineCtx.destination);
  source.start(0);

  onProgress(85, 'Rendition Web Audio DSP...');
  const renderedBuffer = await offlineCtx.startRendering();
  
  onProgress(100, 'Pitch shift selesai!');
  const wavBlob = bufferToWavBlob(renderedBuffer);
  return URL.createObjectURL(wavBlob);
}

async function mixAudioTracks(vocalUrl, instrumentalUrl, onProgress) {
  onProgress(10, 'Mengambil data audio vokal & instrumen...');
  
  const fetchBuffer = async (url) => {
    if (!url) throw new Error('URL audio tidak ditemukan');
    let res;
    if (typeof url === 'string' && url.startsWith('http')) {
      const proxiedUrl = `https://stemsplit-proxy.kitakustik-managemen.workers.dev/relay-fetch?target=${encodeURIComponent(url)}`;
      res = await fetch(proxiedUrl);
    } else {
      res = await fetch(url);
    }
    if (!res.ok) throw new Error(`Gagal mengunduh audio (HTTP ${res.status})`);
    return await res.arrayBuffer();
  };

  const [vocalArrayBuf, instArrayBuf] = await Promise.all([
    fetchBuffer(vocalUrl),
    fetchBuffer(instrumentalUrl)
  ]);

  onProgress(35, 'Mendekode data audio (vokal & instrumen)...');
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  
  const [vocalBuffer, instBuffer] = await Promise.all([
    ctx.decodeAudioData(vocalArrayBuf),
    ctx.decodeAudioData(instArrayBuf)
  ]);

  onProgress(60, 'Mencampur sampel audio vokal & instrumen...');

  const sampleRate = Math.max(vocalBuffer.sampleRate, instBuffer.sampleRate) || 44100;
  const maxLength = Math.max(vocalBuffer.length, instBuffer.length);
  const numChannels = 2; // stereo

  // Hitung RMS (loudness rata-rata) tiap trek untuk deteksi ketimpangan volume.
  // Tanpa ini, trek yang jauh lebih pelan (mis. instrumental AI dari Kie.ai) bisa
  // "tenggelam" saat dijumlahkan langsung dengan trek yang lebih keras (vokal).
  const computeRMS = (buffer) => {
    let sumSquares = 0;
    let totalSamples = 0;
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < data.length; i++) {
        sumSquares += data[i] * data[i];
      }
      totalSamples += data.length;
    }
    return totalSamples > 0 ? Math.sqrt(sumSquares / totalSamples) : 0;
  };

  const vocalRMS = computeRMS(vocalBuffer);
  const instRMS = computeRMS(instBuffer);
  console.log(`[DEBUG-Mixing] RMS vokal: ${vocalRMS.toFixed(5)}, RMS instrumental: ${instRMS.toFixed(5)}`);

  const targetRMS = Math.max(vocalRMS, instRMS, 0.0001);
  const maxGain = 4; // batas atas biar tidak over-amplify noise/silence pada trek yang nyaris hening
  const vocalGain = Math.min(targetRMS / Math.max(vocalRMS, 0.0001), maxGain);
  const instGain = Math.min(targetRMS / Math.max(instRMS, 0.0001), maxGain);
  console.log(`[DEBUG-Mixing] Gain diterapkan — vokal: x${vocalGain.toFixed(2)}, instrumental: x${instGain.toFixed(2)}`);

  const mixBuffer = ctx.createBuffer(numChannels, maxLength, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const outData = mixBuffer.getChannelData(channel);
    
    // Fallback to channel 0 if mono
    const vChan = vocalBuffer.numberOfChannels > channel ? channel : 0;
    const vData = vocalBuffer.getChannelData(vChan);
    
    const iChan = instBuffer.numberOfChannels > channel ? channel : 0;
    const iData = instBuffer.getChannelData(iChan);

    const vLen = vData.length;
    const iLen = iData.length;

    for (let i = 0; i < maxLength; i++) {
      const vSample = i < vLen ? vData[i] * vocalGain : 0;
      // Kalau instrumental lebih pendek dari vokal, ULANG (loop) dari awal untuk
      // mengisi sisa durasi, daripada dibiarkan diam total di bagian akhir.
      const iSample = iLen > 0 ? iData[i % iLen] * instGain : 0;
      outData[i] = vSample + iSample;
    }
  }

  onProgress(85, 'Normalisasi volume & konversi format WAV...');
  
  // Soft normalization check
  let maxPeak = 0;
  for (let channel = 0; channel < numChannels; channel++) {
    const data = mixBuffer.getChannelData(channel);
    for (let i = 0; i < maxLength; i++) {
      const absVal = Math.abs(data[i]);
      if (absVal > maxPeak) {
        maxPeak = absVal;
      }
    }
  }

  if (maxPeak > 1.0) {
    const scaleFactor = 0.98 / maxPeak; // Leave slight headroom
    for (let channel = 0; channel < numChannels; channel++) {
      const data = mixBuffer.getChannelData(channel);
      for (let i = 0; i < maxLength; i++) {
        data[i] *= scaleFactor;
      }
    }
  }

  onProgress(95, 'Mengompresi ke format WAV...');
  const wavBlob = bufferToWavBlob(mixBuffer);
  
  onProgress(100, 'Final Cover Siap!');
  return URL.createObjectURL(wavBlob);
}

function buildSunoStyleString(genre, mood, instruments, tempo) {
  const parts = [];
  if (genre) parts.push(genre);
  if (mood) parts.push(mood);
  if (Array.isArray(instruments) && instruments.length > 0) {
    parts.push(instruments.join(', '));
  }
  if (tempo) {
    let bpmText = '90 BPM';
    if (tempo === 'slow') bpmText = '70 BPM';
    if (tempo === 'medium') bpmText = '100 BPM';
    if (tempo === 'fast') bpmText = '130 BPM';
    if (tempo === 'very_fast') bpmText = '160 BPM';
    parts.push(bpmText);
  }
  parts.push('studio quality production');
  const full = parts.join(', ');
  return full.length > 200 ? full.slice(0, 197) + '...' : full;
}

function renderCreditBadge(service, credit) {
  if (!credit) {
    return <span className="text-slate-500 text-[10px] font-mono">-- tidak diketahui --</span>;
  }

  let isLow = false;
  if (service === 'stemsplit') {
    const parts = String(credit).split(':');
    if (parts.length === 2) {
      const totalSecs = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      if (totalSecs < 30) isLow = true;
    } else if (parseInt(credit, 10) < 30) {
      isLow = true;
    }
  } else if (service === 'kie') {
    const val = parseFloat(credit);
    if (!isNaN(val) && val < 10) isLow = true;
  } else if (service === 'elevenlabs') {
    const val = parseInt(String(credit).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(val) && val < 1000) isLow = true;
  }

  if (isLow) {
    return (
      <span className="px-1.5 py-0.5 rounded bg-amber-950/80 border border-amber-500/50 text-[10px] text-amber-300 font-mono font-medium animate-pulse">
        ⚠️ {credit} tersisa
      </span>
    );
  }

  return (
    <span className="px-1.5 py-0.5 rounded bg-cyan-950/80 border border-cyan-800 text-[10px] text-cyan-300 font-mono">
      💳 {credit} tersisa
    </span>
  );
}

/**
 * Menentukan apakah sebuah error memang menandakan key benar-benar habis kredit
 * atau tidak valid (layak ditandai "Gagal" secara permanen), berbeda dari error
 * jaringan/CORS/timeout sesaat yang tidak seharusnya mendiskualifikasi key yang masih bagus.
 */
function isKeyExhaustionError(err) {
  const msg = (err?.message || String(err || '')).toLowerCase();
  return (
    msg.includes('credit') ||
    msg.includes('insufficient') ||
    msg.includes('402') ||
    msg.includes('401') ||
    msg.includes('403') ||
    msg.includes('unauthorized') ||
    msg.includes('invalid api key') ||
    msg.includes('invalid_api_key')
  );
}

/**
 * Executes an API function with automatic Key Rotation.
 */
async function callWithKeyRotation(serviceName, apiKeysState, markKeyAsFailedFn, apiCallFn, onProgress, serviceLabel) {
  const availableKeys = (apiKeysState[serviceName] || []).filter(k => !k.failed);

  if (availableKeys.length === 0) {
    throw new Error(`Semua API key untuk ${serviceLabel || serviceName} sudah habis kredit atau tidak aktif. Tambahkan key baru di menu ⚙️ Pengaturan API Key.`);
  }

  let lastError = null;
  for (let i = 0; i < availableKeys.length; i++) {
    const currentKeyObj = availableKeys[i];
    const key = currentKeyObj.key;
    const keyNum = i + 1;
    const totalKeys = availableKeys.length;

    try {
      if (i > 0) {
        onProgress(10, `Mengalihkan ke Key #${keyNum} dari ${totalKeys} untuk ${serviceLabel || serviceName}...`);
      }
      return await apiCallFn(key);
    } catch (err) {
      console.warn(`[DEBUG-KeyRotation] ${serviceName} Key #${keyNum} gagal (raw):`, err.message);
      lastError = err;

      // Hanya tandai key sebagai "Gagal" permanen kalau errornya memang soal kredit/otorisasi.
      // Error jaringan/CORS/timeout sesaat tidak mendiskualifikasi key yang masih valid.
      if (isKeyExhaustionError(err)) {
        markKeyAsFailedFn(serviceName, key);
      }

      if (i < totalKeys - 1) {
        onProgress(
          10,
          `Key #${keyNum} gagal (${err.message.slice(0, 35)}...). Otomatis mencoba Key #${keyNum + 1}...`
        );
        await new Promise(r => setTimeout(r, 1200));
      }
    }
  }

  throw lastError || new Error(`Semua API key untuk ${serviceLabel || serviceName} sudah habis kredit atau tidak aktif. Tambahkan key baru di menu ⚙️ Pengaturan API Key.`);
}

export default function App() {
  // Navigation & Modal States
  const [showApiModal, setShowApiModal] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [activeApiTab, setActiveApiTab] = useState('stemsplit');
  const [isCheckingCredits, setIsCheckingCredits] = useState(false);

  // Toasts State
  const [toasts, setToasts] = useState([]);

  // Toast Handler
  const addToast = (message, type = 'info', retryHandler = null) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { id, message, type, retryHandler }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 7000);
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  // API Key Storage
  const [apiKeys, setApiKeys] = useState(() => {
    const saved = localStorage.getItem('age_yt5_api_keys');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) {}
    }
    return {
      stemsplit: [],
      elevenlabs: [],
      kits: [],
      lalal: [],
      kie: []
    };
  });

  const [tempKeyInputs, setTempKeyInputs] = useState({
    stemsplit: '',
    elevenlabs: '',
    kits: '',
    lalal: '',
    kie: ''
  });

  useEffect(() => {
    localStorage.setItem('age_yt5_api_keys', JSON.stringify(apiKeys));
  }, [apiKeys]);

  // Refresh All API Credits
  const refreshAllCredits = async () => {
    setIsCheckingCredits(true);
    const updatedKeys = { ...apiKeys };

    for (const service of Object.keys(updatedKeys)) {
      const keyList = updatedKeys[service] || [];
      const updatedList = await Promise.all(
        keyList.map(async (k) => {
          const creditVal = await fetchKeyCredit(service, k.key);
          return { ...k, credit: creditVal };
        })
      );
      updatedKeys[service] = updatedList;
    }

    setApiKeys(updatedKeys);
    setIsCheckingCredits(false);
  };

  // Auto-refresh credits when API Key modal opens
  useEffect(() => {
    if (showApiModal) {
      refreshAllCredits();
    }
  }, [showApiModal]);

  // Key Rotator Helpers
  const getNextAvailableKey = (service) => {
    const keys = apiKeys[service] || [];
    return keys.find(k => !k.failed)?.key || null;
  };

  const markKeyAsFailed = (service, keyString) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: (prev[service] || []).map(k => k.key === keyString ? { ...k, failed: true } : k)
    }));
  };

  const handleSaveKey = async (service) => {
    const val = tempKeyInputs[service]?.trim();
    if (!val) return;

    if (apiKeys[service]?.some(k => k.key === val)) {
      addToast('Key ini sudah ada di daftar tersimpan', 'warning');
      return;
    }

    const creditVal = await fetchKeyCredit(service, val);

    setApiKeys(prev => ({
      ...prev,
      [service]: [...(prev[service] || []), { key: val, failed: false, credit: creditVal }]
    }));

    setTempKeyInputs(prev => ({ ...prev, [service]: '' }));
    addToast('Key berhasil disimpan', 'info');
  };

  const handleDeleteKey = (service, keyStr) => {
    setApiKeys(prev => ({
      ...prev,
      [service]: (prev[service] || []).filter(k => k.key !== keyStr)
    }));
  };

  // Audio Upload State
  const [audioFile, setAudioFile] = useState(null);
  const [originalAudioUrl, setOriginalAudioUrl] = useState(null);
  const fileInputRef = useRef(null);

  // Separation States
  const [isSeparating, setIsSeparating] = useState(false);
  const [separationProgress, setSeparationProgress] = useState(0);
  const [separationStatusText, setSeparationStatusText] = useState('');
  const [vocalStemUrl, setVocalStemUrl] = useState(null);
  const [instrumentalStemUrl, setInstrumentalStemUrl] = useState(null);

  // Voice Conversion States (2A)
  const [voiceMode, setVoiceMode] = useState('free'); // 'free' or 'ai'
  const [selectedPitchPreset, setSelectedPitchPreset] = useState('pitch_up');
  const [selectedVoiceId, setSelectedVoiceId] = useState('');
  const [elevenLabsVoices, setElevenLabsVoices] = useState([]);
  const [isConvertingVoice, setIsConvertingVoice] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceStatusText, setVoiceStatusText] = useState('');
  const [newVocalUrl, setNewVocalUrl] = useState(null);

  // Fetch ElevenLabs Voices on tab/key change
  useEffect(() => {
    const key = getNextAvailableKey('elevenlabs');
    if (key) {
      fetchElevenLabsVoices(key).then(voices => {
        if (voices) {
          setElevenLabsVoices(voices);
          if (voices.length > 0) setSelectedVoiceId(voices[0].voice_id);
        }
      });
    }
  }, [apiKeys.elevenlabs]);

  // Style Regeneration States (2B)
  const [styleMode, setStyleMode] = useState('free'); // 'free' or 'ai'
  const [genre, setGenre] = useState('Lo-Fi');
  const [mood, setMood] = useState('Calm');
  const [selectedInstruments, setSelectedInstruments] = useState(['Piano', 'Acoustic Guitar']);
  const [vocalGenderPref, setVocalGenderPref] = useState('none');
  const [tempoPref, setTempoPref] = useState('medium');
  const [negativeTags, setNegativeTags] = useState([]);
  const [customPrompt, setCustomPrompt] = useState('');

  const [isRegeneratingStyle, setIsRegeneratingStyle] = useState(false);
  const [styleProgress, setStyleProgress] = useState(0);
  const [styleStatusText, setStyleStatusText] = useState('');
  const [newInstrumentalUrl, setNewInstrumentalUrl] = useState(null);

  // Final Mixing States (3)
  const [isMixing, setIsMixing] = useState(false);
  const [mixProgress, setMixProgress] = useState(0);
  const [mixStatusText, setMixStatusText] = useState('');
  const [finalCoverUrl, setFinalCoverUrl] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setAudioFile(file);
      setOriginalAudioUrl(URL.createObjectURL(file));
      // Reset downstream
      setVocalStemUrl(null);
      setInstrumentalStemUrl(null);
      setNewVocalUrl(null);
      setNewInstrumentalUrl(null);
      setFinalCoverUrl(null);
      addToast(`File ${file.name} berhasil dimuat`, 'info');
    }
  };

  const handleLoadSampleAudio = () => {
    const blob = createTestSampleAudioBuffer();
    const file = new File([blob], 'sample_synth_3s.wav', { type: 'audio/wav' });
    setAudioFile(file);
    setOriginalAudioUrl(URL.createObjectURL(blob));
    setVocalStemUrl(null);
    setInstrumentalStemUrl(null);
    setNewVocalUrl(null);
    setNewInstrumentalUrl(null);
    setFinalCoverUrl(null);
    addToast('Sample audio 3 detik berhasil dimuat!', 'info');
  };

  const handleStartVocalSeparation = async () => {
    if (!audioFile) return;
    setIsSeparating(true);
    setSeparationProgress(5);
    setSeparationStatusText('Mulai pemisahan vokal...');

    const hasStemSplitKeys = (apiKeys.stemsplit || []).some(k => !k.failed);

    if (hasStemSplitKeys) {
      try {
        const res = await callWithKeyRotation(
          'stemsplit',
          apiKeys,
          markKeyAsFailed,
          async (activeKey) => {
            return await separateVocalsStemSplit(audioFile, activeKey, (pct, msg) => {
              setSeparationProgress(pct);
              setSeparationStatusText(msg);
            });
          },
          (pct, msg) => {
            setSeparationProgress(pct);
            setSeparationStatusText(msg);
          },
          'StemSplit.io'
        );

        setVocalStemUrl(res.vocalsUrl);
        setInstrumentalStemUrl(res.instrumentalUrl);
        setIsSeparating(false);
        addToast('Pemisahan vokal & instrumen berhasil (StemSplit.io)', 'info');
        return;
      } catch (err) {
        console.warn('[DEBUG-StemSplit] Final error (raw):', err.message);
        const friendlyMsg = translateErrorToUserMessage(err, 'stemsplit');
        addToast(`${friendlyMsg} Memakai DSP lokal sebagai gantinya.`, 'warning', handleStartVocalSeparation);
      }
    } else {
      addToast('Tidak ada API Key StemSplit aktif. Memakai DSP lokal sebagai gantinya.', 'warning');
    }

    // Fallback to local synth DSP split
    setTimeout(() => {
      setVocalStemUrl(originalAudioUrl);
      setInstrumentalStemUrl(originalAudioUrl);
      setIsSeparating(false);
    }, 1200);
  };

  const handleStartVoiceConversion = async () => {
    const sourceStem = vocalStemUrl || originalAudioUrl;
    if (!sourceStem) return;

    setIsConvertingVoice(true);
    setVoiceProgress(5);
    setVoiceStatusText('Memulai konversi vokal...');

    if (voiceMode === 'free') {
      try {
        const resUrl = await convertVoiceLocal(sourceStem, selectedPitchPreset, (pct, msg) => {
          setVoiceProgress(pct);
          setVoiceStatusText(msg);
        });
        setNewVocalUrl(resUrl);
        setIsConvertingVoice(false);
        addToast('Ubah vokal lokal (Pitch Shift) selesai', 'info');
      } catch (e) {
        setIsConvertingVoice(false);
        const friendlyMsg = translateErrorToUserMessage(e, 'local');
        addToast(`Gagal pitch shift lokal: ${friendlyMsg}`, 'error', handleStartVoiceConversion);
      }
      return;
    }

    // AI Voice ElevenLabs mode with auto rotation
    const hasElevenKeys = (apiKeys.elevenlabs || []).some(k => !k.failed);
    if (hasElevenKeys) {
      try {
        const resUrl = await callWithKeyRotation(
          'elevenlabs',
          apiKeys,
          markKeyAsFailed,
          async (activeKey) => {
            return await convertVoiceElevenLabs(sourceStem, selectedVoiceId, activeKey, (pct, msg) => {
              setVoiceProgress(pct);
              setVoiceStatusText(msg);
            });
          },
          (pct, msg) => {
            setVoiceProgress(pct);
            setVoiceStatusText(msg);
          },
          'ElevenLabs'
        );

        setNewVocalUrl(resUrl);
        setIsConvertingVoice(false);
        addToast('Konversi AI Voice ElevenLabs berhasil!', 'info');
        return;
      } catch (err) {
        console.warn('[DEBUG-ElevenLabs] Final error (raw):', err.message);
        const friendlyMsg = translateErrorToUserMessage(err, 'elevenlabs');
        addToast(`${friendlyMsg} Memakai Efek Pitch sebagai gantinya.`, 'warning', handleStartVoiceConversion);
      }
    } else {
      addToast('Tidak ada API Key ElevenLabs aktif. Otomatis memakai Efek Pitch sebagai gantinya.', 'warning');
    }

    // Fallback to local pitch shift
    try {
      const resUrl = await convertVoiceLocal(sourceStem, 'pitch_up', (pct, msg) => {
        setVoiceProgress(pct);
        setVoiceStatusText(msg);
      });
      setNewVocalUrl(resUrl);
    } catch (e) {}
    setIsConvertingVoice(false);
  };

  const handleStartStyleRegeneration = async () => {
    setIsRegeneratingStyle(true);
    setStyleProgress(5);
    setStyleStatusText('Menyiapkan regenerasi gaya...');

    if (styleMode === 'free') {
      setTimeout(() => {
        setNewInstrumentalUrl(instrumentalStemUrl || originalAudioUrl);
        setIsRegeneratingStyle(false);
        addToast('Efek Cepat Instrumen selesai', 'info');
      }, 1000);
      return;
    }

    // AI Mode (Kie.ai) with auto key rotation — audio-to-audio cover (sinkron dengan lagu asli)
    const hasKieKeys = (apiKeys.kie || []).some(k => !k.failed);
    const sourceInstrumentalForCover = instrumentalStemUrl;

    if (hasKieKeys && !sourceInstrumentalForCover) {
      addToast('Pisahkan trek lagu dulu (Langkah 2) sebelum memakai Ubah Gaya Musik AI. Memakai Mode Gratis sebagai gantinya.', 'warning');
    } else if (hasKieKeys) {
      try {
        const styleString = buildSunoStyleString(genre, mood, selectedInstruments, tempoPref);
        const resUrl = await callWithKeyRotation(
          'kie',
          apiKeys,
          markKeyAsFailed,
          async (activeKey) => {
            return await regenerateInstrumentalCoverApi(sourceInstrumentalForCover, customPrompt, styleString, negativeTags, vocalGenderPref, activeKey, (pct, msg) => {
              setStyleProgress(pct);
              setStyleStatusText(msg);
            });
          },
          (pct, msg) => {
            setStyleProgress(pct);
            setStyleStatusText(msg);
          },
          'Kie.ai'
        );

        setNewInstrumentalUrl(resUrl);
        setIsRegeneratingStyle(false);
        addToast('Regenerasi Musik Kie.ai (V4) Berhasil! (sinkron dengan lagu asli)', 'info');
        return;
      } catch (err) {
        console.warn('[DEBUG-KieAI] Final error (raw):', err.message);
        const isCatalogCopyrightError = err.message.toLowerCase().includes('catalog') ||
          err.message.toLowerCase().includes('existing recording');

        if (isCatalogCopyrightError) {
          // Lagu ini terdeteksi hak cipta oleh Kie.ai — mode audio-referensi tidak bisa dipakai.
          // Fallback ke mode generate biasa (text-to-music, tanpa audio referensi) yang tidak
          // melewati pengecekan katalog ini. Catatan: hasil generate mode ini TIDAK sinkron
          // sempurna dengan durasi/melodi lagu asli (komposisi independen berdasarkan prompt).
          addToast('Lagu ini terdeteksi hak cipta oleh Kie.ai. Mencoba mode generate biasa sebagai gantinya (durasi mungkin tidak sinkron)...', 'warning');
          try {
            const styleStringFallback = buildSunoStyleString(genre, mood, selectedInstruments, tempoPref);
            const fallbackResUrl = await callWithKeyRotation(
              'kie',
              apiKeys,
              markKeyAsFailed,
              async (activeKey) => {
                return await regenerateInstrumentalApi(customPrompt, styleStringFallback, negativeTags, vocalGenderPref, activeKey, (pct, msg) => {
                  setStyleProgress(pct);
                  setStyleStatusText(msg);
                });
              },
              (pct, msg) => {
                setStyleProgress(pct);
                setStyleStatusText(msg);
              },
              'Kie.ai'
            );

            setNewInstrumentalUrl(fallbackResUrl);
            setIsRegeneratingStyle(false);
            addToast('Regenerasi Musik Kie.ai berhasil (mode generate biasa, tanpa referensi audio — durasi mungkin berbeda dari lagu asli)', 'info');
            return;
          } catch (fallbackErr) {
            console.warn('[DEBUG-KieAI] Fallback generate biasa juga gagal (raw):', fallbackErr.message);
            const fallbackFriendlyMsg = translateErrorToUserMessage(fallbackErr, 'kie');
            addToast(`${fallbackFriendlyMsg} Memakai Mode Gratis sebagai gantinya.`, 'warning', handleStartStyleRegeneration);
          }
        } else {
          const friendlyMsg = translateErrorToUserMessage(err, 'kie');
          addToast(`${friendlyMsg} Memakai Mode Gratis sebagai gantinya.`, 'warning', handleStartStyleRegeneration);
        }
      }
    } else {
      addToast('Tidak ada API Key Kie.ai aktif. Memakai Mode Gratis sebagai gantinya.', 'warning');
    }

    setNewInstrumentalUrl(instrumentalStemUrl || originalAudioUrl);
    setIsRegeneratingStyle(false);
  };

  const handleStartFinalMixing = async () => {
    setIsMixing(true);
    setMixProgress(5);
    setMixStatusText('Menyiapkan penggabungan audio vokal & instrumen...');

    const vocalToUse = newVocalUrl || vocalStemUrl || originalAudioUrl;
    const instToUse = newInstrumentalUrl || instrumentalStemUrl || originalAudioUrl;

    if (!vocalToUse || !instToUse) {
      addToast('Diperlukan trek vokal dan instrumen untuk digabungkan', 'warning');
      setIsMixing(false);
      return;
    }

    try {
      const mixedUrl = await mixAudioTracks(vocalToUse, instToUse, (pct, msg) => {
        setMixProgress(pct);
        setMixStatusText(msg);
      });

      setFinalCoverUrl(mixedUrl);
      setIsMixing(false);
      addToast('Cover Musik Final Berhasil Digabungkan!', 'info');
    } catch (err) {
      console.error('[DEBUG-Mixing] Error mixing tracks:', err);
      setIsMixing(false);
      const friendlyMsg = translateErrorToUserMessage(err, 'local');
      addToast(`Gagal menggabungkan audio: ${friendlyMsg}`, 'error');
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0118] text-slate-100 font-sans relative overflow-x-hidden pb-12 selection:bg-cyan-500 selection:text-black">
      
      {/* Background SVG Waveform Overlay Accent */}
      <div className="absolute inset-0 opacity-5 pointer-events-none flex items-center justify-center overflow-hidden">
        <svg viewBox="0 0 1200 800" className="w-full h-full text-cyan-400 fill-current">
          <path d="M0 400 Q 300 200 600 400 T 1200 400 L 1200 800 L 0 800 Z" />
        </svg>
      </div>

      {/* Floating Toast Notification Stack */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full px-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto p-3 rounded-lg shadow-xl backdrop-blur-md border flex flex-col gap-2 transition-all duration-300 animate-in slide-in-from-top-2 ${
              toast.type === 'error'
                ? 'bg-rose-950/80 border-rose-500/40 text-rose-200'
                : toast.type === 'warning'
                ? 'bg-amber-950/80 border-amber-500/40 text-amber-200'
                : 'bg-cyan-950/80 border-cyan-500/40 text-cyan-200'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                {toast.type === 'warning' && <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                {toast.type === 'info' && <Info className="w-4 h-4 text-cyan-400 shrink-0" />}
                <p className="text-xs font-medium leading-relaxed">{toast.message}</p>
              </div>
              <button
                onClick={() => removeToast(toast.id)}
                className="text-slate-400 hover:text-white transition-colors p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {toast.retryHandler && (
              <button
                onClick={() => {
                  removeToast(toast.id);
                  toast.retryHandler();
                }}
                className="self-end px-2 py-1 bg-white/10 hover:bg-white/20 text-xs font-medium rounded flex items-center gap-1 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Coba Lagi
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Header Bar */}
      <header className="border-b border-purple-900/30 bg-[#0d0422]/80 backdrop-blur-md sticky top-0 z-40 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-pink-500 p-0.5 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <div className="w-full h-full bg-[#0a0118] rounded-[10px] flex items-center justify-center gap-0.5">
                <span className="w-1 h-3 bg-cyan-400 rounded-full animate-pulse" />
                <span className="w-1 h-5 bg-pink-500 rounded-full animate-pulse delay-75" />
                <span className="w-1 h-2 bg-purple-400 rounded-full animate-pulse delay-150" />
              </div>
            </div>
            <div>
              <h1 className="font-heading font-bold text-lg bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                AGE YT#5 Musik Cover
              </h1>
              <p className="text-[10px] font-mono text-cyan-400/80">AI Audio Cover Studio v4.0</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowHelpModal(true)}
              className="px-3 py-1.5 rounded-lg border border-purple-800/40 bg-purple-950/30 hover:bg-purple-900/40 text-xs font-medium text-purple-200 flex items-center gap-1.5 transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5 text-purple-400" />
              <span className="hidden sm:inline">Bantuan</span>
            </button>
            <button
              onClick={() => setShowApiModal(true)}
              className="px-3 py-1.5 rounded-lg border border-cyan-800/40 bg-cyan-950/30 hover:bg-cyan-900/40 text-xs font-medium text-cyan-200 flex items-center gap-1.5 transition-colors"
            >
              <Key className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">API Key</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-5xl mx-auto px-4 py-6 flex flex-col gap-6">

        {/* Panel 1: Upload */}
        <section className="bg-[#0f0b2e]/60 border border-purple-900/40 rounded-2xl p-4 md:p-5 backdrop-blur-sm relative overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <FileAudio className="w-5 h-5 text-cyan-400" />
              <h2 className="font-heading font-semibold text-base text-slate-100">1. Upload File Audio Lagu</h2>
            </div>
            <button
              onClick={handleLoadSampleAudio}
              className="px-2.5 py-1 rounded-md bg-purple-900/40 hover:bg-purple-800/60 border border-purple-700/50 text-[11px] font-mono text-purple-200 flex items-center gap-1 transition-colors"
            >
              🧪 Tes lagu contoh (3s)
            </button>
          </div>

          {!audioFile ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-purple-800/50 hover:border-cyan-500/50 rounded-xl p-8 text-center cursor-pointer transition-all bg-purple-950/10 hover:bg-cyan-950/10 group"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="audio/*"
                className="hidden"
              />
              <Music2 className="w-10 h-10 text-purple-400 group-hover:text-cyan-400 mx-auto mb-2 transition-colors" />
              <p className="text-sm font-medium text-slate-200">Klik untuk upload file audio lagu</p>
              <p className="text-xs text-slate-400 mt-1">Format MP3, WAV, FLAC, M4A (Maksimal 50MB)</p>
            </div>
          ) : (
            <div className="bg-[#0a0118]/80 border border-purple-800/40 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-800/50 flex items-center justify-center text-cyan-400">
                  <AudioWaveform className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-200 truncate max-w-[200px] sm:max-w-[300px]">{audioFile.name}</p>
                  <p className="text-[10px] font-mono text-slate-400">{(audioFile.size / (1024 * 1024)).toFixed(2)} MB</p>
                </div>
              </div>
              <audio src={originalAudioUrl} controls className="h-8 max-w-full sm:max-w-xs" />
            </div>
          )}
        </section>

        {/* Panel 2: Track Separation & Processing */}
        <section className={`bg-[#0f0b2e]/60 border border-purple-900/40 rounded-2xl p-4 md:p-5 backdrop-blur-sm transition-all ${!audioFile ? 'opacity-50 pointer-events-none' : ''}`}>
          
          {/* Step A: Separation */}
          <div className="border-b border-purple-900/40 pb-5 mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Disc3 className="w-5 h-5 text-pink-400" />
                <h2 className="font-heading font-semibold text-base text-slate-100">2. Langkah Awal: Pisahkan Trek Lagu</h2>
              </div>
            </div>

            <p className="text-xs text-slate-300 mb-3 leading-relaxed">
              Sistem akan memisahkan lagu menjadi vokal bersih dan musik instrumen pengiring. (Rotasi API key otomatis aktif).
            </p>

            <button
              onClick={handleStartVocalSeparation}
              disabled={isSeparating || !audioFile}
              className="w-full py-2.5 px-4 rounded-xl font-heading font-semibold text-xs bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:opacity-90 transition-opacity text-white shadow-lg shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isSeparating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>{separationStatusText || 'Memisah Audio...'}</span>
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  <span>Pisahkan Vokal & Instrumen</span>
                </>
              )}
            </button>

            {/* Info Explain Box */}
            <div className="mt-3 p-2.5 rounded-lg bg-cyan-950/30 border border-cyan-800/40 flex items-start gap-2 text-cyan-200 text-xs">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px]">
                <strong>Kenapa harus dipisah dulu?</strong> Lagu asli Anda berisi vokal dan instrumental yang sudah menyatu. Supaya cover akhir terdengar bersih, sistem perlu vokal yang 'dicabut' bersih dari lagu asli — berlaku untuk semua mode, termasuk Regenerasi AI.
              </p>
            </div>

            {/* Display Stem Results if separated */}
            {(vocalStemUrl || instrumentalStemUrl) && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                <div className="p-2.5 rounded-lg bg-[#0a0118]/60 border border-purple-800/30">
                  <p className="text-[11px] font-mono text-cyan-300 mb-1">🎤 Vokal Asli Saja</p>
                  <audio src={vocalStemUrl} controls className="w-full h-7" />
                </div>
                <div className="p-2.5 rounded-lg bg-[#0a0118]/60 border border-purple-800/30">
                  <p className="text-[11px] font-mono text-pink-300 mb-1">🎸 Instrumental Asli Saja</p>
                  <audio src={instrumentalStemUrl} controls className="w-full h-7" />
                </div>
              </div>
            )}
          </div>

          {/* Sub Panels 2A & 2B Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

            {/* Panel 2A: Voice Conversion */}
            <div className={`p-4 rounded-xl bg-[#0a0118]/50 border border-purple-900/30 flex flex-col justify-between ${(!vocalStemUrl && !audioFile) ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-heading text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                    <Headphones className="w-4 h-4 text-cyan-400" /> 2A. Ubah Karakter Vokal
                  </h3>

                  {/* Mode Toggle */}
                  <div className="flex bg-purple-950/60 p-0.5 rounded-lg border border-purple-800/40 text-[10px]">
                    <button
                      onClick={() => setVoiceMode('free')}
                      className={`px-2 py-0.5 rounded-md font-medium transition-colors ${voiceMode === 'free' ? 'bg-cyan-500 text-black' : 'text-slate-400'}`}
                    >
                      🎚️ Pitch (Gratis)
                    </button>
                    <button
                      onClick={() => setVoiceMode('ai')}
                      className={`px-2 py-0.5 rounded-md font-medium transition-colors ${voiceMode === 'ai' ? 'bg-pink-500 text-white' : 'text-slate-400'}`}
                    >
                      ✨ AI Voice
                    </button>
                  </div>
                </div>

                {voiceMode === 'free' ? (
                  <div className="space-y-3">
                    <div>
                      <label className="text-[11px] font-mono text-slate-300 block mb-1">Preset Efek Pitch:</label>
                      <select
                        value={selectedPitchPreset}
                        onChange={(e) => setSelectedPitchPreset(e.target.value)}
                        className="w-full bg-[#0d0422] border border-purple-800/50 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                      >
                        <option value="pitch_up">Pitch Naik (Ringan)</option>
                        <option value="pitch_down">Pitch Turun (Ringan)</option>
                        <option value="chipmunk">Nada Tinggi (Chipmunk)</option>
                        <option value="deep">Nada Rendah (Berat)</option>
                        <option value="robotic">Robotik</option>
                      </select>
                    </div>
                    <p className="text-[10px] text-slate-400 italic">
                      Mode gratis mengubah pitch vokal instan tanpa API key.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-2 rounded bg-amber-950/30 border border-amber-800/40 text-[10px] text-amber-200">
                      ⚠️ AI Voice menggunakan rotasi API Key ElevenLabs otomatis.
                    </div>
                    <div>
                      <label className="text-[11px] font-mono text-slate-300 block mb-1">Karakter Suara ElevenLabs:</label>
                      <select
                        value={selectedVoiceId}
                        onChange={(e) => setSelectedVoiceId(e.target.value)}
                        className="w-full bg-[#0d0422] border border-purple-800/50 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-pink-500"
                      >
                        {elevenLabsVoices.length > 0 ? (
                          elevenLabsVoices.map(v => (
                            <option key={v.voice_id} value={v.voice_id}>{v.name}</option>
                          ))
                        ) : (
                          <option value="21m00Tcm4TlvDq8ikWAM">Rachel (Default ElevenLabs)</option>
                        )}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <button
                  onClick={handleStartVoiceConversion}
                  disabled={isConvertingVoice}
                  className="w-full py-2 px-3 rounded-lg bg-cyan-900/50 hover:bg-cyan-800/60 border border-cyan-700/50 text-xs font-medium text-cyan-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  {isConvertingVoice ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-cyan-400" />}
                  <span>Proses Ubah Vokal</span>
                </button>

                {newVocalUrl && (
                  <div className="mt-2 p-2 rounded bg-[#0d0422] border border-cyan-900/40">
                    <p className="text-[10px] font-mono text-cyan-300 mb-1">Hasil Vokal Baru:</p>
                    <audio src={newVocalUrl} controls className="w-full h-6" />
                  </div>
                )}
              </div>
            </div>

            {/* Panel 2B: Style Regeneration */}
            <div className={`p-4 rounded-xl bg-[#0a0118]/50 border border-purple-900/30 flex flex-col justify-between ${(!instrumentalStemUrl && !audioFile) ? 'opacity-50 pointer-events-none' : ''}`}>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-heading text-sm font-semibold text-slate-100 flex items-center gap-1.5">
                    <Radio className="w-4 h-4 text-pink-400" /> 2B. Ubah Gaya Musik
                  </h3>

                  {/* Mode Toggle */}
                  <div className="flex bg-purple-950/60 p-0.5 rounded-lg border border-purple-800/40 text-[10px]">
                    <button
                      onClick={() => setStyleMode('free')}
                      className={`px-2 py-0.5 rounded-md font-medium transition-colors ${styleMode === 'free' ? 'bg-cyan-500 text-black' : 'text-slate-400'}`}
                    >
                      🎚️ Efek Cepat
                    </button>
                    <button
                      onClick={() => setStyleMode('ai')}
                      className={`px-2 py-0.5 rounded-md font-medium transition-colors ${styleMode === 'ai' ? 'bg-pink-500 text-white' : 'text-slate-400'}`}
                    >
                      ✨ Kie.ai (V4)
                    </button>
                  </div>
                </div>

                {styleMode === 'free' ? (
                  <p className="text-xs text-slate-300 leading-relaxed">
                    Mode gratis memakai audio instrumental asli hasil pisahan tanpa merubah genre secara ekstrem.
                  </p>
                ) : (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-0.5">Genre:</label>
                        <select
                          value={genre}
                          onChange={(e) => setGenre(e.target.value)}
                          className="w-full bg-[#0d0422] border border-purple-800/50 rounded-md px-2 py-1 text-xs text-slate-200"
                        >
                          <option value="Lo-Fi">Lo-Fi</option>
                          <option value="Acoustic">Acoustic</option>
                          <option value="Pop">Pop</option>
                          <option value="Rock">Rock</option>
                          <option value="EDM">EDM</option>
                          <option value="Jazz">Jazz</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-slate-400 block mb-0.5">Mood:</label>
                        <select
                          value={mood}
                          onChange={(e) => setMood(e.target.value)}
                          className="w-full bg-[#0d0422] border border-purple-800/50 rounded-md px-2 py-1 text-xs text-slate-200"
                        >
                          <option value="Calm">Calm</option>
                          <option value="Energetic">Energetic</option>
                          <option value="Happy">Happy</option>
                          <option value="Sad">Sad</option>
                          <option value="Epic">Epic</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] font-mono text-slate-400 block mb-0.5">Prompt Bebas (Opsional):</label>
                      <input
                        type="text"
                        placeholder="Contoh: Acoustic chill cover with piano"
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        className="w-full bg-[#0d0422] border border-purple-800/50 rounded-md px-2.5 py-1 text-xs text-slate-200 focus:outline-none focus:border-pink-500"
                      />
                    </div>

                    <p className="text-[10px] font-mono text-pink-300 truncate">
                      Preview: {buildSunoStyleString(genre, mood, selectedInstruments, tempoPref)}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4">
                <button
                  onClick={handleStartStyleRegeneration}
                  disabled={isRegeneratingStyle}
                  className="w-full py-2 px-3 rounded-lg bg-pink-900/50 hover:bg-pink-800/60 border border-pink-700/50 text-xs font-medium text-pink-200 transition-colors flex items-center justify-center gap-1.5"
                >
                  {isRegeneratingStyle ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 text-pink-400" />}
                  <span>Proses Musik Instrumen</span>
                </button>

                {newInstrumentalUrl && (
                  <div className="mt-2 p-2 rounded bg-[#0d0422] border border-pink-900/40">
                    <p className="text-[10px] font-mono text-pink-300 mb-1">Hasil Musik Baru:</p>
                    <audio src={newInstrumentalUrl} controls className="w-full h-6" />
                  </div>
                )}
              </div>
            </div>

          </div>
        </section>

        {/* Panel 3: Process Status & Final Mix */}
        <section className={`bg-[#0f0b2e]/60 border border-purple-900/40 rounded-2xl p-4 md:p-5 backdrop-blur-sm transition-all ${!audioFile ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex items-center gap-2 mb-3">
            <SlidersHorizontal className="w-5 h-5 text-cyan-400" />
            <h2 className="font-heading font-semibold text-base text-slate-100">3. Mix & Hasil Cover Final</h2>
          </div>

          {/* Pipeline Status Header Bar */}
          <div className="bg-[#0a0118]/80 p-2.5 rounded-xl border border-purple-800/30 mb-4 flex flex-wrap items-center justify-between text-[11px] font-mono gap-2 text-slate-300">
            <span className={audioFile ? 'text-cyan-400' : ''}>1. Upload ✓</span>
            <span className={vocalStemUrl ? 'text-cyan-400' : ''}>2. Pisah Trek {vocalStemUrl ? '✓' : ''}</span>
            <span className={newVocalUrl || newInstrumentalUrl ? 'text-pink-400' : ''}>3. Vokal/Musik {newVocalUrl || newInstrumentalUrl ? '✓' : '(opsional)'}</span>
            <span className={finalCoverUrl ? 'text-emerald-400 font-bold' : ''}>4. Mix Cover</span>
          </div>

          <button
            onClick={handleStartFinalMixing}
            disabled={isMixing || (!vocalStemUrl && !audioFile)}
            className="w-full py-3 px-4 rounded-xl font-heading font-bold text-sm bg-gradient-to-r from-cyan-500 via-purple-500 to-pink-500 hover:opacity-90 transition-opacity text-white shadow-xl shadow-cyan-500/20 disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {isMixing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{mixStatusText || 'Menggabungkan Audio...'}</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Gabungkan & Buat Cover Final</span>
              </>
            )}
          </button>
          <p className="text-[10px] text-slate-400 text-center mt-1.5">
            Bagian yang belum diproses (vokal atau instrumen) akan memakai versi asli lagu Anda secara otomatis.
          </p>

          {finalCoverUrl && (
            <div className="mt-5 p-4 rounded-xl bg-gradient-to-r from-cyan-950/40 via-purple-950/40 to-pink-950/40 border border-cyan-500/40 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-cyan-300">
                  <Music2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-heading font-bold text-sm text-white">Cover Musik Anda Siap!</h4>
                  <p className="text-[11px] font-mono text-cyan-300">Format: Studio WAV Output</p>
                </div>
              </div>

              <div className="flex items-center gap-3 w-full sm:w-auto">
                <audio src={finalCoverUrl} controls className="h-8 max-w-full" />
                <a
                  href={finalCoverUrl}
                  download="cover_musik_final.wav"
                  className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs rounded-lg flex items-center gap-1 transition-colors shrink-0"
                >
                  <Download className="w-3.5 h-3.5" /> Unduh
                </a>
              </div>
            </div>
          )}
        </section>

      </main>

      {/* Footer Disclaimer */}
      <footer className="max-w-5xl mx-auto px-4 mt-8 border-t border-purple-900/30 pt-4 text-center">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          AGE YT#5 Musik Cover — biaya penggunaan API sepenuhnya ditanggung pengguna lewat API key masing-masing. Sistem mendukung rotasi otomatis antar API key ketika kredit salah satu key habis.
        </p>
      </footer>

      {/* Modal API Key Settings */}
      {}
      {showApiModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f0b2e] border border-purple-800/60 rounded-2xl max-w-md w-full p-5 shadow-2xl relative">
            <button
              onClick={() => setShowApiModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center justify-between mb-3 pr-6">
              <h3 className="font-heading font-bold text-base text-slate-100 flex items-center gap-2">
                <Key className="w-4 h-4 text-cyan-400" /> Pengaturan API Key
              </h3>
              <button
                onClick={refreshAllCredits}
                disabled={isCheckingCredits}
                className="px-2.5 py-1 rounded bg-purple-900/40 hover:bg-purple-800/60 border border-purple-700/50 text-[11px] font-mono text-cyan-300 flex items-center gap-1 transition-colors disabled:opacity-50"
                title="Cek ulang semua credit"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingCredits ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            {/* Service Tabs */}
            <div className="flex border-b border-purple-800/40 mb-4 overflow-x-auto gap-1">
              {[
                { id: 'stemsplit', label: 'StemSplit.io' },
                { id: 'elevenlabs', label: 'ElevenLabs' },
                { id: 'kits', label: 'Kits.AI' },
                { id: 'lalal', label: 'LALAL.AI' },
                { id: 'kie', label: 'Kie.ai' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveApiTab(tab.id)}
                  className={`px-3 py-1.5 text-xs font-mono font-medium border-b-2 transition-colors whitespace-nowrap ${
                    activeApiTab === tab.id
                      ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="space-y-4">
              <div>
                <label className="text-xs font-mono text-slate-300 block mb-1">
                  Tambah API Key {activeApiTab.toUpperCase()}:
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    placeholder={`Masukkan API key ${activeApiTab}...`}
                    value={tempKeyInputs[activeApiTab] || ''}
                    onChange={(e) => setTempKeyInputs({ ...tempKeyInputs, [activeApiTab]: e.target.value })}
                    className="flex-1 bg-[#0d0422] border border-purple-800/50 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                  <button
                    onClick={() => handleSaveKey(activeApiTab)}
                    className="px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black font-semibold text-xs rounded-lg transition-colors"
                  >
                    💾 Simpan
                  </button>
                </div>
              </div>

              {/* Saved Keys List */}
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                <p className="text-[11px] font-mono text-slate-400">Daftar Key Tersimpan:</p>
                {(apiKeys[activeApiTab] || []).length === 0 ? (
                  <p className="text-xs text-slate-400 italic">Belum ada key tersimpan untuk layanan ini.</p>
                ) : (
                  (apiKeys[activeApiTab] || []).map((k, idx) => {
                    const isFirstValid = (apiKeys[activeApiTab] || []).find(item => !item.failed)?.key === k.key;
                    return (
                      <div key={idx} className="flex items-center justify-between p-2 rounded bg-[#0d0422] border border-purple-900/40 text-xs font-mono">
                        <div className="flex items-center gap-2 truncate flex-wrap">
                          <span>{k.key.slice(0, 8)}••••••••</span>
                          {k.failed ? (
                            <span className="px-1.5 py-0.5 rounded bg-rose-950 border border-rose-800 text-[9px] text-rose-300">🔴 Gagal</span>
                          ) : isFirstValid ? (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-[9px] text-emerald-300">🟢 AKTIF</span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-[9px] text-slate-400">⚪ Standby</span>
                          )}
                          {renderCreditBadge(activeApiTab, k.credit)}
                        </div>
                        <button
                          onClick={() => handleDeleteKey(activeApiTab, k.key)}
                          className="text-slate-400 hover:text-rose-400 transition-colors p-1 ml-1 shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#0f0b2e] border border-purple-800/60 rounded-2xl max-w-lg w-full p-5 shadow-2xl relative max-h-[85vh] overflow-y-auto">
            <button
              onClick={() => setShowHelpModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="font-heading font-bold text-base text-slate-100 mb-3 flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-purple-400" /> Panduan & Bantuan
            </h3>

            <div className="space-y-4 text-xs leading-relaxed text-slate-300">
              <div>
                <h4 className="font-bold text-cyan-300 mb-1">Cara Mendapatkan API Key Gratis:</h4>
                <ul className="space-y-1.5 list-disc pl-4 text-slate-300">
                  <li><strong>StemSplit.io:</strong> Daftar di stemsplit.io untuk 5 menit pemrosesan gratis.</li>
                  <li><strong>ElevenLabs:</strong> Daftar gratis di elevenlabs.io untuk 10.000 karakter/bulan.</li>
                  <li><strong>Kits.AI:</strong> Daftar di kits.ai, buka menu API di sidebar untuk buat Token baru.</li>
                  <li><strong>Kie.ai:</strong> Daftar di kie.ai untuk mendapatkan kredit awal gratis.</li>
                </ul>
              </div>

              <div>
                <h4 className="font-bold text-pink-300 mb-1">Fitur Rotasi Key Otomatis:</h4>
                <p>Jika satu API key habis kredit atau gagal, sistem akan otomatis beralih ke key tersimpan berikutnya dalam daftar tanpa perlu menekan tombol ulang.</p>
              </div>

              <div>
                <h4 className="font-bold text-amber-300 mb-1">Pertanyaan Umum (FAQ):</h4>
                <p><strong>Q: Kenapa vokal jatuh ke DSP Lokal?</strong><br />A: Jika semua API Key di daftar habis/gagal, sistem otomatis memakai mode DSP browser agar tools tetap berfungsi.</p>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}