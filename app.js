/**
 * SMART GRID SYNC - CORE ENGINE
 * Dynamic pricing, Load Forecasting, & Renewable Integration Simulation
 */

// Initialize Grid State Class
class GridState {
    constructor() {
        // Simulation Time Settings
        this.currentTime = 8 * 60; // Start at 08:00 AM (in minutes, 0 to 1440)
        this.currentDay = 1;
        this.isPlaying = true;
        this.speedValue = 2; // Mapping index for speed
        this.speedMinutesPerSec = 5; // Default: 5 simulated minutes per real second
        
        // Environmental Parameters
        this.temperature = 24.0; // °C
        this.cloudCover = 15;     // %
        this.windSpeed = 5.5;    // m/s
        
        // Battery Storage State (100 MWh Capacity, 10 MW Max Charge/Discharge)
        this.batteryCapacity = 100.0; // MWh
        this.batteryCharge = 50.0;    // MWh (starts at 50% SoC)
        this.batterySoC = 50.0;       // %
        this.batteryMaxRate = 10.0;   // MW
        this.batteryMode = 'auto';    // 'auto', 'charge', 'discharge'
        this.batteryCurrentRate = 0.0;// MW (positive = charging, negative = discharging)
        
        // Grid Congestion & Backup Generator Flags
        this.congestionFactor = 0.0;  // 0.0 to 1.0
        this.fossilBackupRate = 0.0;  // MW
        this.curtailedRenewables = 0.0; // MW
        this.gridFrequency = 60.00;   // Hz
        this.carbonSavedToday = 1240.0; // kg CO2
        this.currentScenario = 'normal';
        
        // ML Model Sandbox Parameters
        this.selectedModel = 'lstm';
        this.isTraining = false;
        this.trainingEpoch = 0;
        this.trainingLoss = 0.0241;
        this.trainingValLoss = 0.0264;
        
        // Historic Log Buffers (24 Hours of Data, 10-Minute Intervals = 144 Points)
        this.historyLimit = 144;
        this.history = [];
        
        // Initialize historical data with typical grid behaviors
        this.initializeHistory();
    }

    // Populate historical buffers with realistic pre-calculated data
    initializeHistory() {
        const startMin = this.currentTime - (24 * 60); // 24 hours ago
        for (let i = 0; i < this.historyLimit; i++) {
            const simulatedMin = startMin + (i * 10);
            const hour = Math.floor((simulatedMin % 1440) / 60);
            const relativeTimeStr = this.formatTimeStr(simulatedMin);
            
            // Calculate simulated variables for history
            const base = this.calculateBaseLoad(hour);
            const temp = 22 + Math.sin((hour - 8) / 24 * 2 * Math.PI) * 4; // realistic temp curve
            const tempAdjust = temp > 25 ? (temp - 25) * 1.2 : (temp < 15 ? (15 - temp) * 0.6 : 0);
            const demand = base + tempAdjust + (Math.random() * 1.5 - 0.75);
            
            // Solar & Wind calculation
            const solarPot = 28.0;
            const solarAct = (hour >= 6 && hour <= 18) 
                ? solarPot * Math.sin((hour - 6) / 12 * Math.PI) * (1 - 0.15) 
                : 0.0;
            
            const windPot = 20.0;
            const windAct = windPot * 0.4 * (1 + Math.sin(hour / 4) * 0.2);
            
            // Simulated battery action in history
            let batteryAct = 0.0;
            const renewablesTotal = solarAct + windAct;
            if (renewablesTotal > demand) {
                batteryAct = Math.min(this.batteryMaxRate, renewablesTotal - demand);
            } else {
                batteryAct = -Math.min(this.batteryMaxRate, demand - renewablesTotal);
            }
            
            // Limit battery discharge
            const netLoad = demand - renewablesTotal - batteryAct;
            const price = this.calculatePriceValue(netLoad, 0.0);
            
            this.history.push({
                timeStr: relativeTimeStr,
                minute: simulatedMin,
                load: demand,
                solar: solarAct,
                wind: windAct,
                battery: batteryAct,
                price: price,
                frequency: 60.0 + (Math.random() * 0.04 - 0.02)
            });
        }
    }

    formatTimeStr(minutes) {
        let displayMin = minutes % 1440;
        if (displayMin < 0) displayMin += 1440;
        const hr = Math.floor(displayMin / 60);
        const mn = Math.floor(displayMin % 60);
        const ampm = hr >= 12 ? 'PM' : 'AM';
        const formattedHr = hr % 12 === 0 ? 12 : hr % 12;
        const formattedMn = mn < 10 ? '0' + mn : mn;
        return `${formattedHr}:${formattedMn} ${ampm}`;
    }

    calculateBaseLoad(hour) {
        // Base electric load shape: double peak (morning 8am, evening 7pm)
        if (hour < 6) {
            // Night base
            return 22.0 + (hour * 0.8);
        } else if (hour >= 6 && hour < 10) {
            // Morning peak ramp
            return 26.8 + (hour - 6) * 5.0;
        } else if (hour >= 10 && hour < 16) {
            // Afternoon valley (moderate)
            return 45.0 - (hour - 10) * 1.5;
        } else if (hour >= 16 && hour < 20) {
            // Evening peak ramp
            return 37.0 + (hour - 16) * 5.5;
        } else {
            // Night decline
            return 58.0 - (hour - 20) * 3.5;
        }
    }

    calculatePriceValue(netLoad, congestion) {
        const basePrice = 0.12; // $0.12 base pricing
        // Pricing goes up if net load is positive (drawing from grid), and drops if negative (excess clean power)
        let price = basePrice + (netLoad / 40.0) * 0.08 + congestion * 0.15;
        // Negative pricing allowed under heavy clean abundance
        return Math.max(-0.04, Math.min(0.48, price));
    }
}

// Global Engine Instance
const grid = new GridState();

