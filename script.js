        import { stations } from './estacoes.js';
        import { updateIntervalTime, isValidTrack, fetchItunesData, fetchStationData, fetchLyrics } from './api_config.js';

// ==========================================
// DECLARAÇÃO DE ELEMENTOS DOM E VARIÁVEIS
// ==========================================
const audioPlayer = document.getElementById('audioPlayer');
const previewAudio = document.getElementById('previewAudio');
const appContainer = document.getElementById('appContainer');
const historyGrid = document.getElementById('historyGrid');

const homePlayBtn = document.getElementById('homePlayBtn');
const playerPlayBtn = document.getElementById('playerPlayBtn');
const stickyPlayBtn = document.getElementById('stickyPlayBtn');
const playerPlayIcon = document.getElementById('playerPlayIcon');
const stickyPlayIcon = document.getElementById('stickyPlayIcon');
const mainPlayerControls = document.getElementById('mainPlayerControls');
const visualizerRing = document.getElementById('visualizerRing');

const circularArtWrapper = document.querySelector('.circular-art-wrapper');
const shareOverlay = document.getElementById('shareOverlay');
const shareFacebook = document.getElementById('shareFacebook');
const shareTwitter = document.getElementById('shareTwitter');

window.currentVisualizerColor = [74, 222, 128]; 

window.changeStation = null;
window.selectQualityMode = null;
window.togglePreview = null;
window.openQualityModal = null;
window.showListenerToast = null;
window.showGenericToast = null;
window.toggleRecording = null;
window.openSleepModal = null;
window.setSleepTimer = null;
window.toggleHistoryActions = null;

// Configuração do CORS Proxy para o ColorThief
const CORS_PROXY = 'https://images.weserv.nl/?url=';

// ==========================================
// HLS.JS E AUDIO SOURCE SETUP
// ==========================================
let hls = null;

function setupAudioSource(player, url) {
    if (!player) return;
    
    // Destrói a instância anterior do HLS se existir para evitar vazamentos e falhas ao trocar de rádio
    if (player.id === 'audioPlayer') {
        if (hls) {
            hls.destroy();
            hls = null;
        }
        player.removeAttribute('src');
        player.load();
    }

    if (url.includes('.m3u8') || url.includes('.m3u')) {
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
            hls = new Hls({
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 90
            });
            
            hls.on(Hls.Events.MEDIA_ATTACHED, () => {
                hls.loadSource(url);
            });
            
            hls.on(Hls.Events.ERROR, function (event, data) {
                if (data.fatal) {
                    switch (data.type) {
                        case Hls.ErrorTypes.NETWORK_ERROR:
                            hls.startLoad();
                            break;
                        case Hls.ErrorTypes.MEDIA_ERROR:
                            hls.recoverMediaError();
                            break;
                        default:
                            hls.destroy();
                            if(isPlaying && !isSwitchingQuality) {
                                setBufferingState(false); setOfflineState(true); handleReconnect();
                            }
                            break;
                    }
                }
            });
            
            hls.attachMedia(player);
        } else if (player.canPlayType('application/vnd.apple.mpegurl')) {
            // Suporte nativo ao HLS (Safari, iOS, macOS)
            player.src = url;
            player.load();
        } else {
            window.showGenericToast('Incompatível', 'Seu navegador não suporta HLS.', 'bi-exclamation-triangle', '#f43f5e');
        }
    } else {
        // Stream Padrão (Icecast/Shoutcast - mp3/aac)
        player.src = url;
        player.load();
    }
}

// ==========================================
// GOOGLE IMA (VAST) ADS SYSTEM
// ==========================================
let adDisplayContainer;
let adsLoader;
let adsManager;
let prerollPlayed = false;

const VAST_TAG_URL = 'https://pubads.g.doubleclick.net/gampad/ads?iu=/21775744923/external/single_preroll_skippable&sz=640x480&ciu_szs=300x250%2C728x90&gdfp_req=1&output=vast&unviewed_position_start=1&env=vp&impl=s&correlator=';

function initIMA() {
    if (typeof google === 'undefined' || !google.ima) return; 
    const adVideoElement = document.getElementById('adVideoElement');
    const adContainer = document.getElementById('adContainer');
    adDisplayContainer = new google.ima.AdDisplayContainer(adContainer, adVideoElement);
    adsLoader = new google.ima.AdsLoader(adDisplayContainer);
    adsLoader.addEventListener(google.ima.AdsManagerLoadedEvent.Type.ADS_MANAGER_LOADED, onAdsManagerLoaded, false);
    adsLoader.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, onAdError, false);
}

function playPrerollAd() {
    if (typeof google === 'undefined' || !google.ima || !adsLoader) {
        prerollPlayed = true;
        toggleLivePlay();
        return;
    }
    
    prerollPlayed = true;
    const adOverlay = document.getElementById('adOverlay');
    const adVideoElement = document.getElementById('adVideoElement');
    
    adOverlay.style.display = 'flex';
    
    adVideoElement.load();
    adDisplayContainer.initialize();
    
    const adsRequest = new google.ima.AdsRequest();
    adsRequest.adTagUrl = VAST_TAG_URL;
    adsRequest.linearAdSlotWidth = window.innerWidth;
    adsRequest.linearAdSlotHeight = window.innerHeight;
    adsRequest.nonLinearAdSlotWidth = window.innerWidth;
    adsRequest.nonLinearAdSlotHeight = window.innerHeight;
    
    adsLoader.requestAds(adsRequest);
}

function onAdsManagerLoaded(adsManagerLoadedEvent) {
    const adsRenderingSettings = new google.ima.AdsRenderingSettings();
    adsRenderingSettings.restoreCustomPlaybackStateOnAdBreakComplete = true;
    
    const adVideoElement = document.getElementById('adVideoElement');
    adsManager = adsManagerLoadedEvent.getAdsManager(adVideoElement, adsRenderingSettings);
    
    adsManager.addEventListener(google.ima.AdErrorEvent.Type.AD_ERROR, onAdError);
    adsManager.addEventListener(google.ima.AdEvent.Type.ALL_ADS_COMPLETED, onAdComplete);
    adsManager.addEventListener(google.ima.AdEvent.Type.SKIPPED, onAdComplete);
    adsManager.addEventListener(google.ima.AdEvent.Type.USER_CLOSE, onAdComplete);
    
    try {
        adsManager.init(window.innerWidth, window.innerHeight, google.ima.ViewMode.NORMAL);
        adsManager.start();
    } catch (adError) {
        onAdError(adError);
    }
}

function onAdError(adErrorEvent) {
    console.log('Google IMA Ad Error: ', adErrorEvent.getError());
    resumeToStream();
}

function onAdComplete() {
    resumeToStream();
}

function resumeToStream() {
    if (adsManager) { adsManager.destroy(); }
    const adOverlay = document.getElementById('adOverlay');
    if(adOverlay) adOverlay.style.display = 'none';
    
    if (!isPlaying) { toggleLivePlay(); }
}

window.addEventListener('resize', () => {
    if (adsManager) {
        adsManager.resize(window.innerWidth, window.innerHeight, google.ima.ViewMode.NORMAL);
    }
});

initIMA();

// ==========================================
// SISTEMA DE COMPARTILHAMENTO E ANIMAÇÃO DA CAPA
// ==========================================
let shareTimeout;

if (circularArtWrapper) {
    circularArtWrapper.addEventListener('click', (e) => {
        if (shareOverlay && shareOverlay.style.display === 'none') return;
        
        const isShowing = circularArtWrapper.classList.contains('show-share');
        
        if (isShowing) {
            circularArtWrapper.classList.remove('show-share');
            clearTimeout(shareTimeout);
        } else {
            circularArtWrapper.classList.add('show-share');
            clearTimeout(shareTimeout);
            shareTimeout = setTimeout(() => {
                circularArtWrapper.classList.remove('show-share');
            }, 4500);
        }
    });
}

if (shareFacebook) {
    shareFacebook.addEventListener('click', (e) => {
        e.stopPropagation();
        if(!currentTrackMetadata) return;
        const url = encodeURIComponent(window.location.href);
        const text = encodeURIComponent(`Ouvindo ${currentTrackMetadata.title} de ${currentTrackMetadata.artist}`);
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}&quote=${text}`, '_blank', 'width=600,height=400');
        circularArtWrapper.classList.remove('show-share');
    });
}

if (shareTwitter) {
    shareTwitter.addEventListener('click', (e) => {
        e.stopPropagation();
        if(!currentTrackMetadata) return;
        const url = encodeURIComponent(window.location.href);
        const text = encodeURIComponent(`Ouvindo ${currentTrackMetadata.title} de ${currentTrackMetadata.artist}`);
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=600,height=400');
        circularArtWrapper.classList.remove('show-share');
    });
}

// ==========================================
// TOAST NOTIFICATIONS GENÉRICAS E LISTENERS
// ==========================================
let previousListenersCount = -1; 

window.showGenericToast = function(title, desc, iconClass, colorHex) {
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast-msg`;
    
    toast.innerHTML = `
        <div class="toast-icon" style="background: ${colorHex}22; color: ${colorHex}; border: 1px solid ${colorHex}44; box-shadow: 0 0 10px ${colorHex}22;">
            <i class="bi ${iconClass}"></i>
        </div>
        <div class="toast-content">
            <span class="toast-title" style="color: ${colorHex}">${title}</span>
            <span class="toast-desc">${desc}</span>
        </div>
        <div class="toast-progress">
            <div class="toast-progress-bar" style="background: ${colorHex};"></div>
        </div>
    `;

    toastContainer.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        toast.classList.add('hide');
        setTimeout(() => {
            if (toastContainer.contains(toast)) toastContainer.removeChild(toast);
        }, 400); 
    }, 4000); 
};

window.showListenerToast = function(type, totalListeners) {
    const isConnect = type === 'connect';
    const titleText = isConnect ? 'Novo Ouvinte' : 'Ouvinte Saiu';
    const descText = isConnect 
        ? `um novo ouvinte se conectou. Total: <strong>${totalListeners}</strong>.` 
        : `um ouvinte se desconectou. Total: <strong>${totalListeners}</strong>.`;
        
    window.showGenericToast(
        titleText, 
        descText, 
        isConnect ? 'bi-person-check-fill' : 'bi-person-dash-fill', 
        isConnect ? '#4ade80' : '#f43f5e'
    );
};

// ==========================================
// GRAVAÇÃO DE ÁUDIO DIRETA (RAW STREAM FETCH)
// ==========================================
let recordController = null;
let recordedChunks = [];
let isRecording = false;
let recordMimeType = '';
let recordExtension = 'mp3';

