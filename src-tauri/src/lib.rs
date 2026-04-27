use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::Manager;
use std::fs;
use std::path::PathBuf;

const DB_FILENAME: &str = "turnierplaner.db";
const CONFIG_FILENAME: &str = "db_config.json";
const WIPE_MARKER_FILENAME: &str = "wipe_pending.marker";

/// Liest den benutzerdefinierten DB-Pfad aus der Config-Datei, falls vorhanden
fn get_custom_db_dir(app_data_dir: &PathBuf) -> Option<String> {
    let config_path = app_data_dir.join(CONFIG_FILENAME);
    if config_path.exists() {
        if let Ok(content) = fs::read_to_string(&config_path) {
            if let Ok(config) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(dir) = config.get("db_dir").and_then(|v| v.as_str()) {
                    let db_dir = PathBuf::from(dir);
                    // Verwenden wenn das Verzeichnis existiert (auch ohne DB-Datei,
                    // damit nach einem Wipe die DB im Custom-Ordner neu angelegt wird)
                    if db_dir.exists() && db_dir.is_dir() {
                        return Some(dir.to_string());
                    }
                }
            }
        }
    }
    None
}

/// Löscht DB-Datei (+ WAL + SHM) falls ein Wipe-Marker vorhanden ist.
/// Wird vor der SQL-Plugin-Init aufgerufen, damit keine File-Locks stören.
fn handle_pending_wipe(app_data_dir: &PathBuf) {
    let marker = app_data_dir.join(WIPE_MARKER_FILENAME);
    if !marker.exists() {
        return;
    }
    let db_path = resolve_db_path(app_data_dir);
    let _ = fs::remove_file(&db_path);
    for ext in &["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{}", db_path.to_string_lossy(), ext));
        let _ = fs::remove_file(&side);
    }
    let _ = fs::remove_file(&marker);
}

/// Gibt den vollen Pfad zur aktuellen Datenbank zurueck
fn resolve_db_path(app_data_dir: &PathBuf) -> PathBuf {
    if let Some(custom_dir) = get_custom_db_dir(app_data_dir) {
        PathBuf::from(custom_dir).join(DB_FILENAME)
    } else {
        app_data_dir.join(DB_FILENAME)
    }
}

/// Baut den SQLite Connection-String fuer tauri-plugin-sql
fn build_connection_string(app_data_dir: &PathBuf) -> String {
    let db_path = resolve_db_path(app_data_dir);
    format!("sqlite:{}", db_path.to_string_lossy())
}

#[tauri::command]
fn get_db_path(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;
    let db_path = resolve_db_path(&app_data_dir);
    Ok(db_path.to_string_lossy().to_string())
}

#[tauri::command]
fn get_db_dir(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;
    let db_path = resolve_db_path(&app_data_dir);
    let dir = db_path.parent()
        .ok_or("Kann Verzeichnis nicht ermitteln")?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn change_db_dir(app_handle: tauri::AppHandle, new_dir: String) -> Result<String, String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;

    let current_db = resolve_db_path(&app_data_dir);
    let new_db = PathBuf::from(&new_dir).join(DB_FILENAME);

    // Datenbank an neuen Ort kopieren (falls sie dort noch nicht existiert)
    if current_db.exists() && !new_db.exists() {
        fs::copy(&current_db, &new_db)
            .map_err(|e| format!("Kopieren fehlgeschlagen: {}", e))?;
    }

    // Auch WAL und SHM Dateien mitkopieren falls vorhanden
    for ext in &["-wal", "-shm"] {
        let src = PathBuf::from(format!("{}{}", current_db.to_string_lossy(), ext));
        let dst = PathBuf::from(format!("{}{}", new_db.to_string_lossy(), ext));
        if src.exists() && !dst.exists() {
            let _ = fs::copy(&src, &dst);
        }
    }

    // Config-Datei speichern
    let config = serde_json::json!({ "db_dir": new_dir });
    let config_path = app_data_dir.join(CONFIG_FILENAME);
    fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap())
        .map_err(|e| format!("Config speichern fehlgeschlagen: {}", e))?;

    Ok(new_db.to_string_lossy().to_string())
}

#[tauri::command]
fn backup_db(app_handle: tauri::AppHandle, target_path: String) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;
    let db_path = resolve_db_path(&app_data_dir);

    if !db_path.exists() {
        return Err("Datenbank nicht gefunden".to_string());
    }

    fs::copy(&db_path, &target_path)
        .map_err(|e| format!("Backup fehlgeschlagen: {}", e))?;

    Ok(())
}