// DOM Element References
const elements = {
    gridClock: document.getElementById('grid-clock'),
    btnPlayPause: document.getElementById('btn-play-pause'),
    playPauseIcon: document.getElementById('play-pause-icon'),
    simSpeed: document.getElementById('sim-speed'),
    simSpeedVal: document.getElementById('sim-speed-val'),
    gridStatus: document.getElementById('grid-status'),
    gridStatusText: document.getElementById('grid-status-text'),
    
    // KPI Values
    valActualLoad: document.getElementById('val-actual-load'),
    valBaseLoad: document.getElementById('val-base-load'),
    valForecastAcc: document.getElementById('val-forecast-acc'),
    barLoadCapacity: document.getElementById('bar-load-capacity'),
    
    valRenewablePercent: document.getElementById('val-renewable-percent'),
    valSolarMw: document.getElementById('val-solar-mw'),
    valWindMw: document.getElementById('val-wind-mw'),
    valCurtailment: document.getElementById('val-curtailment'),
    barSolarPct: document.getElementById('bar-solar-pct'),
    barWindPct: document.getElementById('bar-wind-pct'),
    barOtherPct: document.getElementById('bar-other-pct'),
    
    valDynamicPrice: document.getElementById('val-dynamic-price'),
    valAvgPrice: document.getElementById('val-avg-price'),
    valPriceRate: document.getElementById('val-price-rate'),
    barPriceTier: document.getElementById('bar-price-tier'),
    
    valBatterySoc: document.getElementById('val-battery-soc'),
    valBatteryState: document.getElementById('val-battery-state'),
    valGridFreq: document.getElementById('val-grid-freq'),
    barBatterySoc: document.getElementById('bar-battery-soc'),
    
    // SVG Containers
    svgDispatch: document.getElementById('svg-dispatch'),
    svgForecast: document.getElementById('svg-forecast'),
    dispatchTooltip: document.getElementById('dispatch-tooltip'),
    forecastTooltip: document.getElementById('forecast-tooltip'),
    
    // Controls
    sliderTemp: document.getElementById('slider-temp'),
    sliderClouds: document.getElementById('slider-clouds'),
    sliderWind: document.getElementById('slider-wind'),
    valCtrlTemp: document.getElementById('val-ctrl-temp'),
    valCtrlClouds: document.getElementById('val-ctrl-clouds'),
    valCtrlWind: document.getElementById('val-ctrl-wind'),
    btnBatAuto: document.getElementById('btn-bat-auto'),
    btnBatCharge: document.getElementById('btn-bat-charge'),
    btnBatDischarge: document.getElementById('btn-bat-discharge'),
    
    // ML Console
    selectMlModel: document.getElementById('select-ml-model'),
    btnTrainModel: document.getElementById('btn-train-model'),
    trainingStatus: document.getElementById('training-status'),
    mValEpochs: document.getElementById('m-val-epochs'),
    mValLoss: document.getElementById('m-val-loss'),
    mValValLoss: document.getElementById('m-val-val-loss'),
    consoleLogsText: document.getElementById('console-logs-text'),
    
    // Sustainability
    valCarbonIntensity: document.getElementById('val-carbon-intensity'),
    barCarbonIntensity: document.getElementById('bar-carbon-intensity'),
    valCo2Saved: document.getElementById('val-co2-saved'),
    advisorListContainer: document.getElementById('advisor-list-container')
};

// SVG Settings & Dimensions
const svgConfig = {
    width: 800,
    height: 320,
    margin: { top: 25, right: 30, bottom: 40, left: 55 },
    get chartWidth() { return this.width - this.margin.left - this.margin.right; },
    get chartHeight() { return this.height - this.margin.top - this.margin.bottom; }
};

// Velocity Speed Maps
const speedMap = [0, 1, 5, 15, 60]; // minutes per second

// Log messages templates
const logTemplates = {
    lstm: [
        "[AI LSTM] Model: Deep Recurrent LSTM Network | Input sequence: (24, 7)",
        "[AI LSTM] Initializing gate weights (Input, Forget, Output, Cell state)...",
        "[AI LSTM] Backpropagation Through Time (BPTT) active with Adam optimizer.",
        "[AI LSTM] Hidden state dim: 64 | Cell state dim: 64 | Epochs: 100",
        "[AI LSTM] Epoch 50/100 -> Training RMSE: 0.0215 | Validation RMSE: 0.0242",
        "[AI LSTM] Resolving gradient explosion via Gradient Clipping (limit=1.0)...",
        "[AI LSTM] Training loss convergence achieved at Epoch 100.",
        "[AI LSTM] LSTM temporal forecast vector deployed to load grid."
    ],
    xgboost: [
        "[AI XGB] Model: Gradient Boosted Trees | Objective: reg:squarederror",
        "[AI XGB] Hyperparameters: learning_rate=0.08, max_depth=6, n_estimators=100",
        "[AI XGB] Compiling training dataset partitions. Trees building...",
        "[AI XGB] Tree boosting round 20/100 -> Training Loss: 0.0561",
        "[AI XGB] Feature importances calculated: Hour: 44%, Temp: 38%, CloudCover: 18%",
        "[AI XGB] Ensembling complete. Predictor tree array constructed."
    ],
    linear: [
        "[AI RIDGE] Model selection: Ridge Linear Regression (Alpha=1.0 regularizer)",
        "[AI RIDGE] Processing weather features: temp vector, cloud weight, wind speed.",
        "[AI RIDGE] Fitting model utilizing coordinate descent...",
        "[AI RIDGE] Linear coefficients calculated. Feature importance: Temp: 62%, Wind: 25%, Clouds: 13%",
        "[AI RIDGE] Training completed successfully. Forecast vector active."
    ]
};

// ==========================================================================
// GRID CALCULATION ENGINE LOOP
// ==========================================================================