window.toggleRecording = async function() {
    const recordBtn = document.getElementById('recordBtn');
    const headerDropdown = document.getElementById('headerDropdown');
    const station = stations[currentStationIndex];
    
    // VERIFICA SE A RÁDIO PERMITE GRAVAÇÃO
    const canRecord = station.record !== "false" && station.record !== false;
    
    if (!canRecord) {
        window.showGenericToast('Gravação Bloqueada', 'Esta estação não permite a gravação da transmissão.', 'bi-shield-lock-fill', '#f43f5e');
        if (headerDropdown) headerDropdown.classList.remove('show');
        return;
    }
    
    if (!isRecording) {
        try {
            const streamUrl = getCurrentStreamUrl(true);
            if (!streamUrl) {
                window.showGenericToast('Aviso', 'Nenhuma transmissão ativa para gravar.', 'bi-exclamation-triangle-fill', '#fceb05');
                headerDropdown.classList.remove('show');
                return;
            }

            // Impede a gravação de arquivos de manifesto HLS via fetch simples
            if (streamUrl.includes('.m3u8') || streamUrl.includes('.m3u')) {
                window.showGenericToast('Gravação Indisponível', 'Não é possível gravar transmissões HLS (.m3u8) por este método.', 'bi-mic-mute-fill', '#fceb05');
                headerDropdown.classList.remove('show');
                return;
            }

            recordController = new AbortController();
            recordedChunks = [];

            headerDropdown.classList.remove('show');
            window.showGenericToast('Conectando', 'Iniciando captura da transmissão...', 'bi-hourglass-split', '#3b82f6');

            const response = await fetch(streamUrl, { signal: recordController.signal });
            
            if (!response.ok) throw new Error('Network response was not ok');

            recordMimeType = response.headers.get('content-type') || '';
            const mimeLower = recordMimeType.toLowerCase();
            
            if (mimeLower.includes('mpeg')) recordExtension = 'mp3';
            else if (mimeLower.includes('aac')) recordExtension = 'aac';
            else if (mimeLower.includes('ogg')) recordExtension = 'ogg';
            else if (mimeLower.includes('mp4')) recordExtension = 'm4a';
            else recordExtension = 'mp3';

            isRecording = true;
            recordBtn.innerHTML = '<i class="bi bi-stop-circle" style="color: #f43f5e;"></i> Parar Gravação';
            window.showGenericToast('Gravando', `Capturando formato original (.${recordExtension})`, 'bi-record-circle', '#ef4444');

            const reader = response.body.getReader();

            const readStream = async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        if (value) recordedChunks.push(value);
                    }
                } catch (err) {
                    if (err.name === 'AbortError') {
                        saveRecording();
                    } else {
                        console.error('Erro na leitura da stream:', err);
                        stopAndDiscardRecording();
                        window.showGenericToast('Erro', 'A conexão da gravação foi interrompida.', 'bi-x-circle-fill', '#f43f5e');
                    }
                }
            };
            
            readStream();

        } catch(e) {
            console.error(e);
            if (e.name !== 'AbortError') {
                window.showGenericToast('Erro de Segurança', 'O servidor bloqueou a gravação direta (CORS).', 'bi-shield-lock-fill', '#f43f5e');
            }
            stopAndDiscardRecording();
        }
    } else {
        if (recordController) {
            recordController.abort();
        }
    }
};

