import threading
import time
import math
import random
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from typing import List

from .database import init_db, get_db_connection
from .schemas import (
    GridStatusResponse, GridControlRequest, ScenarioRequest,
    ModelTrainRequest, ForecastResponse, ForecastPoint, GridMetricResponse
)
from .simulator import SmartGridSimulator
from .ml.predictor import predict_24h_ahead, train_forecaster

# Initialize Database tables
init_db()

app = FastAPI(title="Smart Grid Sync API", description="AI-Driven Grid Optimization Engine")

# Configure CORS so local frontend files can query the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global simulator and timeline state
simulator = SmartGridSimulator()
is_sim_playing = True
sim_speed_level = 2
sim_speed_minutes = 5  # minutes of grid time per real second

def run_simulation_loop():
    """Background thread that executes the grid simulator step every 1 second."""
    global is_sim_playing, sim_speed_minutes
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Pre-seed history with 24 hours of simulated points if database is empty
        cursor.execute("SELECT COUNT(*) FROM grid_metrics")
        count = cursor.fetchone()[0]
        
        if count == 0:
            start_min = simulator.current_time - (24 * 60)
            for i in range(144):
                sim_min = start_min + (i * 10)
                hour = int((sim_min % 1440) // 60)
                
                # Model average parameters
                base = simulator.calculate_base_load(hour)
                temp = 22.0 + math.sin(hour / 24.0 * 2 * math.pi) * 4.0
                temp_adj = (temp - 25.0) * 1.2 if temp > 25.0 else ((15.0 - temp) * 0.6 if temp < 15.0 else 0)
                demand = base + temp_adj + random.uniform(-1, 1)
                
                solar = 0.0
                if 6 <= hour <= 18:
                    solar = 28.0 * math.sin((hour - 6) / 12.0 * math.pi) * 0.85
                
                wind = 20.0 * 0.4 * (1 + math.sin(hour / 4) * 0.2)
                battery = 0.0
                if solar + wind > demand:
                    battery = min(simulator.battery_max_rate, (solar + wind - demand))
                else:
                    battery = -min(simulator.battery_max_rate, (demand - solar - wind))
                
                net_load = demand - solar - wind + battery
                price = simulator.calculate_price_value(net_load, 0.0)
                
                cursor.execute(
                    """
                    INSERT INTO grid_metrics (time_str, minute, load, solar, wind, battery, price, frequency)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        simulator.format_time_str(sim_min),
                        sim_min,
                        demand,
                        solar,
                        wind,
                        battery,
                        price,
                        60.0 + random.uniform(-0.02, 0.02)
                    )
                )
            conn.commit()

        # Main timeline loop
        while True:
            if is_sim_playing:
                # 1. Advance simulator
                step_data = simulator.step(sim_speed_minutes)
                
                # 2. Record to database if we hit a 10-minute simulated mark
                if step_data["minute"] % 10 == 0:
                    cursor.execute(
                        """
                        INSERT INTO grid_metrics (time_str, minute, load, solar, wind, battery, price, frequency)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            step_data["time_str"],
                            step_data["minute"],
                            step_data["load"],
                            step_data["solar"],
                            step_data["wind"],
                            step_data["battery"],
                            step_data["price"],
                            step_data["frequency"]
                        )
                    )
                    conn.commit()
                    
                    # Keep database pruned to only contain the last 144 records (24h)
                    cursor.execute("SELECT COUNT(*) FROM grid_metrics")
                    total = cursor.fetchone()[0]
                    
                    if total > 144:
                        excess = total - 144
                        cursor.execute(
                            f"DELETE FROM grid_metrics WHERE id IN (SELECT id FROM grid_metrics ORDER BY id ASC LIMIT {excess})"
                        )
                        conn.commit()
                        
            time.sleep(1.0)
    finally:
        conn.close()

# Spawn simulator thread on startup
sim_thread = threading.Thread(target=run_simulation_loop, daemon=True)
sim_thread.start()