function updateGridSimulation() {
    if (!grid.isPlaying) return;

    // 1. Advance Time
    grid.currentTime += grid.speedMinutesPerSec;
    if (grid.currentTime >= 1440) {
        grid.currentTime = 0;
        grid.currentDay += 1;
    }

    const currentHour = Math.floor(grid.currentTime / 60);
    const timeStr = grid.formatTimeStr(grid.currentTime);
    elements.gridClock.textContent = `DAY ${grid.currentDay} - ${timeStr}`;

    // 2. Load (Demand) Calculations
    const baseLoad = grid.calculateBaseLoad(currentHour);
    
    // AC Heat load vs heating load adjustment
    let tempAdjustment = 0.0;
    if (grid.temperature > 25.0) {
        // Air conditioning surge (1.4 MW per degree above 25)
        tempAdjustment = (grid.temperature - 25.0) * 1.4;
    } else if (grid.temperature < 15.0) {
        // Heating demand (0.8 MW per degree below 15)
        tempAdjustment = (15.0 - grid.temperature) * 0.8;
    }
    
    // Random noise variation
    const noise = Math.sin(grid.currentTime / 10) * 1.2 + (Math.random() * 0.8 - 0.4);
    
    // Base load increases in heatwave scenario
    const scenarioMultiplier = grid.currentScenario === 'heatwave' ? 1.2 : 1.0;
    const actualLoad = Math.max(10.0, (baseLoad * scenarioMultiplier) + tempAdjustment + noise);

    // 3. Solar & Wind Renewable Calculations
    // Solar Output math (sine wave peaking at 12pm, reduced by cloud cover)
    let solarPotential = 35.0; // MW Max
    let solarOutput = 0.0;
    if (currentHour >= 6 && currentHour <= 18) {
        // Peak sine curve
        solarOutput = solarPotential * Math.sin((currentHour - 6) / 12 * Math.PI);
        // Reduce by cloud cover (90% reduction at 100% clouds)
        solarOutput = solarOutput * (1.0 - (grid.cloudCover / 100.0) * 0.88);
    }
    solarOutput = Math.max(0.0, solarOutput);

    // Wind Output math (non-linear turbine cut-in and rated speeds)
    const windCapacity = 20.0; // MW Max
    let windOutput = 0.0;
    if (grid.windSpeed >= 3.0 && grid.windSpeed <= 25.0) {
        // Cubic power curve between 3 and 12 m/s, rated at max above 12, cutout at 25 m/s
        if (grid.windSpeed < 12.0) {
            windOutput = windCapacity * Math.pow((grid.windSpeed - 3.0) / 9.0, 2.5);
        } else {
            windOutput = windCapacity; // rated power
        }
    } else if (grid.windSpeed > 25.0) {
        // Cut-out (turbines shut down for structural safety)
        windOutput = 0.0;
    }
    
    const totalRenewables = solarOutput + windOutput;

    // 4. Battery Storage Control (Energy Storage System - ESS)
    // Charging efficiency: 90%, Discharging efficiency: 92%
    let batteryPowerRate = 0.0; // MW (+ charging, - discharging)
    const powerSurplusDeficit = totalRenewables - actualLoad;
    
    if (grid.batteryMode === 'auto') {
        // Smart energy routing
        if (powerSurplusDeficit > 0.0) {
            // Surplus -> Charge battery
            const availableCapacity = grid.batteryCapacity - grid.batteryCharge;
            // Convert MW surplus into MWh capacity (10 min interval = 1/6 of hour)
            const chargeMwhNeeded = availableCapacity;
            const maxChargeFromSurplus = powerSurplusDeficit;
            batteryPowerRate = Math.min(grid.batteryMaxRate, Math.min(maxChargeFromSurplus, chargeMwhNeeded * 6.0));
        } else {
            // Deficit -> Discharge battery to stabilize
            const availableDischarge = grid.batteryCharge;
            const deficitMw = Math.abs(powerSurplusDeficit);
            batteryPowerRate = -Math.min(grid.batteryMaxRate, Math.min(deficitMw, availableDischarge * 6.0));
        }
    } else if (grid.batteryMode === 'charge') {
        // Force charge up to max limit or capacity
        const availableCapacity = grid.batteryCapacity - grid.batteryCharge;
        batteryPowerRate = Math.min(grid.batteryMaxRate, availableCapacity * 6.0);
    } else if (grid.batteryMode === 'discharge') {
        // Force discharge down to zero
        const availableDischarge = grid.batteryCharge;
        batteryPowerRate = -Math.min(grid.batteryMaxRate, availableDischarge * 6.0);
    }

    // Update battery capacity (MWh) based on rate (MW) and interval time (speed minutes converted to hours)
    const elapsedHrs = (grid.speedMinutesPerSec) / 60.0;
    if (batteryPowerRate > 0) {
        grid.batteryCharge += batteryPowerRate * elapsedHrs * 0.90; // 90% charge efficiency
    } else if (batteryPowerRate < 0) {
        grid.batteryCharge += batteryPowerRate * elapsedHrs * 1.08; // discharge drawing including efficiency penalty
    }
    
    grid.batteryCharge = Math.max(0.0, Math.min(grid.batteryCapacity, grid.batteryCharge));
    grid.batterySoC = (grid.batteryCharge / grid.batteryCapacity) * 100.0;
    grid.batteryCurrentRate = batteryPowerRate;

    // 5. Dynamic Grid Congestion, Fossil Backups, Curtailment
    let netGridLoad = actualLoad - totalRenewables;
    
    // Apply battery buffer to net grid load
    netGridLoad += batteryPowerRate; // charging increases load on renewables/grid, discharging decreases load
    
    // If net grid load is positive, fossil-fuel backup ramps up to cover deficit
    let fossilReserve = 0.0;
    if (netGridLoad > 0.0) {
        fossilReserve = netGridLoad;
        grid.curtailedRenewables = 0.0;
    } else {
        // Renewable surplus (negative net grid load)
        fossilReserve = 0.0;
        // Renewable curtailment occurs if battery is full and load is met
        grid.curtailedRenewables = Math.abs(netGridLoad);
    }

    // Grid Frequency fluctuations based on balance
    const frequencyBase = 60.00;
    const loadImbalance = actualLoad - (totalRenewables - grid.curtailedRenewables - batteryPowerRate);
    grid.fossilBackupRate = fossilReserve;
    
    // Stabilized by battery grid support
    grid.gridFrequency = frequencyBase - (loadImbalance / 500.0) + (Math.random() * 0.015 - 0.0075);
    // Boundary clamp for safety display
    grid.gridFrequency = Math.max(59.10, Math.min(60.80, grid.gridFrequency));

    // 6. Dynamic Pricing Calculations
    // Congestion triggers price hikes
    if (grid.currentScenario === 'congestion') {
        grid.congestionFactor = 0.8;
    } else {
        grid.congestionFactor = 0.0;
    }
    
    const priceVal = grid.calculatePriceValue(netGridLoad, grid.congestionFactor);
    
    // 7. Carbon footprint calculation
    // Clean renewables and batteries reduce carbon intensity
    // Fossil fuel grid baseline is 450g/kWh. Clean solar/wind has 0g.
    const cleanMixRatio = totalRenewables > 0 ? (totalRenewables - grid.curtailedRenewables) / (actualLoad || 1) : 0;
    const carbonIntensity = Math.max(12, Math.round(450 * (1 - Math.min(1.0, cleanMixRatio)) + grid.fossilBackupRate * 2));
    
    // Accumulate carbon saved today
    if (cleanMixRatio > 0.1) {
        grid.carbonSavedToday += (totalRenewables - grid.curtailedRenewables) * elapsedHrs * 450.0 / 1000.0; // kg CO2
    }

    // 8. Log into history buffers
    // Only add a historic point if simulated clock passes a 10-minute mark
    if (grid.currentTime % 10 === 0) {
        grid.history.push({
            timeStr: timeStr,
            minute: grid.currentTime,
            load: actualLoad,
            solar: solarOutput,
            wind: windOutput,
            battery: batteryPowerRate,
            price: priceVal,
            frequency: grid.gridFrequency
        });
        
        if (grid.history.length > grid.historyLimit) {
            grid.history.shift();
        }
    }

    // 9. Update HTML components
    updateUIElements(actualLoad, baseLoad, solarOutput, windOutput, priceVal, carbonIntensity);
    
    // 10. Redraw SVG Charts
    drawLiveDispatchChart();
    drawForecastChart();
}

// ==========================================================================
// UI COMPONENT SYNCHRONIZATION
// ==========================================================================