function saveRecording() {
    if (recordedChunks.length === 0) {
        stopAndDiscardRecording();
        return;
    }

    const blob = new Blob(recordedChunks, { type: recordMimeType || 'audio/mpeg' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Gravacao_Radio_${new Date().getTime()}.${recordExtension}`;
    a.click();
    URL.revokeObjectURL(url);
    
    window.showGenericToast('Concluído', `Gravação salva no formato .${recordExtension}`, 'bi-check-circle-fill', '#4ade80');
    stopAndDiscardRecording();
}

function stopAndDiscardRecording() {
    isRecording = false;
    recordedChunks = [];
    recordController = null;
    const recordBtn = document.getElementById('recordBtn');
    if(recordBtn) recordBtn.innerHTML = '<i class="bi bi-record-circle"></i> Gravar Stream';
}

// ==========================================
// SLEEP TIMER E AUTO CLOSE
// ==========================================
let sleepTimerTimeout;
let sleepAutoCloseTimeout;

function resetSleepAutoClose() {
    clearTimeout(sleepAutoCloseTimeout);
    sleepAutoCloseTimeout = setTimeout(() => {
        const slpModal = document.getElementById('sleepModal');
        if (slpModal && slpModal.classList.contains('show')) slpModal.classList.remove('show');
    }, 6000); 
}

const sleepModalEl = document.getElementById('sleepModal');
if (sleepModalEl) {
    sleepModalEl.addEventListener('mousemove', resetSleepAutoClose);
    sleepModalEl.addEventListener('touchstart', resetSleepAutoClose, {passive: true});
}

window.openSleepModal = function() {
    document.getElementById('sleepModal').classList.add('show');
    document.getElementById('headerDropdown').classList.remove('show');
    resetSleepAutoClose();
};

const closeSleepBtn = document.getElementById('closeSleepBtn');
if(closeSleepBtn) closeSleepBtn.addEventListener('click', () => { document.getElementById('sleepModal').classList.remove('show'); });

window.setSleepTimer = function(minutes) {
    clearTimeout(sleepTimerTimeout);
    document.getElementById('sleepModal').classList.remove('show');

    if(minutes === 0) {
        window.showGenericToast('Sleep Timer', 'O temporizador foi desativado.', 'bi-moon-stars', '#aaaaaa');
        return;
    }

    const ms = minutes * 60000;
    sleepTimerTimeout = setTimeout(() => {
        if (isPlaying) {
            window.showGenericToast('Sleep Timer', 'A transmissão foi pausada.', 'bi-moon-stars-fill', '#3b82f6');
            toggleLivePlay(); 
        }
    }, ms);
    
    window.showGenericToast('Sleep Timer', `A rádio será pausada em ${minutes} minutos.`, 'bi-clock-fill', '#3b82f6');
};

// ==========================================
// DROPDOWNS E CLICK OUTSIDE (MÚLTIPLOS MENUS)
// ==========================================
const headerMenuBtn = document.getElementById('headerMenuBtn');
const headerDropdown = document.getElementById('headerDropdown');
let dropdownTimeout;
let historyActionTimeout;
let activeActionCardId = null;

function resetDropdownTimeout() {
    clearTimeout(dropdownTimeout);
    dropdownTimeout = setTimeout(() => {
        if(headerDropdown) headerDropdown.classList.remove('show');
    }, 6000); 
}

if(headerMenuBtn) {
    headerMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        headerDropdown.classList.toggle('show');
        resetDropdownTimeout();
    });
}

if(headerDropdown) {
    headerDropdown.addEventListener('mousemove', resetDropdownTimeout);
    headerDropdown.addEventListener('touchstart', resetDropdownTimeout, {passive: true});
}

window.toggleHistoryActions = function(safeId) {
    const card = document.getElementById(`card_${safeId}`);
    if (!card) return;

    if (card.classList.contains('show-actions')) {
        card.classList.remove('show-actions');
        clearTimeout(historyActionTimeout);
        activeActionCardId = null;
        return;
    }

    if (activeActionCardId) {
        const prevCard = document.getElementById(`card_${activeActionCardId}`);
        if (prevCard) prevCard.classList.remove('show-actions');
    }

    card.classList.add('show-actions');
    activeActionCardId = safeId;
    clearTimeout(historyActionTimeout);

    historyActionTimeout = setTimeout(() => {
        card.classList.remove('show-actions');
        activeActionCardId = null;
    }, 5000);
}

document.addEventListener('click', (e) => {
    if (headerDropdown && !headerDropdown.contains(e.target) && e.target !== headerMenuBtn && !headerMenuBtn.contains(e.target)) {
        headerDropdown.classList.remove('show');
    }
    if (circularArtWrapper && !circularArtWrapper.contains(e.target)) {
        circularArtWrapper.classList.remove('show-share');
        clearTimeout(shareTimeout);
    }
    if (activeActionCardId) {
        const card = document.getElementById(`card_${activeActionCardId}`);
        if (card && !card.contains(e.target)) {
            card.classList.remove('show-actions');
            clearTimeout(historyActionTimeout);
            activeActionCardId = null;
        }
    }
});

// ==========================================
// INTEGRAÇÃO COLOR THIEF (THEME-COLOR E CÓPIA SEGURA VIA CORS)
// ==========================================
function updateThemeColor(imageUrl) {
    if (!imageUrl) return;
    
    const img = new Image();
    img.crossOrigin = 'Anonymous'; 
    img.onload = function() {
        try {
            const colorThief = new ColorThief();
            const color = colorThief.getColor(img);
            
            if (color && color.length >= 3) {
                window.currentVisualizerColor = color;
                
                const r = color[0]; const g = color[1]; const b = color[2];
                
                if(visualizerRing) {
                    visualizerRing.style.background = `radial-gradient(circle, rgba(${r}, ${g}, ${b}, 0.15) 0%, transparent 70%)`;
                    visualizerRing.style.border = `2px solid rgba(${r}, ${g}, ${b}, 0.6)`;
                    visualizerRing.style.boxShadow = `0 0 20px rgba(${r}, ${g}, ${b}, 0.6), inset 0 0 15px rgba(${r}, ${g}, ${b}, 0.4)`;
                }

                const hexColor = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
                const themeMeta = document.querySelector('meta[name="theme-color"]');
                if(themeMeta) {
                    themeMeta.setAttribute('content', hexColor);
                }
            }
        } catch (e) {
            console.log('ColorThief: erro ao extrair cor', e);
            document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#111111');
            window.currentVisualizerColor = [74, 222, 128]; 
        }
    };
    img.onerror = function() {
        document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#111111');
        window.currentVisualizerColor = [74, 222, 128]; 
    };
    
    let finalUrl = imageUrl;
    if (finalUrl.startsWith('http') && !finalUrl.includes('images.weserv.nl')) {
        finalUrl = CORS_PROXY + encodeURIComponent(finalUrl);
    }
    img.src = finalUrl;
}

// ==========================================
// SISTEMA DE LETRAS (LRCLIB)
// ==========================================
const lyricsModal = document.getElementById('lyricsModal');
const openLyricsBtn = document.getElementById('openLyricsBtn');
const closeLyricsBtn = document.getElementById('closeLyricsBtn');
const lyricsContent = document.getElementById('lyricsContent');
const lyricsTrackInfo = document.getElementById('lyricsTrackInfo');

async function checkAndFetchLyrics(title, artist) {
    if (!openLyricsBtn) return;
    
    openLyricsBtn.style.opacity = '0.4';
    openLyricsBtn.style.pointerEvents = 'none';
    openLyricsBtn.style.cursor = 'not-allowed';
    
    if (!title || artist === 'Aguarde' || title === 'Conectando...' || title === 'Transmissão Local') return;

    const lyricsHtml = await fetchLyrics(title, artist);
    
    if (lyricsHtml) {
        openLyricsBtn.style.opacity = '0.9';
        openLyricsBtn.style.pointerEvents = 'auto';
        openLyricsBtn.style.cursor = 'pointer';
    }
}

if(openLyricsBtn) {
    openLyricsBtn.addEventListener('click', async () => {
        lyricsModal.classList.add('show');
        
        const title = currentTrackMetadata.title;
        const artist = currentTrackMetadata.artist;

        if (!title || artist === 'Aguarde' || title === 'Conectando...') {
            lyricsTrackInfo.innerHTML = `<h3>Sem música</h3><p>Aguarde a transmissão</p>`;
            lyricsContent.innerHTML = `<div style="padding-top: 40px; opacity: 0.6;">Sintonize uma rádio para ver as letras.</div>`;
            return;
        }

        lyricsTrackInfo.innerHTML = `<h3>${title}</h3><p>${artist}</p>`;
        lyricsContent.innerHTML = `<div class="lyrics-loading"><div class="spinner"></div>Buscando letras...</div>`;

        const lyricsHtml = await fetchLyrics(title, artist);

        if (lyricsHtml) {
            const cleanLyrics = lyricsHtml.replace(/\[\d{2}:\d{2}\.\d{1,3}\]\s*/g, '');
            lyricsContent.innerHTML = cleanLyrics;
        } else {
            lyricsContent.innerHTML = `<div style="padding-top: 40px; opacity: 0.6;"><i class="bi bi-music-note" style="font-size: 32px; display: block; margin-bottom: 10px;"></i>Letras não encontradas para esta faixa.</div>`;
        }
    });
}

if(closeLyricsBtn) closeLyricsBtn.addEventListener('click', () => lyricsModal.classList.remove('show'));

// ==========================================
// SISTEMA DE FILTRO E HISTÓRICO LOCAL 
// ==========================================
const invalidTexts = ['the hits & the viber 98.fm', 'the hitz channel power 181', 'jingle', 'vinheta', 'energy brasil', '98.fm'];

function isTrackAllowed(title, artist) {
    if (!title || !artist) return false;
    const str = `${title} ${artist}`.toLowerCase();
    return !invalidTexts.some(kw => str.includes(kw.toLowerCase()));
}

const HISTORY_TTL = 24 * 60 * 60 * 1000; 

function cleanAndGetLocalHistory(stationId) {
    const key = `radioLocalHistory_${stationId}`;
    let history = [];
    try { history = JSON.parse(localStorage.getItem(key)) || []; } catch(e) { history = []; }
    
    const now = Date.now();
    const validHistory = history.filter(item => (now - (item.timestamp * 1000)) < HISTORY_TTL);
    
    if (validHistory.length !== history.length) localStorage.setItem(key, JSON.stringify(validHistory));
    return validHistory;
}

function addTrackToLocalHistory(stationId, songData) {
    let history = cleanAndGetLocalHistory(stationId);
    
    const titleNormalized = songData.title.toLowerCase().trim();
    
    const exists = history.some(item => item.title.toLowerCase().trim() === titleNormalized);
    if (exists) { history = history.filter(item => item.title.toLowerCase().trim() !== titleNormalized); }

    history.unshift({
        title: songData.title,
        artist: songData.artist,
        art: songData.art || '',
        timestamp: Math.floor(Date.now() / 1000)
    });

    if (history.length > 30) history = history.slice(0, 30);
    localStorage.setItem(`radioLocalHistory_${stationId}`, JSON.stringify(history));
    return history;
}

let savedStation = localStorage.getItem('lastStationIndex');
let currentStationIndex = savedStation ? parseInt(savedStation, 10) : 0;
let firstHistoryRender = true;

if (isNaN(currentStationIndex) || currentStationIndex < 0 || currentStationIndex >= stations.length) currentStationIndex = 0;

let isPlaying = false;
let currentTrackId = ""; 
let currentTrackMetadata = { title: 'Conectando...', artist: 'Aguarde', art: '', bgArt: '' }; 

const dotCssMap = { high: 'excelente', mid: 'normal', low: 'economica' };

let savedQuality = localStorage.getItem('radioQualityMode');
let currentQualityMode = savedQuality ? savedQuality : 'auto'; 
let activeQualityLevel = 'mid'; 

let globalVolume = 1.0; 
let fadeInterval = null;
let wasPlayingBeforePreview = false;
let isOfflineStatus = false;
let isBufferingStatus = false;
let reconnectTimeout = null;
let offlineTimeout = null;
let isSwitchingQuality = false;

window.safeSeek = function(targetTime) {
    if (!audioPlayer || audioPlayer.buffered.length === 0) return;
    try {
        const buffered = audioPlayer.buffered;
        let canSeek = false;
        for (let i = 0; i < buffered.length; i++) {
            if (targetTime >= buffered.start(i) && targetTime <= buffered.end(i)) {
                canSeek = true;
                break;
            }
        }
        
        if (canSeek) {
            audioPlayer.currentTime = targetTime;
        } else {
            const bStart = buffered.start(buffered.length - 1);
            const bEnd = buffered.end(buffered.length - 1);
            if (targetTime < bStart) {
                audioPlayer.currentTime = bStart + 1;
                window.showGenericToast('Cache Expirou', 'O cache mais antigo foi substituído pelo servidor. Retomando do limite disponível.', 'bi-info-circle', '#fceb05');
            } else {
                audioPlayer.currentTime = bEnd - 1;
            }
        }
    } catch(e) { console.warn("Seek error:", e); }
};

// ==========================================
// EQUALIZADOR DE ÁUDIO (Z-BASS, Z-TREBLE, AGC, MASTER LIMITER)
// ==========================================
let audioCtx, analyser, source;
let visualizerActive = false;
const canvas = document.getElementById('visualizerCanvas');
const ctx = canvas.getContext('2d');

function initVisualizer() {
    if (!audioCtx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioCtx = new AudioContext();
        
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256; 
        analyser.smoothingTimeConstant = 0.88; 
        
        try {
            source = audioCtx.createMediaElementSource(audioPlayer);
            
            // 1. Z-Bass (Soco suave sem embolar sub-grave)
            const zBass = audioCtx.createBiquadFilter();
            zBass.type = 'lowshelf';
            zBass.frequency.value = 85; 
            zBass.gain.value = 4.5; // Aproximadamente 30% de realce seguro
            
            // 2. Filtro Anti-Chiado (De-esser para voz estridênte)
            const deEsser = audioCtx.createBiquadFilter();
            deEsser.type = 'peaking';
            deEsser.frequency.value = 6500; 
            deEsser.Q.value = 1.5;
            deEsser.gain.value = -2.5; // Reduz a faixa estridente levemente
            
            // 3. Z-Treble (Brilho Estéreo Lossless)
            const zTreble = audioCtx.createBiquadFilter();
            zTreble.type = 'highshelf';
            zTreble.frequency.value = 10000;
            zTreble.gain.value = 4.5; // Realce de 30% para clareza
            
            // 4. AGC - Automatic Gain Control (Equilibrado, SEM PUMPING)
            const agcNode = audioCtx.createDynamicsCompressor();
            agcNode.threshold.value = -24; // Captura para nivelar
            agcNode.knee.value = 30; // Curva muita macia para não perceber atuação
            agcNode.ratio.value = 2.5; // Compressão suave
            agcNode.attack.value = 0.03; // Attack sutil, passa transiente inicial
            agcNode.release.value = 0.6; // Release LONGO para não dar efeito "pumping/respirando" na batida

            // 5. Ganho de Maquiagem Limpo
            const makeupGain = audioCtx.createGain();
            makeupGain.gain.value = 1.8; 

            // 6. Master Brickwall Limiter (Controle absoluto)
            const finalBrickwall = audioCtx.createDynamicsCompressor();
            finalBrickwall.threshold.value = -0.5; // Teto do áudio
            finalBrickwall.knee.value = 0.0; // Corte exato (Brickwall)
            finalBrickwall.ratio.value = 20.0; // Esmaga o que passar do teto
            finalBrickwall.attack.value = 0.002; // Attack imediato para picos
            finalBrickwall.release.value = 0.1; // Volta rápida

            // Conexão da Cadeia de Áudio
            source.connect(zBass);
            zBass.connect(deEsser);
            deEsser.connect(zTreble);
            zTreble.connect(agcNode);
            agcNode.connect(makeupGain);
            makeupGain.connect(finalBrickwall);
            finalBrickwall.connect(analyser);
            analyser.connect(audioCtx.destination);

            visualizerActive = true;
        } catch (e) { visualizerActive = false; }
        drawVisualizer();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(e => {});
}

function drawVisualizer() {
    requestAnimationFrame(drawVisualizer);
    
    const ring = document.getElementById('visualizerRing');
    const station = stations[currentStationIndex];
    const allowVisualizer = (station.visualizer === true || String(station.visualizer).toLowerCase() === "true");

    if (!allowVisualizer || !isPlaying || isBufferingStatus || isOfflineStatus || isSwitchingQuality) {
        canvas.style.opacity = '0'; ring.style.opacity = '0'; ring.classList.remove('fallback-pulse'); return;
    }

    if (!visualizerActive) {
        canvas.style.opacity = '0'; ring.style.opacity = '0.8'; ring.classList.add('fallback-pulse'); return;
    }

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);

    let sum = 0;
    for(let i=0; i<dataArray.length; i++) sum += dataArray[i];

    if (sum === 0) { canvas.style.opacity = '0'; ring.style.opacity = '0.8'; ring.classList.add('fallback-pulse'); return; }

    canvas.style.opacity = '1'; ring.style.opacity = '0'; ring.classList.remove('fallback-pulse');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const centerX = canvas.width / 2; const centerY = canvas.height / 2; const radius = 142; const bars = 70; const step = (Math.PI * 2) / bars;

    let colorArray = window.currentVisualizerColor || [74, 222, 128];
    let r = colorArray[0] !== undefined ? colorArray[0] : 74;
    let g = colorArray[1] !== undefined ? colorArray[1] : 222;
    let b = colorArray[2] !== undefined ? colorArray[2] : 128;
    let rgbString = `rgb(${r}, ${g}, ${b})`;

    for (let i = 0; i < bars; i++) {
        let dataIndex = i < bars / 2 ? i : bars - i;
        let value = dataArray[dataIndex + 2] || 0; 
        let barHeight = Math.max(4, (value / 255) * 60); 
        let angle = i * step - (Math.PI / 2);

        let x1 = centerX + Math.cos(angle) * radius; let y1 = centerY + Math.sin(angle) * radius;
        let x2 = centerX + Math.cos(angle) * (radius + barHeight); let y2 = centerY + Math.sin(angle) * (radius + barHeight);

        ctx.strokeStyle = rgbString; 
        ctx.lineWidth = 6; ctx.lineCap = 'round'; 
        ctx.shadowBlur = 10; ctx.shadowColor = rgbString;

        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
}

// ==========================================
// MODAIS SECUNDÁRIOS E AUTO CLOSE (ESTAÇÕES, QUALIDADE)
// ==========================================
let autoCloseTimeout;
let stationsAutoCloseTimeout;

function resetMenuAutoClose() {
    clearTimeout(autoCloseTimeout);
    autoCloseTimeout = setTimeout(() => {
        document.getElementById('qualityModal').classList.remove('show');
        const p = document.getElementById('stickyQualityPopup');
        if(p) p.classList.remove('show');
    }, 5000); 
}
document.getElementById('qualityModal').addEventListener('mousemove', resetMenuAutoClose);
document.getElementById('qualityModal').addEventListener('touchstart', resetMenuAutoClose, {passive: true});

function resetStationsAutoClose() {
    clearTimeout(stationsAutoCloseTimeout);
    stationsAutoCloseTimeout = setTimeout(() => {
        const stModal = document.getElementById('stationsModal');
        if (stModal && stModal.classList.contains('show')) stModal.classList.remove('show');
    }, 10000); 
}

const stationsModalEl = document.getElementById('stationsModal');
if(stationsModalEl) {
    stationsModalEl.addEventListener('mousemove', resetStationsAutoClose);
    stationsModalEl.addEventListener('touchstart', resetStationsAutoClose, {passive: true});
    stationsModalEl.addEventListener('scroll', resetStationsAutoClose, {passive: true});
}

let resizeTimeout;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
        if (currentTrackMetadata && currentTrackMetadata.title) updateUIText(currentTrackMetadata);
    }, 150);
});

// ==========================================
// SISTEMA DE FADE E TIME-SHIFTING (CACHE)
// ==========================================
function getCurrentStreamUrl(preventCache = false) {
    const station = stations[currentStationIndex];
    let url = '';
    if (station.streams[activeQualityLevel] && station.streams[activeQualityLevel].url) {
        url = station.streams[activeQualityLevel].url;
    } else {
        const availableKey = Object.keys(station.streams).find(k => station.streams[k] && station.streams[k].url);
        url = availableKey ? station.streams[availableKey].url : '';
    }
    
    if (preventCache && url) {
        url += (url.includes('?') ? '&' : '?') + 'nocache=' + new Date().getTime();
    }
    return url;
}

function setLoadingState(isLoading) {
    if (isLoading) {
        if(homePlayBtn) homePlayBtn.classList.add('is-loading');
        if(playerPlayBtn) playerPlayBtn.classList.add('is-loading');
        if(stickyPlayBtn) stickyPlayBtn.classList.add('is-loading');
    } else {
        if(homePlayBtn) homePlayBtn.classList.remove('is-loading');
        if(playerPlayBtn) playerPlayBtn.classList.remove('is-loading');
        if(stickyPlayBtn) stickyPlayBtn.classList.remove('is-loading');
    }
}

function setBufferingState(isBuffering) {
    isBufferingStatus = isBuffering;
    const els = [
        { t: document.getElementById('homeSongTitle'), a: document.getElementById('homeSongArtist') },
        { t: document.getElementById('playerSongTitle'), a: document.getElementById('playerSongArtist') }
    ];
    const isDesktop = window.innerWidth >= 768;

    if (isBuffering && !isOfflineStatus) {
        els.forEach(el => {
            if (el.t) {
                el.t.classList.add('blinking-text'); el.t.textContent = "Conectando...";
                if(isDesktop) applyMarquee(el.t); else { el.t.classList.remove('scrolling-text'); el.t.style.transform = 'none'; }
            }
            if (el.a) {
                el.a.classList.add('blinking-text'); el.a.innerHTML = `<span>Aguardando transmissão...</span>`;
                if(isDesktop) applyMarquee(el.a); else { el.a.classList.remove('scrolling-text'); el.a.style.transform = 'none'; }
            }
        });
    } else {
        els.forEach(el => { if (el.t) el.t.classList.remove('blinking-text'); if (el.a) el.a.classList.remove('blinking-text'); });
        if (!isOfflineStatus && currentTrackMetadata && currentTrackMetadata.title) updateUIText(currentTrackMetadata);
    }
}

function setOfflineState(isOffline) {
    isOfflineStatus = isOffline;
    setLoadingState(isOffline);
    
    const els = [
        { t: document.getElementById('homeSongTitle'), a: document.getElementById('homeSongArtist') },
        { t: document.getElementById('playerSongTitle'), a: document.getElementById('playerSongArtist') }
    ];
    const isDesktop = window.innerWidth >= 768;

    if (isOffline) {
        els.forEach(el => {
            if(el.t) {
                el.t.classList.remove('blinking-text');
                if(isDesktop) {
                    el.t.style.fontSize = '28px'; el.t.textContent = "Transmissão offline..."; applyMarquee(el.t);
                } else {
                    el.t.classList.remove('scrolling-text'); el.t.style.transform = 'none';
                    el.t.style.fontSize = autoAdjustFont("Transmissão offline...", 28, 25, 0.4, 16); el.t.textContent = "Transmissão offline...";
                }
            }
            if(el.a) {
                el.a.classList.remove('blinking-text');
                if(isDesktop) {
                    el.a.style.fontSize = '18px'; el.a.innerHTML = `<span>Aguardando conexão...</span>`; applyMarquee(el.a);
                } else {
                    el.a.classList.remove('scrolling-text'); el.a.style.transform = 'none';
                    el.a.style.fontSize = autoAdjustFont("Aguardando conexão...", 18, 30, 0.3, 12); el.a.innerHTML = `<span>Aguardando conexão...</span>`;
                }
            }
        });
    } else {
        if (!isBufferingStatus && currentTrackMetadata && currentTrackMetadata.title) updateUIText(currentTrackMetadata);
    }
}

function handleReconnect() {
    if (isPlaying) {
        setOfflineState(true);
        clearTimeout(reconnectTimeout);
        
        setupAudioSource(audioPlayer, getCurrentStreamUrl(true));

        reconnectTimeout = setTimeout(() => {
            if (isPlaying) {
                setOfflineState(false); setBufferingState(true);
                
                audioPlayer.play().then(() => {
                    setBufferingState(false);
                }).catch(e => {
                    isSwitchingQuality = false; 
                    setBufferingState(false); 
                    setOfflineState(true);
                    handleReconnect();
                });
            }
        }, 5000); 
    }
}

if(audioPlayer) {
    audioPlayer.addEventListener('waiting', () => { 
        if (isPlaying && !isSwitchingQuality) {
            setLoadingState(true); setBufferingState(true); clearTimeout(offlineTimeout);
            offlineTimeout = setTimeout(() => { setBufferingState(false); setOfflineState(true); handleReconnect(); }, 20000); 
        }
    });

    audioPlayer.addEventListener('playing', () => { 
        if (isPlaying) { 
            clearTimeout(offlineTimeout); setOfflineState(false); setBufferingState(false); setLoadingState(false); 
            if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(e => {});
        }
    });

    audioPlayer.addEventListener('error', () => { 
        if (isPlaying && !isSwitchingQuality) { clearTimeout(offlineTimeout); setBufferingState(false); setOfflineState(true); handleReconnect(); }
    });

    audioPlayer.addEventListener('stalled', () => { 
        if (isPlaying && audioPlayer.readyState === 0 && !isSwitchingQuality) { 
            setLoadingState(true); setBufferingState(true); clearTimeout(offlineTimeout);
            offlineTimeout = setTimeout(() => { setBufferingState(false); setOfflineState(true); handleReconnect(); }, 20000); 
        }
    });

    audioPlayer.addEventListener('pause', () => {
        if (isPlaying && !activePreviewId && !isSwitchingQuality) {
            let retryInterval = setInterval(() => {
                if (!isPlaying || activePreviewId || isSwitchingQuality) { clearInterval(retryInterval); return; } 
                audioPlayer.play().then(() => { clearInterval(retryInterval); }).catch(e => {});
            }, 2000);
        }
    });
}

window.addEventListener('offline', () => { if (isPlaying) { clearTimeout(offlineTimeout); setBufferingState(false); setOfflineState(true); handleReconnect(); } });
window.addEventListener('online', () => { if (isOfflineStatus && isPlaying) handleReconnect(); });

function fadeAudio(player, action, callback) {
    if(!player) return;
    clearInterval(fadeInterval);
    
    const isBackground = document.hidden || document.visibilityState === 'hidden'; 
    
    if (action === 'in') {
        player.volume = isBackground ? globalVolume : 0.0001;
        const playPromise = player.play();
        
        if (playPromise !== undefined) {
            playPromise.then(() => {
                setLoadingState(false); clearTimeout(offlineTimeout); setOfflineState(false);
                
                if (isBackground) {
                    player.volume = Math.max(0, Math.min(1, globalVolume));
                    if (callback) callback();
                } else {
                    let vol = player.volume;
                    fadeInterval = setInterval(() => {
                        vol += 0.05;
                        if (vol >= globalVolume) {
                            player.volume = Math.max(0, Math.min(1, globalVolume)); clearInterval(fadeInterval); if (callback) callback();
                        } else { player.volume = Math.max(0.0001, Math.min(1, vol)); }
                    }, 40);
                }
            }).catch(e => {
                isSwitchingQuality = false; 
                if (e.name !== 'AbortError') { setBufferingState(false); setOfflineState(true); handleReconnect(); }
            });
        } else { isSwitchingQuality = false; }
    } 
    else if (action === 'out') { 
        if (isBackground) {
            player.volume = 0; player.pause();
            player.volume = Math.max(0, Math.min(1, globalVolume));
            if (callback) callback();
        } else {
            let vol = player.volume;
            fadeInterval = setInterval(() => {
                vol -= 0.05;
                if (vol <= 0.05) {
                    player.volume = 0; player.pause();
                    player.volume = Math.max(0, Math.min(1, globalVolume)); clearInterval(fadeInterval); if (callback) callback();
                } else { player.volume = Math.max(0, Math.min(1, vol)); }
            }, 25);
        }
    }
}

// ==========================================
// PROGRESSO E MEDIA SESSION (COM LÓGICA DE DVR)
// ==========================================
const rewindBtns = document.querySelectorAll('.bi-arrow-counterclockwise');
const forwardBtns = document.querySelectorAll('.bi-arrow-clockwise');
const playerLiveBadge = document.getElementById('playerLiveBadge');
const playerProgressBar = document.getElementById('playerProgressBar');
const dvrTimeDisplay = document.getElementById('dvrTimeDisplay');

function skipTime(amount) {
    if (audioPlayer.buffered.length === 0) return;
    const bufferStart = audioPlayer.buffered.start(0);
    const bufferEnd = audioPlayer.buffered.end(audioPlayer.buffered.length - 1);
    if (!isFinite(bufferEnd)) return; 
    
    let current = audioPlayer.currentTime;
    let newTime = current + amount;
    
    newTime = Math.max(bufferStart + 1, Math.min(newTime, bufferEnd - 1));
    window.safeSeek(newTime);
}

rewindBtns.forEach(btn => btn.addEventListener('click', () => skipTime(-10)));
forwardBtns.forEach(btn => btn.addEventListener('click', () => skipTime(10)));

if(audioPlayer) {
    audioPlayer.addEventListener('timeupdate', () => {
        if (audioPlayer.buffered.length === 0) return;
        const bufferStart = audioPlayer.buffered.start(0);
        const bufferEnd = audioPlayer.buffered.end(audioPlayer.buffered.length - 1);
        
        const current = audioPlayer.currentTime;
        
        if ('mediaSession' in navigator && bufferEnd > 0 && isFinite(bufferEnd)) {
            try { navigator.mediaSession.setPositionState({ duration: bufferEnd, playbackRate: audioPlayer.playbackRate || 1, position: Math.max(0, Math.min(current, bufferEnd)) }); } catch(e) {} 
        }
        
        if (playerProgressBar && bufferEnd > 0 && isFinite(bufferEnd)) {
            const dvrWindow = bufferEnd - bufferStart;
            let percentage = 0;
            if (dvrWindow > 0) percentage = ((current - bufferStart) / dvrWindow) * 100;
            else percentage = 100;

            playerProgressBar.style.background = `linear-gradient(to right, #ffffff ${percentage}%, rgba(255,255,255,0.3) ${percentage}%)`;
            
            if (bufferEnd - current > 4) {
                if(playerLiveBadge) {
                    playerLiveBadge.classList.add('timeshifted');
                    playerLiveBadge.innerHTML = `<div class="dot-white"></div> ATRASADO`;
                }
                if (dvrTimeDisplay) {
                    const diff = bufferEnd - current;
                    const m = Math.floor(diff / 60).toString().padStart(2, '0');
                    const s = Math.floor(diff % 60).toString().padStart(2, '0');
                    dvrTimeDisplay.textContent = `-${m}:${s}`;
                }
            } else {
                if(playerLiveBadge) {
                    playerLiveBadge.classList.remove('timeshifted');
                    playerLiveBadge.innerHTML = `<div class="dot-white"></div> AO VIVO`;
                }
                if (dvrTimeDisplay) dvrTimeDisplay.textContent = `00:00`;
            }
        }
    });
}

