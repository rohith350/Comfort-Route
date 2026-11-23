# Comfort-Route Backend (Delhi Transit)

A production-ready, crowdedness-aware journey planning API for Delhi transit built with Node.js and Express (ES Modules). Designed for hackathon MVPs and multimodal transit interfaces.

---

## Features
- **4 Curated Delhi Corridors:** Real GPS coordinates, scheduled headways, and Metro interchange indicators (`is_metro`).
- **Competing Route Trade-Offs:** Every corridor offers a fast arterial route (faster ETA, higher load) and a low-crowd alternative or transfer route (5–10 mins slower, higher comfort score).
- **Realistic Scoring Engine:** Deterministic stop-by-stop passenger load propagation with:
  - **Temporal Peak Curves:** Morning rush (08:30–11:00, peak at 09:30 with +35%), evening rush (17:30–20:30, peak at 18:30 with +40%), and afternoon off-peak (13:00–15:30 with +5%).
  - **Metro Interchange Spikes:** +18% load penalty at metro connections + stop base density weights.
  - **Passenger Carry-Over & Terminal Tapering:** Realistic boarding carry-over across consecutive stops with alighting tapering near terminal destinations.
  - **Headway Penalty:** Penalizes low-frequency buses (`min(20, max(0, (headway - 5) * 1.5))`).
  - **Crowdsource Feedback Loop & Cascading:** Supports real-time user reports (`LOW`: -15%, `MEDIUM`: +5%, `HIGH`: +25%) cascading 50% of the offset across the next 2 downstream stops.
  - **Dynamic Route Badging:** Evaluates routes and automatically badges them as `FASTEST`, `MOST COMFORTABLE`, `OPTIMAL`, or `ALTERNATE`.

---

## Project Structure

```text
Comfort-Route/
├── data/
│   └── corridors.json          # Curated dataset of 4 Delhi corridors & stops
├── routes/
│   └── transitRoutes.js        # Express routes for stops, planning, and crowdsourcing
├── services/
│   ├── crowdStore.js           # In-memory crowdsourced reports store
│   └── scoringEngine.js        # Stop-by-stop load propagation & comfort scoring engine
├── test/
│   ├── test_backend.js         # Unit tests for scoring engine & dataset
│   └── test_api_integration.js # Integration tests for HTTP endpoints
├── package.json                # Project dependencies and scripts (ES Modules)
├── server.js                   # Main Express application entrypoint
└── README.md                   # Documentation & API reference
```

---

## Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Server
```bash
npm start
```
The server will start on port `5000` (or `process.env.PORT`).

### 3. Run Automated Tests
```bash
npm test
```

---

## API Reference

### 1. Health Check
- **Endpoint:** `GET /health`
- **Response:**
  ```json
  { "status": "ok" }
  ```

---

### 2. Get Available Transit Stops
Populates Origin and Destination dropdowns on the frontend.
- **Endpoint:** `GET /api/stops`
- **Response:**
  ```json
  [
    {
      "id": "uttam_nagar",
      "name": "Uttam Nagar",
      "lat": 28.6219,
      "lng": 77.0583,
      "is_metro": true
    },
    {
      "id": "rajouri_garden",
      "name": "Rajouri Garden",
      "lat": 28.6492,
      "lng": 77.1225,
      "is_metro": true
    }
  ]
  ```

---

### 3. Plan Journey & Score Routes
- **Endpoint:** `GET /api/plan?origin=<id>&destination=<id>&time=<HH:MM>`
- **Parameters:**
  - `origin` (required): Origin stop ID (e.g. `uttam_nagar`)
  - `destination` (required): Destination stop ID (e.g. `connaught_place`)
  - `time` (optional, default: `"09:15"`): 24-hour departure time string `"HH:MM"`
- **Sample Request:**
  ```bash
  curl "http://localhost:5000/api/plan?origin=uttam_nagar&destination=connaught_place&time=09:15"
  ```
- **Sample Response:**
  ```json
  {
    "query": {
      "origin": "Uttam Nagar",
      "destination": "Connaught Place",
      "time": "09:15"
    },
    "routes": [
      {
        "id": "route_729",
        "name": "Route 729 Direct",
        "tag": "FASTEST",
        "bus_numbers": ["729"],
        "eta_minutes": 42,
        "transfers": 0,
        "headway_mins": 14,
        "overall_occupancy_pct": 89,
        "status": "RED",
        "comfort_score": 11,
        "stops": [
          {
            "id": "uttam_nagar",
            "name": "Uttam Nagar",
            "lat": 28.6219,
            "lng": 77.0583,
            "load_pct": 65,
            "is_metro": true
          },
          {
            "id": "janakpuri_east",
            "name": "Janakpuri East",
            "lat": 28.6289,
            "lng": 77.0787,
            "load_pct": 85,
            "is_metro": true
          }
        ]
      },
      {
        "id": "route_740_522",
        "name": "Route 740 + 522 (Transfer at Dhaula Kuan)",
        "tag": "MOST COMFORTABLE",
        "bus_numbers": ["740", "522"],
        "eta_minutes": 50,
        "transfers": 1,
        "headway_mins": 7,
        "overall_occupancy_pct": 58,
        "status": "YELLOW",
        "comfort_score": 32,
        "stops": [...]
      }
    ]
  }
  ```

---

### 4. Submit Real-Time Crowd Report
- **Endpoint:** `POST /api/report-crowd`
- **Headers:** `Content-Type: application/json`
- **Body:**
  ```json
  {
    "route_id": "route_729",
    "stop_id": "rajouri_garden",
    "reported_level": "HIGH"
  }
  ```
  *(Supported levels: `"LOW"`: -15%, `"MEDIUM"`: +5%, `"HIGH"`: +25% offset with 50% cascade to the next 2 downstream stops)*
- **Response:**
  ```json
  {
    "success": true,
    "message": "Crowd report recorded",
    "active_reports_count": 1
  }
  ```

---

### 5. Reset In-Memory Crowd Reports
Quickly reset in-memory state during hackathon demos.
- **Endpoint:** `POST /api/reset`
- **Response:**
  ```json
  {
    "success": true,
    "message": "In-memory crowd reports reset",
    "active_reports_count": 0
  }
  ```

---

## Supported Corridors
| Origin | Destination | Direct Route (Fastest) | Alternate Route (Most Comfortable) |
| :--- | :--- | :--- | :--- |
| `uttam_nagar` | `connaught_place` | Route `729` (42m, RED) | Route `740 + 522` via Dhaula Kuan (50m, YELLOW) |
| `kashmere_gate` | `nehru_place` | Route `429` (48m, RED) | Route `419` via Ring Road (56m, YELLOW) |
| `anand_vihar` | `saket` | Route `534` (54m, RED) | Route `543` via Barapullah (62m, YELLOW) |
| `hauz_khas` | `rajiv_chowk` | Route `505` (35m, RED) | Route `522A` via Siri Fort & Lodhi (43m, GREEN/YELLOW) |

---

## License
MIT