function updateUIElements(load, base, solar, wind, price, intensity) {
    // 1. KPI Panel Load
    elements.valActualLoad.textContent = load.toFixed(1);
    elements.valBaseLoad.textContent = `${base.toFixed(1)} MW`;
    
    // Calc accuracy metrics based on simulated ML predictions
    const errorPct = Math.min(15, Math.abs(load - (base + 1.2)) / (load || 1) * 100);
    const forecastAcc = (100 - errorPct).toFixed(1);
    elements.valForecastAcc.textContent = `${forecastAcc}%`;
    elements.barLoadCapacity.style.width = `${Math.min(100, (load / 80) * 100)}%`;

    // 2. KPI Panel Renewables
    const totalGen = solar + wind;
    const renewPct = Math.min(100, Math.round((totalGen / (load || 1)) * 100));
    elements.valRenewablePercent.textContent = renewPct;
    elements.valSolarMw.textContent = `${solar.toFixed(1)} MW`;
    elements.valWindMw.textContent = `${wind.toFixed(1)} MW`;
    elements.valCurtailment.textContent = `${grid.curtailedRenewables.toFixed(1)} MW`;
    if (grid.curtailedRenewables > 0.1) {
        elements.valCurtailment.className = "mono-value red-text";
    } else {
        elements.valCurtailment.className = "mono-value";
    }
    
    // Segment bars
    const solarBarPct = Math.min(100, (solar / 80) * 100);
    const windBarPct = Math.min(100, (wind / 80) * 100);
    const restBarPct = Math.max(0, 100 - solarBarPct - windBarPct);
    
    elements.barSolarPct.style.width = `${solarBarPct}%`;
    elements.barWindPct.style.width = `${windBarPct}%`;
    elements.barOtherPct.style.width = `${restBarPct}%`;

    // 3. KPI Pricing
    elements.valDynamicPrice.textContent = price.toFixed(3);
    
    // Compute avg price in history
    const avgHistoryPrice = grid.history.reduce((sum, item) => sum + item.price, 0) / grid.history.length;
    elements.valAvgPrice.textContent = `$${avgHistoryPrice.toFixed(3)}/kWh`;
    
    // Adjust warning tier colors
    if (price > 0.22) {
        elements.valPriceRate.textContent = "PEAK TARIFFS";
        elements.valPriceRate.className = "rate-status red-text";
        elements.barPriceTier.className = "progress-bar-fill pink red-text";
        elements.gridStatus.className = "grid-status-badge pulse-glow red";
        elements.gridStatusText.textContent = "PEAK GRID LOAD";
    } else if (price < 0.05) {
        elements.valPriceRate.textContent = "SURPLUS RATES";
        elements.valPriceRate.className = "rate-status text-green";
        elements.barPriceTier.className = "progress-bar-fill pink text-green";
        elements.gridStatus.className = "grid-status-badge pulse-glow yellow";
        elements.gridStatusText.textContent = "RENEWABLE SURPLUS";
    } else {
        elements.valPriceRate.textContent = "NOMINAL RATE";
        elements.valPriceRate.className = "rate-status green-text";
        elements.barPriceTier.className = "progress-bar-fill pink";
        elements.gridStatus.className = "grid-status-badge pulse-glow green";
        elements.gridStatusText.textContent = "GRID OPERATING STABLE";
    }
    elements.barPriceTier.style.width = `${Math.min(100, ((price + 0.05) / 0.55) * 100)}%`;

    // 4. KPI Battery & Grid Health
    elements.valBatterySoc.textContent = grid.batterySoC.toFixed(1);
    elements.valGridFreq.textContent = `${grid.gridFrequency.toFixed(2)} Hz`;
    elements.barBatterySoc.style.width = `${grid.batterySoC.toFixed(0)}%`;
    
    const batRate = grid.batteryCurrentRate;
    if (batRate > 0.1) {
        elements.valBatteryState.textContent = `CHARGING (+${batRate.toFixed(1)} MW)`;
        elements.valBatteryState.className = "mono-value text-green";
    } else if (batRate < -0.1) {
        elements.valBatteryState.textContent = `DISCHARGING (${batRate.toFixed(1)} MW)`;
        elements.valBatteryState.className = "mono-value text-purple";
    } else {
        elements.valBatteryState.textContent = "HOLD STATE (0.0 MW)";
        elements.valBatteryState.className = "mono-value";
    }

    // 5. Climate sliders
    elements.valCtrlTemp.textContent = `${grid.temperature.toFixed(0)}°C`;
    elements.valCtrlClouds.textContent = `${grid.cloudCover.toFixed(0)}%`;
    elements.valCtrlWind.textContent = `${grid.windSpeed.toFixed(1)} m/s`;

    // 6. Sustainability Panel Carbon
    elements.valCarbonIntensity.textContent = `${intensity} g/kWh`;
    elements.valCo2Saved.textContent = grid.carbonSavedToday.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    elements.barCarbonIntensity.style.width = `${Math.min(100, (intensity / 500) * 100)}%`;
    
    if (intensity < 180) {
        elements.barCarbonIntensity.className = "intensity-bar-fill green";
        elements.valCarbonIntensity.className = "mono-value text-green";
    } else if (intensity >= 180 && intensity < 320) {
        elements.barCarbonIntensity.className = "intensity-bar-fill yellow";
        elements.valCarbonIntensity.className = "mono-value text-amber";
    } else {
        elements.barCarbonIntensity.className = "intensity-bar-fill red";
        elements.valCarbonIntensity.className = "mono-value red-text";
    }

    // 7. Intelligent Advisory System Updates
    triggerAdvisoryLog(load, solar, wind, price, intensity);
}

// Generate context-aware recommendations based on current grid diagnostics
let advisoryCooldown = 0;
function triggerAdvisoryLog(load, solar, wind, price, intensity) {
    if (advisoryCooldown > 0) {
        advisoryCooldown--;
        return;
    }
    
    // Cooldown duration to prevent message spamming
    advisoryCooldown = 5;

    const list = elements.advisorListContainer;
    list.innerHTML = ""; // Clear log
    
    const items = [];

    // Base operational warnings
    if (price > 0.22) {
        items.push({
            type: "warning",
            icon: "🚨",
            text: `High pricing event ($${price.toFixed(3)}/kWh). Peak hours demand mitigation recommended. Dispatch batteries immediately.`
        });
    }

    if (grid.batterySoC < 15.0) {
        items.push({
            type: "warning",
            icon: "🪫",
            text: `ESS battery reserves critical (${grid.batterySoC.toFixed(1)}%). Commencing reserve generator operations.`
        });
    } else if (grid.batterySoC > 95.0 && solar + wind > load) {
        items.push({
            type: "warning",
            icon: "⚠️",
            text: `Storage banks saturated at 100%. Renewable energy curtailment active (${grid.curtailedRenewables.toFixed(1)} MW wasted).`
        });
    }

    if (solar + wind > load && grid.batterySoC < 90) {
        items.push({
            type: "positive",
            icon: "🔋",
            text: "RENEWABLE SURPLUS: Commencing battery storage charging protocols to prevent grid over-frequency."
        });
    }

    if (intensity < 150) {
        items.push({
            type: "positive",
            icon: "🍃",
            text: `Clean energy mix active. Current grid carbon intensity extremely low (${intensity} g/kWh). A+ rating.`
        });
    } else if (intensity > 350) {
        items.push({
            type: "warning",
            icon: "🏭",
            text: `Fossil backup intensity detected (${intensity} g/kWh). Deploy carbon offsets or battery shaving systems.`
        });
    }

    // Fallback normal messages
    if (items.length === 0) {
        items.push({
            type: "normal",
            icon: "💡",
            text: `Grid normal. Frequency standard at ${grid.gridFrequency.toFixed(2)} Hz. Pricing dynamic controls holding at $${price.toFixed(3)}/kWh.`
        });
        items.push({
            type: "normal",
            icon: "📊",
            text: "AI engine optimizing line dispatch constraints. Forecast profile tracks nominal deviation targets."
        });
    }

    // Append to UI
    items.forEach(it => {
        const div = document.createElement('div');
        div.className = `advisor-item ${it.type}`;
        div.innerHTML = `
            <div class="adv-icon">${it.icon}</div>
            <div class="adv-text">${it.text}</div>
        `;
        list.appendChild(div);
    });
}

// ==========================================================================
// SVG CHART DRAWING UTILITIES
// ==========================================================================

// Map Cartesian coordinates to SVG viewport coordinates
function getSvgX(simMinute, minMinute, maxMinute) {
    const scale = (simMinute - minMinute) / (maxMinute - minMinute);
    return svgConfig.margin.left + (scale * svgConfig.chartWidth);
}

