from flask import Flask, jsonify
from flask_cors import CORS
import os

app = Flask(__name__)
CORS(app)

@app.route('/summary', methods=['GET'])
def summary():
    return jsonify({
        'total_tourists': 10,
        'active_tourists': 7,
        'incident_trends': {'high': 2, 'low': 5},
        'hotspots': [{'lat': 28.615, 'lng': 77.230, 'count': 3}]
    })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5004))
    app.run(host='0.0.0.0', port=port)

