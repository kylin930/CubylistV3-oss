function getAlistFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const typeMap = { 'mp4': 2, 'mkv': 2, 'avi': 2, 'flv': 2, 'mov': 2, 'webm': 2, 'mp3': 3, 'flac': 3, 'wav': 3, 'ogg': 3, 'm4a': 3, 'jpg': 5, 'jpeg': 5, 'png': 5, 'gif': 5, 'webp': 5, 'bmp': 5, 'svg': 5, 'ico': 5, 'txt': 6, 'md': 6, 'json': 6, 'html': 6, 'js': 6, 'css': 6, 'py': 6, 'go': 6 };
    return typeMap[ext] || 0;
}

export async function onRequest(context) {
    if (context.request.method === "OPTIONS") { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } }); }
    if (context.request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

    try {
        const { request, env } = context;
        let { path, name, size, oss_key } = await request.json();

        let decodedPath = decodeURIComponent(decodeURIComponent(path));
        let decodedName = decodeURIComponent(decodeURIComponent(name));
        let decodedOssKey = decodeURIComponent(decodeURIComponent(oss_key));
        if (decodedName.includes("/")) decodedName = decodedName.substring(decodedName.lastIndexOf("/") + 1);
        if (!decodedPath.startsWith("/")) decodedPath = "/" + decodedPath;
        if (decodedPath.length > 1 && decodedPath.endsWith("/")) decodedPath = decodedPath.slice(0, -1);

        const lastSlashIndex = decodedPath.lastIndexOf("/");
        const parentPath = lastSlashIndex === 0 ? "/" : decodedPath.substring(0, lastSlashIndex);
        
        const db = env.ALIST_D1;
        const nowIso = new Date().toISOString();
        const alistType = getAlistFileType(decodedName);
        
        let batchStmts = [];

        // 1. 生成所有虚拟祖先目录的 SQL 节点（INSERT OR IGNORE：若已存在则忽略）
        const segments = decodedPath.split('/').filter(p => p);
        let currPath = "";
        for (let i = 0; i < segments.length - 1; i++) {
            const folderName = segments[i];
            const pPath = currPath === "" ? "/" : currPath;
            currPath = currPath + "/" + folderName;
            
            const dirId = "dir-" + Math.random().toString(36).substring(2, 10);
            batchStmts.push(
                db.prepare(`INSERT OR IGNORE INTO vfs (id, path, parent_path, name, is_dir, size, type, created, modified) VALUES (?, ?, ?, ?, 1, 0, 1, ?, ?)`)
                  .bind(dirId, currPath, pPath, folderName, nowIso, nowIso)
            );
        }

        // 2. 插入或更新实际的媒体文件
        const fileId = "file-" + Date.now() + Math.random().toString(36).substring(2, 5);
        batchStmts.push(
            db.prepare(`
                INSERT INTO vfs (id, path, parent_path, name, is_dir, size, type, oss_key, created, modified) 
                VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?)
                ON CONFLICT(path) DO UPDATE SET 
                size = excluded.size, type = excluded.type, oss_key = excluded.oss_key, modified = excluded.modified
            `).bind(fileId, decodedPath, parentPath, decodedName, size || 0, alistType, decodedOssKey, nowIso, nowIso)
        );

        // 批量执行原子级提交，避免 D1 反复建立连接浪费额度
        await db.batch(batchStmts);

        return new Response(JSON.stringify({ code: 200, message: "Success" }), { headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: error.message }), { status: 500, headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } });
    }
}