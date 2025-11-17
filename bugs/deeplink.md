feature request:

generate a "deep link" which will open my telemetry, that I can share with another person.

## Investigation

- Today’s app runs entirely client-side and never uploads lap files, so there’s nothing on a server to fetch when someone visits a link. A “deep link” therefore needs to encode the necessary state (which laps, settings) directly in the URL, or else require a shared backend.
- The lap files can be large (~12 MB each). Embedding entire lap data in a query param (e.g., base64) is impractical and would exceed URL limits.
- The realistic options:
  1. **State-only deep link**: Encode metadata (track, car, lap signature, view window) but require recipients to have the same files locally. The link would communicate which laps to open and how to configure the view.
  2. **Upload-and-share**: Introduce a backend/storage bucket. When the sender hits “Share,” the app uploads the selected laps (or a merged dataset), returns a short link, and the recipient fetches it. This breaks the current “client-only” privacy model but gives a true one-click experience.
  3. **File hash referencing**: Compute hashes of the lap files and host a public catalogue (out of scope right now). Deep links would reference known hashes; recipients who already have matching files could auto-load them.

## Implementation considerations

- Option 1 could piggyback on `localStorage`: store lap signatures + user-friendly instructions, then build a URL like `?laps=signature1,signature2&window=0.2-0.4`. On load, the app would prompt the user to supply the files matching those signatures. This keeps everything client-side but still requires manual file selection.
- Option 2 needs infrastructure: a simple signed-upload flow (S3, Firebase Storage) plus a lightweight API to map link IDs to stored blobs. Security/privacy policies would need revision.
- Option 3 (lighter deep link) compresses only the data we actually render (distance/time + throttle, brake, speed, steer, gear, rpm, x/y), quantizes it, delta-encodes, gzips, and injects that payload into a base64url query param. Recipients can load the lap directly by expanding the data without hitting a server.
- Regardless of approach, we need a canonical lap signature (already in place) to identify which file the link refers to.

## Status

✅ Completed — active lap can now be shared client-side via quantized/delta-compressed telemetry embedded in a `?share=` query param; recipients decode the payload and see the lap instantly without a backend. (Fine-tuning fidelity vs. URL size is ongoing.)