if(playerProgressBar) {
    playerProgressBar.addEventListener('click', (e) => {
        if (audioPlayer.buffered.length === 0) return;
        const rect = playerProgressBar.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        
        const bufferStart = audioPlayer.buffered.start(0);
        const bufferEnd = audioPlayer.buffered.end(audioPlayer.buffered.length - 1);
        const dvrWindow = bufferEnd - bufferStart;
        
        if (isFinite(bufferEnd)) {
            const targetTime = bufferStart + (pos * dvrWindow);
            window.safeSeek(targetTime);
        }
    });
}

if(playerLiveBadge) {
    playerLiveBadge.addEventListener('click', () => {
        if (audioPlayer.buffered.length === 0) return;
        
        const bufferEnd = audioPlayer.buffered.end(audioPlayer.buffered.length - 1);
        if (isFinite(bufferEnd)) {
            window.safeSeek(bufferEnd - 1);
            if (!isPlaying) toggleLivePlay(); 
        }
    });
}

if(appContainer) {
    appContainer.addEventListener('scroll', () => {
        const stickyBar = document.getElementById('stickyBottomBar');
        if(!stickyBar) return;
        
        if (appContainer.classList.contains('player-mode') && appContainer.scrollTop > 200) { 
            stickyBar.classList.add('show'); 
            if (mainPlayerControls) mainPlayerControls.classList.add('hidden'); 
        } else { 
            stickyBar.classList.remove('show'); 
            if (mainPlayerControls) mainPlayerControls.classList.remove('hidden'); 
        }
    });
}

