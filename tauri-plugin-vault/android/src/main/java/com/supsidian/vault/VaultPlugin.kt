package com.supsidian.vault

import android.app.Activity
import android.content.Intent
import android.database.Cursor
import android.net.Uri
import android.provider.DocumentsContract
import android.provider.DocumentsContract.Document
import android.util.Base64
import androidx.activity.result.ActivityResult
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.FileNotFoundException
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

@InvokeArg
class RootArgs {
    var root: String = ""
}

@InvokeArg
class PathArgs {
    var root: String = ""
    var path: String = ""
}

@InvokeArg
class ReadArgs {
    var root: String = ""
    var path: String = ""
    var binary: Boolean = false
}

@InvokeArg
class WriteArgs {
    var root: String = ""
    var path: String = ""
    var text: String? = null
    var base64: String? = null
}

private data class Doc(val id: String, val name: String, val isDir: Boolean, val mtime: Long, val size: Long)

/**
 * Vault access through the Storage Access Framework: the user picks the vault folder once
 * (ACTION_OPEN_DOCUMENT_TREE), the permission is kept across restarts, and every file is
 * addressed by its path relative to that folder ("Cards/Note.md").
 */
@TauriPlugin
class VaultPlugin(private val activity: Activity) : Plugin(activity) {
    private val io = Executors.newFixedThreadPool(4)
    private val ids = ConcurrentHashMap<String, String>() // "<root>\u0000<path>" -> document id
    private val createLock = Any()
    private val resolver get() = activity.contentResolver

    private val cols = arrayOf(
        Document.COLUMN_DOCUMENT_ID,
        Document.COLUMN_DISPLAY_NAME,
        Document.COLUMN_MIME_TYPE,
        Document.COLUMN_LAST_MODIFIED,
        Document.COLUMN_SIZE,
    )

    /** Runs file work off the UI thread and answers the call with its result or error. */
    private fun bg(invoke: Invoke, block: () -> JSObject) {
        io.execute {
            try {
                invoke.resolve(block())
            } catch (e: Exception) {
                invoke.reject(e.message ?: e.toString())
            }
        }
    }

    // ---------- picking the vault

