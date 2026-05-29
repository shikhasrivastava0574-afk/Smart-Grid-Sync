import numpy as np
import pickle
import os
import math
import random
from ..simulator import SmartGridSimulator

# Directory to save trained model files
MODELS_DIR = os.path.dirname(os.path.abspath(__file__))

def get_model_path(model_name: str) -> str:
    return os.path.join(MODELS_DIR, f"{model_name}_model.pkl")

# ==========================================================================
# PURE NUMPY MACHINE LEARNING ALGORITHMS FROM SCRATCH
# ==========================================================================

class PureRidge:
    """Ridge Linear Regression Regressor with L2 Regularization (Normal Equations solver)"""
    def __init__(self, alpha=1.0):
        self.alpha = alpha
        self.beta = None

    def fit(self, X, y):
        # Add bias column (X_b has shape (N, D+1))
        X_b = np.hstack([np.ones((X.shape[0], 1)), X])
        # Regularization matrix (do not regularize bias term)
        I = np.eye(X_b.shape[1])
        I[0, 0] = 0.0
        # Solve Beta = (X_b^T * X_b + alpha * I)^-1 * X_b^T * y
        self.beta = np.linalg.solve(X_b.T.dot(X_b) + self.alpha * I, X_b.T.dot(y))

    def predict(self, X):
        X_b = np.hstack([np.ones((X.shape[0], 1)), X])
        return X_b.dot(self.beta)


class PureMLP:
    """Feedforward Multi-Layer Perceptron Neural Network Regressor (1 Hidden Layer with ReLU)"""
    def __init__(self, hidden_dim=32, lr=0.01, epochs=100):
        self.hidden_dim = hidden_dim
        self.lr = lr
        self.epochs = epochs
        self.W1 = None
        self.b1 = None
        self.W2 = None
        self.b2 = None
        self.x_mean = None
        self.x_std = None
        self.y_mean = None
        self.y_std = None

    def fit(self, X, y):
        # Calculate normalization statistics
        self.x_mean = np.mean(X, axis=0)
        self.x_std = np.std(X, axis=0)
        self.x_std[self.x_std == 0.0] = 1.0
        
        self.y_mean = np.mean(y)
        self.y_std = np.std(y)
        if self.y_std == 0.0:
            self.y_std = 1.0

        # Scale features and targets
        X_scaled = (X - self.x_mean) / self.x_std
        y_scaled = (y - self.y_mean) / self.y_std
        y_col = y_scaled.reshape(-1, 1)

        np.random.seed(42)
        n_samples, n_features = X_scaled.shape

        # Xavier/Glorot Weight Initialization
        self.W1 = np.random.randn(n_features, self.hidden_dim) * np.sqrt(2.0 / n_features)
        self.b1 = np.zeros((1, self.hidden_dim))
        self.W2 = np.random.randn(self.hidden_dim, 1) * np.sqrt(2.0 / self.hidden_dim)
        self.b2 = np.zeros((1, 1))

        # Basic batch gradient descent training loop
        for _ in range(self.epochs):
            # Forward propagation
            z1 = X_scaled.dot(self.W1) + self.b1
            a1 = np.maximum(0, z1) # ReLU activation
            y_pred = a1.dot(self.W2) + self.b2

            # Compute error gradients
            dy = 2.0 * (y_pred - y_col) / n_samples
            
            # Backpropagation
            dW2 = a1.T.dot(dy)
            db2 = np.sum(dy, axis=0, keepdims=True)
            
            da1 = dy.dot(self.W2.T)
            dz1 = da1 * (z1 > 0) # ReLU derivative
            
            dW1 = X_scaled.T.dot(dz1)
            db1 = np.sum(dz1, axis=0, keepdims=True)

            # Update weights using SGD optimizer
            self.W1 -= self.lr * dW1
            self.b1 -= self.lr * db1
            self.W2 -= self.lr * dW2
            self.b2 -= self.lr * db2

    def predict(self, X):
        if self.x_mean is None:
            return np.zeros(X.shape[0])
        # Scale features and execute prediction
        X_scaled = (X - self.x_mean) / self.x_std
        z1 = X_scaled.dot(self.W1) + self.b1
        a1 = np.maximum(0, z1)
        y_pred = a1.dot(self.W2) + self.b2
        # Scale back to output scale
        return (y_pred.flatten() * self.y_std) + self.y_mean


class PureDecisionTree:
    """Decision Tree Regressor implementing greedy split search (stair-step model baseline)"""
    def __init__(self, max_depth=5):
        self.max_depth = max_depth
        self.feature = None
        self.threshold = None
        self.left = None
        self.right = None
        self.value = None

    def fit(self, X, y):
        # Base cases: maximum depth reached or data size is too small
        if self.max_depth <= 0 or len(y) <= 5:
            self.value = np.mean(y)
            return

        best_mse = float('inf')
        n_samples, n_features = X.shape

        # Search for optimal threshold division across features
        for f in range(n_features):
            # Check percentiles to keep threshold search fast
            thresholds = np.percentile(X[:, f], [20, 40, 60, 80])
            for th in thresholds:
                left_mask = X[:, f] <= th
                right_mask = ~left_mask
                
                if np.sum(left_mask) < 2 or np.sum(right_mask) < 2:
                    continue

                # Compute split MSE variance reduction
                mse = np.var(y[left_mask]) * np.sum(left_mask) + np.var(y[right_mask]) * np.sum(right_mask)
                if mse < best_mse:
                    best_mse = mse
                    self.feature = f
                    self.threshold = th

        # If no split was productive, set as leaf
        if self.feature is None:
            self.value = np.mean(y)
            return

        # Recurse splits
        left_mask = X[:, self.feature] <= self.threshold
        self.left = PureDecisionTree(self.max_depth - 1)
        self.left.fit(X[left_mask], y[left_mask])
        self.right = PureDecisionTree(self.max_depth - 1)
        self.right.fit(X[~left_mask], y[~left_mask])

    def predict(self, X):
        if self.value is not None:
            return np.full(X.shape[0], self.value)

        y_pred = np.zeros(X.shape[0])
        left_mask = X[:, self.feature] <= self.threshold
        
        if np.any(left_mask):
            y_pred[left_mask] = self.left.predict(X[left_mask])
        if np.any(~left_mask):
            y_pred[~left_mask] = self.right.predict(X[~left_mask])
            
        return y_pred

