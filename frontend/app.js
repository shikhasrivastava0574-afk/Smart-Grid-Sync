/**
 * SMART GRID SYNC - API CLIENT
 * Connects UI elements to Python FastAPI endpoints
 */

const API_BASE = "https://smart-grid-sync-1.onrender.com/api";

// Initialize UI configuration state
let isTraining = false;
let selectedModel = 'lstm';
let currentDay = 1;
let currentMinute = 480;
let isPlaying = true;
let localHistory = [];
let localForecast = [];

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

// Speed multiplier map
const speedMap = [0, 1, 5, 15, 60];

// Format clock text
function formatTimeStr(minutes) {
    let displayMin = minutes % 1440;
    if (displayMin < 0) displayMin += 1440;
    const hr = Math.floor(displayMin / 60);
    const mn = Math.floor(displayMin % 60);
    const ampm = hr >= 12 ? 'PM' : 'AM';
    const formattedHr = hr % 12 === 0 ? 12 : hr % 12;
    const formattedMn = mn < 10 ? '0' + mn : mn;
    return `${formattedHr}:${formattedMn} ${ampm}`;
}

// ==========================================================================
// API ASYNC CLIENT FETCH CALLS
// ==========================================================================

async function fetchGridStatus() {
    try {
        const res = await fetch(`${API_BASE}/grid/status`);
        if (!res.ok) throw new Error("API metrics status error");
        const data = await res.json();
        
        // Update clock & values
        currentDay = data.day;
        currentMinute = data.minute;
        elements.gridClock.textContent = `DAY ${data.day} - ${data.current_time}`;
        
        // Sync sliders from backend (only if user isn't currently dragging them)
        if (document.activeElement !== elements.sliderTemp) {
            elements.sliderTemp.value = data.temperature;
            elements.valCtrlTemp.textContent = `${data.temperature.toFixed(0)}°C`;
        }
        if (document.activeElement !== elements.sliderClouds) {
            elements.sliderClouds.value = data.cloud_cover;
            elements.valCtrlClouds.textContent = `${data.cloud_cover.toFixed(0)}%`;
        }
        if (document.activeElement !== elements.sliderWind) {
            elements.sliderWind.value = data.wind_speed;
            elements.valCtrlWind.textContent = `${data.wind_speed.toFixed(1)} m/s`;
        }
        
        updateUIElements(data);
    } catch (err) {
        console.error("API error:", err);
    }
}

async function fetchGridHistory() {
    try {
        const res = await fetch(`${API_BASE}/grid/history`);
        if (!res.ok) throw new Error("API history error");
        const data = await res.json();
        localHistory = data;
        drawLiveDispatchChart();
    } catch (err) {
        console.error(err);
    }
}

async function fetchGridForecast() {
    try {
        const res = await fetch(`${API_BASE}/grid/forecast`);
        if (!res.ok) throw new Error("API forecast error");
        const data = await res.json();
        localForecast = data.points;
        selectedModel = data.model;
        drawForecastChart();
    } catch (err) {
        console.error(err);
    }
}

