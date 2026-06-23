import pandas as pd
import xgboost as xgb
from sklearn.metrics import accuracy_score, classification_report, mean_absolute_error, r2_score
from sklearn.preprocessing import LabelEncoder
import joblib
import os

def train_severity_model(train_df, test_df, model_dir):
    print("\n--- Training Severity Model ---")
    features = ['hour', 'day_of_week', 'latitude', 'longitude', 'requires_road_closure', 'event_type_encoded', 'priority_encoded']
    target = 'severity'
    
    X_train = train_df[features]
    y_train = train_df[target]
    X_test = test_df[features]
    y_test = test_df[target]
    
    model = xgb.XGBClassifier(objective='multi:softmax', num_class=4, random_state=42, n_estimators=100, max_depth=5)
    model.fit(X_train, y_train)
    
    preds = model.predict(X_test)
    print("Severity Model Accuracy:", accuracy_score(y_test, preds))
    print(classification_report(y_test, preds))
    
    model_path = os.path.join(model_dir, 'severity_xgb.joblib')
    joblib.dump(model, model_path)
    print(f"Severity model saved to {model_path}")
    return model

def train_resolution_model(train_df, test_df, model_dir):
    print("\n--- Training Resolution Time Model ---")
    # For resolution time, we don't use severity or resolution_time_min as features obviously
    features = ['hour', 'day_of_week', 'latitude', 'longitude', 'requires_road_closure', 'event_type_encoded', 'priority_encoded']
    target = 'resolution_time_min'
    
    X_train = train_df[features]
    y_train = train_df[target]
    X_test = test_df[features]
    y_test = test_df[target]
    
    model = xgb.XGBRegressor(objective='reg:squarederror', random_state=42, n_estimators=100, max_depth=5)
    model.fit(X_train, y_train)
    
    preds = model.predict(X_test)
    print("Resolution Time MAE:", mean_absolute_error(y_test, preds))
    print("Resolution Time R2:", r2_score(y_test, preds))
    
    model_path = os.path.join(model_dir, 'resolution_xgb.joblib')
    joblib.dump(model, model_path)
    print(f"Resolution model saved to {model_path}")
    return model

def train_priority_model(train_df, test_df, model_dir):
    print("\n--- Training Priority Model ---")
    features = ['hour', 'day_of_week', 'latitude', 'longitude', 'requires_road_closure', 'event_type_encoded']
    target = 'priority_encoded'
    
    X_train = train_df[features]
    y_train = train_df[target]
    X_test = test_df[features]
    y_test = test_df[target]
    
    # We can determine the number of classes in priority
    num_classes = len(train_df[target].unique())
    if num_classes > 2:
        model = xgb.XGBClassifier(objective='multi:softmax', num_class=num_classes, random_state=42, n_estimators=100, max_depth=5)
    else:
        model = xgb.XGBClassifier(objective='binary:logistic', random_state=42, n_estimators=100, max_depth=5)
        
    model.fit(X_train, y_train)
    
    preds = model.predict(X_test)
    print("Priority Model Accuracy:", accuracy_score(y_test, preds))
    print(classification_report(y_test, preds))
    
    model_path = os.path.join(model_dir, 'priority_xgb.joblib')
    joblib.dump(model, model_path)
    print(f"Priority model saved to {model_path}")
    return model

def main():
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    train_path = os.path.join(base_dir, 'data', 'processed_incidents_train.csv')
    test_path = os.path.join(base_dir, 'data', 'processed_incidents_test.csv')
    model_dir = os.path.join(base_dir, 'models')
    os.makedirs(model_dir, exist_ok=True)
    
    train_df = pd.read_csv(train_path)
    test_df = pd.read_csv(test_path)
    
    # Encode categorical features
    le_event = LabelEncoder()
    le_priority = LabelEncoder()
    
    # Fit on all data to ensure we have all classes
    all_df = pd.concat([train_df, test_df])
    le_event.fit(all_df['event_type'])
    le_priority.fit(all_df['priority'])
    
    train_df['event_type_encoded'] = le_event.transform(train_df['event_type'])
    test_df['event_type_encoded'] = le_event.transform(test_df['event_type'])
    
    train_df['priority_encoded'] = le_priority.transform(train_df['priority'])
    test_df['priority_encoded'] = le_priority.transform(test_df['priority'])
    
    # Save label encoders
    joblib.dump(le_event, os.path.join(model_dir, 'le_event.joblib'))
    joblib.dump(le_priority, os.path.join(model_dir, 'le_priority.joblib'))
    
    train_priority_model(train_df, test_df, model_dir)
    train_severity_model(train_df, test_df, model_dir)
    train_resolution_model(train_df, test_df, model_dir)

if __name__ == '__main__':
    main()

