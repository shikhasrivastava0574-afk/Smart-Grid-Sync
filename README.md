# Smart Grid Sync: Full-Stack AI-Driven Grid Optimization

Smart Grid Sync is a dynamic, production-scale full-stack framework showing the convergence of machine learning, time-series forecasting, smart grid analytics, and sustainability. The application features a multithreaded **Python FastAPI backend**, a **relational database (SQLite)**, and **custom machine learning forecasting models built from scratch in NumPy**.

🎯 **Live Repository**: [https://github.com/shikhasrivastava0574-afk/Smart-Grid-Sync](https://github.com/shikhasrivastava0574-afk/Smart-Grid-Sync)

---

## Technical Architecture

The framework is decoupled into a clear client-server architecture:

```
├── backend/
│   ├── app/
│   │   ├── ml/
│   │   │   └── predictor.py   <-- Custom NumPy ML algorithms from scratch
│   │   ├── database.py        <-- SQLite database initialization and sessions
│   │   ├── main.py            <-- FastAPI endpoints & multithreaded simulator daemon
│   │   ├── schemas.py         <-- Pydantic request/response validation schemas
│   │   └── simulator.py       <-- Grid state logic (battery, pricing, load curves)
│   └── requirements.txt       <-- Python dependency library configurations
└── frontend/
    ├── index.html             <-- UI layout for KPI readouts and SVG chart canvases
    ├── styles.css             <-- Glassmorphic dark theme and glows
    └── app.js                 <-- AJAX fetch API client and SVG charting engine
```

### 1. High-Performance Python Backend
* Powered by **FastAPI** and **Uvicorn** for high-throughput concurrency.
* Exposes RESTful endpoints to adjust parameters, fetch metrics, train models, and load predictions.
* Advances the grid timeline inside a background daemon thread, recording metrics to database tables.

### 2. Active Relational Database Layer
* Employs Python's standard `sqlite3` module to record grid metrics (`grid_metrics` table) every 10 simulated minutes.
* Resolves package compilation and version conflicts on **Python 3.14** by avoiding heavy external ORMs.
* Swappable to **PostgreSQL** in production by editing the connection string in `database.py`.

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
Install the lightweight requirements and launch the FastAPI server:
```bash
# Install dependencies
pip install -r backend/requirements.txt

# Start FastAPI application
python3 -m uvicorn backend.app.main:app --port 8000
```
The interactive API documentation will be available at **[http://localhost:8000/docs](http://localhost:8000/docs)**.

### 2. Serve the Frontend Dashboard
In a new terminal window, serve the frontend files:
```bash
# Serve frontend folder
python3 -m http.server 8080 --directory frontend
```
Open your browser and navigate to:
👉 **[http://localhost:8080](http://localhost:8080)**