# ==========================================================================
# MODEL PREDICTION & TRAINING INTERFACES
# ==========================================================================

def generate_training_data(simulator: SmartGridSimulator, samples: int = 400):
    """Generates historical grid metrics to feed training fits."""
    data = []
    for i in range(samples):
        hour = i % 24
        # Simulated weather conditions with noise
        temp = 16.0 + math.sin(hour / 24.0 * 2 * math.pi) * 8.0 + random.uniform(-2, 2)
        clouds = random.uniform(0, 100)
        wind = random.uniform(0, 20)
        
        # Calculate simulated load
        base = simulator.calculate_base_load(hour)
        temp_adj = 0.0
        if temp > 25.0:
            temp_adj = (temp - 25.0) * 1.4
        elif temp < 15.0:
            temp_adj = (15.0 - temp) * 0.8
            
        load = base + temp_adj + random.uniform(-2, 2)
        
        # Calculate solar output
        solar = 0.0
        if 6 <= hour <= 18:
            solar = 35.0 * math.sin((hour - 6) / 12.0 * math.pi) * (1.0 - (clouds / 100.0) * 0.88)
            
        data.append({
            "hour": hour,
            "temp": temp,
            "clouds": clouds,
            "wind": wind,
            "load": max(10.0, load),
            "solar": max(0.0, solar)
        })
        
    return data

def train_forecaster(model_type: str, simulator: SmartGridSimulator):
    """Triggers fitting routine for chosen model and saves it as a pickle file."""
    data = generate_training_data(simulator)
    
    # Extract features and targets into numpy arrays
    X = np.array([[d["hour"], d["temp"], d["clouds"], d["wind"]] for d in data])
    y_load = np.array([d["load"] for d in data])
    y_solar = np.array([d["solar"] for d in data])
    
    if model_type == "lstm":
        # PureMLP serves as our neural network predictor
        model_load = PureMLP(hidden_dim=32, lr=0.005, epochs=100)
        model_solar = PureMLP(hidden_dim=32, lr=0.005, epochs=100)
    elif model_type == "xgboost":
        # PureDecisionTree serves as our tree regressor (stair-step curve visualizer)
        model_load = PureDecisionTree(max_depth=5)
        model_solar = PureDecisionTree(max_depth=5)
    else: # linear
        model_load = PureRidge(alpha=1.0)
        model_solar = PureRidge(alpha=1.0)
        
    # Fit algorithms
    model_load.fit(X, y_load)
    model_solar.fit(X, y_solar)
    
    # Save model file
    with open(get_model_path(model_type), "wb") as f:
        pickle.dump({"load": model_load, "solar": model_solar}, f)
        
    return True

def predict_24h_ahead(model_type: str, simulator: SmartGridSimulator):
    """Predicts grid conditions for the upcoming 24 hours."""
    model_path = get_model_path(model_type)
    
    # Initial fit if pickle file doesn't exist
    if not os.path.exists(model_path):
        train_forecaster(model_type, simulator)
        
    with open(model_path, "rb") as f:
        models = pickle.load(f)
        
    model_load = models["load"]
    model_solar = models["solar"]
    
    base_hour = int(simulator.current_time // 60)
    current_min = simulator.current_time
    
    forecasts = []
    for i in range(24):
        forecast_hour = (base_hour + i) % 24
        sim_minute = current_min + (i * 60)
        time_str = simulator.format_time_str(sim_minute)
        
        # Predict weather boundaries with minor fluctuations
        temp_input = simulator.temperature + math.sin(i / 24.0 * 2 * math.pi) * 3.0
        clouds_input = max(0.0, min(100.0, simulator.cloud_cover + random.normalvariate(0, 5)))
        wind_input = max(0.0, simulator.wind_speed + random.normalvariate(0, 1))
        
        features = np.array([[forecast_hour, temp_input, clouds_input, wind_input]])
        
        # Make predictions
        predicted_load = float(model_load.predict(features)[0])
        predicted_solar = float(model_solar.predict(features)[0])
        
        predicted_load = max(10.0, predicted_load)
        predicted_solar = max(0.0, predicted_solar)
        
        # Add XGBoost stair-step visuals to tree predictions
        if model_type == "xgboost":
            blocky_hour = int(forecast_hour // 2) * 2
            predicted_load = predicted_load + math.cos((blocky_hour - 4) / 24.0 * 2 * math.pi) * 0.8
            
        net_load = predicted_load - predicted_solar
        predicted_price = simulator.calculate_price_value(net_load, 0.0)
        
        forecasts.append({
            "hour": forecast_hour,
            "minute": sim_minute,
            "time_str": time_str,
            "load": predicted_load,
            "solar": predicted_solar,
            "price": predicted_price
        })
        
    return forecasts
