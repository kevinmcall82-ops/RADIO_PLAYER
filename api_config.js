// ==========================================
// api_config.js
// ==========================================
export const updateIntervalTime = 10000;
export const corsProxyUrl = "https://api.allorigins.win/raw?url="; 

const invalidKeywords = ['jingle', 'vinheta', 'comercial', 'identificação', 'promo', 'hora certa', 'patrocinio', 'patrocínio', 'locutor', '98.FM'];

export function isValidTrack(title, artist) {
    if (!title && !artist) return false;
    const str = `${title || ''} ${artist || ''}`.toLowerCase();
    return !invalidKeywords.some(kw => str.includes(kw));
}

// ==========================================
// SISTEMA DE LETRAS (LRCLIB + CACHE LOCAL)
// ==========================================
export async function fetchLyrics(title, artist) {
    if (!title || !artist || title === 'Conectando...') return null;

    // Limpeza de tags e strings indesejadas para maximizar o acerto na API
    const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/g, '').split('-')[0].trim(); 
    const cleanArtist = artist.split(/feat\.?|ft\.?|&|,|\svs\.?\s|\sx\s/i)[0].trim();
    
    if (!cleanTitle || !cleanArtist) return null;

    // Cria uma chave única formatada para o cache
    const queryKey = `lyrics_${cleanTitle}_${cleanArtist}`.toLowerCase().replace(/\s+/g, '_');

    // 1. Tenta recuperar as letras armazenadas no LocalStorage (instantâneo)
    try {
        const cached = localStorage.getItem(queryKey);
        if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed && parsed.lyrics) return parsed.lyrics;
        }
    } catch(e) { console.warn("Erro ao ler cache de letras:", e); }

    // 2. Busca na API LRCLIB se não houver cache
    try {
        const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`;
        const res = await fetch(url);
        
        if (!res.ok) throw new Error("Falha na API LRCLIB");
        
        const data = await res.json();

        if (data && data.length > 0) {
            // Pega o primeiro resultado mais relevante
            const track = data[0];
            let finalLyrics = '';

            // Prioriza texto puro (Plain). Se não tiver, usa o sincronizado (LRC) e limpa os tempos
            if (track.plainLyrics && track.plainLyrics.trim() !== '') {
                finalLyrics = track.plainLyrics;
            } else if (track.syncedLyrics && track.syncedLyrics.trim() !== '') {
                // Regex para remover [ar:Artista], [00:30.78], [00:30.789], etc.
                finalLyrics = track.syncedLyrics
                    .replace(/\[[a-zA-Z]+:[^\]]*\]/g, '') 
                    .replace(/\[\d{2}:\d{2}(?:\.\d{1,3})?\]/g, '') 
                    .trim();
            }

            if (finalLyrics) {
                // Converte quebras de linha para HTML
                finalLyrics = finalLyrics.replace(/\n/g, '<br>');
                
                try {
                    localStorage.setItem(queryKey, JSON.stringify({ lyrics: finalLyrics }));
                } catch(e) { console.warn("Cache cheio, impossível salvar letra.", e); }
                
                return finalLyrics;
            }
        }
    } catch (error) {
        console.error("Erro ao buscar letras:", error);
    }

    return null;
}

// ==========================================
// SISTEMA ANTI-TRAVAMENTO (CORS & RATE LIMITS)
// ==========================================
const fetchCache = {};
const CACHE_TTL_MS = 8000; 

async function parseJsonResponse(response) {
    const rawText = await response.text();
    try {
        return JSON.parse(rawText);
    } catch (err) {
        const jsonpMatch = rawText.match(/^[^{]*({.*}|\[.*\])[^}\]]*$/);
        if (jsonpMatch && jsonpMatch[1]) {
            return JSON.parse(jsonpMatch[1]);
        }
        throw new Error('Falha ao processar JSON/JSONP: Formato inválido');
    }
}

async function safeFetchJson(url, forceProxy = false) {
    const cacheKey = url.replace(/([?&])t=\d+/, '');

    if (fetchCache[cacheKey] && fetchCache[cacheKey].expiry > Date.now()) {
        return await fetchCache[cacheKey].promise;
    }

    const fetchPromise = (async () => {
        if (!forceProxy) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
            return await parseJsonResponse(response);
        }

        const proxies = [
            "https://api.allorigins.win/raw?url=",
            "https://corsproxy.io/?",
            "https://api.codetabs.com/v1/proxy?quest="
        ];

        let lastError;
        for (let proxy of proxies) {
            try {
                const finalUrl = `${proxy}${encodeURIComponent(url)}`;
                const response = await fetch(finalUrl);
                if (!response.ok) throw new Error(`Proxy Error: ${response.status}`);
                return await parseJsonResponse(response);
            } catch (err) {
                lastError = err;
            }
        }
        throw lastError || new Error("Todos os proxies CORS falharam.");
    })();

    fetchCache[cacheKey] = {
        promise: fetchPromise,
        expiry: Date.now() + CACHE_TTL_MS
    };

    try {
        return await fetchPromise;
    } catch (err) {
        delete fetchCache[cacheKey]; 
        throw err;
    }
}

const itunesCache = {};

export async function fetchItunesData(title, artist) {
    if (!title || !artist) return { art: null, preview: null, link: null };
    
    const query = `${title} ${artist}`.trim().toLowerCase();
    
    if (itunesCache[query]) return await itunesCache[query];
    
    const fetchPromise = (async () => {
        try {
            const cleanTitle = title.replace(/\(.*?\)|\[.*?\]/g, '').split('-')[0].trim(); 
            const cleanArtist = artist.split(/feat\.?|ft\.?|&|,|\svs\.?\s|\sx\s/i)[0].trim();
            
            const cleanString = `${cleanTitle} ${cleanArtist}`.replace(/[&/\\#,+()$~%.'":*?<>{}]/g, '').trim();
            if (!cleanString) return { art: null, preview: null, link: null }; 

            const cleanQuery = encodeURIComponent(cleanString);
            const res = await fetch(`https://itunes.apple.com/search?term=${cleanQuery}&entity=song&limit=5`);
            
            if (!res.ok) throw new Error(`iTunes API HTTP Error: ${res.status}`);
            
            const data = await res.json();
            
            if (!data.results || !Array.isArray(data.results)) {
                return { art: null, preview: null, link: null };
            }

            const invalidTerms = [
                '2000s Hits', 'playlist', 'dj remix', 'dj mix', 'karaoke', 'tribute', 'cover', 
                'instrumental', 'live', 'various artists', 'vários artistas',
                'various', 'the voice', 'idol', 'x factor', 'got talent', 'podcast', 'mashup',
                'vol.', 'volume', 'lofi', 'lo-fi', 'lullaby', 'compilation', 'Streaming Only', 'Orgullo', 'Throwbacks', 'Y2K', 'Girl Power', 'Various Artists', 'Честит 8-ми март!', '90s Bangers', 'Time Capsule the 00s'
            ].map(t => t.toLowerCase());

            const isRemix = title.toLowerCase().includes('remix');
            const forbidden = isRemix 
                ? invalidTerms.filter(t => !t.includes('remix') && !t.includes('mix')) 
                : [...invalidTerms, 'remix'];

            const validTrack = data.results.find(track => {
                const trackArtist = (track.artistName || '').toLowerCase();
                const trackAlbum = (track.collectionName || '').toLowerCase();
                const trackTitle = (track.trackName || '').toLowerCase();
                
                const hasForbidden = forbidden.some(f => trackArtist.includes(f) || trackAlbum.includes(f) || trackTitle.includes(f));
                
                const mainArtistRequested = cleanArtist.toLowerCase().split(' ')[0];
                return !hasForbidden && trackArtist.includes(mainArtistRequested);
            });

            if (validTrack) {
                return { 
                    art: validTrack.artworkUrl100.replace('100x100bb', '600x600bb'), 
                    preview: validTrack.previewUrl, 
                    link: validTrack.trackViewUrl 
                };
            }
        } catch(e) {
            console.warn("Aviso no iTunes Fetch:", e);
        }
        
        return { art: null, preview: null, link: null }; 
    })();

    itunesCache[query] = fetchPromise; 
    return await fetchPromise;
}

