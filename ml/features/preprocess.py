import pandas as pd
import numpy as np
import os
from sklearn.model_selection import train_test_split

def load_and_preprocess(input_path, output_path):
    print(f"Loading data from {input_path}...")
    df = pd.read_csv(input_path)
    
    print(f"Initial shape: {df.shape}")
    
    # Time features
    df['start_datetime'] = pd.to_datetime(df['start_datetime'], errors='coerce')
    df['closed_datetime'] = pd.to_datetime(df['closed_datetime'], errors='coerce')
    df['resolved_datetime'] = pd.to_datetime(df['resolved_datetime'], errors='coerce')
    df['modified_datetime'] = pd.to_datetime(df['modified_datetime'], errors='coerce')
    
    # Calculate duration
    df['end_time'] = df['resolved_datetime'].fillna(df['closed_datetime']).fillna(df['modified_datetime'])
    df['resolution_time_min'] = (df['end_time'] - df['start_datetime']).dt.total_seconds() / 60.0
    
    # Filter out invalid durations
    df = df[(df['resolution_time_min'] > 0) & (df['resolution_time_min'] < 60*24*7)] # Less than a week
    
    # Temporal features
    df['hour'] = df['start_datetime'].dt.hour
    df['day_of_week'] = df['start_datetime'].dt.dayofweek
    df['month'] = df['start_datetime'].dt.month
    
    # Fill missing spatial data
    df['latitude'] = pd.to_numeric(df['latitude'], errors='coerce')
    df['longitude'] = pd.to_numeric(df['longitude'], errors='coerce')
    df = df.dropna(subset=['latitude', 'longitude'])
    
    # Categorical features
    df['event_type'] = df['event_type'].fillna('unknown')
    df['priority'] = df['priority'].fillna('Medium')
    df['requires_road_closure'] = df['requires_road_closure'].fillna(False).astype(int)
    
    # Create target: severity (heuristic based on priority and duration)
    # 0: Low, 1: Medium, 2: High, 3: Critical
    def calculate_severity(row):
        prio = str(row['priority']).lower()
        duration = row['resolution_time_min']
        
        score = 0
        if 'high' in prio:
            score += 2
        elif 'medium' in prio:
            score += 1
            
        if duration > 120:
            score += 2
        elif duration > 60:
            score += 1
            
        return min(3, score)
        
    df['severity'] = df.apply(calculate_severity, axis=1)
    
    # Select final features
    features = ['event_type', 'priority', 'requires_road_closure', 'hour', 'day_of_week', 
                'latitude', 'longitude', 'resolution_time_min', 'severity']
    
    final_df = df[features].copy()
    
    print(f"Final shape: {final_df.shape}")
    
    # Save train/test split
    train_df, test_df = train_test_split(final_df, test_size=0.2, random_state=42)
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    train_df.to_csv(output_path.replace('.csv', '_train.csv'), index=False)
    test_df.to_csv(output_path.replace('.csv', '_test.csv'), index=False)
    final_df.to_csv(output_path, index=False)
    print(f"Saved processed data to {output_path}")

if __name__ == '__main__':
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    input_csv = os.path.join(base_dir, 'data', 'incidents.csv')
    output_csv = os.path.join(base_dir, 'data', 'processed_incidents.csv')
    load_and_preprocess(input_csv, output_csv)
