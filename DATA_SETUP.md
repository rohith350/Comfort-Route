# Delhi Open Transit Data (OTD) GTFS Data Setup

This application connects directly to official **Delhi Open Transit Data (OTD)** static and real-time feeds from the Government of NCT of Delhi (`https://otd.delhi.gov.in`).

---

## 1. Static GTFS Files Location

The server-side GTFS parser reads from `Frontend/public/gtfs/`:
- `agency.txt` — Delhi Transport Corporation (DTC), DIMTS Cluster, and DMRC Metro Feeder agencies.
- `routes.txt` — All active route numbers (`729`, `534`, `419`, `764`, `OMS`, `GL-23`, `E-44`, etc.).
- `stops.txt` — Delhi bus stop names, IDs, and geographic coordinates.
- `trips.txt` — Scheduled trips across morning, midday, evening, and late-night services.
- `stop_times.txt` — Scheduled arrival/departure sequences and headways.

> [!NOTE]
> Pre-indexed, authentic GTFS files are bundled inside `Frontend/public/gtfs/`. You can also replace them at any time with the latest complete dump from [otd.delhi.gov.in](https://otd.delhi.gov.in/data/static/GTFS.zip).

---

## 2. Live GTFS-Realtime Stream (`VehiclePositions.pb`)

To enable live GPS vehicle tracking from active Delhi buses on the map:
1. Register for an API key at [Delhi Open Transit Data Portal](https://otd.delhi.gov.in/).
2. Create `Frontend/.env.local` and add:
   ```env
   DELHI_OTD_API_KEY=your_delhi_otd_api_key_here
   ```
3. Restart the dev server (`npm run dev`).
4. The dashboard will automatically display the **`LIVE OTD STREAM`** emerald badge, decoding binary protobuf telemetry every 10 seconds.
5. If no API key is set, the system seamlessly falls back to **`GTFS SCHEDULE + LIVE TRAFFIC`** using real timetable headways and OSRM road velocity.
