from flask import Flask, jsonify
from flask_cors import CORS
from uuid import uuid4

app = Flask(__name__)
CORS(app)

@app.route('/get_updated_geofences', methods=['GET'])
def get_geofences():
    # Return demo geofence polygons with risk levels
    return jsonify([
        {
            'id': str(uuid4()),
            'name': 'High Risk Zone',
            'risk_level': 'high',
            'polygon': [[28.614,77.232],[28.614,77.240],[28.620,77.240],[28.620,77.232],[28.614,77.232]]
        },
        {
            'id': str(uuid4()),
            'name': 'Medium Risk Zone',
            'risk_level': 'medium',
            'polygon': [[28.623,77.230],[28.623,77.238],[28.629,77.238],[28.629,77.230],[28.623,77.230]]
        },
        {
            'id': str(uuid4()),
            'name': 'Safe Zone',
            'risk_level': 'low',
            'polygon': [[28.605,77.220],[28.605,77.225],[28.610,77.225],[28.610,77.220],[28.605,77.220]]
        }
    ])

if __name__ == '__main__':
    app.run(port=5003)
