import math
import random
from datetime import datetime

class SmartGridSimulator:
    def __init__(self):
        # Simulation settings
        self.current_time = 8 * 60  # Start at 08:00 AM (minutes, 0 to 1440)
        self.current_day = 1
        
        # Environmental variables
        self.temperature = 24.0
        self.cloud_cover = 15.0
        self.wind_speed = 5.5
        
        # Battery specifications (100 MWh capacity, 10 MW max rate)
        self.battery_capacity = 100.0
        self.battery_charge = 50.0 # starts at 50% SoC
        self.battery_max_rate = 10.0
        self.battery_mode = "auto"
        self.battery_rate = 0.0
        
        # Grid parameters
        self.active_scenario = "normal"
        self.selected_model = "lstm"
        self.carbon_saved = 1240.0
        self.curtailed_renewables = 0.0
        self.grid_frequency = 60.00
        self.fossil_backup = 0.0
        
        # State variables to share with API
        self.actual_load = 40.0
        self.base_load = 40.0
        self.solar_output = 15.0
        self.wind_output = 8.0
        self.dynamic_price = 0.15
        self.congestion_factor = 0.0
        self.status_text = "GRID OPERATING STABLE"
        self.status_class = "green"

    def format_time_str(self, minutes):
        display_min = minutes % 1440
        hr = int(display_min // 60)
        mn = int(display_min % 60)
        ampm = "PM" if hr >= 12 else "AM"
        formatted_hr = hr % 12
        if formatted_hr == 0:
            formatted_hr = 12
        formatted_mn = f"0{mn}" if mn < 10 else str(mn)
        return f"{formatted_hr}:{formatted_mn} {ampm}"

    def calculate_base_load(self, hour):
        if hour < 6:
            return 22.0 + (hour * 0.8)
        elif 6 <= hour < 10:
            return 26.8 + (hour - 6) * 5.0
        elif 10 <= hour < 16:
            return 45.0 - (hour - 10) * 1.5
        elif 16 <= hour < 20:
            return 37.0 + (hour - 16) * 5.5
        else:
            return 58.0 - (hour - 20) * 3.5

    def calculate_price_value(self, net_load, congestion):
        base_price = 0.12
        price = base_price + (net_load / 40.0) * 0.08 + congestion * 0.15
        return max(-0.04, min(0.48, price))

    def step(self, speed_minutes):
        # 1. Advance timeline
        self.current_time += speed_minutes
        if self.current_time >= 1440:
            self.current_time = 0
            self.current_day += 1

        current_hour = int(self.current_time // 60)

        # 2. Demand calculations
        self.base_load = self.calculate_base_load(current_hour)
        
        # Temp adjustments
        temp_adjustment = 0.0
        if self.temperature > 25.0:
            temp_adjustment = (self.temperature - 25.0) * 1.4
        elif self.temperature < 15.0:
            temp_adjustment = (15.0 - self.temperature) * 0.8
            
        noise = math.sin(self.current_time / 10.0) * 1.2 + (random.random() * 0.8 - 0.4)
        scenario_multiplier = 1.2 if self.active_scenario == "heatwave" else 1.0
        self.actual_load = max(10.0, (self.base_load * scenario_multiplier) + temp_adjustment + noise)

        # 3. Renewables outputs
        # Solar peaking at 12pm, reduced by clouds
        solar_potential = 35.0
        self.solar_output = 0.0
        if 6 <= current_hour <= 18:
            self.solar_output = solar_potential * math.sin((current_hour - 6) / 12.0 * math.pi)
            self.solar_output *= (1.0 - (self.cloud_cover / 100.0) * 0.88)
        self.solar_output = max(0.0, self.solar_output)

        # Wind turbine power curve
        wind_capacity = 20.0
        self.wind_output = 0.0
        if 3.0 <= self.wind_speed <= 25.0:
            if self.wind_speed < 12.0:
                self.wind_output = wind_capacity * math.pow((self.wind_speed - 3.0) / 9.0, 2.5)
            else:
                self.wind_output = wind_capacity
        elif self.wind_speed > 25.0:
            self.wind_output = 0.0 # safety shutdown

        total_renewables = self.solar_output + self.wind_output

        # 4. Battery storage management
        power_diff = total_renewables - self.actual_load
        
        if self.battery_mode == "auto":
            if power_diff > 0.0:
                available_capacity = self.battery_capacity - self.battery_charge
                self.battery_rate = min(self.battery_max_rate, min(power_diff, available_capacity * 6.0))
            else:
                available_discharge = self.battery_charge
                self.battery_rate = -min(self.battery_max_rate, min(abs(power_diff), available_discharge * 6.0))
        elif self.battery_mode == "charge":
            available_capacity = self.battery_capacity - self.battery_charge
            self.battery_rate = min(self.battery_max_rate, available_capacity * 6.0)
        elif self.battery_mode == "discharge":
            available_discharge = self.battery_charge
            self.battery_rate = -min(self.battery_max_rate, available_discharge * 6.0)
        else:
            self.battery_rate = 0.0

        # Update SoC (elapsed hour fraction based on minutes)
        elapsed_hrs = speed_minutes / 60.0
        if self.battery_rate > 0:
            self.battery_charge += self.battery_rate * elapsed_hrs * 0.90
        elif self.battery_rate < 0:
            self.battery_charge += self.battery_rate * elapsed_hrs * 1.08
            
        self.battery_charge = max(0.0, min(self.battery_capacity, self.battery_charge))

        # 5. Grid pricing & health
        net_grid_load = self.actual_load - total_renewables + self.battery_rate
        
        if net_grid_load > 0.0:
            self.fossil_backup = net_grid_load
            self.curtailed_renewables = 0.0
        else:
            self.fossil_backup = 0.0
            self.curtailed_renewables = abs(net_grid_load)

        # Grid frequency calculations
        freq_base = 60.00
        load_imbalance = self.actual_load - (total_renewables - self.curtailed_renewables - self.battery_rate)
        self.grid_frequency = freq_base - (load_imbalance / 500.0) + (random.random() * 0.015 - 0.0075)
        self.grid_frequency = max(59.10, min(60.80, self.grid_frequency))

        # Congestion checks
        self.congestion_factor = 0.8 if self.active_scenario == "congestion" else 0.0
        self.dynamic_price = self.calculate_price_value(net_grid_load, self.congestion_factor)

        # Carbon Saved counting
        clean_ratio = total_renewables / self.actual_load if self.actual_load > 0 else 0
        if clean_ratio > 0.1:
            self.carbon_saved += (total_renewables - self.curtailed_renewables) * elapsed_hrs * 450.0 / 1000.0

        # Sync visual classes
        if self.dynamic_price > 0.22:
            self.status_text = "PEAK GRID LOAD"
            self.status_class = "red"
        elif self.dynamic_price < 0.05:
            self.status_text = "RENEWABLE SURPLUS"
            self.status_class = "yellow"
        else:
            self.status_text = "GRID OPERATING STABLE"
            self.status_class = "green"
            
        return {
            "time_str": self.format_time_str(self.current_time),
            "minute": self.current_time,
            "load": self.actual_load,
            "solar": self.solar_output,
            "wind": self.wind_output,
            "battery": self.battery_rate,
            "price": self.dynamic_price,
            "frequency": self.grid_frequency
        }
