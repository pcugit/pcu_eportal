from database import Database
from utils.payment_status import apply_downstream_success

def sync_missing_students():
    missing_users = Database.execute_query(
        '''SELECT user_id, reference_no 
           FROM payment_transactions 
           WHERE tran_type = 'tuition' 
             AND tran_status = 'successful'
             AND user_id NOT IN (SELECT "UserId" FROM students)'''
    )
    
    if not missing_users:
        print("No missing students found.")
        return

    print(f"Found {len(missing_users)} missing students. Syncing...")
    
    for u in missing_users:
        try:
            print(f"Syncing user {u['user_id']} with ref {u['reference_no']}")
            apply_downstream_success(u['user_id'], 'tuition', u['reference_no'])
            print(f"Success for user {u['user_id']}")
        except Exception as e:
            print(f"Failed for user {u['user_id']}: {e}")

if __name__ == '__main__':
    sync_missing_students()
