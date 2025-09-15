import os
import sqlite3
import datetime as dt
import random


def dict_factory(cursor, row):
    return {col[0]: row[idx] for idx, col in enumerate(cursor.description)}


def get_conn():
    db_path = os.getenv("DB_PATH", "./dental_appointments.db")
    conn = sqlite3.connect(db_path)
    conn.row_factory = dict_factory
    return conn


def get_capacity_for_today(conn: sqlite3.Connection) -> int:
    week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    today = dt.date.today()
    day_name = week[today.weekday()]
    row = conn.execute("SELECT capacity FROM daily_capacity WHERE day_name=?", (day_name,)).fetchone()
    # Patient app defaults to 10 when not set
    return int(row["capacity"] if row and row.get("capacity") is not None else 10)


def make_ticket(ymd: str, seq: int, national_id_last4: int) -> int:
    return int(f"{ymd}{seq:03d}{national_id_last4:04d}")


def main():
    today = dt.date.today().isoformat()
    ymd = today.replace("-", "")
    with get_conn() as conn:
        capacity = get_capacity_for_today(conn)
        used = conn.execute("SELECT COUNT(*) AS c FROM appointments WHERE scheduled_date=?", (today,)).fetchone()["c"]
        remaining = max(capacity - used, 0)
        if remaining == 0:
            print(f"Already full for {today}: {used}/{capacity}")
            return
        print(f"Seeding {remaining} appointment(s) for {today} to reach capacity {capacity}...")
        for i in range(remaining):
            seq = used + i + 1
            last4 = random.randint(1000, 9999)
            ticket = make_ticket(ymd, seq, last4)
            national_id = f"{random.randint(10**13, 10**14-1)}"  # 14 digits
            phone = f"0{random.randint(10**9, 10**10-1)}"      # 11 digits starting with 0
            name = f"Seed User {seq}"
            symptoms = f"SEED_TEST - Auto generated to test capacity on {today}"
            conn.execute(
                """
                INSERT INTO appointments (ticket_number, name, phone, symptoms, image_paths, voice_note_path, status, scheduled_date)
                VALUES (?,?,?,?,?,?,?,?)
                """,
                (ticket, name, phone, symptoms, None, None, "pending", today),
            )
        conn.commit()
        print("Done.")


if __name__ == "__main__":
    main()





