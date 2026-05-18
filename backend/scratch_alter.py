from database import Database

try:
    Database.execute_update('ALTER TABLE students ALTER COLUMN "CurrentUserId" TYPE UUID USING NULL;')
    print("Successfully altered CurrentUserId in students table")
except Exception as e:
    print(f"Error: {e}")
