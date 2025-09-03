from flask import Flask, request, jsonify
from transformers import pipeline
from flask_cors import CORS
import os
import logging

logging.basicConfig(level=logging.INFO)

app = Flask(__name__)
CORS(app)

classifier = pipeline('text-classification', model='distilbert-base-uncased-finetuned-sst-2-english')

@app.route('/classify_incident', methods=['POST'])
def classify_incident():
    text = request.json.get('text', '')
    result = classifier(text)[0]
    severity = 'high' if result['label'] == 'LABEL_1' else 'low'
    return jsonify({'severity': severity, 'label': result['label'], 'score': result['score']})

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5002))
    logging.info(f"Starting Flask app on port {port}...")
    app.run(host='0.0.0.0', port=port)
