import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    FLASK_ENV = os.getenv('FLASK_ENV', 'development')

    SECRET_KEY = os.getenv('SECRET_KEY')
    JWT_SECRET = os.getenv('JWT_SECRET')


    UPLOAD_FOLDER = os.path.join(os.path.dirname(__file__), 'uploads')
    MAX_CONTENT_LENGTH = 15 * 1024 * 1024  # 15MB
    TARGET_COMPRESSION_SIZE = 5 * 1024
    ALLOWED_EXTENSIONS = {'pdf', 'jpg', 'jpeg', 'png', 'doc', 'docx'}

    PROGRAMS = ['Undergraduate', 'Postgraduate', 'HND', 'Part time', 'Jupeb']

    # ── Interswitch Payment Gateway ───────────────────────────────────────────
    INTERSWITCH_BASE_URL          = os.getenv('INTERSWITCH_BASE_URL', 'https://sandbox.interswitchng.com')
    INTERSWITCH_CLIENT_ID         = os.getenv('INTERSWITCH_CLIENT_ID', '')
    INTERSWITCH_CLIENT_SECRET     = os.getenv('INTERSWITCH_CLIENT_SECRET', '')
    INTERSWITCH_MERCHANT_CODE     = os.getenv('INTERSWITCH_MERCHANT_CODE', '')
    INTERSWITCH_PAY_ITEM_ID_APP   = os.getenv('INTERSWITCH_PAY_ITEM_ID_APP', '')   # Application fee
    INTERSWITCH_PAY_ITEM_ID_ACC   = os.getenv('INTERSWITCH_PAY_ITEM_ID_ACC', '')   # Acceptance fee
    INTERSWITCH_PAY_ITEM_ID_TUI   = os.getenv('INTERSWITCH_PAY_ITEM_ID_TUI', '')   # Tuition fee
    FRONTEND_BASE_URL             = os.getenv('FRONTEND_BASE_URL') or os.getenv('NEXT_PUBLIC_APP_URL') or 'http://localhost:3000'


class DevelopmentConfig(Config):
    DEBUG = True


class ProductionConfig(Config):
    DEBUG = False


config = {
    'development': DevelopmentConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}