function getSvgY(value, minValue, maxValue) {
    const scale = (value - minValue) / (maxValue - minValue);
    // SVG 0,0 is at the top left, so we invert Y coordinate mapping
    return svgConfig.margin.top + ((1.0 - scale) * svgConfig.chartHeight);
}

// 1. Live Grid Operations Dispatch Chart Rendering
function drawLiveDispatchChart() {
    const svg = elements.svgDispatch;
    
    // Clear dynamic paths and labels (keep <defs> and grid)
    const elementsToRemove = svg.querySelectorAll('.dynamic-chart-element');
    elementsToRemove.forEach(el => el.remove());

    if (grid.history.length < 2) return;

    // Bounds configuration
    const minutes = grid.history.map(d => d.minute);
    const minX = Math.min(...minutes);
    const maxX = Math.max(...minutes);
    
    // Value range configs
    const minY = -15.0; // Battery discharging can go below 0
    const maxY = 75.0;  // Maximum range for load and PV spikes

    // RENDER GRIDS & Y AXIS
    const gridG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gridG.setAttribute("class", "dynamic-chart-element");
    svg.appendChild(gridG);

    // Draw horizontal grid lines and Y-axis text
    const yGridValues = [-10, 0, 20, 40, 60, 70];
    yGridValues.forEach(val => {
        const y = getSvgY(val, minY, maxY);
        
        // Grid Line
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", svgConfig.margin.left);
        line.setAttribute("y1", y);
        line.setAttribute("x2", svgConfig.width - svgConfig.margin.right);
        line.setAttribute("y2", y);
        line.setAttribute("class", "grid-line");
        gridG.appendChild(line);

        // Labels
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", svgConfig.margin.left - 8);
        text.setAttribute("y", y + 4);
        text.setAttribute("text-anchor", "end");
        text.setAttribute("class", "axis-text");
        text.textContent = `${val} MW`;
        gridG.appendChild(text);
    });

    // Draw X-axis timeline markers (every 4 hours)
    const hoursCount = 6; // 6 intervals of 4h
    for (let i = 0; i <= hoursCount; i++) {
        const targetMin = minX + ((maxX - minX) / hoursCount) * i;
        const x = getSvgX(targetMin, minX, maxX);
        const timeStr = grid.formatTimeStr(targetMin).replace(':00', '');

        // Vertical tick grid
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x);
        line.setAttribute("y1", svgConfig.margin.top);
        line.setAttribute("x2", x);
        line.setAttribute("y2", svgConfig.height - svgConfig.margin.bottom);
        line.setAttribute("class", "grid-line");
        gridG.appendChild(line);

        // Text labels
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x);
        text.setAttribute("y", svgConfig.height - svgConfig.margin.bottom + 16);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "axis-text");
        text.textContent = timeStr;
        gridG.appendChild(text);
    }

    // DRAW SHADED AREA FIELDS
    // 1. Demand/Load Area fill
    const pathLoad = drawAreaPath(grid.history, d => d.load, minX, maxX, minY, maxY, "grad-load");
    gridG.appendChild(pathLoad);
    
    // 2. Solar Area fill
    const pathSolar = drawAreaPath(grid.history, d => d.solar, minX, maxX, minY, maxY, "grad-solar");
    gridG.appendChild(pathSolar);

    // 3. Wind Area fill
    const pathWind = drawAreaPath(grid.history, d => d.wind, minX, maxX, minY, maxY, "grad-wind");
    gridG.appendChild(pathWind);

    // DRAW LINE CHARTS ON TOP
    const loadLine = drawLinePath(grid.history, d => d.load, minX, maxX, minY, maxY, "chart-path path-load");
    const solarLine = drawLinePath(grid.history, d => d.solar, minX, maxX, minY, maxY, "chart-path path-solar");
    const windLine = drawLinePath(grid.history, d => d.wind, minX, maxX, minY, maxY, "chart-path path-wind");
    const batteryLine = drawLinePath(grid.history, d => d.battery, minX, maxX, minY, maxY, "chart-path path-battery");

    gridG.appendChild(loadLine);
    gridG.appendChild(solarLine);
    gridG.appendChild(windLine);
    gridG.appendChild(batteryLine);
}

// Area SVG string constructor
function drawAreaPath(data, valueFn, minX, maxX, minY, maxY, gradName) {
    let dStr = "";
    
    data.forEach((d, index) => {
        const x = getSvgX(d.minute, minX, maxX);
        const y = getSvgY(valueFn(d), minY, maxY);
        if (index === 0) {
            dStr += `M ${x} ${y}`;
        } else {
            dStr += ` L ${x} ${y}`;
        }
    });

    // Close area polygon
    const startX = getSvgX(data[0].minute, minX, maxX);
    const endX = getSvgX(data[data.length - 1].minute, minX, maxX);
    const zeroY = getSvgY(0, minY, maxY);
    
    dStr += ` L ${endX} ${zeroY} L ${startX} ${zeroY} Z`;

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", dStr);
    path.setAttribute("fill", `url(#${gradName})`);
    path.setAttribute("stroke", "none");
    return path;
}

// Line SVG path constructor
function drawLinePath(data, valueFn, minX, maxX, minY, maxY, className) {
    let dStr = "";
    data.forEach((d, index) => {
        const x = getSvgX(d.minute, minX, maxX);
        const y = getSvgY(valueFn(d), minY, maxY);
        if (index === 0) {
            dStr += `M ${x} ${y}`;
        } else {
            dStr += ` L ${x} ${y}`;
        }
    });

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", dStr);
    path.setAttribute("class", className);
    return path;
}

// 2. AI Forecast Forecast Chart Drawing
// Generates forecasting arrays utilizing weather, scenario, and model deviations
function generate24hForecast() {
    const forecastPoints = [];
    const baseHour = Math.floor(grid.currentTime / 60);
    const currentMin = grid.currentTime;
    
    // Prediction vectors
    for (let i = 0; i < 24; i++) {
        const forecastHour = (baseHour + i) % 24;
        const simMinute = currentMin + (i * 60);
        const timeStr = grid.formatTimeStr(simMinute);
        
        // Base profile calculations
        let loadPredict = grid.calculateBaseLoad(forecastHour);
        
        // Weather adjustment forecasting
        let tempAdjust = 0.0;
        if (grid.temperature > 25) {
            tempAdjust = (grid.temperature - 25) * 1.35;
        } else if (grid.temperature < 15) {
            tempAdjust = (15 - grid.temperature) * 0.7;
        }
        
        loadPredict = loadPredict + tempAdjust;
        
        // Solar prediction modeling
        let solarPredict = 0.0;
        if (forecastHour >= 6 && forecastHour <= 18) {
            solarPredict = 32.0 * Math.sin((forecastHour - 6) / 12 * Math.PI) * (1.0 - (grid.cloudCover / 100) * 0.85);
        }

        // Add subtle offsets depending on selected machine learning model to simulate algorithmic behaviors
        let modelDeviation = 0.0;
        if (grid.selectedModel === 'xgboost') {
            // XGBoost exhibits a stair-stepped/blocky curve because of decision tree step predictions
            const blockyHour = Math.floor(forecastHour / 2) * 2;
            modelDeviation = Math.cos((blockyHour - 4) / 24 * 2 * Math.PI) * 2.2 + (Math.sin(forecastHour) > 0 ? 0.8 : -0.8);
        } else if (grid.selectedModel === 'linear') {
            // Underfitting error curves
            modelDeviation = Math.sin(forecastHour / 4) * 3.5;
        } else {
            // LSTM - Highly accurate, smooth time-series sequence prediction
            modelDeviation = Math.sin((forecastHour - 2) / 6) * 0.45;
        }
        
        loadPredict += modelDeviation;
        
        // Price forecast calculations
        const netLoadVal = loadPredict - solarPredict;
        const pricePredict = grid.calculatePriceValue(netLoadVal, 0.0);

        forecastPoints.push({
            hour: forecastHour,
            minute: simMinute,
            timeStr: timeStr,
            load: Math.max(10.0, loadPredict),
            solar: Math.max(0.0, solarPredict),
            price: pricePredict
        });
    }
    
    return forecastPoints;
}

