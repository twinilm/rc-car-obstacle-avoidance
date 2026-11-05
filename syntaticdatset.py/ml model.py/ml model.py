from pathlib import Path

import numpy as np
import pandas as pd

from imblearn.over_sampling import SVMSMOTE
from lightgbm import LGBMClassifier
from sklearn.feature_selection import mutual_info_classif
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import (
    accuracy_score,
    precision_score,
    recall_score,
    f1_score,
    confusion_matrix,
    classification_report
)
from xgboost import XGBClassifier


DATA_DIR = Path(__file__).resolve().parents[2]
DATA_PATH = DATA_DIR / "obstacle_robot_dataset.csv"
SENSOR_FEATURES = [
    "front_distance_cm",
    "left_distance_cm",
    "right_distance_cm",
    "obstacle_detected",
    "servo_scan_triggered",
]


# ------------------------------------------------------------
# 1. Read the Arduino obstacle-avoidance dataset
# ------------------------------------------------------------
def readdata(filepath):
    print("Reading the robot dataset...")

    if not filepath.is_file():
        raise FileNotFoundError(f"Dataset not found: {filepath}")

    df = pd.read_csv(filepath, low_memory=False)
    print("Original data shape:", df.shape)

    duplicates = df.duplicated().sum()
    if duplicates:
        df = df.drop_duplicates().reset_index(drop=True)
        print("Removed duplicate rows:", duplicates)

    return df


# ------------------------------------------------------------
# 2. Prepare features and target safely
# ------------------------------------------------------------
def prepare_data(df):
    target_col = "action"

    if target_col not in df.columns:
        raise ValueError("Target column 'action' was not found.")

    missing_features = [c for c in SENSOR_FEATURES if c not in df.columns]
    if missing_features:
        raise ValueError(f"Missing sensor columns: {missing_features}")
    if df[target_col].isna().any():
        raise ValueError("Target column 'action' contains missing values.")

    X = df[SENSOR_FEATURES].apply(pd.to_numeric, errors="coerce")
    missing_sensor_cols = [
        c for c in ("left_distance_cm", "right_distance_cm")
        if X[c].isna().any() and not X[c].isna().all()
    ]
    for col in missing_sensor_cols:
        X[f"{col}_missing"] = X[col].isna().astype(int)

    X.drop(
        columns=[c for c in X.columns if X[c].isna().all()],
        inplace=True
    )
    y = df[target_col].astype(str)

    print("\nTarget class distribution:")
    print(y.value_counts())

    return X, y


# ------------------------------------------------------------
# 3. Split first, then impute using training data only
# ------------------------------------------------------------
def clean_data(X_train, X_test, y_train, y_test):
    # Median imputation learned only from training data.
    medians = X_train.median().fillna(0)
    X_train = X_train.fillna(medians)
    X_test = X_test.fillna(medians)

    target_encoder = LabelEncoder()
    y_train_encoded = target_encoder.fit_transform(y_train)

    # Reject test labels absent from the earlier training period.
    unknown = set(y_test.unique()) - set(target_encoder.classes_)
    if unknown:
        raise ValueError(f"Unseen target labels in test set: {unknown}")

    y_test_encoded = target_encoder.transform(y_test)

    return (
        X_train,
        X_test,
        y_train_encoded,
        y_test_encoded,
        target_encoder
    )


# ------------------------------------------------------------
# 4. Hybrid feature selection: Mutual Information + XGBoost
# ------------------------------------------------------------
def select_best_hybrid(X_train, X_test, y_train, k=8):
    k = min(k, X_train.shape[1])
    feature_names = X_train.columns.tolist()

    mi_scores = mutual_info_classif(
        X_train,
        y_train,
        random_state=42
    )
    ranker = XGBClassifier(
        n_estimators=150,
        max_depth=4,
        learning_rate=0.1,
        subsample=0.9,
        colsample_bytree=0.9,
        random_state=42,
        eval_metric="mlogloss",
        n_jobs=-1
    )
    ranker.fit(X_train, y_train)

    def normalize(scores):
        scores = np.asarray(scores, dtype=float)
        minimum, maximum = scores.min(), scores.max()
        if maximum == minimum:
            return np.zeros_like(scores)
        return (scores - minimum) / (maximum - minimum)

    mi_normalized = normalize(mi_scores)
    xgb_normalized = normalize(ranker.feature_importances_)
    hybrid_scores = 0.5 * mi_normalized + 0.5 * xgb_normalized

    score_table = pd.DataFrame({
        "feature": feature_names,
        "mutual_information": mi_normalized,
        "xgboost_importance": xgb_normalized,
        "hybrid_score": hybrid_scores
    }).sort_values(
        "hybrid_score", ascending=False, kind="stable"
    ).reset_index(drop=True)

    selected_features = score_table["feature"].head(k).tolist()
    print("\nHybrid feature ranking:")
    print(score_table.to_string(index=False))
    print("\nSelected features:", ", ".join(selected_features))

    return (
        X_train[selected_features],
        X_test[selected_features],
        selected_features
    )


