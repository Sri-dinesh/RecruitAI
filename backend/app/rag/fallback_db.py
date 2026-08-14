import sqlite3
import json
import uuid
from typing import List, Dict, Any, Optional

class FallbackSupabaseClient:
    """
    A lightweight, drop-in local SQLite fallback for the Supabase Client.
    Mimics postgrest table operations and RPCs for offline resilience.
    """
    def __init__(self, db_path: str = "recruitai_fallback.db"):
        self.db_path = db_path
        self._init_db()

    def _init_db(self):
        conn = sqlite3.connect(self.db_path)
        cursor = conn.cursor()

        # ── 1. jobs table ───────────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS jobs (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
                title TEXT NOT NULL,
                raw_jd TEXT,
                jd_structured TEXT,
                status TEXT NOT NULL DEFAULT 'active',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── 2. candidates table ─────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS candidates (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
                full_name TEXT NOT NULL,
                email TEXT,
                phone TEXT,
                resume_file_url TEXT,
                raw_resume_text TEXT,
                metadata TEXT DEFAULT '{}',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── 3. resume_chunks table ──────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS resume_chunks (
                id TEXT PRIMARY KEY,
                candidate_id TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
                chunk_text TEXT NOT NULL,
                chunk_index INTEGER DEFAULT 0,
                embedding TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── 4. applications table ───────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS applications (
                id TEXT PRIMARY KEY,
                job_id TEXT NOT NULL,
                candidate_id TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
                match_score REAL,
                match_reasoning TEXT,
                status TEXT NOT NULL DEFAULT 'new',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── 5. interviews table ─────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS interviews (
                id TEXT PRIMARY KEY,
                application_id TEXT,
                candidate_id TEXT,
                user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
                scheduled_at TIMESTAMP NOT NULL,
                duration_minutes INTEGER DEFAULT 30,
                mode TEXT DEFAULT 'video',
                meeting_link TEXT,
                status TEXT NOT NULL DEFAULT 'scheduled',
                feedback TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── 6. chat_sessions table ──────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
                job_id TEXT,
                title TEXT NOT NULL DEFAULT 'New Hiring Campaign',
                last_intent TEXT,
                pending_confirmation TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # ── 7. chat_messages table ──────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_messages (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                user_id TEXT NOT NULL DEFAULT 'local_dev_user_123',
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()
        conn.close()

    def table(self, name: str):
        return TableBuilder(self.db_path, name)

    def rpc(self, name: str, params: dict):
        return RpcBuilder(self.db_path, name, params)

class TableBuilder:
    def __init__(self, db_path: str, table_name: str):
        self.db_path = db_path
        self.table_name = table_name
        self.query_type = None  # 'select', 'insert', 'update', 'delete'
        self.select_columns = "*"
        self.insert_data = None
        self.update_data = None
        self.eq_filters = []
        self.neq_filters = []
        self.order_by = None
        self.order_desc = False
        self.limit_val = None

    def select(self, columns: str = "*"):
        self.query_type = 'select'
        self.select_columns = columns
        return self

    def insert(self, data: Any):
        self.query_type = 'insert'
        self.insert_data = data
        return self

    def update(self, data: dict):
        self.query_type = 'update'
        self.update_data = data
        return self

    def delete(self):
        self.query_type = 'delete'
        return self

    def eq(self, column: str, value: Any):
        self.eq_filters.append((column, value))
        return self

    def neq(self, column: str, value: Any):
        self.neq_filters.append((column, value))
        return self

    def order(self, column: str, desc: bool = False):
        self.order_by = column
        self.order_desc = desc
        return self

    def limit(self, val: int):
        self.limit_val = val
        return self

    def _deserialize_row(self, row_dict: dict) -> dict:
        d = dict(row_dict)
        if self.table_name == 'jobs' and 'jd_structured' in d and d['jd_structured']:
            try:
                d['jd_structured'] = json.loads(d['jd_structured'])
            except Exception:
                pass
        elif self.table_name == 'candidates' and 'metadata' in d and d['metadata']:
            try:
                d['metadata'] = json.loads(d['metadata'])
            except Exception:
                pass
        elif self.table_name == 'applications' and 'match_reasoning' in d and d['match_reasoning']:
            try:
                d['match_reasoning'] = json.loads(d['match_reasoning'])
            except Exception:
                pass
        elif self.table_name == 'interviews' and 'feedback' in d and d['feedback']:
            try:
                d['feedback'] = json.loads(d['feedback'])
            except Exception:
                pass
        elif self.table_name == 'chat_sessions' and 'pending_confirmation' in d and d['pending_confirmation']:
            try:
                d['pending_confirmation'] = json.loads(d['pending_confirmation'])
            except Exception:
                pass
        elif self.table_name == 'chat_messages' and 'metadata' in d and d['metadata']:
            try:
                d['metadata'] = json.loads(d['metadata'])
            except Exception:
                pass
        elif self.table_name == 'resume_chunks' and 'embedding' in d and d['embedding']:
            try:
                d['embedding'] = json.loads(d['embedding'])
            except Exception:
                pass
        return d

    def _serialize_row(self, row_dict: dict) -> dict:
        d = dict(row_dict)
        json_fields = {
            'jobs': ['jd_structured'],
            'candidates': ['metadata'],
            'applications': ['match_reasoning'],
            'interviews': ['feedback'],
            'chat_sessions': ['pending_confirmation'],
            'chat_messages': ['metadata'],
            'resume_chunks': ['embedding'],
        }
        for field in json_fields.get(self.table_name, []):
            if field in d and (isinstance(d[field], (dict, list)) or d[field] is not None):
                d[field] = json.dumps(d[field])
        return d

    def execute(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        result_data = []

        try:
            if self.query_type == 'select':
                cols = self.select_columns
                if cols != "*":
                    cols = ", ".join([c.strip() for c in cols.split(",") if c.strip()])
                
                sql = f"SELECT {cols} FROM {self.table_name}"
                params = []
                where_clauses = []
                for col, val in self.eq_filters:
                    where_clauses.append(f"{col} = ?")
                    params.append(val)
                for col, val in self.neq_filters:
                    where_clauses.append(f"{col} != ?")
                    params.append(val)
                
                if where_clauses:
                    sql += " WHERE " + " AND ".join(where_clauses)
                
                if self.order_by:
                    dir_str = "DESC" if self.order_desc else "ASC"
                    sql += f" ORDER BY {self.order_by} {dir_str}"
                
                if self.limit_val is not None:
                    sql += f" LIMIT {self.limit_val}"
                
                cursor.execute(sql, params)
                rows = cursor.fetchall()
                for row in rows:
                    result_data.append(self._deserialize_row(row))

            elif self.query_type == 'insert':
                rows_to_insert = self.insert_data if isinstance(self.insert_data, list) else [self.insert_data]
                inserted_rows = []
                for row_data in rows_to_insert:
                    d = self._serialize_row(row_data)
                    if 'id' not in d:
                        d['id'] = str(uuid.uuid4())
                    
                    cols_list = list(d.keys())
                    placeholders = ", ".join(["?"] * len(cols_list))
                    sql = f"INSERT INTO {self.table_name} ({', '.join(cols_list)}) VALUES ({placeholders})"
                    cursor.execute(sql, list(d.values()))
                    
                    # Get back the inserted row
                    cursor.execute(f"SELECT * FROM {self.table_name} WHERE id = ?", (d['id'],))
                    res_row = cursor.fetchone()
                    if res_row:
                        inserted_rows.append(self._deserialize_row(res_row))
                
                result_data = inserted_rows

            elif self.query_type == 'update':
                d = self._serialize_row(self.update_data)
                set_clauses = []
                params = []
                for col, val in d.items():
                    set_clauses.append(f"{col} = ?")
                    params.append(val)
                
                where_clauses = []
                for col, val in self.eq_filters:
                    where_clauses.append(f"{col} = ?")
                    params.append(val)
                
                sql = f"UPDATE {self.table_name} SET {', '.join(set_clauses)}"
                if where_clauses:
                    sql += " WHERE " + " AND ".join(where_clauses)
                
                cursor.execute(sql, params)
                
                # Fetch updated rows
                fetch_sql = f"SELECT * FROM {self.table_name}"
                fetch_params = []
                if where_clauses:
                    fetch_sql += " WHERE " + " AND ".join(where_clauses)
                    for col, val in self.eq_filters:
                        fetch_params.append(val)
                cursor.execute(fetch_sql, fetch_params)
                rows = cursor.fetchall()
                for row in rows:
                    result_data.append(self._deserialize_row(row))

            elif self.query_type == 'delete':
                sql = f"DELETE FROM {self.table_name}"
                params = []
                where_clauses = []
                for col, val in self.eq_filters:
                    where_clauses.append(f"{col} = ?")
                    params.append(val)
                for col, val in self.neq_filters:
                    where_clauses.append(f"{col} != ?")
                    params.append(val)
                
                if where_clauses:
                    sql += " WHERE " + " AND ".join(where_clauses)
                
                cursor.execute(sql, params)
                result_data = []

            conn.commit()
        finally:
            conn.close()

        class SupabaseResponse:
            def __init__(self, data):
                self.data = data
        return SupabaseResponse(result_data)

class RpcBuilder:
    def __init__(self, db_path: str, function_name: str, params: dict):
        self.db_path = db_path
        self.function_name = function_name
        self.params = params

    def execute(self):
        if self.function_name == 'match_resume_chunks':
            query_emb = self.params.get('query_embedding')
            match_threshold = self.params.get('match_threshold', 0.0)
            match_count = self.params.get('match_count', 3)
            filter_candidate_id = self.params.get('filter_candidate_id')
            filter_user_id = self.params.get('filter_user_id')
            
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            sql = """
                SELECT rc.id, rc.candidate_id, c.full_name, rc.chunk_text, rc.embedding 
                FROM resume_chunks rc
                LEFT JOIN candidates c ON c.id = rc.candidate_id
                WHERE 1=1
            """
            params = []
            if filter_candidate_id:
                sql += " AND rc.candidate_id = ?"
                params.append(filter_candidate_id)
            if filter_user_id:
                sql += " AND rc.user_id = ?"
                params.append(filter_user_id)
            
            cursor.execute(sql, params)
            rows = cursor.fetchall()
            conn.close()
            
            import math
            def dot_product(v1, v2):
                return sum(x*y for x, y in zip(v1, v2))
            def magnitude(v):
                return math.sqrt(sum(x*x for x in v))
            def cosine_similarity(v1, v2):
                mag1 = magnitude(v1)
                mag2 = magnitude(v2)
                if mag1 == 0 or mag2 == 0:
                    return 0
                return dot_product(v1, v2) / (mag1 * mag2)
            
            matches = []
            for row in rows:
                d = dict(row)
                if not d['embedding']:
                    continue
                try:
                    emb = json.loads(d['embedding'])
                    sim = cosine_similarity(query_emb, emb)
                    if sim >= match_threshold:
                        matches.append({
                            "id": d['id'],
                            "candidate_id": d['candidate_id'],
                            "full_name": d['full_name'] or 'Candidate',
                            "chunk_text": d['chunk_text'],
                            "similarity": sim
                        })
                except Exception:
                    pass
            
            matches.sort(key=lambda x: x['similarity'], reverse=True)
            results = matches[:match_count]
            
            class SupabaseResponse:
                def __init__(self, data):
                    self.data = data
            return SupabaseResponse(results)
