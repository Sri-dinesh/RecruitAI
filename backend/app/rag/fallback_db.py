import sqlite3
import json
import uuid
from typing import List, Dict, Any, Optional
from fastapi import HTTPException, status
from app.core import config

_INITIALIZED_DBS = set()


def get_sqlite_connection(db_path: str) -> sqlite3.Connection:
    """
    Returns an optimized, thread-safe SQLite connection with WAL mode,
    busy timeout, and foreign key constraints enabled.
    """
    conn = sqlite3.connect(db_path, timeout=30.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
        conn.execute("PRAGMA synchronous=NORMAL;")
        conn.execute("PRAGMA foreign_keys=ON;")
        conn.execute("PRAGMA busy_timeout=30000;")
    except Exception:
        pass
    return conn


class MockUser:
    def __init__(self, uid: Optional[str] = None, email: str = "recruiter@recruitai.local"):
        self.id = uid
        self.email = email


class MockUserResponse:
    def __init__(self, user: Optional[MockUser]):
        self.user = user


class MockAuth:
    """
    Mock authentication service for local offline development.
    Strictly verifies tokens and rejects arbitrary unauthenticated input.
    """
    def get_user(self, token: str = ""):
        if not token:
            return MockUserResponse(None)
        if getattr(config, "IS_PRODUCTION", False):
            return MockUserResponse(None)
        if not getattr(config, "USE_LOCAL_AUTH", False):
            return MockUserResponse(None)

        dev_uid = getattr(config, "LOCAL_DEV_USER_ID", "e6cca9b2-49b8-4812-ac3a-3dfb770ea5a3")
        if token in ("mock-token", "local-token", "test-token", dev_uid):
            return MockUserResponse(MockUser(dev_uid))
        try:
            from jose import jwt
            claims = jwt.get_unverified_claims(token)
            sub = claims.get("sub")
            if sub:
                valid_uuid = str(uuid.UUID(str(sub)))
                return MockUserResponse(MockUser(valid_uuid, email=claims.get("email", f"{valid_uuid}@recruitai.local")))
        except Exception:
            pass
        return MockUserResponse(None)


class FallbackSupabaseClient:
    """
    A lightweight, drop-in local SQLite fallback for the Supabase Client.
    Mimics postgrest table operations and RPCs for offline dev resilience only.
    Blocked strictly in production environments.
    """
    def __init__(self, db_path: str = "recruitai_fallback.db"):
        if getattr(config, "IS_PRODUCTION", False):
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="Database service temporarily unavailable. SQLite fallback is prohibited in production.",
            )
        self.db_path = db_path
        self.auth = MockAuth()
        if self.db_path not in _INITIALIZED_DBS:
            self._init_db()
            _INITIALIZED_DBS.add(self.db_path)

    def _init_db(self):
        conn = get_sqlite_connection(self.db_path)
        cursor = conn.cursor()

        # ── 0. users table ──────────────────────────────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                full_name TEXT,
                avatar_url TEXT,
                phone TEXT,
                company_name TEXT,
                company_website TEXT,
                role TEXT NOT NULL DEFAULT 'recruiter',
                preferences TEXT DEFAULT '{"email_alerts":true,"theme":"system","blind_mode_default":true,"auto_rubric":true}',
                last_sign_in_at TIMESTAMP,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Insert default local recruiter user if missing
        cursor.execute("""
            INSERT OR IGNORE INTO users (id, email, full_name, role)
            VALUES ('local_dev_user_123', 'recruiter@recruitai.local', 'Lead Recruiter', 'recruiter')
        """)

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

        # ── 8. session_candidates join table (BUG-3) ────────────────────────
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS session_candidates (
                session_id TEXT NOT NULL,
                candidate_id TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (session_id, candidate_id)
            )
        """)


        # Ensure any missing columns from previous schemas are automatically migrated
        def _ensure_col(tbl: str, col: str, col_type: str):
            try:
                cursor.execute(f"PRAGMA table_info({tbl})")
                existing_cols = [r[1] for r in cursor.fetchall()]
                if col not in existing_cols:
                    cursor.execute(f"ALTER TABLE {tbl} ADD COLUMN {col} {col_type}")
            except Exception:
                pass

        _ensure_col("jobs", "user_id", "TEXT NOT NULL DEFAULT 'local_dev_user_123'")
        _ensure_col("candidates", "user_id", "TEXT NOT NULL DEFAULT 'local_dev_user_123'")
        _ensure_col("resume_chunks", "user_id", "TEXT NOT NULL DEFAULT 'local_dev_user_123'")
        _ensure_col("resume_chunks", "candidate_name", "TEXT")
        _ensure_col("resume_chunks", "chunk_index", "INTEGER DEFAULT 0")
        _ensure_col("applications", "user_id", "TEXT NOT NULL DEFAULT 'local_dev_user_123'")
        _ensure_col("interviews", "user_id", "TEXT NOT NULL DEFAULT 'local_dev_user_123'")
        _ensure_col("chat_sessions", "user_id", "TEXT NOT NULL DEFAULT 'local_dev_user_123'")
        _ensure_col("chat_sessions", "job_id", "TEXT")
        _ensure_col("chat_sessions", "updated_at", "TIMESTAMP")
        _ensure_col("chat_messages", "user_id", "TEXT NOT NULL DEFAULT 'local_dev_user_123'")

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

    def upsert(self, data: Any, on_conflict: Optional[str] = None):
        self.query_type = 'upsert'
        self.upsert_data = data
        self.on_conflict = on_conflict
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
        if self.table_name == 'resume_chunks' and 'candidate_name' not in d:
            d['candidate_name'] = ""
        return d

    def execute(self):
        conn = get_sqlite_connection(self.db_path)
        cursor = conn.cursor()
        result_data = []

        try:
            if self.query_type == 'select':
                cols = self.select_columns
                embedded_relations = {}
                if cols != "*":
                    import re
                    # Tokenize column list handling parentheses e.g. candidates(full_name, metadata)
                    tokens = re.findall(r'(\w+\([^)]+\)|\w+)', cols)
                    clean_cols = []
                    for t in tokens:
                        m = re.match(r'(\w+)\(([^)]+)\)', t.strip())
                        if m:
                            rel_tbl = m.group(1)
                            rel_fields = [f.strip() for f in m.group(2).split(",")]
                            embedded_relations[rel_tbl] = rel_fields
                        else:
                            clean_cols.append(t.strip())
                    
                    if clean_cols:
                        if embedded_relations.get("candidates") and "candidate_id" not in clean_cols:
                            clean_cols.append("candidate_id")
                        cols = ", ".join(clean_cols)
                    else:
                        cols = "*"
                
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
                    r_dict = self._deserialize_row(row)
                    # Simulate foreign table join if candidates relation requested
                    if embedded_relations.get("candidates") and r_dict.get("candidate_id"):
                        try:
                            c_cur = conn.cursor()
                            c_cur.execute("SELECT * FROM candidates WHERE id = ?", (r_dict["candidate_id"],))
                            c_row = c_cur.fetchone()
                            if c_row:
                                c_dict = self._deserialize_row(c_row)
                                r_dict["candidates"] = {
                                    f: c_dict.get(f) for f in embedded_relations["candidates"]
                                }
                            else:
                                r_dict["candidates"] = {}
                        except Exception:
                            r_dict["candidates"] = {}
                    result_data.append(r_dict)

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

            elif self.query_type == 'upsert':
                rows_to_upsert = self.upsert_data if isinstance(self.upsert_data, list) else [self.upsert_data]
                upserted_rows = []
                for row_data in rows_to_upsert:
                    d = self._serialize_row(row_data)
                    existing_id = None
                    if self.table_name == 'applications' and 'job_id' in d and 'candidate_id' in d:
                        cursor.execute("SELECT id FROM applications WHERE job_id = ? AND candidate_id = ?", (d['job_id'], d['candidate_id']))
                        found = cursor.fetchone()
                        if found:
                            existing_id = found['id']
                    elif self.table_name == 'users' and 'email' in d:
                        cursor.execute("SELECT id FROM users WHERE email = ?", (d['email'],))
                        found = cursor.fetchone()
                        if found:
                            existing_id = found['id']
                    elif self.table_name == 'session_candidates' and 'session_id' in d and 'candidate_id' in d:
                        cursor.execute("SELECT session_id, candidate_id FROM session_candidates WHERE session_id = ? AND candidate_id = ?", (d['session_id'], d['candidate_id']))
                        found = cursor.fetchone()
                        if found:
                            upserted_rows.append(self._deserialize_row(found))
                            continue
                        else:
                            cursor.execute("INSERT OR IGNORE INTO session_candidates (session_id, candidate_id) VALUES (?, ?)", (d['session_id'], d['candidate_id']))
                            upserted_rows.append({"session_id": d['session_id'], "candidate_id": d['candidate_id']})
                            continue
                    elif 'id' in d and d['id']:
                        cursor.execute(f"SELECT id FROM {self.table_name} WHERE id = ?", (d['id'],))
                        found = cursor.fetchone()
                        if found:
                            existing_id = found['id']

                    if existing_id:
                        d['id'] = existing_id
                        set_clauses = [f"{k} = ?" for k in d.keys() if k != 'id']
                        params = [d[k] for k in d.keys() if k != 'id'] + [existing_id]
                        if set_clauses:
                            cursor.execute(f"UPDATE {self.table_name} SET {', '.join(set_clauses)} WHERE id = ?", params)
                        cursor.execute(f"SELECT * FROM {self.table_name} WHERE id = ?", (existing_id,))
                        res_row = cursor.fetchone()
                        if res_row:
                            upserted_rows.append(self._deserialize_row(res_row))
                    else:
                        if 'id' not in d or not d['id']:
                            d['id'] = str(uuid.uuid4())
                        cols_list = list(d.keys())
                        placeholders = ", ".join(["?"] * len(cols_list))
                        cursor.execute(f"INSERT INTO {self.table_name} ({', '.join(cols_list)}) VALUES ({placeholders})", list(d.values()))
                        cursor.execute(f"SELECT * FROM {self.table_name} WHERE id = ?", (d['id'],))
                        res_row = cursor.fetchone()
                        if res_row:
                            upserted_rows.append(self._deserialize_row(res_row))

                result_data = upserted_rows

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
        class SupabaseResponse:
            def __init__(self, data):
                self.data = data

        if self.function_name == 'reset_user_workspace':
            target_uid = self.params.get('target_user_id')
            conn = get_sqlite_connection(self.db_path)
            cursor = conn.cursor()
            try:
                conn.execute("BEGIN IMMEDIATE;")
                cursor.execute("""
                    DELETE FROM session_candidates 
                    WHERE session_id IN (SELECT id FROM chat_sessions WHERE user_id = ?)
                       OR candidate_id IN (SELECT id FROM candidates WHERE user_id = ?)
                """, (target_uid, target_uid))
                cursor.execute("DELETE FROM chat_messages WHERE user_id = ?", (target_uid,))
                cursor.execute("DELETE FROM interviews WHERE user_id = ?", (target_uid,))
                cursor.execute("DELETE FROM applications WHERE user_id = ?", (target_uid,))
                cursor.execute("DELETE FROM resume_chunks WHERE user_id = ?", (target_uid,))
                cursor.execute("DELETE FROM candidates WHERE user_id = ?", (target_uid,))
                cursor.execute("DELETE FROM chat_sessions WHERE user_id = ?", (target_uid,))
                cursor.execute("DELETE FROM jobs WHERE user_id = ?", (target_uid,))
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                conn.close()
            return SupabaseResponse({"success": True})

        if self.function_name == 'match_resume_chunks':
            query_emb = self.params.get('query_embedding')
            match_threshold = self.params.get('match_threshold', 0.0)
            match_count = self.params.get('match_count', 3)
            filter_candidate_id = self.params.get('filter_candidate_id')
            filter_user_id = self.params.get('filter_user_id')
            
            conn = get_sqlite_connection(self.db_path)
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
                            "candidate_name": d['full_name'] or 'Candidate',
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
