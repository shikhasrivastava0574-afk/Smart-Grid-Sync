# Smart Grid Sync: Full-Stack AI-Driven Grid Optimization

Smart Grid Sync is a dynamic, production-scale full-stack framework showing the convergence of machine learning, time-series forecasting, smart grid analytics, and sustainability. The application features a multithreaded **Python Standard HTTP server backend**, a **relational database (SQLite)**, and **custom machine learning forecasting models built from scratch in NumPy**.

🎯 **GitHub Repository**: [https://github.com/shikhasrivastava0574-afk/Smart-Grid-Sync](https://github.com/shikhasrivastava0574-afk/Smart-Grid-Sync)

💻 **Live Dashboard URL**: [https://shikhasrivastava0574-afk.github.io/Smart-Grid-Sync/frontend/](https://shikhasrivastava0574-afk.github.io/Smart-Grid-Sync/frontend/)

---

## Technical Architecture

The framework is decoupled into a clear client-server architecture:

```
├── backend/
│   ├── app/
│   │   ├── ml/
│   │   │   └── predictor.py   <-- Custom NumPy ML algorithms from scratch
│   │   ├── database.py        <-- SQLite database initialization and sessions
│   │   ├── main.py            <-- Custom HTTP server & multithreaded simulator daemon
│   │   ├── schemas.py         <-- Request/response validation schemas
│   │   └── simulator.py       <-- Grid state logic (battery, pricing, load curves)
│   └── requirements.txt       <-- Python dependency library configurations (numpy)
└── frontend/
    ├── index.html             <-- UI layout for KPI readouts and SVG chart canvases
    ├── styles.css             <-- Glassmorphic dark theme and glows
    └── app.js                 <-- AJAX fetch API client and SVG charting engine
```

### 1. High-Performance Python Backend
* Powered by the Python standard-library `http.server` module for zero-dependency, frame-rate independent execution.
* Completely resolves package compilation and version conflicts on **Python 3.14** by avoiding third-party REST frameworks (like FastAPI).
* Exposes standard RESTful API endpoints for grid status, transactions, and forecast loops.
* Advances the grid timeline inside a background daemon thread, recording metrics to database tables.

### 2. Active Relational Database Layer
* Employs Python's standard `sqlite3` module to record grid metrics (`grid_metrics` table) every 10 simulated minutes.
* Automatically prunes local history to keep the database footprint lightweight.

### 3. Custom NumPy Machine Learning from Scratch
To bypass heavy, compiler-dependent ML library installations, the forecasting regressors are coded in **pure NumPy**:
* **LSTM Representation (`PureMLP`)**: Feedforward Multi-Layer Perceptron neural network utilizing Glorot weight initializations, a ReLU hidden activation layer (32 nodes), and backpropagation gradient updates.
* **XGBoost Representation (`PureDecisionTree`)**: A decision tree regressor using variance-reduction splitting search. Replicates XGBoost stair-step forecasting predictions.
* **Baseline (`PureRidge`)**: Linear Ridge regression solving L2 regularized normal equations.

---

## Getting Started

### Prerequisites
Make sure you have Python 3 installed. Navigate to the project root:
```bash
cd Smart-Grid-Sync
```

### 1. Start the Backend Server
Install the lightweight requirements and launch the Python backend daemon:
```bash
# Install dependencies (numpy)
pip install -r backend/requirements.txt

# Start Python standard-library API server
python3 -m backend.app.main
```
The API server will listen on **`http://localhost:8000`**.

### 2. Serve the Frontend Dashboard
To run the dashboard locally, serve the frontend files using Python's built-in HTTP server:
```bash
# Serve frontend folder
python3 -m http.server 8080 --directory frontend
```
Open your browser and navigate to:
👉 **[http://localhost:8080](http://localhost:8080)**

Alternatively, you can visit the live GitHub Pages dashboard:
👉 **[https://shikhasrivastava0574-afk.github.io/Smart-Grid-Sync/frontend/](https://shikhasrivastava0574-afk.github.io/Smart-Grid-Sync/frontend/)**

*Note: Since the backend runs locally on your machine, both the local server and the live GitHub Pages website will connect to your local backend at `http://localhost:8000` via CORS preflight headers.*
