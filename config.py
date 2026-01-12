"""
Configuration file for HUB SALES AI project.
Loads environment variables from .env file.
"""
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()


class Config:
    """Application configuration"""
    
    # Telegram Bot Configuration
    TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN')
    TELEGRAM_BOT_USERNAME = os.getenv('TELEGRAM_BOT_USERNAME', 'HUBSalesAI_bot')
    
    # DigitalOcean Droplet Configuration
    DROPLET_NAME = os.getenv('DROPLET_NAME', 'fes-sales-ai')
    DROPLET_PRIVATE_IP = os.getenv('DROPLET_PRIVATE_IP')
    DROPLET_PUBLIC_IP = os.getenv('DROPLET_PUBLIC_IP')
    DROPLET_PASSWORD = os.getenv('DROPLET_PASSWORD')
    DROPLET_PUBLIC_GATEWAY = os.getenv('DROPLET_PUBLIC_GATEWAY')
    
    # Database Configuration
    DB_USERNAME = os.getenv('DB_USERNAME')
    DB_PASSWORD = os.getenv('DB_PASSWORD')
    DB_HOST = os.getenv('DB_HOST')
    DB_PORT = int(os.getenv('DB_PORT', 25060))
    DB_NAME = os.getenv('DB_NAME', 'HUBSalesAi')
    DB_SSLMODE = os.getenv('DB_SSLMODE', 'require')
    
    # Database Connection String
    @property
    def DATABASE_URL(self):
        """Generate PostgreSQL connection string"""
        return (
            f"postgresql://{self.DB_USERNAME}:{self.DB_PASSWORD}"
            f"@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            f"?sslmode={self.DB_SSLMODE}"
        )
    
    # Klaude API Configuration
    KLAUDE_API_KEY = os.getenv('KLAUDE_API_KEY')
    KLAUDE_API_BASE_URL = "https://api.anthropic.com/v1"  # Adjust if needed


# Create global config instance
config = Config()