function drawForecastChart() {
    const svg = elements.svgForecast;
    
    // Clear dynamic paths
    const elementsToRemove = svg.querySelectorAll('.dynamic-chart-element');
    elementsToRemove.forEach(el => el.remove());

    const forecasts = generate24hForecast();
    if (forecasts.length < 2) return;

    // Time bounding
    const minutes = forecasts.map(d => d.minute);
    const minX = Math.min(...minutes);
    const maxX = Math.max(...minutes);
    
    // Load limits
    const minY = -5.0;
    const maxY = 75.0;

    const gridG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gridG.setAttribute("class", "dynamic-chart-element");
    svg.appendChild(gridG);

    // Grid overlays
    const yGridValues = [0, 20, 40, 60, 70];
    yGridValues.forEach(val => {
        const y = getSvgY(val, minY, maxY);
        
        // Grid Line
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", svgConfig.margin.left);
        line.setAttribute("y1", y);
        line.setAttribute("x2", svgConfig.width - svgConfig.margin.right);
        line.setAttribute("y2", y);
        line.setAttribute("class", "grid-line");
        gridG.appendChild(line);

        // Axis scale text
        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", svgConfig.margin.left - 8);
        text.setAttribute("y", y + 4);
        text.setAttribute("text-anchor", "end");
        text.setAttribute("class", "axis-text");
        text.textContent = `${val} MW`;
        gridG.appendChild(text);
    });

    // Draw dynamic timeline labels
    for (let i = 0; i <= 6; i++) {
        const targetMin = minX + ((maxX - minX) / 6) * i;
        const x = getSvgX(targetMin, minX, maxX);
        const timeStr = grid.formatTimeStr(targetMin).replace(':00', '');

        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x);
        line.setAttribute("y1", svgConfig.margin.top);
        line.setAttribute("x2", x);
        line.setAttribute("y2", svgConfig.height - svgConfig.margin.bottom);
        line.setAttribute("class", "grid-line");
        gridG.appendChild(line);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", x);
        text.setAttribute("y", svgConfig.height - svgConfig.margin.bottom + 16);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("class", "axis-text");
        text.textContent = timeStr;
        gridG.appendChild(text);
    }

    // DRAW FORECAST PATH LINES
    // Shaded AI Forecast area
    const pathAreaForecast = drawAreaPath(forecasts, d => d.load, minX, maxX, minY, maxY, "grad-forecast");
    gridG.appendChild(pathAreaForecast);

    // Actual Historic Line (Overlaying part of forecast chart to check accuracy)
    // Draw past 12 hours of actual data from history
    const sliceCount = 36; // 6 hours
    const historicSlice = grid.history.slice(-sliceCount);
    if (historicSlice.length > 2) {
        const actualLoadLine = drawLinePath(historicSlice, d => d.load, minX, maxX, minY, maxY, "chart-path path-load");
        gridG.appendChild(actualLoadLine);
    }

    // Forecast lines
    const loadForecastLine = drawLinePath(forecasts, d => d.load, minX, maxX, minY, maxY, "chart-path path-forecast");
    const solarForecastLine = drawLinePath(forecasts, d => d.solar, minX, maxX, minY, maxY, "chart-path path-solar-forecast");
    
    // Draw pricing secondary line scale (mapped pricing 0.0 - 0.50 to coordinates minY - maxY)
    const priceScaleFn = priceVal => {
        // map -$0.05 to $0.50 into Y coordinates
        const scaleVal = (priceVal + 0.05) / 0.55 * 80;
        return scaleVal;
    };
    
    const priceForecastLine = drawLinePath(forecasts, d => priceScaleFn(d.price), minX, maxX, minY, maxY, "chart-path path-price-forecast");

    gridG.appendChild(loadForecastLine);
    gridG.appendChild(solarForecastLine);
    gridG.appendChild(priceForecastLine);
}

// ==========================================================================
// INTERACTIVE TOOLTIPS HOVER ENGINE
// ==========================================================================

function setupTooltipHandlers() {
    // 1. Live Operations Dispatch Tooltip Tracking
    elements.svgDispatch.addEventListener('mousemove', (e) => {
        const bounds = elements.svgDispatch.getBoundingClientRect();
        const mouseX = e.clientX - bounds.left;
        
        // Check if mouse inside coordinates grid
        const leftLimit = getSvgX(grid.history[0].minute, grid.history[0].minute, grid.history[grid.history.length-1].minute);
        const rightLimit = getSvgX(grid.history[grid.history.length-1].minute, grid.history[0].minute, grid.history[grid.history.length-1].minute);
        
        if (mouseX < leftLimit || mouseX > rightLimit) {
            elements.dispatchTooltip.classList.add('hidden');
            removeSvgIndicatorLines(elements.svgDispatch);
            return;
        }

        // Calculate closest data index based on X scale percent
        const scalePct = (mouseX - leftLimit) / (rightLimit - leftLimit);
        const index = Math.min(grid.history.length - 1, Math.max(0, Math.round(scalePct * (grid.history.length - 1))));
        const data = grid.history[index];

        // Draw hover guides
        drawSvgIndicatorLine(elements.svgDispatch, data.minute, grid.history[0].minute, grid.history[grid.history.length-1].minute, data, -15, 75);

        // Set HTML Tooltip Content
        const tooltip = elements.dispatchTooltip;
        tooltip.classList.remove('hidden');
        tooltip.style.left = `${e.clientX - bounds.left + 15}px`;
        tooltip.style.top = `${e.clientY - bounds.top - 85}px`;
        tooltip.innerHTML = `
            <div class="title">${data.timeStr} (Actual)</div>
            <div class="row"><span>Demand:</span><span class="val text-load">${data.load.toFixed(1)} MW</span></div>
            <div class="row"><span>Solar:</span><span class="val text-solar">${data.solar.toFixed(1)} MW</span></div>
            <div class="row"><span>Wind:</span><span class="val text-wind">${data.wind.toFixed(1)} MW</span></div>
            <div class="row"><span>Battery:</span><span class="val text-battery">${data.battery.toFixed(1)} MW</span></div>
            <div class="row"><span>Tariff:</span><span class="val text-pink">$${data.price.toFixed(3)}/kWh</span></div>
        `;
    });

    elements.svgDispatch.addEventListener('mouseleave', () => {
        elements.dispatchTooltip.classList.add('hidden');
        removeSvgIndicatorLines(elements.svgDispatch);
    });

    // 2. AI Forecast Tooltip Tracking
    elements.svgForecast.addEventListener('mousemove', (e) => {
        const bounds = elements.svgForecast.getBoundingClientRect();
        const mouseX = e.clientX - bounds.left;
        
        const forecasts = generate24hForecast();
        const leftLimit = getSvgX(forecasts[0].minute, forecasts[0].minute, forecasts[forecasts.length-1].minute);
        const rightLimit = getSvgX(forecasts[forecasts.length-1].minute, forecasts[0].minute, forecasts[forecasts.length-1].minute);
        
        if (mouseX < leftLimit || mouseX > rightLimit) {
            elements.forecastTooltip.classList.add('hidden');
            removeSvgIndicatorLines(elements.svgForecast);
            return;
        }

        const scalePct = (mouseX - leftLimit) / (rightLimit - leftLimit);
        const index = Math.min(forecasts.length - 1, Math.max(0, Math.round(scalePct * (forecasts.length - 1))));
        const data = forecasts[index];

        // Draw hover guides
        drawSvgIndicatorLine(elements.svgForecast, data.minute, forecasts[0].minute, forecasts[forecasts.length-1].minute, data, -5, 75, true);

        const tooltip = elements.forecastTooltip;
        tooltip.classList.remove('hidden');
        tooltip.style.left = `${e.clientX - bounds.left + 15}px`;
        tooltip.style.top = `${e.clientY - bounds.top - 80}px`;
        tooltip.innerHTML = `
            <div class="title">${data.timeStr} (Forecast)</div>
            <div class="row"><span>Demand FC:</span><span class="val text-load">${data.load.toFixed(1)} MW</span></div>
            <div class="row"><span>Solar FC:</span><span class="val text-solar">${data.solar.toFixed(1)} MW</span></div>
            <div class="row"><span>Price FC:</span><span class="val text-pink">$${data.price.toFixed(3)}/kWh</span></div>
        `;
    });

    elements.svgForecast.addEventListener('mouseleave', () => {
        elements.forecastTooltip.classList.add('hidden');
        removeSvgIndicatorLines(elements.svgForecast);
    });
}

