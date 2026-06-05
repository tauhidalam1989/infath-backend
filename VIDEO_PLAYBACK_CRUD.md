# Video Playback CRUD API

## Base URL
```
http://localhost:3000/api/screens
```

---

## 1. Play Video (CREATE)
**POST** `/api/screens/:id/play`

### Request
```json
{
  "videoUrl": "https://example.com/video.mp4",
  "videoTitle": "My Video Title"
}
```

### Response (Success)
```json
{
  "success": true,
  "message": "Video playing on Screen Name via ADB"
}
```

### Response (Error)
```json
{
  "success": false,
  "message": "Could not play video on Screen Name"
}
```

---

## 2. Get Playing Video (READ)
**GET** `/api/screens/:id/playing`

### Response
```json
{
  "isPlaying": true,
  "videoUrl": "https://example.com/video.mp4",
  "videoTitle": "My Video Title",
  "startedAt": "2025-12-08T23:40:00.000Z"
}
```

### Response (Not Playing)
```json
{
  "isPlaying": false
}
```

---

## 3. Stop Video (DELETE)
**POST** `/api/screens/:id/stop`

### Response (Success)
```json
{
  "success": true,
  "message": "Video stopped on Screen Name"
}
```

### Response (Error)
```json
{
  "success": false,
  "message": "Failed to stop video"
}
```

---

## Example Usage

### Play Video
```bash
curl -X POST http://localhost:3000/api/screens/1/play \
  -H "Content-Type: application/json" \
  -d '{
    "videoUrl": "https://example.com/video.mp4",
    "videoTitle": "My Video"
  }'
```

### Get Playing Video
```bash
curl http://localhost:3000/api/screens/1/playing
```

### Stop Video
```bash
curl -X POST http://localhost:3000/api/screens/1/stop
```

---

## Notes
- `videoUrl` is **required** for play endpoint
- `videoTitle` is **optional**
- Screen `id` must be a valid registered screen ID
- Supports YouTube URLs, Vimeo URLs, and direct video file URLs

