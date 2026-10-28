use tauri::{command, AppHandle, Runtime};

use crate::{models::*, Result, VaultExt};

#[command]
pub(crate) async fn pick<R: Runtime>(app: AppHandle<R>) -> Result<Option<Picked>> {
    app.vault().pick()
}

#[command]
pub(crate) async fn list<R: Runtime>(app: AppHandle<R>, root: String) -> Result<Vec<Entry>> {
    app.vault().list(root)
}

#[command]
pub(crate) async fn read<R: Runtime>(app: AppHandle<R>, root: String, path: String, binary: bool) -> Result<ReadResult> {
    app.vault().read(root, path, binary)
}

#[command]
pub(crate) async fn write<R: Runtime>(
    app: AppHandle<R>,
    root: String,
    path: String,
    text: Option<String>,
    base64: Option<String>,
) -> Result<f64> {
    app.vault().write(root, path, text, base64)
}

#[command]
pub(crate) async fn remove<R: Runtime>(app: AppHandle<R>, root: String, path: String) -> Result<()> {
    app.vault().remove(root, path)
}

#[command]
pub(crate) async fn remove_dir<R: Runtime>(app: AppHandle<R>, root: String, path: String) -> Result<()> {
    app.vault().remove_dir(root, path)
}

#[command]
pub(crate) async fn list_dir<R: Runtime>(app: AppHandle<R>, root: String, path: String) -> Result<Vec<String>> {
    app.vault().list_dir(root, path)
}

#[command]
pub(crate) async fn exists<R: Runtime>(app: AppHandle<R>, root: String, path: String) -> Result<bool> {
    app.vault().exists(root, path)
}