#[tauri::command]
fn restore_db(app_handle: tauri::AppHandle, source_path: String) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;
    let db_path = resolve_db_path(&app_data_dir);

    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err("Backup-Datei nicht gefunden".to_string());
    }

    // Pruefen ob es eine gueltige SQLite-Datei ist (nur Header lesen, nicht ganze Datei)
    let mut header = [0u8; 16];
    {
        use std::io::Read;
        let mut file = std::fs::File::open(&source)
            .map_err(|e| format!("Datei oeffnen fehlgeschlagen: {}", e))?;
        file.read_exact(&mut header)
            .map_err(|e| format!("Datei lesen fehlgeschlagen: {}", e))?;
    }
    if &header[0..16] != b"SQLite format 3\0" {
        return Err("Die ausgewaehlte Datei ist keine gueltige SQLite-Datenbank".to_string());
    }

    // WAL/SHM Dateien loeschen (erzwingt sauberen Zustand)
    for ext in &["-wal", "-shm"] {
        let wal = PathBuf::from(format!("{}{}", db_path.to_string_lossy(), ext));
        if wal.exists() {
            let _ = fs::remove_file(&wal);
        }
    }

    fs::copy(&source, &db_path)
        .map_err(|e| format!("Wiederherstellung fehlgeschlagen: {}", e))?;

    Ok(())
}

#[tauri::command]
fn wipe_database_and_restart(app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;
    // App-Daten-Verzeichnis sicherstellen (falls es gelöscht wurde)
    fs::create_dir_all(&app_data_dir)
        .map_err(|e| format!("Verzeichnis anlegen fehlgeschlagen: {}", e))?;
    // Marker schreiben - der nächste Startup löscht die DB-Datei vor der SQL-Plugin-Init
    let marker = app_data_dir.join(WIPE_MARKER_FILENAME);
    fs::write(&marker, b"1")
        .map_err(|e| format!("Marker schreiben fehlgeschlagen: {}", e))?;
    // App neu starten - restart() kehrt nicht zurück, daher ist der Return-Typ nur für den Fehlerfall davor
    app_handle.restart();
}

