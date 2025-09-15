import os
import sqlite3
import datetime as dt


def dict_factory(cursor, row):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def get_conn():
    db_path = os.getenv("DB_PATH", "./dental_appointments.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = dict_factory
    return conn


def main():
    today = dt.date.today().isoformat()
    with get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM appointments WHERE scheduled_date=? AND symptoms LIKE 'SEED_TEST - Auto generated%'",
            (today,)
        )
        conn.commit()
        print(f"Removed {cur.rowcount} seeded row(s) for {today}.")


if __name__ == "__main__":
    main()