// ==========================================
// SISTEMA DE QUALIDADE
// ==========================================
window.openQualityModal = function() { renderQualityMenu(); document.getElementById('qualityModal').classList.add('show'); resetMenuAutoClose(); }

const closeQualityBtn = document.getElementById('closeQualityBtn');
if(closeQualityBtn) closeQualityBtn.addEventListener('click', () => { document.getElementById('qualityModal').classList.remove('show'); });

const stickyQualityBtn = document.getElementById('stickyQualityBtn');
const stickyQualityPopup = document.getElementById('stickyQualityPopup');

if(stickyQualityBtn) {
    stickyQualityBtn.addEventListener('click', (e) => { e.stopPropagation(); renderQualityMenu(); stickyQualityPopup.classList.toggle('show'); resetMenuAutoClose(); });
}

function evaluateAutoQuality() {
    if (currentQualityMode !== 'auto') return;
    const station = stations[currentStationIndex];
    
    const validQualitiesCount = ['high', 'mid', 'low'].filter(k => station.streams[k] && station.streams[k].url && station.streams[k].url.trim() !== "").length;
    if (validQualitiesCount <= 1) {
        if (validQualitiesCount === 1) {
            const onlyQuality = ['high', 'mid', 'low'].find(k => station.streams[k] && station.streams[k].url && station.streams[k].url.trim() !== "");
            if (activeQualityLevel !== onlyQuality) applyQualityStream(onlyQuality); else updateQualityBadges();
        }
        return; 
    }

    let targetQuality = 'mid'; 

    if (navigator.connection) {
        const conn = navigator.connection;
        const type = conn.effectiveType || ''; 
        const downlink = conn.downlink || 10; 
        const rtt = conn.rtt || 0; 
        const saveData = conn.saveData || false; 

        if (saveData) {
            targetQuality = 'low';
        } else if (type === 'slow-2g' || type === '2g' || downlink < 0.5 || rtt > 500) {
            targetQuality = 'low';
        } else if (type === '3g' || (downlink >= 0.5 && downlink < 2.5) || rtt > 200) {
            targetQuality = 'mid';
        } else if (type === '4g' || downlink >= 2.5) {
            targetQuality = 'high';
        } else {
            targetQuality = 'high'; 
        }
    } else { 
        targetQuality = 'high'; 
    }

    if (!station.streams[targetQuality] || !station.streams[targetQuality].url) {
        if (targetQuality === 'high') targetQuality = station.streams.mid?.url ? 'mid' : 'low';
        else if (targetQuality === 'low') targetQuality = station.streams.mid?.url ? 'mid' : 'high';
        else targetQuality = Object.keys(station.streams).find(k => station.streams[k] && station.streams[k].url);
    }

    if (activeQualityLevel !== targetQuality) applyQualityStream(targetQuality); else updateQualityBadges();
}

window.selectQualityMode = function(mode) {
    currentQualityMode = mode;
    if (mode === 'auto') { localStorage.removeItem('radioQualityMode'); evaluateAutoQuality(); } 
    else { localStorage.setItem('radioQualityMode', mode); applyQualityStream(mode); }
    renderQualityMenu();
    const qModal = document.getElementById('qualityModal');
    if(qModal) qModal.classList.remove('show');
    if(stickyQualityPopup) stickyQualityPopup.classList.remove('show');
}

function applyQualityStream(quality) {
    if (isSwitchingQuality) return; 
    const station = stations[currentStationIndex];
    if (!station.streams[quality] || !station.streams[quality].url) quality = Object.keys(station.streams).find(k => station.streams[k] && station.streams[k].url);
    
    const oldQuality = activeQualityLevel; activeQualityLevel = quality; updateQualityBadges();
    if (oldQuality === quality && (audioPlayer.src !== "" || hls !== null)) return;

    if (isPlaying) {
        isSwitchingQuality = true; setLoadingState(true); setBufferingState(true); clearTimeout(offlineTimeout); setOfflineState(false);
        fadeAudio(audioPlayer, 'out', () => { 
            setupAudioSource(audioPlayer, getCurrentStreamUrl());
            fadeAudio(audioPlayer, 'in', () => { 
                isSwitchingQuality = false; setBufferingState(false);
            }); 
        });
    } else { if(audioPlayer) setupAudioSource(audioPlayer, getCurrentStreamUrl()); }
}

function updateQualityBadges() {
    const station = stations[currentStationIndex]; const currentStream = station.streams[activeQualityLevel]; const hasValidStream = currentStream && currentStream.url && currentStream.url.trim() !== "";
    [document.getElementById('mainSpeedBadge'), document.getElementById('stickySpeedBadge')].forEach(b => {
        if (b) { b.className = 'speed-badge'; 
            if (hasValidStream) { b.classList.add(`dot-${dotCssMap[activeQualityLevel] || 'normal'}`); b.style.display = 'block'; } 
            else { b.style.display = 'none'; }
        }
    });
    renderQualityMenu();
}

function renderQualityMenu() {
    const station = stations[currentStationIndex]; const mainGrid = document.getElementById('qualityGrid');
    const qualities = [
        { id: 'high', name: 'Excelente', desc: station.streams.high ? station.streams.high.format : 'Melhor áudio' },
        { id: 'mid', name: 'Normal', desc: station.streams.mid ? station.streams.mid.format : 'Equilíbrio' },
        { id: 'low', name: 'Econômica', desc: station.streams.low ? station.streams.low.format : 'Para lentidão' }
    ];
    const validQualities = qualities.filter(q => station.streams[q.id] && station.streams[q.id].url && station.streams[q.id].url.trim() !== "");
    const hasMultipleStreams = validQualities.length > 1;

    const mainQualityBtn = document.getElementById('mainQualityBtn');
    const stickyQualityBtnWrapper = document.getElementById('stickyQualityBtn');
    
    if (!hasMultipleStreams) {
        if(mainQualityBtn) { mainQualityBtn.style.opacity = '0.4'; mainQualityBtn.style.pointerEvents = 'none'; mainQualityBtn.style.cursor = 'not-allowed'; }
        if(stickyQualityBtnWrapper) { stickyQualityBtnWrapper.style.opacity = '0.4'; stickyQualityBtnWrapper.style.pointerEvents = 'none'; stickyQualityBtnWrapper.style.cursor = 'not-allowed'; }
    } else {
        if(mainQualityBtn) { mainQualityBtn.style.opacity = '1'; mainQualityBtn.style.pointerEvents = 'auto'; mainQualityBtn.style.cursor = 'pointer'; }
        if(stickyQualityBtnWrapper) { stickyQualityBtnWrapper.style.opacity = '1'; stickyQualityBtnWrapper.style.pointerEvents = 'auto'; stickyQualityBtnWrapper.style.cursor = 'pointer'; }
    }

    let mainHtml = ''; let stickyHtml = '';
    if (hasMultipleStreams) {
        mainHtml += `<div class="quality-option ${currentQualityMode === 'auto' ? 'selected' : ''}" onclick="window.selectQualityMode('auto')"><i class="bi bi-gear"></i><div class="quality-info"><div class="quality-title">Automático</div><div class="quality-desc">Ajuste dinâmico</div></div>${currentQualityMode === 'auto' ? `<div class="quality-indicator-dot dot-auto"></div>` : ''}</div>`;
        stickyHtml += `<button class="sticky-q-btn ${currentQualityMode === 'auto' ? 'selected' : ''}" onclick="window.selectQualityMode('auto')"><div class="q-icon-text"><i class="bi bi-gear"></i> Auto</div>${currentQualityMode === 'auto' ? `<div class="dot dot-auto"></div>` : ''}</button>`;
    } else if (currentQualityMode === 'auto') { currentQualityMode = validQualities.length > 0 ? validQualities[0].id : 'mid'; }

    validQualities.forEach(q => {
        const isActiveStream = (activeQualityLevel === q.id); const isManualSelected = (currentQualityMode === q.id) || (currentQualityMode === 'auto' && !hasMultipleStreams);
        mainHtml += `<div class="quality-option ${isManualSelected ? 'selected' : ''}" onclick="window.selectQualityMode('${q.id}')"><i class="bi bi-earbuds"></i><div class="quality-info"><div class="quality-title">${q.name}</div><div class="quality-desc">${q.desc}</div></div>${isActiveStream ? `<div class="quality-indicator-dot dot-${dotCssMap[q.id]}"></div>` : ''}</div>`;
        stickyHtml += `<button class="sticky-q-btn ${isManualSelected ? 'selected' : ''}" onclick="window.selectQualityMode('${q.id}')"><div class="q-icon-text"><i class="bi bi-earbuds"></i> ${q.name}</div>${isActiveStream ? `<div class="dot dot-${dotCssMap[q.id]}"></div>` : ''}</button>`;
    });
    if(mainGrid) mainGrid.innerHTML = mainHtml; 
    if(stickyQualityPopup) stickyQualityPopup.innerHTML = stickyHtml;
}

// ==========================================
// VOLUME E PLAYBACK (DVR LOGIC ENABLED)
// ==========================================
const volumeToggleBtn = document.getElementById('volumeToggleBtn');
const stickyVolumeBtn = document.getElementById('stickyVolumeBtn');

if(audioPlayer) audioPlayer.volume = 1; if(previewAudio) previewAudio.volume = 1;

function toggleMute(e) {
    e.stopPropagation(); globalVolume = (globalVolume > 0) ? 0 : 1;
    if(audioPlayer) audioPlayer.volume = globalVolume; 
    if(previewAudio) previewAudio.volume = globalVolume;
    [volumeToggleBtn, stickyVolumeBtn].forEach(btn => { if(!btn) return; btn.classList.remove('bi-volume-up', 'bi-volume-mute'); btn.classList.add(globalVolume > 0 ? 'bi-volume-up' : 'bi-volume-mute'); });
}
if (volumeToggleBtn) volumeToggleBtn.addEventListener('click', toggleMute);
if (stickyVolumeBtn) stickyVolumeBtn.addEventListener('click', toggleMute);

function toggleLivePlay() {
    if (activePreviewId) { stopPreview(false); } 
    wasPlayingBeforePreview = false; 

    const station = stations[currentStationIndex];
    if (!station.streams[activeQualityLevel] || !station.streams[activeQualityLevel].url) { activeQualityLevel = Object.keys(station.streams).find(k => station.streams[k] && station.streams[k].url); updateQualityBadges(); }

    if (!isPlaying) {
        isPlaying = true;
        setLoadingState(true); clearTimeout(offlineTimeout); setOfflineState(false);
        
        const hasSource = hls !== null || !!audioPlayer.getAttribute('src');
        if(audioPlayer && !hasSource) setupAudioSource(audioPlayer, getCurrentStreamUrl()); 
        
        const homeView = document.getElementById('homeView'); const playerView = document.getElementById('playerView');
        if(homeView) homeView.style.display = 'none'; if(playerView) playerView.style.display = 'flex'; if(appContainer) appContainer.classList.add('player-mode');
        setTimeout(() => { if (currentTrackMetadata && currentTrackMetadata.title) updateUIText(currentTrackMetadata); }, 50);

        initVisualizer(); fadeAudio(audioPlayer, 'in');

        if(playerPlayIcon) playerPlayIcon.classList.replace('bi-play-fill', 'bi-pause-fill'); 
        if(stickyPlayIcon) stickyPlayIcon.classList.replace('bi-play-fill', 'bi-pause-fill');
        
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "playing";
        updateMediaSession();
        
    } else {
        isPlaying = false;
        
        if(playerPlayIcon) playerPlayIcon.classList.replace('bi-pause-fill', 'bi-play-fill'); 
        if(stickyPlayIcon) stickyPlayIcon.classList.replace('bi-pause-fill', 'bi-play-fill');
        
        if ('mediaSession' in navigator) navigator.mediaSession.playbackState = "paused";
        
        fadeAudio(audioPlayer, 'out'); 
    }
}

// ==========================================
// MUDANÇA DE ESTAÇÃO
// ==========================================
window.changeStation = function(index) {
    if (activePreviewId) stopPreview(false);
    currentStationIndex = index; localStorage.setItem('lastStationIndex', index);
    isSwitchingQuality = false; firstHistoryRender = true; currentTrackId = ""; previousListenersCount = -1; 
    const station = stations[index];

    // ATUALIZAÇÃO DO BOTÃO DE GRAVAÇÃO COM BASE NO PARÂMETRO RECORD DA ESTAÇÃO
    const recordBtn = document.getElementById('recordBtn');
    if (recordBtn) {
        const canRecord = station.record !== "false" && station.record !== false;
        recordBtn.style.opacity = canRecord ? '1' : '0.4';
    }

    const contactBtn = document.getElementById('contactBtn');
    if (contactBtn) { if (station.contact) { contactBtn.href = station.contact; contactBtn.style.display = 'flex'; } else { contactBtn.style.display = 'none'; } }
    
    const stModal = document.getElementById('stationsModal');
    if(stModal) { stModal.classList.remove('show'); clearTimeout(stationsAutoCloseTimeout); }

    const headerLogo = document.getElementById('headerLogo'); if (headerLogo) headerLogo.src = station.logotipo || "https://wapka-img.zuna.id/beff413d.png";
    
    let fallbackArt = station.defaultArt; let fallbackBgArt = station.bgdefaultArt || fallbackArt;
    const homeArt = document.getElementById('homeCoverArt'); const playerArt = document.getElementById('playerCoverArt'); const appBg = document.getElementById('appBackground');
    
    if(homeArt) homeArt.style.backgroundImage = `url('${fallbackArt}')`; 
    if(playerArt) playerArt.style.backgroundImage = `url('${fallbackArt}')`; 
    if(appBg) appBg.style.backgroundImage = `url('${fallbackBgArt}')`;
    
    updateThemeColor(fallbackArt); 

    if (currentQualityMode === 'auto') { evaluateAutoQuality(); } 
    else {
        if(!station.streams[currentQualityMode] || !station.streams[currentQualityMode].url) activeQualityLevel = Object.keys(station.streams).find(k => station.streams[k] && station.streams[k].url);
        else activeQualityLevel = currentQualityMode;
        updateQualityBadges();
    }

    fetchMetadata(true); 
    
    if (isPlaying) {
        setLoadingState(true); clearTimeout(offlineTimeout); setOfflineState(false);
        fadeAudio(audioPlayer, 'out', () => { 
            setupAudioSource(audioPlayer, getCurrentStreamUrl());
            fadeAudio(audioPlayer, 'in'); 
        });
    } else { 
        if(audioPlayer) setupAudioSource(audioPlayer, getCurrentStreamUrl());
    }
}

const openStationsBtn = document.getElementById('openStationsBtn');
const closeStationsBtn = document.getElementById('closeStationsBtn');

if(openStationsBtn) openStationsBtn.addEventListener('click', () => { 
    renderStationsModal(); 
    const stModal = document.getElementById('stationsModal');
    if(stModal) stModal.classList.add('show'); 
    resetStationsAutoClose();
});

if(closeStationsBtn) closeStationsBtn.addEventListener('click', () => { 
    const stModal = document.getElementById('stationsModal');
    if(stModal) stModal.classList.remove('show'); 
    clearTimeout(stationsAutoCloseTimeout);
});

function prevStation() { window.changeStation(currentStationIndex === 0 ? stations.length - 1 : currentStationIndex - 1); }
function nextStation() { window.changeStation(currentStationIndex === stations.length - 1 ? 0 : currentStationIndex + 1); }

if(homePlayBtn) {
    homePlayBtn.addEventListener('click', (e) => {
        if(!prerollPlayed) {
            playPrerollAd();
        } else {
            toggleLivePlay();
        }
    });
}
if(playerPlayBtn) playerPlayBtn.addEventListener('click', toggleLivePlay);
if(stickyPlayBtn) stickyPlayBtn.addEventListener('click', toggleLivePlay);

const btnPrevStation = document.getElementById('prevStationBtn'); const btnNextStation = document.getElementById('nextStationBtn');
const btnStickyPrev = document.getElementById('stickyPrevBtn'); const btnStickyNext = document.getElementById('stickyNextBtn');

if(btnPrevStation) btnPrevStation.addEventListener('click', prevStation); if(btnNextStation) btnNextStation.addEventListener('click', nextStation);
if(btnStickyPrev) btnStickyPrev.addEventListener('click', prevStation); if(btnStickyNext) btnStickyNext.addEventListener('click', nextStation);

function setupMediaSession() {
    if ('mediaSession' in navigator) {
        navigator.mediaSession.setActionHandler('play', toggleLivePlay); navigator.mediaSession.setActionHandler('pause', toggleLivePlay);
        navigator.mediaSession.setActionHandler('previoustrack', prevStation); navigator.mediaSession.setActionHandler('nexttrack', nextStation);
        navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (audioPlayer.buffered.length === 0) return;
            const bufferEnd = audioPlayer.buffered.end(audioPlayer.buffered.length - 1);
            if(isFinite(bufferEnd)) {
                let positionTarget = Math.max(0, Math.min(details.seekTime, bufferEnd - 1));
                window.safeSeek(positionTarget);
            }
        });
    }
}

function updateMediaSession() {
    if ('mediaSession' in navigator && currentTrackMetadata.title) {
        const station = stations[currentStationIndex];
        navigator.mediaSession.metadata = new MediaMetadata({ title: `${currentTrackMetadata.artist} - ${currentTrackMetadata.title}`, artist: station.name, album: station.name, artwork: [{ src: currentTrackMetadata.art, sizes: '512x512', type: 'image/png' }] });
    }
}

// ==========================================
// UI TEXT, METADATA E BACKGROUND DYNAMICS
// ==========================================
function autoAdjustFont(text, defaultSize, maxLength, step, minSize) {
    if (!text) return defaultSize + 'px';
    if (text.length > maxLength) { const overflowLength = text.length - maxLength; return Math.max(minSize, defaultSize - (overflowLength * step)) + 'px'; }
    return defaultSize + 'px';
}

function applyMarquee(element) {
    element.classList.remove('scrolling-text'); element.style.transform = 'translateX(0)';
    if (element.offsetWidth === 0) return;
    setTimeout(() => {
        const parent = element.parentElement; const overflow = element.scrollWidth - parent.clientWidth;
        if (overflow > 5) { element.style.setProperty('--overflow-amount', `-${overflow}px`); element.classList.add('scrolling-text'); }
    }, 50);
}

