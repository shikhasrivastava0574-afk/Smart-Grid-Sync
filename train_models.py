import pandas as pd
import numpy as np
import pickle
import os
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, mean_absolute_error, r2_score
from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
import torch
import torch.nn as nn
import torch.optim as optim
from torch.utils.data import TensorDataset, DataLoader

# Define LSTM Architecture
class PyTorchLSTM(nn.Module):
    def __init__(self, input_dim, hidden_dim=32, num_layers=1, output_dim=1):
        super(PyTorchLSTM, self).__init__()
        self.hidden_dim = hidden_dim
        self.num_layers = num_layers
        self.lstm = nn.LSTM(input_dim, hidden_dim, num_layers, batch_first=True)
        self.fc = nn.Linear(hidden_dim, output_dim)
        
    def forward(self, x):
        h0 = torch.zeros(self.num_layers, x.size(0), self.hidden_dim).to(x.device)
        c0 = torch.zeros(self.num_layers, x.size(0), self.hidden_dim).to(x.device)
        out, _ = self.lstm(x, (h0, c0))
        # Take the output of the last time step
        out = self.fc(out[:, -1, :])
        return out

def build_features(df):
    print("Engineering features...")
    df = df.copy()
    df['Timestamp'] = pd.to_datetime(df['Timestamp'])
    df = df.sort_values(by=['Consumer_Category', 'Timestamp']).reset_index(drop=True)
    
    # Extract time features
    df['Hour'] = df['Timestamp'].dt.hour
    df['Month'] = df['Timestamp'].dt.month
    df['DayOfWeek'] = df['Timestamp'].dt.dayofweek
    df['IsWeekend'] = (df['DayOfWeek'] >= 5).astype(int)
    
    # Category One-Hot Encoding
    df = pd.get_dummies(df, columns=['Consumer_Category'], prefix='Category', drop_first=False)
    # Ensure float conversion of dummies for consistency
    for col in [c for c in df.columns if c.startswith('Category_')]:
        df[col] = df[col].astype(float)
        
    # Lag Features (Category-Specific)
    cat_cols = [c for c in df.columns if c.startswith('Category_')]
    
    def get_category_name(row):
        for col in cat_cols:
            if row[col] == 1.0:
                return col.replace('Category_', '')
        return 'Residential'
        
    df['_Temp_Cat'] = df.apply(get_category_name, axis=1)
    
    df['Lag_1h'] = df.groupby('_Temp_Cat')['Consumption_kWh'].shift(1)
    df['Lag_24h'] = df.groupby('_Temp_Cat')['Consumption_kWh'].shift(24)
    df['Rolling_Mean_6h'] = df.groupby('_Temp_Cat')['Consumption_kWh'].transform(lambda x: x.shift(1).rolling(6).mean())
    
    # Drop temporary column and drop NaNs resulting from shifts
    df = df.drop(columns=['_Temp_Cat'])
    df = df.dropna().reset_index(drop=True)
    
    return df

def build_lstm_sequences(features, targets, seq_length=6):
    xs, ys = [], []
    for i in range(len(features) - seq_length + 1):
        xs.append(features[i:(i + seq_length)])
        ys.append(targets[i + seq_length - 1])
    return np.array(xs), np.array(ys)

