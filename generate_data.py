import pandas as pd
import numpy as np
import datetime

def generate_smart_grid_data(start_date="2024-01-01", end_date="2025-12-31"):
    print("Generating synthetic smart grid dataset...")
    # 1. Setup Time Range
    timestamps = pd.date_range(start=start_date, end=end_date, freq='h')
    n_hours = len(timestamps)
    
    # 2. Setup Weather Simulation
    np.random.seed(42)
    
    # Temperature cycle: Seasonal sine wave + Daily sine wave + Noise
    # Max in July (day 180-210), min in Jan (day 0-30)
    day_of_year = timestamps.dayofyear
    hour_of_day = timestamps.hour
    
    # Base temperature varies from 8C (winter) to 28C (summer)
    seasonal_temp = 18 + 10 * np.sin(2 * np.pi * (day_of_year - 120) / 365)
    # Daily temperature variation (peaks at 3 PM / 15:00, lowest at 5 AM / 05:00)
    daily_temp = 6 * np.sin(2 * np.pi * (hour_of_day - 9) / 24)
    # Add random noise
    temp_noise = np.random.normal(0, 1.5, n_hours)
    temperature = seasonal_temp + daily_temp + temp_noise
    
    # Humidity: Inversely related to temperature + monsoon season peak (Jul-Sep, days 180-270)
    base_humidity = 60 - 20 * np.sin(2 * np.pi * (hour_of_day - 9) / 24)
    monsoon_boost = np.where((day_of_year >= 180) & (day_of_year <= 270), 15, 0)
    humidity_noise = np.random.normal(0, 5, n_hours)
    humidity = np.clip(base_humidity + monsoon_boost + humidity_noise, 15, 100)
    
    # Cloud Cover: Random walk/fluctuations, higher in monsoon/winter
    cloud_noise = np.random.normal(0, 25, n_hours)
    base_clouds = 30 + 20 * np.sin(2 * np.pi * (day_of_year - 150) / 365)
    cloud_cover = np.clip(base_clouds + cloud_noise, 0, 100)
    
    # Wind Speed: Weibull distribution approximation, slightly higher in afternoon
    wind_base = 4 + 2 * np.sin(2 * np.pi * (hour_of_day - 12) / 24)
    wind_noise = np.random.exponential(2, n_hours)
    wind_speed = np.clip(wind_base + wind_noise - 1, 0, 25)
    
    # Create Weather DataFrame
    weather_df = pd.DataFrame({
        'Timestamp': timestamps,
        'Temperature_C': temperature,
        'Humidity_pct': humidity,
        'Cloud_Cover_pct': cloud_cover,
        'Wind_Speed_ms': wind_speed
    })
    
    # 3. Consumption Simulation by Category
    categories = ['Residential', 'Commercial', 'Industrial']
    records = []
    
    for idx, row in weather_df.iterrows():
        ts = row['Timestamp']
        temp = row['Temperature_C']
        clouds = row['Cloud_Cover_pct']
        wind = row['Wind_Speed_ms']
        
        h = ts.hour
        month = ts.month
        is_weekend = ts.dayofweek >= 5
        day_of_week = ts.dayofweek
        
        # SOLAR GENERATION (Same for all categories at a given timestamp)
        # Solar occurs between 6 AM and 6 PM (hour 6 to 17)
        if 6 <= h <= 18:
            # Theoretical clear sky solar generation (sine curve peaking at 12 PM)
            solar_peak = 120.0  # Max capacity in kWh
            clear_sky = solar_peak * np.sin(np.pi * (h - 6) / 12)
            # Cloud cover penalty (linear drop up to 80% reduction)
            cloud_penalty = 1.0 - (clouds / 100.0) * 0.8
            # Temp penalty (solar panels lose efficiency in high heat)
            temp_penalty = 1.0
            if temp > 25.0:
                temp_penalty = 1.0 - (temp - 25.0) * 0.004
            
            solar_gen = clear_sky * cloud_penalty * temp_penalty + np.random.normal(0, 2)
            solar_gen = max(0.0, solar_gen)
        else:
            solar_gen = 0.0
            
        # CONSUMPTION (kWh)
        # A. Residential
        res_base = 40.0
        # Diurnal double peak (morning 7-9 AM, evening 6-10 PM)
        res_diurnal = 0.0
        if 7 <= h <= 9:
            res_diurnal = 35.0
        elif 18 <= h <= 22:
            res_diurnal = 65.0
        elif 10 <= h <= 17:
            res_diurnal = 15.0  # background usage
        else:
            res_diurnal = 5.0   # night usage
            
        # Weekend boost (residential uses 20% more on weekends)
        weekend_mult = 1.20 if is_weekend else 1.0
        
        # Temp heating/cooling load
        res_weather_load = 0.0
        if temp > 24.0:
            # AC load
            res_weather_load = (temp - 24.0) * 4.5
        elif temp < 15.0:
            # Heating load
            res_weather_load = (15.0 - temp) * 2.5
            
        res_noise = np.random.normal(0, 3)
        res_consumption = max(5.0, (res_base + res_diurnal + res_weather_load) * weekend_mult + res_noise)
        
        records.append({
            'Timestamp': ts,
            'Consumer_Category': 'Residential',
            'Temperature_C': temp,
            'Humidity_pct': row['Humidity_pct'],
            'Cloud_Cover_pct': clouds,
            'Wind_Speed_ms': wind,
            'Solar_Generation_kWh': solar_gen,
            'Consumption_kWh': res_consumption
        })
        
        # B. Commercial
        com_base = 25.0
        # Business hours peak (9 AM to 6 PM)
        com_diurnal = 0.0
        if 9 <= h <= 18:
            com_diurnal = 110.0
        elif 7 <= h <= 8 or 19 <= h <= 21:
            com_diurnal = 40.0
        else:
            com_diurnal = 10.0
            
        # Weekend cut (commercial uses 65% less on weekends)
        com_weekend_mult = 0.35 if is_weekend else 1.0
        
        com_weather_load = 0.0
        if temp > 24.0:
            com_weather_load = (temp - 24.0) * 6.0
        elif temp < 15.0:
            com_weather_load = (15.0 - temp) * 2.0
            
        com_noise = np.random.normal(0, 4)
        com_consumption = max(2.0, (com_base + com_diurnal + com_weather_load) * com_weekend_mult + com_noise)
        
        records.append({
            'Timestamp': ts,
            'Consumer_Category': 'Commercial',
            'Temperature_C': temp,
            'Humidity_pct': row['Humidity_pct'],
            'Cloud_Cover_pct': clouds,
            'Wind_Speed_ms': wind,
            'Solar_Generation_kWh': solar_gen,
            'Consumption_kWh': com_consumption
        })
        
        # C. Industrial
        ind_base = 280.0
        # Relatively flat, slightly lower at night
        ind_diurnal = 30.0 if (8 <= h <= 20) else 0.0
        # Weekend lower (Saturdays -15%, Sundays -35%)
        ind_weekend_mult = 1.0
        if day_of_week == 5:    # Sat
            ind_weekend_mult = 0.85
        elif day_of_week == 6:  # Sun
            ind_weekend_mult = 0.65
            
        # Very small temperature dependency
        ind_weather_load = 0.0
        if temp > 26.0:
            ind_weather_load = (temp - 26.0) * 1.5
            
        ind_noise = np.random.normal(0, 8)
        ind_consumption = max(50.0, (ind_base + ind_diurnal + ind_weather_load) * ind_weekend_mult + ind_noise)
        
        records.append({
            'Timestamp': ts,
            'Consumer_Category': 'Industrial',
            'Temperature_C': temp,
            'Humidity_pct': row['Humidity_pct'],
            'Cloud_Cover_pct': clouds,
            'Wind_Speed_ms': wind,
            'Solar_Generation_kWh': solar_gen,
            'Consumption_kWh': ind_consumption
        })
        
    df = pd.DataFrame(records)
    df.to_csv("smart_grid_data.csv", index=False)
    print(f"Data generation complete. Saved to smart_grid_data.csv. Shape: {df.shape}")
    return df

if __name__ == "__main__":
    generate_smart_grid_data()
