# Road SOS: Real-Time Traffic Architecture

This document describes the completely rebuilt, open-source, zero-cost traffic layer for Road SOS.

## 1. System Overview

The legacy implementation relied on a public OSRM demo server and static Overpass data. The new system is a true **crowd-sourced telemetry engine** that ingests anonymized GPS probes from users in "Driving Mode", map-matches them to OpenStreetMap (OSM) ways using a self-hosted OSRM instance, and computes real-time congestion segments.

```mermaid
graph TD
    Client[Mobile Client (Driving Mode)]
    API[Express Backend]
    OSRM[Self-Hosted OSRM]
    DB[(Supabase Postgres)]
    SocketIO[Socket.IO Server]
    Overpass[Overpass API (Static)]

    Client -- "POST /probe (lat, lng, speed)" --> API
    API -- "/match (Snap to road network)" --> OSRM
    API -- "Buffer (5 min window)" --> API
    API -- "Flush every 30s" --> DB
    
    DB -- "ON CONFLICT UPDATE" --> DB
    
    Client -- "GET /overview" --> API
    API -- "Fetch live segments" --> DB
    API -- "Fetch static hazards" --> Overpass
    API -- "Fetch routes" --> OSRM
    API -- "Response" --> Client
    
    DB -- "Trigger" --> SocketIO
    SocketIO -- "traffic:update" --> Client
```

## 2. Probe Ingestion & Map-Matching

When a user enables Driving Mode, their phone sends a telemetry probe (latitude, longitude, speed in km/h, and an anonymous session ID) every 10-15 seconds.

1. **Outlier Rejection**: Speeds < 0 or > 200 km/h are immediately dropped.
2. **Map-Matching**: The raw GPS coordinates are sent to the self-hosted OSRM `/match` endpoint with `radiuses=25` to snap the point to the nearest logical road segment (OSM Way ID).
3. **Z-Score Filtering**: To prevent GPS jitter from ruining averages, a rolling standard deviation is kept per way ID. If a probe deviates more than 3 standard deviations from the mean of the current 5-minute window, it is dropped.
4. **Aggregation**: The valid speed is added to an in-memory ring buffer for that specific `wayId`.

## 3. Congestion Scoring & Sparse Data

Every 30 seconds, the backend flushes the in-memory aggregates to the Supabase `traffic_segments` table. 

**Congestion Ratio** = `Average Probe Speed` / `Free Flow Speed`
- Free-flow speeds are based on OSM highway classes (e.g., motorway=80km/h, residential=25km/h).
- Ratio >= 0.75 → `Low` congestion
- 0.4 <= Ratio < 0.75 → `Moderate` congestion
- Ratio < 0.4 → `High` congestion

**Sparse Data Handling (Cold Start)**:
If a segment has fewer than 3 samples in the 5-minute window, it is marked with `data_source: 'estimated'`. The UI displays a warning badge indicating that the data is an estimate based on road class rather than live telemetry.

## 4. Crowd-Reported Incidents

Users can report hazards (potholes, accidents, police, etc.) via `POST /api/traffic/report`.

- **Lifecycle**: Reports are created in the `reported_incidents` table with a default expiration of 90 minutes.
- **Confirmation**: Other nearby users can tap "Confirm". This hits `POST /api/traffic/report/:id/confirm`, incrementing `confirm_count` and extending the expiration by 30 minutes (capped at 4 hours total).
- **Socket Push**: New reports and confirmations are instantly broadcast to nearby clients via Socket.IO.

## 5. Privacy & DPDP Act 2023 Compliance

- **No Raw Persistence**: Raw lat/lng probe data is never stored in the database. Only the aggregated averages per `way_id` are persisted to `traffic_segments`.
- **Anonymity**: The client generates a random UUID (`sessionId`) stored in `sessionStorage` for the duration of the trip. It is rotated when driving mode stops. It is never linked to the authenticated user ID.
- **Hashing**: For crowd reports, the anonymous `sessionId` is SHA-256 hashed before insertion as `reported_by` to prevent cross-referencing.

## 6. Self-Hosted Infra

The system relies on a local OSRM (Open Source Routing Machine) Docker container loaded with an India OSM extract.

- `docker-compose.yml` runs the `osrm/osrm-backend` image.
- `scripts/setup-osrm.sh` downloads the `.osm.pbf` file, extracts, partitions, and customizes it using the `car` profile.
