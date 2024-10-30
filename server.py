from flask import Flask, jsonify, request, send_file, render_template, make_response
import os
import json
import boto3
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
PI_PREFIX = 'TCGA_SCC_pdf_selected_PI/'  # Use the same prefix as the original JSON file location

# Temporary directory for downloaded files
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

# Endpoint to serve and load Pathology Indicators JSON files with comments
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

# Endpoint to save edited annotations back to the original JSON file on S3
@app.route('/save-edited-pi', methods=['POST'])
def save_edited_pi():
    data = request.json
    filename = data.get('filename')
    updated_indicators = data.get("indicators", {})

    download_path = os.path.join(TEMP_DIR, filename)
    try:
        # Download the original JSON file from S3
        s3.download_file(BUCKET_NAME, f'{PI_PREFIX}{filename}', download_path)
        
        # Load the original data
        with open(download_path, 'r') as file:
            original_data = json.load(file)
        
        # Update the JSON with comments
        for indicator, details in updated_indicators.items():
            if indicator in original_data:
                if isinstance(original_data[indicator], dict):
                    original_data[indicator]["comment"] = details.get("comment", "")
                else:
                    original_data[indicator] = {
                        "value": original_data[indicator],
                        "comment": details.get("comment", "")
                    }
        
        # Save the modified data locally
        with open(download_path, 'w') as file:
            json.dump(original_data, file, indent=4)
        
        # Upload the modified JSON back to S3, overwriting the original file
        s3.upload_file(download_path, BUCKET_NAME, f'{PI_PREFIX}{filename}')
        return jsonify({"message": "Annotations saved successfully"}), 200
    except Exception as e:
        print(f"Error saving edited PI: {e}")
        return jsonify({"error": str(e)}), 500
    finally:
        if os.path.exists(download_path):
            os.remove(download_path)

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
