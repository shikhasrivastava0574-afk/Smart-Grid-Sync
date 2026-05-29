from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional

class GridMetricBase(BaseModel):
    time_str: str
    minute: int
    load: float
    solar: float
    wind: float
    battery: float
    price: float
    frequency: float

class GridMetricCreate(GridMetricBase):
    pass

class GridMetricResponse(GridMetricBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True

class GridStatusResponse(BaseModel):
    current_time: str
    minute: int
    day: int
    temperature: float
    cloud_cover: float
    wind_speed: float
    battery_soc: float
    battery_charge: float
    battery_mode: str
    battery_rate: float
    actual_load: float
    base_load: float
    solar_output: float
    wind_output: float
    dynamic_price: float
    avg_price: float
    curtailed_renewables: float
    grid_frequency: float
    carbon_intensity: int
    carbon_saved: float
    status_text: str
    status_class: str

class GridControlRequest(BaseModel):
    temperature: Optional[float] = None
    cloud_cover: Optional[float] = None
    wind_speed: Optional[float] = None
    battery_mode: Optional[str] = None

class ScenarioRequest(BaseModel):
    scenario: str

class ModelTrainRequest(BaseModel):
    model: str

class ForecastPoint(BaseModel):
    hour: int
    minute: int
    time_str: str
    load: float
    solar: float
    price: float

class ForecastResponse(BaseModel):
    model: str
    horizon: int
    points: List[ForecastPoint]
