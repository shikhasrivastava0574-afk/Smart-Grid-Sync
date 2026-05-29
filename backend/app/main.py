import threading
import time
import math
import random
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

from .database import init_db, get_db_connection
from .simulator import SmartGridSimulator
from .ml.predictor import predict_24h_ahead, train_forecaster

# Initialize Database tables
init_db()

# Global simulator and timeline state
simulator = SmartGridSimulator()
is_sim_playing = True
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


class SmartGridAPIHandler(BaseHTTPRequestHandler):
    """CORS-enabled API router built using standard library BaseHTTPRequestHandler."""
    
    def end_headers(self):
        # Enable CORS for local testing from any directory
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        # Reply to pre-flight request successfully
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        if path == "/api/grid/status":
            self.handle_get_status()
        elif path == "/api/grid/history":
            self.handle_get_history()
        elif path == "/api/grid/forecast":
            self.handle_get_forecast()
        else:
            self.send_error(404, "Endpoint not found")

    def do_POST(self):
        parsed_url = urlparse(self.path)
        path = parsed_url.path

        # Read POST body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode('utf-8')
        try:
            payload = json.loads(post_data) if post_data else {}
        except json.JSONDecodeError:
            payload = {}

        if path == "/api/grid/control":
            self.handle_post_control(payload)
        elif path == "/api/grid/play-pause":
            self.handle_post_play_pause()
        elif path == "/api/grid/speed":
            self.handle_post_speed(payload)
        elif path == "/api/grid/scenario":
            self.handle_post_scenario(payload)
        elif path == "/api/ml/train":
            self.handle_post_train(payload)
        else:
            self.send_error(404, "Endpoint not found")

    # ==========================================================================
    # ENDPOINT ROUTERS
    # ==========================================================================

    def handle_get_status(self):
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT price FROM grid_metrics")
            prices = [r["price"] for r in cursor.fetchall()]
            avg_price = sum(prices) / len(prices) if prices else 0.15
        finally:
            conn.close()

        battery_soc = (simulator.battery_charge / simulator.battery_capacity) * 100.0
        total_renewables = simulator.solar_output + simulator.wind_output
        clean_ratio = min(1.0, total_renewables / simulator.actual_load) if simulator.actual_load > 0 else 0
        carbon_intensity = max(12, int(450 * (1 - clean_ratio) + simulator.fossil_backup * 2))

        response_data = {
            "current_time": simulator.format_time_str(simulator.current_time),
            "minute": simulator.current_time,
            "day": simulator.current_day,
            "temperature": simulator.temperature,
            "cloud_cover": simulator.cloud_cover,
            "wind_speed": simulator.wind_speed,
            "battery_soc": battery_soc,
            "battery_charge": simulator.battery_charge,
            "battery_mode": simulator.battery_mode,
            "battery_rate": simulator.battery_rate,
            "actual_load": simulator.actual_load,
            "base_load": simulator.base_load,
            "solar_output": simulator.solar_output,
            "wind_output": simulator.wind_output,
            "dynamic_price": simulator.dynamic_price,
            "avg_price": avg_price,
            "curtailed_renewables": simulator.curtailed_renewables,
            "grid_frequency": simulator.grid_frequency,
            "carbon_intensity": carbon_intensity,
            "carbon_saved": simulator.carbon_saved,
            "status_text": simulator.status_text,
            "status_class": simulator.status_class
        }

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))

    def handle_get_history(self):
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("SELECT * FROM grid_metrics ORDER BY id ASC")
            rows = cursor.fetchall()
            metrics = [dict(r) for r in rows]
        finally:
            conn.close()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(metrics).encode('utf-8'))

    def handle_get_forecast(self):
        points = predict_24h_ahead(simulator.selected_model, simulator)
        response_data = {
            "model": simulator.selected_model,
            "horizon": 24,
            "points": points
        }
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(response_data).encode('utf-8'))

    def handle_post_control(self, payload):
        if "temperature" in payload and payload["temperature"] is not None:
            simulator.temperature = float(payload["temperature"])
        if "cloud_cover" in payload and payload["cloud_cover"] is not None:
            simulator.cloud_cover = float(payload["cloud_cover"])
        if "wind_speed" in payload and payload["wind_speed"] is not None:
            simulator.wind_speed = float(payload["wind_speed"])
        if "battery_mode" in payload and payload["battery_mode"] is not None:
            mode = payload["battery_mode"]
            if mode in ["auto", "charge", "discharge"]:
                simulator.battery_mode = mode

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))

    def handle_post_play_pause(self):
        global is_sim_playing
        is_sim_playing = not is_sim_playing
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "success", "is_playing": is_sim_playing}).encode('utf-8'))

    def handle_post_speed(self, payload):
        global is_sim_playing, sim_speed_minutes
        speed_level = payload.get("speed_level", 2)
        speed_map = [0, 1, 5, 15, 60]
        
        multiplier = speed_map[speed_level]
        sim_speed_minutes = multiplier
        
        if multiplier == 0:
            is_sim_playing = False
        else:
            is_sim_playing = True

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "success", "is_playing": is_sim_playing}).encode('utf-8'))

    def handle_post_scenario(self, payload):
        scenario = payload.get("scenario", "normal")
        if scenario not in ["normal", "heatwave", "cloudy", "storm", "congestion"]:
            self.send_error(400, "Invalid scenario")
            return

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

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))

    def handle_post_train(self, payload):
        model = payload.get("model", "lstm")
        if model not in ["lstm", "xgboost", "linear"]:
            self.send_error(400, "Invalid model selection")
            return

        simulator.selected_model = model
        # Run training in background thread
        thread = threading.Thread(target=train_forecaster, args=(model, simulator))
        thread.start()

        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps({"status": "success"}).encode('utf-8'))


def run_server():
    server_address = ('127.0.0.1', 8000)
    httpd = HTTPServer(server_address, SmartGridAPIHandler)
    print("Serving Smart Grid Sync API on http://127.0.0.1:8000")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        httpd.server_close()

if __name__ == "__main__":
    run_server()
