// JSON DE CONFIGURAÇÕES DE ESTAÇÕES MULTIPLAS COM DESCRIÇÃO.

// para shoutcast/icecast use os termos específicos como no exemplo abaixo.

// shoutcast V2: API: "<ip>:<porta>/stats?sid={id}&json=1" historyAPI: "<ip>:<porta>/played.html"

// icecast: API: "<ip>:<porta>/status-json.xsl"

// Nota: o histórico de músicas para icecast será gerado conforme as faixas tocadas no player durante a transmissão.

 export const stations = [
    {
        "id": "energy_brasil",
        "name": "Energy Brasil 98.FM",
        "description": "A sua top 40 hits",
        "logotipo": "https://wapka-img.zuna.id/50c45830.png",
        "api": "https://s08.w3bserver.com/api/nowplaying/41",
        "historyApi": "",
        "type": "azuracast",
        "limitHistory": 10,
        "contact": "https://wa.me/559191930858?text=Olá,%20preciso%20de%20atendimento!",
        "visualizer": "true",
        "defaultArt": "https://img.wapka.org/00g5sh.png",
        "bgdefaultArt": "https://img.wapka.org/00g5sh.png",
        "streams": {
            "high": { "url": "https://s08.w3bserver.com/listen/energybrasil_be9d5a/energybrasilplus_192kbps.mp3", "format": "Alta qualidade" },
            "mid": { "url": "https://s08.w3bserver.com/listen/energybrasil_be9d5a/nrjbrasil_128kbps.mp3", "format": "Qualidade padrão" },
            "low": { "url": "https://s08.w3bserver.com/listen/energybrasil_be9d5a/nrjbrasil_32kbps.mp3", "format": "Qualidade Compactada" }
        }
    }
];
