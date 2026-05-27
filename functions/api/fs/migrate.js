const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function onRequest(context) {
    const kv = context.env.ALIST_KV;
    const db = context.env.ALIST_D1;

    if (!kv || !db) {
        return new Response(JSON.stringify({ code: 500, message: "ALIST_KV 或 ALIST_D1 未绑定" }), { status: 500 });
    }

    try {
        let totalFilesMigrated = 0;
        let totalDirsMigrated = 0;
        let batchStmts = [];
        const BATCH_SIZE = 30; // 适当调小每批大小，对 D1 更友好

        // 用于在内存中记录已经处理过的路径，防止重复写入触发数据库冲突导致额度翻倍
        const processedPaths = new Set();

        // --- 第一步：迁移所有标准文件 ---
        let fileCursor = "";
        do {
            const listResult = await kv.list({ prefix: "file:", cursor: fileCursor });
            fileCursor = listResult.cursor;

            for (const keyItem of listResult.keys) {
                const kvKey = keyItem.name;
                const decodedPath = kvKey.substring("file:".length);
                
                if (processedPaths.has(decodedPath)) continue;

                const lastSlashIndex = decodedPath.lastIndexOf("/");
                const parentPath = lastSlashIndex === 0 ? "/" : decodedPath.substring(0, lastSlashIndex);

                const fileMetaStr = await kv.get(kvKey);
                if (fileMetaStr) {
                    const fileMeta = JSON.parse(fileMetaStr);
                    
                    batchStmts.push(
                        db.prepare(`
                            INSERT OR IGNORE INTO vfs (id, path, parent_path, name, is_dir, size, type, oss_key, created, modified, thumb, sign)
                            VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?)
                        `).bind(
                            fileMeta.id || "file-" + Math.random().toString(36).substring(2, 10),
                            decodedPath,
                            parentPath,
                            fileMeta.name,
                            fileMeta.size || 0,
                            fileMeta.type || 0,
                            fileMeta.oss_key || decodedPath,
                            fileMeta.created || new Date().toISOString(),
                            fileMeta.modified || new Date().toISOString(),
                            fileMeta.thumb || "",
                            fileMeta.sign || ""
                        )
                    );
                    
                    processedPaths.add(decodedPath);
                    totalFilesMigrated++;
                }

                if (batchStmts.length >= BATCH_SIZE) {
                    await db.batch(batchStmts);
                    batchStmts = [];
                    await sleep(50); // 核心：每次写入让出 50ms 时间片，防止 D1 锁死排队
                }
            }
        } while (fileCursor);

        if (batchStmts.length > 0) {
            await db.batch(batchStmts);
            batchStmts = [];
            await sleep(50);
        }


        // --- 第二步：迁移所有虚拟文件夹 (内存严格去重版) ---
        let dirCursor = "";
        do {
            const listResult = await kv.list({ prefix: "dir:", cursor: dirCursor });
            dirCursor = listResult.cursor;

            for (const keyItem of listResult.keys) {
                const kvKey = keyItem.name;
                const parentPath = kvKey.substring("dir:".length);

                const dirDataStr = await kv.get(kvKey);
                if (dirDataStr) {
                    const dirList = JSON.parse(dirDataStr);
                    
                    for (const item of dirList) {
                        if (item.is_dir) {
                            const currentFullPath = parentPath === "/" ? `/${item.name}` : `${parentPath}/${item.name}`;

                            // 如果内存中已经记录过这个网盘路径，说明它已经被别的地方建立过了，直接跳过！
                            if (processedPaths.has(currentFullPath)) continue;

                            batchStmts.push(
                                db.prepare(`
                                    INSERT OR IGNORE INTO vfs (id, path, parent_path, name, is_dir, size, type, created, modified, thumb, sign)
                                    VALUES (?, ?, ?, ?, 1, 0, 1, ?, ?, '', '')
                                `).bind(
                                    item.id || "dir-" + Math.random().toString(36).substring(2, 10),
                                    currentFullPath,
                                    parentPath,
                                    item.name,
                                    item.created || new Date().toISOString(),
                                    item.modified || new Date().toISOString()
                                )
                            );

                            processedPaths.add(currentFullPath);
                            totalDirsMigrated++;
                        }
                    }
                }

                if (batchStmts.length >= BATCH_SIZE) {
                    await db.batch(batchStmts);
                    batchStmts = [];
                    await sleep(50); // 核心放缓
                }
            }
        } while (dirCursor);

        if (batchStmts.length > 0) {
            await db.batch(batchStmts);
        }

        return new Response(JSON.stringify({
            code: 200,
            message: "数据迁移成功！",
            data: {
                "已迁移文件数": totalFilesMigrated,
                "已迁移文件夹数": totalDirsMigrated
            }
        }), { status: 200, headers: { "Content-Type": "application/json;charset=utf-8" } });

    } catch (error) {
        return new Response(JSON.stringify({ code: 500, message: "错误: " + error.message }), { status: 500 });
    }
}