# API Endpoints
@app.get("/api/grid/status", response_model=GridStatusResponse)
def get_grid_status():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        # Calculate average pricing from history
        cursor.execute("SELECT price FROM grid_metrics")
        prices = [r["price"] for r in cursor.fetchall()]
        avg_price = sum(prices) / len(prices) if prices else 0.15
    finally:
        conn.close()
        
    battery_soc = (simulator.battery_charge / simulator.battery_capacity) * 100.0
    
    # Calculate carbon intensity
    total_renewables = simulator.solar_output + simulator.wind_output
    clean_ratio = min(1.0, total_renewables / simulator.actual_load) if simulator.actual_load > 0 else 0
    carbon_intensity = max(12, int(450 * (1 - clean_ratio) + simulator.fossil_backup * 2))

    return GridStatusResponse(
        current_time=simulator.format_time_str(simulator.current_time),
        minute=simulator.current_time,
        day=simulator.current_day,
        temperature=simulator.temperature,
        cloud_cover=simulator.cloud_cover,
        wind_speed=simulator.wind_speed,
        battery_soc=battery_soc,
        battery_charge=simulator.battery_charge,
        battery_mode=simulator.battery_mode,
        battery_rate=simulator.battery_rate,
        actual_load=simulator.actual_load,
        base_load=simulator.base_load,
        solar_output=simulator.solar_output,
        wind_output=simulator.wind_output,
        dynamic_price=simulator.dynamic_price,
        avg_price=avg_price,
        curtailed_renewables=simulator.curtailed_renewables,
        grid_frequency=simulator.grid_frequency,
        carbon_intensity=carbon_intensity,
        carbon_saved=simulator.carbon_saved,
        status_text=simulator.status_text,
        status_class=simulator.status_class
    )

@app.post("/api/grid/control")
def update_grid_controls(req: GridControlRequest):
    if req.temperature is not None:
        simulator.temperature = req.temperature
    if req.cloud_cover is not None:
        simulator.cloud_cover = req.cloud_cover
    if req.wind_speed is not None:
        simulator.wind_speed = req.wind_speed
    if req.battery_mode is not None:
        if req.battery_mode in ["auto", "charge", "discharge"]:
            simulator.battery_mode = req.battery_mode
            
    return {"status": "success", "message": "Controls updated"}

@app.post("/api/grid/play-pause")
def toggle_play_pause():
    global is_sim_playing
    is_sim_playing = not is_sim_playing
    return {"status": "success", "is_playing": is_sim_playing}

@app.post("/api/grid/speed")
def update_sim_speed(payload: dict):
    global is_sim_playing, sim_speed_minutes
    speed_level = payload.get("speed_level", 2)
    speed_map = [0, 1, 5, 15, 60]
    
    multiplier = speed_map[speed_level]
    sim_speed_minutes = multiplier
    
    if multiplier == 0:
        is_sim_playing = False
    else:
        is_sim_playing = True
        
    return {"status": "success", "is_playing": is_sim_playing, "speed_minutes": multiplier}

@app.post("/api/grid/scenario")
def trigger_scenario(req: ScenarioRequest):
    scenario = req.scenario
    if scenario not in ["normal", "heatwave", "cloudy", "storm", "congestion"]:
        raise HTTPException(status_code=400, detail="Invalid scenario")
        
    simulator.active_scenario = scenario
    
    if scenario == "normal":
        simulator.temperature = 24.0
        simulator.cloud_cover = 15.0
        simulator.wind_speed = 5.5
    elif scenario == "heatwave":
        simulator.temperature = 40.0
        simulator.cloud_cover = 8.0
        simulator.wind_speed = 2.0
    elif scenario == "cloudy":
        simulator.temperature = 17.0
        simulator.cloud_cover = 95.0
        simulator.wind_speed = 1.5
    elif scenario == "storm":
        simulator.temperature = 11.0
        simulator.cloud_cover = 85.0
        simulator.wind_speed = 23.5
    elif scenario == "congestion":
        simulator.temperature = 27.0
        simulator.cloud_cover = 40.0
        simulator.wind_speed = 5.0
        
    return {"status": "success", "message": f"Scenario {scenario} activated"}

@app.get("/api/grid/history", response_model=List[GridMetricResponse])
def get_grid_history():
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM grid_metrics ORDER BY id ASC")
        rows = cursor.fetchall()
        metrics = [dict(r) for r in rows]
    finally:
        conn.close()
    return metrics

@app.get("/api/grid/forecast", response_model=ForecastResponse)
def get_grid_forecast():
    points = predict_24h_ahead(simulator.selected_model, simulator)
    
    formatted_points = [
        ForecastPoint(
            hour=p["hour"],
            minute=p["minute"],
            time_str=p["time_str"],
            load=p["load"],
            solar=p["solar"],
            price=p["price"]
        ) for p in points
    ]
    
    return ForecastResponse(
        model=simulator.selected_model,
        horizon=24,
        points=formatted_points
    )

@app.post("/api/ml/train")
def train_model(req: ModelTrainRequest, background_tasks: BackgroundTasks):
    if req.model not in ["lstm", "xgboost", "linear"]:
        raise HTTPException(status_code=400, detail="Invalid model selection")
        
    simulator.selected_model = req.model
    
    # Run training in background task since it is computationally heavier
    background_tasks.add_task(train_forecaster, req.model, simulator)
    
    return {"status": "success", "message": f"Training initiated for {req.model.upper()}"}
