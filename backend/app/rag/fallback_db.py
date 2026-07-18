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
        # Create chat_sessions equivalent table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_sessions (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                jd_structured TEXT,
                resumes TEXT,
                last_shortlist TEXT,
                pending_confirmation TEXT,
                last_intent TEXT,
                scheduled_interviews TEXT,
                conversation_history TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        # Create resume_chunks equivalent table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS resume_chunks (
                id TEXT PRIMARY KEY,
                candidate_id TEXT NOT NULL,
                candidate_name TEXT NOT NULL,
                chunk_text TEXT NOT NULL,
                embedding TEXT,  -- JSON string of list of floats
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

    def execute(self):
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        result_data = []

        try:
            if self.query_type == 'select':
                # Convert * select columns or space-separated to comma-separated
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
                    d = dict(row)
                    # Deserialize JSON columns for chat_sessions
                    if self.table_name == 'chat_sessions':
                        for col in ['jd_structured', 'resumes', 'last_shortlist', 'pending_confirmation', 'scheduled_interviews', 'conversation_history']:
                            if col in d and d[col]:
                                try:
                                    d[col] = json.loads(d[col])
                                except Exception:
                                    pass
                    elif self.table_name == 'resume_chunks':
                        if 'embedding' in d and d['embedding']:
                            try:
                                d['embedding'] = json.loads(d['embedding'])
                            except Exception:
                                pass
                    result_data.append(d)

            elif self.query_type == 'insert':
                rows_to_insert = self.insert_data if isinstance(self.insert_data, list) else [self.insert_data]
                inserted_rows = []
                for row_data in rows_to_insert:
                    d = dict(row_data)
                    if 'id' not in d:
                        d['id'] = str(uuid.uuid4())
                    
                    # Serialize JSON columns
                    if self.table_name == 'chat_sessions':
                        for col in ['jd_structured', 'resumes', 'last_shortlist', 'pending_confirmation', 'scheduled_interviews', 'conversation_history']:
                            if col in d and (isinstance(d[col], (dict, list)) or d[col] is not None):
                                d[col] = json.dumps(d[col])
                    elif self.table_name == 'resume_chunks':
                        if 'embedding' in d and isinstance(d['embedding'], list):
                            d['embedding'] = json.dumps(d['embedding'])
                    
                    cols_list = list(d.keys())
                    placeholders = ", ".join(["?"] * len(cols_list))
                    sql = f"INSERT INTO {self.table_name} ({', '.join(cols_list)}) VALUES ({placeholders})"
                    cursor.execute(sql, list(d.values()))
                    
                    # Get back the inserted row
                    cursor.execute(f"SELECT * FROM {self.table_name} WHERE id = ?", (d['id'],))
                    res_row = dict(cursor.fetchone())
                    # Deserialize
                    if self.table_name == 'chat_sessions':
                        for col in ['jd_structured', 'resumes', 'last_shortlist', 'pending_confirmation', 'scheduled_interviews', 'conversation_history']:
                            if col in res_row and res_row[col]:
                                try:
                                    res_row[col] = json.loads(res_row[col])
                                except Exception:
                                    pass
                    elif self.table_name == 'resume_chunks':
                        if 'embedding' in res_row and res_row['embedding']:
                            try:
                                res_row['embedding'] = json.loads(res_row['embedding'])
                            except Exception:
                                pass
                    inserted_rows.append(res_row)
                
                result_data = inserted_rows

            elif self.query_type == 'update':
                d = dict(self.update_data)
                # Serialize JSON columns
                if self.table_name == 'chat_sessions':
                    for col in ['jd_structured', 'resumes', 'last_shortlist', 'pending_confirmation', 'scheduled_interviews', 'conversation_history']:
                        if col in d and (isinstance(d[col], (dict, list)) or d[col] is not None):
                            d[col] = json.dumps(d[col])
                elif self.table_name == 'resume_chunks':
                    if 'embedding' in d and isinstance(d['embedding'], list):
                        d['embedding'] = json.dumps(d['embedding'])
                
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
                    res_row = dict(row)
                    if self.table_name == 'chat_sessions':
                        for col in ['jd_structured', 'resumes', 'last_shortlist', 'pending_confirmation', 'scheduled_interviews', 'conversation_history']:
                            if col in res_row and res_row[col]:
                                try:
                                    res_row[col] = json.loads(res_row[col])
                                except Exception:
                                    pass
                    result_data.append(res_row)

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
            
            conn = sqlite3.connect(self.db_path)
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            sql = "SELECT id, candidate_id, candidate_name, chunk_text, embedding FROM resume_chunks"
            params = []
            if filter_candidate_id:
                sql += " WHERE candidate_id = ?"
                params.append(filter_candidate_id)
            
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
                            "candidate_name": d['candidate_name'],
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
