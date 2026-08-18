use tauri_plugin_sql::{Migration, MigrationKind};
use tauri::Manager;
use std::fs;
use std::path::PathBuf;

const DB_FILENAME: &str = "turnierplaner.db";
const CONFIG_FILENAME: &str = "db_config.json";
const WIPE_MARKER_FILENAME: &str = "wipe_pending.marker";
/// Queued file-level database operation, executed on the next start before
/// the SQL plugin opens the database. Operations that replace or move the
/// database file cannot run while it is open — the pool holds the file and
/// its WAL, so a copy-over would be silently discarded or corrupt the
/// result. See REVIEW-BACKLOG.md A7.
const PENDING_ACTION_FILENAME: &str = "pending_db_action.json";

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

/// Entfernt die Seitendateien (WAL + SHM) einer Datenbank.
/// Ohne das würde ein zurückgespieltes Backup mit dem WAL der alten
/// Datenbank zusammengeführt — das Ergebnis wäre eine Mischung aus beiden.
fn remove_sidecar_files(db_path: &PathBuf) {
    for ext in &["-wal", "-shm"] {
        let side = PathBuf::from(format!("{}{}", db_path.to_string_lossy(), ext));
        let _ = fs::remove_file(&side);
    }
}

/// Kopiert eine Datenbank inklusive Seitendateien an ein neues Ziel.
fn copy_db_with_sidecars(from: &PathBuf, to: &PathBuf) -> Result<(), String> {
    fs::copy(from, to).map_err(|e| format!("Kopieren fehlgeschlagen: {}", e))?;
    for ext in &["-wal", "-shm"] {
        let src = PathBuf::from(format!("{}{}", from.to_string_lossy(), ext));
        let dst = PathBuf::from(format!("{}{}", to.to_string_lossy(), ext));
        if src.exists() {
            let _ = fs::copy(&src, &dst);
        }
    }
    Ok(())
}

/// Schreibt eine vorgemerkte Dateioperation, die beim nächsten Start
/// ausgeführt wird (siehe PENDING_ACTION_FILENAME).
fn queue_pending_action(app_data_dir: &PathBuf, action: serde_json::Value) -> Result<(), String> {
    fs::create_dir_all(app_data_dir)
        .map_err(|e| format!("Verzeichnis anlegen fehlgeschlagen: {}", e))?;
    let path = app_data_dir.join(PENDING_ACTION_FILENAME);
    fs::write(&path, serde_json::to_string_pretty(&action).unwrap())
        .map_err(|e| format!("Vorgemerkte Aktion speichern fehlgeschlagen: {}", e))
}

