from database import Database
import json
import sys
import os

# Add parent directory to path to import database
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def check_db():
    try:
        # Check program_types (1-7)
        pt = Database.execute_query("SELECT id, name FROM program_types WHERE id BETWEEN 1 AND 7 ORDER BY id")
        print("--- PROGRAM TYPES (1-7) ---")
        print(json.dumps(pt, indent=2))
        

    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_db()
