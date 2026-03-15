import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np

# Omega Risk Predictor - Multilayer Perceptron
class RiskPredictor(nn.Module):
    def __init__(self, input_size=4):
        super(RiskPredictor, self).__init__()
        self.fc1 = nn.Linear(input_size, 32)
        self.fc2 = nn.Linear(32, 16)
        self.fc3 = nn.Linear(16, 1)
        self.relu = nn.ReLU()
        self.sigmoid = nn.Sigmoid()

    def forward(self, x):
        x = self.relu(self.fc1(x))
        x = self.relu(self.fc2(x))
        x = self.sigmoid(self.fc3(x))
        return x

def train_model(X, y, epochs=100):
    model = RiskPredictor()
    criterion = nn.MSELoss()
    optimizer = optim.Adam(model.parameters(), lr=0.01)

    X_tensor = torch.tensor(X, dtype=torch.float32)
    y_tensor = torch.tensor(y, dtype=torch.float32).unsqueeze(1)

    for epoch in range(epochs):
        optimizer.zero_grad()
        outputs = model(X_tensor)
        loss = criterion(outputs, y_tensor)
        loss.backward()
        optimizer.step()
    
    return model

if __name__ == "__main__":
    # Sample training data
    np.random.seed(42)
    X = np.random.rand(100, 4)
    y = 1 - (X[:,0] * 0.4 + X[:,1] * 0.1 + X[:,2] * 0.3 + X[:,3] * 0.2) + np.random.normal(0, 0.05, 100)
    y = np.clip(y, 0, 1)

    model = train_model(X, y)
    torch.save(model.state_of_world(), "omega_model.pth")
    print("Model trained and saved.")