// Inject SVGs vertical tracking guidelines
function drawSvgIndicatorLine(svg, targetMin, minMin, maxMin, data, minY, maxY, isForecast = false) {
    removeSvgIndicatorLines(svg);
    
    const x = getSvgX(targetMin, minMin, maxMin);
    
    // Vertical line
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", svgConfig.margin.top);
    line.setAttribute("x2", x);
    line.setAttribute("y2", svgConfig.height - svgConfig.margin.bottom);
    line.setAttribute("class", "interactive-line hover-guide");
    svg.appendChild(line);

    // Indicator Dot on load line
    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", getSvgY(data.load, minY, maxY));
    dot.setAttribute("class", "hover-dot load hover-guide");
    svg.appendChild(dot);
    
    if (!isForecast) {
        // Solar Dot
        const dotSolar = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dotSolar.setAttribute("cx", x);
        dotSolar.setAttribute("cy", getSvgY(data.solar, minY, maxY));
        dotSolar.setAttribute("class", "hover-dot solar hover-guide");
        svg.appendChild(dotSolar);

        // Wind Dot
        const dotWind = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dotWind.setAttribute("cx", x);
        dotWind.setAttribute("cy", getSvgY(data.wind, minY, maxY));
        dotWind.setAttribute("class", "hover-dot wind hover-guide");
        svg.appendChild(dotWind);
    }
}

function removeSvgIndicatorLines(svg) {
    const lines = svg.querySelectorAll('.hover-guide');
    lines.forEach(line => line.remove());
}

// ==========================================================================
// SCENARIO & BUTTON CLICK ACTIONS
// ==========================================================================

