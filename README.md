# Smart Grid Sync: Full-Stack AI-Driven Grid Optimization Framework

Smart Grid Sync is a dynamic, production-scale full-stack framework showcasing the convergence of machine learning, time-series forecasting, smart grid analytics, and sustainability. The application features a multithreaded **Python Standard HTTP Server backend**, an **active relational database (SQLite)**, a custom **JavaScript SVG-charting frontend**, and **custom machine learning forecasting models built from scratch in NumPy**.

The framework is localized to reflect standard Indian electrical grid infrastructure, regulatory tariff structures, and dynamic price-elastic consumer demand response mechanisms.

---

## 🎯 Access & Links

* 💻 **Live Dashboard URL**: [https://shikhasrivastava0574-afk.github.io/Smart-Grid-Sync/frontend/](https://shikhasrivastava0574-afk.github.io/Smart-Grid-Sync/frontend/)
* ⚙️ **Deployed API Backend**: [https://smart-grid-sync-1.onrender.com](https://smart-grid-sync-1.onrender.com)
* 📂 **Active Database File**: [grid_data.db](file:///Users/shikhasrivastava/.gemini/antigravity/scratch/smart-grid-sync/grid_data.db)

---

## 🏗️ Technical Architecture & File Layout

The codebase is structured into clean decoupling layers:

```
├── backend/
│   ├── app/
│   │   ├── ml/
│   │   │   └── predictor.py   <-- NumPy ML models, sequence generation, & predictors
│   │   ├── database.py        <-- relational SQLite3 DB initialization & sessions
│   │   ├── main.py            <-- HTTP Server, multithreaded simulator, & REST routes
│   │   └── simulator.py       <-- Grid state physics (battery, frequency, pricing)
│   └── requirements.txt       <-- Python environment configuration (numpy)
├── frontend/
│   ├── index.html             <-- Dashboard DOM layout & glassmorphic containers
│   ├── styles.css             <-- Dark glow filters, animations, & responsive grids
│   └── app.js                 <-- AJAX REST fetch client & custom SVG charting engine
├── app.py                     <-- Streamlit sidebar controller & what-if simulator
├── pricing_engine.py          <-- Time-of-Day tariffs & monthly slab billing calculators
├── generate_data.py           <-- Synthetic hourly weather & load profile generator
└── train_models.py            <-- Offline model training & validation pipeline
```

### 1. High-Performance Python Backend ([main.py](file:///Users/shikhasrivastava/.gemini/antigravity/scratch/smart-grid-sync/backend/app/main.py))
* Powered by the Python standard-library `http.server` module for zero-dependency, frame-rate independent execution.
* Completely resolves package compilation and version conflicts on **Python 3.14** by avoiding third-party REST frameworks (like FastAPI).
* Exposes standard RESTful API endpoints for grid status, transaction history logs, forecast loops, and trend aggregations.
* Advances the grid timeline inside a background daemon thread, updating battery state, environmental physics, and recording telemetry metrics to database tables.

### 2. Active Relational Database Layer ([database.py](file:///Users/shikhasrivastava/.gemini/antigravity/scratch/smart-grid-sync/backend/app/database.py))
* Employs Python's standard `sqlite3` module to record grid metrics (`grid_metrics` table) every 10 simulated minutes.
* Automatically prunes local history to keep the database footprint lightweight (holds last 144 records representing 24 hours).

### 3. Custom NumPy Machine Learning from Scratch ([predictor.py](file:///Users/shikhasrivastava/.gemini/antigravity/scratch/smart-grid-sync/backend/app/ml/predictor.py))
To bypass heavy, compiler-dependent ML library installations, the forecasting regressors are coded in **pure NumPy**:
* **LSTM Representation (`PureMLP`)**: Feedforward Multi-Layer Perceptron neural network utilizing Xavier/Glorot weight initializations, a ReLU hidden activation layer (32 nodes), and backpropagation gradient updates via the **Adam Optimizer**.
* **XGBoost Representation (`PureDecisionTree`)**: A decision tree regressor using variance-reduction splitting search. Replicates XGBoost stair-step forecasting predictions.
* **Baseline (`PureRidge`)**: Linear Ridge regression solving L2 regularized normal equations:
  $$\beta = (X^T X + \alpha I)^{-1} X^T Y$$

---

## 🇮🇳 Indian Grid Standards & Localization

To act as a realistic grid optimization platform, the simulator integrates physical and economic guidelines unique to the Indian power grid:

### 1. Indian Power Grid Standard Frequency (50.00 Hz)
* Aligns with the standard Indian operating frequency of **50.00 Hz** (mandated under the Indian Electricity Grid Code, IEGC).
* Implements dynamic swings based on load imbalances:
  $$\text{Frequency} = 50.00 - \left(\frac{\text{Actual Load} - \text{Total Supply}}{500}\right) \pm \text{Random Noise}$$
* Safely clamps simulated frequency ranges between **49.10 Hz** and **50.80 Hz**.

### 2. Time-of-Day (ToD) Electricity Tariffs
* Models peak and off-peak surcharges common in Indian state utility directives:
  * **Off-Peak Night hours (22:00 to 06:00)**: Receives a rebate of **₹1.50/unit** (rate drops to ~₹4.50/kWh).
  * **Morning Peak hours (09:00 to 12:00)**: Receives a surcharge of **+₹1.50/unit** (rate hikes to ~₹7.70/kWh).
  * **Evening Peak hours (18:00 to 22:00)**: Receives a heavy surcharge of **+₹2.50/unit** (rate peaks up to ₹13.00–₹14.00/kWh).
  * **Normal hours**: Remains at base retail tariff rate (₹6.20/kWh).

### 3. Cumulative Utility Slab Billing Projection
* Computes cumulative monthly electricity bills based on standard Indian residential slab brackets:
  * **0 - 100 units (kWh)**: ₹4.50/unit
  * **101 - 300 units (kWh)**: ₹8.50/unit
  * **301 - 500 units (kWh)**: ₹12.00/unit
  * **Above 500 units (kWh)**: ₹15.00/unit

### 4. Dynamic Price-Elastic Demand Response (DR)
* Models dynamic consumer reaction to real-time pricing signals:
  * **Critical Peaks (> ₹12.00/kWh)**: Triggers an automatic **15% load contraction** (smart load-shedding).
  * **Normal Peaks (> ₹9.00/kWh)**: Triggers an automatic **8% load contraction**.
  * **Off-Peak Surplus (< ₹5.00/kWh)**: Triggers an automatic **5% load expansion** (simulating EV charging triggers).

---

## 📈 Advanced Grid Analytics

### 1. Statistical Anomaly Detection
* Automatically evaluates active grid health parameters every simulated minute:
  * *Frequency Anomalies*: Flagged when grid frequency drifts outside safety limits (`< 49.85 Hz` or `> 50.15 Hz`).
  * *Load Anomalies*: Flagged when actual power demand spikes or drops beyond standard thresholds (`> 1.35x` or `< 0.65x` of base load).
* **SVG Indicators**: Blinks red pulsing circle overlay markers on the SVG charts. Hovering over a dot shows interactive tooltips containing exact load, frequency, and time diagnostics.

### 2. Historical Trend Insights
* Compiled by the `/api/grid/trends` endpoint querying SQLite database logs:
  * **Peak Demand Time**: Identifies the timestamp of maximum historical load.
  * **Avg / Peak Load ratio**: Measures grid load factor characteristics.
  * **Grid Stability Factor**: Evaluates standard deviation of frequency fluctuations into a rating percentage.
  * **Active Anomalies**: Aggregates the total number of grid instability events logged in the last 24 hours.

### 3. Personalized Recommendations Engine
* The UI advisory board processes current metrics and outputs context-aware actions containing dynamic savings in Rupees:
  * **Demand Response Advice**: Computes how many MW and Rupees/hour are saved by shifting 15% of current peak load to off-peak night slots:
    $$\text{Savings/hour} = (\text{Current Load} \times 0.15) \times 1000 \times (\text{Peak Price} - 4.50)$$
  * **Battery Arbitrage Advisor**: Computes the hourly savings rate when drawing from storage batteries during peak hours instead of purchasing peak grid energy.

---

## 🔌 Decoupled API Specifications

### GET Endpoint Routes
* **`GET /api/grid/status`**: Returns current real-time grid metrics (load, frequency, battery charge, dynamic price, active anomaly tags, status messages).
* **`GET /api/grid/history`**: Returns a JSON array containing the last 144 logged history entries (24h of data) to render the SVG dispatch chart.
* **`GET /api/grid/forecast`**: Computes and returns a 24-step horizon forecast array for demand, solar output, and pricing.
* **`GET /api/grid/trends`**: Aggregates SQLite logs to calculate peak times, stability factor, and active anomaly counts.

### POST Endpoint Routes
* **`POST /api/grid/control`**: Updates ambient temperature, cloud cover, wind speed, and battery charging modes.
  * *Payload*: `{ "temperature": 24.0, "cloud_cover": 15.0, "wind_speed": 5.5, "battery_mode": "auto" }`
* **`POST /api/grid/scenario`**: Triggers environmental scenario overrides.
  * *Payload*: `{ "scenario": "heatwave" }` (options: `normal`, `heatwave`, `cloudy`, `storm`, `congestion`)
* **`POST /api/ml/train`**: Triggers the training pipeline thread for the selected model.
  * *Payload*: `{ "model": "lstm" }` (options: `lstm`, `xgboost`, `linear`)

---

## 🚀 Getting Started (Local Execution)

### 1. Setup Python Environment
Navigate to the root directory and install dependencies:
```bash
cd Smart-Grid-Sync
pip install -r backend/requirements.txt
```

### 2. Start the Backend API Server
Launch the Python backend daemon (runs on `http://127.0.0.1:8000`):
```bash
python3 -m backend.app.main
```

### 3. Start the Frontend Dashboard Server
Serve the frontend HTML/CSS/JS files using Python's built-in HTTP server (runs on `http://localhost:8080`):
```bash
python3 -m http.server 8080 --directory frontend
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser.

### 4. Start the Streamlit Dashboard (Optional)
Run the what-if simulation Streamlit panel (runs on `http://localhost:8501`):
```bash
streamlit run app.py
```