    @Command
    fun pick(invoke: Invoke) {
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT_TREE)
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION or
                Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION or Intent.FLAG_GRANT_PREFIX_URI_PERMISSION
        )
        startActivityForResult(invoke, intent, "pickResult")
    }

    @ActivityCallback
    fun pickResult(invoke: Invoke, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            invoke.resolve(JSObject())
            return
        }
        bg(invoke) {
            resolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
            val root = uri.toString()
            val name = query(root, rootId(root))?.name
                ?: uri.lastPathSegment?.substringAfterLast(':')?.substringAfterLast('/')
                ?: "Vault"
            JSObject().apply {
                put("root", root)
                put("name", name)
            }
        }
    }

    // ---------- helpers

    private fun tree(root: String): Uri = Uri.parse(root)
    private fun rootId(root: String): String = DocumentsContract.getTreeDocumentId(tree(root))
    private fun docUri(root: String, id: String): Uri = DocumentsContract.buildDocumentUriUsingTree(tree(root), id)
    private fun key(root: String, path: String) = root + "\u0000" + path

    private fun docFrom(c: Cursor) = Doc(
        id = c.getString(0),
        name = c.getString(1) ?: "",
        isDir = c.getString(2) == Document.MIME_TYPE_DIR,
        mtime = if (c.isNull(3)) 0L else c.getLong(3),
        size = if (c.isNull(4)) 0L else c.getLong(4),
    )

    private fun query(root: String, id: String): Doc? = try {
        resolver.query(docUri(root, id), cols, null, null, null)?.use { c -> if (c.moveToFirst()) docFrom(c) else null }
    } catch (e: Exception) {
        null
    }

    private fun children(root: String, id: String): List<Doc> {
        val out = ArrayList<Doc>()
        resolver.query(DocumentsContract.buildChildDocumentsUriUsingTree(tree(root), id), cols, null, null, null)?.use { c ->
            while (c.moveToNext()) out.add(docFrom(c))
        }
        return out
    }

    private fun segments(path: String): List<String> {
        val segs = path.split('/').filter { it.isNotEmpty() && it != "." }
        if (segs.any { it == ".." }) throw IllegalArgumentException("invalid path: $path")
        return segs
    }

    /** Document id of a vault-relative path, or null when it doesn't exist. */
    private fun find(root: String, path: String): String? {
        val segs = segments(path)
        if (segs.isEmpty()) return if (query(root, rootId(root)) != null) rootId(root) else null
        val full = segs.joinToString("/")
        ids[key(root, full)]?.let { cached ->
            if (query(root, cached) != null) return cached
            forget(root, full)
        }
        var id = rootId(root)
        var prefix = ""
        for (seg in segs) {
            val next = if (prefix.isEmpty()) seg else "$prefix/$seg"
            var found = ids[key(root, next)]
            if (found == null) {
                val parentPrefix = prefix
                for (kid in children(root, id)) {
                    val p = if (parentPrefix.isEmpty()) kid.name else "$parentPrefix/${kid.name}"
                    ids[key(root, p)] = kid.id
                    if (kid.name == seg) found = kid.id
                }
            }
            if (found == null) return null
            id = found
            prefix = next
        }
        return id
    }

    private fun forget(root: String, path: String) {
        val k = key(root, path)
        ids.keys.removeIf { it == k || it.startsWith("$k/") }
    }

    /** Creates missing folders along the way and returns the id of the last one. */
    private fun ensureDir(root: String, segs: List<String>): String = synchronized(createLock) {
        var id = rootId(root)
        var prefix = ""
        for (seg in segs) {
            val next = if (prefix.isEmpty()) seg else "$prefix/$seg"
            val existing = find(root, next)
            id = if (existing != null) {
                existing
            } else {
                val uri = DocumentsContract.createDocument(resolver, docUri(root, id), Document.MIME_TYPE_DIR, seg)
                    ?: throw FileNotFoundException("can't create folder $next")
                val newId = DocumentsContract.getDocumentId(uri)
                ids[key(root, next)] = newId
                newId
            }
            prefix = next
        }
        id
    }

    // ---------- commands

    @Command
    fun list(invoke: Invoke) {
        val a = invoke.parseArgs(RootArgs::class.java)
        bg(invoke) {
            val items = JSArray()
            fun walk(id: String, prefix: String) {
                for (d in children(a.root, id)) {
                    if (d.name.startsWith(".")) continue
                    val p = if (prefix.isEmpty()) d.name else "$prefix/${d.name}"
                    ids[key(a.root, p)] = d.id
                    if (d.isDir) {
                        walk(d.id, p)
                    } else {
                        val o = JSObject()
                        o.put("path", p)
                        o.put("mtime", d.mtime)
                        o.put("size", d.size)
                        items.put(o)
                    }
                }
            }
            walk(rootId(a.root), "")
            JSObject().apply { put("items", items) }
        }
    }

    @Command
    fun read(invoke: Invoke) {
        val a = invoke.parseArgs(ReadArgs::class.java)
        bg(invoke) {
            val id = find(a.root, a.path) ?: throw FileNotFoundException("not found: ${a.path}")
            val bytes = resolver.openInputStream(docUri(a.root, id))?.use { it.readBytes() }
                ?: throw FileNotFoundException("can't read ${a.path}")
            val meta = query(a.root, id)
            JSObject().apply {
                put("data", if (a.binary) Base64.encodeToString(bytes, Base64.NO_WRAP) else String(bytes, Charsets.UTF_8))
                put("mtime", meta?.mtime ?: 0L)
                put("size", bytes.size.toLong())
            }
        }
    }

    @Command
    fun write(invoke: Invoke) {
        val a = invoke.parseArgs(WriteArgs::class.java)
        bg(invoke) {
            val segs = segments(a.path)
            if (segs.isEmpty()) throw IllegalArgumentException("empty path")
            val bytes = a.text?.toByteArray(Charsets.UTF_8) ?: Base64.decode(a.base64 ?: "", Base64.DEFAULT)
            val id = find(a.root, a.path) ?: synchronized(createLock) {
                find(a.root, a.path) ?: createFile(a.root, segs)
            }
            val uri = docUri(a.root, id)
            // "wt" truncates; a few providers only know "w"
            val out = try { resolver.openOutputStream(uri, "wt") } catch (e: Exception) { null }
                ?: resolver.openOutputStream(uri, "w")
                ?: throw FileNotFoundException("can't write ${a.path}")
            out.use { it.write(bytes) }
            JSObject().apply { put("mtime", query(a.root, id)?.mtime ?: System.currentTimeMillis()) }
        }
    }

    private fun createFile(root: String, segs: List<String>): String {
        val parent = ensureDir(root, segs.dropLast(1))
        // octet-stream keeps the name exactly as given (a text MIME type can make providers append an extension)
        val uri = DocumentsContract.createDocument(resolver, docUri(root, parent), "application/octet-stream", segs.last())
            ?: throw FileNotFoundException("can't create ${segs.joinToString("/")}")
        val id = DocumentsContract.getDocumentId(uri)
        ids[key(root, segs.joinToString("/"))] = id
        return id
    }

    @Command
    fun remove(invoke: Invoke) {
        val a = invoke.parseArgs(PathArgs::class.java)
        bg(invoke) {
            val id = find(a.root, a.path)
            if (id != null) {
                DocumentsContract.deleteDocument(resolver, docUri(a.root, id))
                forget(a.root, segments(a.path).joinToString("/"))
            }
            JSObject()
        }
    }

    @Command
    fun remove_dir(invoke: Invoke) {
        val a = invoke.parseArgs(PathArgs::class.java)
        bg(invoke) {
            val segs = segments(a.path)
            val id = if (segs.isEmpty()) null else find(a.root, a.path)
            if (id != null) {
                DocumentsContract.deleteDocument(resolver, docUri(a.root, id))
                forget(a.root, segs.joinToString("/"))
            }
            JSObject()
        }
    }

    @Command
    fun list_dir(invoke: Invoke) {
        val a = invoke.parseArgs(PathArgs::class.java)
        bg(invoke) {
            val names = JSArray()
            val id = find(a.root, a.path) ?: throw FileNotFoundException("not found: ${a.path}")
            for (d in children(a.root, id)) if (!d.isDir) names.put(d.name)
            JSObject().apply { put("names", names) }
        }
    }

    @Command
    fun exists(invoke: Invoke) {
        val a = invoke.parseArgs(PathArgs::class.java)
        bg(invoke) {
            val found = try { find(a.root, a.path) != null } catch (e: SecurityException) { false }
            JSObject().apply { put("value", found) }
        }
    }
}