function selectScenario(scenarioName) {
    grid.currentScenario = scenarioName;
    
    // Set active class
    const buttons = document.querySelectorAll('.btn-scenario');
    buttons.forEach(btn => {
        if (btn.getAttribute('data-scenario') === scenarioName) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Log update into training terminal
    let systemMessage = "";

    switch(scenarioName) {
        case 'normal':
            grid.temperature = 24.0;
            grid.cloudCover = 15;
            grid.windSpeed = 5.5;
            elements.sliderTemp.value = 24;
            elements.sliderClouds.value = 15;
            elements.sliderWind.value = 5.5;
            systemMessage = "[SCENARIO] Switched to normal grid operations. Ambient temperature: 24°C, nominal demand, balanced renewables.";
            break;
            
        case 'heatwave':
            grid.temperature = 40.0;
            grid.cloudCover = 8;
            grid.windSpeed = 2.0;
            elements.sliderTemp.value = 40;
            elements.sliderClouds.value = 8;
            elements.sliderWind.value = 2.0;
            systemMessage = "[SCENARIO] HEATWAVE INITIATED! Surge in residential & industrial A/C loads. Net load approaching grid capacities. Battery buffer active.";
            break;
            
        case 'cloudy':
            grid.temperature = 17.0;
            grid.cloudCover = 95;
            grid.windSpeed = 1.5;
            elements.sliderTemp.value = 17;
            elements.sliderClouds.value = 95;
            elements.sliderWind.value = 1.5;
            systemMessage = "[SCENARIO] HEAVY CLOUD COVER active. Solar potential cut by 85%. Discharging storage banks to balance loss.";
            break;
            
        case 'storm':
            grid.temperature = 11.0;
            grid.cloudCover = 85;
            grid.windSpeed = 23.5;
            elements.sliderTemp.value = 11;
            elements.sliderClouds.value = 85;
            elements.sliderWind.value = 23.5;
            systemMessage = "[SCENARIO] COLD STORM front active. Solar production low. Wind output surges to maximum turbine rated capacities. Battery recharging triggered.";
            break;
            
        case 'congestion':
            grid.temperature = 27.0;
            grid.cloudCover = 40;
            grid.windSpeed = 5.0;
            elements.sliderTemp.value = 27;
            elements.sliderClouds.value = 40;
            elements.sliderWind.value = 5.0;
            systemMessage = "[SCENARIO] MAIN TRANSFORMER OUTAGE detected at substations. Pricing dispatching +$0.15/kWh transmission penalty congestion.";
            break;
    }
    
    appendConsoleLog(systemMessage);
}

// Append messages to AI developer sandbox log console
function appendConsoleLog(message) {
    const textLog = elements.consoleLogsText;
    textLog.textContent += `\n${message}`;
    // Auto-scroll
    elements.consoleLogsText.parentElement.scrollTop = elements.consoleLogsText.parentElement.scrollHeight;
}

// Interactive Model training loop simulator
function runModelTraining() {
    if (grid.isTraining) return;

    grid.isTraining = true;
    grid.trainingEpoch = 0;
    
    // UI elements update to active state
    elements.btnTrainModel.querySelector('.btn-text').textContent = "Training Model...";
    elements.btnTrainModel.querySelector('.train-loader').classList.remove('hidden');
    elements.btnTrainModel.classList.add('disabled');
    
    elements.trainingStatus.textContent = "TRAINING...";
    elements.trainingStatus.className = "console-status-text training";
    
    const logs = logTemplates[grid.selectedModel] || logTemplates.lstm;
    appendConsoleLog(`\n[SYSTEM] Triggered training routine for model type: ${grid.selectedModel.toUpperCase()}...`);
    
    let logIdx = 0;

    // Simulating epochs
    function trainingStep() {
        if (grid.trainingEpoch >= 100) {
            // Training finished
            grid.isTraining = false;
            elements.btnTrainModel.querySelector('.btn-text').textContent = "Train Forecast Model";
            elements.btnTrainModel.querySelector('.train-loader').classList.add('hidden');
            elements.btnTrainModel.classList.remove('disabled');
            
            elements.trainingStatus.textContent = "Model Up-To-Date";
            elements.trainingStatus.className = "console-status-text idle";
            
            grid.trainingLoss = grid.selectedModel === 'lstm' ? 0.0215 : (grid.selectedModel === 'xgboost' ? 0.0482 : 0.0822);
            grid.trainingValLoss = grid.selectedModel === 'lstm' ? 0.0242 : (grid.selectedModel === 'xgboost' ? 0.0561 : 0.0914);
            
            elements.mValEpochs.textContent = "100 / 100";
            elements.mValLoss.textContent = grid.trainingLoss.toFixed(4);
            elements.mValValLoss.textContent = grid.trainingValLoss.toFixed(4);
            
            appendConsoleLog(logs[logs.length - 1]);
            drawForecastChart(); // refresh
            return;
        }

        grid.trainingEpoch += 5; // increment fast for smooth interface loading
        
        // Animate simulated losses decreasing exponentially
        const startLoss = 0.35;
        const finalLoss = grid.selectedModel === 'lstm' ? 0.0215 : (grid.selectedModel === 'xgboost' ? 0.0482 : 0.0822);
        const progress = grid.trainingEpoch / 100;
        const currentLoss = startLoss - (startLoss - finalLoss) * Math.pow(progress, 0.5);
        const currentValLoss = currentLoss * 1.1;

        elements.mValEpochs.textContent = `${grid.trainingEpoch} / 100`;
        elements.mValLoss.textContent = currentLoss.toFixed(4);
        elements.mValValLoss.textContent = currentValLoss.toFixed(4);

        // Periodically output ML logging messages
        if (grid.trainingEpoch % 20 === 0 && logIdx < logs.length - 1) {
            appendConsoleLog(logs[logIdx]);
            logIdx++;
        }

        requestAnimationFrame(() => setTimeout(trainingStep, 70));
    }

    trainingStep();
}

// ==========================================================================
// REGISTRATION & ATTACHMENT EVENTS
// ==========================================================================

function registerEventListeners() {
    // 1. Play Pause Sim
    elements.btnPlayPause.addEventListener('click', () => {
        grid.isPlaying = !grid.isPlaying;
        if (grid.isPlaying) {
            elements.playPauseIcon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z'); // pause shape
            appendConsoleLog("[SYSTEM] Grid timeline resumed.");
        } else {
            elements.playPauseIcon.setAttribute('d', 'M8 5v14l11-7z'); // play shape
            appendConsoleLog("[SYSTEM] Grid timeline paused.");
        }
    });

    // 2. Speed Slider
    elements.simSpeed.addEventListener('input', (e) => {
        const val = parseInt(e.target.value);
        grid.speedValue = val;
        
        // Map slider indices
        const multiplier = speedMap[val];
        grid.speedMinutesPerSec = multiplier;
        
        if (multiplier === 0) {
            grid.isPlaying = false;
            elements.playPauseIcon.setAttribute('d', 'M8 5v14l11-7z');
            elements.simSpeedVal.textContent = "PAUSED";
            appendConsoleLog("[SYSTEM] Grid simulation speed set to 0x (PAUSED).");
        } else {
            grid.isPlaying = true;
            elements.playPauseIcon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
            elements.simSpeedVal.textContent = `${multiplier}x`;
            appendConsoleLog(`[SYSTEM] Grid simulation speed set to ${multiplier}x.`);
        }
    });

    // 3. Environmental Sliders
    elements.sliderTemp.addEventListener('input', (e) => {
        grid.temperature = parseFloat(e.target.value);
        elements.valCtrlTemp.textContent = `${grid.temperature.toFixed(0)}°C`;
    });
    
    elements.sliderClouds.addEventListener('input', (e) => {
        grid.cloudCover = parseFloat(e.target.value);
        elements.valCtrlClouds.textContent = `${grid.cloudCover.toFixed(0)}%`;
    });
    
    elements.sliderWind.addEventListener('input', (e) => {
        grid.windSpeed = parseFloat(e.target.value);
        elements.valCtrlWind.textContent = `${grid.windSpeed.toFixed(1)} m/s`;
    });

    // 4. Battery Modes
    elements.btnBatAuto.addEventListener('click', () => {
        grid.batteryMode = 'auto';
        setBatteryButtonActive(elements.btnBatAuto);
        appendConsoleLog("[ESS CONTROL] Dynamic Battery Dispatch Mode set to: AUTO (AI Optimization).");
    });
    
    elements.btnBatCharge.addEventListener('click', () => {
        grid.batteryMode = 'charge';
        setBatteryButtonActive(elements.btnBatCharge);
        appendConsoleLog("[ESS CONTROL] Force Charging command overrides active. Pricing dynamic tariffs will recalculate.");
    });
    
    elements.btnBatDischarge.addEventListener('click', () => {
        grid.batteryMode = 'discharge';
        setBatteryButtonActive(elements.btnBatDischarge);
        appendConsoleLog("[ESS CONTROL] Force Discharging override initiated. Offloading battery capacity onto grid.");
    });

    function setBatteryButtonActive(activeButton) {
        [elements.btnBatAuto, elements.btnBatCharge, elements.btnBatDischarge].forEach(btn => {
            btn.classList.remove('active');
        });
        activeButton.classList.add('active');
    }

    // 5. Scenarios Hotkeys
    const scenarioBtns = document.querySelectorAll('.btn-scenario');
    scenarioBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            selectScenario(btn.getAttribute('data-scenario'));
        });
    });

    // 6. ML Model selection & training
    elements.selectMlModel.addEventListener('change', (e) => {
        grid.selectedModel = e.target.value;
        appendConsoleLog(`[AI FORECASTER] Forecasting algorithm target changed to: ${grid.selectedModel.toUpperCase()}. Re-training recommended.`);
    });

    elements.btnTrainModel.addEventListener('click', () => {
        runModelTraining();
    });
}

// ==========================================================================
// SYSTEM INITIATION
// ==========================================================================

function initSystem() {
    // 1. Hook up all listener events
    registerEventListeners();
    
    // 2. Pre-set normal scenario values
    selectScenario('normal');
    
    // 3. Initiate Tooltips Hover Tracking
    setupTooltipHandlers();
    
    // 4. Initial calculations and SVG rendering
    updateGridSimulation();
    
    // 5. Start recurring grid timeline loop (runs every 1 second)
    setInterval(updateGridSimulation, 1000);
}

// Start app on DOM Loaded
document.addEventListener('DOMContentLoaded', initSystem);
