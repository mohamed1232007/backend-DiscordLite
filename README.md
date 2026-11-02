# Backend

## LiveKit calling

Calls use a LiveKit SFU. Configure these variables in the backend deployment environment before enabling calls:

- `LIVEKIT_URL` — the LiveKit server URL, for example `wss://<project>.livekit.cloud`
- `LIVEKIT_API_KEY` — the LiveKit API key
- `LIVEKIT_API_SECRET` — the matching API secret

Keep the API key and secret on the backend; do not add them to frontend variables or commit them. The authenticated `POST /api/calls/:roomId/token` endpoint issues short-lived room tokens only to active call participants. It returns `503` until all three LiveKit variables are configured.

The Windows app still uses the secure system screen-capture chooser to confirm the exact monitor or window. The in-app picker selects the source type and introduces that system step; Windows/WebView does not expose a supported way for the app to silently select a specific capture source.
