import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))
from dotenv import load_dotenv
load_dotenv()
from database import Database

print("=== Program Types ===")
types = Database.execute_query("SELECT id, name FROM program_types ORDER BY id")
for t in (types or []):
    print("  id=%s  name=%s" % (t["id"], t["name"]))

print()
print("=== program_fees rows used in fee_mapping (ids 37-43) ===")
fees = Database.execute_query("""
    SELECT pf.id, pf.program_type, pf.amount, fc.name AS component
    FROM program_fees pf
    LEFT JOIN fee_components fc ON fc.id = pf.fee_component_id
    WHERE pf.id IN (37,38,39,40,41,42,43)
    ORDER BY pf.id
""")
for f in (fees or []):
    print("  pf.id=%s  program_type=%s  amount=%s  component=%s" % (
        f["id"], f["program_type"], f["amount"], f["component"]
    ))
