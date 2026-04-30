
from database import Database
import json

def check_schema():
    tables = ['app_olevel_results', 'app_olevel_subjects']
    results = {}
    for table in tables:
        cols = Database.execute_query(f"SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '{table}'")
        results[table] = cols
    
    print(json.dumps(results, indent=2))

if __name__ == "__main__":
    check_schema()