function updateUIText(metadata) {
    currentTrackMetadata = metadata; 
    const station = stations[currentStationIndex];

    if (isOfflineStatus || isBufferingStatus) {
        if(shareOverlay) shareOverlay.style.display = 'none';
        return; 
    }

    const els = [ { t: document.getElementById('homeSongTitle'), a: document.getElementById('homeSongArtist') }, { t: document.getElementById('playerSongTitle'), a: document.getElementById('playerSongArtist') } ];
    const isDesktop = window.innerWidth >= 768;

    els.forEach(el => {
        if(el.t) {
            if (isDesktop) { el.t.style.fontSize = '28px'; el.t.textContent = metadata.title; applyMarquee(el.t); } 
            else { el.t.classList.remove('scrolling-text'); el.t.style.transform = 'none'; el.t.style.fontSize = autoAdjustFont(metadata.title, 28, 25, 0.4, 16); el.t.textContent = metadata.title; }
        }
        if(el.a) {
            if (isDesktop) { el.a.style.fontSize = '18px'; el.a.innerHTML = `<span>${metadata.artist}</span>`; applyMarquee(el.a); } 
            else { el.a.classList.remove('scrolling-text'); el.a.style.transform = 'none'; el.a.style.fontSize = autoAdjustFont(metadata.artist, 18, 30, 0.3, 12); el.a.innerHTML = `<span>${metadata.artist}</span>`; }
        }
    });

    if (shareOverlay) {
        const isInvalid = !isValidTrack(metadata.title, metadata.artist) || !isTrackAllowed(metadata.title, metadata.artist);
        const isDefault = (
            metadata.title === 'Conectando...' || 
            metadata.artist === 'Aguarde' || 
            metadata.title === station.name || 
            metadata.artist === 'Transmissão Local' || 
            metadata.title === 'Transmissão offline...'
        );
        
        if (isInvalid || isDefault) {
            shareOverlay.style.display = 'none';
        } else {
            shareOverlay.style.display = 'flex';
        }
    }
    
    // Atualiza o texto na lista de estações também caso o modal esteja aberto
    const activeTrackEl = document.getElementById(`station-track-${currentStationIndex}`);
    if (activeTrackEl) {
        const isDefault = (metadata.title === 'Conectando...' || metadata.artist === 'Aguarde' || metadata.title === station.name || metadata.artist === 'Transmissão Local' || metadata.title === 'Transmissão offline...');
        const newTitle = isDefault ? (station.description || "Transmissão Local") : `${metadata.artist} - ${metadata.title}`;
        activeTrackEl.textContent = newTitle;
        activeTrackEl.title = newTitle;
    }
}

function renderEmptyHistory() {
    if (historyGrid) historyGrid.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 30px 10px; color: rgba(255,255,255,0.6); font-size: 14px; background: rgba(255,255,255,0.05); border-radius: 12px;"><i class="bi bi-exclamation-triangle" style="font-size: 24px; display: block; margin-bottom: 8px;"></i>Histórico não encontrado.</div>`;
}

function applyOfflineMetadata(station, forceRefresh) {
    if (station.id !== stations[currentStationIndex].id) return;
    let fallbackMetadata = { title: station.name, artist: station.description || "Transmissão Local", art: station.defaultArt, bgArt: station.bgdefaultArt || station.defaultArt };
    
    const pseudoId = `offline-${station.id}`;
    if (currentTrackId !== pseudoId || forceRefresh) {
        currentTrackId = pseudoId; updateUIText(fallbackMetadata); updateUIArt(fallbackMetadata.art, fallbackMetadata.bgArt); currentTrackMetadata = fallbackMetadata; updateMediaSession();
        
        checkAndFetchLyrics(fallbackMetadata.title, fallbackMetadata.artist);
        
        if (!activePreviewId) {
            const localHist = cleanAndGetLocalHistory(station.id);
            if (localHist.length > 0) renderHistory(localHist, station.defaultArt); else renderEmptyHistory(); 
        }
    }
}

async function fetchMetadata(forceRefresh = false) {
    const station = stations[currentStationIndex];
    const activeStationIdAtFetch = station.id; 
    
    if (!station.api || station.api.trim() === "") { applyOfflineMetadata(station, forceRefresh); return; }

    const { songObj, historyObj, listeners } = await fetchStationData(station);

    if (activeStationIdAtFetch !== stations[currentStationIndex].id) return; 

    if (typeof listeners === 'number' && !isNaN(listeners)) {
        if (previousListenersCount !== -1) {
            if (listeners > previousListenersCount) window.showListenerToast('connect', listeners);
            else if (listeners < previousListenersCount) window.showListenerToast('disconnect', listeners);
        }
        previousListenersCount = listeners;
    }

    if (songObj) {
        const trackIdentifier = `${songObj.title} - ${songObj.artist}`;

        if (currentTrackId !== trackIdentifier || forceRefresh) {
            currentTrackId = trackIdentifier;

            if (isValidTrack(songObj.title, songObj.artist) && isTrackAllowed(songObj.title, songObj.artist)) {
                
                let metadata = { title: songObj.title, artist: songObj.artist, art: station.defaultArt, bgArt: station.bgdefaultArt || station.defaultArt };
                updateUIText(metadata);
                checkAndFetchLyrics(metadata.title, metadata.artist);

                const localHistory = addTrackToLocalHistory(station.id, songObj);
                
                fetchItunesData(metadata.title, metadata.artist).then(itunes => {
                    if (activeStationIdAtFetch !== stations[currentStationIndex].id) return;
                    if (itunes && itunes.art) { metadata.art = itunes.art; metadata.bgArt = itunes.art; } 
                    else if (songObj.art && songObj.art.trim() !== "") { metadata.art = songObj.art; metadata.bgArt = songObj.art; }
                    updateUIArt(metadata.art, metadata.bgArt); currentTrackMetadata = metadata; updateMediaSession();
                }).catch(() => {
                    if (songObj.art && songObj.art.trim() !== "") { metadata.art = songObj.art; metadata.bgArt = songObj.art; }
                    updateUIArt(metadata.art, metadata.bgArt); currentTrackMetadata = metadata; updateMediaSession();
                });

                if (!activePreviewId) {
                    if (historyObj && historyObj.length > 0) renderHistory(historyObj, station.defaultArt); else renderHistory(localHistory, station.defaultArt);
                }
            } else {
                const isDefault = (
                    currentTrackMetadata.title === 'Conectando...' || 
                    currentTrackMetadata.artist === 'Aguarde' || 
                    currentTrackMetadata.title === station.name || 
                    currentTrackMetadata.artist === 'Transmissão Local' || 
                    currentTrackMetadata.title === 'Transmissão offline...'
                );
                
                if (isDefault) {
                    applyOfflineMetadata(station, forceRefresh);
                    if (!activePreviewId) {
                        const localHist = cleanAndGetLocalHistory(station.id);
                        if (historyObj && historyObj.length > 0) renderHistory(historyObj, station.defaultArt); else renderHistory(localHist, station.defaultArt);
                    }
                }
            }
        }
    } else {
        const isDefault = (
            currentTrackMetadata.title === 'Conectando...' || 
            currentTrackMetadata.artist === 'Aguarde' || 
            currentTrackMetadata.title === station.name || 
            currentTrackMetadata.artist === 'Transmissão Local' || 
            currentTrackMetadata.title === 'Transmissão offline...'
        );
        
        if (isDefault) {
            applyOfflineMetadata(station, forceRefresh);
            if (!activePreviewId) {
                const localHist = cleanAndGetLocalHistory(station.id);
                if (historyObj && historyObj.length > 0) renderHistory(historyObj, station.defaultArt); else renderHistory(localHist, station.defaultArt);
            }
        }
    }
}

function updateUIArt(newArtUrl, bgArtUrl) {
    const homeCoverArt = document.getElementById('homeCoverArt'); const playerCoverArt = document.getElementById('playerCoverArt'); const appBackground = document.getElementById('appBackground');
    if (homeCoverArt && homeCoverArt.style.backgroundImage.includes(newArtUrl)) return;
    
    if(homeCoverArt) homeCoverArt.style.opacity = '0'; if(playerCoverArt) playerCoverArt.classList.add('animating'); if(appBackground) appBackground.style.opacity = '0.1'; 
    
    setTimeout(() => {
        if(homeCoverArt) { homeCoverArt.style.backgroundImage = `url('${newArtUrl}')`; homeCoverArt.style.opacity = '1'; }
        if(playerCoverArt) { playerCoverArt.style.backgroundImage = `url('${newArtUrl}')`; playerCoverArt.classList.remove('animating'); }
        if(appBackground) { appBackground.style.backgroundImage = `url('${bgArtUrl || newArtUrl}')`; appBackground.style.opacity = '1'; }
        
        updateThemeColor(newArtUrl);
    }, 500); 
    
    // Atualiza a capa da estação ATIVA no modal se estiver aberto e ajusta a classe de animação crossfade
    const activeStationArtEl = document.getElementById(`station-art-${currentStationIndex}`);
    if (activeStationArtEl) {
        const st = stations[currentStationIndex];
        activeStationArtEl.style.backgroundImage = `url('${newArtUrl}')`;
        if (newArtUrl && newArtUrl !== st.defaultArt) {
            activeStationArtEl.classList.add('alternating-art');
        } else {
            activeStationArtEl.classList.remove('alternating-art');
        }
    }
}

async function renderStationsModal() {
    const grid = document.getElementById('stationsGrid'); if(!grid) return;
    
    grid.innerHTML = stations.map((st, index) => {
        let trackInfo = st.description || "Transmissão Local"; 
        let trackArt = st.defaultArt;
        let altClass = "";

        if (index === currentStationIndex && currentTrackMetadata.title && currentTrackMetadata.artist !== 'Aguarde') {
            const isDefault = (currentTrackMetadata.title === 'Conectando...' || currentTrackMetadata.title === st.name || currentTrackMetadata.artist === 'Transmissão Local' || currentTrackMetadata.title === 'Transmissão offline...');
            
            if (!isDefault) {
                trackInfo = `${currentTrackMetadata.artist} - ${currentTrackMetadata.title}`;
                trackArt = currentTrackMetadata.art || st.defaultArt;
                if (trackArt !== st.defaultArt) {
                    altClass = "alternating-art";
                }
            }
        }
        return `
        <div class="station-card ${index === currentStationIndex ? 'active' : ''}" onclick="window.changeStation(${index})">
            <div class="station-cover-container">
                <div class="station-default-art" style="background-image: url('${st.defaultArt}')"></div>
                <div class="station-track-art ${altClass}" id="station-art-${index}" style="background-image: url('${trackArt}')"></div>
                <div class="station-play-overlay"><div class="station-play-btn"><i class="bi bi-play-fill"></i></div></div>
                <div class="station-active-overlay"><div class="eq-container"><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span><span class="eq-bar"></span></div><span style="color:#4ade80; font-size:10px; font-weight:700; letter-spacing:1px;">TOCANDO</span></div>
            </div>
            <div class="station-info"><div class="station-name">${st.name}</div><div class="station-track" id="station-track-${index}" title="${trackInfo}">${trackInfo}</div></div>
        </div>`;
    }).join('');

    stations.forEach(async (st, index) => {
        if (st.id === stations[currentStationIndex].id) return; 
        try {
            if (st.api && st.api.trim() !== "") {
                const { songObj } = await fetchStationData(st);
                if (songObj && isValidTrack(songObj.title, songObj.artist) && isTrackAllowed(songObj.title, songObj.artist)) {
                    let updatedInfo = `${songObj.artist} - ${songObj.title}`; let updatedArt = songObj.art || st.defaultArt;
                    const itunes = await fetchItunesData(songObj.title, songObj.artist); if (itunes && itunes.art) updatedArt = itunes.art;
                    const trackEl = document.getElementById(`station-track-${index}`); const artEl = document.getElementById(`station-art-${index}`);
                    if (trackEl) { trackEl.textContent = updatedInfo; trackEl.title = updatedInfo; }
                    if (artEl) { artEl.style.backgroundImage = `url('${updatedArt}')`; }
                }
            }
        } catch(e) {}
    });
}