/// Führt vorgemerkte Dateioperationen aus. Wird vor der SQL-Plugin-Init
/// aufgerufen, solange noch keine Verbindung die Datenbank hält.
///
/// - `wipe`      → Datenbank (+ WAL/SHM) löschen, das Plugin legt sie neu an
/// - `restore`   → Backup über die Datenbank kopieren
/// - `move_db`   → Datenbank in ein neues Verzeichnis kopieren und den
///                 Pfad in der Config hinterlegen
fn handle_pending_actions(app_data_dir: &PathBuf) {
    // Alter Wipe-Marker aus Versionen vor der pending-action-Datei.
    let legacy_marker = app_data_dir.join(WIPE_MARKER_FILENAME);
    if legacy_marker.exists() {
        let db_path = resolve_db_path(app_data_dir);
        let _ = fs::remove_file(&db_path);
        remove_sidecar_files(&db_path);
        let _ = fs::remove_file(&legacy_marker);
    }

    let action_path = app_data_dir.join(PENDING_ACTION_FILENAME);
    if !action_path.exists() {
        return;
    }
    let raw = match fs::read_to_string(&action_path) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Vorgemerkte Aktion nicht lesbar: {}", e);
            let _ = fs::remove_file(&action_path);
            return;
        }
    };
    // Egal wie es ausgeht: die Aktion wird nur einmal versucht. Bliebe die
    // Datei liegen, würde ein fehlschlagender Restore bei jedem Start
    // erneut über die Datenbank laufen.
    let _ = fs::remove_file(&action_path);

    let action: serde_json::Value = match serde_json::from_str(&raw) {
        Ok(v) => v,
        Err(e) => {
            eprintln!("Vorgemerkte Aktion nicht lesbar: {}", e);
            return;
        }
    };

    match action.get("action").and_then(|v| v.as_str()) {
        Some("wipe") => {
            let db_path = resolve_db_path(app_data_dir);
            let _ = fs::remove_file(&db_path);
            remove_sidecar_files(&db_path);
        }
        Some("restore") => {
            let source = match action.get("source").and_then(|v| v.as_str()) {
                Some(s) => PathBuf::from(s),
                None => return,
            };
            if !source.exists() {
                eprintln!("Backup-Datei nicht mehr vorhanden: {}", source.to_string_lossy());
                return;
            }
            let db_path = resolve_db_path(app_data_dir);
            remove_sidecar_files(&db_path);
            if let Err(e) = fs::copy(&source, &db_path) {
                eprintln!("Wiederherstellung fehlgeschlagen: {}", e);
            }
        }
        Some("move_db") => {
            let target_dir = match action.get("target_dir").and_then(|v| v.as_str()) {
                Some(s) => PathBuf::from(s),
                None => return,
            };
            if !target_dir.is_dir() {
                eprintln!("Zielverzeichnis nicht vorhanden: {}", target_dir.to_string_lossy());
                return;
            }
            let current_db = resolve_db_path(app_data_dir);
            let new_db = target_dir.join(DB_FILENAME);
            // Eine bereits vorhandene Datenbank am Ziel wird übernommen
            // statt überschrieben — sonst würde ein Wechsel zurück in einen
            // früher genutzten Ordner dessen Daten zerstören.
            if current_db.exists() && !new_db.exists() {
                if let Err(e) = copy_db_with_sidecars(&current_db, &new_db) {
                    eprintln!("Datenbank verschieben fehlgeschlagen: {}", e);
                    return;
                }
            }
            let config = serde_json::json!({ "db_dir": target_dir.to_string_lossy() });
            let config_path = app_data_dir.join(CONFIG_FILENAME);
            if let Err(e) = fs::write(&config_path, serde_json::to_string_pretty(&config).unwrap()) {
                eprintln!("Config speichern fehlgeschlagen: {}", e);
            }
        }
        Some("reset_dir") => {
            // Config entfernen: die App nutzt danach wieder den
            // Standardspeicherort. Die Datenbank im Custom-Ordner bleibt
            // liegen, damit nichts unwiederbringlich verloren geht.
            let config_path = app_data_dir.join(CONFIG_FILENAME);
            if config_path.exists() {
                if let Err(e) = fs::remove_file(&config_path) {
                    eprintln!("Config entfernen fehlgeschlagen: {}", e);
                }
            }
        }
        other => {
            eprintln!("Unbekannte vorgemerkte Aktion: {:?}", other);
        }
    }
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

/// Merkt den Verzeichniswechsel vor und startet die App neu. Kopiert wird
/// erst beim Start — die laufende Verbindung hält die Datenbank offen, und
/// eine Kopie im laufenden Betrieb wäre unvollständig (WAL), während die
/// App bis zum Neustart weiter in die alte Datei schreiben würde.
#[tauri::command]
fn change_db_dir(app_handle: tauri::AppHandle, new_dir: String) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;

    let target_dir = PathBuf::from(&new_dir);
    if !target_dir.is_dir() {
        return Err(format!("Zielverzeichnis existiert nicht: {}", new_dir));
    }

    queue_pending_action(
        &app_data_dir,
        serde_json::json!({ "action": "move_db", "target_dir": new_dir }),
    )?;

    app_handle.restart();
}

/// Setzt den Speicherort auf den Standard zurück und startet neu.
/// Wie beim Wechsel gilt: die Verbindung hängt bis zum Neustart an der
/// alten Datei, deshalb passiert die Umstellung beim Start.
#[tauri::command]
fn reset_db_dir(app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;

    queue_pending_action(&app_data_dir, serde_json::json!({ "action": "reset_dir" }))?;

    app_handle.restart();
}

/// Ein Statement innerhalb einer Transaktion.
///
/// `params` akzeptiert JSON-Werte (null, bool, Zahl, String). Ein Objekt der
/// Form `{"__lastInsertId": 2}` wird durch die zuletzt vergebene ID des
/// Statements mit diesem Index ersetzt — so kann ein Batch erst eine Runde
/// anlegen und danach Matches, die auf deren ID verweisen.
#[derive(serde::Deserialize)]
struct TxStatement {
    sql: String,
    #[serde(default)]
    params: Vec<serde_json::Value>,
}

