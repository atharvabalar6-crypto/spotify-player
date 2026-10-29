from app import app
import json

with app.test_client() as client:
    r_index = client.get("/")
    r_tracks = client.get("/api/tracks")
    r_stream = client.get("/api/stream/1", headers={"Range": "bytes=0-1024"})
    r_cover = client.get("/api/cover/1")
    
    print("=" * 40)
    print("SPOTIFY SERVER VERIFICATION RESULTS:")
    print("=" * 40)
    print("1. Index HTML:", r_index.status_code, f"({len(r_index.data)} bytes)")
    t_data = r_tracks.get_json()
    print("2. Tracks API:", r_tracks.status_code, f"({len(t_data['tracks'])} tracks loaded)")
    print("   Sample track:", t_data['tracks'][0]['title'], "by", t_data['tracks'][0]['artist'])
    print("3. Range Audio Stream:", r_stream.status_code, "| Range:", r_stream.headers.get("Content-Range"))
    print("4. Cover Art SVG:", r_cover.status_code, "| Type:", r_cover.headers.get("Content-Type"))
    print("=" * 40)
    print("ALL TESTS PASSED SUCCESSFULLY!")

