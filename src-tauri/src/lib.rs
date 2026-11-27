use aes::Aes256;
use base64::engine::general_purpose::STANDARD as BASE64_STD;
use base64::Engine;
use cbc::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::{BufWriter, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager, State};
use url::Url;

const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const MEGAPLAY_ENC_KEY: &[u8] = b"i?LMTAx0Q6,:}50U";
const MEGAPLAY_ENC_IV: &[u8] = b"W0;27ToaUpl_P%'c";

static PROXY_PORT: OnceLock<u16> = OnceLock::new();

#[derive(Default)]
struct DownloadCancelState {
    active: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadProgressPayload {
    id: String,
    percent: u8,
    label: String,
    bytes_downloaded: u64,
    total_bytes: Option<u64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TauriDownloadResult {
    bytes_downloaded: u64,
    final_filename: String,
    full_path: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedSource {
    id: String,
    label: String,
    quality: String,
    kind: String,
    url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    note: Option<String>,
    server_name: String,
    server_tag: String,
    flag_code: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResolvedServer {
    id: String,
    name: String,
    tag: String,
    note: String,
    flag_code: String,
    sources: Vec<ResolvedSource>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AnimeSubtitleTrack {
    id: String,
    language: String,
    lang_code: String,
    url: String,
    #[serde(rename = "type")]
    track_type: String,
    server: String,
}

#[derive(Deserialize)]
struct BuzzServerEntry {
    ref_token: Option<String>,
    #[serde(rename = "ref")]
    ref_val: Option<String>,
    name: Option<String>,
    lang: Option<String>,
    flag: Option<String>,
}

impl BuzzServerEntry {
    fn server_ref(&self) -> Option<&str> {
        self.ref_val
            .as_deref()
            .or(self.ref_token.as_deref())
            .filter(|s| !s.is_empty())
    }
}

#[derive(Deserialize)]
struct BuzzSsr {
    more: Option<bool>,
    servers: Option<Vec<BuzzServerEntry>>,
}

#[derive(Deserialize)]
struct BuzzQPayload {
    #[serde(rename = "type")]
    media_type: Option<String>,
    id: Option<serde_json::Value>,
    s: Option<u32>,
    e: Option<u32>,
    t: Option<String>,
    ssr: Option<BuzzSsr>,
}

#[derive(Deserialize)]
struct BuzzSourcesResponse {
    servers: Option<Vec<BuzzServerEntry>>,
}

#[derive(Deserialize)]
struct BuzzPlayResponse {
    url: Option<String>,
    #[serde(rename = "type")]
    kind: Option<String>,
}

#[derive(Deserialize)]
struct AnimeServerEntry {
    #[serde(rename = "type")]
    audio_type: Option<String>,
    link_id: Option<String>,
    name: Option<String>,
    #[serde(rename = "serverName")]
    server_name: Option<String>,
}

#[derive(Deserialize)]
struct AnimeServersResponse {
    results: Option<Vec<AnimeServerEntry>>,
}

#[derive(Deserialize)]
struct AnimeStreamInner {
    url: Option<String>,
}

#[derive(Deserialize)]
struct AnimeStreamResponse {
    results: Option<AnimeStreamInner>,
}

#[derive(Deserialize)]
struct MegaplaySource {
    file: Option<String>,
}

#[derive(Deserialize)]
struct MegaplayTrack {
    file: Option<String>,
    label: Option<String>,
    kind: Option<String>,
}

#[derive(Deserialize)]
struct MegaplaySourcesResponse {
    enc: Option<String>,
    sources: Option<Vec<MegaplaySource>>,
    tracks: Option<Vec<MegaplayTrack>>,
}

fn make_agent(timeout_secs: u64) -> ureq::Agent {
    ureq::AgentBuilder::new()
        .redirects(5)
        .timeout(Duration::from_secs(timeout_secs))
        .build()
}

fn encode_uri_component(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

fn is_allowed_http_url(raw: &str) -> bool {
    Url::parse(raw)
        .map(|u| u.scheme() == "http" || u.scheme() == "https")
        .unwrap_or(false)
}

fn proxy_base() -> String {
    match PROXY_PORT.get() {
        Some(p) => format!("http://127.0.0.1:{p}"),
        None => String::new(),
    }
}

fn build_hls_proxy_url(target_url: &str, referer_url: &str) -> String {
    format!(
        "{}/api/streams/hls?url={}&ref={}",
        proxy_base(),
        encode_uri_component(target_url),
        encode_uri_component(referer_url)
    )
}

fn build_seg_proxy_url(target_url: &str, referer_url: &str) -> String {
    format!(
        "{}/api/streams/seg?url={}&ref={}",
        proxy_base(),
        encode_uri_component(target_url),
        encode_uri_component(referer_url)
    )
}

fn resolve_proxy_target(raw_url: &str) -> String {
    if raw_url.starts_with('/') {
        format!("{}{}", proxy_base(), raw_url)
    } else {
        raw_url.to_string()
    }
}

fn extract_balanced_q_json(html: &str) -> Option<String> {
    let bytes = html.as_bytes();
    let markers = ["var Q", "let Q", "const Q", "window.Q"];
    let mut start_search: Option<usize> = None;

    for marker in markers {
        if let Some(pos) = html.find(marker) {
            let after_marker = &html[pos + marker.len()..];
            if let Some(eq_rel) = after_marker.find('=') {
                let after_eq = &after_marker[eq_rel + 1..];
                let trimmed_offset = after_eq.len() - after_eq.trim_start().len();
                if after_eq[trimmed_offset..].starts_with('{') {
                    start_search = Some(pos + marker.len() + eq_rel + 1 + trimmed_offset);
                    break;
                }
            }
        }
    }

    let start_idx = start_search?;
    let mut depth: i32 = 0;
    let mut in_string = false;
    let mut escaped = false;
    let mut i = start_idx;

    while i < bytes.len() {
        let ch = bytes[i];
        if in_string {
            if escaped {
                escaped = false;
            } else if ch == b'\\' {
                escaped = true;
            } else if ch == b'"' {
                in_string = false;
            }
        } else if ch == b'"' {
            in_string = true;
        } else if ch == b'{' {
            depth += 1;
        } else if ch == b'}' {
            depth -= 1;
            if depth == 0 {
                return std::str::from_utf8(&bytes[start_idx..=i])
                    .ok()
                    .map(|s| s.to_string());
            }
        }
        i += 1;
    }
    None
}

fn clean_buzz_server_name(
    raw_name: Option<&str>,
    raw_lang: Option<&str>,
    idx: usize,
) -> (String, String, String) {
    let fallback = format!("Server {}", idx + 1);
    let raw = raw_name.unwrap_or(&fallback).trim();
    let stripped = if raw.to_ascii_lowercase().starts_with("server ") {
        raw[7..].trim()
    } else {
        raw
    };

    let mut parts = stripped.splitn(2, '-');
    let code_part = parts.next().unwrap_or(stripped).trim();
    let hyphen_lang = parts.next().unwrap_or("").trim();
    let explicit_lang = raw_lang.unwrap_or("").trim();

    let lang = if !explicit_lang.is_empty() {
        explicit_lang.to_string()
    } else if !hyphen_lang.is_empty() {
        hyphen_lang.to_string()
    } else if code_part.eq_ignore_ascii_case("english") {
        "English".to_string()
    } else {
        String::new()
    };

    let lower = lang.to_ascii_lowercase();
    let flag_code = if lower.contains("hindi") || lower.contains("indian") {
        "in"
    } else if lower.contains("french") {
        "fr"
    } else if lower.contains("german") {
        "de"
    } else if lower.contains("spanish") || lower.contains("latino") {
        "mx"
    } else if lower.contains("russian") {
        "ru"
    } else if lower.contains("italian") {
        "it"
    } else if lower.contains("portuguese") {
        "br"
    } else if lower.contains("arabic") {
        "sa"
    } else if lower.contains("turkish") {
        "tr"
    } else {
        "us"
    }
    .to_string();

    let note = if lang.is_empty() {
        "Original audio".to_string()
    } else if lower.contains("audio") {
        lang
    } else {
        format!("{lang} audio")
    };

    let name = if code_part.is_empty() {
        format!("Node {}", idx + 1)
    } else {
        code_part.to_string()
    };

    (name, note, flag_code)
}

fn sanitize_slug(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_dash = false;
    for ch in s.chars() {
        if ch.is_ascii_alphanumeric() {
            out.push(ch.to_ascii_lowercase());
            last_dash = false;
        } else if !last_dash {
            out.push('-');
            last_dash = true;
        }
    }
    out.trim_matches('-').to_string()
}

fn resolve_from_buzz_host(
    host: &str,
    media_type: &str,
    lookup_id: &str,
    season: u32,
    episode: u32,
) -> Vec<ResolvedServer> {
    let encoded_id = encode_uri_component(lookup_id);
    let embed_path = if media_type == "tv" {
        format!("/embed/tv/{encoded_id}/{season}/{episode}")
    } else {
        format!("/embed/movie/{encoded_id}")
    };
    let embed_url = format!("{host}{embed_path}");
    let agent = make_agent(7);

    let html = match agent
        .get(&embed_url)
        .set("User-Agent", BROWSER_UA)
        .set("Referer", "https://www.2embed.cc/")
        .set(
            "Accept",
            "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        )
        .call()
    {
        Ok(resp) => match resp.into_string() {
            Ok(text) => text,
            Err(_) => return Vec::new(),
        },
        Err(_) => return Vec::new(),
    };

    let q_raw = match extract_balanced_q_json(&html) {
        Some(q) => q,
        None => return Vec::new(),
    };

    let q_data: BuzzQPayload = match serde_json::from_str(&q_raw) {
        Ok(val) => val,
        Err(_) => return Vec::new(),
    };

    let token = q_data.t.clone().unwrap_or_default();
    let mut servers = q_data
        .ssr
        .as_ref()
        .and_then(|s| s.servers.as_ref())
        .map(|list| {
            list.iter()
                .map(|item| BuzzServerEntry {
                    ref_token: item.ref_token.clone(),
                    ref_val: item.ref_val.clone(),
                    name: item.name.clone(),
                    lang: item.lang.clone(),
                    flag: item.flag.clone(),
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    let need_more = servers.is_empty()
        || q_data.ssr.as_ref().and_then(|s| s.more).unwrap_or(false);

    if need_more {
        let q_type = q_data
            .media_type
            .clone()
            .unwrap_or_else(|| media_type.to_string());
        let q_id = match &q_data.id {
            Some(serde_json::Value::String(s)) if !s.is_empty() => s.clone(),
            Some(serde_json::Value::Number(n)) => n.to_string(),
            _ => lookup_id.to_string(),
        };
        let q_s = q_data.s.unwrap_or(if media_type == "tv" { season } else { 0 });
        let q_e = q_data
            .e
            .unwrap_or(if media_type == "tv" { episode } else { 0 });

        let mut sources_url = format!(
            "{host}/pl/api.php?a=sources&type={}&id={}&s={q_s}&e={q_e}&pf=1",
            encode_uri_component(&q_type),
            encode_uri_component(&q_id)
        );
        if !token.is_empty() {
            sources_url.push_str("&t=");
            sources_url.push_str(&encode_uri_component(&token));
        }

        if let Ok(src_resp) = agent
            .get(&sources_url)
            .set("User-Agent", BROWSER_UA)
            .set("Referer", &embed_url)
            .call()
        {
            if let Ok(src_json) = src_resp.into_json::<BuzzSourcesResponse>() {
                if let Some(extra) = src_json.servers {
                    if !extra.is_empty() {
                        let mut seen = HashSet::new();
                        for s in &servers {
                            let k = format!(
                                "{}|{}",
                                s.name.as_deref().unwrap_or("").trim().to_ascii_lowercase(),
                                s.lang.as_deref().unwrap_or("").trim().to_ascii_lowercase()
                            );
                            seen.insert(k);
                        }
                        for entry in extra {
                            let k = format!(
                                "{}|{}",
                                entry.name.as_deref().unwrap_or("").trim().to_ascii_lowercase(),
                                entry.lang.as_deref().unwrap_or("").trim().to_ascii_lowercase()
                            );
                            if entry.server_ref().is_some() && !seen.contains(&k) {
                                seen.insert(k);
                                servers.push(entry);
                            }
                        }
                    }
                }
            }
        }
    }

    if servers.is_empty() {
        return Vec::new();
    }

    let base_host = match Url::parse(host) {
        Ok(u) => u,
        Err(_) => return Vec::new(),
    };
    let host_prefix = if host.contains("videm") { "videm" } else { "buzz" };

    std::thread::scope(|scope| {
        let handles: Vec<_> = servers
            .iter()
            .enumerate()
            .map(|(idx, srv)| {
                let embed_url = embed_url.clone();
                let token = token.clone();
                let base_host = base_host.clone();
                scope.spawn(move || -> Option<ResolvedServer> {
                    let srv_ref = srv.server_ref()?;
                    let mut play_url = format!(
                        "{host}/pl/api.php?a=play&ref={}",
                        encode_uri_component(srv_ref)
                    );
                    if !token.is_empty() {
                        play_url.push_str("&t=");
                        play_url.push_str(&encode_uri_component(&token));
                    }

                    let thread_agent = make_agent(6);
                    let play_resp = thread_agent
                        .get(&play_url)
                        .set("User-Agent", BROWSER_UA)
                        .set("Referer", &embed_url)
                        .call()
                        .ok()?;
                    let play_json: BuzzPlayResponse = play_resp.into_json().ok()?;
                    let raw_stream_url = play_json.url?;
                    let abs_stream_url = base_host.join(&raw_stream_url).ok()?.to_string();

                    let is_hls = play_json.kind.as_deref() == Some("hls")
                        || abs_stream_url.contains(".m3u8")
                        || abs_stream_url.contains("/_stream");

                    if is_hls {
                        let check_resp = thread_agent
                            .get(&abs_stream_url)
                            .set("User-Agent", BROWSER_UA)
                            .set("Referer", &embed_url)
                            .call()
                            .ok()?;
                        let body = check_resp.into_string().ok()?;
                        if !body.contains("#EXTM3U") {
                            return None;
                        }
                    }

                    let (name, note, default_flag) = clean_buzz_server_name(
                        srv.name.as_deref(),
                        srv.lang.as_deref(),
                        idx,
                    );
                    let flag_code = srv
                        .flag
                        .clone()
                        .filter(|f| !f.trim().is_empty())
                        .unwrap_or(default_flag);
                    let tag = format!("{host_prefix}-{}-{idx}", sanitize_slug(&name));
                    let proxied_url = if is_hls {
                        build_hls_proxy_url(&abs_stream_url, &embed_url)
                    } else {
                        build_seg_proxy_url(&abs_stream_url, &embed_url)
                    };

                    Some(ResolvedServer {
                        id: tag.clone(),
                        name: name.clone(),
                        tag: tag.clone(),
                        note: note.clone(),
                        flag_code: flag_code.clone(),
                        sources: vec![ResolvedSource {
                            id: format!("{tag}-auto"),
                            label: format!("{name} · Auto"),
                            quality: "Auto".to_string(),
                            kind: if is_hls { "hls" } else { "mp4" }.to_string(),
                            url: proxied_url,
                            note: Some(note),
                            server_name: name,
                            server_tag: tag,
                            flag_code,
                        }],
                    })
                })
            })
            .collect();

        handles
            .into_iter()
            .filter_map(|h| h.join().ok().flatten())
            .collect()
    })
}

fn decrypt_megaplay_enc(enc: &str) -> Option<String> {
    let mut b64 = enc.replace('-', "+").replace('_', "/");
    let rem = b64.len() % 4;
    if rem != 0 {
        b64.extend(std::iter::repeat('=').take(4 - rem));
    }
    let mut raw = BASE64_STD.decode(b64.as_bytes()).ok()?;

    let mut key = [0u8; 32];
    let klen = MEGAPLAY_ENC_KEY.len().min(32);
    key[..klen].copy_from_slice(&MEGAPLAY_ENC_KEY[..klen]);

    let mut iv = [0u8; 16];
    let ivlen = MEGAPLAY_ENC_IV.len().min(16);
    iv[..ivlen].copy_from_slice(&MEGAPLAY_ENC_IV[..ivlen]);

    let decryptor = cbc::Decryptor::<Aes256>::new_from_slices(&key, &iv).ok()?;
    let plain = decryptor.decrypt_padded_mut::<Pkcs7>(&mut raw).ok()?;
    let json: MegaplaySource = serde_json::from_slice(plain).ok()?;
    json.file.filter(|f| !f.is_empty())
}

fn rewrite_uri_attribute(line: &str, base: &Url, referer: &str, force_playlist: bool) -> String {
    let Some(start) = line.find("URI=\"") else {
        return line.to_string();
    };
    let rest = &line[start + 5..];
    let Some(end_rel) = rest.find('"') else {
        return line.to_string();
    };
    let raw_uri = &rest[..end_rel];
    let replaced = if let Ok(abs) = base.join(raw_uri) {
        let abs_str = abs.to_string();
        if force_playlist || abs_str.contains(".m3u8") {
            build_hls_proxy_url(&abs_str, referer)
        } else {
            build_seg_proxy_url(&abs_str, referer)
        }
    } else {
        raw_uri.to_string()
    };

    let mut out = String::with_capacity(line.len() + 64);
    out.push_str(&line[..start + 5]);
    out.push_str(&replaced);
    out.push_str(&rest[end_rel..]);
    out
}

fn rewrite_m3u8_manifest(manifest: &str, base_url: &str, referer_url: &str) -> String {
    let Ok(base) = Url::parse(base_url) else {
        return manifest.to_string();
    };
    let lines: Vec<&str> = manifest.lines().collect();
    let mut out: Vec<String> = Vec::with_capacity(lines.len());

    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            out.push((*line).to_string());
            continue;
        }
        if trimmed.starts_with('#') {
            let is_playlist_tag = trimmed.starts_with("#EXT-X-MEDIA:")
                || trimmed.starts_with("#EXT-X-I-FRAME-STREAM-INF:");
            if line.contains("URI=\"") {
                out.push(rewrite_uri_attribute(
                    line,
                    &base,
                    referer_url,
                    is_playlist_tag,
                ));
            } else {
                out.push((*line).to_string());
            }
            continue;
        }

        if let Ok(abs) = base.join(trimmed) {
            let abs_str = abs.to_string();
            let prev_line = if i > 0 { lines[i - 1].trim() } else { "" };
            let is_child_playlist = prev_line.starts_with("#EXT-X-STREAM-INF")
                || abs_str.contains(".m3u8")
                || abs_str.contains("/_stream");
            if is_child_playlist {
                out.push(build_hls_proxy_url(&abs_str, referer_url));
            } else {
                out.push(build_seg_proxy_url(&abs_str, referer_url));
            }
        } else {
            out.push((*line).to_string());
        }
    }

    out.join("\n")
}

fn header(name: &str, val: &str) -> Option<tiny_http::Header> {
    tiny_http::Header::from_bytes(name.as_bytes(), val.as_bytes()).ok()
}

fn respond_json<T: Serialize>(request: tiny_http::Request, status: u16, payload: &T) {
    let body = serde_json::to_vec(payload).unwrap_or_else(|_| b"{}".to_vec());
    let mut resp = tiny_http::Response::from_data(body)
        .with_status_code(tiny_http::StatusCode(status));
    if let Some(h) = header("Content-Type", "application/json; charset=utf-8") {
        resp.add_header(h);
    }
    if let Some(h) = header("Access-Control-Allow-Origin", "*") {
        resp.add_header(h);
    }
    if let Some(h) = header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS") {
        resp.add_header(h);
    }
    if let Some(h) = header("Access-Control-Allow-Headers", "*") {
        resp.add_header(h);
    }
    let _ = request.respond(resp);
}

fn respond_text(request: tiny_http::Request, status: u16, content_type: &str, body: String) {
    let mut resp = tiny_http::Response::from_data(body.into_bytes())
        .with_status_code(tiny_http::StatusCode(status));
    if let Some(h) = header("Content-Type", content_type) {
        resp.add_header(h);
    }
    if let Some(h) = header("Access-Control-Allow-Origin", "*") {
        resp.add_header(h);
    }
    if let Some(h) = header("Cache-Control", "no-store") {
        resp.add_header(h);
    }
    let _ = request.respond(resp);
}

fn handle_resolve_request(request: tiny_http::Request, query: &HashMap<String, String>) {
    let media_type = if query.get("type").map(|s| s.as_str()) == Some("tv") {
        "tv"
    } else {
        "movie"
    };
    let tmdb_id = query.get("tmdbId").map(|s| s.trim()).unwrap_or("");
    let imdb_id = query.get("imdbId").map(|s| s.trim()).unwrap_or("");
    let season = query
        .get("season")
        .and_then(|s| s.parse::<u32>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(1);
    let episode = query
        .get("episode")
        .and_then(|s| s.parse::<u32>().ok())
        .filter(|&n| n > 0)
        .unwrap_or(1);

    let mut id_candidates: Vec<&str> = Vec::new();
    if !tmdb_id.is_empty() {
        id_candidates.push(tmdb_id);
    }
    if !imdb_id.is_empty() {
        id_candidates.push(imdb_id);
    }

    if id_candidates.is_empty() {
        respond_json(
            request,
            400,
            &serde_json::json!({ "error": "Missing tmdbId or imdbId", "servers": [] }),
        );
        return;
    }

    let mut servers = Vec::new();
    for lookup_id in &id_candidates {
        servers = resolve_from_buzz_host(
            "https://vidsrc.buzz",
            media_type,
            lookup_id,
            season,
            episode,
        );
        if !servers.is_empty() {
            break;
        }
    }

    if servers.is_empty() {
        for lookup_id in &id_candidates {
            servers = resolve_from_buzz_host(
                "https://videm.buzz",
                media_type,
                lookup_id,
                season,
                episode,
            );
            if !servers.is_empty() {
                break;
            }
        }
    }

    let language_tier = |srv: &ResolvedServer| -> u8 {
        let note = srv.note.to_ascii_lowercase();
        let name = srv.name.to_ascii_lowercase();
        if note.contains("english") || name == "english" {
            0
        } else if note.contains("original") && srv.flag_code == "us" {
            1
        } else {
            2
        }
    };

    servers.sort_by_key(|s| {
        let tier = language_tier(s);
        let hls_rank: u8 = if s.sources.first().map(|src| src.kind.as_str()) == Some("hls") {
            0
        } else {
            1
        };
        (tier, hls_rank)
    });

    respond_json(request, 200, &serde_json::json!({ "servers": servers }));
}

fn handle_anime_request(request: tiny_http::Request, query: &HashMap<String, String>) {
    let server_ids = query.get("serverIds").map(|s| s.trim()).unwrap_or("");
    let audio = if query
        .get("audio")
        .map(|s| s.eq_ignore_ascii_case("dub"))
        .unwrap_or(false)
    {
        "dub"
    } else {
        "sub"
    };

    if server_ids.is_empty() {
        respond_json(
            request,
            200,
            &serde_json::json!({ "sources": [], "subtitles": [] }),
        );
        return;
    }

    let agent = make_agent(6);
    let srv_url = format!(
        "https://anime.vidy.st/api/servers?ids={}",
        encode_uri_component(server_ids)
    );
    let srv_json: AnimeServersResponse = match agent.get(&srv_url).call() {
        Ok(r) => match r.into_json() {
            Ok(j) => j,
            Err(_) => {
                respond_json(
                    request,
                    200,
                    &serde_json::json!({ "sources": [], "subtitles": [] }),
                );
                return;
            }
        },
        Err(_) => {
            respond_json(
                request,
                200,
                &serde_json::json!({ "sources": [], "subtitles": [] }),
            );
            return;
        }
    };

    let all_entries: Vec<AnimeServerEntry> = srv_json
        .results
        .unwrap_or_default()
        .into_iter()
        .filter(|r| r.link_id.as_deref().map(|s| !s.is_empty()).unwrap_or(false))
        .collect();

    let matching: Vec<&AnimeServerEntry> = all_entries
        .iter()
        .filter(|r| {
            r.audio_type
                .as_deref()
                .map(|t| t.eq_ignore_ascii_case(audio))
                .unwrap_or(true)
        })
        .collect();

    let candidates: Vec<&AnimeServerEntry> = if matching.is_empty() {
        all_entries.iter().collect()
    } else {
        matching
    };

    let settled: Vec<Option<(ResolvedSource, Vec<AnimeSubtitleTrack>)>> =
        std::thread::scope(|scope| {
            let handles: Vec<_> = candidates
                .into_iter()
                .take(4)
                .enumerate()
                .map(|(i, entry)| {
                    scope.spawn(move || -> Option<(ResolvedSource, Vec<AnimeSubtitleTrack>)> {
                        let link_id = entry.link_id.as_deref()?;
                        let t_agent = make_agent(6);
                        let st_url = format!(
                            "https://anime.vidy.st/api/stream?id={}",
                            encode_uri_component(link_id)
                        );
                        let st_json: AnimeStreamResponse =
                            t_agent.get(&st_url).call().ok()?.into_json().ok()?;
                        let embed_url = st_json.results?.url?;
                        if embed_url.is_empty() {
                            return None;
                        }

                        let srv_label = entry
                            .name
                            .as_deref()
                            .or(entry.server_name.as_deref())
                            .map(|s| s.to_string())
                            .unwrap_or_else(|| format!("Server {}", i + 1));
                        let tag = format!("anime-{}-{i}", sanitize_slug(&srv_label));
                        let audio_upper = audio.to_ascii_uppercase();

                        if embed_url.contains(".m3u8") || embed_url.contains(".mp4") {
                            let is_hls = embed_url.contains(".m3u8");
                            let proxied = if is_hls {
                                build_hls_proxy_url(&embed_url, "https://anime.vidy.st/")
                            } else {
                                build_seg_proxy_url(&embed_url, "https://anime.vidy.st/")
                            };
                            return Some((
                                ResolvedSource {
                                    id: tag.clone(),
                                    label: format!("{srv_label} ({audio_upper})"),
                                    quality: "Auto".to_string(),
                                    kind: if is_hls { "hls" } else { "mp4" }.to_string(),
                                    url: proxied,
                                    note: Some(format!("{audio_upper} audio")),
                                    server_name: srv_label,
                                    server_tag: tag,
                                    flag_code: "us".to_string(),
                                },
                                Vec::new(),
                            ));
                        }

                        if embed_url.contains("megaplay") {
                            let mp_html = t_agent
                                .get(&embed_url)
                                .set("User-Agent", BROWSER_UA)
                                .set("Referer", "https://anime.vidy.st/")
                                .call()
                                .ok()?
                                .into_string()
                                .ok()?;

                            let data_id = extract_data_id(&mp_html)?;
                            let parsed_embed = Url::parse(&embed_url).ok()?;
                            let origin = format!(
                                "{}://{}",
                                parsed_embed.scheme(),
                                parsed_embed.host_str()?
                            );
                            let src_url = format!(
                                "{origin}/stream/getSources?id={}",
                                encode_uri_component(&data_id)
                            );
                            let src_data: MegaplaySourcesResponse = t_agent
                                .get(&src_url)
                                .set("User-Agent", BROWSER_UA)
                                .set("X-Requested-With", "XMLHttpRequest")
                                .set("Referer", &embed_url)
                                .call()
                                .ok()?
                                .into_json()
                                .ok()?;

                            let mut master_url = src_data
                                .sources
                                .as_ref()
                                .and_then(|s| s.first())
                                .and_then(|s| s.file.clone())
                                .unwrap_or_default();

                            if master_url.is_empty() {
                                if let Some(enc) = src_data.enc.as_deref() {
                                    if let Some(decoded) = decrypt_megaplay_enc(enc) {
                                        master_url = decoded;
                                    }
                                }
                            }

                            if !master_url.is_empty() {
                                let mut tracks = Vec::new();
                                for tr in src_data.tracks.unwrap_or_default() {
                                    let Some(file_url) = tr.file.filter(|f| !f.is_empty()) else {
                                        continue;
                                    };
                                    if tr.kind.as_deref() == Some("thumbnails") {
                                        continue;
                                    }
                                    let lang = tr
                                        .label
                                        .filter(|l| !l.trim().is_empty())
                                        .unwrap_or_else(|| "English".to_string());
                                    let lang_code: String =
                                        lang.chars().take(2).collect::<String>().to_ascii_lowercase();
                                    let track_type = if file_url.to_ascii_lowercase().contains(".vtt") {
                                        "vtt"
                                    } else {
                                        "srt"
                                    };
                                    tracks.push(AnimeSubtitleTrack {
                                        id: format!("mp-sub-{i}-{}", tracks.len()),
                                        language: lang,
                                        lang_code,
                                        url: file_url,
                                        track_type: track_type.to_string(),
                                        server: "stream".to_string(),
                                    });
                                }

                                let referer = format!("{origin}/");
                                return Some((
                                    ResolvedSource {
                                        id: tag.clone(),
                                        label: format!("{srv_label} ({audio_upper})"),
                                        quality: "1080p".to_string(),
                                        kind: "hls".to_string(),
                                        url: build_hls_proxy_url(&master_url, &referer),
                                        note: Some(format!("{audio_upper} audio")),
                                        server_name: srv_label,
                                        server_tag: tag,
                                        flag_code: "us".to_string(),
                                    },
                                    tracks,
                                ));
                            }
                        }

                        None
                    })
                })
                .collect();

            handles
                .into_iter()
                .map(|h| h.join().ok().flatten())
                .collect()
        });

    let mut sources = Vec::new();
    let mut subtitles = Vec::new();
    for entry in settled.into_iter().flatten() {
        sources.push(entry.0);
        if subtitles.is_empty() && !entry.1.is_empty() {
            subtitles.extend(entry.1);
        }
    }

    respond_json(
        request,
        200,
        &serde_json::json!({ "sources": sources, "subtitles": subtitles }),
    );
}

fn extract_data_id(html: &str) -> Option<String> {
    for pattern in ["data-id=\"", "data-id='"] {
        if let Some(pos) = html.find(pattern) {
            let quote = pattern.chars().last()?;
            let rest = &html[pos + pattern.len()..];
            if let Some(end) = rest.find(quote) {
                let id = rest[..end].trim();
                if !id.is_empty() {
                    return Some(id.to_string());
                }
            }
        }
    }
    None
}

fn handle_hls_request(request: tiny_http::Request, query: &HashMap<String, String>) {
    let target_url = query.get("url").map(|s| s.as_str()).unwrap_or("");
    let ref_param = query.get("ref").map(|s| s.as_str()).unwrap_or("");
    if !is_allowed_http_url(target_url) {
        respond_text(request, 400, "text/plain; charset=utf-8", "Invalid URL".into());
        return;
    }

    let ref_url = if is_allowed_http_url(ref_param) {
        ref_param.to_string()
    } else if let Ok(u) = Url::parse(target_url) {
        format!("{}://{}/", u.scheme(), u.host_str().unwrap_or(""))
    } else {
        target_url.to_string()
    };

    let ref_origin = Url::parse(&ref_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| format!("{}://{h}", u.scheme())))
        .unwrap_or_else(|| ref_url.clone());

    let agent = make_agent(12);
    match agent
        .get(target_url)
        .set("User-Agent", BROWSER_UA)
        .set("Referer", &ref_url)
        .set("Origin", &ref_origin)
        .call()
    {
        Ok(upstream) => {
            let final_url = upstream.get_url().to_string();
            match upstream.into_string() {
                Ok(manifest) => {
                    let rewritten = rewrite_m3u8_manifest(
                        &manifest,
                        if final_url.is_empty() {
                            target_url
                        } else {
                            &final_url
                        },
                        &ref_url,
                    );
                    respond_text(
                        request,
                        200,
                        "application/vnd.apple.mpegurl; charset=utf-8",
                        rewritten,
                    );
                }
                Err(e) => respond_text(
                    request,
                    502,
                    "text/plain; charset=utf-8",
                    format!("Failed to read playlist: {e}"),
                ),
            }
        }
        Err(ureq::Error::Status(code, _)) => respond_text(
            request,
            code,
            "text/plain; charset=utf-8",
            format!("Upstream HTTP {code}"),
        ),
        Err(e) => respond_text(
            request,
            502,
            "text/plain; charset=utf-8",
            format!("HLS proxy failed: {e}"),
        ),
    }
}

fn needs_image_header_strip(target_url: &str) -> bool {
    let low = target_url.to_ascii_lowercase();
    low.contains("ibyteimg.com")
        || low.contains("tiktokcdn.com")
        || low.contains("ipstatp.com")
        || low.contains("yoot.akirax.buzz")
}

fn handle_seg_request(request: tiny_http::Request, query: &HashMap<String, String>) {
    let target_url = query.get("url").map(|s| s.as_str()).unwrap_or("");
    let ref_param = query.get("ref").map(|s| s.as_str()).unwrap_or("");
    if !is_allowed_http_url(target_url) {
        respond_text(request, 400, "text/plain; charset=utf-8", "Invalid URL".into());
        return;
    }

    let ref_url = if is_allowed_http_url(ref_param) {
        ref_param.to_string()
    } else if let Ok(u) = Url::parse(target_url) {
        format!("{}://{}/", u.scheme(), u.host_str().unwrap_or(""))
    } else {
        target_url.to_string()
    };

    let ref_origin = Url::parse(&ref_url)
        .ok()
        .and_then(|u| u.host_str().map(|h| format!("{}://{h}", u.scheme())))
        .unwrap_or_else(|| ref_url.clone());

    let range_hdr = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Range"))
        .map(|h| h.value.as_str().to_string());

    let agent = make_agent(25);
    let mut req = agent
        .get(target_url)
        .set("User-Agent", BROWSER_UA)
        .set("Referer", &ref_url)
        .set("Origin", &ref_origin);
    if let Some(r) = range_hdr.as_deref() {
        req = req.set("Range", r);
    }

    let upstream = match req.call() {
        Ok(resp) => resp,
        Err(ureq::Error::Status(code, _)) => {
            respond_text(
                request,
                code,
                "text/plain; charset=utf-8",
                format!("Segment HTTP {code}"),
            );
            return;
        }
        Err(e) => {
            respond_text(
                request,
                502,
                "text/plain; charset=utf-8",
                format!("Segment proxy failed: {e}"),
            );
            return;
        }
    };

    let status = upstream.status();
    let needs_strip = needs_image_header_strip(target_url);
    let ct = upstream.header("content-type").unwrap_or("").to_string();
    let final_ct = if needs_strip || ct.starts_with("image/") || target_url.contains(".jpg") {
        "video/mp2t".to_string()
    } else if ct.is_empty() {
        "application/octet-stream".to_string()
    } else {
        ct
    };

    if needs_strip {
        let mut raw_buf = Vec::new();
        if upstream.into_reader().read_to_end(&mut raw_buf).is_err() {
            respond_text(
                request,
                502,
                "text/plain; charset=utf-8",
                "Failed reading disguised segment".into(),
            );
            return;
        }
        let out_buf = if raw_buf.len() > 252 {
            raw_buf[252..].to_vec()
        } else {
            raw_buf
        };
        let mut resp = tiny_http::Response::from_data(out_buf)
            .with_status_code(tiny_http::StatusCode(status));
        if let Some(h) = header("Access-Control-Allow-Origin", "*") {
            resp.add_header(h);
        }
        if let Some(h) = header("Cache-Control", "public, max-age=300") {
            resp.add_header(h);
        }
        if let Some(h) = header("Content-Type", &final_ct) {
            resp.add_header(h);
        }
        let _ = request.respond(resp);
        return;
    }

    let cl = upstream
        .header("content-length")
        .and_then(|v| v.parse::<usize>().ok());
    let cr = upstream.header("content-range").map(|s| s.to_string());
    let ar = upstream.header("accept-ranges").map(|s| s.to_string());

    let mut headers = Vec::new();
    if let Some(h) = header("Access-Control-Allow-Origin", "*") {
        headers.push(h);
    }
    if let Some(h) = header("Cache-Control", "public, max-age=300") {
        headers.push(h);
    }
    if let Some(h) = header("Content-Type", &final_ct) {
        headers.push(h);
    }
    if let Some(val) = cr {
        if let Some(h) = header("Content-Range", &val) {
            headers.push(h);
        }
    }
    if let Some(val) = ar {
        if let Some(h) = header("Accept-Ranges", &val) {
            headers.push(h);
        }
    }

    let reader = upstream.into_reader();
    let resp = tiny_http::Response::new(
        tiny_http::StatusCode(status),
        headers,
        reader,
        cl,
        None,
    );
    let _ = request.respond(resp);
}

fn dispatch_proxy_request(request: tiny_http::Request) {
    if *request.method() == tiny_http::Method::Options {
        let mut resp = tiny_http::Response::empty(204);
        if let Some(h) = header("Access-Control-Allow-Origin", "*") {
            resp.add_header(h);
        }
        if let Some(h) = header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS") {
            resp.add_header(h);
        }
        if let Some(h) = header("Access-Control-Allow-Headers", "*") {
            resp.add_header(h);
        }
        let _ = request.respond(resp);
        return;
    }

    let raw_url = request.url().to_string();
    let (path, query_str) = match raw_url.split_once('?') {
        Some((p, q)) => (p, q),
        None => (raw_url.as_str(), ""),
    };

    let query: HashMap<String, String> = url::form_urlencoded::parse(query_str.as_bytes())
        .into_owned()
        .collect();

    match path {
        "/api/streams/resolve" => handle_resolve_request(request, &query),
        "/api/streams/anime" => handle_anime_request(request, &query),
        "/api/streams/hls" => handle_hls_request(request, &query),
        "/api/streams/seg" => handle_seg_request(request, &query),
        _ => respond_text(request, 404, "text/plain; charset=utf-8", "Not found".into()),
    }
}

fn ensure_proxy_server_started() -> u16 {
    *PROXY_PORT.get_or_init(|| {
        let server = tiny_http::Server::http("127.0.0.1:0")
            .expect("failed to bind local stream proxy");
        let port = server
            .server_addr()
            .to_ip()
            .map(|a| a.port())
            .unwrap_or(0);

        std::thread::spawn(move || {
            for request in server.incoming_requests() {
                std::thread::spawn(move || {
                    dispatch_proxy_request(request);
                });
            }
        });

        port
    })
}

fn normalize_display_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn resolve_default_download_path(app: &AppHandle) -> PathBuf {
    let base_downloads = app
        .path()
        .download_dir()
        .ok()
        .or_else(dirs::download_dir)
        .or_else(|| {
            std::env::var_os("USERPROFILE")
                .or_else(|| std::env::var_os("HOME"))
                .map(|home| PathBuf::from(home).join("Downloads"))
        })
        .unwrap_or_else(|| PathBuf::from("Downloads"));

    let target = base_downloads.join("Movy");
    let _ = fs::create_dir_all(&target);
    target
}

#[tauri::command]
fn get_proxy_origin() -> String {
    let port = ensure_proxy_server_started();
    format!("http://127.0.0.1:{port}")
}

#[tauri::command]
fn get_default_download_dir(app: AppHandle) -> String {
    normalize_display_path(&resolve_default_download_path(&app))
}

#[tauri::command]
async fn pick_download_folder(current_dir: Option<String>) -> Result<Option<String>, String> {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let res = tauri::async_runtime::spawn_blocking(move || {
            let mut dialog = rfd::FileDialog::new().set_title("Choose Download Folder");
            if let Some(dir_str) = current_dir.as_deref() {
                let candidate = PathBuf::from(dir_str);
                if candidate.exists() {
                    dialog = dialog.set_directory(&candidate);
                } else if let Some(parent) = candidate.parent() {
                    if parent.exists() {
                        dialog = dialog.set_directory(parent);
                    }
                }
            }
            dialog.pick_folder().map(|p| normalize_display_path(&p))
        })
        .await
        .map_err(|e| e.to_string())?;
        Ok(res)
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        let _ = current_dir;
        Ok(None)
    }
}

fn strip_video_extension(filename: &str) -> &str {
    for ext in [".mp4", ".mkv", ".ts", ".MP4", ".MKV", ".TS"] {
        if let Some(stem) = filename.strip_suffix(ext) {
            return stem;
        }
    }
    filename
}

fn emit_progress(
    app: &AppHandle,
    id: &str,
    percent: u8,
    label: &str,
    bytes_downloaded: u64,
    total_bytes: Option<u64>,
) {
    let _ = app.emit(
        "download-progress",
        DownloadProgressPayload {
            id: id.to_string(),
            percent,
            label: label.to_string(),
            bytes_downloaded,
            total_bytes,
        },
    );
}

#[tauri::command]
async fn download_file_to_path(
    app: AppHandle,
    state: State<'_, DownloadCancelState>,
    download_id: String,
    url: String,
    save_dir: String,
    filename: String,
) -> Result<TauriDownloadResult, String> {
    let _ = ensure_proxy_server_started();
    let cancel_flag = Arc::new(AtomicBool::new(false));
    {
        let mut guard = state
            .active
            .lock()
            .map_err(|_| "Failed to lock download state".to_string())?;
        guard.insert(download_id.clone(), Arc::clone(&cancel_flag));
    }

    let resolved_dir = if save_dir.trim().is_empty()
        || save_dir.to_ascii_lowercase().contains("%userprofile%")
    {
        resolve_default_download_path(&app)
    } else {
        PathBuf::from(save_dir.trim())
    };

    let app_clone = app.clone();
    let id_clone = download_id.clone();
    let flag_clone = Arc::clone(&cancel_flag);

    let result = tauri::async_runtime::spawn_blocking(move || {
        fs::create_dir_all(&resolved_dir)
            .map_err(|e| format!("Cannot create folder {}: {e}", resolved_dir.display()))?;

        let target_url = resolve_proxy_target(&url);
        let is_hls = target_url.contains("/api/streams/hls")
            || target_url.to_ascii_lowercase().contains(".m3u8");

        if is_hls {
            download_hls_to_disk(
                &app_clone,
                &id_clone,
                &target_url,
                &resolved_dir,
                &filename,
                &flag_clone,
            )
        } else {
            download_direct_to_disk(
                &app_clone,
                &id_clone,
                &target_url,
                &resolved_dir,
                &filename,
                &flag_clone,
            )
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    if let Ok(mut guard) = state.active.lock() {
        guard.remove(&download_id);
    }

    result
}

fn download_hls_to_disk(
    app: &AppHandle,
    download_id: &str,
    initial_url: &str,
    save_dir: &Path,
    filename: &str,
    cancel_flag: &AtomicBool,
) -> Result<TauriDownloadResult, String> {
    let agent = make_agent(25);
    let mut playlist_url = initial_url.to_string();
    let mut playlist_text: String;

    loop {
        if cancel_flag.load(Ordering::Relaxed) {
            return Err("Download cancelled".to_string());
        }
        emit_progress(app, download_id, 2, "Reading HLS playlist...", 0, None);
        let resp = agent
            .get(&playlist_url)
            .call()
            .map_err(|e| format!("Playlist fetch failed: {e}"))?;
        let final_url = resp.get_url().to_string();
        if !final_url.is_empty() {
            playlist_url = final_url;
        }
        playlist_text = resp
            .into_string()
            .map_err(|e| format!("Invalid playlist text: {e}"))?;

        if playlist_text.contains("#EXT-X-STREAM-INF") {
            let base = Url::parse(&playlist_url).map_err(|e| e.to_string())?;
            let lines: Vec<&str> = playlist_text.lines().collect();
            let mut best_url: Option<String> = None;
            let mut best_bw: i64 = -1;
            for i in 0..lines.len() {
                let line = lines[i].trim();
                if line.starts_with("#EXT-X-STREAM-INF") {
                    let bw = extract_bandwidth(line).unwrap_or(0);
                    if let Some(next_line) = lines.get(i + 1) {
                        let next_trim = next_line.trim();
                        if !next_trim.is_empty() && !next_trim.starts_with('#') && bw >= best_bw {
                            if let Ok(abs) = base.join(next_trim) {
                                best_bw = bw;
                                best_url = Some(resolve_proxy_target(abs.as_str()));
                            }
                        }
                    }
                }
            }
            if let Some(next_playlist) = best_url {
                playlist_url = next_playlist;
                continue;
            }
        }
        break;
    }

    let base = Url::parse(&playlist_url).map_err(|e| e.to_string())?;
    let mut init_url: Option<String> = None;
    let mut segment_urls: Vec<String> = Vec::new();

    for line in playlist_text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        if trimmed.starts_with("#EXT-X-MAP:") {
            if let Some(pos) = trimmed.find("URI=\"") {
                let rest = &trimmed[pos + 5..];
                if let Some(end) = rest.find('"') {
                    if let Ok(abs) = base.join(&rest[..end]) {
                        init_url = Some(resolve_proxy_target(abs.as_str()));
                    }
                }
            }
            continue;
        }
        if trimmed.starts_with('#') {
            continue;
        }
        if let Ok(abs) = base.join(trimmed) {
            segment_urls.push(resolve_proxy_target(abs.as_str()));
        }
    }

    if segment_urls.is_empty() {
        return Err("No segments found in HLS playlist".to_string());
    }

    let is_mp4 = init_url.is_some();
    let final_filename = format!(
        "{}.{}",
        strip_video_extension(filename),
        if is_mp4 { "mp4" } else { "ts" }
    );
    let final_path = save_dir.join(&final_filename);
    let part_path = save_dir.join(format!("{final_filename}.part"));

    let file = File::create(&part_path)
        .map_err(|e| format!("Failed creating {}: {e}", part_path.display()))?;
    let mut writer = BufWriter::new(file);
    let mut bytes_downloaded: u64 = 0;

    if let Some(ref init_u) = init_url {
        if let Ok(resp) = agent.get(init_u).call() {
            let mut init_bytes = Vec::new();
            if resp.into_reader().read_to_end(&mut init_bytes).is_ok() {
                if writer.write_all(&init_bytes).is_err() {
                    let _ = fs::remove_file(&part_path);
                    return Err("Failed writing init segment".to_string());
                }
                bytes_downloaded += init_bytes.len() as u64;
            }
        }
    }

    let total_segs = segment_urls.len();
    let mut completed = 0usize;
    const BATCH: usize = 4;

    for chunk in segment_urls.chunks(BATCH) {
        if cancel_flag.load(Ordering::Relaxed) {
            drop(writer);
            let _ = fs::remove_file(&part_path);
            return Err("Download cancelled".to_string());
        }

        let batch_results: Vec<Result<Vec<u8>, String>> = std::thread::scope(|scope| {
            let handles: Vec<_> = chunk
                .iter()
                .map(|seg_url| {
                    scope.spawn(move || -> Result<Vec<u8>, String> {
                        if cancel_flag.load(Ordering::Relaxed) {
                            return Err("Download cancelled".to_string());
                        }
                        let seg_agent = make_agent(25);
                        let resp = seg_agent
                            .get(seg_url)
                            .call()
                            .map_err(|e| format!("Segment failed: {e}"))?;
                        let mut buf = Vec::new();
                        resp.into_reader()
                            .read_to_end(&mut buf)
                            .map_err(|e| format!("Segment read failed: {e}"))?;
                        Ok(buf)
                    })
                })
                .collect();

            handles
                .into_iter()
                .map(|h| {
                    h.join()
                        .unwrap_or_else(|_| Err("Worker thread panicked".to_string()))
                })
                .collect()
        });

        for seg_res in batch_results {
            let seg_bytes = match seg_res {
                Ok(b) => b,
                Err(e) => {
                    drop(writer);
                    let _ = fs::remove_file(&part_path);
                    return Err(e);
                }
            };
            if let Err(e) = writer.write_all(&seg_bytes) {
                drop(writer);
                let _ = fs::remove_file(&part_path);
                return Err(format!("Disk write error: {e}"));
            }
            bytes_downloaded += seg_bytes.len() as u64;
            completed += 1;
        }

        let pct = (((completed as f64) / (total_segs as f64)) * 98.0)
            .round()
            .clamp(1.0, 98.0) as u8;
        emit_progress(
            app,
            download_id,
            pct,
            &format!("Segment {completed} / {total_segs}"),
            bytes_downloaded,
            None,
        );
    }

    writer
        .flush()
        .map_err(|e| format!("Failed flushing file: {e}"))?;
    drop(writer);

    if final_path.exists() {
        let _ = fs::remove_file(&final_path);
    }
    fs::rename(&part_path, &final_path)
        .map_err(|e| format!("Failed saving file: {e}"))?;

    let full_path = normalize_display_path(&final_path);
    emit_progress(
        app,
        download_id,
        100,
        &format!("Saved to {full_path}"),
        bytes_downloaded,
        Some(bytes_downloaded),
    );

    Ok(TauriDownloadResult {
        bytes_downloaded,
        final_filename,
        full_path,
    })
}

fn extract_bandwidth(line: &str) -> Option<i64> {
    let idx = line.find("BANDWIDTH=")?;
    let rest = &line[idx + 10..];
    let digits: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
    digits.parse::<i64>().ok()
}

fn download_direct_to_disk(
    app: &AppHandle,
    download_id: &str,
    target_url: &str,
    save_dir: &Path,
    filename: &str,
    cancel_flag: &AtomicBool,
) -> Result<TauriDownloadResult, String> {
    emit_progress(app, download_id, 5, "Connecting to stream...", 0, None);

    let agent = make_agent(60);
    let resp = agent
        .get(target_url)
        .call()
        .map_err(|e| format!("Download failed: {e}"))?;

    let total_bytes = resp
        .header("content-length")
        .and_then(|s| s.parse::<u64>().ok());

    let final_path = save_dir.join(filename);
    let part_path = save_dir.join(format!("{filename}.part"));

    let file = File::create(&part_path)
        .map_err(|e| format!("Failed creating {}: {e}", part_path.display()))?;
    let mut writer = BufWriter::new(file);
    let mut reader = resp.into_reader();
    let mut buf = [0u8; 65536];
    let mut bytes_downloaded: u64 = 0;
    let mut last_emit = Instant::now();

    loop {
        if cancel_flag.load(Ordering::Relaxed) {
            drop(writer);
            let _ = fs::remove_file(&part_path);
            return Err("Download cancelled".to_string());
        }
        let n = reader
            .read(&mut buf)
            .map_err(|e| format!("Read stream error: {e}"))?;
        if n == 0 {
            break;
        }
        if let Err(e) = writer.write_all(&buf[..n]) {
            drop(writer);
            let _ = fs::remove_file(&part_path);
            return Err(format!("Disk write error: {e}"));
        }
        bytes_downloaded += n as u64;

        if last_emit.elapsed() >= Duration::from_millis(160) {
            let pct = match total_bytes {
                Some(tot) if tot > 0 => (((bytes_downloaded as f64) / (tot as f64)) * 99.0)
                    .round()
                    .clamp(1.0, 99.0) as u8,
                _ => 50,
            };
            let label = match total_bytes {
                Some(_) => format!("Downloading ({pct}%)"),
                None => "Downloading video...".to_string(),
            };
            emit_progress(
                app,
                download_id,
                pct,
                &label,
                bytes_downloaded,
                total_bytes,
            );
            last_emit = Instant::now();
        }
    }

    writer
        .flush()
        .map_err(|e| format!("Failed flushing file: {e}"))?;
    drop(writer);

    if final_path.exists() {
        let _ = fs::remove_file(&final_path);
    }
    fs::rename(&part_path, &final_path)
        .map_err(|e| format!("Failed saving file: {e}"))?;

    let full_path = normalize_display_path(&final_path);
    emit_progress(
        app,
        download_id,
        100,
        &format!("Saved to {full_path}"),
        bytes_downloaded,
        total_bytes.or(Some(bytes_downloaded)),
    );

    Ok(TauriDownloadResult {
        bytes_downloaded,
        final_filename: filename.to_string(),
        full_path,
    })
}

#[tauri::command]
fn cancel_tauri_download(state: State<'_, DownloadCancelState>, download_id: String) {
    if let Ok(guard) = state.active.lock() {
        if let Some(flag) = guard.get(&download_id) {
            flag.store(true, Ordering::Relaxed);
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    ensure_proxy_server_started();

    tauri::Builder::default()
        .manage(DownloadCancelState::default())
        .invoke_handler(tauri::generate_handler![
            get_proxy_origin,
            get_default_download_dir,
            pick_download_folder,
            download_file_to_path,
            cancel_tauri_download
        ])
        .run(tauri::generate_context!())
        .expect("error while running Moviesx application");
}
