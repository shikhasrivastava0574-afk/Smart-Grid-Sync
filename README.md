# Smart Grid Sync: AI-Driven Smart Grid Optimization

Smart Grid Sync is a dynamic, high-fidelity interactive dashboard demonstrating the convergence of machine learning, time-series forecasting, smart grid analytics, and sustainability. It provides a real-time simulation of an electrical grid, demonstrating how dynamic electricity pricing, AI forecasting, battery storage systems, and renewable energy integration cooperate to maintain grid stability.

🎯 **Live Dashboard**: [https://shikhasrivastava0574-afk.github.io/Smart-Grid-Sync/](https://shikhasrivastava0574-afk.github.io/Smart-Grid-Sync/)

---

## Key Features

### 📈 1. Time Series Forecasting & Analytics
Includes real-time, interactive forecasting models predicting grid behavior 24 hours ahead:
* **Deep Neural Network (MLP)**: Feedforward neural network capturing non-linear weather features.
* **Holt-Winters (ETS)**: Statistical time-series model capturing 24h diurnal electrical usage cycles.
* **Ridge Regression**: Linear model with L2 regularization showing weather parameter feature weights.

### 🔋 2. Smart Grid Analytics & Storage Integration
* Utility-scale Energy Storage System (ESS) battery charging and discharging logic.
* Auto Dispatch mode (recharges during solar/wind surplus, discharges to support load during peak pricing).
* Manual control override modes (Force Charge, Force Discharge, System Hold).
* Grid Frequency tracking (Hz) reflecting grid load balance.

### ⚡ 3. Dynamic Electricity Pricing Engine
* Calculates tariffs in real-time based on supply/demand ratio and transmission line congestion.
* Allows negative electricity rates (surplus pricing) to incentivize consumer demand shifting.

### 🌱 4. Sustainability & Carbon Tracking
* Tracks grid carbon intensity ($g\text{ CO}_2/\text{kWh}$).
* Displays carbon emissions saved (kg) and solar/wind energy curtailment indicators.
* Displays live dispatch recommendations from the grid advisor.

---

## File Structure

* **`index.html`**: Structured layout of KPI readouts, custom SVG chart containers, and control sliders.
* **`styles.css`**: CSS styling featuring a premium glassmorphic dark theme, glowing neon elements, and keyframe animations.
* **`app.js`**: Core state loop, timeline engine, mathematical modeling, custom SVG vector graphing, and DOM bindings.

---

## How to Run Locally

Since this project has zero external package dependencies, you can run it directly on your machine without compilation.

1. Navigate to the project directory:
   ```bash
   cd smart-grid-sync
   ```

2. Start a local server:
   ```bash
   python3 -m http.server 8000
   ```

3. Open your browser and navigate to:
   ```
   http://localhost:8000
   ```
