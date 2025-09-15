def reset_and_seed(db_path="yarab/dental_appointments.db", days=7, per_day_cap=20,
                   pct_completed=0.85, pct_pending_same=0.10, pct_pending_overflow=0.05):
    """
    Safe reseed:
      - Deletes all rows
      - Fills last `days` with at most `per_day_cap` each
      - Ensures ~85% completed, ~10% pending-same-day, ~5% pending-overflow (adjustable)
      - Overflow is queued and consumed by the next day without exceeding capacity
      - Ticket sequence is per scheduled_date
    """
    if not os.path.exists(db_path):
        raise SystemExit(f"DB not found: {db_path}")

    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row

    # Clear existing data in a single transaction
    with con:
        con.execute("DELETE FROM appointments")

    # Columns
    cols = {r[1] for r in con.execute("PRAGMA table_info(appointments)")}
    has_phone = "phone" in cols
    has_phone_text = "phone_text" in cols
    has_nat = "national_id" in cols
    has_imgs = "image_paths" in cols
    has_voice = "voice_note_path" in cols
    has_comp_hour = "completion_hour" in cols
    has_ticket = "ticket_number" in cols
    has_created = "created_at" in cols
    has_sched = "scheduled_date" in cols
    has_status = "status" in cols
    has_sym = "symptoms" in cols

    today = datetime.now(CAIRO).date()
    start_day = today - timedelta(days=days-1)

    # Build the date buckets
    dates = [start_day + timedelta(days=i) for i in range(days)]
    date_strs = [d.isoformat() for d in dates]

    # Per-day ticket sequence (based on scheduled_date)
    seq_per_day = {ds: 0 for ds in date_strs}

    # Plan: local mix per day (rounded), respecting capacity
    day_plans = []
    for _ in date_strs:
        c = int(round(per_day_cap * pct_completed))
        p_same = int(round(per_day_cap * pct_pending_same))
        p_over = per_day_cap - c - p_same
        if p_over < 0:  # guard against bad percentages
            p_over = 0
            # re-normalize
            rest = per_day_cap - c
            p_same = max(0, rest)
        day_plans.append({"completed": c, "pending_same": p_same, "pending_over": p_over})

    # Overflow queue: how many pending need to be scheduled on the *next* day
    overflow_next = 0

    all_rows = []

    for idx, ds in enumerate(date_strs):
        plan = day_plans[idx].copy()
        cap_left = per_day_cap

        # First consume *yesterday’s* overflow into *today* as pending.
        take_from_overflow = min(overflow_next, cap_left)
        overflow_next -= take_from_overflow
        cap_left -= take_from_overflow

        # Prepare records for this portion (pending set to today ds)
        for _ in range(take_from_overflow):
            seq_per_day[ds] += 1
            name = rand_name()
            phone = rand_phone()
            symptoms = random.choice(SYMPTOMS)
            created_dt = datetime.combine(dates[idx], datetime.min.time()) + timedelta(
                hours=random.randint(8, 18), minutes=random.randint(0, 59)
            )
            created_at = iso_ts(created_dt)
            ticket = make_ticket(ds, seq_per_day[ds]) if has_ticket else None

            row = {}
            if has_ticket:      row["ticket_number"]   = ticket
            row["name"] = name
            if has_phone:       row["phone"]           = phone
            if has_phone_text:  row["phone_text"]      = phone
            if has_sched:       row["scheduled_date"]  = ds
            if has_status:      row["status"]          = "pending"
            if has_sym:         row["symptoms"]        = symptoms
            if has_imgs:        row["image_paths"]     = json.dumps([])
            if has_voice:       row["voice_note_path"] = None
            if has_comp_hour:   row["completion_hour"] = None
            if has_created:     row["created_at"]      = created_at
            if has_nat:         row["national_id"]     = None
            all_rows.append(row)

        if cap_left == 0:
            # today is full just from overflow; push today's local plan entirely to tomorrow
            overflow_next += plan["completed"] + plan["pending_same"] + plan["pending_over"]
            continue

        # Now schedule *today's local* plan, respecting cap_left
        # 1) completed today
        n_completed = min(plan["completed"], cap_left)
        cap_left -= n_completed
        for _ in range(n_completed):
            seq_per_day[ds] += 1
            name = rand_name()
            phone = rand_phone()
            symptoms = random.choice(SYMPTOMS)
            created_dt = datetime.combine(dates[idx], datetime.min.time()) + timedelta(
                hours=random.randint(8, 18), minutes=random.randint(0, 59)
            )
            created_at = iso_ts(created_dt)
            ticket = make_ticket(ds, seq_per_day[ds]) if has_ticket else None
            # completion hour for completed
            ch = None
            if has_comp_hour:
                hh = random.randint(9, 17)
                mm = random.choice([0, 15, 30, 45])
                ch = f"{hh:02d}:{mm:02d}"

            row = {}
            if has_ticket:      row["ticket_number"]   = ticket
            row["name"] = name
            if has_phone:       row["phone"]           = phone
            if has_phone_text:  row["phone_text"]      = phone
            if has_sched:       row["scheduled_date"]  = ds
            if has_status:      row["status"]          = "completed"
            if has_sym:         row["symptoms"]        = symptoms
            if has_imgs:        row["image_paths"]     = json.dumps([])
            if has_voice:       row["voice_note_path"] = None
            if has_comp_hour:   row["completion_hour"] = ch
            if has_created:     row["created_at"]      = created_at
            if has_nat:         row["national_id"]     = None
            all_rows.append(row)

        if cap_left == 0:
            # still full
            overflow_next += plan["pending_same"] + plan["pending_over"]
            continue

        # 2) pending that *stay today*
        n_pend_same = min(plan["pending_same"], cap_left)
        cap_left -= n_pend_same
        for _ in range(n_pend_same):
            seq_per_day[ds] += 1
            name = rand_name()
            phone = rand_phone()
            symptoms = random.choice(SYMPTOMS)
            created_dt = datetime.combine(dates[idx], datetime.min.time()) + timedelta(
                hours=random.randint(8, 18), minutes=random.randint(0, 59)
            )
            created_at = iso_ts(created_dt)
            ticket = make_ticket(ds, seq_per_day[ds]) if has_ticket else None

            row = {}
            if has_ticket:      row["ticket_number"]   = ticket
            row["name"] = name
            if has_phone:       row["phone"]           = phone
            if has_phone_text:  row["phone_text"]      = phone
            if has_sched:       row["scheduled_date"]  = ds
            if has_status:      row["status"]          = "pending"
            if has_sym:         row["symptoms"]        = symptoms
            if has_imgs:        row["image_paths"]     = json.dumps([])
            if has_voice:       row["voice_note_path"] = None
            if has_comp_hour:   row["completion_hour"] = None
            if has_created:     row["created_at"]      = created_at
            if has_nat:         row["national_id"]     = None
            all_rows.append(row)

        if cap_left == 0:
            overflow_next += plan["pending_over"]
            continue

        # 3) pending that *should overflow to tomorrow*
        n_pend_overflow = plan["pending_over"]
        # Use remaining cap for some of these if available (they can still be scheduled today as pending)
        # The remainder will be pushed to tomorrow.
        schedule_today = min(n_pend_overflow, cap_left)
        push_tomorrow  = n_pend_overflow - schedule_today

        # Schedule today's slice
        for _ in range(schedule_today):
            seq_per_day[ds] += 1
            name = rand_name()
            phone = rand_phone()
            symptoms = random.choice(SYMPTOMS)
            created_dt = datetime.combine(dates[idx], datetime.min.time()) + timedelta(
                hours=random.randint(8, 18), minutes=random.randint(0, 59)
            )
            created_at = iso_ts(created_dt)
            ticket = make_ticket(ds, seq_per_day[ds]) if has_ticket else None

            row = {}
            if has_ticket:      row["ticket_number"]   = ticket
            row["name"] = name
            if has_phone:       row["phone"]           = phone
            if has_phone_text:  row["phone_text"]      = phone
            if has_sched:       row["scheduled_date"]  = ds
            if has_status:      row["status"]          = "pending"
            if has_sym:         row["symptoms"]        = symptoms
            if has_imgs:        row["image_paths"]     = json.dumps([])
            if has_voice:       row["voice_note_path"] = None
            if has_comp_hour:   row["completion_hour"] = None
            if has_created:     row["created_at"]      = created_at
            if has_nat:         row["national_id"]     = None
            all_rows.append(row)

        overflow_next += push_tomorrow

    # If overflow remains after the last day: assign to the last day if capacity left; otherwise, drop it (or optionally extend horizon)
    if overflow_next > 0:
        last = date_strs[-1]
        # Count how many already scheduled on last day
        last_count = sum(1 for r in all_rows if r.get("scheduled_date") == last)
        cap_left = max(0, per_day_cap - last_count)
        add = min(cap_left, overflow_next)
        for _ in range(add):
            seq_per_day[last] += 1
            name = rand_name()
            phone = rand_phone()
            symptoms = random.choice(SYMPTOMS)
            created_dt = datetime.combine(dates[-1], datetime.min.time()) + timedelta(
                hours=random.randint(8, 18), minutes=random.randint(0, 59)
            )
            created_at = iso_ts(created_dt)
            ticket = make_ticket(last, seq_per_day[last]) if has_ticket else None

            row = {}
            if has_ticket:      row["ticket_number"]   = ticket
            row["name"] = name
            if has_phone:       row["phone"]           = phone
            if has_phone_text:  row["phone_text"]      = phone
            if has_sched:       row["scheduled_date"]  = last
            if has_status:      row["status"]          = "pending"
            if has_sym:         row["symptoms"]        = symptoms
            if has_imgs:        row["image_paths"]     = json.dumps([])
            if has_voice:       row["voice_note_path"] = None
            if has_comp_hour:   row["completion_hour"] = None
            if has_created:     row["created_at"]      = created_at
            if has_nat:         row["national_id"]     = None
            all_rows.append(row)
        overflow_next -= add
        # If still >0, we simply ignore extra to avoid breaking capacity (or add an 8th day if you prefer)

    if not all_rows:
        print("⚠️ Nothing to insert.")
        return

    cols_used = sorted(all_rows[0].keys())
    placeholders = ", ".join(["?"] * len(cols_used))
    col_list = ", ".join(cols_used)
    sql = f"INSERT INTO appointments ({col_list}) VALUES ({placeholders})"

    with con:
        con.executemany(sql, [[r.get(c) for c in cols_used] for r in all_rows])

    print(f"✅ Inserted {len(all_rows)} rows into appointments ({db_path}). (Overflow left unassigned: {overflow_next})")
