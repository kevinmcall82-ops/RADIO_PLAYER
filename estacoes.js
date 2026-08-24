// JSON DE CONFIGURAÃ‡ÃƒO DE ESTAÃ‡Ã•ES MULTIPLAS COM DESCRIÃ‡ÃƒO
// para shoutcast/icecast use os termos especÃ­ficos.

// shoutcast V2: API: "<IP>:<porta>/stats?sid=id&json=1" historyAPI: "<IP>:<porta>/played.html"

// icecast: API: "<IP>:<porta>/status-json.xsl"

// Nota: o histÃ³rico de mÃºsicas para shoutcast/icecast sem historyApi serÃ¡ gerado conforme as faixas tocadas no player durante a transmissÃ£o.

 export const stations = [
    {
        "id": "jam_charts",
        "name": "JAM FM Berlin",
        "description": "Deine Nummer 1 fÃ¼r neue Musik",
        "logotipo": "https://www.jam.fm/assets/icons/logo.svg?token=v2",
        "api": "https://scraper2.onlineradiobox.com/de.jam?l=0",
        "historyApi": "https://onlineradiobox.com/json/de/jam/playlist/0?tz=180&rnd=0.3665578066230831",
        "type": "onlineradiobox",
        "limitHistory": 10,
        "contact": "https://www.facebook.com/radiojamfm",
        "visualizer": "true",
        "defaultArt": "https://static.jam.fm/img/1311/647006/500000/o/480/480/jamfm_streamcover_3000x3000.png",
        "bgdefaultArt": "https://static.jam.fm/img/1311/647006/500000/o/480/480/jamfm_streamcover_3000x3000.png",
        "streams": {
            "high": { "url": "https://stream.jam.fm/jamfm-live/mp3-192/App/", "format": "Alta qualidade" },
            "mid": { "url": "https://stream.jam.fm/jamfm-live/mp3-128/App/", "format": "Qualidade padrÃ£o" },
            "low": { "url": "https://stream.jam.fm/jamfm-live/aac-64/App/", "format": " Qualidade Compactada" }
        }
    },
{
        "id": "jam_2010er",
        "name": "JAM FM (2010er)",
        "description": "2010er Hits nonstop",
        "logotipo": "https://www.jam.fm/assets/icons/logo.svg?token=v2",
        "api": "https://scraper2.onlineradiobox.com/de.jam2010er?l=0",
        "historyApi": "https://onlineradiobox.com/json/de/jam2010er/playlist/0?tz=180&rnd=0.4350002858998071",
        "type": "onlineradiobox",
        "limitHistory": 10,
        "contact": "https://www.facebook.com/radiojamfm",
        "visualizer": "true",
        "defaultArt": "https://static.jam.fm/img/8705/227201/764000/o/480/480/image.png",
        "bgdefaultArt": "https://static.jam.fm/img/1311/647006/500000/o/480/480/jamfm_streamcover_3000x3000.png",
        "streams": {
            "high": { "url": "https://stream.jam.fm/2010er/mp3-192/App/", "format": "Alta qualidade" },
            "mid": { "url": "https://stream.jam.fm/2010er/mp3-128/App/", "format": "Qualidade padrÃ£o" },
            "low": { "url": "https://stream.jam.fm/2010er/aac-64/App/", "format": "Qualidade Compactada" }
        }
    },
{
        "id": "kiis_fm",
        "name": "102.7 KIIS-FM Music",
        "description": "LA's #1 Hit Music Station",
        "logotipo": "https://upload.wikimedia.org/wikipedia/commons/f/f4/1027_KIIS-FM_2015.png",
        "api": "https://us.api.iheart.com/api/v3/live-meta/stream/185/trackHistory?limit=20&useNewTimeFormat=true",
        "historyApi": "",
        "type": "iheart",
        "limitHistory": 10,
        "contact": "https://x.com/share?related=iHeartRadio&text=I%27m+listening+to+102.7+KIIS+FM+Los+Angeles+%E2%99%AB+%40iHeartRadio&url=https%3A%2F%2Fwww.iheart.com%2Flive%2F1027-kiis-fm-los-angeles-185",
        "visualizer": "true",
        "defaultArt": "https://reelworld.com/assets/images/marketing/jingles/kiis-2022/tile.jpg",
        "bgdefaultArt": "https://reelworld.com/assets/images/marketing/jingles/kiis-2022/tile.jpg",
        "streams": {
            "high": { "url": "https://stream.revma.ihrhls.com/zc185/hls.m3u8", "format": "Alta qualidade" },
            "mid": { "url": "", "format": "Qualidade padrÃ£o" },
            "low": { "url": "https://cloud.revma.ihrhls.com/zc185?rj-org=n2cb-e2&rj-ttl=5&rj-tok=AAABoC7mA8YA_ZdqehlI-C1F1A", "format": "Qualidade Compactada" }
        }
    },
{
        "id": "NRJ_fm",
        "name": "NRJ",
        "description": "Hit Music Only!",
        "logotipo": "https://radiomap.eu/fr/images/nrj.svg",
        "api": "https://players.nrjaudio.fm/wr_api/live/fr?act=get_plist&id_wr=158&fmt=json&sg_memory",
        "historyApi": "",
        "type": "nrj",
        "limitHistory": 10,
        "contact": "https://fr-fr.facebook.com/nrjradio",
        "visualizer": "true",
        "defaultArt": "https://cdn-profiles.tunein.com/s293289/images/bannerx.jpg?t=639190166580000000",
        "bgdefaultArt": "https://cdn-profiles.tunein.com/s293289/images/bannerx.jpg?t=639190166580000000",
        "streams": {
            "high": { "url": "https://streaming.nrjaudio.fm/oumvmk8fnozc?origine=playernrj", "format": "Alta qualidade" },
            "mid": { "url": "", "format": "Qualidade padrÃ£o" },
            "low": { "url": "https://streaming.nrjaudio.fm/oufdfatx4thg?origine=playernrj", "format": "Qualidade Compactada" }
        }
    }
];
