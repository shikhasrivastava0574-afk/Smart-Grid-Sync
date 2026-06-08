import pandas as pd
import numpy as np
import os

class PricingEngine:
    def __init__(self, data_path="smart_grid_data.csv"):
        self.data_path = data_path
        self.thresholds = {}
        self.load_thresholds()

    def load_thresholds(self):
        # Default fallback thresholds in case dataset is not found
        default_thresholds = {
            'Residential': {'low': 50.0, 'high': 90.0},
            'Commercial': {'low': 40.0, 'high': 120.0},
            'Industrial': {'low': 200.0, 'high': 300.0},
            'All': {'low': 60.0, 'high': 150.0}
        }
        
        if not os.path.exists(self.data_path):
            self.thresholds = default_thresholds
            return
            
        try:
            df = pd.read_csv(self.data_path)
            # Compute 40th and 80th percentiles for each category
            for cat in df['Consumer_Category'].unique():
                cat_data = df[df['Consumer_Category'] == cat]['Consumption_kWh']
                self.thresholds[cat] = {
                    'low': float(np.percentile(cat_data, 40)),
                    'high': float(np.percentile(cat_data, 80))
                }
            
            # Overall thresholds
            overall_data = df['Consumption_kWh']
            self.thresholds['All'] = {
                'low': float(np.percentile(overall_data, 40)),
                'high': float(np.percentile(overall_data, 80))
            }
        except Exception as e:
            print(f"Error computing dynamic pricing thresholds: {e}. Using defaults.")
            self.thresholds = default_thresholds

    def get_price_and_tier(self, demand, category='Residential', hour=None):
        cat_thresh = self.thresholds.get(category, self.thresholds.get('All'))
        
        if demand <= cat_thresh['low']:
            price = 4.50
            tier = 'Low'
        elif demand <= cat_thresh['high']:
            price = 6.20
            tier = 'Medium'
        else:
            # Check for critical peak (e.g. above 95th percentile, which is roughly 1.2 * high threshold)
            if demand > 1.2 * cat_thresh['high']:
                price = 14.00
                tier = 'Critical Peak'
            else:
                price = 10.00
                tier = 'High'

        # Apply Indian Time-of-Day (ToD) tariff offsets if hour is provided
        if hour is not None:
            # 22:00 to 06:00 (Night Off-Peak Rebate)
            if hour >= 22 or hour < 6:
                price -= 1.50
                if tier == 'Low':
                    tier = 'Off-Peak Night'
            # 09:00 to 12:00 (Morning Peak Surcharge)
            elif 9 <= hour < 12:
                price += 1.50
                if tier == 'Medium':
                    tier = 'Morning Peak'
            # 18:00 to 22:00 (Evening Peak Surcharge)
            elif 18 <= hour < 22:
                price += 2.50
                if tier in ['Medium', 'High']:
                    tier = 'Evening Peak'
                
        # Clamp pricing between ₹3.00 and ₹16.00 to keep it within realistic Indian retail bounds
        price = max(3.00, min(16.00, price))
        return price, tier

    def calculate_monthly_slab_bill(self, consumption_units, category='Residential'):
        """
        Calculates cumulative monthly electricity bill based on standard Indian utility slabs (MSEDCL/BSES style).
        """
        if category == 'Residential':
            # Slabs:
            # 0-100 units: ₹4.50/unit
            # 101-300 units: ₹8.50/unit
            # 301-500 units: ₹12.00/unit
            # Above 500 units: ₹15.00/unit
            bill = 0.0
            remaining = consumption_units
            
            # Slab 1: 0-100
            slab1 = min(remaining, 100.0)
            bill += slab1 * 4.50
            remaining -= slab1
            
            # Slab 2: 101-300 (range of 200)
            if remaining > 0:
                slab2 = min(remaining, 200.0)
                bill += slab2 * 8.50
                remaining -= slab2
                
            # Slab 3: 301-500 (range of 200)
            if remaining > 0:
                slab3 = min(remaining, 200.0)
                bill += slab3 * 12.00
                remaining -= slab3
                
            # Slab 4: Above 500
            if remaining > 0:
                bill += remaining * 15.00
                
            return bill
            
        elif category == 'Commercial':
            # Commercial:
            # 0-200 units: ₹9.00/unit
            # Above 200 units: ₹13.00/unit
            bill = 0.0
            remaining = consumption_units
            slab1 = min(remaining, 200.0)
            bill += slab1 * 9.00
            remaining -= slab1
            if remaining > 0:
                bill += remaining * 13.00
            return bill
            
        else: # Industrial
            # Flat Industrial rate around ₹11.50/unit
            return consumption_units * 11.50

    def get_suggestions(self, tier, category='Residential', hour=12):
        suggestions = []
        
        if category == 'Residential':
            if tier in ['High', 'Critical Peak']:
                suggestions.extend([
                    "⚠️ High demand alert! Defer high-energy appliances (washing machines, dryers, dishwashers) to post-10 PM.",
                    "🌡️ Set your A/C thermostat to 26°C or higher to reduce cooling load.",
                    "🔋 If you have home battery storage, set it to discharge to power your home and save on utility rates."
                ])
            elif tier == 'Medium':
                suggestions.extend([
                    "💡 Moderate grid demand. Avoid running multiple high-power appliances simultaneously.",
                    "Pre-cool your home slightly if you expect a hotter evening."
                ])
            else:  # Low tier
                suggestions.extend([
                    "✅ Off-peak rates active (₹4/unit)! Ideal time to run laundry, dishwashers, and water heaters.",
                    "🚗 Charge electric vehicles now at the lowest rate.",
                    "☀️ Solar generation is peak. Excellent time to utilize household appliances."
                ])
        
        elif category == 'Commercial':
            if tier in ['High', 'Critical Peak']:
                suggestions.extend([
                    "⚠️ Peak Grid pricing active. Dim auxiliary office lighting and set common areas to economy cooling mode.",
                    "Pre-cool server rooms during off-peak hours and shift backup charging protocols.",
                    "Optimize elevator scheduling or run building management system (BMS) in eco-mode."
                ])
            else:
                suggestions.extend([
                    "✅ Energy rates are normal/low. Conduct energy-intensive operations (e.g., HVAC system checks, thermal storage charging)."
                ])
                
        elif category == 'Industrial':
            if tier in ['High', 'Critical Peak']:
                suggestions.extend([
                    "⚠️ Industrial load shedding / peak pricing active. If possible, ramp down secondary production lines.",
                    "Utilize onsite battery storage banks or diesel generators to shave peak demand.",
                    "Schedule heavy machinery maintenance or clean-in-place (CIP) cycles outside of peak pricing windows."
                ])
            else:
                suggestions.extend([
                    "✅ Base grid rates are low. Optimal time for high-throughput manufacturing, metal smelting, or heavy grinding cycles."
                ])
                
        return suggestions

if __name__ == "__main__":
    pe = PricingEngine()
    print("Thresholds:", pe.thresholds)
    p, t = pe.get_price_and_tier(120, 'Residential')
    print(f"Demand 120 kWh Residential -> Price: ₹{p}/unit, Tier: {t}")