/// Führt mehrere Statements in EINER Transaktion auf EINER Verbindung aus.
///
/// Notwendig, weil das SQL-Plugin jedes Statement auf einer beliebigen
/// Verbindung seines Pools ausführt: ein vom Frontend abgesetztes BEGIN
/// würde die nachfolgenden Statements nicht einschliessen. Gibt je Statement
/// die zuletzt eingefügte Zeilen-ID zurück.
#[tauri::command]
async fn execute_transaction(
    app_handle: tauri::AppHandle,
    statements: Vec<TxStatement>,
) -> Result<Vec<i64>, String> {
    use sqlx::{Sqlite, Pool};
    use tauri_plugin_sql::{DbInstances, DbPool};

    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;
    let conn_string = build_connection_string(&app_data_dir);

    let instances = app_handle.state::<DbInstances>();
    let map = instances.0.read().await;
    // Normalfall: exakt der String, mit dem das Frontend die Datenbank
    // geladen hat. Fallback auf den einzigen registrierten Pool, damit ein
    // abweichend geschriebener Pfad die Transaktion nicht scheitern lässt.
    let pool: &Pool<Sqlite> = match map.get(&conn_string).or_else(|| map.values().next()) {
        Some(DbPool::Sqlite(p)) => p,
        _ => return Err("Keine Datenbankverbindung gefunden".to_string()),
    };

    let mut tx = pool.begin().await.map_err(|e| format!("BEGIN fehlgeschlagen: {}", e))?;

    let mut ids: Vec<i64> = Vec::with_capacity(statements.len());
    for (idx, statement) in statements.iter().enumerate() {
        let mut query = sqlx::query(&statement.sql);

        for param in &statement.params {
            query = match param {
                serde_json::Value::Null => query.bind(None::<String>),
                serde_json::Value::Bool(b) => query.bind(*b),
                serde_json::Value::Number(n) => {
                    if let Some(i) = n.as_i64() {
                        query.bind(i)
                    } else {
                        query.bind(n.as_f64().unwrap_or(0.0))
                    }
                }
                serde_json::Value::String(s) => query.bind(s.clone()),
                serde_json::Value::Object(obj) => {
                    // Rueckverweis auf die ID eines frueheren Statements.
                    let reference = obj
                        .get("__lastInsertId")
                        .and_then(|v| v.as_u64())
                        .ok_or_else(|| {
                            format!("Statement {}: unbekannter Objekt-Parameter", idx)
                        })? as usize;
                    let id = ids.get(reference).copied().ok_or_else(|| {
                        format!(
                            "Statement {}: verweist auf Statement {}, das keine ID geliefert hat",
                            idx, reference
                        )
                    })?;
                    query.bind(id)
                }
                other => {
                    return Err(format!(
                        "Statement {}: nicht unterstuetzter Parametertyp {}",
                        idx, other
                    ))
                }
            };
        }

        let result = query
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Statement {} fehlgeschlagen: {}", idx, e))?;
        ids.push(result.last_insert_rowid());
    }

    tx.commit().await.map_err(|e| format!("COMMIT fehlgeschlagen: {}", e))?;
    Ok(ids)
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

/// Prüft das Backup, merkt die Wiederherstellung vor und startet neu.
/// Kopiert wird erst beim Start: über eine geöffnete Datenbank zu kopieren
/// vermischt das Backup mit dem WAL der laufenden Verbindung.
#[tauri::command]
fn restore_db(app_handle: tauri::AppHandle, source_path: String) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;

    let source = PathBuf::from(&source_path);
    if !source.exists() {
        return Err("Backup-Datei nicht gefunden".to_string());
    }

    // Pruefen ob es eine gueltige SQLite-Datei ist (nur Header lesen, nicht ganze Datei).
    // Passiert bewusst vor dem Neustart, damit eine falsche Datei sofort
    // gemeldet wird statt erst nach dem Hochfahren.
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

    // Sicherheitskopie der aktuellen Datenbank, bevor sie ersetzt wird.
    let db_path = resolve_db_path(&app_data_dir);
    if db_path.exists() {
        let safety = PathBuf::from(format!("{}.pre-restore", db_path.to_string_lossy()));
        let _ = fs::copy(&db_path, &safety);
    }

    queue_pending_action(
        &app_data_dir,
        serde_json::json!({ "action": "restore", "source": source_path }),
    )?;

    app_handle.restart();
}

