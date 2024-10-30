from flask import Flask, jsonify, request, make_response, send_file, render_template
import boto3
import os
import json
from dotenv import load_dotenv
import threading
import time

# Load environment variables from .env file, if running locally
load_dotenv()

app = Flask(__name__)

# Initialize S3 client
s3 = boto3.client(
    's3',
    aws_access_key_id=os.environ.get('AWS_ACCESS_KEY_ID'),
    aws_secret_access_key=os.environ.get('AWS_SECRET_ACCESS_KEY'),
    region_name=os.environ.get('AWS_DEFAULT_REGION')
)

# Set your S3 bucket name and prefixes
BUCKET_NAME = 'jinge-eval-ui-files'
PDF_PREFIX = 'TCGA_SCC_pdf_selected/'
OCR_PREFIX = 'TCGA_SCC_pdf_selected_OCR/'
PI_PREFIX = 'TCGA_SCC_pdf_selected_PI/'
COMMENTS_PREFIX = 'PI_annotated/'  # Folder in S3 where comment files are saved

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
        if 'Contents' in response:
            for obj in response['Contents']:
                if obj['Key'].endswith('.PDF'):
                    pdf_files.append(obj['Key'].split('/')[-1])
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
        threading.Thread(target=delayed_file_delete, args=(download_path,)).start()
        return jsonify(indicators)
    except Exception as e:
        print(f"Error downloading Indicators JSON: {e}")
        return jsonify({"error": str(e)}), 500

# New endpoint to load comments from S3 if available
@app.route('/load-comments/<filename>', methods=['GET'])
def load_comments(filename):
    json_file_path = f"{COMMENTS_PREFIX}{filename}"
    try:
        # Debugging print to check the full path being requested
        print(f"Attempting to fetch file from S3 at path: {json_file_path}")
        
        response = s3.get_object(Bucket=BUCKET_NAME, Key=json_file_path)
        comments_data = json.loads(response['Body'].read().decode('utf-8'))
        return jsonify(comments_data), 200
    except s3.exceptions.NoSuchKey:
        print("File not found in S3 for comments.")
        return jsonify({"annotations": []}), 404
    except Exception as e:
        print(f"Error loading comments JSON: {e}")
        return jsonify({"error": str(e)}), 500

# Endpoint to save edited PI comments to S3
@app.route('/save-edited-pi', methods=['POST'])
def save_edited_pi():
    data = request.json
    filename = data.get('filename', 'default_edited.json')
    annotations = data.get("annotations", [])

    upload_path = os.path.join(TEMP_DIR, filename)
    with open(upload_path, 'w') as f:
        json.dump({"annotations": annotations}, f, indent=4)

    try:
        s3.upload_file(upload_path, BUCKET_NAME, f"{COMMENTS_PREFIX}{filename}")
        return jsonify({"message": "File saved successfully"}), 200
    except Exception as e:
        print(f"Error saving edited PI: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(upload_path):
            os.remove(upload_path)

# Helper function to delay file deletion
def delayed_file_delete(filepath, delay=2):
    time.sleep(delay)
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
    except Exception as e:
        print(f"Error deleting file: {e}")

if __name__ == "__main__":
    app.run(debug=True)
