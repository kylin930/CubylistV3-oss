export async function onRequest(context) {
    // 保护机制：确保只有管理员可以触发迁移（可根据需要决定是否启用）
    const authHeader = context.request.headers.get("Authorization") || "";
    const expectedAdminToken = context.env.ADMIN_TOKEN || "secret-admin-token-cf-alist-v3";
    if (authHeader !== expectedAdminToken && authHeader !== `Bearer ${expectedAdminToken}`) {
        // 注：测试时如果嫌麻烦，可以先临时把下面这行注释掉
        // return new Response("Unauthorized", { status: 401 });
    }

    const kv = context.env.ALIST_KV;
    const db = context.env.ALIST_D1;

    if (!kv || !db) {
        return new Response(JSON.stringify({ code: 500, message: "ALIST_KV 或 ALIST_D1 未绑定" }), { status: 500 });
    }

    try {
        let totalFilesMigrated = 0;
        let totalDirsMigrated = 0;
        let batchStmts = [];
        const BATCH_SIZE = 50; // D1 batch 建议每批 50-100 条，防止单次事务过大

        // --- 第一步：迁移所有标准文件 (从 KV 的 file:* 键中提取) ---
        let fileCursor = "";
        do {
            // 列出所有以 file: 开头的键
            const listResult = await kv.list({ prefix: "file:", cursor: fileCursor });
            fileCursor = listResult.cursor;

            for (const keyItem of listResult.keys) {
                const kvKey = keyItem.name;
                // 提取出纯净的虚拟网盘路径
                const decodedPath = kvKey.substring("file:".length);
                
                // 从路径中拆解出父级路径和当前文件名
                const lastSlashIndex = decodedPath.lastIndexOf("/");
                const parentPath = lastSlashIndex === 0 ? "/" : decodedPath.substring(0, lastSlashIndex);

                // 读取 KV 中的文件元数据
                const fileMetaStr = await kv.get(kvKey);
                if (fileMetaStr) {
                    const fileMeta = JSON.parse(fileMetaStr);
                    
                    // 构造 D1 插入语句（使用 INSERT OR REPLACE 防止重复运行接口时报错）
                    batchStmts.push(
                        db.prepare(`
                            INSERT OR REPLACE INTO vfs (id, path, parent_path, name, is_dir, size, type, oss_key, created, modified, thumb, sign)
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
                    
                    totalFilesMigrated++;
                }

                // 达到分批大小，写入 D1
                if (batchStmts.length >= BATCH_SIZE) {
                    await db.batch(batchStmts);
                    batchStmts = [];
                }
            }
        } while (fileCursor);

        // 提交剩余的文件记录
        if (batchStmts.length > 0) {
            await db.batch(batchStmts);
            batchStmts = [];
        }


        // --- 第二步：迁移所有虚拟文件夹元数据 (从 KV 的 dir:* 键中提取) ---
        let dirCursor = "";
        do {
            // 列出所有以 dir: 开头的键
            const listResult = await kv.list({ prefix: "dir:", cursor: dirCursor });
            dirCursor = listResult.cursor;

            for (const keyItem of listResult.keys) {
                const kvKey = keyItem.name;
                const parentPath = kvKey.substring("dir:".length); // 这其实是当前目录的父级目录路径

                const dirDataStr = await kv.get(kvKey);
                if (dirDataStr) {
                    const dirList = JSON.parse(dirDataStr);
                    
                    // 遍历该目录下的子项，筛选出其中属于“虚拟文件夹(is_dir: true)”的节点
                    for (const item of dirList) {
                        if (item.is_dir) {
                            // 还原出这个子文件夹的完整路径
                            const currentFullPath = parentPath === "/" ? `/${item.name}` : `${parentPath}/${item.name}`;

                            batchStmts.push(
                                db.prepare(`
                                    INSERT OR REPLACE INTO vfs (id, path, parent_path, name, is_dir, size, type, created, modified, thumb, sign)
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

                            totalDirsMigrated++;
                        }
                    }
                }

                // 达到分批大小，写入 D1
                if (batchStmts.length >= BATCH_SIZE) {
                    await db.batch(batchStmts);
                    batchStmts = [];
                }
            }
        } while (dirCursor);

        // 提交剩余的文件夹记录
        if (batchStmts.length > 0) {
            await db.batch(batchStmts);
        }

        // --- 返回迁移成功的报告 ---
        return new Response(JSON.stringify({
            code: 200,
            message: "数据迁移成功！",
            data: {
                "已迁移文件数(Files)": totalFilesMigrated,
                "已迁移文件夹数(Directories)": totalDirsMigrated,
                "提示": "确认无误后，建议将此 migrate.js 文件从 functions 中删除，防止被他人重复调用。"
            }
        }), {
            status: 200,
            headers: { "Content-Type": "application/json;charset=utf-8", "Access-Control-Allow-Origin": "*" }
        });

    } catch (error) {
        return new Response(JSON.stringify({
            code: 500,
            message: "迁移中断，错误信息: " + error.message,
            data: null
        }), {
            status: 500,
            headers: { "Content-Type": "application/json;charset=utf-8" }
        });
    }
}