async function renderHistory(historyArray, fallbackArt) {
    if(!historyGrid) return;
    if (!historyArray || historyArray.length === 0) { renderEmptyHistory(); firstHistoryRender = false; return; }

    const validHistory = []; 
    const seenTitles = new Set(); 
    const st = stations[currentStationIndex]; 
    const activeStationIdAtRender = st.id;
    const historyLimit = Math.max(10, Math.min(30, st.limitHistory || 10));

    for (const item of historyArray) {
        const song = item.song || item; 
        if (!song.title || !song.artist || !isValidTrack(song.title, song.artist) || !isTrackAllowed(song.title, song.artist)) continue;
        
        const titleNormalized = song.title.toLowerCase().trim();
        
        if (!seenTitles.has(titleNormalized)) { 
            validHistory.push(item); 
            seenTitles.add(titleNormalized); 
        }
        if (validHistory.length >= historyLimit) break;
    }
    
    if (validHistory.length === 0) { renderEmptyHistory(); firstHistoryRender = false; return; }

    const historyData = await Promise.all(validHistory.map(async (item, index) => {
        const song = item.song || item; let art = fallbackArt; let preview = null; let link = '#';
        const itunes = await fetchItunesData(song.title, song.artist);
        if (itunes && itunes.art) { art = itunes.art; preview = itunes.preview; link = itunes.link || '#'; } else if (song.art || song.cover) { art = song.art || song.cover; }
        let playedAt; if(item.played_at) playedAt = new Date(item.played_at * 1000); else if(item.timestamp) playedAt = new Date(item.timestamp * 1000); else playedAt = new Date(); 
        const timeString = playedAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        return { ...song, art, preview, link, timeString, safeId: `track_${index}` };
    }));

    if (activeStationIdAtRender !== stations[currentStationIndex].id) return;
    const animClass = firstHistoryRender ? 'animate-card' : ''; const opacityStyle = firstHistoryRender ? '' : 'opacity: 1;';

    historyGrid.innerHTML = historyData.map((data, index) => `
        <div class="history-card ${animClass}" id="card_${data.safeId}" style="${firstHistoryRender ? `animation-delay: ${index * 0.08}s;` : opacityStyle}" onclick="window.toggleHistoryActions('${data.safeId}')">
            <div class="history-cover">
                <div class="skeleton-loader"></div>
                <div class="history-cover-img" id="img_${data.safeId}"></div>
                <div class="time-ago-badge"><i class="bi bi-clock"></i> ${data.timeString}</div>
                <div class="history-overlay">
                    <button class="preview-btn ${!data.preview ? 'no-preview' : ''}" ${!data.preview ? 'disabled title="Preview indisponível"' : `onclick="event.stopPropagation(); window.togglePreview('${data.preview}', '${data.safeId}')"`}>
                        <svg width="42" height="42" viewBox="0 0 42 42"><circle cx="21" cy="21" r="18"></circle><circle cx="21" cy="21" r="18" class="progress-circle" id="circle_${data.safeId}"></circle></svg>
                        <i class="bi bi-play-fill icon" id="icon_${data.safeId}"></i>
                    </button>
                    <a href="${data.link}" target="_blank" class="itunes-btn ${data.link === '#' ? 'no-preview' : ''}" ${data.link === '#' ? 'onclick="event.stopPropagation(); return false;"' : 'onclick="event.stopPropagation();" title="Abrir no iTunes"'}><i class="bi bi-apple"></i></a>
                </div>
            </div>
            <div class="history-info"><div class="history-title" title="${data.title}">${data.title}</div><div class="history-artist" title="${data.artist}">${data.artist}</div></div>
        </div>
    `).join('');
    
    historyData.forEach(data => {
        const imgEl = document.getElementById(`img_${data.safeId}`);
        if(imgEl) {
            const img = new Image();
            img.onload = () => {
                imgEl.style.backgroundImage = `url('${data.art}')`;
                imgEl.classList.add('loaded');
            };
            img.onerror = () => {
                imgEl.style.backgroundImage = `url('${fallbackArt}')`;
                imgEl.classList.add('loaded');
            };
            img.src = data.art;
        }
    });

    firstHistoryRender = false;
}

let activePreviewId = null;

window.togglePreview = function(url, safeId) {
    if (activePreviewId === safeId && previewAudio && !previewAudio.paused) { stopPreview(true); return; }
    
    if (isPlaying) { 
        wasPlayingBeforePreview = true; 
        if(audioPlayer) audioPlayer.pause(); 
        if(playerPlayIcon) playerPlayIcon.classList.replace('bi-pause-fill', 'bi-play-fill'); 
        if(stickyPlayIcon) stickyPlayIcon.classList.replace('bi-pause-fill', 'bi-play-fill'); 
    } else { 
        wasPlayingBeforePreview = false; 
    }

    if (activePreviewId) {
        const prevCard = document.getElementById(`card_${activePreviewId}`); const prevIcon = document.getElementById(`icon_${activePreviewId}`); const prevCircle = document.getElementById(`circle_${activePreviewId}`);
        if (prevCard) prevCard.classList.remove('active'); if (prevIcon) prevIcon.classList.replace('bi-pause-fill', 'bi-play-fill'); if (prevCircle) prevCircle.style.strokeDashoffset = 113; 
        clearInterval(fadeInterval); if(previewAudio) { previewAudio.pause(); previewAudio.removeAttribute('src'); previewAudio.load(); }
    }

    activePreviewId = safeId;
    const newCard = document.getElementById(`card_${safeId}`); const newIcon = document.getElementById(`icon_${safeId}`);
    if(newCard) newCard.classList.add('active'); if(newIcon) newIcon.classList.replace('bi-play-fill', 'bi-pause-fill');
    if(previewAudio) { previewAudio.src = url; fadeAudio(previewAudio, 'in'); }
}

function stopPreview(resumeLive = true) {
    if (activePreviewId) {
        const prevCard = document.getElementById(`card_${activePreviewId}`); const prevIcon = document.getElementById(`icon_${activePreviewId}`); const prevCircle = document.getElementById(`circle_${activePreviewId}`);
        if (prevCard) prevCard.classList.remove('active'); if (prevIcon) prevIcon.classList.replace('bi-pause-fill', 'bi-play-fill'); if (prevCircle) prevCircle.style.strokeDashoffset = 113; 
    }
    activePreviewId = null;
    fadeAudio(previewAudio, 'out', () => {
        if (previewAudio) { previewAudio.removeAttribute('src'); previewAudio.load(); }
        if (resumeLive && wasPlayingBeforePreview) {
            wasPlayingBeforePreview = false;
            if(audioPlayer) {
                audioPlayer.play().then(() => { 
                    if(playerPlayIcon) playerPlayIcon.classList.replace('bi-play-fill', 'bi-pause-fill'); 
                    if(stickyPlayIcon) stickyPlayIcon.classList.replace('bi-play-fill', 'bi-pause-fill'); 
                }).catch(e => { setOfflineState(true); handleReconnect(); });
            }
        }
    });
}

if(previewAudio) {
    previewAudio.addEventListener('timeupdate', () => {
        if (activePreviewId && previewAudio.duration) {
            const progress = previewAudio.currentTime / previewAudio.duration; const activeCircle = document.getElementById(`circle_${activePreviewId}`);
            if (activeCircle) activeCircle.style.strokeDashoffset = 113 - (113 * progress);
        }
    });
    previewAudio.addEventListener('ended', () => stopPreview(true));
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================
const targetStation = stations[currentStationIndex];
const initialHomeArt = document.getElementById('homeCoverArt'); const initialPlayerArt = document.getElementById('playerCoverArt'); const initialBackground = document.getElementById('appBackground'); const initialLogo = document.getElementById('headerLogo');

if(initialHomeArt) initialHomeArt.style.backgroundImage = `url('${targetStation.defaultArt}')`; 
if(initialPlayerArt) initialPlayerArt.style.backgroundImage = `url('${targetStation.defaultArt}')`; 
if(initialBackground) initialBackground.style.backgroundImage = `url('${targetStation.bgdefaultArt || targetStation.defaultArt}')`; 
if(initialLogo && targetStation.logotipo) initialLogo.src = targetStation.logotipo;

updateThemeColor(targetStation.defaultArt);

const initialContactBtn = document.getElementById('contactBtn');
if (initialContactBtn) { if (targetStation.contact) { initialContactBtn.href = targetStation.contact; initialContactBtn.style.display = 'flex'; } else { initialContactBtn.style.display = 'none'; } }

const initialRecordBtn = document.getElementById('recordBtn');
if (initialRecordBtn) {
    const canRecordInit = targetStation.record !== "false" && targetStation.record !== false;
    initialRecordBtn.style.opacity = canRecordInit ? '1' : '0.4';
}

if (stations.length <= 1) {
    const btnEstacoes = document.getElementById('openStationsBtn'); if (btnEstacoes) { btnEstacoes.style.opacity = '0.4'; btnEstacoes.style.pointerEvents = 'none'; btnEstacoes.style.cursor = 'not-allowed'; }
    const navArrows = ['prevStationBtn', 'nextStationBtn', 'stickyPrevBtn', 'stickyNextBtn']; navArrows.forEach(id => { const arrowEl = document.getElementById(id); if (arrowEl) { arrowEl.style.opacity = '0.4'; arrowEl.style.pointerEvents = 'none'; } });
}

setupMediaSession();
if ('connection' in navigator) navigator.connection.addEventListener('change', evaluateAutoQuality);
if (currentQualityMode === 'auto') evaluateAutoQuality(); else applyQualityStream(currentQualityMode);
updateQualityBadges(); 

fetchMetadata(); 
setInterval(fetchMetadata, updateIntervalTime); 
setInterval(evaluateAutoQuality, 10000);

   
