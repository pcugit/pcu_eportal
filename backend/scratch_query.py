from database import Database
print(Database.execute_query('SELECT tran_type, tran_status FROM payment_transactions WHERE user_id = \'391c8d1e-9087-405b-b5a1-3e7f63d9661d\''))
