import numpy as np
import pandas as pd

rng = np.random.default_rng(42)
N = 100000          # number of samples
SAFE = 25         # cm: front distance considered safe
DANGER = 10       # cm: too close -> reverse

# 0=FORWARD, 1=TURN_LEFT, 2=TURN_RIGHT, 3=BACKWARD, 4=STOP
ACTIONS = {0: "FORWARD", 1: "TURN_LEFT", 2: "TURN_RIGHT", 3: "BACKWARD", 4: "STOP"}


def sensor(true_cm):
    """HC-SR04 model: noise, range 2-400 cm, 1% bad readings."""
    d = true_cm + rng.normal(0, 1.0, size=true_cm.shape)
    glitch = rng.random(true_cm.shape) < 0.01
    d[glitch] = rng.uniform(2, 400, glitch.sum())
    return np.clip(d, 2, 400).round(1)


# True distances (cm)
front_t = np.where(rng.random(N) < 0.5, rng.uniform(3, 40, N), rng.uniform(40, 300, N))
left_t = rng.uniform(3, 200, N)
right_t = rng.uniform(3, 200, N)

front, left, right = sensor(front_t), sensor(left_t), sensor(right_t)

# IR sensors: detect obstacles closer than ~15 cm, with 3% error
ir_left = ((left_t < 15) ^ (rng.random(N) < 0.03)).astype(int)
ir_right = ((right_t < 15) ^ (rng.random(N) < 0.03)).astype(int)


def decide(f, l, r, irl, irr):
    if irl and irr and f < SAFE:
        return 4                      # boxed in -> STOP
    if f < DANGER:
        return 3                      # too close -> BACKWARD
    if f < SAFE:
        if irl and not irr:
            return 2
        if irr and not irl:
            return 1
        return 1 if l >= r else 2     # turn toward the freer side
    if irl and not irr:
        return 2
    if irr and not irl:
        return 1
    return 0


labels = np.array([decide(*row) for row in zip(front, left, right, ir_left, ir_right)])

# 5% label noise
flip = rng.random(N) < 0.05
labels[flip] = rng.integers(0, 5, flip.sum())

df = pd.DataFrame({
    "front_cm": front,
    "left_cm": left,
    "right_cm": right,
    "ir_left": ir_left,
    "ir_right": ir_right,
    "action": labels,
})
df["action_name"] = df["action"].map(ACTIONS)

df.to_csv(r"C:\Users\bharg\OneDrive\Desktop\coa.ml\robot_dataset.csv", index=False)
print(df.head(10))
print("\nClass distribution:\n", df["action_name"].value_counts())

# ---- Train a model to check the dataset ----
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score

X = df[["front_cm", "left_cm", "right_cm", "ir_left", "ir_right"]]
y = df["action"]
Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, random_state=1, stratify=y)

model = RandomForestClassifier(n_estimators=100, random_state=1).fit(Xtr, ytr)
print("\nTest accuracy:", round(accuracy_score(yte, model.predict(Xte)), 3))