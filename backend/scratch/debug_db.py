from database import Database
from config import Config

def debug():
    applicants = Database.execute_query('SELECT * FROM applicants;')
    print(f"Total applicants: {len(applicants)}")
    for a in applicants:
        print(f"Applicant ID: {a['id']}, User ID: {a['user_id']}, Status: {a['application_status']}")

if __name__ == "__main__":
    debug()
