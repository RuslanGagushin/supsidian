use std::{
    fs,
    path::{Component, Path, PathBuf},
    time::UNIX_EPOCH,
};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::de::DeserializeOwned;
use tauri::{plugin::PluginApi, AppHandle, Runtime};
use tauri_plugin_dialog::DialogExt;

use crate::{models::*, Error, Result};

pub fn init<R: Runtime, C: DeserializeOwned>(app: &AppHandle<R>, _api: PluginApi<R, C>) -> Result<Vault<R>> {
    Ok(Vault(app.clone()))
}

/// Desktop implementation: plain files under the picked folder.
pub struct Vault<R: Runtime>(AppHandle<R>);

/// Join a vault-relative path ("a/b.md") onto the root, refusing anything that could leave it.
fn join(root: &str, rel: &str) -> Result<PathBuf> {
    let mut p = PathBuf::from(root);
    for comp in Path::new(rel).components() {
        match comp {
            Component::Normal(c) => p.push(c),
            Component::CurDir => {}
            _ => return Err(Error::Msg(format!("invalid path: {rel}"))),
        }
    }
    Ok(p)
}

fn mtime_ms(meta: &fs::Metadata) -> f64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0)
}

/// Every file under `dir`, skipping hidden names (".obsidian", ".trash", ".git", …) like the web version does.
fn walk(dir: &Path, prefix: &str, out: &mut Vec<Entry>) -> Result<()> {
    for item in fs::read_dir(dir)? {
        let item = item?;
        let name = item.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let rel = if prefix.is_empty() { name.clone() } else { format!("{prefix}/{name}") };
        let ft = item.file_type()?;
        if ft.is_dir() {
            walk(&item.path(), &rel, out)?;
        } else if ft.is_file() || ft.is_symlink() {
            if let Ok(meta) = fs::metadata(item.path()) {
                if meta.is_file() {
                    out.push(Entry { path: rel, mtime: mtime_ms(&meta), size: meta.len() });
                }
            }
        }
    }
    Ok(())
}

impl<R: Runtime> Vault<R> {
    pub fn pick(&self) -> Result<Option<Picked>> {
        let Some(picked) = self.0.dialog().file().set_title("Open vault folder").blocking_pick_folder() else {
            return Ok(None);
        };
        let path = picked.into_path().map_err(|e| Error::Msg(e.to_string()))?;
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().into_owned())
            .unwrap_or_else(|| path.to_string_lossy().into_owned());
        Ok(Some(Picked { root: path.to_string_lossy().into_owned(), name }))
    }

    pub fn list(&self, root: String) -> Result<Vec<Entry>> {
        let mut out = Vec::new();
        walk(Path::new(&root), "", &mut out)?;
        Ok(out)
    }

    pub fn read(&self, root: String, path: String, binary: bool) -> Result<ReadResult> {
        let p = join(&root, &path)?;
        let bytes = fs::read(&p)?;
        let meta = fs::metadata(&p)?;
        let data = if binary { STANDARD.encode(&bytes) } else { String::from_utf8_lossy(&bytes).into_owned() };
        Ok(ReadResult { data, mtime: mtime_ms(&meta), size: bytes.len() as u64 })
    }

    /// Writes through a temporary file and a rename, so Obsidian never sees a half-written note.
    pub fn write(&self, root: String, path: String, text: Option<String>, base64: Option<String>) -> Result<f64> {
        let p = join(&root, &path)?;
        let bytes = match (text, base64) {
            (Some(t), _) => t.into_bytes(),
            (None, Some(b)) => STANDARD.decode(b).map_err(|e| Error::Msg(e.to_string()))?,
            (None, None) => Vec::new(),
        };
        if let Some(parent) = p.parent() {
            fs::create_dir_all(parent)?;
        }
        let file_name = p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let tmp = p.with_file_name(format!(".{file_name}.supsidian-tmp"));
        fs::write(&tmp, &bytes)?;
        if fs::rename(&tmp, &p).is_err() {
            let _ = fs::remove_file(&tmp);
            fs::write(&p, &bytes)?;
        }
        Ok(mtime_ms(&fs::metadata(&p)?))
    }

    pub fn remove(&self, root: String, path: String) -> Result<()> {
        fs::remove_file(join(&root, &path)?)?;
        Ok(())
    }

    pub fn remove_dir(&self, root: String, path: String) -> Result<()> {
        fs::remove_dir_all(join(&root, &path)?)?;
        Ok(())
    }

    pub fn list_dir(&self, root: String, path: String) -> Result<Vec<String>> {
        let mut names = Vec::new();
        for item in fs::read_dir(join(&root, &path)?)? {
            let item = item?;
            if item.file_type()?.is_file() {
                names.push(item.file_name().to_string_lossy().into_owned());
            }
        }
        Ok(names)
    }

    pub fn exists(&self, root: String, path: String) -> Result<bool> {
        Ok(join(&root, &path)?.exists())
    }
}
