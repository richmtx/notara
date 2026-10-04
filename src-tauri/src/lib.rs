/// Devuelve a un archivo su fecha de creación original.
///
/// Notara guarda escribiendo un temporal y renombrándolo sobre el original, así que el archivo
/// resultante nace en cada guardado. El plugin fs no permite fijar esa fecha, de ahí este comando.
#[tauri::command]
fn conservar_fecha_creacion(ruta: String, creada_ms: u64) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::fs::{FileTimes, OpenOptions};
        use std::os::windows::fs::FileTimesExt;
        use std::time::{Duration, UNIX_EPOCH};

        let creada = UNIX_EPOCH + Duration::from_millis(creada_ms);
        let archivo = OpenOptions::new()
            .write(true)
            .open(&ruta)
            .map_err(|e| e.to_string())?;
        // Solo se fija la creación: las fechas que no se indican quedan como están.
        archivo
            .set_times(FileTimes::new().set_created(creada))
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    let _ = (ruta, creada_ms);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![conservar_fecha_creacion])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