# ------------------------------------------------------------
# 5. Train XGBoost + LightGBM probability ensemble
# ------------------------------------------------------------
def train_hybrid_model(X_train, y_train):
    xgb_model = XGBClassifier(
        n_estimators=250,
        learning_rate=0.05,
        max_depth=4,
        min_child_weight=2,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_alpha=0.1,
        reg_lambda=2.0,
        random_state=42,
        eval_metric="mlogloss",
        n_jobs=-1
    )
    lgb_model = LGBMClassifier(
        n_estimators=250,
        learning_rate=0.05,
        max_depth=4,
        num_leaves=15,
        min_child_samples=10,
        subsample=0.9,
        colsample_bytree=0.9,
        reg_alpha=0.1,
        reg_lambda=2.0,
        random_state=42,
        n_jobs=-1,
        verbosity=-1
    )

    print("\nTraining XGBoost...")
    xgb_model.fit(X_train, y_train)
    print("Training LightGBM...")
    lgb_model.fit(X_train, y_train)

    def hybrid_predict(X):
        probabilities = (
            xgb_model.predict_proba(X) + lgb_model.predict_proba(X)
        ) / 2
        return np.argmax(probabilities, axis=1), probabilities

    return hybrid_predict


# ------------------------------------------------------------
# 6. Calculate one-vs-rest FPR and FNR per action
# ------------------------------------------------------------
def print_error_rates(y_true, y_pred, class_names):
    cm = confusion_matrix(
        y_true,
        y_pred,
        labels=np.arange(len(class_names))
    )

    fpr_values, fnr_values = [], []

    print("\nFPR and FNR for each action (one-vs-rest):")
    total = cm.sum()

    for i, name in enumerate(class_names):
        tp = cm[i, i]
        fn = cm[i, :].sum() - tp
        fp = cm[:, i].sum() - tp
        tn = total - tp - fn - fp

        fpr = fp / (fp + tn) if (fp + tn) else 0.0
        fnr = fn / (fn + tp) if (fn + tp) else 0.0

        fpr_values.append(fpr)
        fnr_values.append(fnr)

        print(f"\n{name}: FPR={fpr * 100:.2f}% | FNR={fnr * 100:.2f}%")

    print(f"\nMacro-average FPR: {np.mean(fpr_values) * 100:.2f}%")
    print(f"Macro-average FNR: {np.mean(fnr_values) * 100:.2f}%")
    return cm


# ------------------------------------------------------------
# 7. Main pipeline
# ------------------------------------------------------------
def run_pipeline():
    df = readdata(DATA_PATH)

    if "timestamp_ms" in df.columns:
        df["timestamp_ms"] = pd.to_numeric(
            df["timestamp_ms"], errors="coerce"
        )
        if df["timestamp_ms"].isna().any():
            raise ValueError("Column 'timestamp_ms' contains invalid values.")
        df = df.sort_values("timestamp_ms", kind="stable").reset_index(drop=True)

    X, y = prepare_data(df)

    split_at = int(len(df) * 0.8)
    if split_at == 0 or split_at == len(df):
        raise ValueError("Dataset must contain at least two rows.")
    X_train, X_test = X.iloc[:split_at].copy(), X.iloc[split_at:].copy()
    y_train, y_test = y.iloc[:split_at], y.iloc[split_at:]

    print("\nPreprocessing...")
    (
        X_train_clean,
        X_test_clean,
        y_train_encoded,
        y_test_encoded,
        target_encoder
    ) = clean_data(
        X_train.copy(),
        X_test.copy(),
        y_train,
        y_test
    )

    print("\nRunning hybrid feature selection...")
    X_train_selected, X_test_selected, selected_features = select_best_hybrid(
        X_train_clean,
        X_test_clean,
        y_train_encoded,
        k=8
    )

    print("\nTraining class counts before SVM-SMOTE:")
    print(pd.Series(y_train_encoded).value_counts().sort_index().to_dict())
    smote = SVMSMOTE(
        random_state=42,
        k_neighbors=3,
        m_neighbors=5
    )
    X_train_balanced, y_train_balanced = smote.fit_resample(
        X_train_selected,
        y_train_encoded
    )
    print("Training class counts after SVM-SMOTE:")
    print(pd.Series(y_train_balanced).value_counts().sort_index().to_dict())

    hybrid_predict = train_hybrid_model(
        X_train_balanced,
        y_train_balanced
    )

    print("\nPredicting test actions...")
    y_pred, probabilities = hybrid_predict(X_test_selected)

    class_names = target_encoder.classes_

    accuracy = accuracy_score(y_test_encoded, y_pred)
    precision = precision_score(
        y_test_encoded, y_pred, average="weighted", zero_division=0
    )
    recall = recall_score(
        y_test_encoded, y_pred, average="weighted", zero_division=0
    )
    f1 = f1_score(
        y_test_encoded, y_pred, average="weighted", zero_division=0
    )

    print("\nHybrid XGBoost + LightGBM performance:")
    print(f"Accuracy:  {accuracy * 100:.2f}%")
    print(f"Precision: {precision * 100:.2f}%")
    print(f"Recall:    {recall * 100:.2f}%")
    print(f"F1-score:  {f1 * 100:.2f}%")

    print("\nClassification report:")
    print(classification_report(
        y_test_encoded,
        y_pred,
        labels=np.arange(len(class_names)),
        target_names=class_names,
        zero_division=0
    ))

    cm = print_error_rates(y_test_encoded, y_pred, class_names)

    print("\nConfusion matrix (rows=true, columns=predicted):")
    print(pd.DataFrame(cm, index=class_names, columns=class_names))

    # Save predictions for inspection.
    results = X_test.reset_index(drop=True).copy()
    results = results[selected_features]
    results["actual_action"] = y_test.reset_index(drop=True)
    results["predicted_action"] = target_encoder.inverse_transform(y_pred)
    results["prediction_confidence"] = probabilities.max(axis=1)
    output_path = DATA_DIR / "robot_action_predictions.csv"
    results.to_csv(output_path, index=False)
    print(f"\nSaved test predictions to {output_path}")


if __name__ == "__main__":
    run_pipeline()