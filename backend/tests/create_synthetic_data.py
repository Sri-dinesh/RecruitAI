import os
import json

RESUME_DIR = "backend/data/resumes"
os.makedirs(RESUME_DIR, exist_ok=True)

resumes = [
    # --- STRONG MATCHES (5 candidates) ---
    {
        "filename": "alice_smith.txt",
        "content": """Name: Alice Smith
Email: alice.smith@email.com
Experience: 6 years
Skills: Python, React, Node.js, PostgreSQL, AWS, TypeScript, Docker, Git

Projects:
- Microservices Platform: Architected and deployed a collection of microservices using Python and Node.js on AWS ECS, improving request throughput by 40%.
- Interactive Web Dashboard: Developed a responsive dashboard using React and TypeScript, connected to a PostgreSQL database for real-time analytics.

Education:
- Bachelor of Science in Computer Science, State University, 2020.
"""
    },
    {
        "filename": "bob_jones.txt",
        "content": """Name: Bob Jones
Email: bob.jones@email.com
Experience: 8 years
Skills: Python, Django, React, Node.js, PostgreSQL, TypeScript, AWS, Docker, Kubernetes, CI/CD

Projects:
- Cloud Migration: Led the migration of legacy services to AWS using Terraform. Integrated React frontend with Python/Django backends.
- Database Optimization: Optimized PostgreSQL queries and schemas, reducing slow query counts by 65%.

Education:
- Master of Science in Software Engineering, Tech Institute, 2018.
"""
    },
    {
        "filename": "charlie_brown.txt",
        "content": """Name: Charlie Brown
Email: charlie.brown@email.com
Experience: 5 years
Skills: React, TypeScript, Node.js, Python, PostgreSQL, AWS S3/EC2, GraphQL, Redis

Projects:
- E-Commerce Engine: Engineered a high-traffic shopping platform using React on the frontend and Node.js/Python on the backend, deployed on AWS.
- Real-time Notifications: Implemented a WebSocket notification system backed by Redis and PostgreSQL.

Education:
- Bachelor of Technology in Information Technology, University of Engineering, 2021.
"""
    },
    {
        "filename": "diana_prince.txt",
        "content": """Name: Diana Prince
Email: diana.prince@email.com
Experience: 7 years
Skills: Python, Flask, React, TypeScript, Node.js, PostgreSQL, AWS, Serverless, DynamoDB

Projects:
- IoT Analytics: Built serverless ingestion pipelines on AWS. Created a React dashboard using TypeScript to visualize sensor data stored in PostgreSQL.
- API gateway: Designed RESTful API endpoints using Python/Flask and Node.js with comprehensive test coverage.

Education:
- Bachelor of Science in Computer Engineering, Global College, 2019.
"""
    },
    {
        "filename": "evan_wright.txt",
        "content": """Name: Evan Wright
Email: evan.wright@email.com
Experience: 9 years
Skills: Node.js, React, TypeScript, Python, PostgreSQL, AWS CloudFormation, Redis, Serverless, Jest

Projects:
- FinTech Application: Built secure APIs using Python and Node.js. Used React and TypeScript for transaction tracking screens. Deployed on AWS.
- Distributed Caching: Managed caching layers with Redis, improving database response times for PostgreSQL queries.

Education:
- Bachelor of Science in Computer Science, City University, 2017.
"""
    },

    # --- PARTIAL MATCHES (7 candidates) ---
    {
        "filename": "fiona_gallagher.txt",
        "content": """Name: Fiona Gallagher
Email: fiona.g@email.com
Experience: 4 years
Skills: React, Node.js, PostgreSQL, JavaScript, HTML5, CSS3, Express

Projects:
- Local Business Directory: Created a full-stack directory application using React and Node.js, utilizing PostgreSQL for storage.
- Admin Panel: Coded a responsive admin interface for content managers.

Education:
- Associate Degree in Web Development, Tech Academy, 2022.
"""
    },
    {
        "filename": "george_green.txt",
        "content": """Name: George Green
Email: george.green@email.com
Experience: 6 years
Skills: Python, Django, PostgreSQL, Docker, AWS, Linux, Bash Scripting

Projects:
- Automation Scripts: Wrote extensive command line tools and automation scripts in Python to streamline file processing and DB cleanups in PostgreSQL.
- Server Management: Configured EC2 instances on AWS and set up continuous deployments.

Education:
- Bachelor of Science in Mathematics, Science College, 2020.
"""
    },
    {
        "filename": "hannah_abbott.txt",
        "content": """Name: Hannah Abbott
Email: hannah.a@email.com
Experience: 3 years
Skills: Python, React, Node.js, PostgreSQL, AWS, TypeScript, Git

Projects:
- Portfolio Manager: Built a lightweight tool for personal budget planning using React and Python.
- Database Syncer: Wrote a Node.js script to sync local records with a cloud PostgreSQL database on AWS.

Education:
- Bachelor of Science in Computer Science, State College, 2023.
"""
    },
    {
        "filename": "ian_malcolm.txt",
        "content": """Name: Ian Malcolm
Email: ian.m@email.com
Experience: 7 years
Skills: React, TypeScript, Node.js, PostgreSQL, HTML5, CSS3, Redux, Sass

Projects:
- Frontend UI Kit: Developed a reusable component library in React and TypeScript for standardizing web design layouts.
- Content Management System: Built a CMS dashboard with Node.js and PostgreSQL.

Education:
- Bachelor of Arts in Graphic Design, Arts University, 2019.
"""
    },
    {
        "filename": "julia_roberts.txt",
        "content": """Name: Julia Roberts
Email: julia.r@email.com
Experience: 6 years
Skills: Python, Flask, MySQL, AWS, Docker, Git, REST APIs

Projects:
- Machine Learning Pipeline: Deployed predictive models using Flask and Docker on AWS ECS.
- Inventory Tracker: Managed database schemas in MySQL for warehouse inventory tracking.

Education:
- Bachelor of Science in Data Science, Capital University, 2020.
"""
    },
    {
        "filename": "kevin_bacon.txt",
        "content": """Name: Kevin Bacon
Email: kevin.b@email.com
Experience: 5 years
Skills: Java, Spring Boot, React, PostgreSQL, AWS, Maven, Hibernate

Projects:
- Banking Portal: Developed backend microservices using Java/Spring Boot. Connected components with PostgreSQL.
- User Profile Dashboard: Rendered user details in a React dashboard.

Education:
- Bachelor of Science in Information Systems, National University, 2021.
"""
    },
    {
        "filename": "laura_croft.txt",
        "content": """Name: Laura Croft
Email: laura.croft@email.com
Experience: 8 years
Skills: PHP, Laravel, Vue.js, MySQL, AWS, JavaScript, Bootstrap

Projects:
- Legacy Rewrite: Migrated a legacy system to Laravel and Vue.js on AWS.
- Database Admin: Optimized MySQL indexes and slow queries.

Education:
- Bachelor of Science in Information Technology, Coast College, 2018.
"""
    },

    # --- WEAK MATCHES (5 candidates) ---
    {
        "filename": "michael_scott.txt",
        "content": """Name: Michael Scott
Email: michael.s@email.com
Experience: 2 years
Skills: HTML, CSS, JavaScript, jQuery, WordPress, Photoshop

Projects:
- Client Website Designs: Designed and launched marketing websites for local businesses using WordPress, HTML, and CSS.
- Image Asset Design: Edited banners and corporate graphics.

Education:
- High School Diploma, Scranton High, 2016.
"""
    },
    {
        "filename": "nancy_drew.txt",
        "content": """Name: Nancy Drew
Email: nancy.d@email.com
Experience: 10 years
Skills: Cobol, Fortran, DB2, Mainframe, JCL, SQL

Projects:
- Legacy Banking Systems Maintenance: Maintained transactional databases and batch scripts on legacy mainframe hardware.
- Migration Consulting: Assisted in documenting legacy code logic.

Education:
- Bachelor of Science in Computer Science, Heritage College, 2016.
"""
    },
    {
        "filename": "oliver_twist.txt",
        "content": """Name: Oliver Twist
Email: oliver.t@email.com
Experience: 1 year
Skills: Python, HTML, CSS, JavaScript

Projects:
- Calculator App: Built a command line and web calculator using vanilla JavaScript and CSS.
- File Organizer: Wrote a simple Python script to rename and organize photos.

Education:
- Bootcamp Graduate, Code Builders, 2025.
"""
    },
    {
        "filename": "penny_hofstadter.txt",
        "content": """Name: Penny Hofstadter
Email: penny.h@email.com
Experience: 4 years
Skills: Technical Writing, QA Testing, Manual Testing, Jira, Confluence, Documentation

Projects:
- API Documentation: Authored developer guides and setup handbooks for software systems.
- Quality Assurance: Executed test cases manually and reported bugs via Jira.

Education:
- Bachelor of Arts in Communications, West College, 2022.
"""
    },
    {
        "filename": "quentin_tarantino.txt",
        "content": """Name: Quentin Tarantino
Email: quentin.t@email.com
Experience: 6 years
Skills: Project Management, Agile, Scrum, Jira, Confluence, Product Roadmap, Budgeting

Projects:
- Team Coordination: Managed schedules and sprint planning meetings for a 10-person engineering team.
- Client Engagement: Gathered client requirements and wrote user stories.

Education:
- Bachelor of Business Administration, Cinema University, 2020.
"""
    }
]

for resume in resumes:
    filepath = os.path.join(RESUME_DIR, resume["filename"])
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(resume["content"])
    print(f"Created {filepath}")

# Create salary fallback data
salary_data = [
    {
        "role": "Senior Full Stack Engineer",
        "location": "India",
        "min_salary": 1500000,
        "max_salary": 3000000,
        "currency": "INR",
        "period": "yearly"
    },
    {
        "role": "Senior Full Stack Engineer",
        "location": "US",
        "min_salary": 1200000,
        "max_salary": 1800000,
        "currency": "USD",
        "period": "yearly"
    },
    {
        "role": "Technical Recruiter",
        "location": "India",
        "min_salary": 600000,
        "max_salary": 1200000,
        "currency": "INR",
        "period": "yearly"
    },
    {
        "role": "Technical Recruiter",
        "location": "US",
        "min_salary": 700000,
        "max_salary": 1100000,
        "currency": "USD",
        "period": "yearly"
    }
]

fallback_path = "backend/data/salary_fallback.json"
with open(fallback_path, "w", encoding="utf-8") as f:
    json.dump(salary_data, f, indent=4)
print(f"Created {fallback_path}")