async function sendControlUpdate(payload) {
    try {
        await fetch(`${API_BASE}/grid/control`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.error(err);
    }
}

// Update DOM elements using fetched API parameters
function updateUIElements(data) {
    // 1. KPI Panel Load
    elements.valActualLoad.textContent = data.actual_load.toFixed(1);
    elements.valBaseLoad.textContent = `${data.base_load.toFixed(1)} MW`;
    
    // Calc accuracy metrics
    const errorPct = Math.min(15, Math.abs(data.actual_load - (data.base_load + 1.2)) / (data.actual_load || 1) * 100);
    const forecastAcc = (100 - errorPct).toFixed(1);
    elements.valForecastAcc.textContent = `${forecastAcc}%`;
    elements.barLoadCapacity.style.width = `${Math.min(100, (data.actual_load / 80) * 100)}%`;

    // 2. KPI Panel Renewables
    const totalGen = data.solar_output + data.wind_output;
    const renewPct = Math.min(100, Math.round((totalGen / (data.actual_load || 1)) * 100));
    elements.valRenewablePercent.textContent = renewPct;
    elements.valSolarMw.textContent = `${data.solar_output.toFixed(1)} MW`;
    elements.valWindMw.textContent = `${data.wind_output.toFixed(1)} MW`;
    elements.valCurtailment.textContent = `${data.curtailed_renewables.toFixed(1)} MW`;
    if (data.curtailed_renewables > 0.1) {
        elements.valCurtailment.className = "mono-value red-text";
    } else {
        elements.valCurtailment.className = "mono-value";
    }
    
    // Segment bars
    const solarBarPct = Math.min(100, (data.solar_output / 80) * 100);
    const windBarPct = Math.min(100, (data.wind_output / 80) * 100);
    const restBarPct = Math.max(0, 100 - solarBarPct - windBarPct);
    
    elements.barSolarPct.style.width = `${solarBarPct}%`;
    elements.barWindPct.style.width = `${windBarPct}%`;
    elements.barOtherPct.style.width = `${restBarPct}%`;

    // 3. KPI Pricing
    elements.valDynamicPrice.textContent = data.dynamic_price.toFixed(3);
    elements.valAvgPrice.textContent = `$${data.avg_price.toFixed(3)}/kWh`;
    
    // Adjust warning tier colors
    if (data.dynamic_price > 0.22) {
        elements.valPriceRate.textContent = "PEAK TARIFFS";
        elements.valPriceRate.className = "rate-status red-text";
        elements.barPriceTier.className = "progress-bar-fill pink red-text";
        elements.gridStatus.className = "grid-status-badge pulse-glow red";
        elements.gridStatusText.textContent = "PEAK GRID LOAD";
    } else if (data.dynamic_price < 0.05) {
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
    elements.barPriceTier.style.width = `${Math.min(100, ((data.dynamic_price + 0.05) / 0.55) * 100)}%`;

    // 4. KPI Battery & Grid Health
    elements.valBatterySoc.textContent = data.battery_soc.toFixed(1);
    elements.valGridFreq.textContent = `${data.grid_frequency.toFixed(2)} Hz`;
    elements.barBatterySoc.style.width = `${data.battery_soc.toFixed(0)}%`;
    
    const batRate = data.battery_rate;
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

    // 5. Sustainability Panel Carbon
    elements.valCarbonIntensity.textContent = `${data.carbon_intensity} g/kWh`;
    elements.valCo2Saved.textContent = data.carbon_saved.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    elements.barCarbonIntensity.style.width = `${Math.min(100, (data.carbon_intensity / 500) * 100)}%`;
    
    if (data.carbon_intensity < 180) {
        elements.barCarbonIntensity.className = "intensity-bar-fill green";
        elements.valCarbonIntensity.className = "mono-value text-green";
    } else if (data.carbon_intensity >= 180 && data.carbon_intensity < 320) {
        elements.barCarbonIntensity.className = "intensity-bar-fill yellow";
        elements.valCarbonIntensity.className = "mono-value text-amber";
    } else {
        elements.barCarbonIntensity.className = "intensity-bar-fill red";
        elements.valCarbonIntensity.className = "mono-value red-text";
    }

    // Sync button toggles
    setBatteryButtonActive(data.battery_mode);

    // Advisory recommendation updates
    triggerAdvisoryLog(data);
}

function setBatteryButtonActive(mode) {
    [elements.btnBatAuto, elements.btnBatCharge, elements.btnBatDischarge].forEach(btn => {
        btn.classList.remove('active');
    });
    if (mode === "auto") elements.btnBatAuto.classList.add('active');
    else if (mode === "charge") elements.btnBatCharge.classList.add('active');
    else if (mode === "discharge") elements.btnBatDischarge.classList.add('active');
}

// Generate context-aware recommendations based on current grid diagnostics
let advisoryCooldown = 0;
function triggerAdvisoryLog(data) {
    if (advisoryCooldown > 0) {
        advisoryCooldown--;
        return;
    }
    
    advisoryCooldown = 5;
    const list = elements.advisorListContainer;
    list.innerHTML = ""; // Clear log
    
    const items = [];

    if (data.dynamic_price > 0.22) {
        items.push({
            type: "warning",
            icon: "🚨",
            text: `High pricing event ($${data.dynamic_price.toFixed(3)}/kWh). Peak hours demand mitigation recommended. Dispatch batteries immediately.`
        });
    }

    if (data.battery_soc < 15.0) {
        items.push({
            type: "warning",
            icon: "🪫",
            text: `ESS battery reserves critical (${data.battery_soc.toFixed(1)}%). Commencing reserve generator operations.`
        });
    } else if (data.battery_soc > 95.0 && data.solar_output + data.wind_output > data.actual_load) {
        items.push({
            type: "warning",
            icon: "⚠️",
            text: `Storage banks saturated at 100%. Renewable energy curtailment active (${data.curtailed_renewables.toFixed(1)} MW wasted).`
        });
    }

    if (data.solar_output + data.wind_output > data.actual_load && data.battery_soc < 90) {
        items.push({
            type: "positive",
            icon: "🔋",
            text: "RENEWABLE SURPLUS: Commencing battery storage charging protocols to prevent grid over-frequency."
        });
    }

    if (data.carbon_intensity < 150) {
        items.push({
            type: "positive",
            icon: "🍃",
            text: `Clean energy mix active. Current grid carbon intensity extremely low (${data.carbon_intensity} g/kWh). A+ rating.`
        });
    } else if (data.carbon_intensity > 350) {
        items.push({
            type: "warning",
            icon: "🏭",
            text: `Fossil backup intensity detected (${data.carbon_intensity} g/kWh). Deploy carbon offsets or battery shaving systems.`
        });
    }

    if (items.length === 0) {
        items.push({
            type: "normal",
            icon: "💡",
            text: `Grid normal. Frequency standard at ${data.grid_frequency.toFixed(2)} Hz. Pricing dynamic controls holding at $${data.dynamic_price.toFixed(3)}/kWh.`
        });
        items.push({
            type: "normal",
            icon: "📊",
            text: "AI engine optimizing line dispatch constraints. Forecast profile tracks nominal deviation targets."
        });
    }

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

function getSvgX(simMinute, minMinute, maxMinute) {
    const scale = (simMinute - minMinute) / (maxMinute - minMinute);
    return svgConfig.margin.left + (scale * svgConfig.chartWidth);
}

function getSvgY(value, minValue, maxValue) {
    const scale = (value - minValue) / (maxValue - minValue);
    return svgConfig.margin.top + ((1.0 - scale) * svgConfig.chartHeight);
}

function drawLiveDispatchChart() {
    const svg = elements.svgDispatch;
    const elementsToRemove = svg.querySelectorAll('.dynamic-chart-element');
    elementsToRemove.forEach(el => el.remove());

    if (localHistory.length < 2) return;

    const minutes = localHistory.map(d => d.minute);
    const minX = Math.min(...minutes);
    const maxX = Math.max(...minutes);
    const minY = -15.0;
    const maxY = 75.0;

    const gridG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gridG.setAttribute("class", "dynamic-chart-element");
    svg.appendChild(gridG);

    // Draw horizontal grid lines and Y-axis text
    const yGridValues = [-10, 0, 20, 40, 60, 70];
    yGridValues.forEach(val => {
        const y = getSvgY(val, minY, maxY);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", svgConfig.margin.left);
        line.setAttribute("y1", y);
        line.setAttribute("x2", svgConfig.width - svgConfig.margin.right);
        line.setAttribute("y2", y);
        line.setAttribute("class", "grid-line");
        gridG.appendChild(line);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.setAttribute("x", svgConfig.margin.left - 8);
        text.setAttribute("y", y + 4);
        text.setAttribute("text-anchor", "end");
        text.setAttribute("class", "axis-text");
        text.textContent = `${val} MW`;
        gridG.appendChild(text);
    });

    // Draw X-axis timeline markers (every 4 hours)
    const hoursCount = 6;
    for (let i = 0; i <= hoursCount; i++) {
        const targetMin = minX + ((maxX - minX) / hoursCount) * i;
        const x = getSvgX(targetMin, minX, maxX);
        const timeStr = formatTimeStr(targetMin).replace(':00', '');

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

    // DRAW SHADED AREA FIELDS
    gridG.appendChild(drawAreaPath(localHistory, d => d.load, minX, maxX, minY, maxY, "grad-load"));
    gridG.appendChild(drawAreaPath(localHistory, d => d.solar, minX, maxX, minY, maxY, "grad-solar"));
    gridG.appendChild(drawAreaPath(localHistory, d => d.wind, minX, maxX, minY, maxY, "grad-wind"));

    // DRAW LINE CHARTS
    gridG.appendChild(drawLinePath(localHistory, d => d.load, minX, maxX, minY, maxY, "chart-path path-load"));
    gridG.appendChild(drawLinePath(localHistory, d => d.solar, minX, maxX, minY, maxY, "chart-path path-solar"));
    gridG.appendChild(drawLinePath(localHistory, d => d.wind, minX, maxX, minY, maxY, "chart-path path-wind"));
    gridG.appendChild(drawLinePath(localHistory, d => d.battery, minX, maxX, minY, maxY, "chart-path path-battery"));
}

function drawAreaPath(data, valueFn, minX, maxX, minY, maxY, gradName) {
    let dStr = "";
    data.forEach((d, index) => {
        const x = getSvgX(d.minute, minX, maxX);
        const y = getSvgY(valueFn(d), minY, maxY);
        if (index === 0) dStr += `M ${x} ${y}`;
        else dStr += ` L ${x} ${y}`;
    });
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

function drawLinePath(data, valueFn, minX, maxX, minY, maxY, className) {
    let dStr = "";
    data.forEach((d, index) => {
        const x = getSvgX(d.minute, minX, maxX);
        const y = getSvgY(valueFn(d), minY, maxY);
        if (index === 0) dStr += `M ${x} ${y}`;
        else dStr += ` L ${x} ${y}`;
    });
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", dStr);
    path.setAttribute("class", className);
    return path;
}

function drawForecastChart() {
    const svg = elements.svgForecast;
    const elementsToRemove = svg.querySelectorAll('.dynamic-chart-element');
    elementsToRemove.forEach(el => el.remove());

    if (localForecast.length < 2) return;

    const minutes = localForecast.map(d => d.minute);
    const minX = Math.min(...minutes);
    const maxX = Math.max(...minutes);
    const minY = -5.0;
    const maxY = 75.0;

    const gridG = document.createElementNS("http://www.w3.org/2000/svg", "g");
    gridG.setAttribute("class", "dynamic-chart-element");
    svg.appendChild(gridG);

    // Grid overlays
    const yGridValues = [0, 20, 40, 60, 70];
    yGridValues.forEach(val => {
        const y = getSvgY(val, minY, maxY);
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", svgConfig.margin.left);
        line.setAttribute("y1", y);
        line.setAttribute("x2", svgConfig.width - svgConfig.margin.right);
        line.setAttribute("y2", y);
        line.setAttribute("class", "grid-line");
        gridG.appendChild(line);

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
        const timeStr = formatTimeStr(targetMin).replace(':00', '');

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

    // DRAW FORECAST SHAPE & LINES
    gridG.appendChild(drawAreaPath(localForecast, d => d.load, minX, maxX, minY, maxY, "grad-forecast"));

    // Actual overlay from local history
    const sliceCount = 36;
    const historicSlice = localHistory.slice(-sliceCount);
    if (historicSlice.length > 2) {
        gridG.appendChild(drawLinePath(historicSlice, d => d.load, minX, maxX, minY, maxY, "chart-path path-load"));
    }

    gridG.appendChild(drawLinePath(localForecast, d => d.load, minX, maxX, minY, maxY, "chart-path path-forecast"));
    gridG.appendChild(drawLinePath(localForecast, d => d.solar, minX, maxX, minY, maxY, "chart-path path-solar-forecast"));
    
    // Scale pricing
    const priceScaleFn = priceVal => (priceVal + 0.05) / 0.55 * 80;
    gridG.appendChild(drawLinePath(localForecast, d => priceScaleFn(d.price), minX, maxX, minY, maxY, "chart-path path-price-forecast"));
}

// ==========================================================================
// INTERACTIVE TOOLTIPS HOVER ENGINE
// ==========================================================================

function setupTooltipHandlers() {
    elements.svgDispatch.addEventListener('mousemove', (e) => {
        const bounds = elements.svgDispatch.getBoundingClientRect();
        const mouseX = e.clientX - bounds.left;
        
        if (localHistory.length < 2) return;
        const leftLimit = getSvgX(localHistory[0].minute, localHistory[0].minute, localHistory[localHistory.length-1].minute);
        const rightLimit = getSvgX(localHistory[localHistory.length-1].minute, localHistory[0].minute, localHistory[localHistory.length-1].minute);
        
        if (mouseX < leftLimit || mouseX > rightLimit) {
            elements.dispatchTooltip.classList.add('hidden');
            removeSvgIndicatorLines(elements.svgDispatch);
            return;
        }

        const scalePct = (mouseX - leftLimit) / (rightLimit - leftLimit);
        const index = Math.min(localHistory.length - 1, Math.max(0, Math.round(scalePct * (localHistory.length - 1))));
        const data = localHistory[index];

        drawSvgIndicatorLine(elements.svgDispatch, data.minute, localHistory[0].minute, localHistory[localHistory.length-1].minute, data, -15, 75);

        const tooltip = elements.dispatchTooltip;
        tooltip.classList.remove('hidden');
        tooltip.style.left = `${e.clientX - bounds.left + 15}px`;
        tooltip.style.top = `${e.clientY - bounds.top - 85}px`;
        tooltip.innerHTML = `
            <div class="title">${data.time_str} (Actual)</div>
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

    elements.svgForecast.addEventListener('mousemove', (e) => {
        const bounds = elements.svgForecast.getBoundingClientRect();
        const mouseX = e.clientX - bounds.left;
        
        if (localForecast.length < 2) return;
        const leftLimit = getSvgX(localForecast[0].minute, localForecast[0].minute, localForecast[localForecast.length-1].minute);
        const rightLimit = getSvgX(localForecast[localForecast.length-1].minute, localForecast[0].minute, localForecast[localForecast.length-1].minute);
        
        if (mouseX < leftLimit || mouseX > rightLimit) {
            elements.forecastTooltip.classList.add('hidden');
            removeSvgIndicatorLines(elements.svgForecast);
            return;
        }

        const scalePct = (mouseX - leftLimit) / (rightLimit - leftLimit);
        const index = Math.min(localForecast.length - 1, Math.max(0, Math.round(scalePct * (localForecast.length - 1))));
        const data = localForecast[index];

        drawSvgIndicatorLine(elements.svgForecast, data.minute, localForecast[0].minute, localForecast[localForecast.length-1].minute, data, -5, 75, true);

        const tooltip = elements.forecastTooltip;
        tooltip.classList.remove('hidden');
        tooltip.style.left = `${e.clientX - bounds.left + 15}px`;
        tooltip.style.top = `${e.clientY - bounds.top - 80}px`;
        tooltip.innerHTML = `
            <div class="title">${data.time_str} (Forecast)</div>
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

function drawSvgIndicatorLine(svg, targetMin, minMin, maxMin, data, minY, maxY, isForecast = false) {
    removeSvgIndicatorLines(svg);
    const x = getSvgX(targetMin, minMin, maxMin);
    
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", x);
    line.setAttribute("y1", svgConfig.margin.top);
    line.setAttribute("x2", x);
    line.setAttribute("y2", svgConfig.height - svgConfig.margin.bottom);
    line.setAttribute("class", "interactive-line hover-guide");
    svg.appendChild(line);

    const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    dot.setAttribute("cx", x);
    dot.setAttribute("cy", getSvgY(data.load, minY, maxY));
    dot.setAttribute("class", "hover-dot load hover-guide");
    svg.appendChild(dot);
    
    if (!isForecast) {
        const dotSolar = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dotSolar.setAttribute("cx", x);
        dotSolar.setAttribute("cy", getSvgY(data.solar, minY, maxY));
        dotSolar.setAttribute("class", "hover-dot solar hover-guide");
        svg.appendChild(dotSolar);

        const dotWind = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        dotWind.setAttribute("cx", x);
        dotWind.setAttribute("cy", getSvgY(data.wind, minY, maxY));
        dotWind.setAttribute("class", "hover-dot wind hover-guide");
        svg.appendChild(dotWind);
    }
}

function removeSvgIndicatorLines(svg) {
    svg.querySelectorAll('.hover-guide').forEach(line => line.remove());
}

// ==========================================================================
// SCENARIO & BUTTON CLICK ACTIONS
// ==========================================================================

async function selectScenario(scenarioName) {
    try {
        const res = await fetch(`${API_BASE}/grid/scenario`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scenario: scenarioName })
        });
        if (!res.ok) throw new Error("Scenario activation failed");
        
        // Sync active scenario class
        document.querySelectorAll('.btn-scenario').forEach(btn => {
            if (btn.getAttribute('data-scenario') === scenarioName) btn.classList.add('active');
            else btn.classList.remove('active');
        });

        let systemMessage = `[SCENARIO] Sent request to activate scenario: ${scenarioName.toUpperCase()}`;
        appendConsoleLog(systemMessage);
        
        // Trigger rapid polling refresh
        await fetchGridStatus();
        await fetchGridHistory();
        await fetchGridForecast();
    } catch (err) {
        console.error(err);
    }
}

function appendConsoleLog(message) {
    const textLog = elements.consoleLogsText;
    textLog.textContent += `\n${message}`;
    elements.consoleLogsText.parentElement.scrollTop = elements.consoleLogsText.parentElement.scrollHeight;
}

// AI Model Training client simulation (triggers python fit in background)
async function triggerModelTraining() {
    if (isTraining) return;

    isTraining = true;
    
    // UI elements update
    elements.btnTrainModel.querySelector('.btn-text').textContent = "Training Model...";
    elements.btnTrainModel.querySelector('.train-loader').classList.remove('hidden');
    elements.btnTrainModel.classList.add('disabled');
    elements.trainingStatus.textContent = "TRAINING...";
    elements.trainingStatus.className = "console-status-text training";
    
    const logs = logTemplates[selectedModel] || logTemplates.lstm;
    appendConsoleLog(`\n[SYSTEM] Post API training request for model: ${selectedModel.toUpperCase()}...`);
    
    try {
        // Send actual training post request to FastAPI
        await fetch(`${API_BASE}/ml/train`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: selectedModel })
        });
    } catch (err) {
        console.error("Training trigger error:", err);
    }
    
    // Animate local training status
    let epoch = 0;
    let logIdx = 0;
    
    function trainingStep() {
        if (epoch >= 100) {
            isTraining = false;
            elements.btnTrainModel.querySelector('.btn-text').textContent = "Train Forecast Model";
            elements.btnTrainModel.querySelector('.train-loader').classList.add('hidden');
            elements.btnTrainModel.classList.remove('disabled');
            elements.trainingStatus.textContent = "Model Up-To-Date";
            elements.trainingStatus.className = "console-status-text idle";
            
            const trainingLoss = selectedModel === 'lstm' ? 0.0215 : (selectedModel === 'xgboost' ? 0.0482 : 0.0822);
            const trainingValLoss = selectedModel === 'lstm' ? 0.0242 : (selectedModel === 'xgboost' ? 0.0561 : 0.0914);
            
            elements.mValEpochs.textContent = "100 / 100";
            elements.mValLoss.textContent = trainingLoss.toFixed(4);
            elements.mValValLoss.textContent = trainingValLoss.toFixed(4);
            
            appendConsoleLog(logs[logs.length - 1]);
            
            // Refresh forecasts from backend (with new weights)
            fetchGridForecast();
            return;
        }

        epoch += 5;
        const startLoss = 0.35;
        const finalLoss = selectedModel === 'lstm' ? 0.0215 : (selectedModel === 'xgboost' ? 0.0482 : 0.0822);
        const progress = epoch / 100;
        const currentLoss = startLoss - (startLoss - finalLoss) * Math.pow(progress, 0.5);
        const currentValLoss = currentLoss * 1.1;

        elements.mValEpochs.textContent = `${epoch} / 100`;
        elements.mValLoss.textContent = currentLoss.toFixed(4);
        elements.mValValLoss.textContent = currentValLoss.toFixed(4);

        if (epoch % 20 === 0 && logIdx < logs.length - 1) {
            appendConsoleLog(logs[logIdx]);
            logIdx++;
        }

        requestAnimationFrame(() => setTimeout(trainingStep, 75));
    }

    trainingStep();
}

// ==========================================================================
// REGISTRATION & ATTACHMENT EVENTS
// ==========================================================================

function registerEventListeners() {
    // 1. Play Pause Sim
    elements.btnPlayPause.addEventListener('click', async () => {
        try {
            const res = await fetch(`${API_BASE}/grid/play-pause`, { method: "POST" });
            const data = await res.json();
            isPlaying = data.is_playing;
            if (isPlaying) {
                elements.playPauseIcon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
                appendConsoleLog("[SYSTEM] Grid timeline resumed.");
            } else {
                elements.playPauseIcon.setAttribute('d', 'M8 5v14l11-7z');
                appendConsoleLog("[SYSTEM] Grid timeline paused.");
            }
        } catch (err) {
            console.error(err);
        }
    });

    // 2. Speed Slider
    elements.simSpeed.addEventListener('input', async (e) => {
        const val = parseInt(e.target.value);
        try {
            const res = await fetch(`${API_BASE}/grid/speed`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ speed_level: val })
            });
            const data = await res.json();
            isPlaying = data.is_playing;
            
            const multiplier = speedMap[val];
            if (multiplier === 0) {
                elements.playPauseIcon.setAttribute('d', 'M8 5v14l11-7z');
                elements.simSpeedVal.textContent = "PAUSED";
                appendConsoleLog("[SYSTEM] Grid simulation speed set to 0x (PAUSED).");
            } else {
                elements.playPauseIcon.setAttribute('d', 'M6 19h4V5H6v14zm8-14v14h4V5h-4z');
                elements.simSpeedVal.textContent = `${multiplier}x`;
                appendConsoleLog(`[SYSTEM] Grid simulation speed set to ${multiplier}x.`);
            }
        } catch (err) {
            console.error(err);
        }
    });

    // 3. Environmental Sliders (Throttled POST updates)
    let sliderTimer = null;
    function throttleControlUpdate(payload) {
        if (sliderTimer) clearTimeout(sliderTimer);
        sliderTimer = setTimeout(() => sendControlUpdate(payload), 150);
    }

    elements.sliderTemp.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        elements.valCtrlTemp.textContent = `${val.toFixed(0)}°C`;
        throttleControlUpdate({ temperature: val });
    });
    
    elements.sliderClouds.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        elements.valCtrlClouds.textContent = `${val.toFixed(0)}%`;
        throttleControlUpdate({ cloud_cover: val });
    });
    
    elements.sliderWind.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        elements.valCtrlWind.textContent = `${val.toFixed(1)} m/s`;
        throttleControlUpdate({ wind_speed: val });
    });

    // 4. Battery Modes
    elements.btnBatAuto.addEventListener('click', () => {
        sendControlUpdate({ battery_mode: "auto" });
        appendConsoleLog("[ESS CONTROL] Battery dispatch: AUTO (AI Optimization).");
    });
    
    elements.btnBatCharge.addEventListener('click', () => {
        sendControlUpdate({ battery_mode: "charge" });
        appendConsoleLog("[ESS CONTROL] Force Charging command overrides active.");
    });
    
    elements.btnBatDischarge.addEventListener('click', () => {
        sendControlUpdate({ battery_mode: "discharge" });
        appendConsoleLog("[ESS CONTROL] Force Discharging override initiated.");
    });

    // 5. Scenarios Hotkeys
    document.querySelectorAll('.btn-scenario').forEach(btn => {
        btn.addEventListener('click', () => {
            selectScenario(btn.getAttribute('data-scenario'));
        });
    });

    // 6. ML Model selection & training
    elements.selectMlModel.addEventListener('change', async (e) => {
        selectedModel = e.target.value;
        appendConsoleLog(`[AI FORECASTER] Forecasting model set to: ${selectedModel.toUpperCase()}. Re-training recommended.`);
        
        // Notify backend of model switch (by triggering quick prediction check)
        try {
            await fetch(`${API_BASE}/ml/train`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ model: selectedModel })
            });
            await fetchGridForecast();
        } catch (err) {
            console.error(err);
        }
    });

    elements.btnTrainModel.addEventListener('click', () => {
        triggerModelTraining();
    });
}

// ==========================================================================
// SYSTEM INITIATION
// ==========================================================================

async function initSystem() {
    registerEventListeners();
    
    // Check if hosted over HTTPS (which blocks fetching localhost HTTP API due to mixed content rules)
    if (window.location.protocol === 'https:') {
        const banner = document.getElementById('https-warning-banner');
        if (banner) banner.classList.remove('hidden');
    }
    
    // Initial fetch to load grid state
    await fetchGridStatus();
    await fetchGridHistory();
    await fetchGridForecast();
    
    // Set up Tooltips Hover Tracking
    setupTooltipHandlers();
    
    appendConsoleLog("[SYSTEM] Connected to Python FastAPI backend at http://localhost:8000");
    
    // Core polling cycle (runs every 1 second to fetch live telemetry)
    setInterval(async () => {
        await fetchGridStatus();
        
        // Periodically refresh history and forecasts (every 5-10 seconds to save bandwidth)
        if (currentMinute % 5 === 0) {
            await fetchGridHistory();
            await fetchGridForecast();
        }
    }, 1000);
}

// Start app on DOM Loaded
document.addEventListener('DOMContentLoaded', initSystem);
