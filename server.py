from flask import Flask, jsonify, request, send_from_directory, render_template
import os
import json

app = Flask(__name__)

# Define folder paths
PDF_FOLDER = './TCGA_SCC_pdf_selected'
OCR_FOLDER = './TCGA_SCC_pdf_selected_OCR'
ANNOTATION_FOLDER = './OCR_text_annotation'

# Ensure the edited OCR folder exists
os.makedirs(ANNOTATION_FOLDER, exist_ok=True)

# Serve the main HTML page
@app.route('/')
def index():
    return render_template('splitView.HTML')

# Endpoint to list all PDF files
@app.route('/pdf-files', methods=['GET'])
def list_pdf_files():
    try:
        pdf_files = [f for f in os.listdir(PDF_FOLDER) if f.endswith('.PDF')]
        return jsonify(pdf_files)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to serve PDF files
@app.route('/pdf/<path:filename>', methods=['GET'])
def serve_pdf(filename):
    try:
        return send_from_directory(PDF_FOLDER, filename)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# Endpoint to serve OCR text files
@app.route('/ocr/<path:filename>', methods=['GET'])
def serve_ocr_text(filename):
    try:
        return send_from_directory(OCR_FOLDER, filename, mimetype='text/plain')
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/save-edited-ocr', methods=['POST'])
def save_edited_ocr():
    data = request.json
    filename = data.get('filename', 'default_edited.json')
    filepath = os.path.join(ANNOTATION_FOLDER, filename)
    
    # Only store final annotations
    save_data = {
        "annotations": data.get("annotations", [])
    }
    
    with open(filepath, 'w') as f:
        json.dump(save_data, f, indent=4)
    
    return jsonify({"message": "File saved successfully"}), 200

if __name__ == "__main__":
    app.run(debug=True)
