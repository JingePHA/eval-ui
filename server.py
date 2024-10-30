from flask import Flask, jsonify, request, send_file, render_template, make_response
import os
import json
import boto3
from dotenv import load_dotenv
import threading
import time

# Load environment variables from .env file, if running locally
load_dotenv()

app = Flask(__name__, template_folder='templates', static_folder='static')

# Initialize S3 client
s3 = boto3.client(
    's3',
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
    aws_session_token=os.environ.get('AWS_SESSION_TOKEN'),  # Ensure session token is included for temporary credentials
    region_name=os.environ.get('AWS_DEFAULT_REGION')
)

# Set your S3 bucket name and prefixes
BUCKET_NAME = 'jinge-eval-ui-files'
PDF_PREFIX = 'TCGA_SCC_pdf_selected/'
OCR_PREFIX = 'TCGA_SCC_pdf_selected_OCR/'
PI_PREFIX = 'TCGA_SCC_pdf_selected_PI/'
PI_ANNOTATED_PREFIX = 'PI_annotated/'  # New prefix for saving edited PI files

# Ensure a temporary directory exists for downloaded files
TEMP_DIR = 'temp_downloads'
os.makedirs(TEMP_DIR, exist_ok=True)

# Serve the main HTML page
@app.route('/')
def index():
    return render_template('splitView.HTML')

# Endpoint to list all PDF files in S3
@app.route('/pdf-files', methods=['GET'])
def list_pdf_files():
    try:
        pdf_files = []
        response = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=PDF_PREFIX)

        # Check if 'Contents' key is in the response
        if 'Contents' in response:
            for obj in response['Contents']:
                # Only add files that end with .PDF
                if obj['Key'].endswith('.PDF'):
                    pdf_files.append(obj['Key'].split('/')[-1])
        else:
            print("No contents found in the specified S3 prefix.")
        
        return jsonify(pdf_files)
    except Exception as e:
        print("Error in /pdf-files endpoint:", str(e))
        return jsonify({"error": str(e)}), 500

# Endpoint to serve PDF files from S3
@app.route('/pdf/<filename>', methods=['GET'])
def serve_pdf(filename):
    download_path = os.path.join(TEMP_DIR, filename)
    try:
        s3.download_file(BUCKET_NAME, f'{PDF_PREFIX}{filename}', download_path)
        response = make_response(send_file(download_path, as_attachment=False))
        response.headers['Content-Disposition'] = 'inline'
        
        # Schedule file deletion after response
        threading.Thread(target=delayed_file_delete, args=(download_path,)).start()
        return response
    except Exception as e:
        print(f"Error downloading PDF: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to serve OCR text files from S3
@app.route('/ocr/<filename>', methods=['GET'])
def serve_ocr_text(filename):
    download_path = os.path.join(TEMP_DIR, filename)
    try:
        s3.download_file(BUCKET_NAME, f'{OCR_PREFIX}{filename}', download_path)
        response = make_response(send_file(download_path, mimetype='text/plain'))
        
        # Schedule file deletion after response
        threading.Thread(target=delayed_file_delete, args=(download_path,)).start()
        return response
    except Exception as e:
        print(f"Error downloading OCR text: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to serve pre-saved Pathology Indicators JSON files from S3
@app.route('/indicators/<filename>', methods=['GET'])
def serve_indicators(filename):
    download_path = os.path.join(TEMP_DIR, filename)
    try:
        s3.download_file(BUCKET_NAME, f'{PI_PREFIX}{filename}', download_path)
        with open(download_path, 'r') as file:
            indicators = json.load(file)
        
        # Schedule file deletion after response
        threading.Thread(target=delayed_file_delete, args=(download_path,)).start()
        return jsonify(indicators)
    except Exception as e:
        print(f"Error downloading Indicators JSON: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to save edited PI annotations to S3
@app.route('/save-edited-pi', methods=['POST'])
def save_edited_pi():
    try:
        data = request.json
        filename = data.get('filename', 'default_annotated.json')
        annotations = data.get("annotations", [])
        
        # Save only the original values and comments in the output JSON
        save_data = {
            "annotations": [
                {
                    "indicator": annotation["indicator"],
                    "original_value": annotation["original_value"],
                    "comment": annotation.get("comment", "")
                }
                for annotation in annotations
            ]
        }

        # Define path for S3 upload
        s3_key = f'{PI_ANNOTATED_PREFIX}{filename}'
        
        # Convert data to JSON format for upload
        json_data = json.dumps(save_data, indent=4)
        
        # Upload JSON data directly to S3
        s3.put_object(
            Bucket=BUCKET_NAME,
            Key=s3_key,
            Body=json_data,
            ContentType='application/json'
        )
        
        return jsonify({"message": "File uploaded successfully", "file": s3_key}), 200
    except Exception as e:
        print(f"Error saving edited PI annotations: {e}")
        return jsonify({"error": str(e)}), 500

# Helper function to delay file deletion
def delayed_file_delete(filepath, delay=2):
    time.sleep(delay)
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
    except Exception as e:
        print(f"Error deleting file: {e}")

if __name__ == "__main__":
    app.run(debug=False)