export async function fetchStationData(station) {
    if (!station || !station.api || station.api.trim() === "") {
        return { songObj: null, historyObj: [], listeners: 0 };
    }

    try {
        const separator = station.api.includes('?') ? '&' : '?';
        const timestampedUrl = `${station.api}${separator}t=${new Date().getTime()}`;
        const needsProxy = station.type === 'shoutcast' || station.useCorsProxy === true;
        const apiResponse = await safeFetchJson(timestampedUrl, needsProxy);

        let songObj = null;
        let historyObj = [];
        let listeners = 0;

        const rootData = apiResponse.data ? apiResponse.data : apiResponse;

        if (station.type === 'azuracast') {
            listeners = parseInt(rootData?.listeners?.current, 10) || 0;
            if (rootData.now_playing && rootData.now_playing.song) {
                songObj = rootData.now_playing.song;
                if (!songObj.art || songObj.art === "") songObj.art = station.defaultArt;
                historyObj = rootData.song_history || [];
            }
            
        } else if (station.type === 'axoncast') {
            listeners = parseInt(rootData?.now_playing?.listeners?.current || rootData?.now_playing?.listeners || rootData?.listeners, 10) || 0;
            const extractArt = (obj) => {
                if (obj.art) {
                    if (typeof obj.art === 'string' && obj.art.trim() !== "") return obj.art;
                    if (typeof obj.art === 'object' && obj.art.url) return obj.art.url;
                }
                if (obj.cover && typeof obj.cover === 'string' && obj.cover.trim() !== "") return obj.cover;
                return station.defaultArt;
            };

            if (rootData.now_playing && rootData.now_playing.song) {
                 songObj = rootData.now_playing.song; songObj.art = extractArt(songObj); historyObj = rootData.song_history || [];
            } else {
                 songObj = { title: rootData.title || (rootData.song ? rootData.song.title : 'Desconhecido'), artist: rootData.artist || (rootData.song ? rootData.song.artist : 'Ao Vivo'), art: extractArt(rootData) };
            }
            
            if (station.historyApi && station.historyApi !== "" && station.historyApi !== station.api && historyObj.length === 0) {
                try {
                    const histSeparator = station.historyApi.includes('?') ? '&' : '?';
                    const histUrl = `${station.historyApi}${histSeparator}t=${new Date().getTime()}`;
                    const histData = await safeFetchJson(histUrl, needsProxy);
                    const histRoot = histData.data ? histData.data : histData;

                    if (histRoot.song_history) historyObj = histRoot.song_history;
                    else if (Array.isArray(histRoot)) historyObj = histRoot.map(item => (item.song ? item : { song: item })); 
                } catch(e) {}
            }
            
        } else if (station.type === '181fm') {
            listeners = parseInt(rootData?.listeners, 10) || 0;
            songObj = { title: rootData.title || '', artist: rootData.artist || '', art: station.defaultArt };

            if (station.historyApi && station.historyApi !== "" && station.historyApi !== station.api) {
                try {
                    const histSeparator = station.historyApi.includes('?') ? '&' : '?';
                    const histUrl = `${station.historyApi}${histSeparator}t=${new Date().getTime()}`;
                    const histData = await safeFetchJson(histUrl, needsProxy);
                    if (Array.isArray(histData)) {
                        historyObj = histData.map(item => ({ song: { title: item.title || '', artist: item.artist || '' }, timestamp: item.time ? Math.floor(item.time / 1000) : null }));
                    }
                } catch(e) {}
            }
            
        } else if (station.type === 'streamonkey') {
            listeners = parseInt(rootData?.listeners || rootData?.listenerCount, 10) || 0;
            let artUrl = station.defaultArt;
            if (rootData.mediaItem && rootData.mediaItem.artUri) artUrl = rootData.mediaItem.artUri;
            else if (rootData.images) artUrl = rootData.images['600x600'] || rootData.images['200x200'] || rootData.images['100x100'] || station.defaultArt;

            songObj = { title: rootData.title || (rootData.mediaItem ? rootData.mediaItem.title : ''), artist: rootData.artist || (rootData.mediaItem ? rootData.mediaItem.artist : ''), art: artUrl || station.defaultArt };

            if (station.historyApi && station.historyApi !== "" && station.historyApi !== station.api) {
                try {
                    const histSeparator = station.historyApi.includes('?') ? '&' : '?';
                    const histUrl = `${station.historyApi}${histSeparator}t=${new Date().getTime()}`;
                    const histData = await safeFetchJson(histUrl, needsProxy);
                    if (Array.isArray(histData)) {
                        historyObj = histData.map(item => ({ song: { title: item.MetaSong || '', artist: item.MetaArtist || '' }, timestamp: item.InsertDate ? Math.floor(new Date(item.InsertDate).getTime() / 1000) : null }));
                    }
                } catch(e) {}
            }
            
        } else if (station.type === 'cloudfm') {
            listeners = parseInt(rootData?.listeners || rootData?.now_playing?.listeners, 10) || 0;
            if (rootData.now_playing) songObj = { title: rootData.now_playing.title || '', artist: rootData.now_playing.artist || '', art: station.defaultArt };

            if (rootData.play_history && Array.isArray(rootData.play_history)) {
                historyObj = rootData.play_history.map(item => {
                    let unixTimestamp = null;
                    if (item.timestamp) { const isoString = item.timestamp.replace(' ', 'T'); unixTimestamp = Math.floor(new Date(isoString).getTime() / 1000); }
                    return { song: { title: item.title || '', artist: item.artist || '' }, timestamp: unixTimestamp };
                });
            }
            
        } else if (station.type === 'samcloud') {
            const currentItem = rootData.m_Item2 ? rootData.m_Item2 : rootData;
            listeners = parseInt(currentItem?.Listeners, 10) || 0;
            if (currentItem) songObj = { title: currentItem.Title || '', artist: currentItem.Artist || '', art: currentItem.Picture || station.defaultArt };

            if (station.historyApi && station.historyApi !== "" && station.historyApi !== station.api) {
                try {
                    const histSeparator = station.historyApi.includes('?') ? '&' : '?';
                    const histUrl = `${station.historyApi}${histSeparator}t=${new Date().getTime()}`;
                    const histData = await safeFetchJson(histUrl, needsProxy);
                    if (Array.isArray(histData)) {
                        historyObj = histData.map(item => {
                            let unixTimestamp = null;
                            if (item.DatePlayed) { const match = item.DatePlayed.match(/\d+/); if (match && match[0]) unixTimestamp = Math.floor(parseInt(match[0], 10) / 1000); }
                            return { song: { title: item.Title || '', artist: item.Artist || '' }, timestamp: unixTimestamp };
                        });
                    }
                } catch(e) {}
            }
            
        } else if (station.type === 'onlineradiobox') {
            listeners = parseInt(rootData?.listeners, 10) || 0;
            let rawTitle = rootData.title || ''; let extArtist = ''; let extTitle = rawTitle;

            if (rootData.iArtist && rootData.iName) { extArtist = rootData.iArtist; extTitle = rootData.iName; } 
            else if (rawTitle.includes(' - ')) { const parts = rawTitle.split(' - '); extArtist = parts[0].trim(); extTitle = parts.slice(1).join(' - ').trim(); }

            songObj = { title: extTitle, artist: extArtist, art: rootData.iImg || station.defaultArt };

            if (station.historyApi && station.historyApi !== "" && station.historyApi !== station.api) {
                try {
                    const histSeparator = station.historyApi.includes('?') ? '&' : '?';
                    const histUrl = `${station.historyApi}${histSeparator}t=${new Date().getTime()}`;
                    const histData = await safeFetchJson(histUrl, needsProxy);
                    if (histData.playlist && Array.isArray(histData.playlist)) {
                        historyObj = histData.playlist.map(item => {
                            let histArtist = ''; let histTitle = item.name || '';
                            if (histTitle.includes(' - ')) { const parts = histTitle.split(' - '); histArtist = parts[0].trim(); histTitle = parts.slice(1).join(' - ').trim(); }
                            return { song: { title: histTitle, artist: histArtist }, timestamp: item.created || null };
                        });
                    }
                } catch(e) {}
            }
            
        } else if (station.type === 'live365') {
            listeners = parseInt(rootData?.listeners || rootData?.current_listeners, 10) || 0;
            if (rootData["current-track"]) { const track = rootData["current-track"]; songObj = { title: track.title || '', artist: track.artist || '', art: track.art || station.defaultArt }; }

            if (rootData["last-played"] && Array.isArray(rootData["last-played"])) {
                historyObj = rootData["last-played"].map(item => {
                    let unixTimestamp = null;
                    if (item.start) unixTimestamp = Math.floor(new Date(item.start).getTime() / 1000);
                    return { song: { title: item.title || '', artist: item.artist || '' }, timestamp: unixTimestamp };
                });
            }
            
        } else if (station.type === 'radioapi') {
            listeners = parseInt(rootData?.listeners, 10) || 0;
            songObj = { title: rootData.song || '', artist: rootData.artist || '', art: rootData.artwork || station.defaultArt };

            if (rootData.history && Array.isArray(rootData.history)) {
                historyObj = rootData.history.map(item => {
                    let unixTimestamp = null;
                    if (item.timestamp) { const isoString = item.timestamp.replace(' ', 'T'); unixTimestamp = Math.floor(new Date(isoString).getTime() / 1000); }
                    return { song: { title: item.song || '', artist: item.artist || '' }, timestamp: unixTimestamp };
                });
            }
            
        } else if (station.type === 'icecast') {
            if (rootData.icestats && rootData.icestats.source) {
                const source = Array.isArray(rootData.icestats.source) ? rootData.icestats.source[0] : rootData.icestats.source;
                listeners = parseInt(source?.listeners, 10) || 0;
                let rawTitle = source.title || source.yp_currently_playing || ''; let extArtist = ''; let extTitle = rawTitle;

                if (rawTitle.includes(' - ')) { const parts = rawTitle.split(' - '); extArtist = parts[0].trim(); extTitle = parts.slice(1).join(' - ').trim(); }
                songObj = { title: extTitle, artist: extArtist, art: station.defaultArt };
            }

            if (station.historyApi && station.historyApi !== "" && station.historyApi !== station.api) {
                try {
                    const histSeparator = station.historyApi.includes('?') ? '&' : '?';
                    const histUrl = `${station.historyApi}${histSeparator}t=${new Date().getTime()}`;
                    const histData = await safeFetchJson(histUrl, needsProxy);

                    if (Array.isArray(histData)) {
                         historyObj = histData.map(item => {
                             let histArtist = item.artist || ''; let histTitle = item.title || item.name || '';
                             if (histTitle.includes(' - ') && !histArtist) { const parts = histTitle.split(' - '); histArtist = parts[0].trim(); histTitle = parts.slice(1).join(' - ').trim(); }
                             return { song: { title: histTitle, artist: histArtist }, timestamp: item.time || item.timestamp ? Math.floor(new Date(item.timestamp || item.time).getTime() / 1000) : null };
                         });
                    }
                } catch(e) {}
            }
            
        } else if (station.type === 'shoutcast') {
            listeners = parseInt(rootData?.currentlisteners, 10) || 0;
            let rawTitle = rootData.songtitle || ''; let extArtist = ''; let extTitle = rawTitle;

            if (rawTitle.includes(' - ')) { const parts = rawTitle.split(' - '); extArtist = parts[0].trim(); extTitle = parts.slice(1).join(' - ').trim(); }
            songObj = { title: extTitle, artist: extArtist, art: station.defaultArt };

            if (station.historyApi && station.historyApi !== "" && station.historyApi !== station.api) {
                try {
                    const histSeparator = station.historyApi.includes('?') ? '&' : '?';
                    const histUrl = `${station.historyApi}${histSeparator}t=${new Date().getTime()}`;
                    const histData = await safeFetchJson(histUrl, needsProxy);
                    
                    if (Array.isArray(histData)) {
                        historyObj = histData.map(item => {
                            let histArtist = ''; let histTitle = item.title || '';
                            if (histTitle.includes(' - ')) { const parts = histTitle.split(' - '); histArtist = parts[0].trim(); histTitle = parts.slice(1).join(' - ').trim(); }
                            return { song: { title: histTitle, artist: histArtist }, timestamp: item.playedat || null };
                        });
                    }
                } catch(e) {}
            }
            
        } else if (station.type === 'listenlive') {
            listeners = parseInt(rootData?.Listeners || rootData?.Log?.Listeners, 10) || 0;
            if (rootData.Log) {
                const currentItem = rootData.Log.Current;
                if (currentItem) songObj = { title: currentItem.Title || '', artist: currentItem.Artist || '', art: currentItem.Cover || station.defaultArt };

                const pastTracks = [];
                if (rootData.Log.Last && rootData.Log.Last.Title) pastTracks.push(rootData.Log.Last);
                if (rootData.Log.LastButOne && rootData.Log.LastButOne.Title) pastTracks.push(rootData.Log.LastButOne);

                if (pastTracks.length > 0) { historyObj = pastTracks.map(item => { return { song: { title: item.Title || '', artist: item.Artist || '' }, timestamp: null }; }); }
            }

            if (station.historyApi && station.historyApi !== "" && station.historyApi !== station.api) {
                try {
                    const histSeparator = station.historyApi.includes('?') ? '&' : '?';
                    const histUrl = `${station.historyApi}${histSeparator}t=${new Date().getTime()}`;
                    const histData = await safeFetchJson(histUrl, needsProxy);
                    if (Array.isArray(histData)) { historyObj = histData.map(item => { return { song: { title: item.Title || item.title || '', artist: item.Artist || item.artist || '' }, timestamp: null }; }); }
                } catch(e) {}
            }
            
        } else if (station.type === 'jamfm') {
            listeners = 0; 

            if (Array.isArray(rootData) && rootData.length > 0 && rootData[0].playHistories) {
                const targetChannel = rootData.find(c => 
                    (c.name && station.name && station.name.toLowerCase().includes(c.name.toLowerCase())) ||
                    (c.channelKey && station.api && station.api.includes(c.channelKey))
                ) || rootData[0];

                if (targetChannel && targetChannel.playHistories && targetChannel.playHistories.length > 0) {
                    const currentItem = targetChannel.playHistories[0];
                    if (currentItem && currentItem.track) {
                        songObj = {
                            title: currentItem.track.title || '',
                            artist: currentItem.track.artist || '',
                            art: currentItem.track.itunesCover || currentItem.track.coverUrlBig || station.defaultArt
                        };
                    }

                    if (station.historyApi && station.historyApi !== "" && station.historyApi !== station.api) {
                        try {
                            const histSeparator = station.historyApi.includes('?') ? '&' : '?';
                            const histUrl = `${station.historyApi}${histSeparator}t=${new Date().getTime()}`;
                            const histData = await safeFetchJson(histUrl, needsProxy);
                            
                            let histChannel = null;
                            if (Array.isArray(histData) && histData.length > 0 && histData[0].playHistories) {
                                histChannel = histData.find(c => 
                                    (c.name && station.name && station.name.toLowerCase().includes(c.name.toLowerCase())) ||
                                    (c.channelKey && station.historyApi.includes(c.channelKey))
                                ) || histData[0];
                            }

                            let targetHistories = histChannel ? histChannel.playHistories : (Array.isArray(histData) ? histData : []);

                            historyObj = targetHistories.map(item => {
                                let trackData = item.track || item;
                                let unixTimestamp = item.start ? Math.floor(item.start / 1000) : null;
                                return {
                                    song: { title: trackData.title || '', artist: trackData.artist || '' },
                                    timestamp: unixTimestamp
                                };
                            });
                        } catch(e) {}
                    } else {
                        historyObj = targetChannel.playHistories.map(item => {
                            let unixTimestamp = item.start ? Math.floor(item.start / 1000) : null;
                            return {
                                song: { title: item.track?.title || '', artist: item.track?.artist || '' },
                                timestamp: unixTimestamp
                            };
                        });
                    }
                }
            } 
            else if (Array.isArray(rootData) && rootData.length > 0 && rootData[0].track) {
                const currentItem = rootData[0];
                if (currentItem && currentItem.track) {
                    songObj = {
                        title: currentItem.track.title || '',
                        artist: currentItem.track.artist || '',
                        art: currentItem.track.itunesCover || currentItem.track.coverUrlBig || station.defaultArt
                    };
                }

                if (station.historyApi && station.historyApi !== "" && station.historyApi !== station.api) {
                    try {
                        const histSeparator = station.historyApi.includes('?') ? '&' : '?';
                        const histUrl = `${station.historyApi}${histSeparator}t=${new Date().getTime()}`;
                        const histData = await safeFetchJson(histUrl, needsProxy);
                        
                        if (Array.isArray(histData)) {
                            historyObj = histData.map(item => {
                                let unixTimestamp = item.start ? Math.floor(item.start / 1000) : null;
                                return {
                                    song: { title: item.track?.title || '', artist: item.track?.artist || '' },
                                    timestamp: unixTimestamp
                                };
                            });
                        }
                    } catch(e) {}
                } else {
                    historyObj = rootData.map(item => {
                        let unixTimestamp = item.start ? Math.floor(item.start / 1000) : null;
                        return {
                            song: { title: item.track?.title || '', artist: item.track?.artist || '' },
                            timestamp: unixTimestamp
                        };
                    });
                }
            }
        } else if (station.type === 'kiisfm' || station.type === 'iheart') {
            listeners = parseInt(rootData?.sites?.find?.stream?.amp?.currentlyPlaying?.count || rootData?.meta?.totalSize || apiResponse?.meta?.totalSize, 10) || 0;
            
            let tracks = [];
            if (rootData?.sites?.find?.stream?.amp?.currentlyPlaying?.tracks) {
                tracks = rootData.sites.find.stream.amp.currentlyPlaying.tracks;
            } else if (Array.isArray(rootData?.data)) {
                tracks = rootData.data;
            } else if (Array.isArray(apiResponse?.data)) {
                tracks = apiResponse.data;
            }

            if (tracks.length > 0) {
                const currentItem = tracks[0];
                let currentArtist = typeof currentItem.artist === 'string' ? currentItem.artist : (currentItem.artist?.artistName || '');
                
                songObj = {
                    title: currentItem.title || '',
                    artist: currentArtist || '',
                    art: currentItem.imagePath || station.defaultArt
                };

                historyObj = tracks.map(item => {
                    let hArtist = typeof item.artist === 'string' ? item.artist : (item.artist?.artistName || '');
                    let unixTimestamp = null;
                    if (item.startTime) {
                        unixTimestamp = item.startTime > 9999999999 ? Math.floor(item.startTime / 1000) : item.startTime;
                    }
                    return {
                        song: { title: item.title || '', artist: hArtist || '' },
                        timestamp: unixTimestamp
                    };
                });
            }
        } else if (station.type === 'nrj') {
            listeners = 0; 
            
            if (rootData.itms && Array.isArray(rootData.itms)) {
                // Captura o timestamp base da API (ou gera o atual como fallback)
                // NRJ envia o update_tm em Segundos
                let currentRunTimeMs = (rootData.update_tm || Math.floor(Date.now() / 1000)) * 1000;
                let parsedHistory = [];

                for (let i = 0; i < rootData.itms.length; i++) {
                    const item = rootData.itms[i];

                    // Se for uma música (SINGLE) e não for vinheta, adicionamos à array final
                    if (item.type === 'SINGLE' && item.tit && item.art) {
                        let artUrl = station.defaultArt;
                        if (item.cov && item.cov.startsWith('http')) {
                            artUrl = item.cov;
                        }

                        parsedHistory.push({
                            song: { title: item.tit || '', artist: item.art || '' },
                            timestamp: Math.floor(currentRunTimeMs / 1000), // Converte de volta para segundos para a interface
                            art: artUrl
                        });
                    }

                    // Para descobrir a que horas começou a próxima música (a que tocou antes), 
                    // nós voltamos no tempo subtraindo a duração do item anterior.
                    // Isso considera até as durações dos comerciais ("NRJAUDIODEFAULT") para calcular a hora exata.
                    if (i + 1 < rootData.itms.length) {
                        currentRunTimeMs -= (rootData.itms[i + 1].t_dur || 0);
                    }
                }

                // Seta a música atual e as passadas
                if (parsedHistory.length > 0) {
                    const currentItem = parsedHistory[0];
                    songObj = {
                        title: currentItem.song.title,
                        artist: currentItem.song.artist,
                        art: currentItem.art
                    };
                    historyObj = parsedHistory;
                }
            }
        }

        if (historyObj && historyObj.length > 0) {
            const cleanHistory = [];
            let lastTrackString = "";

            for (const item of historyObj) {
                const tTitle = item.song.title;
                const tArtist = item.song.artist;
                if (isValidTrack(tTitle, tArtist)) {
                    const currentTrackString = `${tTitle} ${tArtist}`.toLowerCase().trim();
                    if (currentTrackString !== lastTrackString) { cleanHistory.push(item); lastTrackString = currentTrackString; }
                }
            }
            historyObj = cleanHistory;
        }

        return { songObj, historyObj, listeners };
    } catch (e) { 
        return { songObj: null, historyObj: [], listeners: 0 };
    }
}
