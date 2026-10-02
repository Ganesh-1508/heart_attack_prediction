# ❤️ CardioAI – Heart Attack Risk Prediction & Decision Support System

CardioAI is an AI-powered web application designed to estimate heart attack risk based on selected cardiovascular health parameters.

The system uses a pre-trained Machine Learning model through a Flask web application and provides prediction results, probability/confidence information, feature-importance analysis, personalized recommendations, prediction history, statistics, and downloadable PDF reports.

> **Disclaimer:** This project is intended for educational and research purposes only. It is not a medical diagnostic system and should not be used as a substitute for professional medical advice.

---

## 🚀 Features

### 🔮 Heart Attack Risk Prediction

Users can enter cardiovascular health information and receive an AI-generated risk prediction.

The system considers parameters such as:

* Age
* Sex
* Chest Pain Type
* Resting Blood Pressure
* Cholesterol
* Fasting Blood Sugar
* Resting ECG
* Maximum Heart Rate
* Exercise-Induced Angina
* Oldpeak
* ST Slope

### 📊 Risk Probability & Confidence

The application provides:

* Prediction result
* Risk probability
* Prediction confidence
* Input health parameters

### 🧠 Feature Importance

CardioAI performs local feature-importance analysis by perturbing individual input features and measuring the change in predicted probability.

This helps users understand which input factors have a greater influence on the model's prediction.

### 💡 Personalized Recommendations

The system generates recommendations based on the entered health parameters.

Examples include recommendations related to:

* Blood pressure
* Cholesterol
* Heart rate
* ST depression
* Blood sugar
* Exercise-induced angina
* Chest pain

### 📋 Prediction History

Previous predictions are stored locally using SQLite.

The history module supports:

* Patient-name search
* Date filtering
* Pagination
* Sorting
* Individual prediction details
* Prediction statistics

### 📄 PDF Reports

The application can generate downloadable PDF reports containing prediction information and relevant patient details.

### 💾 SQLite Database

The application automatically initializes a local SQLite database and stores prediction records.

No external database server is required for the main application.

---

## 🛠️ Technologies Used

| Technology   | Purpose                    |
| ------------ | -------------------------- |
| Python       | Backend programming        |
| Flask        | Web application framework  |
| Scikit-learn | Machine Learning model     |
| NumPy        | Numerical computation      |
| SQLite       | Prediction history storage |
| FPDF2        | PDF report generation      |
| HTML         | Web interface              |
| CSS          | UI styling                 |
| JavaScript   | Frontend interaction       |
| Pickle       | Model and scaler storage   |

---

## 📁 Project Structure

```text
heart_attack_prediction/
│
├── app.py                  # Flask application and prediction API
├── db.py                   # SQLite database operations
├── model.pkl               # Trained machine learning model
├── scaler (1).pkl          # Feature scaling model
├── cardioai.db             # Local SQLite database
├── setup_db.sql            # Optional database setup script
├── requirements.txt        # Python dependencies
│
├── templates/
│   └── index.html          # Main web interface
│
└── static/
    ├── css/
    │   └── style.css       # Application styling
    │
    └── js/
        └── app.js          # Frontend JavaScript
```

---

## ⚙️ Installation

### 1. Clone the repository

```bash
git clone https://github.com/YOUR-USERNAME/YOUR-REPOSITORY.git
```

Move into the project directory:

```bash
cd YOUR-REPOSITORY
```

---

### 2. Create a virtual environment

Windows:

```bash
python -m venv venv
```

Activate it:

```bash
venv\Scripts\activate
```

---

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

---

## ▶️ Run the Application

Start the Flask application:

```bash
python app.py
```

The terminal should display the local Flask server address.

Open the application in your browser:

```text
http://127.0.0.1:5000
```

or

```text
http://localhost:5000
```

---

## 🧠 Machine Learning Model

The application loads two pre-trained files:

```text
model.pkl
scaler (1).pkl
```

The scaler transforms the input features before they are passed to the trained model.

The model generates a probability that is used to determine the application's risk prediction.

The project does not train the model during application startup; it uses the pre-trained model stored in the repository.

---

## 🗄️ Database

CardioAI primarily uses SQLite for persistent prediction history.

The database file is:

```text
cardioai.db
```

The application automatically creates the required table when it starts.

The main table is:

```text
predictions
```

It stores information including:

* Patient name
* Age
* Sex
* Chest pain type
* Resting blood pressure
* Cholesterol
* Fasting blood sugar
* Resting ECG
* Maximum heart rate
* Exercise angina
* Oldpeak
* ST slope
* Prediction
* Probability
* Confidence
* Creation timestamp

---

## 🔌 API Endpoints

### Home

```text
GET /
```

Loads the main CardioAI application.

### Prediction

```text
POST /predict
```

Processes the submitted cardiovascular parameters and returns the prediction result.

### Prediction History

```text
GET /history
```

Returns stored prediction records with filtering and pagination support.

### Statistics

```text
GET /history/stats
```

Returns prediction statistics.

### Individual Record

```text
GET /history/<record_id>
```

Retrieves a specific prediction record.

### PDF Report

```text
POST /report
```

Generates a PDF report for a prediction.

---

## 🔬 Feature Importance Method

The application uses a local perturbation-based approach.

For each input feature:

1. The original prediction probability is calculated.
2. The feature is slightly increased.
3. The prediction probability is calculated again.
4. The difference between the probabilities is measured.
5. This difference is used as an indication of the feature's local influence.

This provides an interpretable view of how individual input values affect a particular prediction.

---

## 🔐 Privacy

The project uses a local SQLite database for prediction history.

If this project is deployed publicly, additional security measures should be implemented, including:

* Authentication
* Authorization
* Secure database configuration
* HTTPS
* Input validation
* Protection of patient information
* Secure handling of generated reports

Do not upload real patient or personally identifiable medical information to a public repository.

---

## ⚠️ Medical Disclaimer

CardioAI is an academic/educational Machine Learning project.

The predictions generated by this application are **not medical diagnoses**.

The system should not be used to:

* Diagnose heart disease
* Replace a doctor
* Decide medical treatment
* Replace emergency medical care

For actual medical concerns, users should consult a qualified healthcare professional.

---

## 🎓 Project Purpose

This project demonstrates the practical application of:

* Machine Learning
* Flask web development
* Healthcare analytics
* Explainable AI concepts
* REST-style API development
* SQLite database management
* Data visualization and interpretation
* Automated PDF report generation

---

## 👨‍💻 Author

**Ganesh Ghodke**

B.Tech – Computer Science and Engineering (Artificial Intelligence)

Vishwakarma Institute of Technology, Pune

---

## ⭐ Future Improvements

Possible future enhancements include:

* Model retraining interface
* Advanced explainable AI using SHAP
* User authentication
* Doctor/admin dashboard
* Cloud database integration
* Secure deployment
* Docker support
* Model performance dashboard
* Automated model evaluation
* Mobile-responsive improvements
* Cloud deployment

---

## 📜 License

This project is intended for educational and academic purposes.

You may modify and extend the project for learning and research purposes.
