from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

@app.route('/detect_anomaly', methods=['POST'])
def detect_anomaly():
    data = request.json
    lat = data.get('lat')
    lng = data.get('lng')
    speed = data.get('speed', 0)
    prev_speed = data.get('prev_speed', 1)

    # Rule-based anomaly:
    if speed == 0 and prev_speed > 5:
        return jsonify({'anomaly': True, 'reason': 'Sudden stop detected'})
    return jsonify({'anomaly': False})

if __name__ == '__main__':
    app.run(port=5001)