#[tauri::command]
fn open_folder(app_handle: tauri::AppHandle, path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.exists() || !p.is_dir() {
        return Err(format!("Pfad existiert nicht oder ist kein Verzeichnis: {}", path));
    }

    // Validate that the path is within the app data directory
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;
    let canonical_path = p.canonicalize()
        .map_err(|e| format!("Pfad konnte nicht aufgeloest werden: {}", e))?;
    let canonical_app_dir = app_data_dir.canonicalize()
        .map_err(|e| format!("App-Datenverzeichnis konnte nicht aufgeloest werden: {}", e))?;

    if !canonical_path.starts_with(&canonical_app_dir) {
        return Err("Zugriff verweigert: Pfad liegt ausserhalb des App-Datenverzeichnisses".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Ordner oeffnen fehlgeschlagen: {}", e))?;
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let migrations = vec![
        Migration {
            version: 1,
            description: "create all tables (consolidated)",
            sql: "
                CREATE TABLE IF NOT EXISTS players (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    gender TEXT NOT NULL CHECK(gender IN ('m', 'f')),
                    age INTEGER,
                    club TEXT,
                    birth_year INTEGER,
                    birth_date TEXT,
                    first_name TEXT,
                    last_name TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS sportstaetten (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    address TEXT,
                    zip TEXT,
                    city TEXT,
                    courts INTEGER NOT NULL DEFAULT 1,
                    halls TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now'))
                );

                CREATE TABLE IF NOT EXISTS tournaments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    mode TEXT NOT NULL CHECK(mode IN ('singles', 'doubles', 'mixed')),
                    format TEXT NOT NULL CHECK(format IN ('round_robin', 'elimination', 'random_doubles', 'group_ko')),
                    sets_to_win INTEGER NOT NULL DEFAULT 2,
                    points_per_set INTEGER NOT NULL DEFAULT 21,
                    courts INTEGER NOT NULL DEFAULT 1,
                    num_groups INTEGER NOT NULL DEFAULT 0,
                    qualify_per_group INTEGER NOT NULL DEFAULT 0,
                    current_phase TEXT,
                    entry_fee_single REAL NOT NULL DEFAULT 0,
                    entry_fee_double REAL NOT NULL DEFAULT 0,
                    team_config TEXT,
                    hall_config TEXT,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'completed', 'archived'))
                );

                CREATE TABLE IF NOT EXISTS tournament_players (
                    tournament_id INTEGER NOT NULL,
                    player_id INTEGER NOT NULL,
                    retired INTEGER NOT NULL DEFAULT 0,
                    payment_status TEXT NOT NULL DEFAULT 'unpaid',
                    payment_method TEXT,
                    paid_date TEXT,
                    PRIMARY KEY (tournament_id, player_id),
                    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
                    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS rounds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tournament_id INTEGER NOT NULL,
                    round_number INTEGER NOT NULL,
                    phase TEXT,
                    group_number INTEGER,
                    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS matches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    round_id INTEGER NOT NULL,
                    team1_p1 INTEGER NOT NULL,
                    team1_p2 INTEGER,
                    team2_p1 INTEGER NOT NULL,
                    team2_p2 INTEGER,
                    winner_team INTEGER CHECK(winner_team IN (1, 2)),
                    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'completed')),
                    court INTEGER,
                    court_assigned_at TEXT,
                    started_at TEXT,
                    completed_at TEXT,
                    FOREIGN KEY (round_id) REFERENCES rounds(id) ON DELETE CASCADE,
                    FOREIGN KEY (team1_p1) REFERENCES players(id),
                    FOREIGN KEY (team1_p2) REFERENCES players(id),
                    FOREIGN KEY (team2_p1) REFERENCES players(id),
                    FOREIGN KEY (team2_p2) REFERENCES players(id)
                );

                CREATE TABLE IF NOT EXISTS sets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_id INTEGER NOT NULL,
                    set_number INTEGER NOT NULL,
                    team1_score INTEGER NOT NULL DEFAULT 0,
                    team2_score INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS app_settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "migrate data - duration tracking (columns now in v1)",
            sql: "
                UPDATE matches SET started_at = NULL WHERE started_at IS NULL;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "migrate data - birth_year from age",
            sql: "
                UPDATE players SET birth_year = (CAST(strftime('%Y', 'now') AS INTEGER) - age) WHERE age IS NOT NULL AND age > 0 AND age < 200 AND birth_year IS NULL;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 4,
            description: "migrate data - birth_date from birth_year",
            sql: "
                UPDATE players SET birth_date = (birth_year || '-01-01') WHERE birth_year IS NOT NULL AND birth_date IS NULL;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 5,
            description: "migrate data - split name into first/last",
            sql: "
                UPDATE players SET
                  first_name = CASE WHEN INSTR(name, ' ') > 0 THEN SUBSTR(name, 1, INSTR(name, ' ') - 1) ELSE name END,
                  last_name = CASE WHEN INSTR(name, ' ') > 0 THEN SUBSTR(name, INSTR(name, ' ') + 1) ELSE '' END
                WHERE first_name IS NULL AND name IS NOT NULL;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 6,
            description: "add cap column to tournaments",
            sql: "ALTER TABLE tournaments ADD COLUMN cap INTEGER;
                  UPDATE tournaments SET cap = CASE
                    WHEN points_per_set = 11 AND sets_to_win = 2 THEN 20
                    WHEN points_per_set = 15 AND sets_to_win = 2 THEN 25
                    WHEN points_per_set = 21 THEN 30
                    ELSE NULL
                  END;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 7,
            description: "add ko scoring columns to tournaments",
            sql: "ALTER TABLE tournaments ADD COLUMN ko_points_per_set INTEGER;
                  ALTER TABLE tournaments ADD COLUMN ko_sets_to_win INTEGER;
                  ALTER TABLE tournaments ADD COLUMN ko_cap INTEGER;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 8,
            description: "add venue_id to tournaments",
            sql: "ALTER TABLE tournaments ADD COLUMN venue_id INTEGER;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 9,
            description: "add min_rest_minutes to tournaments",
            sql: "ALTER TABLE tournaments ADD COLUMN min_rest_minutes INTEGER NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 10,
            description: "add seed_rank to tournament_players",
            sql: "ALTER TABLE tournament_players ADD COLUMN seed_rank INTEGER;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 11,
            description: "add enable_third_place to tournaments",
            sql: "ALTER TABLE tournaments ADD COLUMN enable_third_place INTEGER NOT NULL DEFAULT 0;",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 12,
            description: "create sessions table for multi-tournament workspaces",
            sql: "CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                venue_id INTEGER,
                name TEXT NOT NULL,
                started_at TEXT NOT NULL DEFAULT (datetime('now')),
                ended_at TEXT,
                status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'ended', 'archived')),
                FOREIGN KEY (venue_id) REFERENCES sportstaetten(id) ON DELETE SET NULL
            );",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 13,
            description: "add session_id to tournaments",
            sql: "ALTER TABLE tournaments ADD COLUMN session_id INTEGER;",
            kind: MigrationKind::Up,
        },
    ];

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            // DB-Pfad dynamisch ermitteln (custom oder default)
            let app_data_dir = app.path().app_data_dir()
                .expect("Kann App-Datenverzeichnis nicht ermitteln");

            // Sicherstellen dass das App-Datenverzeichnis existiert
            let _ = fs::create_dir_all(&app_data_dir);

            // Falls ein Wipe angefordert wurde: DB-Datei löschen BEVOR das SQL-Plugin sie öffnet
            handle_pending_wipe(&app_data_dir);

            let conn_string = build_connection_string(&app_data_dir);

            app.handle().plugin(
                tauri_plugin_sql::Builder::default()
                    .add_migrations(&conn_string, migrations)
                    .build(),
            )?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_db_path,
            get_db_dir,
            change_db_dir,
            open_folder,
            backup_db,
            restore_db,
            wipe_database_and_restart,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
