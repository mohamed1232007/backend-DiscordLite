# Backend

## LiveKit calling

Calls use a LiveKit SFU. Configure these variables in the backend deployment environment before enabling calls:

- `LIVEKIT_URL` — the LiveKit server URL, for example `wss://<project>.livekit.cloud`
- `LIVEKIT_API_KEY` — the LiveKit API key
- `LIVEKIT_API_SECRET` — the matching API secret

Keep the API key and secret on the backend; do not add them to frontend variables or commit them. The authenticated `POST /api/calls/:roomId/token` endpoint issues short-lived room tokens only to active call participants. It returns `503` until all three LiveKit variables are configured.

In the Windows desktop app, the in-app picker enumerates displays and application windows directly. A dedicated native LiveKit publisher captures video with Windows Graphics Capture and system-output audio with WASAPI loopback, using a separate `<user-id>:screen` identity so screen publishing does not replace the user's voice participant. The screen-publisher token is issued only to an active call participant and cannot subscribe to tracks. The browser build continues to use its secure system screen-capture chooser.
