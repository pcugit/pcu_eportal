from database import Database

COURSES = [
    "Computer information system",
    "Computer science",
    "Mass communication",
    "Accounting",
    "Biochemistry",
    "Business administration",
    "Economics",
    "International relations",
    "Microbiology",
    "Physics with electronics",
    "Industrial chemistry",
    "Software engineering",
    "Cyber security",
    "Procurement management"
]

def sync_courses():
    # Program Types: 1=Undergraduate, 4=Part-Time
    program_types = [1, 4]
    
    # Get existing departments to use a default one (id 1)
    dept_res = Database.execute_query("SELECT id FROM departments LIMIT 1")
    default_dept_id = dept_res[0]['id'] if dept_res else 1
    
    for pt_id in program_types:
        for course_name in COURSES:
            # Check if exists for this type
            existing = Database.execute_query(
                "SELECT id FROM programs WHERE name = %s AND program_type_id = %s",
                (course_name, pt_id)
            )
            
            if not existing:
                # Also check for "B.Sc." versions and update them
                bsc_version = f"B.Sc. {course_name}"
                existing_bsc = Database.execute_query(
                    "SELECT id FROM programs WHERE name LIKE %s AND program_type_id = %s",
                    (f"%{course_name}%", pt_id)
                )
                
                if existing_bsc:
                    Database.execute_update(
                        "UPDATE programs SET name = %s WHERE id = %s",
                        (course_name, existing_bsc[0]['id'])
                    )
                else:
                    # Insert new
                    Database.execute_update(
                        """INSERT INTO programs 
                           (name, description, department_id, program_type_id, level, session) 
                           VALUES (%s, %s, %s, %s, %s, %s)""",
                        (course_name, f"Degree in {course_name}", default_dept_id, pt_id, "100 Level", "2025/2026")
                    )

if __name__ == "__main__":
    sync_courses()
    print("Courses synchronized successfully.")
