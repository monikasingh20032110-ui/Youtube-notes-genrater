import requests
import re
import json
import xml.etree.ElementTree as ET

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Accept-Language": "en-US,en;q=0.9"
}

def get_transcript_via_web(video_id):
    url = f"https://www.youtube.com/watch?v={video_id}"
    resp = requests.get(url, headers=HEADERS, timeout=10)
    html = resp.text

    # Extract ytInitialPlayerResponse
    match = re.search(r"ytInitialPlayerResponse\s*=\s*({.+?});(?:var|\s*<\/script>)", html)
    if not match:
        # Try second pattern
        match = re.search(r"ytInitialPlayerResponse\s*=\s*({.+?});", html)

    if not match:
        return {"success": False, "error": "Could not find ytInitialPlayerResponse"}

    try:
        data = json.loads(match.group(1))
    except Exception as e:
        return {"success": False, "error": f"JSON parse error: {e}"}

    captions = data.get("captions", {}).get("playerCaptionsTracklistRenderer", {}).get("captionTracks", [])
    if not captions:
        return {"success": False, "error": "No captionTracks in player response"}

    # Pick English or first track
    selected_track = None
    for track in captions:
        if track.get("languageCode") in ["en", "en-US", "en-GB"]:
            selected_track = track
            break
    if not selected_track:
        selected_track = captions[0]

    base_url = selected_track.get("baseUrl")
    if not base_url:
        return {"success": False, "error": "No baseUrl for caption track"}

    # Fetch caption XML
    cap_resp = requests.get(base_url, headers=HEADERS, timeout=10)
    if cap_resp.status_code != 200:
        return {"success": False, "error": f"Failed to download captions: {cap_resp.status_code}"}

    # Parse XML
    root = ET.fromstring(cap_resp.text)
    segments = []
    full_text_parts = []
    total_duration = 0.0

    for child in root.findall("text"):
        start = float(child.attrib.get("start", 0.0))
        dur = float(child.attrib.get("dur", 0.0))
        text = (child.text or "").replace("&#39;", "'").replace("&quot;", '"').replace("&amp;", "&").strip()
        if not text:
            continue
        total_duration = max(total_duration, start + dur)
        timestamp_str = f"{int(start)//60:02d}:{int(start)%60:02d}"
        segments.append({"start": start, "duration": dur, "timestamp": timestamp_str, "text": text})
        full_text_parts.append(f"[{timestamp_str}] {text}")

    return {
        "success": True,
        "segments_count": len(segments),
        "total_duration": total_duration,
        "sample": full_text_parts[:3]
    }

if __name__ == '__main__':
    for vid in ["fNk_zzaMoSs", "tpIctyqH29Q", "aircAruvnKk"]:
        print(f"Testing {vid}...")
        res = get_transcript_via_web(vid)
        print("  Result:", res.get("success"), res.get("segments_count"), res.get("sample"), res.get("error"))
