import sqlite3
import os

DB_PATH = "grid_data.db"

def init_db():
    """Initializes the SQLite database using Python's built-in sqlite3 library."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS grid_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        time_str TEXT,
        minute INTEGER,
        load REAL,
        solar REAL,
        wind REAL,
        battery REAL,
        price REAL,
        frequency REAL
    )
    """)
    conn.commit()
    conn.close()

def get_db_connection():
    """Returns a thread-safe connection to the SQLite database with dictionary rows."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn
