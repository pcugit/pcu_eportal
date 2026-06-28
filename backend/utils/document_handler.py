import os
import io
from PIL import Image
from werkzeug.utils import secure_filename
from config import Config
import mimetypes

class DocumentHandler:
    """Handles document upload, compression, and storage"""
    
    @staticmethod
    def allowed_file(filename):
        """Check if file extension is allowed"""
        return '.' in filename and filename.rsplit('.', 1)[1].lower() in Config.ALLOWED_EXTENSIONS
    
    @staticmethod
    def get_file_size(file):
        """Get file size in bytes"""
        file.seek(0, os.SEEK_END)
        size = file.tell()
        file.seek(0)
        return size
    
    @staticmethod
    def compress_image(file, target_size=Config.TARGET_COMPRESSION_SIZE):
        try:
            original_size = DocumentHandler.get_file_size(file)
            file.seek(0)

            img = Image.open(file)
            
            # Convert RGBA to RGB if necessary
            if img.mode in ('RGBA', 'LA', 'P'):
                background = Image.new('RGB', img.size, (255, 255, 255))
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            
            # Start with quality 95 and reduce until target size is reached
            quality = 95
            compressed_file = io.BytesIO()
            
            while quality > 10:
                compressed_file.seek(0)
                compressed_file.truncate(0)
                img.save(compressed_file, format='JPEG', quality=quality, optimize=True)
                compressed_size = compressed_file.tell()
                
                if compressed_size <= target_size:
                    break
                quality -= 5
            
            compressed_file.seek(0)
            final_size = compressed_file.tell()
            compressed_file.seek(0)
            
            return compressed_file, original_size, final_size, True
            
        except Exception as e:
            print(f"Error compressing image: {str(e)}")
            return file, original_size, original_size, False
    
    @staticmethod
    def save_document(file, folder_path, compress=True, stored_basename=None):
        """
        Save document to disk with optional compression
        Returns: (stored_filename, file_size, compressed_size, is_compressed)
        """
        try:
            os.makedirs(folder_path, exist_ok=True)
            
            # Secure the filename
            original_filename = secure_filename(file.filename)
            file_ext = original_filename.rsplit('.', 1)[1].lower() if '.' in original_filename else 'bin'
            
            # Generate unique filename. When a document row UUID is supplied,
            # use it as the physical filename so DB id and stored file align.
            import uuid
            stored_basename = stored_basename or str(uuid.uuid4())
            stored_filename = f"{stored_basename}.{file_ext}"
            file_path = os.path.join(folder_path, stored_filename)
            
            original_size = DocumentHandler.get_file_size(file)
            file.seek(0)
            
            # Try to compress if it's an image
            compressed_size = original_size
            is_compressed = False
            
            if compress and file_ext in ['jpg', 'jpeg', 'png']:
                compressed_file, original_size, compressed_size, success = DocumentHandler.compress_image(file)
                if success:
                    with open(file_path, 'wb') as f:
                        f.write(compressed_file.getvalue())
                    is_compressed = True
                else:
                    file.seek(0)
                    file.save(file_path)
            else:
                file.seek(0)
                file.save(file_path)
            
            return stored_filename, original_size, compressed_size, is_compressed
            
        except Exception as e:
            print(f"Error saving document: {str(e)}")
            return None, 0, 0, False
    
    @staticmethod
    def delete_document(file_path):
        """Delete document from disk"""
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
                return True
        except Exception as e:
            print(f"Error deleting document: {str(e)}")
        return False
    
    @staticmethod
    def get_mime_type(filename):
        """Get MIME type from filename"""
        mime_type, _ = mimetypes.guess_type(filename)
        return mime_type or 'application/octet-stream'