#[tauri::command]
fn wipe_database_and_restart(app_handle: tauri::AppHandle) -> Result<(), String> {
    let app_data_dir = app_handle.path().app_data_dir()
        .map_err(|e| format!("Kann App-Datenverzeichnis nicht ermitteln: {}", e))?;
    // Aktion vormerken - der nächste Startup löscht die DB-Datei vor der SQL-Plugin-Init
    queue_pending_action(&app_data_dir, serde_json::json!({ "action": "wipe" }))?;
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
        Migration {
            version: 14,
            description: "rebuild tournament graph: drop stale format CHECK, allow byes (nullable team2_p1)",
            // Two schema changes SQLite cannot do in place: dropping the
            // CHECK on `tournaments.format` (it only ever listed the first
            // four formats, making swiss / double_elimination / monrad /
            // king_of_court / waterfall impossible to insert) and relaxing
            // NOT NULL on `matches.team2_p1` (a bye is a match without an
            // opponent).
            //
            // Both require recreating the table. Two constraints shape how:
            //
            //  1. sqlx enables `PRAGMA foreign_keys` on every connection,
            //     and each migration runs inside a transaction — where
            //     `PRAGMA foreign_keys=OFF` is a no-op. So the rebuild has
            //     to survive live foreign keys.
            //  2. `ALTER TABLE ... RENAME` rewrites the FK clauses of the
            //     *referencing* tables, so a rename-and-drop dance makes
            //     `tournament_players`, `rounds`, `matches` and `sets`
            //     point at the temporary name and then cascades their rows
            //     away when it is dropped. (`legacy_alter_table` does not
            //     prevent this — verified against SQLite 3.50.)
            //
            // Therefore the whole tournament graph is rebuilt: copy every
            // affected table into TEMP storage, drop child-to-parent,
            // recreate parent-to-child, copy back. Rows whose parent went
            // missing in an older version are dropped on the way — they
            // could not be displayed anyway and would fail the new
            // constraints.
            //
            // `players` and `sportstaetten` are untouched: nothing about
            // them changes, and they are the parents of everything here.
            sql: "
                CREATE TEMP TABLE _bk_tournaments AS SELECT * FROM tournaments;
                CREATE TEMP TABLE _bk_tournament_players AS SELECT * FROM tournament_players;
                CREATE TEMP TABLE _bk_rounds AS SELECT * FROM rounds;
                CREATE TEMP TABLE _bk_matches AS SELECT * FROM matches;
                CREATE TEMP TABLE _bk_sets AS SELECT * FROM sets;

                DROP TABLE sets;
                DROP TABLE matches;
                DROP TABLE rounds;
                DROP TABLE tournament_players;
                DROP TABLE tournaments;

                CREATE TABLE tournaments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL,
                    mode TEXT NOT NULL CHECK(mode IN ('singles', 'doubles', 'mixed')),
                    format TEXT NOT NULL,
                    sets_to_win INTEGER NOT NULL DEFAULT 2,
                    points_per_set INTEGER NOT NULL DEFAULT 21,
                    cap INTEGER,
                    ko_points_per_set INTEGER,
                    ko_sets_to_win INTEGER,
                    ko_cap INTEGER,
                    courts INTEGER NOT NULL DEFAULT 1,
                    num_groups INTEGER NOT NULL DEFAULT 0,
                    qualify_per_group INTEGER NOT NULL DEFAULT 0,
                    current_phase TEXT,
                    entry_fee_single REAL NOT NULL DEFAULT 0,
                    entry_fee_double REAL NOT NULL DEFAULT 0,
                    team_config TEXT,
                    hall_config TEXT,
                    venue_id INTEGER,
                    min_rest_minutes INTEGER NOT NULL DEFAULT 0,
                    enable_third_place INTEGER NOT NULL DEFAULT 0,
                    session_id INTEGER,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'active', 'completed', 'archived'))
                );

                CREATE TABLE tournament_players (
                    tournament_id INTEGER NOT NULL,
                    player_id INTEGER NOT NULL,
                    retired INTEGER NOT NULL DEFAULT 0,
                    payment_status TEXT NOT NULL DEFAULT 'unpaid',
                    payment_method TEXT,
                    paid_date TEXT,
                    seed_rank INTEGER,
                    PRIMARY KEY (tournament_id, player_id),
                    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
                    FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
                );

                CREATE TABLE rounds (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    tournament_id INTEGER NOT NULL,
                    round_number INTEGER NOT NULL,
                    phase TEXT,
                    group_number INTEGER,
                    FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE
                );

                CREATE TABLE matches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    round_id INTEGER NOT NULL,
                    team1_p1 INTEGER NOT NULL,
                    team1_p2 INTEGER,
                    team2_p1 INTEGER,
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

                CREATE TABLE sets (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    match_id INTEGER NOT NULL,
                    set_number INTEGER NOT NULL,
                    team1_score INTEGER NOT NULL DEFAULT 0,
                    team2_score INTEGER NOT NULL DEFAULT 0,
                    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
                );

                INSERT INTO tournaments (
                    id, name, mode, format, sets_to_win, points_per_set, cap,
                    ko_points_per_set, ko_sets_to_win, ko_cap, courts, num_groups,
                    qualify_per_group, current_phase, entry_fee_single, entry_fee_double,
                    team_config, hall_config, venue_id, min_rest_minutes,
                    enable_third_place, session_id, created_at, status
                )
                SELECT
                    id, name, mode, format, sets_to_win, points_per_set, cap,
                    ko_points_per_set, ko_sets_to_win, ko_cap, courts, num_groups,
                    qualify_per_group, current_phase, entry_fee_single, entry_fee_double,
                    team_config, hall_config, venue_id, min_rest_minutes,
                    enable_third_place, session_id, created_at, status
                FROM _bk_tournaments;

                INSERT INTO tournament_players (
                    tournament_id, player_id, retired, payment_status,
                    payment_method, paid_date, seed_rank
                )
                SELECT
                    tournament_id, player_id, retired, payment_status,
                    payment_method, paid_date, seed_rank
                FROM _bk_tournament_players
                WHERE tournament_id IN (SELECT id FROM tournaments)
                  AND player_id IN (SELECT id FROM players);

                INSERT INTO rounds (id, tournament_id, round_number, phase, group_number)
                SELECT id, tournament_id, round_number, phase, group_number
                FROM _bk_rounds
                WHERE tournament_id IN (SELECT id FROM tournaments);

                INSERT INTO matches (
                    id, round_id, team1_p1, team1_p2, team2_p1, team2_p2,
                    winner_team, status, court, court_assigned_at, started_at, completed_at
                )
                SELECT
                    id, round_id, team1_p1,
                    CASE WHEN team1_p2 = 0 THEN NULL ELSE team1_p2 END,
                    -- Legacy placeholder 0 meant BYE/TBD and never pointed at
                    -- a real player row; it becomes a proper NULL.
                    CASE WHEN team2_p1 = 0 THEN NULL ELSE team2_p1 END,
                    CASE WHEN team2_p2 = 0 THEN NULL ELSE team2_p2 END,
                    winner_team, status, court, court_assigned_at, started_at, completed_at
                FROM _bk_matches
                WHERE round_id IN (SELECT id FROM rounds)
                  AND team1_p1 IN (SELECT id FROM players)
                  AND (team1_p2 IS NULL OR team1_p2 = 0 OR team1_p2 IN (SELECT id FROM players))
                  AND (team2_p1 IS NULL OR team2_p1 = 0 OR team2_p1 IN (SELECT id FROM players))
                  AND (team2_p2 IS NULL OR team2_p2 = 0 OR team2_p2 IN (SELECT id FROM players));

                INSERT INTO sets (id, match_id, set_number, team1_score, team2_score)
                SELECT id, match_id, set_number, team1_score, team2_score
                FROM _bk_sets
                WHERE match_id IN (SELECT id FROM matches);

                DROP TABLE _bk_sets;
                DROP TABLE _bk_matches;
                DROP TABLE _bk_rounds;
                DROP TABLE _bk_tournament_players;
                DROP TABLE _bk_tournaments;
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 15,
            description: "add walkover flag to matches and planned_rounds to tournaments",
            // Two additive columns, no table rebuild needed.
            //
            // `walkover`: a match awarded without play (retirement, no-show).
            // It counts as a win but contributes no sets or points — before
            // this, retirements were stored as invented 21:0 sets that fed
            // straight into every ratio-based tiebreak.
            //
            // `planned_rounds`: how many rounds a Swiss / Monrad / Waterfall
            // tournament should run. That number used to live in
            // `num_groups`, which every other reader interprets as a group
            // count. The UPDATEs move existing values across and clear the
            // misused column for those formats.
            sql: "
                ALTER TABLE matches ADD COLUMN walkover INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE tournaments ADD COLUMN planned_rounds INTEGER;

                UPDATE tournaments
                   SET planned_rounds = num_groups
                 WHERE format IN ('swiss', 'monrad', 'waterfall')
                   AND num_groups > 0;

                UPDATE tournaments
                   SET num_groups = 0
                 WHERE format IN ('swiss', 'monrad', 'waterfall');
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 16,
            description: "add indexes on hot foreign keys and enforce one row per set",
            // Two things the schema never had:
            //
            //  1. Indexes. Every query filters on round_id / match_id /
            //     tournament_id, and without an index each one is a full
            //     table scan — noticeable with 5-second polling across
            //     several tournaments.
            //
            //  2. A unique set number per match. `upsertSet` used to SELECT
            //     and then INSERT or UPDATE; two quick keystrokes could
            //     interleave and produce a duplicate row that counted its
            //     points twice. Existing duplicates are collapsed first,
            //     keeping the highest id (the most recent write).
            sql: "
                DELETE FROM sets
                 WHERE id NOT IN (
                       SELECT MAX(id) FROM sets GROUP BY match_id, set_number
                 );

                CREATE UNIQUE INDEX IF NOT EXISTS idx_sets_match_set
                    ON sets(match_id, set_number);

                CREATE INDEX IF NOT EXISTS idx_matches_round     ON matches(round_id);
                CREATE INDEX IF NOT EXISTS idx_matches_court     ON matches(court);
                CREATE INDEX IF NOT EXISTS idx_matches_status    ON matches(status);
                CREATE INDEX IF NOT EXISTS idx_rounds_tournament ON rounds(tournament_id);
                CREATE INDEX IF NOT EXISTS idx_tp_player         ON tournament_players(player_id);
                CREATE INDEX IF NOT EXISTS idx_tournaments_session ON tournaments(session_id);
                CREATE INDEX IF NOT EXISTS idx_tournaments_venue   ON tournaments(venue_id);
                CREATE INDEX IF NOT EXISTS idx_tournaments_status  ON tournaments(status);
                CREATE INDEX IF NOT EXISTS idx_sessions_venue      ON sessions(venue_id);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 17,
            description: "add archived_at to players for soft delete",
            // A player who has already played cannot be deleted: matches
            // reference them, and dropping the row would turn their name
            // into a "?" in every finished tournament. Archiving hides them
            // from the pickers while keeping the history readable
            // (REVIEW-BACKLOG.md C8).
            sql: "
                ALTER TABLE players ADD COLUMN archived_at TEXT;
                CREATE INDEX IF NOT EXISTS idx_players_archived ON players(archived_at);
            ",
            kind: MigrationKind::Up,
        },
        Migration {
            version: 18,
            description: "finalise player name columns and drop the age/birth_year leftovers",
            // `players` carried three representations of the same name
            // (`name`, `first_name`, `last_name`) plus two dead age columns.
            // Every insert tried three statement variants in nested
            // try/catch blocks in case a column was missing, and every read
            // reconstructed the split from `name` (REVIEW-BACKLOG.md C6).
            //
            // After this migration `first_name` / `last_name` are the truth
            // and are guaranteed present. `name` stays as a plain column,
            // kept in sync on write, because the ORDER BY clauses and the
            // WordPress snapshots still read it.
            sql: "
                UPDATE players
                   SET first_name = CASE
                           WHEN INSTR(name, ' ') > 0 THEN SUBSTR(name, 1, INSTR(name, ' ') - 1)
                           ELSE name
                       END
                 WHERE first_name IS NULL OR TRIM(first_name) = '';

                UPDATE players
                   SET last_name = CASE
                           WHEN INSTR(name, ' ') > 0 THEN SUBSTR(name, INSTR(name, ' ') + 1)
                           ELSE ''
                       END
                 WHERE last_name IS NULL;

                UPDATE players
                   SET name = TRIM(first_name || ' ' || COALESCE(last_name, ''))
                 WHERE name IS NULL OR TRIM(name) = '';

                UPDATE players SET birth_date = (birth_year || '-01-01')
                 WHERE birth_date IS NULL AND birth_year IS NOT NULL;

                ALTER TABLE players DROP COLUMN age;
                ALTER TABLE players DROP COLUMN birth_year;
            ",
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

            // Vorgemerkte Dateioperationen (Wipe / Restore / Ortswechsel)
            // ausführen, BEVOR das SQL-Plugin die Datenbank öffnet.
            handle_pending_actions(&app_data_dir);

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
            reset_db_dir,
            open_folder,
            backup_db,
            restore_db,
            wipe_database_and_restart,
            execute_transaction,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