def train_load_forecasting_models(df):
    feature_cols = [
        'Temperature_C', 'Humidity_pct', 'Cloud_Cover_pct', 'Wind_Speed_ms',
        'Hour', 'Month', 'DayOfWeek', 'IsWeekend',
        'Lag_1h', 'Lag_24h', 'Rolling_Mean_6h',
        'Category_Residential', 'Category_Commercial', 'Category_Industrial'
    ]
    target_col = 'Consumption_kWh'
    
    X = df[feature_cols].values
    y = df[target_col].values
    
    # Split: 80% train, 20% test
    # (Since it's time series, we split sequentially to prevent future data leakage)
    split_idx = int(len(df) * 0.8)
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    print("Training Gradient Boosting (XGBoost equivalent) Regressor...")
    xgb_model = HistGradientBoostingRegressor(max_iter=100, max_depth=6, learning_rate=0.1, random_state=42)
    xgb_model.fit(X_train_scaled, y_train)
    y_pred_xgb = xgb_model.predict(X_test_scaled)
    
    print("Training Random Forest Regressor...")
    rf_model = RandomForestRegressor(n_estimators=50, max_depth=10, random_state=42, n_jobs=-1)
    rf_model.fit(X_train_scaled, y_train)
    y_pred_rf = rf_model.predict(X_test_scaled)
    
    print("Training PyTorch LSTM Regressor...")
    # Prepare PyTorch Sequence Dataset
    # We will build sequences of length 6
    seq_length = 6
    
    X_train_seq, y_train_seq = build_lstm_sequences(X_train_scaled, y_train, seq_length)
    X_test_seq, y_test_seq = build_lstm_sequences(X_test_scaled, y_test, seq_length)
    
    # Convert to PyTorch tensors
    train_x_tensor = torch.tensor(X_train_seq, dtype=torch.float32)
    train_y_tensor = torch.tensor(y_train_seq, dtype=torch.float32).unsqueeze(1)
    test_x_tensor = torch.tensor(X_test_seq, dtype=torch.float32)
    test_y_tensor = torch.tensor(y_test_seq, dtype=torch.float32).unsqueeze(1)
    
    train_loader = DataLoader(TensorDataset(train_x_tensor, train_y_tensor), batch_size=256, shuffle=True)
    
    # Initialize model
    lstm_model = PyTorchLSTM(input_dim=len(feature_cols), hidden_dim=32, num_layers=1, output_dim=1)
    criterion = nn.MSELoss()
    optimizer = optim.Adam(lstm_model.parameters(), lr=0.01)
    
    # Train for 5 epochs (fast but sufficient for demonstration)
    lstm_model.train()
    for epoch in range(5):
        epoch_loss = 0.0
        for batch_x, batch_y in train_loader:
            optimizer.zero_grad()
            outputs = lstm_model(batch_x)
            loss = criterion(outputs, batch_y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item() * batch_x.size(0)
        print(f"  Epoch {epoch+1}/5 - Loss: {epoch_loss / len(train_x_tensor):.4f}")
        
    # Evaluate LSTM
    lstm_model.eval()
    with torch.no_grad():
        y_pred_lstm = lstm_model(test_x_tensor).numpy().flatten()
        
    # Metrics comparison
    print("\n--- Model Evaluation Summary (Load Forecasting) ---")
    models = {
        'Gradient Boosting': (y_test, y_pred_xgb),
        'Random Forest': (y_test, y_pred_rf),
        'LSTM': (y_test_seq, y_pred_lstm)
    }
    
    metrics = {}
    for name, (actual, predicted) in models.items():
        rmse = np.sqrt(mean_squared_error(actual, predicted))
        mae = mean_absolute_error(actual, predicted)
        r2 = r2_score(actual, predicted)
        print(f"{name}: RMSE={rmse:.3f}, MAE={mae:.3f}, R²={r2:.3f}")
        metrics[name] = {'RMSE': float(rmse), 'MAE': float(mae), 'R2': float(r2)}
        
    # Save models & scaler
    with open('xgboost_load.pkl', 'wb') as f:
        pickle.dump(xgb_model, f)
    with open('random_forest_load.pkl', 'wb') as f:
        pickle.dump(rf_model, f)
    torch.save(lstm_model.state_dict(), 'lstm_load.pt')
    with open('scaler.pkl', 'wb') as f:
        pickle.dump(scaler, f)
        
    print("Load forecasting models and scaler saved.")
    return metrics

def train_solar_forecasting_model(df):
    print("Training Gradient Boosting Solar Power Forecaster...")
    # Features relevant for Solar Generation
    solar_features = ['Hour', 'Month', 'Temperature_C', 'Humidity_pct', 'Cloud_Cover_pct', 'Wind_Speed_ms']
    target_col = 'Solar_Generation_kWh'
    
    # Filters to daylight hours to train cleaner model
    daylight_df = df[(df['Hour'] >= 6) & (df['Hour'] <= 18)].reset_index(drop=True)
    
    X = daylight_df[solar_features].values
    y = daylight_df[target_col].values
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    
    solar_model = HistGradientBoostingRegressor(max_iter=80, max_depth=5, learning_rate=0.1, random_state=42)
    solar_model.fit(X_train, y_train)
    
    preds = solar_model.predict(X_test)
    rmse = np.sqrt(mean_squared_error(y_test, preds))
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)
    
    print(f"Solar Model trained. Metrics on test: RMSE={rmse:.3f}, MAE={mae:.3f}, R²={r2:.3f}")
    
    with open('xgboost_solar.pkl', 'wb') as f:
        pickle.dump(solar_model, f)
        
    print("Solar forecaster model saved.")
    return {'RMSE': float(rmse), 'MAE': float(mae), 'R2': float(r2)}

if __name__ == "__main__":
    if not os.path.exists("smart_grid_data.csv"):
        print("Error: smart_grid_data.csv not found! Run generate_data.py first.")
    else:
        raw_df = pd.read_csv("smart_grid_data.csv")
        feat_df = build_features(raw_df)
        
        # Save engineered features dataset for easy use in dashboard
        feat_df.to_csv("smart_grid_features.csv", index=False)
        
        metrics_load = train_load_forecasting_models(feat_df)
        metrics_solar = train_solar_forecasting_model(feat_df)
        
        # Save metrics as json for dashboard reading
        import json
        with open("model_metrics.json", "w") as f:
            json.dump({
                'load_forecasting': metrics_load,
                'solar_forecasting': metrics_solar
            }, f, indent=4)
        print("Model training pipeline complete.")
