import os
import magic
from b2sdk.v2 import InMemoryAccountInfo, B2Api
from werkzeug.utils import secure_filename
from datetime import datetime
from io import BytesIO

import logging

logger = logging.getLogger(__name__)

info = InMemoryAccountInfo()
b2_api = B2Api(info)

try:
    b2_api.authorize_account(
        "production",
        os.environ.get('B2_APP_KEY_ID'),
        os.environ.get('B2_APP_KEY')
    )
except Exception as e:
    pass

B2_BUCKET_NAME = os.environ.get('B2_BUCKET_NAME')

class B2FileManager:
    
    ALLOWED_MIME_TYPES = {
        'application/pdf',
        'image/png', 'image/jpeg', 'image/gif',
        'text/plain', 'text/csv',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip'
    }
    
    MAX_FILE_SIZE = 16 * 1024 * 1024
    
    @staticmethod
    def validate_and_upload(file, user_id):
        if not file or not file.name:
            return False, "No file provided", None
        
        safe_filename = secure_filename(file.name)
        if not safe_filename or '.' not in safe_filename:
            return False, "Invalid filename", None
        
        file.seek(0, os.SEEK_END)
        file_size = file.tell()
        file.seek(0)
        
        if file_size > B2FileManager.MAX_FILE_SIZE:
            return False, f"File too large (max 16MB)", None
        
        if file_size == 0:
            return False, "File is empty", None
        
        file.seek(0)
        file_bytes = file.read(2048)
        file.seek(0)
        
        try:
            detected_mime = magic.from_buffer(file_bytes, mime=True)
        except:
            return False, "Could not detect file type", None
        
        if detected_mime not in B2FileManager.ALLOWED_MIME_TYPES:
            return False, f"File type not allowed: {detected_mime}", None
        
        try:
            bucket = b2_api.get_bucket_by_name(B2_BUCKET_NAME)
            
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
            unique_filename = f"user_{user_id}/{timestamp}_{safe_filename}"
            
            file.seek(0)
            file_content = file.read()
            
            file_info = bucket.upload_bytes(
                data_bytes=file_content,
                file_name=unique_filename,
                content_type=detected_mime,
                file_infos={
                    'b2-content-disposition': 'inline'
                }
            )
            
            download_url = b2_api.account_info.get_download_url()
            base_url = f"{download_url}/file/{B2_BUCKET_NAME}/{unique_filename}"
            
            file_data = {
                'b2_file_id': file_info.id_,
                'b2_file_name': unique_filename,
                'download_url': base_url,
                'original_filename': safe_filename,
                'file_size': file_size,
                'mime_type': detected_mime
            }
            
            return True, "File uploaded successfully", file_data
            
        except Exception as e:
            return False, f"Upload failed: {str(e)}", None
    
    @staticmethod
    def get_download_authorization(b2_file_name, duration_seconds=3600):
        try:
            bucket = b2_api.get_bucket_by_name(B2_BUCKET_NAME)
            
            auth_token = bucket.get_download_authorization(
                file_name_prefix=b2_file_name,
                valid_duration_in_seconds=duration_seconds
            )
            
            download_url = b2_api.account_info.get_download_url()
            file_url = f"{download_url}/file/{B2_BUCKET_NAME}/{b2_file_name}"
            
            return {
                'url': file_url,
                'authorization_token': auth_token,
                'expires_in': duration_seconds
            }
            
        except Exception as e:
            return None

    @staticmethod
    def delete_file(b2_file_id: str, b2_file_name: str):
        try:
            b2_api.delete_file_version(b2_file_id, b2_file_name)
            return True
        except Exception as e:
            return False
    
    @staticmethod
    def generate_signed_image_url(b2_file_name: str, duration_seconds: int = 3600):
        try:
            bucket = b2_api.get_bucket_by_name(B2_BUCKET_NAME)
            auth_token = bucket.get_download_authorization(
                file_name_prefix=b2_file_name,
                valid_duration_in_seconds=duration_seconds,
            )
            file_url = f"{b2_api.account_info.get_download_url()}/file/{B2_BUCKET_NAME}/{b2_file_name}"
            return {
                "signed_url": f"{file_url}?Authorization={auth_token}", 
                "expires_in": duration_seconds
            }
        except Exception as e:
            return None


    @staticmethod
    def stream_private_file(file_name):
        try:
            bucket = b2_api.get_bucket_by_name(B2_BUCKET_NAME)
            buffer = BytesIO()
            downloaded_file = bucket.download_file_by_name(file_name)
            downloaded_file.save(buffer) 
            content = buffer.getvalue()
            import mimetypes
            content_type, _ = mimetypes.guess_type(file_name)
            if not content_type:
                content_type = "application/octet-stream"

            return content, content_type

        except Exception as e:
            logger.error(f"Download error: {e}", exc_info=True)
            raise
